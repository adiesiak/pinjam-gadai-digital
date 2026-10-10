/**
 * PENYARING & RINGKASAN KONSOL KYC ADMIN — logika MURNI (tanpa React/Convex/DOM)
 * supaya bisa diuji sebagai skrip biasa: `bun src/lib/kycAdmin.test.ts`.
 *
 * Kenapa berkas ini ada: halaman pemeriksaan KYC perlu mencari satu nasabah di
 * antara banyak pengajuan dan menyaringnya menurut status, tanggal, serta HASIL
 * PEMERIKSAAN. Kalau aturan penyaringan itu ditulis ulang di query Convex dan
 * di komponen React, cepat atau lambat daftar yang dilihat petugas berbeda dari
 * yang dihitung server — dan beda daftar pada layar keputusan identitas adalah
 * masalah kepatuhan, bukan sekadar tampilan.
 *
 * Karena itu: SATU implementasi penyaringan dipakai server (`convex/kyc.ts`
 * memanggil fungsi di sini) dan dipakai uji ini. Komponen React hanya memakai
 * label & kalimat dari berkas ini — tidak menyaring ulang, supaya hasilnya tidak
 * pernah berbeda dari yang dikirim server.
 *
 * Pencocokan kata memakai `cocokCari` yang sudah dipakai penyaring pengajuan
 * (normalisasi huruf besar/kecil + spasi berlebih), jadi perilaku pencarian di
 * seluruh panel sama.
 */
import { KYC_STATUS, LABEL_STATUS_KYC, type StatusKyc } from "./kycStatus";
import { cocokCari } from "./saringanPengajuan";

/* ==========================================================================
 * Saringan "hasil pemeriksaan"
 * ========================================================================== */

/** Pilihan penyaringan menurut hasil pemeriksaan yang sudah tercatat. */
export const FILTER_HASIL_KYC = [
  "semua",
  /** Mesin keputusan otomatis menyimpulkan seluruh pemeriksaan lulus. */
  "otomatis_verifikasi",
  /** Mesin menemukan hal yang jelas gagal (nasabah bisa memperbaiki). */
  "otomatis_perlu_perbaikan",
  /** Mesin belum bisa memastikan apa pun — menunggu peninjauan petugas. */
  "otomatis_menunggu",
  /** Nomor WhatsApp belum dibuktikan lewat OTP. */
  "belum_otp",
  /** Isian atau berkas wajib masih kurang. */
  "isian_kurang",
  /** Putusan lama diambil dengan versi aturan yang sudah tidak berlaku. */
  "aturan_lama",
  /** Data identitas penting berubah setelah verifikasi. */
  "verifikasi_ulang",
  /** Ada berkas yang belum lolos pemeriksaan isi di server. */
  "dokumen_belum_diperiksa",
] as const;

export type FilterHasilKyc = (typeof FILTER_HASIL_KYC)[number];

/** Label siap tampil untuk setiap pilihan saringan hasil. */
export const LABEL_FILTER_HASIL_KYC: Record<FilterHasilKyc, string> = {
  semua: "Semua hasil pemeriksaan",
  otomatis_verifikasi: "Otomatis: semua lulus",
  otomatis_perlu_perbaikan: "Otomatis: perlu perbaikan",
  otomatis_menunggu: "Otomatis: belum bisa dipastikan",
  belum_otp: "WhatsApp belum terverifikasi",
  isian_kurang: "Isian/berkas kurang",
  aturan_lama: "Diperiksa dengan aturan lama",
  verifikasi_ulang: "Perlu verifikasi ulang",
  dokumen_belum_diperiksa: "Dokumen belum diperiksa server",
};

/**
 * Saringan status yang sah dari klien; nilai lain DIABAIKAN (bukan ditebak).
 * Hanya nilai yang cocok dengan daftar status kanonik yang lolos — jadi kiriman
 * klien tidak pernah bisa menyisipkan status baru atau memaksa perbandingan ke
 * teks sembarang. Beda huruf besar/kecil & spasi tetap dimaafkan.
 */
export function statusDariTeks(nilai: string | null | undefined): StatusKyc | null {
  if (nilai === null || nilai === undefined) return null;
  const bersih = nilai.trim().toUpperCase();
  return (KYC_STATUS as readonly string[]).includes(bersih) ? (bersih as StatusKyc) : null;
}

/** Saringan hasil yang sah dari klien; nilai lain jatuh ke `"semua"` (tanpa saringan). */
export function hasilDariTeks(nilai: string | null | undefined): FilterHasilKyc {
  if (nilai === null || nilai === undefined) return "semua";
  const bersih = nilai.trim().toLowerCase();
  return (FILTER_HASIL_KYC as readonly string[]).includes(bersih)
    ? (bersih as FilterHasilKyc)
    : "semua";
}

