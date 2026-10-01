import { v } from "convex/values";
import { MutationCtx, QueryCtx } from "./_generated/server";

/** Prefix akun dompet dana pada ledger, mis. `dana:WALLET:<userId>`. */
export const PREFIX_AKUN_DANA = "dana:WALLET:";

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
  /** dompet dana ("dana:WALLET:<id>") | "pinjaman:<id>" | "platform:FEE" */
  akun: string;
  arah: "debit" | "kredit";
  jumlah: number;
}

export interface JournalSpec {
  jenis: "deposit" | "disbursement" | "platform_fee" | "repayment" | "payout" | "withdrawal";
  keterangan: string;
  aktor: string;
  lines: JournalLine[];
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
    .filter((q) => q.eq(q.field("akun"), akunDompetDana(danaId)))
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
