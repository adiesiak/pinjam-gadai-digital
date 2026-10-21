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
import { quoteLoan, tarifBiayaAman, type TarifBiaya } from "./loan";
import { formatRupiah } from "./money";
import { rincianPotonganDiMuka } from "./tarifBiayaTeks";

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
  /** Keterangan kecil yang dapat menyebutkan proses dilakukan di luar aplikasi. */
  caption?: string;
  /** Keterangan legalitas opsional, hanya tampil bila ada isinya. */
  legalitas?: string;
  /** Disclaimer wajib pada setiap poster. */
  disclaimer: string;
};

export const TAGLINE = "PINJAM • GADAI DIGITAL";
export const SHARE_TEKS = "Kenali PINDAI: Pinjam & Gadai Digital.";

/** Daftar 9 poster kampanye — urutan tampil mengikuti `order`. */
const contohPinjaman = quoteLoan(500_000);
const rincianBiaya = [
  { judul: "Pokok", teks: formatRupiah(contohPinjaman.pokok) },
  { judul: "Biaya admin", teks: formatRupiah(contohPinjaman.biayaAdmin) },
  { judul: "Total kewajiban", teks: formatRupiah(contohPinjaman.totalKewajibanPelunasan) },
];

export const promoPosters: PromoPoster[] = [
  {
    id: "pinjaman",
    title: "Pinjaman: Ajukan dan Pantau",
    category: "Pinjaman",
    badge: "PINJAMAN DIGITAL",
    headline: "Ajukan, Pantau Status",
    description: "Ajukan pinjaman secara online dan lihat status pengajuan di akun PINDAI.",
    features: ["Pengajuan tercatat di akun", "Status pengajuan dapat dilihat"],
    cta: "Pelajari Pengajuan",
    image: null,
    enabled: true,
    order: 1,
    nomor: "01",
    file: "pindai-pinjaman.png",
    aksen: "emas",
    bentuk: "teks",
    disclaimer: "Informasi umum, bukan penawaran. Syarat & ketentuan berlaku.",
  },
  {
    id: "gadai",
    title: "Gadai: Catat Pengajuan",
    category: "Gadai",
    badge: "PENGAJUAN GADAI",
    headline: "Catat Pengajuan Gadai",
    description: "Buat catatan pengajuan dan lihat statusnya melalui akun PINDAI.",
    features: ["Informasi barang tercatat", "Status pengajuan dapat dilihat"],
    cta: "Lihat Informasi Gadai",
    image: null,
    enabled: true,
    order: 2,
    nomor: "02",
    file: "pindai-gadai.png",
    aksen: "jingga",
    bentuk: "teks",
    disclaimer: "Informasi umum, bukan penawaran. Syarat & ketentuan berlaku.",
  },
  {
    id: "kredit",
    title: "Kredit: Cek Simulasi",
    category: "Kredit",
    badge: "SEBELUM MENGAJUKAN",
    headline: "Cek Simulasi Kredit",
    description: "Periksa simulasi biaya dan tenor sebelum mengajukan kredit barang.",
    features: ["Simulasi mengikuti fungsi hitung aplikasi", "Tenor tersedia ditampilkan pada formulir"],
    cta: "Lihat Simulasi",
    image: null,
    enabled: true,
    order: 3,
    nomor: "03",
    file: "pindai-kredit.png",
    aksen: "toska",
    bentuk: "teks",
    disclaimer: "Informasi umum, bukan penawaran. Syarat & ketentuan berlaku.",
  },
  {
    id: "cara-kerja",
    title: "Cara Kerja: Catatan Digital",
    category: "Informasi",
    badge: "ALUR PENGAJUAN",
    headline: "Pengajuan Tercatat Digital",
    description: "Data pengajuan dan status yang tersedia dicatat di akun PINDAI.",
    features: [],
    cta: "Lihat Cara Kerja",
    image: null,
    enabled: true,
    order: 4,
    nomor: "04",
    file: "pindai-cara-kerja.png",
    aksen: "emas",
    bentuk: "langkah",
    items: [
      { teks: "Isi data yang diminta" },
      { teks: "Kirim pengajuan" },
      { teks: "Periksa status pada akun" },
    ],
    caption: "Pembayaran dan pencairan dilakukan di luar aplikasi.",
    disclaimer: "Alur dapat berbeda menurut jenis pengajuan dan hasil pemeriksaan.",
  },
  {
    id: "biaya",
    title: "Biaya: Contoh Perhitungan",
    category: "Informasi",
    badge: "CONTOH PINJAMAN",
    headline: "Lihat Contoh Perhitungan",
    description: "Contoh di bawah dihitung dengan fungsi pinjaman yang digunakan aplikasi.",
    features: [],
    cta: "Periksa Simulasi",
    image: null,
    enabled: true,
    order: 5,
    nomor: "05",
    file: "pindai-biaya.png",
    aksen: "emas",
    bentuk: "baris",
    items: rincianBiaya,
    pemisah: ["+", "="],
    catatan: `Contoh pokok ${formatRupiah(contohPinjaman.pokok)}.`,
    caption: "Hasil dapat berbeda menurut nominal, skema, dan ketentuan yang berlaku.",
    disclaimer: "Ini contoh perhitungan pinjaman harian, bukan penawaran atau persetujuan.",
  },
  {
    id: "keamanan",
    title: "Keamanan: Fitur yang Tersedia",
    category: "Keamanan",
    badge: "FITUR APLIKASI",
    headline: "Kenali Fitur Pengamanan",
    description: "Aplikasi menyediakan pemeriksaan identitas, pembatasan akses, dan catatan aktivitas admin.",
    features: ["Verifikasi identitas pengajuan", "Akses berbasis peran", "Riwayat aktivitas admin"],
    cta: "Lihat Kebijakan",
    image: null,
    enabled: true,
    order: 6,
    nomor: "06",
    file: "pindai-keamanan.png",
    aksen: "toska",
    bentuk: "kartu",
    disclaimer: "Fitur ini bukan jaminan bebas risiko. Hindari membagikan kode masuk.",
  },
  {
    id: "faq",
    title: "FAQ: Sebelum Mengajukan",
    category: "Informasi",
    badge: "INFORMASI PENGAJUAN",
    headline: "Pahami Sebelum Mengajukan",
    description: "",
    features: [],
    cta: "Lihat FAQ",
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
    disclaimer: "Jawaban ringkas; ketentuan lengkap tersedia di aplikasi.",
  },
  {
    id: "trust",
    title: "Brand: Catatan Digital",
    category: "Brand",
    badge: "PINJAMAN, GADAI, KREDIT",
    headline: "PINDAI, Catatan Digital",
    description: "PINDAI mencatat pengajuan pinjaman, gadai, dan kredit.",
    features: [],
    cta: "Kenali PINDAI",
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
    disclaimer: "Materi brand, bukan klaim sertifikasi atau legalitas.",
  },
  {
    id: "cta",
    title: "Mulai dari Informasi",
    category: "Brand",
    badge: "PINDAI",
    headline: "Mulai dari Informasi",
    description: "Pelajari catatan pengajuan pinjaman, gadai, dan kredit.",
    features: [],
    cta: "Lihat Informasi",
    image: null,
    enabled: true,
    order: 9,
    nomor: "09",
    file: "pindai-cta.png",
    aksen: "emas",
    bentuk: "hero",
    layanan: ["PINJAMAN", "GADAI", "KREDIT"],
    caption: "Pembayaran dan pencairan dilakukan di luar aplikasi.",
    disclaimer: "Informasi umum saja. Periksa ketentuan sebelum membuat pengajuan.",
  },
];

