/**
 * Konten beranda publik yang bisa diedit admin — tipe, bawaan, dan normalisasi.
 *
 * Satu sumber untuk tiga pemakai:
 * - `convex/announcements.ts` (nilai balik publik + penyimpanan),
 * - `pages/LandingHome.tsx` (fallback saat query belum termuat),
 * - panel admin (nilai awal formulir dan batas panjang).
 *
 * Href dan ikon TIDAK ikut disimpan: rute adalah bagian dari kode, bukan teks.
 * CMS hanya mengganti tulisan, jadi admin tidak bisa mengarahkan CTA ke luar
 * aplikasi lewat data.
 */

export type KartuLayanan = {
  judul: string;
  ringkasan: string;
  detail: string;
};

export type ItemPanduan = {
  judul: string;
  isi: string;
};

/**
 * Bentuk yang boleh tersimpan: setiap field opsional, termasuk isi daftar yang
 * setengah jadi. Dipakai validator/penyimpanan Convex; hasil bacanya selalu
 * dilengkapi menjadi `KontenLanding` utuh.
 */
export type KontenLandingTersimpan = {
  heroEyebrow?: string;
  heroJudul1?: string;
  heroJudul2?: string;
  heroDeskripsi?: string;
  heroCtaSekunder?: string;
  heroMikro?: string;
  layananEyebrow?: string;
  layananJudul?: string;
  layananCta?: string;
  layanan?: ReadonlyArray<Partial<KartuLayanan>>;
  panduanEyebrow?: string;
  panduanJudul?: string;
  panduanDeskripsi?: string;
  panduanCtaKalkulator?: string;
  panduanCtaSyarat?: string;
  panduan?: ReadonlyArray<Partial<ItemPanduan>>;
  footerDeskripsi?: string;
};

export type KontenLanding = {
  heroEyebrow: string;
  heroJudul1: string;
  heroJudul2: string;
  heroDeskripsi: string;
  heroCtaSekunder: string;
  heroMikro: string;
  layananEyebrow: string;
  layananJudul: string;
  layananCta: string;
  layanan: readonly KartuLayanan[];
  panduanEyebrow: string;
  panduanJudul: string;
  panduanDeskripsi: string;
  panduanCtaKalkulator: string;
  panduanCtaSyarat: string;
  panduan: readonly ItemPanduan[];
  footerDeskripsi: string;
};

/**
 * Batas panjang per field. Dipakai server saat menyimpan dan editor sebagai
 * `maxLength`, supaya angka di formulir tidak pernah berbeda dari yang benar-
 * benar dipotong server.
 */
export const BATAS_LANDING = {
  heroEyebrow: 60,
  heroJudul1: 80,
  heroJudul2: 80,
  heroDeskripsi: 400,
  heroCtaSekunder: 40,
  heroMikro: 240,
  layananEyebrow: 40,
  layananJudul: 100,
  layananCta: 40,
  kartuJudul: 60,
  kartuRingkasan: 240,
  kartuDetail: 120,
  panduanEyebrow: 40,
  panduanJudul: 120,
  panduanDeskripsi: 300,
  panduanCta: 40,
  itemJudul: 60,
  itemIsi: 240,
  footerDeskripsi: 300,
} as const;

/** Jumlah kartu layanan dan baris panduan yang dirender beranda. */
export const JUMLAH_KARTU_LAYANAN = 3;
export const JUMLAH_PANDUAN = 3;

/**
 * Teks beranda bawaan — sama persis dengan yang tampil sebelum CMS tersambung.
 * Mengubah teks di sini mengubah tampilan semua instalasi yang belum menyimpan
 * konten sendiri, jadi perlakukan sebagai copy publik, bukan placeholder.
 */
export const KONTEN_LANDING_DEFAULT: KontenLanding = {
  heroEyebrow: "Informasi layanan PINDAI",
  heroJudul1: "Biaya dan status",
  heroJudul2: "terlihat sebelum melangkah.",
  heroDeskripsi:
    "PINDAI mencatat pilihan pinjaman, gadai, dan kredit barang beserta perhitungannya. Perpindahan dana dan penanganan barang berlangsung di luar aplikasi.",
  heroCtaSekunder: "Lihat kalkulator",
  heroMikro:
    "Kalkulator memberi ilustrasi berdasarkan nominal dan tenor pilihan, bukan persetujuan atau bukti pembayaran.",
  layananEyebrow: "Tiga jenis catatan",
  layananJudul: "Pilih layanan untuk ditinjau",
  layananCta: "Lihat rincian",
  layanan: [
    {
      judul: "Pinjaman tunai",
      ringkasan:
        "Tinjau skema harian dan bulanan, termasuk rincian potongan dan bunga.",
      detail: "Bunga dan potongan tampil sebelum pengajuan dikirim."
    },
    {
      judul: "Gadai",
      ringkasan: "Catat informasi barang, nilai taksiran, dan skema sewa modal.",
      detail: "Nilai taksiran mengikuti harga pasar yang dicantumkan."
    },
    {
      judul: "Kredit barang",
      ringkasan:
        "Lihat cara aplikasi menghitung pembiayaan barang dan cicilannya.",
      detail: "Pembiayaan barang dengan cicilan bulanan."
    },
  ],
  panduanEyebrow: "Sebelum mengajukan",
  panduanJudul: "Mulai dari informasi yang Anda perlukan.",
  panduanDeskripsi:
    "Periksa simulasi, pahami alur, dan baca batas sistem. Keputusan pengajuan tetap ditinjau tim PINDAI.",
  panduanCtaKalkulator: "Buka kalkulator",
  panduanCtaSyarat: "Baca syarat",
  panduan: [
    {
      judul: "Periksa perhitungan",
      isi: "Ubah nominal dan tenor pada kalkulator sebelum membuat akun.",
    },
    {
      judul: "Kenali alurnya",
      isi: "Baca tahapan pengajuan dan batas proses yang dilakukan aplikasi.",
    },
    {
      judul: "Pahami pencatatan",
      isi: "Ketahui bagaimana akses akun, status, dan data ditangani.",
    },
  ],
  footerDeskripsi:
    "Aplikasi pencatatan pinjaman, gadai, dan kredit barang. Perpindahan dana serta penanganan barang berada di luar aplikasi.",
};

