import { v } from "convex/values";
import { MutationCtx, QueryCtx } from "./_generated/server";
import { porsiDanaProteksiRisiko } from "../lib/ekonomiPlatform";
import { formatRupiah } from "../lib/money";

/** Prefix akun dompet dana pada ledger, mis. `dana:WALLET:<userId>`. */
export const PREFIX_AKUN_DANA = "dana:WALLET:";

/**
 * Akun pendapatan margin platform dari selisih bunga nasabah dan hak pendana.
 *
 * Dipisah dari `platform:FEE` supaya biaya layanan tidak tercampur dengan
 * margin tenor. Nama akun sengaja huruf besar semua: ia akun internal, bukan
 * akun dompet pengguna.
 */
export const AKUN_PLATFORM_SPREAD = "PLATFORM_SPREAD_MARGIN";

/**
 * Akun penampung selisih pokok saat settlement. Bukan pendapatan platform:
 * ia hanya memisahkan pengembalian pokok yang sudah diterima lebih dulu dari
 * margin tenor, supaya `platform:FEE` tidak menyerap angka pokok.
 */
export const AKUN_PLATFORM_PRINCIPAL_CLEARING = "platform:PRINCIPAL_CLEARING";

/**
 * Pendapatan platform yang diterima LANGSUNG dari biaya di muka: biaya admin
 * dan biaya pencairan ekspres. Dipisah dari `platform:FEE` (denda & biaya
 * cicilan) agar laporan margin bisa membedakan keduanya.
 */
export const AKUN_PLATFORM_DIRECT_REVENUE = "PLATFORM_DIRECT_REVENUE";

/**
 * Dana proteksi risiko: 2,5% dari margin spread platform disisihkan ke akun
 * ini. Bukan dompet pengguna dan bukan biaya — hanya cadangan internal.
 */
export const AKUN_RISK_PROTECTION_POOL = "RISK_PROTECTION_POOL";

/** Nama akun ledger dompet dana untuk satu pengguna. */
export function akunDompetDana(id: string): string {
  return `${PREFIX_AKUN_DANA}${id}`;
}

/**
 * Mesin ledger double-entry (Rule 5.1).
 * - appendJournal: menulis entri berpasangan; total debit WAJIB = total kredit.
 * - append-only: tidak ada fungsi update/delete di file ini.
 * - Semua jumlah rupiah bulat.
 */

export interface JournalLine {
  /** dompet dana ("dana:WALLET:<id>") | "pinjaman:<id>" | akun platform */
  akun: string;
  arah: "debit" | "kredit";
  jumlah: number;
}

/**
 * Skema produk yang menghasilkan jurnal. Ditulis eksplisit supaya ringkasan
 * ledger tidak perlu menebak dari teks `keterangan` — tebakan teks itulah yang
 * dulu membuat angka per skema terlihat tidak cocok dengan pinjaman yang ada.
 */
export type SkemaLedger = "pinjaman" | "gadai" | "kredit" | "syariah";

export type EventTypeLedger =
  | "INTEREST_ONLY_PAYMENT"
  | "PARTIAL_PRINCIPAL_PAYMENT"
  | "LOAN_REPAYMENT";

export interface JournalSpec {
  jenis:
    | "deposit"
    | "disbursement"
    | "platform_fee"
    | "platform_spread"
    | "principal_adjustment"
    | "repayment"
    | "payout"
    | "withdrawal";
  keterangan: string;
  aktor: string;
  lines: JournalLine[];
  /** Skema produk asal jurnal; kosong hanya untuk jurnal lama/lain-lain. */
  skema?: SkemaLedger;
  /** Peristiwa bisnis eksplisit untuk jalur perpanjangan. */
  eventType?: EventTypeLedger;
}

function assertIntegerRupiah(n: number, label: string) {
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new Error(`${label} harus rupiah bulat positif.`);
  }
}

