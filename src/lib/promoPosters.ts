/**
 * promoPosters — sumber data tunggal materi kampanye "Poster Promo PINDAI".
 *
 * Struktur mengikuti kebutuhan admin: setiap poster didefinisikan sebagai data
 * (bukan kode gambar), sehingga kelak panel admin bisa mengaktifkan/nonaktifkan
 * poster, mengubah urutan, headline, CTA, deskripsi, gambar, maupun kategori
 * tanpa menyentuh komposer. Gambar poster sendiri dirender dari data ini oleh
 * `lib/promoPosterGambar.ts` — satu desain, satu sumber.
 *
 * Aturan konten (kampanye resmi, bahasa Indonesia 100%):
 *  - Tidak ada klaim persetujuan/keamanan absolut ("pasti cair", "100% aman",
 *    "tanpa risiko", "tanpa biaya", dst.) — dijaga juga oleh uji otomatis.
 *  - Tidak ada angka biaya/bunga hard-coded; poster biaya memakai placeholder
 *    yang mengikuti konfigurasi sistem, dan tenor kredit diambil dari konstanta
 *    produk (`lib/kredit.ts`).
 *  - Istilah "Pendana" tidak pernah diganti menjadi "Investor".
 *
 * Tata letak gambar mengikuti `badge` sebagai tagline: poster bertipografi
 * (tanpa ikon clip-art), tagline tampil paling dulu dan paling besar di antara
 * konten poster — lihat `lib/promoPosterGambar.ts`.
 */
import { KREDIT_TENOR_PENGAJUAN_OPTIONS } from "./kredit";

export type KategoriPoster =
  | "Pinjaman"
  | "Gadai"
  | "Kredit"
  | "Informasi"
  | "Keamanan"
  | "Brand";

/** Opsi filter halaman — "Semua" selalu berada di urutan pertama. */
export const KATEGORI_POSTER = [
  "Semua",
  "Pinjaman",
  "Gadai",
  "Kredit",
  "Informasi",
  "Keamanan",
  "Brand",
] as const;

export type PromoPoster = {
  id: string;
  title: string;
  category: KategoriPoster;
  /**
   * Tagline poster — elemen paling menonjol pada gambar (fokus utama, digambar
   * tepat di bawah kop dengan ukuran yang menyesuaikan panjangnya). Dipakai
   * juga sebagai label ringkas pada kartu galeri.
   */
  badge: string;
  headline: string;
  description: string;
  features: string[];
  cta: string;
  /** URL gambar kustom (admin dapat mengganti); null = komposisi geometris. */
  image: string | null;
  enabled: boolean;
  order: number;
  /** Nomor kampanye yang tampil di pojok poster, mis. "01". */
  nomor: string;
  /** Nama file unduhan PNG — wajib unik. */
  file: string;
  /** Aksen warna poster (identitas tetap sama, rona berbeda per rumpun). */
  aksen: "emas" | "jingga" | "toska";
  /** Varian tata letak konten. */
  bentuk: "teks" | "langkah" | "baris" | "kartu" | "pertanyaan" | "hero";
  /** Daftar konten terstruktur (langkah, baris biaya, kartu FAQ/pilar, dst.). */
  items?: { judul?: string; teks: string }[];
  /** Pemisah antar baris untuk bentuk "baris" (mis. ["+", "="]). */
  pemisah?: string[];
  /** Catatan kecil di bawah konten (poster biaya). */
  catatan?: string;
  /** Baris tautan kebijakan (poster brand trust). */
  tautan?: string[];
  /** Label layanan pada poster hero. */
  layanan?: string[];
  /** CTA sekunder pada poster hero. */
  subCta?: string;
  disclaimer: string;
};

export const TAGLINE = "PINJAM • GADAI DIGITAL";
export const SHARE_TEKS = "Kenali PINDAI — Pinjam & Gadai Digital.";