/** Teks bersih: buang spasi tepi, potong batas, dan kosong → bawaan. */
function teks(nilai: unknown, bawaan: string, maks: number): string {
  const bersih = typeof nilai === "string" ? nilai.trim() : "";
  return bersih ? bersih.slice(0, maks) : bawaan;
}

/** Satu kartu layanan; field kosong memakai bawaan pada indeks yang sama. */
function kartuLayanan(
  nilai: Partial<KartuLayanan> | undefined,
  bawaan: KartuLayanan,
): KartuLayanan {
  return {
    judul: teks(nilai?.judul, bawaan.judul, BATAS_LANDING.kartuJudul),
    ringkasan: teks(
      nilai?.ringkasan,
      bawaan.ringkasan,
      BATAS_LANDING.kartuRingkasan,
    ),
    detail: teks(nilai?.detail, bawaan.detail, BATAS_LANDING.kartuDetail),
  };
}

function itemPanduan(
  nilai: Partial<ItemPanduan> | undefined,
  bawaan: ItemPanduan,
): ItemPanduan {
  return {
    judul: teks(nilai?.judul, bawaan.judul, BATAS_LANDING.itemJudul),
    isi: teks(nilai?.isi, bawaan.isi, BATAS_LANDING.itemIsi),
  };
}

/**
 * Lengkapi konten tersimpan menjadi bentuk utuh yang siap dirender.
 *
 * Data lama bisa saja tidak lengkap (field baru ditambahkan belakangan), dan
 * admin boleh mengosongkan satu kolom. Keduanya harus tetap menghasilkan
 * halaman utuh, bukan judul kosong — karena itu setiap field kosong jatuh ke
 * bawaan, bukan dirender apa adanya.
 */
export function lengkapiKontenLanding(
  nilai: KontenLandingTersimpan | undefined | null,
): KontenLanding {
  const b = KONTEN_LANDING_DEFAULT;
  const layanan = Array.from({ length: JUMLAH_KARTU_LAYANAN }, (_, i) =>
    kartuLayanan(nilai?.layanan?.[i], b.layanan[i]),
  );
  const panduan = Array.from({ length: JUMLAH_PANDUAN }, (_, i) =>
    itemPanduan(nilai?.panduan?.[i], b.panduan[i]),
  );

  return {
    heroEyebrow: teks(nilai?.heroEyebrow, b.heroEyebrow, BATAS_LANDING.heroEyebrow),
    heroJudul1: teks(nilai?.heroJudul1, b.heroJudul1, BATAS_LANDING.heroJudul1),
    heroJudul2: teks(nilai?.heroJudul2, b.heroJudul2, BATAS_LANDING.heroJudul2),
    heroDeskripsi: teks(
      nilai?.heroDeskripsi,
      b.heroDeskripsi,
      BATAS_LANDING.heroDeskripsi,
    ),
    heroCtaSekunder: teks(
      nilai?.heroCtaSekunder,
      b.heroCtaSekunder,
      BATAS_LANDING.heroCtaSekunder,
    ),
    heroMikro: teks(nilai?.heroMikro, b.heroMikro, BATAS_LANDING.heroMikro),
    layananEyebrow: teks(
      nilai?.layananEyebrow,
      b.layananEyebrow,
      BATAS_LANDING.layananEyebrow,
    ),
    layananJudul: teks(
      nilai?.layananJudul,
      b.layananJudul,
      BATAS_LANDING.layananJudul,
    ),
    layananCta: teks(nilai?.layananCta, b.layananCta, BATAS_LANDING.layananCta),
    layanan,
    panduanEyebrow: teks(
      nilai?.panduanEyebrow,
      b.panduanEyebrow,
      BATAS_LANDING.panduanEyebrow,
    ),
    panduanJudul: teks(
      nilai?.panduanJudul,
      b.panduanJudul,
      BATAS_LANDING.panduanJudul,
    ),
    panduanDeskripsi: teks(
      nilai?.panduanDeskripsi,
      b.panduanDeskripsi,
      BATAS_LANDING.panduanDeskripsi,
    ),
    panduanCtaKalkulator: teks(
      nilai?.panduanCtaKalkulator,
      b.panduanCtaKalkulator,
      BATAS_LANDING.panduanCta,
    ),
    panduanCtaSyarat: teks(
      nilai?.panduanCtaSyarat,
      b.panduanCtaSyarat,
      BATAS_LANDING.panduanCta,
    ),
    panduan,
    footerDeskripsi: teks(
      nilai?.footerDeskripsi,
      b.footerDeskripsi,
      BATAS_LANDING.footerDeskripsi,
    ),
  };
}
