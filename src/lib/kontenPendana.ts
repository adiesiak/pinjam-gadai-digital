/**
 * Konten halaman `/jadi-pendana` yang bisa diubah admin — tipe, bawaan, dan
 * normalisasi.
 *
 * Satu sumber untuk tiga pemakai:
 * - `convex/announcements.ts` (penyimpanan dan nilai balik publik),
 * - `pages/JadiPendana.tsx` (fallback saat query belum termuat),
 * - panel admin "Halaman Pendana" (nilai awal formulir dan batas panjang).
 *
 * Yang TIDAK bisa diubah dari sini: tarif, angka pembagian, rute, dan tombol
 * unduh. Semua angka dihitung `lib/imbalPendana` dari Pengaturan Sistem, jadi
 * teks yang diedit admin tidak bisa mengubah perhitungan yang tercatat server.
 *
 * Token: beberapa kalimat memuat angka kebijakan yang berubah. Alih-alih
 * menyalin "30%" ke teks (yang akan basi saat tarif diubah), teks menyimpan
 * token `{imbal}`, `{biaya}`, `{siklus}`, `{nominal}`, dan `{kontak}`. Halaman
 * dan proposal mengisinya saat dirender lewat `gantiTokenPendana`.
 */

export type ItemPrinsip = { judul: string; isi: string };
export type ItemRisiko = { judul: string; isi: string };
export type ItemFaq = { tanya: string; jawab: string };

/** Bentuk yang boleh tersimpan: setiap field opsional, termasuk daftar setengah jadi. */
export type KontenPendanaTersimpan = {
  heroJudul?: string;
  heroDeskripsi?: string;
  heroCatatan?: string;
  prinsipJudul?: string;
  prinsipDeskripsi?: string;
  prinsip?: ReadonlyArray<Partial<ItemPrinsip>>;
  kalkulatorJudul?: string;
  kalkulatorDeskripsi?: string;
  kalkulatorCatatan?: string;
  perhitunganJudul?: string;
  perhitunganDeskripsi?: string;
  proposalJudul?: string;
  proposalDeskripsi?: string;
  proposalIsi?: readonly string[];
  proposalCatatan?: string;
  proposalCatatanBerkas?: string;
  risikoJudul?: string;
  risikoDeskripsi?: string;
  risiko?: ReadonlyArray<Partial<ItemRisiko>>;
  faqJudul?: string;
  faqDeskripsi?: string;
  faq?: ReadonlyArray<Partial<ItemFaq>>;
  ajakanJudul?: string;
  ajakanDeskripsi?: string;
};

export type KontenPendana = {
  heroJudul: string;
  heroDeskripsi: string;
  heroCatatan: string;
  prinsipJudul: string;
  prinsipDeskripsi: string;
  prinsip: readonly ItemPrinsip[];
  kalkulatorJudul: string;
  kalkulatorDeskripsi: string;
  kalkulatorCatatan: string;
  perhitunganJudul: string;
  perhitunganDeskripsi: string;
  proposalJudul: string;
  proposalDeskripsi: string;
  proposalIsi: readonly string[];
  proposalCatatan: string;
  proposalCatatanBerkas: string;
  risikoJudul: string;
  risikoDeskripsi: string;
  risiko: readonly ItemRisiko[];
  faqJudul: string;
  faqDeskripsi: string;
  faq: readonly ItemFaq[];
  ajakanJudul: string;
  ajakanDeskripsi: string;
};

/** Batas panjang per field; server memotong, editor memakai `maxLength` yang sama. */
export const BATAS_PENDANA = {
  heroJudul: 180,
  heroDeskripsi: 420,
  heroCatatan: 300,
  prinsipJudul: 120,
  prinsipDeskripsi: 400,
  itemJudul: 90,
  itemIsi: 420,
  kalkulatorJudul: 100,
  kalkulatorDeskripsi: 420,
  kalkulatorCatatan: 420,
  perhitunganJudul: 100,
  perhitunganDeskripsi: 420,
  proposalJudul: 160,
  proposalDeskripsi: 800,
  proposalIsi: 220,
  proposalCatatan: 400,
  risikoJudul: 100,
  risikoDeskripsi: 300,
  faqJudul: 100,
  faqDeskripsi: 300,
  faqTanya: 180,
  faqJawab: 700,
  ajakanJudul: 100,
  ajakanDeskripsi: 420,
} as const;

