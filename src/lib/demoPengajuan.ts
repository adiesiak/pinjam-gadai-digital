/**
 * Isi demo alur pengajuan pinjaman di beranda — data murni tanpa React/DOM
 * supaya bisa dirender di uji statis.
 *
 * Aturan yang dijaga berkas ini:
 *  - Angka demo TIDAK ditulis tangan. `quoteDemo()` memanggil mesin harga dan
 *    matriks tenor harian dari `lib/loan`, sumber yang sama dengan kalkulator
 *    `/biaya` dan formulir pengajuan, jadi demo tidak pernah menampilkan
 *    rincian yang berbeda dari yang akan dilihat peminjam sungguhan.
 *  - Langkahnya mengikuti alur yang benar-benar ada di aplikasi: masuk lewat
 *    WhatsApp, verifikasi KYC, formulir pinjaman, peninjauan tim, lalu catatan
 *    di dashboard. Pencairan dana tetap di luar aplikasi dan disebut apa adanya.
 */
import {
  persenBungaHarian,
  PINDAI_PRICING,
  quoteLoanBunga,
  tarifBiayaAman,
  tenorHarianDefault,
  type LoanQuote,
  type TarifBiaya,
} from "./loan";

/** Nominal contoh pada demo — cukup kecil untuk terbaca, tetap dalam batas. */
export const DEMO_POKOK = 500_000;

/** Tenor contoh (hari) — tenor bawaan matriks untuk nominal demo. */
export const DEMO_TENOR_HARI = tenorHarianDefault(DEMO_POKOK);

/**
 * Lama satu layar tampil sebelum berganti sendiri. 5,2 detik: cukup untuk
 * membaca tiga baris rincian tanpa terasa lambat.
 */
export const DEMO_JEDA_MS = 5200;

export type IdLangkahDemo =
  | "akun"
  | "verifikasi"
  | "ajukan"
  | "tinjau"
  | "catatan";

export type LangkahDemo = {
  readonly id: IdLangkahDemo;
  /** Nomor tampil, sudah berurut "01"…"05". */
  readonly nomor: string;
  readonly judul: string;
  /** Satu kalimat yang juga dibacakan sebagai keterangan layar. */
  readonly ringkas: string;
};

export const LANGKAH_DEMO: readonly LangkahDemo[] = [
  {
    id: "akun",
    nomor: "01",
    judul: "Masuk dengan WhatsApp",
    ringkas:
      "Nomor WhatsApp menerima kode 6 angka. Tidak ada kata sandi yang perlu diingat.",
  },
  {
    id: "verifikasi",
    nomor: "02",
    judul: "Lengkapi verifikasi",
    ringkas:
      "Data identitas, foto KTP, selfie dengan KTP, dan nomor WhatsApp diperiksa sebelum pengajuan bisa dikirim.",
  },
  {
    id: "ajukan",
    nomor: "03",
    judul: "Isi nominal dan tenor",
    ringkas:
      "Pilih nominal, tenor 7–28 hari, dan tujuan pinjaman. Potongan serta total kewajiban muncul sebelum tombol kirim ditekan.",
  },
  {
    id: "tinjau",
    nomor: "04",
    judul: "Tunggu peninjauan",
    ringkas:
      "Pengajuan tercatat dengan nomor referensi. Statusnya ditinjau lebih dulu; pencairan dilakukan di luar aplikasi.",
  },
  {
    id: "catatan",
    nomor: "05",
    judul: "Pantau catatan",
    ringkas:
      "Jadwal, status, dan riwayat tersimpan di dashboard, termasuk setelah pinjaman lunas.",
  },
];

/**
 * Rincian contoh dari mesin pinjaman — bukan angka yang ditulis di berkas ini.
 * `tarif` berasal dari Pengaturan Parameter Bisnis supaya potongan pada demo
 * berubah bersama formulir pengajuan; kosong berarti tarif bawaan.
 */
export function quoteDemo(tarif?: Partial<TarifBiaya> | null): LoanQuote {
  return quoteLoanBunga(
    DEMO_POKOK,
    persenBungaHarian(DEMO_POKOK, DEMO_TENOR_HARI) ?? PINDAI_PRICING.bungaPercent,
    { tarif: tarifBiayaAman(tarif) },
  );
}