/* ==========================================================================
 * Rentang tanggal
 * ========================================================================== */

/** Tanggal tunggal `YYYY-MM-DD` → awal hari (00:00) di zona waktu server. */
function awalHari(teks: string): number | null {
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(teks.trim());
  if (cocok === null) return null;
  const tahun = Number(cocok[1]);
  const bulan = Number(cocok[2]);
  const hari = Number(cocok[3]);
  if (bulan < 1 || bulan > 12 || hari < 1 || hari > 31) return null;
  const ms = new Date(tahun, bulan - 1, hari).getTime();
  // Tanggal yang "meluber" (mis. 2026-02-31 jadi 3 Maret) ditolak, bukan
  // dibulatkan diam-diam: penyaring tanggal tidak boleh menampilkan hari lain.
  const balik = new Date(ms);
  if (balik.getFullYear() !== tahun || balik.getMonth() !== bulan - 1 || balik.getDate() !== hari) {
    return null;
  }
  return ms;
}

/**
 * Rentang `[dari, sampai]` dari dua tanggal `YYYY-MM-DD`.
 *
 * `sampai` bersifat INKLUSIF sampai akhir hari (23:59:59.999) — kalau tidak,
 * hari terakhir yang dipilih petugas tidak akan pernah ikut muncul.
 *
 * Rentang yang TERBALIK (`sampai` < `dari`) sengaja dibiarkan sebagai rentang
 * kosong (tidak ada baris yang cocok), bukan ditukar diam-diam: petugas harus
 * melihat bahwa pilihannya tidak mungkin, bukan daftar yang terlihat wajar.
 * Teks yang tidak berbentuk tanggal diabaikan (dianggap tidak diisi).
 */
export function rentangTanggal(
  dari: string | null | undefined,
  sampai: string | null | undefined,
): { dari: number | null; sampai: number | null } {
  const mulai = dari === null || dari === undefined || dari.trim() === "" ? null : awalHari(dari);
  const akhirTeks =
    sampai === null || sampai === undefined || sampai.trim() === "" ? null : awalHari(sampai);
  return {
    dari: mulai,
    sampai: akhirTeks === null ? null : akhirTeks + 24 * 60 * 60 * 1000 - 1,
  };
}

/** Apakah `waktu` berada di dalam rentang (batas `null` = tak terbatas). */
export function cocokTanggal(
  waktu: number,
  dari: number | null,
  sampai: number | null,
): boolean {
  if (dari !== null && waktu < dari) return false;
  if (sampai !== null && waktu > sampai) return false;
  return true;
}

/* ==========================================================================
 * Penyaringan
 * ========================================================================== */

/**
 * Bentuk ringkas satu baris KYC yang dibutuhkan penyaring.
 *
 * Semuanya FAKTA yang dihitung server dari data tersimpan (bukan kiriman
 * klien): `kekurangan` dari `kekuranganKyc`, `aturanUsang` dari versi aturan
 * putusan, `nomorWhatsAppTerbukti` dari bukti OTP yang masih cocok dengan nomor
 * tersimpan, dan `keputusanOtomatis` dari tabel keputusan mesin.
 */
export type BarisSaringKyc = {
  nama: string;
  email: string | null;
  /** Kode pseudonim nasabah — ditampilkan & dicari petugas. */
  kodePeminjam: string | null;
  status: StatusKyc;
  kekurangan: readonly string[];
  aturanUsang: boolean;
  nomorWhatsAppTerbukti: boolean;
  verifikasiUlangTertunda: boolean;
  /** Ada berkas tersimpan yang belum lolos pemeriksaan isi di server. */
  dokumenBelumDiperiksa: boolean;
  diajukanPada: number | null;
  diperbaruiPada: number;
  /**
   * Hasil keputusan otomatis TERAKHIR, atau `null` bila belum pernah diperiksa
   * mesin. Wajib diisi server saat saringan `otomatis_*` dipakai; `undefined`
   * diperlakukan seperti `null` (tidak ada keputusan), bukan dianggap cocok.
   *
   * `diterapkan`/`waktu` hanya dibutuhkan TAMPILAN (panel petugas menyebut
   * apakah hasil mesin sampai mengubah status), jadi keduanya opsional: penyaring
   * murni tidak memakainya, dan kalau tidak ada, panel tidak boleh menyimpulkan
   * "sudah diterapkan" — itu dibiarkan tak diketahui.
   */
  keputusanOtomatis?: { keputusan: StatusKyc; diterapkan?: boolean; waktu?: number } | null;
};