/** Jumlah baris daftar yang dirender halaman. */
export const JUMLAH_PRINSIP = 4;
export const JUMLAH_RISIKO = 4;
export const JUMLAH_FAQ = 6;
export const JUMLAH_ISI_PROPOSAL = 5;

/** Token yang dikenali teks; selain ini dicetak apa adanya. */
export const TOKEN_PENDANA = [
  "{imbal}",
  "{biaya}",
  "{siklus}",
  "{nominal}",
  "{kontak}",
] as const;

export type NilaiTokenPendana = {
  imbal: string;
  biaya: string;
  siklus: string;
  nominal: string;
  kontak: string;
};

/**
 * Isi token pada satu teks. Teks tanpa token dikembalikan apa adanya, jadi
 * kalimat bebas yang diketik admin tidak pernah berubah bentuk.
 */
export function gantiTokenPendana(
  teks: string,
  nilai: NilaiTokenPendana,
): string {
  return teks.replace(
    /\{(imbal|biaya|siklus|nominal|kontak)\}/g,
    (utuh, kunci: keyof NilaiTokenPendana) => nilai[kunci] ?? utuh,
  );
}

/**
 * Teks bawaan halaman, sama dengan yang tampil sebelum CMS tersambung.
 * Angka yang berubah ditulis sebagai token, bukan angka mati.
 */