/** Daftar 9 poster kampanye — urutan tampil mengikuti `order`. */
export const promoPosters: PromoPoster[] = [
  {
    id: "pinjaman",
    title: "Pinjaman — Dana Cepat",
    category: "Pinjaman",
    badge: "BUTUH DANA?",
    headline: "Dana Cepat,\nTanpa Ribet.",
    description:
      "Ajukan kebutuhan dana secara digital dengan informasi yang jelas.",
    features: ["Tenor fleksibel", "Pengajuan digital", "Informasi biaya transparan"],
    cta: "Ajukan Sekarang →",
    image: null,
    enabled: true,
    order: 1,
    nomor: "01",
    file: "pindai-pinjaman.png",
    aksen: "emas",
    bentuk: "teks",
    disclaimer: "Informasi umum — bukan penawaran. Syarat & ketentuan berlaku.",
  },
  {
    id: "gadai",
    title: "Gadai — Ubah Barang",
    category: "Gadai",
    badge: "PUNYA BARANG BERHARGA?",
    headline: "Ubah Barang\nJadi Dana.",
    description: "Ajukan gadai dengan proses taksiran yang transparan.",
    features: ["Taksiran transparan", "Barang tersimpan aman", "Proses terstruktur"],
    cta: "Taksir Barang →",
    image: null,
    enabled: true,
    order: 2,
    nomor: "02",
    file: "pindai-gadai.png",
    aksen: "jingga",
    bentuk: "teks",
    disclaimer: "Informasi umum — bukan penawaran. Syarat & ketentuan berlaku.",
  },
  {
    id: "kredit",
    title: "Kredit — Bawa Pulang",
    category: "Kredit",
    badge: "MAU BARANG YANG DIBUTUHKAN?",
    headline: "Bawa Pulang,\nCicil Tenang.",
    description:
      "Dapatkan barang yang Anda butuhkan dengan pilihan tenor yang tersedia.",
    features: [
      "DP sesuai ketentuan",
      // Angka tenor diambil dari konfigurasi produk, bukan ditulis di sini.
      `Tenor ${KREDIT_TENOR_PENGAJUAN_OPTIONS.join(" / ")} bulan`,
      "Pilihan barang",
    ],
    cta: "Mulai Cicil →",
    image: null,
    enabled: true,
    order: 3,
    nomor: "03",
    file: "pindai-kredit.png",
    aksen: "toska",
    bentuk: "teks",
    disclaimer: "Informasi umum — bukan penawaran. Syarat & ketentuan berlaku.",
  },
  {
    id: "cara-kerja",
    title: "Cara Kerja — Semua Digital",
    category: "Informasi",
    badge: "SEMUANYA DIGITAL",
    headline: "Ajukan.\nPeriksa.\nSelesaikan.",
    description: "Semua proses dapat dipantau melalui akun PINDAI.",
    features: [],
    cta: "Lihat Cara Kerja →",
    image: null,
    enabled: true,
    order: 4,
    nomor: "04",
    file: "pindai-cara-kerja.png",
    aksen: "emas",
    bentuk: "langkah",
    items: [
      { teks: "Daftar" },
      { teks: "Lengkapi Data" },
      { teks: "Ajukan" },
      { teks: "Pantau Status" },
    ],
    disclaimer: "Alur ilustratif — ketentuan teknis berlaku di aplikasi.",
  },
  {
    id: "biaya",
    title: "Biaya — Transparan",
    category: "Informasi",
    badge: "TRANSPARANSI DI DEPAN",
    headline: "Tahu Biayanya,\nSebelum Memutuskan.",
    description:
      "PINDAI menampilkan komponen biaya dan kewajiban secara jelas sebelum pengajuan diselesaikan.",
    features: [],
    cta: "Lihat Kalkulator →",
    image: null,
    enabled: true,
    order: 5,
    nomor: "05",
    file: "pindai-biaya.png",
    aksen: "emas",
    bentuk: "baris",
    // Placeholder — angka sebenarnya mengikuti konfigurasi sistem/kalkulator.
    items: [
      { judul: "POKOK", teks: "Rp …" },
      { judul: "BIAYA", teks: "Rp …" },
      { judul: "TOTAL KEWAJIBAN", teks: "Rp …" },
    ],
    pemisah: ["+", "="],
    catatan: "Periksa simulasi sebelum melanjutkan.",
    disclaimer: "Nilai mengikuti konfigurasi sistem. Periksa kalkulator PINDAI.",
  },
  {
    id: "keamanan",
    title: "Keamanan — Data Terjaga",
    category: "Keamanan",
    badge: "KEAMANAN DIGITAL",
    headline: "Data Anda,\nKami Jaga.",
    description:
      "PINDAI dirancang dengan kontrol keamanan dan proses verifikasi untuk membantu menjaga data pengguna.",
    features: [
      "Verifikasi identitas",
      "Perlindungan data",
      "Kontrol akses",
      "Riwayat aktivitas",
    ],
    cta: "Lihat Keamanan →",
    image: null,
    enabled: true,
    order: 6,
    nomor: "06",
    file: "pindai-keamanan.png",
    aksen: "toska",
    bentuk: "kartu",
    disclaimer: "Kontrol keamanan membantu, namun tidak menghapus seluruh risiko digital.",
  },
  {
    id: "faq",
    title: "FAQ — Pertanyaan & Jawaban",
    category: "Informasi",
    badge: "MASIH BINGUNG?",
    headline: "Pertanyaan Anda,\nJawabannya Ada.",
    description: "",
    features: [],
    cta: "Lihat FAQ →",
    image: null,
    enabled: true,
    order: 7,
    nomor: "07",
    file: "pindai-faq.png",
    aksen: "jingga",
    bentuk: "pertanyaan",
    items: [
      { teks: "Berapa lama tenornya?" },
      { teks: "Bagaimana biaya dihitung?" },
      { teks: "Bagaimana proses pengajuan?" },
      { teks: "Bagaimana cara melihat status?" },
    ],
    disclaimer: "Jawaban ringkas — ketentuan lengkap tersedia di aplikasi.",
  },
  {
    id: "trust",
    title: "Brand — Kenali PINDAI",
    category: "Brand",
    badge: "KENALI PINDAI",
    headline: "Transparan.\nDigital.\nTerukur.",
    description:
      "PINDAI menghadirkan pengalaman pinjam, gadai, dan kredit dalam satu platform digital.",
    features: [],
    cta: "Kenali PINDAI →",
    image: null,
    enabled: true,
    order: 8,
    nomor: "08",
    file: "pindai-trust.png",
    aksen: "emas",
    bentuk: "kartu",
    items: [
      { teks: "TRANSPARANSI" },
      { teks: "KEAMANAN" },
      { teks: "VERIFIKASI" },
      { teks: "INFORMASI JELAS" },
    ],
    tautan: ["Privasi", "Ketentuan", "Keamanan", "Kontak"],
    disclaimer: "Materi brand — bukan klaim sertifikasi atau legalitas.",
  },
  {
    id: "cta",
    title: "CTA — PINDAI Dulu",
    category: "Brand",
    badge: "PINDAI",
    headline: "Saat Butuh,\nPINDAI Dulu.",
    description: "Pinjaman, gadai, dan kredit\ndalam satu platform digital.",
    features: [],
    cta: "Mulai Sekarang →",
    subCta: "Pelajari PINDAI",
    image: null,
    enabled: true,
    order: 9,
    nomor: "09",
    file: "pindai-cta.png",
    aksen: "emas",
    bentuk: "hero",
    layanan: ["PINJAMAN", "GADAI", "KREDIT"],
    disclaimer: "Informasi umum — bukan penawaran. Syarat & ketentuan berlaku.",
  },
];

/** Poster aktif, terurut sesuai `order` — yang tampil di halaman. */
export function promoPostersAktif(daftar: readonly PromoPoster[] = promoPosters): PromoPoster[] {
  return [...daftar]
    .filter((p) => p.enabled)
    .sort((a, b) => a.order - b.order);
}

/** URL berbagi untuk satu poster (dipakai Salin Tautan & share fallback). */
export function tautanPoster(id: string, dasar?: string): string {
  const origin =
    dasar ?? (typeof window === "undefined" ? "" : window.location.origin + window.location.pathname);
  return `${origin}?poster=${encodeURIComponent(id)}`;
}

/** Kategori yang benar-benar dipakai poster aktif — untuk render chip filter. */
export function kategoriTerpakai(
  daftar: readonly PromoPoster[] = promoPosters,
): KategoriPoster[] {
  const hasil: KategoriPoster[] = [];
  for (const p of promoPostersAktif(daftar)) {
    if (!hasil.includes(p.category)) hasil.push(p.category);
  }
  return hasil;
}