/** Saringan aktif satu daftar KYC. Semua bagian opsional. */
export type FilterKyc = {
  /** Kata kunci bebas: nama, email, atau kode nasabah. */
  cari: string;
  status: StatusKyc | null;
  hasil: FilterHasilKyc;
  /** Batas bawah rentang tanggal (ms), atau `null`. */
  dari: number | null;
  /** Batas atas rentang tanggal (ms, inklusif), atau `null`. */
  sampai: number | null;
};

/** Saringan kosong — dipakai tombol "Kosongkan filter" dan keadaan awal. */
export const FILTER_KYC_KOSONG: FilterKyc = {
  cari: "",
  status: null,
  hasil: "semua",
  dari: null,
  sampai: null,
};

/** Cocok dengan kata kunci (nama, email, atau kode nasabah). */
export function cocokKata(cari: string, baris: BarisSaringKyc): boolean {
  return cocokCari(cari, [baris.nama, baris.email, baris.kodePeminjam]);
}

/** Tanggal acuan satu baris: kapan diajukan, atau kapan terakhir diperbarui. */
export function tanggalAcuan(baris: BarisSaringKyc): number {
  return baris.diajukanPada ?? baris.diperbaruiPada;
}

/** Cocok dengan saringan hasil pemeriksaan yang dipilih. */
export function cocokHasil(baris: BarisSaringKyc, hasil: FilterHasilKyc): boolean {
  const mesin = baris.keputusanOtomatis ?? null;
  switch (hasil) {
    case "semua":
      return true;
    case "otomatis_verifikasi":
      return mesin?.keputusan === "VERIFIED";
    case "otomatis_perlu_perbaikan":
      return mesin?.keputusan === "NEEDS_CORRECTION";
    case "otomatis_menunggu":
      return mesin?.keputusan === "PENDING_REVIEW";
    case "belum_otp":
      return !baris.nomorWhatsAppTerbukti;
    case "isian_kurang":
      return baris.kekurangan.length > 0;
    case "aturan_lama":
      return baris.aturanUsang;
    case "verifikasi_ulang":
      return baris.verifikasiUlangTertunda;
    case "dokumen_belum_diperiksa":
      return baris.dokumenBelumDiperiksa;
  }
}

/** Semua bagian saringan KECUALI status — dasar cacah per status. */
export function cocokTanpaStatus(baris: BarisSaringKyc, filter: FilterKyc): boolean {
  if (!cocokKata(filter.cari, baris)) return false;
  if (!cocokTanggal(tanggalAcuan(baris), filter.dari, filter.sampai)) return false;
  return cocokHasil(baris, filter.hasil);
}

/** Saring daftar KYC lengkap (kata kunci + status + tanggal + hasil). */
export function saringKycAdmin<T extends BarisSaringKyc>(baris: T[], filter: FilterKyc): T[] {
  return baris.filter(
    (b) => cocokTanpaStatus(b, filter) && (filter.status === null || b.status === filter.status),
  );
}

/** Cacah baris per status — selalu memuat SELURUH status, termasuk yang nol. */
export function cacahPerStatus(baris: readonly BarisSaringKyc[]): Record<StatusKyc, number> {
  const cacah = Object.fromEntries(KYC_STATUS.map((s) => [s, 0])) as Record<StatusKyc, number>;
  for (const b of baris) cacah[b.status] += 1;
  return cacah;
}

/** Ada saringan aktif? Dipakai memutuskan pesan keadaan kosong. */
export function adaFilterKyc(filter: FilterKyc): boolean {
  return (
    filter.cari.trim() !== "" ||
    filter.status !== null ||
    filter.hasil !== "semua" ||
    filter.dari !== null ||
    filter.sampai !== null
  );
}

/** Kalimat ringkas saringan aktif untuk keadaan kosong ("tidak ada yang cocok"). */
export function ringkasFilterKyc(filter: FilterKyc): string[] {
  const bagian: string[] = [];
  if (filter.cari.trim() !== "") bagian.push(`kata kunci “${filter.cari.trim()}”`);
  if (filter.status !== null) bagian.push(`status ${LABEL_STATUS_KYC[filter.status]}`);
  if (filter.hasil !== "semua") bagian.push(LABEL_FILTER_HASIL_KYC[filter.hasil].toLowerCase());
  if (filter.dari !== null || filter.sampai !== null) {
    bagian.push(`tanggal ${labelTanggal(filter.dari)} – ${labelTanggal(filter.sampai)}`);
  }
  return bagian;
}