export const KONTEN_PENDANA_DEFAULT: KontenPendana = {
  heroJudul:
    "Imbal Hasil {imbal} per siklus {siklus} hari, tertulis sejak awal.",
  heroDeskripsi:
    "Setiap alokasi PINDAI menempel pada satu pinjaman dan satu pendana. Biaya platform {biaya} diambil dari total pengembalian (pokok + Imbal Hasil), bukan dari pokok saja, dan proposalnya bisa Anda unduh sekarang.",
  heroCatatan:
    "Proposal hanya terbuka dari ruang pendana. Catatan di bagian proposal menjelaskan apakah berkasnya disusun aplikasi atau dipasang admin.",
  prinsipJudul: "Yang membuat angkanya bisa diperiksa",
  prinsipDeskripsi:
    "Empat aturan ini tidak berubah di tengah pinjaman. Kalau salah satunya diubah, itu berlaku untuk alokasi baru, bukan untuk hak yang sudah tercatat.",
  prinsip: [
    {
      judul: "Imbal Hasil tetap {imbal}",
      isi: "Dihitung dari pokok yang Anda danai. Tenor pinjaman peminjam tidak memotong atau menambah hak Anda: perpanjangan, perubahan bunga, dan cicilan pokok tidak menyentuh angka ini.",
    },
    {
      judul: "Satu pinjaman, satu pendana",
      isi: "Alokasi tidak digabung dalam kolam. Di ruang pendana Anda bisa melihat pinjaman mana yang memakai dana Anda, beserta statusnya.",
    },
    {
      judul: "Biaya platform diumumkan di depan",
      isi: "Biaya {biaya} diambil dari total pengembalian (pokok + Imbal Hasil). Potongan ini membiayai operasional, penagihan, dan penanganan pinjaman bermasalah.",
    },
    {
      judul: "Hasil dibayar setelah lunas",
      isi: "Selama pinjaman berjalan, angka di portofolio adalah perkiraan. Setelah lunas, hak Anda dibukukan; admin mentransfernya di luar aplikasi lalu mencatatnya.",
    },
  ],
  kalkulatorJudul: "Hitung nominal Anda",
  kalkulatorDeskripsi:
    "Masukkan nominal yang Anda rencanakan. Pembagian di kanan memakai Imbal Hasil {imbal} untuk siklus {siklus} hari dan biaya platform {biaya} dari total pengembalian.",
  kalkulatorCatatan:
    "Angka contoh, bukan jaminan hasil. Imbal Hasil baru menjadi uang Anda setelah pinjaman lunas, dan biaya platform {biaya} dipotong dari total pengembalian (pokok + Imbal Hasil).",
  perhitunganJudul: "Lima baris yang menjelaskan semuanya",
  perhitunganDeskripsi:
    "Tidak ada rumus tersembunyi. Perhitungan dimulai dari pokok, memakai Imbal Hasil {imbal}, lalu memotong biaya platform {biaya} dari total pengembaliannya.",
  proposalJudul: "Proposal pendanaan & kemitraan strategis",
  proposalDeskripsi:
    "Berkas PDF yang bisa Anda simpan, cetak, atau kirim ke orang yang ikut memutuskan. Isinya ringkasan eksekutif dan target 2027, analisis pasar TAM, SAM, dan SOM, skema dengan simulasi Rp 5 juta sampai Rp 50 juta, cakupan biaya platform, langkah preventif, risiko, serta alur kemitraan dan kontak.",
  proposalIsi: [
    "Ringkasan eksekutif dan target 300 nasabah aktif 2027.",
    "Potensi pasar: TAM, SAM, dan SOM koridor industri.",
    "Skema pendanaan, contoh pembagian {nominal}, dan simulasi Rp 5 juta sampai Rp 50 juta.",
    "Cakupan biaya platform, langkah preventif, dan batas jaminan.",
    "Alur kemitraan dan kontak layanan.",
  ],
  proposalCatatan:
    "Dokumen dibuat ulang setiap kali diunduh, jadi angkanya mengikuti pengaturan biaya yang berlaku saat itu. Proposal bukan perjanjian dan bukan jaminan hasil.",
  proposalCatatanBerkas:
    "Berkas ini diterbitkan tim PINDAI dan tidak dihitung ulang saat diunduh. Proposal bukan perjanjian dan bukan jaminan hasil.",
  risikoJudul: "Sisi yang tidak menguntungkan",
  risikoDeskripsi:
    "Pendanaan bukan tabungan. Sebelum menyetor, pastikan Anda bisa menerima kemungkinan ini.",
  risiko: [
    {
      judul: "Modal bisa hilang",
      isi: "Jika peminjam gagal bayar, pokok dan Imbal Hasil tidak kembali. PINDAI menagih, tetapi tidak menjamin pembayaran.",
    },
    {
      judul: "Dana tertahan pada satu peminjam",
      isi: "Satu pinjaman didanai satu pendana. Seluruh pokok pada satu alokasi bergantung pada satu peminjam, tanpa penyebaran otomatis.",
    },
    {
      judul: "Pencairan mengikuti pelunasan",
      isi: "Siklus {siklus} hari adalah acuan hak, bukan jadwal penagihan. Keterlambatan peminjam ikut menunda pencairan hasil Anda.",
    },
    {
      judul: "Tidak ada penjamin pihak ketiga",
      isi: "Tidak ada jaminan LPS, asuransi, atau lembaga penjamin untuk dana pendanaan, kecuali ada perjanjian tertulis yang menyatakannya.",
    },
  ],
  faqJudul: "Yang biasanya ditanyakan lebih dulu",
  faqDeskripsi:
    "Jawabannya mengikuti cara kerja aplikasi dan kebijakan yang berlaku, bukan perkiraan.",
  faq: [
    {
      tanya: "Apakah uang saya dijamin kembali?",
      jawab:
        "Tidak. PINDAI mencatat alokasi dan menagih pinjaman, tetapi pembayaran bergantung pada peminjam. Tidak ada jaminan dari LPS, asuransi, atau pihak ketiga.",
    },
    {
      tanya: "Kapan Imbal Hasil dibayarkan?",
      jawab:
        "Setelah pinjaman lunas. Saat itu hak Anda dibukukan, lalu admin mentransfernya di luar aplikasi dan mencatat transfer tersebut. Selama pinjaman berjalan, angka di portofolio baru perkiraan.",
    },
    {
      tanya: "Bisakah dana ditarik kapan saja?",
      jawab:
        "Tidak. Alokasi mengikuti pinjaman yang sedang berjalan, jadi dana kembali setelah pinjaman selesai. Aplikasi tidak menyediakan penarikan otomatis atau pembatalan sepihak.",
    },
    {
      tanya: "Bagaimana kalau peminjam terlambat membayar?",
      jawab:
        "Sistem memantau jatuh tempo dan PINDAI melakukan penagihan. Keterlambatan menunda pencairan hasil Anda. Perpanjangan atau cicilan pokok peminjam tidak mengubah nominal hak pendana yang sudah tercatat.",
    },
    {
      tanya: "Bagaimana cara menjadi pendana?",
      jawab:
        "Hubungi layanan pelanggan di WhatsApp {kontak}. Admin menjelaskan syarat pendaftaran, membuatkan akun, lalu Anda masuk dengan OTP email. Penyetoran dan transfer hasil dilakukan di luar aplikasi.",
    },
    {
      tanya: "Apakah laporan bisa saya unduh sendiri?",
      jawab:
        "Proposal di halaman ini bisa diunduh kapan saja selama akses ruang pendana Anda masih berlaku. Laporan portofolio dan laporan pelunasan tersedia di ruang pendana dan bisa diminta lewat WhatsApp.",
    },
  ],
  ajakanJudul: "Bicarakan nominal dan waktunya",
  ajakanDeskripsi:
    "Layanan pelanggan PINDAI membuka WhatsApp di {kontak}. Sampaikan rencana nominal Anda, lalu admin menjelaskan syarat dan langkah sebelum akun dibuat.",
};

