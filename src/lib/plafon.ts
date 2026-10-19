/**
 * Plafon pinjaman tunai per nasabah.
 *
 * Plafon dasar mengikuti konfigurasi global (default Rp1 juta). Setiap
 * pinjaman tunai pokok minimal Rp1 juta yang dilunasi penuh paling lambat pada
 * tanggal jatuh tempo menaikkan plafon dasar Rp1 juta, hingga maksimum Rp10
 * juta. Penanda warisan di users tidak menjadi bukti kelayakan. Override
 * pribadi admin tetap menang atas plafon turunan ini.
 */
import { formatRupiah, type Rupiah } from "./money";
import { LOAN_LIMITS } from "./loan";
import type { QueryCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";

const DAY_MS = 86_400_000;

export type RiwayatPinjamanPlafon = {
  status: string;
  pokokPinjaman: number;
  didanaiPada?: number;
  lunasPada?: number;
  tenorHari?: number;
  tenorBulan?: number;
  /**
   * Ada angsuran yang dibayar melewati jatuh tempo. Pinjaman yang lunas di
   * akhir tenor tetapi pernah telat TIDAK menaikkan plafon — penanda ini
   * ditulis saat pelunasan angsuran terakhir.
   */
  terlambatAngsuran?: boolean;
};

/** Plafon efektif Peminjam — override admin menang atas hasil perilaku. */
export async function plafonPeminjam(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Rupiah> {
  const [user, cfg, loans] = await Promise.all([
    ctx.db.get(userId),
    getConfigServer(ctx),
    ctx.db.query("loans").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
  ]);
  return plafonEfektifDariPerilaku(
    user?.plafonPinjaman,
    cfg,
    perilakuDariRiwayat(loans, Date.now()),
  );
}

/**
 * Ringkasan perilaku bayar dari riwayat pinjaman tunai.
 *
 * Hanya pinjaman yang SUDAH CAIR yang menilai perilaku: pengajuan yang ditolak
 * atau belum berjalan bukan bukti pembayaran. Pinjaman aktif yang melewati
 * jatuh tempo dihitung menunggak; pinjaman lunas setelah jatuh tempo dihitung
 * terlambat.
 */
export type PerilakuBayar = {
  tepatWaktu: number;
  terlambat: number;
  menunggak: number;
  berjalan: number;
};

export function perilakuDariRiwayat(
  loans: readonly RiwayatPinjamanPlafon[],
  sekarang: number,
): PerilakuBayar {
  let tepatWaktu = 0;
  let terlambat = 0;
  let menunggak = 0;
  let berjalan = 0;
  for (const loan of loans) {
    if (loan.status === "lunas") {
      // Tanpa tanggal jatuh tempo yang sah, keterlambatan tidak bisa dibuktikan.
      // Pelunasan seperti itu tidak dihitung tepat waktu MAUPUN terlambat —
      // bukan menghukum nasabah karena data lama tidak lengkap.
      if (tanggalJatuhTempoPinjaman(loan) === null) continue;
      if (apakahPelunasanTepatWaktu(loan)) tepatWaktu += 1;
      else terlambat += 1;
      continue;
    }
    if (loan.status !== "didanai") continue;
    berjalan += 1;
    const jatuhTempo = tanggalJatuhTempoPinjaman(loan);
    if (jatuhTempo !== null && sekarang > jatuhTempo) menunggak += 1;
  }
  return { tepatWaktu, terlambat, menunggak, berjalan };
}

/** Skor perilaku 0–100 — ditampilkan, bukan pengganti keputusan kredit. */
export function skorPerilaku(p: PerilakuBayar): number {
  let skor = 55;
  skor += Math.min(45, p.tepatWaktu * 15);
  skor -= Math.min(45, p.terlambat * 15);
  skor -= Math.min(50, p.menunggak * 25);
  return Math.min(100, Math.max(0, Math.round(skor)));
}

/**
 * Plafon dari perilaku bayar — MENGGANTIKAN hitungan "per pelunasan" di
 * `plafonDasarDariRiwayat` untuk plafon efektif.
 *
 * Aturan (sengaja konservatif, tanpa menurunkan plafon di bawah default):
 *  - tunggakan aktif menahan semua kenaikan; plafon kembali ke default global;
 *  - setiap pelunasan tepat waktu memberi Rp1 juta (aturan lama tetap);
 *  - catatan bersih (tanpa terlambat) memberi bonus: 2 pelunasan +Rp1 juta,
 *    3 pelunasan atau lebih +Rp2 juta;
 *  - maksimum tetap `PLAFON_NAIK_SETELAH_LUNAS`; override admin tetap menang.
 *
 * Bonus hanya berlaku bila semua pelunasan tercatat tepat waktu — keterlambatan
 * tidak menghapus kenaikan pokok, tetapi tidak pernah mendapat bonus.
 */
export function plafonDariPerilaku(
  globalDefault: number,
  p: PerilakuBayar,
): Rupiah {
  const dasar = clampPlafon(globalDefault);
  if (p.menunggak > 0) return dasar;
  const kenaikanPokok = p.tepatWaktu * PLAFON_KENAIKAN_PER_PELUNASAN;
  const bonusBersih =
    p.terlambat === 0 && p.tepatWaktu >= 3
      ? 2_000_000
      : p.terlambat === 0 && p.tepatWaktu >= 2
        ? 1_000_000
        : 0;
  return Math.min(
    PLAFON_NAIK_SETELAH_LUNAS,
    dasar + kenaikanPokok + bonusBersih,
  ) as Rupiah;
}

/** Plafon efektif: override admin, lalu perilaku bayar, lalu default global. */
export function plafonEfektifDariPerilaku(
  override: number | null | undefined,
  globalDefault: number,
  perilaku: PerilakuBayar,
): Rupiah {
  return clampPlafon(override ?? plafonDariPerilaku(globalDefault, perilaku));
}

/** Baca default global dari systemConfig tanpa menarik dependensi convex/system. */
async function getConfigServer(ctx: QueryCtx): Promise<number> {
  const row = await ctx.db
    .query("systemConfig")
    .withIndex("by_slot", (q) => q.eq("slot", "global"))
    .first();
  return row?.plafonPinjaman ?? PLAFON_DEFAULT;
}

/** Plafon awal pinjaman tunai — sama dengan batas skema tunai harian. */
export const PLAFON_DEFAULT = LOAN_LIMITS.maxPokok as Rupiah;

/** Pokok minimum dan nilai kenaikan untuk setiap pelunasan yang memenuhi syarat. */
export const PLAFON_POKOK_MINIMUM_LUNAS = 1_000_000 as Rupiah;
export const PLAFON_KENAIKAN_PER_PELUNASAN = 1_000_000 as Rupiah;

/** Plafon maksimum turunan maupun override admin. */
export const PLAFON_NAIK_SETELAH_LUNAS = 10_000_000 as Rupiah;

/** Rentang plafon tunai yang boleh disimpan admin (rupiah bulat). */
export const PLAFON_BATAS = {
  min: 100_000,
  maks: PLAFON_NAIK_SETELAH_LUNAS,
} as const;

/** Langkah slider kelipatan (rupiah). */
export const PLAFON_LANGKAH = 100_000;

/** Hitung tanggal jatuh tempo berdasarkan tenor tersimpan; null untuk data tidak valid. */
export function tanggalJatuhTempoPinjaman(
  loan: Pick<RiwayatPinjamanPlafon, "didanaiPada" | "tenorHari" | "tenorBulan">,
): number | null {
  if (!Number.isSafeInteger(loan.didanaiPada) || (loan.didanaiPada ?? 0) <= 0) return null;
  const tenorHari = loan.tenorBulan !== undefined
    ? loan.tenorBulan * 30
    : loan.tenorHari ?? 30;
  if (!Number.isSafeInteger(tenorHari) || tenorHari <= 0) return null;
  return loan.didanaiPada! + tenorHari * DAY_MS;
}

/** Bukti kelayakan kenaikan: pokok tunai ≥Rp1 juta, lunas, dan waktu pelunasan tidak melewati jatuh tempo. */
export function apakahPelunasanTepatWaktu(loan: RiwayatPinjamanPlafon): boolean {
  if (
    loan.status !== "lunas" ||
    loan.terlambatAngsuran === true ||
    !Number.isSafeInteger(loan.pokokPinjaman) ||
    loan.pokokPinjaman < PLAFON_POKOK_MINIMUM_LUNAS ||
    !Number.isSafeInteger(loan.lunasPada)
  ) {
    return false;
  }
  const jatuhTempo = tanggalJatuhTempoPinjaman(loan);
  return jatuhTempo !== null && (loan.lunasPada ?? Infinity) <= jatuhTempo;
}

/** Plafon dasar = global + Rp1 jt per pelunasan tepat waktu, dibatasi maksimum. */
export function plafonDasarDariRiwayat(
  globalDefault: number,
  jumlahPelunasanTepatWaktu: number,
): Rupiah {
  const jumlah = Number.isSafeInteger(jumlahPelunasanTepatWaktu)
    ? Math.max(0, jumlahPelunasanTepatWaktu)
    : 0;
  const dasar = clampPlafon(globalDefault);
  return Math.min(
    PLAFON_NAIK_SETELAH_LUNAS,
    dasar + jumlah * PLAFON_KENAIKAN_PER_PELUNASAN,
  ) as Rupiah;
}

/** Plafon efektif: override admin, lalu plafon progresif hasil riwayat, lalu default global. */
export function plafonEfektif(
  override: number | null | undefined,
  globalDefault: number,
  jumlahPelunasanTepatWaktu = 0,
): Rupiah {
  return clampPlafon(
    override ?? plafonDasarDariRiwayat(globalDefault, jumlahPelunasanTepatWaktu),
  );
}

/** Jepit nilai ke rentang yang sah — dipakai UI, server, dan penyimpanan. */
export function clampPlafon(nilai: number): Rupiah {
  if (!Number.isFinite(nilai)) return PLAFON_DEFAULT;
  return Math.min(PLAFON_BATAS.maks, Math.max(PLAFON_BATAS.min, Math.round(nilai))) as Rupiah;
}

/**
 * Status pinjaman yang MENAHAN plafon (aktif/terutang).
 *
 * Hanya pinjaman yang benar-benar cair (`didanai`) yang mengurangi plafon
 * tersedia: pengajuan yang masih `diajukan`/`disetujui`/`ditolak` belum menjadi
 * utang. `lunas` melepas kembali plafon yang tadinya terpakai. Ini satu-satunya
 * tempat aturannya ditulis supaya UI dan validasi server tidak bisa berbeda.
 */
export const STATUS_MENAHAN_PLAFON: readonly string[] = ["didanai"];

/** Ringkasan plafon MASTER satu nasabah — maksimal/terpakai/tersedia. */
export type RingkasanPlafon = {
  /** Plafon maksimal efektif (override admin atau progresif), rupiah bulat. */
  maksimal: Rupiah;
  /** Jumlah pokok pinjaman aktif/terutang yang menahan plafon. */
  terpakai: Rupiah;
  /** Sisa yang masih boleh diajukan (maksimal − terpakai, tidak pernah negatif). */
  tersedia: Rupiah;
  /** Jumlah pinjaman yang masih menahan plafon. */
  jumlahAktif: number;
};

/**
 * Hitung ringkasan plafon dari master maksimal + riwayat pinjaman nasabah.
 * PURE: tidak membaca database — pemanggil (server) yang menyediakan datanya,
 * sehingga angka yang dilihat UI berasal dari perhitungan backend yang sama
 * dengan yang dipakai validasi pengajuan.
 */
export function ringkasPlafon(
  maksimal: number,
  pinjaman: readonly { status: string; pokokPinjaman: number }[],
): RingkasanPlafon {
  const maks = clampPlafon(maksimal);
  let terpakai = 0;
  let jumlahAktif = 0;
  for (const p of pinjaman) {
    if (!STATUS_MENAHAN_PLAFON.includes(p.status)) continue;
    if (!Number.isSafeInteger(p.pokokPinjaman) || p.pokokPinjaman <= 0) continue;
    terpakai += p.pokokPinjaman;
    jumlahAktif += 1;
  }
  return {
    maksimal: maks,
    terpakai,
    tersedia: Math.max(0, maks - terpakai) as Rupiah,
    jumlahAktif,
  };
}

/**
 * Batas atas pengajuan yang boleh DITAWARKAN ke nasabah.
 *
 * Selalu dari plafon TERSEDIA (plafon master − pokok pinjaman berjalan), bukan
 * plafon maksimal: angka terbesar yang tampil di layar harus sama dengan angka
 * terbesar yang lolos `pokokDalamPlafon` di `loans.createLoanApplication`.
 * Batas produk (mis. Rp1 juta untuk skema harian) hanya memotong sisi atasnya.
 * Hasilnya boleh nol — artinya memang tidak ada sisa yang bisa diajukan, dan
 * pemanggil wajib menampilkan keadaan itu apa adanya, bukan penggeser kosong.
 */
export function batasDiajukan(tersedia: number, batasProduk: number): Rupiah {
  const sisa = Number.isFinite(tersedia) ? Math.max(0, Math.floor(tersedia)) : 0;
  const produk = Number.isFinite(batasProduk) ? Math.max(0, Math.floor(batasProduk)) : 0;
  return Math.min(sisa, produk) as Rupiah;
}

/**
 * Apakah pokok pinjaman tunai boleh diajukan di bawah plafon ini?
 * Tenor skema tetap divalidasi engine-nya masing-masing — fungsi ini hanya
 * memotong sisi atas (dan tetap menghormati minimum pokok tunai).
 * Dipakai dengan PLAFON TERSEDIA (bukan maksimal) agar pinjaman aktif benar
 * benar mengurangi jatah pengajuan berikutnya.
 */
export function pokokDalamPlafon(pokok: Rupiah, plafon: Rupiah): boolean {
  return (
    Number.isSafeInteger(pokok) &&
    pokok >= LOAN_LIMITS.minPokok &&
    pokok <= plafon
  );
}

/** Pesan penolakan tunai untuk pokok di atas plafon efektif (belum ada utang). */
export function pesanPlafonTerlampaui(plafon: Rupiah): string {
  return (
    `Batas pinjaman Anda saat ini ${formatRupiah(plafon)}. ` +
    "Kurangi jumlah pinjaman atau hubungi tim PINDAI jika ingin menanyakan perubahan batas."
  );
}

/**
 * Pesan penolakan saat plafon MAKSIMAL masih cukup, tetapi plafon TERSEDIA
 * sudah berkurang karena pinjaman aktif. Angkanya menyebut maksimal, terpakai,
 * dan tersedia supaya nasabah paham kenapa pengajuan ditolak.
 */
export function pesanPlafonTersediaTerlampaui(ringkas: RingkasanPlafon): string {
  return (
    `Plafon Anda ${formatRupiah(ringkas.maksimal)}, dan ${formatRupiah(ringkas.terpakai)} ` +
    `sedang dipakai pinjaman berjalan — sisa yang dapat diajukan ${formatRupiah(ringkas.tersedia)}` +
    (ringkas.jumlahAktif > 1 ? ` (${ringkas.jumlahAktif} pinjaman aktif). ` : " (1 pinjaman aktif). ") +
    "Lunasi pinjaman berjalan atau ajukan nominal yang lebih kecil."
  );
}

/**
 * Kalimat baku "batas mana yang berlaku" untuk seluruh layar nasabah.
 *
 * Maksimal dan terpakai hanya disebut saat ada pinjaman yang benar-benar
 * menahan plafon; tanpa itu satu angka saja yang perlu dibaca. Angkanya dari
 * ringkasan SERVER (`ringkasPlafon`) — sumber yang sama dengan validasi
 * pengajuan — sehingga kartu ringkasan, formulir, dan jalur cepat tidak
 * mungkin menyebut batas yang berbeda.
 */
export function kalimatBatasPlafon(ringkas: RingkasanPlafon): string {
  if (ringkas.jumlahAktif === 0) {
    return `Batas pinjaman Anda ${formatRupiah(ringkas.tersedia)}.`;
  }
  return (
    `Batas pinjaman Anda ${formatRupiah(ringkas.maksimal)}, dan ${formatRupiah(ringkas.terpakai)} ` +
    `sedang dipakai pinjaman berjalan — yang bisa diajukan sekarang ${formatRupiah(ringkas.tersedia)}.`
  );
}