function labelTanggal(ms: number | null): string {
  if (ms === null) return "…";
  return new Date(ms).toLocaleDateString("id-ID", { dateStyle: "medium" });
}

/** Kalimat jumlah hasil — "Menampilkan 2 dari 13 pengajuan KYC". */
export function ringkasJumlahKyc(tampil: number, total: number): string {
  return `Menampilkan ${tampil} dari ${total} pengajuan KYC`;
}

/* ==========================================================================
 * Status dokumen & OCR
 * ========================================================================== */

/** Empat keadaan satu slot dokumen KYC menurut bukti yang tersimpan. */
export const STATUS_DOKUMEN_KYC = [
  "siap",
  "belum_diunggah",
  "belum_diperiksa",
  "perlu_diperiksa_ulang",
] as const;

export type StatusDokumenKyc = (typeof STATUS_DOKUMEN_KYC)[number];

export const LABEL_STATUS_DOKUMEN_KYC: Record<StatusDokumenKyc, string> = {
  siap: "Siap (isi berkas sudah diperiksa server)",
  belum_diunggah: "Belum diunggah",
  belum_diperiksa: "Belum diperiksa server",
  perlu_diperiksa_ulang: "Diperiksa dengan aturan lama — pertimbangkan ulang",
};

/* ==========================================================================
 * Keputusan petugas — label tindakan, judul, dan akibatnya
 * ==========================================================================
 *
 * Kalimat DI DIALOG KONFIRMASI ikut tinggal di sini karena ia adalah bagian dari
 * kebijakan, bukan hiasan: tiap keputusan menyebut status yang dituju dengan
 * label NASABAH (`LABEL_STATUS_KYC`) lalu apa yang terjadi sesudahnya. Dengan
 * begitu tidak ada dua layar yang menjelaskan akibat yang berbeda.
 */

/**
 * Label TINDAKAN (perintah) per keputusan — beda dari label status: ini apa yang
 * petugas lakukan, bukan hasil yang dibaca nasabah.
 */
export const LABEL_KEPUTUSAN_KYC: Record<string, string> = {
  VERIFIED: "Verifikasi",
  NEEDS_CORRECTION: "Minta perbaikan",
  REJECTED: "Tolak",
  REVERIFICATION_REQUIRED: "Tandai perlu verifikasi ulang",
};

/** Judul dialog konfirmasi: tindakan + nama nasabah yang akan terpengaruh. */
export function judulKonfirmasiKeputusan(keputusan: StatusKyc, nama: string): string {
  return `${LABEL_KEPUTUSAN_KYC[keputusan] ?? LABEL_STATUS_KYC[keputusan]} KYC ${nama}?`;
}

/**
 * AKIBAT satu keputusan bagi nasabah — satu kalimat, dipakai dialog konfirmasi.
 *
 * Verifikasi ditegaskan BUKAN persetujuan pinjaman: petugas tidak boleh mengira
 * "terverifikasi" berarti dana cair, karena keduanya diputus di modul berbeda.
 */
export function akibatKeputusanKyc(keputusan: StatusKyc): string {
  const akibat: Record<string, string> = {
    VERIFIED:
      "Ini berarti proses KYC berhasil — BUKAN persetujuan pinjaman, pendanaan, atau pencairan.",
    NEEDS_CORRECTION:
      "Catatan Anda dibaca nasabah, dan pengajuan hanya bisa dikirim ulang olehnya.",
    REJECTED: "Nasabah harus memperbarui datanya sebelum peninjauan ulang bisa dimulai.",
    REVERIFICATION_REQUIRED:
      "Putusan verifikasi sebelumnya tidak berlaku lagi sampai pengajuan diperiksa ulang dan dikirim ulang nasabah.",
  };
  return `Status nasabah menjadi ${LABEL_STATUS_KYC[keputusan]}. ${
    akibat[keputusan] ?? "Status akan diubah."
  }`;
}

/**
 * Keadaan satu slot dokumen.
 *
 * Urutannya penting: belum diunggah → belum diperiksa → aturan lama → siap.
 * "Sudah diperiksa" hanya boleh berarti penanda server ada (isi berkas terbukti
 * gambar), bukan sekadar berkasnya terunggah.
 */
export function statusDokumenKyc(meta: {
  diunggah: boolean;
  diperiksaServer: boolean;
  aturanUsang: boolean;
}): StatusDokumenKyc {
  if (!meta.diunggah) return "belum_diunggah";
  if (!meta.diperiksaServer) return "belum_diperiksa";
  if (meta.aturanUsang) return "perlu_diperiksa_ulang";
  return "siap";
}
