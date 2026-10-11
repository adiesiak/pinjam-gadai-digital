/**
 * Register metrik BI + matematika periode — MURNI (tanpa React/Convex/DOM).
 *
 * Berkas ini adalah sisi KODE dari `docs/bi-metrik-definisi.md`. Dokumen itu
 * sudah lebih dulu menetapkan definisi tiap metrik; yang belum ada adalah
 * daftarnya di dalam aplikasi. Akibatnya dashboard BI mudah "menemukan" metrik
 * yang sumbernya belum layak — angka seperti "dana terverifikasi" atau "uang
 * masuk manual" belum punya definisi yang aman di schema.
 *
 * Aturan yang dipegang di sini:
 *  - `METRIK_BI` adalah SATU-SATUNYA daftar metrik. Metrik yang belum siap
 *    tetap terdaftar dengan `kesiapan: "tunda"` dan ALASANNYA, sehingga UI
 *    menampilkan "belum tersedia — <alasan>", bukan angka 0 yang seolah terukur.
 *  - Periode dihitung dalam WIB (UTC+7), bukan zona perangkat: laporan harian
 *    yang bergeser karena pengguna di zona waktu lain bukan laporan.
 *  - Tidak ada metrik yang boleh dijumlah dari dua definisi (lihat catatan
 *    double-count pada dokumen).
 */

/** Periode laporan yang didukung. */
export const PERIODE_BI = ["harian", "bulanan", "kumulatif"] as const;
export type PeriodeBi = (typeof PERIODE_BI)[number];

export const LABEL_PERIODE_BI: Record<PeriodeBi, string> = {
  harian: "Hari ini (WIB)",
  bulanan: "Bulan berjalan (WIB)",
  kumulatif: "Seluruh catatan",
};

export type RentangPeriode = {
  periode: PeriodeBi;
  /** Awal rentang (epoch ms) — inklusif. 0 untuk kumulatif. */
  mulai: number;
  /** Akhir rentang (epoch ms) — eksklusif. */
  selesai: number;
  label: string;
};

/** Offset WIB terhadap UTC dalam milidetik (UTC+7, tanpa DST). */
const OFFSET_WIB_MS = 7 * 60 * 60 * 1000;

/**
 * Rentang waktu satu periode menurut kalender WIB.
 *
 * `sekarang` disuntikkan pemanggil supaya hasilnya bisa diuji tanpa jam mesin,
 * dan supaya laporan yang dirender bersama-sama memakai satu acuan waktu.
 */
export function rentangPeriode(periode: PeriodeBi, sekarang: number): RentangPeriode {
  if (periode === "kumulatif") {
    return {
      periode,
      mulai: 0,
      selesai: sekarang,
      label: LABEL_PERIODE_BI.kumulatif,
    };
  }
  const wib = sekarang + OFFSET_WIB_MS;
  const hariIni = new Date(wib);
  const awalHariWib = Date.UTC(
    hariIni.getUTCFullYear(),
    hariIni.getUTCMonth(),
    hariIni.getUTCDate(),
  );
  const awalHari = awalHariWib - OFFSET_WIB_MS;
  if (periode === "harian") {
    return {
      periode,
      mulai: awalHari,
      selesai: sekarang,
      label: LABEL_PERIODE_BI.harian,
    };
  }
  const awalBulan = Date.UTC(hariIni.getUTCFullYear(), hariIni.getUTCMonth(), 1) - OFFSET_WIB_MS;
  return {
    periode,
    mulai: awalBulan,
    selesai: sekarang,
    label: LABEL_PERIODE_BI.bulanan,
  };
}

/** Apakah satu waktu (epoch ms) jatuh di dalam rentang? `undefined` = tidak. */
export function dalamRentang(waktu: number | undefined, rentang: RentangPeriode): boolean {
  if (waktu === undefined) return false;
  return waktu >= rentang.mulai && waktu < rentang.selesai;
}

/** Tingkat kesiapan sebuah metrik menurut dokumen definisi. */
export type KesiapanMetrik = "siap" | "tunda";

export type DefinisiMetrik = {
  kode: string;
  label: string;
  /** Tabel sumber utama (harus benar-benar ada di schema). */
  sumber: string;
  kesiapan: KesiapanMetrik;
  /** Alasan tunda / catatan definisi — ditampilkan apa adanya ke admin. */
  catatan: string;
};

/**
 * Register metrik — salinan setia tabel di `docs/bi-metrik-definisi.md` §3.
 * Menambah metrik baru berarti menambah baris di sini DAN di dokumen; tidak ada
 * cara lain, sehingga daftar di layar tidak bisa "menemukan" metrik baru.
 */