/**
 * Salinan poster dengan rincian biaya dari tarif yang berlaku sekarang.
 *
 * Poster "Biaya" adalah materi kampanye, jadi angkanya tidak boleh tertinggal
 * saat admin mengubah biaya admin, asuransi, atau ekspres. Pemanggil yang
 * punya akses Convex meneruskan `tarifBiaya` dari `system.getKetentuanBiaya`;
 * uji statis dan pemakaian tanpa query memakai `promoPosters` apa adanya.
 */
export function promoPostersDenganTarif(
  tarif?: Partial<TarifBiaya> | null,
): PromoPoster[] {
  const efektif = tarifBiayaAman(tarif);
  const contoh = quoteLoan(contohPinjaman.pokok, { tarif: efektif });
  return promoPosters.map((poster) =>
    poster.id === "biaya"
      ? {
          ...poster,
          items: [
            { judul: "Pokok", teks: formatRupiah(contoh.pokok) },
            { judul: "Biaya admin", teks: formatRupiah(contoh.biayaAdmin) },
            {
              judul: "Total kewajiban",
              teks: formatRupiah(contoh.totalKewajibanPelunasan),
            },
          ],
          catatan: `Contoh pokok ${formatRupiah(contoh.pokok)}. Potongan di muka: ${rincianPotonganDiMuka(efektif)}.`,
        }
      : poster,
  );
}

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