/** Teks bersih: buang spasi tepi, potong batas, dan kosong → bawaan. */
function teks(nilai: unknown, bawaan: string, maks: number): string {
  const bersih = typeof nilai === "string" ? nilai.trim() : "";
  return bersih ? bersih.slice(0, maks) : bawaan;
}

function pasangan(
  nilai: { judul?: string; isi?: string } | undefined,
  bawaan: ItemPrinsip,
): ItemPrinsip {
  return {
    judul: teks(nilai?.judul, bawaan.judul, BATAS_PENDANA.itemJudul),
    isi: teks(nilai?.isi, bawaan.isi, BATAS_PENDANA.itemIsi),
  };
}

function tanyaJawab(
  nilai: { tanya?: string; jawab?: string } | undefined,
  bawaan: ItemFaq,
): ItemFaq {
  return {
    tanya: teks(nilai?.tanya, bawaan.tanya, BATAS_PENDANA.faqTanya),
    jawab: teks(nilai?.jawab, bawaan.jawab, BATAS_PENDANA.faqJawab),
  };
}

/**
 * Lengkapi konten tersimpan menjadi bentuk utuh.
 *
 * Data lama bisa tidak lengkap (field baru ditambahkan belakangan) dan admin
 * boleh mengosongkan satu kolom. Keduanya tetap menghasilkan halaman utuh:
 * field kosong jatuh ke bawaan, bukan dirender sebagai judul kosong.
 */