export const METRIK_BI: readonly DefinisiMetrik[] = [
  {
    kode: "BI-L1",
    label: "Pengajuan pinjaman baru",
    sumber: "loans",
    kesiapan: "siap",
    catatan: "Menghitung seluruh pengajuan masuk pada periode, tanpa filter status.",
  },
  {
    kode: "BI-L2",
    label: "Pengajuan masuk tahap tinjauan",
    sumber: "loans",
    kesiapan: "siap",
    catatan: "Memakai diTahapTinjauan() dari lib/statusPinjaman, bukan ejaan status mentah.",
  },
  {
    kode: "BI-L3",
    label: "Pinjaman disalurkan",
    sumber: "loans",
    kesiapan: "siap",
    catatan: "Status kanonik didanai; waktu dari didanaiPada.",
  },
  {
    kode: "BI-L4",
    label: "Pokok pinjaman disalurkan",
    sumber: "loans",
    kesiapan: "siap",
    catatan: "Pokok yang DISALURKAN (pokokPinjaman), bukan pokok yang diajukan.",
  },
  {
    kode: "BI-P1",
    label: "Pengajuan gadai baru",
    sumber: "pawns",
    kesiapan: "siap",
    catatan: "Seluruh pengajuan gadai pada periode.",
  },
  {
    kode: "BI-P2",
    label: "Gadai aktif (snapshot)",
    sumber: "pawns",
    kesiapan: "siap",
    catatan: "Status aktif dan menunggu pelepasan — keadaan saat ini, bukan periode.",
  },
  {
    kode: "BI-K1",
    label: "Pengajuan kredit barang baru",
    sumber: "kreditBarang",
    kesiapan: "siap",
    catatan: "Seluruh pengajuan kredit barang pada periode.",
  },
  {
    kode: "BI-K2",
    label: "Kredit barang berjalan",
    sumber: "kreditBarang",
    kesiapan: "siap",
    catatan: "Disetujui/didanai pada periode; belum sama dengan dana tersalurkan.",
  },
  {
    kode: "BI-K3",
    label: "Pokok kredit barang tersalurkan",
    sumber: "kreditBarang + kreditFundings",
    kesiapan: "tunda",
    catatan: "Perlu audit alokasi dana kredit barang lebih dulu (lihat dokumen §4.3).",
  },
  {
    kode: "BI-D1",
    label: "Uang masuk tercatat",
    sumber: "deposits / manualPaymentReceipts",
    kesiapan: "tunda",
    catatan: "Belum pasti tabel resmi yang tepat untuk \"uang masuk\".",
  },
  {
    kode: "BI-R1",
    label: "Pelunasan / cicilan terbayar",
    sumber: "sistem pembayaran produk",
    kesiapan: "tunda",
    catatan: "Harus memisahkan tercatat, terverifikasi, dan benar-benar terbayar.",
  },
  {
    kode: "BI-F1",
    label: "Dana terverifikasi tersalurkan",
    sumber: "fundings / transferPendana / ledger",
    kesiapan: "tunda",
    catatan: "Definisi \"terverifikasi\" belum ditetapkan; jangan disamakan dengan alokasi.",
  },
  {
    kode: "BI-C1",
    label: "Nasabah terverifikasi (KYC)",
    sumber: "kycProfil",
    kesiapan: "siap",
    catatan: "Status VERIFIED pada master KYC (snapshot).",
  },
  {
    kode: "BI-C2",
    label: "KYC dalam proses",
    sumber: "kycProfil",
    kesiapan: "siap",
    catatan: "IN_PROGRESS/PENDING_REVIEW/NEEDS_CORRECTION (snapshot).",
  },
  {
    kode: "BI-A1",
    label: "Kasus penagihan terbuka",
    sumber: "penagihanKasus",
    kesiapan: "siap",
    catatan: "Kasus yang belum selesai/ditutup; catatan operasional, bukan pembayaran.",
  },
  {
    kode: "BI-A2",
    label: "Janji pembayaran",
    sumber: "penagihanJanji",
    kesiapan: "tunda",
    catatan: "Opsional; hanya jika bisnis meminta ringkasan janji.",
  },
  {
    kode: "BI-M1",
    label: "Penyedia dana aktif",
    sumber: "users / fundings",
    kesiapan: "tunda",
    catatan: "Peran tidak sama dengan \"aktif\" — perlu definisi keaktifan lebih dulu.",
  },
] as const;

/** Kode metrik yang boleh dihitung sekarang. */
export const KODE_METRIK_SIAP: readonly string[] = METRIK_BI.filter(
  (m) => m.kesiapan === "siap",
).map((m) => m.kode);

/** Metrik yang sengaja ditunda beserta alasannya. */
export const METRIK_TUNDA: readonly DefinisiMetrik[] = METRIK_BI.filter(
  (m) => m.kesiapan === "tunda",
);

/** Definisi satu metrik berdasarkan kode — null bila kode tidak terdaftar. */
export function definisiMetrik(kode: string): DefinisiMetrik | null {
  return METRIK_BI.find((m) => m.kode === kode) ?? null;
}

/** Label tampil sebuah kode metrik; kode tak dikenal dikembalikan apa adanya. */
export function labelMetrik(kode: string): string {
  return definisiMetrik(kode)?.label ?? kode;
}