export function newGroupId(): string {
  return `J-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Catat margin platform dari satu settlement pinjaman.
 *
 * `margin` = bunga yang benar-benar menjadi pendapatan nasabah dikurangi hak
 * pendana (30% nominal pendanaan). Nilai positif menambah pendapatan platform;
 * nilai negatif berarti platform menutup kekurangan, jadi akun spread berada di
 * sisi debit. Akun lawannya adalah `pinjaman:<id>` — sama seperti jurnal
 * penyesuaian settlement lain — sehingga jurnal tetap seimbang tanpa menyentuh
 * dompet pendana.
 *
 * Nol tidak menulis jurnal: pinjaman berbunga tepat 30% memang tidak punya
 * margin spread, dan entri nol hanya akan mengotori audit.
 */
export async function catatMarginSpread(
  ctx: MutationCtx,
  args: {
    loanId: string;
    referensi: string;
    margin: number;
    bungaNasabah: number;
    hakPendana: number;
  },
): Promise<void> {
  if (args.margin === 0) return;
  const jumlah = Math.abs(args.margin);
  // Margin positif disisihkan sebagian ke dana proteksi risiko. Margin negatif
  // (platform menutup kekurangan) tidak boleh "mengisi" pool dari kerugian.
  const risiko = args.margin > 0 ? porsiDanaProteksiRisiko(args.margin) : 0;
  const marginBersih = jumlah - risiko;
  await appendJournal(ctx, {
    jenis: "platform_spread",
    skema: "pinjaman",
    keterangan:
      risiko > 0
        ? `Margin spread platform ${args.referensi}: bunga nasabah ${formatRupiah(
            args.bungaNasabah,
          )} - hak pendana ${formatRupiah(args.hakPendana)} = ${formatRupiah(
            args.margin,
          )}; ${formatRupiah(risiko)} ke dana proteksi risiko`
        : `Margin spread platform ${args.referensi}: bunga nasabah ${formatRupiah(
            args.bungaNasabah,
          )} - hak pendana ${formatRupiah(args.hakPendana)} = ${formatRupiah(args.margin)}`,
    aktor: "platform",
    lines:
      args.margin > 0
        ? [
            { akun: `pinjaman:${args.loanId}`, arah: "debit", jumlah },
            { akun: AKUN_PLATFORM_SPREAD, arah: "kredit", jumlah: marginBersih },
            ...(risiko > 0
              ? [
                  {
                    akun: AKUN_RISK_PROTECTION_POOL,
                    arah: "kredit" as const,
                    jumlah: risiko,
                  },
                ]
              : []),
          ]
        : [
            { akun: AKUN_PLATFORM_SPREAD, arah: "debit", jumlah },
            { akun: `pinjaman:${args.loanId}`, arah: "kredit", jumlah },
          ],
  });
}

/**
 * Tulis jurnal berpasangan append-only. Melempar error jika tidak seimbang —
 * seluruh mutation Convex akan di-rollback bila jurnal gagal.
 */
export async function appendJournal(
  ctx: MutationCtx,
  spec: JournalSpec,
): Promise<string> {
  const gid = newGroupId();
  if (spec.lines.length < 2) {
    throw new Error("Jurnal harus memuat minimal dua entri (debit & kredit).");
  }

  let totalDebit = 0;
  let totalKredit = 0;
  for (const l of spec.lines) {
    if (l.arah === "debit") totalDebit += l.jumlah;
    else totalKredit += l.jumlah;
  }
  if (totalDebit === 0 || totalKredit === 0) {
    throw new Error("Jurnal tidak valid: total debit atau kredit nol.");
  }
  if (totalDebit !== totalKredit) {
    throw new Error(
      `Jurnal tidak seimbang: debit ${totalDebit} != kredit ${totalKredit}.`,
    );
  }

  const now = Date.now();
  for (const line of spec.lines) {
    assertIntegerRupiah(line.jumlah, `Jumlah entri ${line.akun}`);
    await ctx.db.insert("ledger_entries", {
      groupId: gid,
      arah: line.arah,
      jumlah: line.jumlah,
      akun: line.akun,
      jenis: spec.jenis,
      keterangan: spec.keterangan,
      aktor: spec.aktor,
      waktu: now,
      skema: spec.skema,
      ...(spec.eventType === undefined ? {} : { eventType: spec.eventType }),
    });
  }
  return gid;
}

/** Saldo dompet penyedia dana = sum(debit) − sum(kredit) pada akun dompetnya. */
export async function danaWalletBalance(
  ctx: QueryCtx,
  danaId: string,
): Promise<number> {
  const entries = await ctx.db
    .query("ledger_entries")
    .withIndex("by_akun", (q) => q.eq("akun", akunDompetDana(danaId)))
    .collect();
  return entries.reduce(
    (acc, e) => acc + (e.arah === "debit" ? e.jumlah : -e.jumlah),
    0,
  );
}

/** Total sistem: harus selalu seimbang (debit == kredit) — Rule 5.1. */
export async function ledgerTotals(ctx: QueryCtx): Promise<{
  totalDebit: number;
  totalKredit: number;
  entryCount: number;
  seimbang: boolean;
}> {
  const entries = await ctx.db.query("ledger_entries").collect();
  let totalDebit = 0;
  let totalKredit = 0;
  for (const e of entries) {
    if (e.arah === "debit") totalDebit += e.jumlah;
    else totalKredit += e.jumlah;
  }
  return {
    totalDebit,
    totalKredit,
    entryCount: entries.length,
    seimbang: totalDebit === totalKredit,
  };
}

/** Validator argumen jumlah (dipakai file lain). */
export const rupiahArg = v.number();