export function lengkapiKontenPendana(
  nilai: KontenPendanaTersimpan | undefined | null,
): KontenPendana {
  const b = KONTEN_PENDANA_DEFAULT;
  return {
    heroJudul: teks(nilai?.heroJudul, b.heroJudul, BATAS_PENDANA.heroJudul),
    heroDeskripsi: teks(
      nilai?.heroDeskripsi,
      b.heroDeskripsi,
      BATAS_PENDANA.heroDeskripsi,
    ),
    heroCatatan: teks(
      nilai?.heroCatatan,
      b.heroCatatan,
      BATAS_PENDANA.heroCatatan,
    ),
    prinsipJudul: teks(
      nilai?.prinsipJudul,
      b.prinsipJudul,
      BATAS_PENDANA.prinsipJudul,
    ),
    prinsipDeskripsi: teks(
      nilai?.prinsipDeskripsi,
      b.prinsipDeskripsi,
      BATAS_PENDANA.prinsipDeskripsi,
    ),
    prinsip: Array.from({ length: JUMLAH_PRINSIP }, (_, i) =>
      pasangan(nilai?.prinsip?.[i], b.prinsip[i]),
    ),
    kalkulatorJudul: teks(
      nilai?.kalkulatorJudul,
      b.kalkulatorJudul,
      BATAS_PENDANA.kalkulatorJudul,
    ),
    kalkulatorDeskripsi: teks(
      nilai?.kalkulatorDeskripsi,
      b.kalkulatorDeskripsi,
      BATAS_PENDANA.kalkulatorDeskripsi,
    ),
    kalkulatorCatatan: teks(
      nilai?.kalkulatorCatatan,
      b.kalkulatorCatatan,
      BATAS_PENDANA.kalkulatorCatatan,
    ),
    perhitunganJudul: teks(
      nilai?.perhitunganJudul,
      b.perhitunganJudul,
      BATAS_PENDANA.perhitunganJudul,
    ),
    perhitunganDeskripsi: teks(
      nilai?.perhitunganDeskripsi,
      b.perhitunganDeskripsi,
      BATAS_PENDANA.perhitunganDeskripsi,
    ),
    proposalJudul: teks(
      nilai?.proposalJudul,
      b.proposalJudul,
      BATAS_PENDANA.proposalJudul,
    ),
    proposalDeskripsi: teks(
      nilai?.proposalDeskripsi,
      b.proposalDeskripsi,
      BATAS_PENDANA.proposalDeskripsi,
    ),
    proposalIsi: Array.from({ length: JUMLAH_ISI_PROPOSAL }, (_, i) =>
      teks(nilai?.proposalIsi?.[i], b.proposalIsi[i], BATAS_PENDANA.proposalIsi),
    ),
    proposalCatatan: teks(
      nilai?.proposalCatatan,
      b.proposalCatatan,
      BATAS_PENDANA.proposalCatatan,
    ),
    proposalCatatanBerkas: teks(
      nilai?.proposalCatatanBerkas,
      b.proposalCatatanBerkas,
      BATAS_PENDANA.proposalCatatan,
    ),
    risikoJudul: teks(
      nilai?.risikoJudul,
      b.risikoJudul,
      BATAS_PENDANA.risikoJudul,
    ),
    risikoDeskripsi: teks(
      nilai?.risikoDeskripsi,
      b.risikoDeskripsi,
      BATAS_PENDANA.risikoDeskripsi,
    ),
    risiko: Array.from({ length: JUMLAH_RISIKO }, (_, i) =>
      pasangan(nilai?.risiko?.[i], b.risiko[i]),
    ),
    faqJudul: teks(nilai?.faqJudul, b.faqJudul, BATAS_PENDANA.faqJudul),
    faqDeskripsi: teks(
      nilai?.faqDeskripsi,
      b.faqDeskripsi,
      BATAS_PENDANA.faqDeskripsi,
    ),
    faq: Array.from({ length: JUMLAH_FAQ }, (_, i) =>
      tanyaJawab(nilai?.faq?.[i], b.faq[i]),
    ),
    ajakanJudul: teks(
      nilai?.ajakanJudul,
      b.ajakanJudul,
      BATAS_PENDANA.ajakanJudul,
    ),
    ajakanDeskripsi: teks(
      nilai?.ajakanDeskripsi,
      b.ajakanDeskripsi,
      BATAS_PENDANA.ajakanDeskripsi,
    ),
  };
}
