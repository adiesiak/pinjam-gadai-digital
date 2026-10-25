/**
 * Proposal pendanaan & kemitraan strategis PINDAI: dokumen PDF yang diunduh
 * dari halaman proposal di ruang pendana, tanpa menunggu admin.
 *
 * Kenapa dokumennya disusun dari fungsi murni: halaman, unduhan, dan uji harus
 * memakai angka yang sama. Semua nominal di sini dihitung oleh
 * `lib/imbalPendana` dan `lib/bagiHasil`, modul yang juga dipakai server saat
 * mencatat hak pendana. Tidak ada persentase yang disalin ke teks: siklus,
 * Imbal Hasil, dan biaya platform dibaca dari konstanta atau dari Pengaturan
 * Sistem yang berlaku saat tombol unduh ditekan.
 *
 * Bentuk dokumennya meniru lembar penawaran: satu sampul dengan tiga angka
 * kunci, lalu halaman isi yang mengikuti cara calon pendana membaca. Skema dan
 * angkanya lebih dulu, pasar dan risikonya setelah itu, dan kontak di halaman
 * terakhir. Bagian risiko dicetak terbuka sebelum kontak, karena dokumen yang
 * hanya menjual angka tidak layak dipakai sebagai bahan pertimbangan.
 */
import {
  PERSEN_IMBAL_PENDANA,
  TENOR_PENDANA_HARI,
  bagiHasilPendana,
} from "./imbalPendana";
import { formatRupiahAman } from "./money";
import { CS_WHATSAPP } from "./kontak";
import type { BarisPdf, DokumenPdf } from "./pdfSederhana";

/** Kop dan kaki dokumen, sama dengan laporan lain yang keluar dari PINDAI. */
const NAMA_LAYANAN = "PINJAM GADAI DIGITAL (PINDAI)";
const KAKI_DOKUMEN = "PINDAI - proposal pendanaan dan kemitraan strategis";

/** Nominal yang diuraikan baris demi baris sebagai contoh utama. */
export const NOMINAL_CONTOH_PROPOSAL = 10_000_000;

/**
 * Nominal simulasi, kelipatan Rp 5 juta dari Rp 5 juta sampai Rp 50 juta.
 * Rentangnya mengikuti tiket pendanaan yang dibahas di halaman, bukan batas
 * pinjaman peminjam.
 */
export const NOMINAL_SIMULASI_PROPOSAL = [
  5_000_000, 10_000_000, 15_000_000, 20_000_000, 25_000_000, 30_000_000,
  35_000_000, 40_000_000, 45_000_000, 50_000_000,
] as const;

export type DataProposalPendana = {
  /** Biaya platform (layanan) dari total pengembalian, persen. */
  persenPotonganAdmin: number;
  /** Waktu dokumen disusun (epoch ms); dipakai di sampul dan nama berkas. */
  dibuatPada: number;
};

function rupiah(nilai: number): string {
  return formatRupiahAman(nilai);
}

/**
 * Persen dengan koma desimal bahasa Indonesia (2,5%), dipakai halaman dan
 * dokumen supaya keduanya menulis tarif dengan cara yang sama.
 */
export function formatPersen(nilai: number): string {
  const teks = Number.isInteger(nilai)
    ? String(nilai)
    : nilai.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  return `${teks}%`;
}

/** Tanggal panjang bahasa Indonesia pada zona waktu Jakarta. */
export function tanggalProposal(ms: number): string {
  return new Date(ms).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

/** Tanggal ISO untuk nama berkas, dihitung dari UTC seperti laporan lain. */
function tanggalIso(ms: number): string {
  const d = new Date(ms);
  const bulan = String(d.getUTCMonth() + 1).padStart(2, "0");
  const hari = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${bulan}-${hari}`;
}

/** Nama berkas unduhan, mis. `proposal-pendanaan-pindai-2026-10-22.pdf`. */
export function namaBerkasProposalPendana(dibuatPada: number): string {
  return `PINDAI-Proposal-Pendanaan-${tanggalIso(dibuatPada)}.pdf`;
}

/** Nomor WhatsApp layanan pelanggan dalam format yang enak dibaca. */
export function nomorLayananProposal(): string {
  const nasional = CS_WHATSAPP.startsWith("62")
    ? `0${CS_WHATSAPP.slice(2)}`
    : CS_WHATSAPP;
  const kelompok = nasional.match(/.{1,4}/g) ?? [nasional];
  return kelompok.join("-");
}

/**
 * Susun dokumen proposal.
 *
 * Sampul, lalu halaman isi lima bagian: ringkasan dan target 2027, potensi
 * pasar, skema dan simulasi, biaya platform dan risiko, lalu alur kemitraan
 * dan kontak. Pemisah halaman ditetapkan eksplisit di dua tempat supaya tabel
 * simulasi dan langkah kemitraan tidak terpotong di tengah.
 */
export function proposalPendanaanPindai(data: DataProposalPendana): DokumenPdf {
  const persen = formatPersen(data.persenPotonganAdmin);
  const contoh = bagiHasilPendana(
    NOMINAL_CONTOH_PROPOSAL,
    data.persenPotonganAdmin,
  );
  // Porsi platform diambil dari marjin pinjaman (47 : 13). Angkanya diturunkan
  // dari mesin, bukan ditulis sebagai konstanta, supaya tetap sama dengan
  // pencairan sebenarnya.
  const persenBiayaPokok =
    Math.round((contoh.potonganAdmin / NOMINAL_CONTOH_PROPOSAL) * 10000) / 100;
  const persenDiterima =
    Math.round((contoh.diterima / NOMINAL_CONTOH_PROPOSAL) * 10000) / 100;
  const persenKeuntungan =
    Math.round((contoh.keuntungan / NOMINAL_CONTOH_PROPOSAL) * 10000) / 100;
  const kolamBiaya = bagiHasilPendana(
    225_000_000,
    data.persenPotonganAdmin,
  ).potonganAdmin;

  const simulasi = NOMINAL_SIMULASI_PROPOSAL.map((pokok) => {
    const bagi = bagiHasilPendana(pokok, data.persenPotonganAdmin);
    return [
      rupiah(pokok),
      rupiah(bagi.imbal),
      rupiah(bagi.total),
      rupiah(bagi.potonganAdmin),
      rupiah(bagi.diterima),
      rupiah(bagi.keuntungan),
    ];
  });

  const baris: BarisPdf[] = [
    { teks: "Ringkasan eksekutif", gaya: "seksi" },
    { garis: true },
    {
      teks: "PINDAI adalah platform pendanaan digital yang mempertemukan pendana dengan nasabah gadai mikro di koridor industri megapolitan. Setiap pinjaman dijamin satu agunan fisik yang spesifik dan tercatat, dengan pemetaan satu pinjaman untuk satu pendana. Dana tidak masuk ke kumpulan portofolio tanpa nama: pendana tahu pinjaman mana yang dibiayai dan agunan apa yang menyertainya.",
      gaya: "biasa",
    },
    {
      teks: "Nasabah PINDAI adalah karyawan pabrik aktif di Karawang, Cikarang, Bekasi, Bogor, Sukabumi, dan Jakarta. Tiket pinjaman Rp 500.000 sampai Rp 1.000.000 dengan siklus 30 hari. Mereka menerima gaji bulanan tetap, memiliki aset fisik yang bisa dinilai, dan membutuhkan dana untuk kebutuhan yang tidak menunggu jadwal gajian.",
      gaya: "biasa",
    },
    {
      teks: `Skema untuk pendana berjalan singkat: dana ditempatkan untuk satu siklus ${TENOR_PENDANA_HARI} hari, lalu pokok kembali bersama marjin ${PERSEN_IMBAL_PENDANA}% flat yang dihitung dari pokok pendanaan. Marjin itu dibagi 47 : 13, sehingga porsi platform ${persen} diambil dari marjin (bukan dari pokok) dan pendana menerima ${formatPersen(persenDiterima)} dari pokok dengan keuntungan bersih ${formatPersen(persenKeuntungan)} per siklus.`,
      gaya: "biasa",
    },
    {
      teks: "Target 2027 ditetapkan pada satu angka yang bisa diperiksa setiap bulan: 300 nasabah aktif per bulan, konsisten. Dengan tiket rata-rata Rp 750.000, target itu setara Rp 225.000.000 penyaluran per bulan atau sekitar Rp 2.700.000.000 per tahun.",
      gaya: "biasa",
    },

    { jarak: 8 },
    { label: "Nasabah aktif per bulan", nilai: "300" },
    { label: "Tiket rata-rata", nilai: "Rp 750.000" },
    { label: "Penyaluran per bulan", nilai: "Rp 225.000.000" },
    { label: "Penyaluran per tahun", nilai: "Rp 2.700.000.000" },
    {
      teks: "Rencana tahun berjalan menjaga kualitas verifikasi di Karawang dan Cikarang lebih dulu, menambah kapasitas penagihan lapangan, memperluas jangkauan ke Bekasi, Bogor, dan Sukabumi, lalu menutup tahun dengan volume 300 nasabah aktif per bulan. Rincian risiko dan batas jaminan ada di bagian empat.",
      gaya: "kecil",
    },

    { jarak: 12 },
    { teks: "Potensi pasar dan koridor industri", gaya: "seksi" },
    { garis: true },
    {
      teks: "Pasar PINDAI dihitung dari pekerja industri yang menerima gaji tetap dan membutuhkan dana mikro jangka pendek. Koridor Karawang sampai Jakarta memuat kawasan industri dengan konsentrasi pekerja tinggi, sehingga satu gerbang kawasan menjadi rute penagihan yang efisien dan satu perusahaan menjadi sumber nasabah berulang.",
      gaya: "biasa",
    },
    { jarak: 4 },
    { label: "TAM per tahun", nilai: "Rp 100 miliar sampai Rp 200 miliar" },
    {
      teks: "Kebutuhan pembiayaan mikro 6 sampai 8 juta angkatan kerja industri di koridor Karawang, Cikarang, Bekasi, Bogor, Sukabumi, dan Jakarta.",
      gaya: "kecil",
    },
    { label: "SAM per tahun", nilai: "Rp 10 miliar sampai Rp 20 miliar" },
    {
      teks: "Pekerja industri aktif di KIIC, EJIP, Jababeka, MM2100, Sentul, dan Sukabumi yang membutuhkan dana Rp 500.000 sampai Rp 1.000.000.",
      gaya: "kecil",
    },
    { label: "SOM 2027", nilai: "Rp 225 juta per bulan" },
    {
      teks: "Setara Rp 2,7 miliar per tahun, 13,5% sampai 27% dari SAM dan 1,35% sampai 2,7% dari TAM.",
      gaya: "kecil",
    },
    { jarak: 8 },
    { teks: "Koridor dan nasabah", gaya: "tebal" },
    {
      teks: "Kawasan KIIC dan sekitarnya menjadi pasar inti karena kantor pusat berada di Karawang. Cikarang menambah volume dari EJIP, Jababeka, dan MM2100. Bekasi, Bogor, Sukabumi, dan Jakarta memperluas jangkauan setelah kapasitas penagihan siap. Agunan yang diterima adalah barang bernilai likuid dan mudah dinilai, misalnya sepeda motor, emas, atau elektronik tertentu, dengan nilai jual kembali yang masih menutup pokok.",
      gaya: "biasa",
    },
    { teks: "Posisi PINDAI", gaya: "tebal" },
    {
      teks: "PINDAI memposisikan layanannya pada pinjaman Rp 500.000 sampai Rp 1.000.000 dengan siklus 30 hari. Posisi yang diambil adalah tiket kecil, jangka waktu pendek, agunan fisik tercatat, dan biaya yang ditulis sejak awal. Nilai jaminan tidak bergantung pada skor kredit, tetapi pada barang yang diperiksa dan disimpan sesuai prosedur internal.",
      gaya: "biasa",
    },
    { teks: "Risiko pasar", gaya: "tebal" },
    {
      teks: "Permintaan dana mikro mengikuti ritme penggajian dan musim pengeluaran, terutama menjelang hari raya dan tahun ajaran. Target 300 nasabah dihitung sebagai rata-rata tahunan, bukan janji kenaikan setiap bulan. Persaingan terbuka, tetapi jaringan verifikasi dan penagihan lapangan tidak dibangun dalam satu siklus.",
      gaya: "biasa",
    },

    { jarak: 10 },
    { teks: "Skema pendanaan", gaya: "seksi" },
    { garis: true },
    {
      teks: `Satu siklus acuan ${TENOR_PENDANA_HARI} hari. Semua angka dihitung dari pokok pendanaan, bukan dari bunga pinjaman peminjam. Perpanjangan tenor atau perubahan skema di sisi peminjam tidak mengubah hak pendana atas siklus yang sudah tercatat.`,
      gaya: "biasa",
    },
    {
      label: "Imbal Hasil",
      nilai: `${PERSEN_IMBAL_PENDANA}% x Pokok`,
    },
    {
      label: "Uang Kembali",
      nilai: "Pokok + Imbal Hasil (130%)",
    },
    {
      label: "Porsi platform",
      nilai: `${persen} x marjin`,
    },
    {
      label: "Diterima bersih",
      nilai: `${formatPersen(persenDiterima)} dari pokok`,
    },
    {
      label: "Keuntungan bersih",
      nilai: `${formatPersen(persenKeuntungan)} dari pokok`,
    },

    { jarak: 10 },
    {
      teks: `Contoh pembagian ${rupiah(NOMINAL_CONTOH_PROPOSAL)}`,
      gaya: "seksi",
    },
    { garis: true },
    { label: "Pokok yang Anda danai", nilai: rupiah(NOMINAL_CONTOH_PROPOSAL) },
    {
      label: `Imbal Hasil (${PERSEN_IMBAL_PENDANA}%)`,
      nilai: rupiah(contoh.imbal),
    },
    { label: "Uang yang kembali", nilai: rupiah(contoh.total) },
    {
      label: `Porsi platform (layanan) ${persen}`,
      nilai: rupiah(contoh.potonganAdmin),
    },
    {
      pita: {
        label: "Diterima bersih",
        nilai: rupiah(contoh.diterima),
        catatan: `Keuntungan bersih ${rupiah(contoh.keuntungan)} setelah pokok kembali utuh.`,
      },
    },
    {
      teks: "Porsi platform diambil dari marjin pinjaman (bagian 47 : 13), bukan dari pokok. Pokok kembali utuh, sedangkan keuntungan bersih pendana adalah 78,33% dari marjin itu.",
      gaya: "kecil",
    },

    // Tabel enam kolom butuh halaman penuh supaya kepala kolom tidak terpisah
    // dari barisnya saat halaman berganti.
    { halamanBaru: true },
    {
      teks: "Simulasi Rp 5.000.000 sampai Rp 50.000.000",
      gaya: "seksi",
    },
    { garis: true },
    {
      tabel: {
        kepala: [
          "Pokok",
          "Imbal 30%",
          "Uang Kembali",
          `Biaya ${persen}`,
          "Diterima",
          "Keuntungan",
        ],
        baris: simulasi,
      },
    },
    { jarak: 6 },
    {
      teks: "Semua nominal rupiah bulat. Biaya platform dibulatkan ke bawah, sehingga sisa rupiah menjadi hak pendana dan tidak ada rupiah yang hilang atau diciptakan.",
      gaya: "kecil",
    },

    { jarak: 12 },
    { teks: "Putaran dana", gaya: "seksi" },
    { garis: true },
    {
      teks: `Keuntungan ${formatPersen(persenKeuntungan)} berlaku untuk satu siklus 30 hari, dan tidak ada janji bahwa dana berputar setiap bulan. Setelah siklus selesai, pendana memutuskan apakah dana ditempatkan lagi pada alokasi berikutnya atau ditarik. Waktu tunggu antar-alokasi dan keterlambatan pembayaran peminjam mengurangi hasil aktual, sehingga setiap siklus dinilai sendiri.`,
      gaya: "biasa",
    },
    { teks: "Pemetaan dana", gaya: "tebal" },
    {
      teks: "Setiap alokasi tercatat pada satu pinjaman dan tidak dipakai untuk pinjaman lain selama siklus berjalan. Identitas peminjam, nilai agunan, dan tanggal jatuh tempo tersimpan di sistem PINDAI. Dana tidak dapat ditarik sebelum pinjaman lunas.",
      gaya: "biasa",
    },

    { jarak: 10 },
    {
      teks: "Porsi platform dan mitigasi risiko",
      gaya: "seksi",
    },
    { garis: true },
    {
      teks: `Porsi platform ${persen} dihitung dari marjin pinjaman, sehingga biayanya sebanding dengan hasil yang dibayarkan tanpa memotong pokok. Pada skala 300 nasabah dengan tiket rata-rata Rp 750.000, porsi platform yang terkumpul sekitar ${rupiah(kolamBiaya)} per siklus. Angka itu membiayai penagihan lapangan, pengelolaan agunan, dan fasilitas pembayaran peminjam.`,
      gaya: "biasa",
    },
    { teks: "Penagihan lapangan.", gaya: "tebal" },
    {
      teks: "Petugas mendatangi peminjam sebelum jatuh tempo, di kawasan pabrik, rumah kos, atau kediaman. Kunjungan awal inilah yang menjaga siklus 30 hari tetap berjalan.",
      gaya: "biasa",
    },
    { teks: "Asuransi atau pengelolaan internal agunan.", gaya: "tebal" },
    {
      teks: "Agunan dinilai, dicatat, dan disimpan sesuai prosedur internal, termasuk pemeriksaan kondisi dan perlindungan atas risiko kerusakan atau kehilangan. Perlindungan itu berlaku untuk barang jaminan, bukan jaminan atas pengembalian dana pendana.",
      gaya: "biasa",
    },
    // Cakupan biaya ketiga pindah halaman bersama isinya supaya labelnya tidak
    // tertinggal sendirian di dasar halaman sebelumnya.
    { halamanBaru: true },
    { teks: "Fasilitas jaminan dan solusi bayar.", gaya: "tebal" },
    {
      teks: "Peminjam menerima bukti pencatatan agunan, pengingat, dan pilihan cara membayar yang dicatat admin. Jejak transaksi ini yang dipakai saat rekonsiliasi.",
      gaya: "biasa",
    },

    { jarak: 8 },
    { teks: "Langkah preventif", gaya: "seksi" },
    { garis: true },
    { teks: "1. Verifikasi sebelum pinjaman", gaya: "tebal" },
    {
      teks: "Penyaringan identitas, status kerja, dan agunan fisik bernilai likuid tinggi. Pinjaman yang tidak layak ditolak sebelum dana keluar.",
      gaya: "biasa",
    },
    { teks: "2. Pengingat", gaya: "tebal" },
    {
      teks: "Notifikasi aktif dikirim beberapa hari sebelum jatuh tempo untuk mencegah keterlambatan karena lupa.",
      gaya: "biasa",
    },
    { teks: "3. Somasi dan peringatan formal", gaya: "tebal" },
    {
      teks: "Teguran bertahap dengan jejak tertulis setelah batas waktu terlewati.",
      gaya: "biasa",
    },
    { teks: "4. Restrukturisasi", gaya: "tebal" },
    {
      teks: "Penyesuaian jadwal atau skema cicilan bagi peminjam kooperatif. Jadwal peminjam berubah, hak pendana atas siklus 30 hari tetap.",
      gaya: "biasa",
    },
    { teks: "5. Eksekusi agunan fisik", gaya: "tebal" },
    {
      teks: "Jalan terakhir: barang jaminan dieksekusi sesuai prosedur internal untuk mengamankan pokok pendana.",
      gaya: "biasa",
    },

    { jarak: 8 },
    { teks: "Batas jaminan", gaya: "seksi" },
    { garis: true },
    {
      teks: "PINDAI tidak menjamin pembayaran peminjam, tidak menanggung kerugian pokok pendana, dan tidak ada jaminan dari lembaga penjamin simpanan atau pihak ketiga. Eksekusi agunan membutuhkan waktu dan biaya, dan hasilnya bisa lebih rendah dari taksiran. Modal berisiko: bila peminjam gagal bayar, pokok dan Imbal Hasil tidak kembali.",
      gaya: "biasa",
    },
    {
      teks: "Pada portofolio 300 pinjaman, satu wanprestasi setara 0,33% dari nilai portofolio satu siklus. Perhitungan itu berlaku di tingkat portofolio, bukan jaminan per pinjaman.",
      gaya: "kecil",
    },
    { label: "Wanprestasi peminjam", nilai: "Pokok dan hasil tidak kembali" },
    {
      label: "Agunan tidak likuid",
      nilai: "Hasil eksekusi bisa di bawah taksiran",
    },
    { label: "Konsentrasi alokasi", nilai: "Satu pinjaman, satu pendana" },
    { label: "Waktu pencairan", nilai: "Menunggu pelunasan peminjam" },

    { jarak: 8 },
    { teks: "Alur kemitraan", gaya: "seksi" },
    { garis: true },
    {
      teks: "Pendaftaran lewat CS WhatsApp, bukan pendaftaran mandiri, karena rencana pendanaan dibahas lebih dulu: nominal, sumber dana, rekening pengembalian, dan penyebaran alokasi. Setelah akun dibuat, pendana masuk dengan verifikasi OTP email.",
      gaya: "biasa",
    },
    { teks: "1. Pendaftaran", gaya: "tebal" },
    {
      teks: `Hubungi CS WhatsApp ${nomorLayananProposal()} dan sampaikan rencana nominal. PINDAI memeriksa kelengkapan data dan membuatkan akun.`,
      gaya: "biasa",
    },
    { teks: "2. Penyetoran dana", gaya: "tebal" },
    {
      teks: "Dana disetor ke rekening usaha PINDAI di luar aplikasi. Aplikasi mencatat, tetapi tidak memindahkan uang secara otomatis.",
      gaya: "biasa",
    },
    { teks: "3. Alokasi", gaya: "tebal" },
    {
      teks: "Dana dialokasikan ke agunan fisik riil milik karyawan pabrik, dengan catatan identitas pinjaman dan agunan.",
      gaya: "biasa",
    },
    { teks: "4. Siklus 30 hari", gaya: "tebal" },
    {
      teks: "PINDAI mengirim pengingat, menagih di lapangan, dan mencatat pembayaran peminjam.",
      gaya: "biasa",
    },
    { teks: "5. Pengembalian", gaya: "tebal" },
    {
      teks: "Setelah pinjaman lunas, pokok dan keuntungan bersih ditransfer ke rekening pendana, lalu dicatat admin.",
      gaya: "biasa",
    },

    { jarak: 8 },
    { teks: "Jadwal satu siklus", gaya: "seksi" },
    { garis: true },
    { label: "Hari 0", nilai: "Pembahasan, verifikasi, dan akun" },
    { label: "Setelah persetujuan", nilai: "Penyetoran dana" },
    { label: "Setelah dana dicatat", nilai: "Alokasi ke satu pinjaman" },
    { label: "Menjelang jatuh tempo", nilai: "Pengingat aktif" },
    { label: "Hari 30", nilai: "Jatuh tempo dan pelunasan" },
    { label: "Setelah lunas", nilai: "Transfer hasil ke pendana" },
    {
      teks: "Urutan ini menggambarkan proses, bukan komitmen jam kerja tertentu. Waktu aktual mengikuti kesepakatan, kelengkapan dokumen, dan proses verifikasi.",
      gaya: "kecil",
    },

    { jarak: 8 },
    { teks: "Langkah berikutnya", gaya: "seksi" },
    { garis: true },
    {
      teks: "Pembahasan dimulai dari percakapan, bukan dari penyetoran. Sampaikan nominal yang ingin ditempatkan dan pertanyaan yang perlu dijawab lebih dulu, lalu PINDAI menjelaskan alokasi yang tersedia pada saat itu.",
      gaya: "biasa",
    },
    {
      pita: {
        label: "Layanan pelanggan PINDAI",
        nilai: nomorLayananProposal(),
        catatan: "WhatsApp hanya untuk percakapan awal dan verifikasi.",
      },
    },
    {
      teks: `Tautan chat: wa.me/${CS_WHATSAPP}. Balasan diberikan pada hari kerja.`,
      gaya: "kecil",
    },
  ];

  return {
    judul: "PROPOSAL PENDANAAN & KEMITRAAN STRATEGIS",
    kop: {
      nama: NAMA_LAYANAN,
      keterangan: "Layanan pendanaan - proposal kemitraan strategis",
      referensi: "PROPOSAL PENDANAAN",
    },
    sampul: {
      judul: "Proposal pendanaan & kemitraan strategis",
      subjudul:
        "Pendanaan mikro berbasis agunan fisik untuk karyawan pabrik di koridor Karawang, Cikarang, Bekasi, Bogor, Sukabumi, dan Jakarta.",
      meta: `Diterbitkan ${tanggalProposal(data.dibuatPada)} / PINDAI / Untuk calon pendana`,
      fakta: [
        { nilai: `${TENOR_PENDANA_HARI} hari`, label: "Siklus pendanaan" },
        {
          nilai: `${PERSEN_IMBAL_PENDANA}%`,
          label: "Imbal Hasil per siklus",
        },
        { nilai: "300", label: "Nasabah aktif per bulan" },
      ],
      catatan: `Imbal Hasil dihitung dari pokok yang Anda danai, bukan dari bunga pinjaman peminjam. Porsi platform ${persen} diambil dari marjin pinjaman.`,
      isi: [
        "Ringkasan eksekutif dan target 2027",
        "Potensi pasar: TAM, SAM, dan SOM",
        "Skema pendanaan dan simulasi Rp 5 juta sampai Rp 50 juta",
        "Biaya platform, langkah preventif, dan risiko",
        "Alur kemitraan dan kontak layanan",
      ],
      penutup:
        "Pendanaan bukan tabungan. Baca bagian risiko sebelum menyetor, karena Imbal Hasil baru menjadi uang Anda setelah pinjaman lunas.",
      kaki: `Dokumen ini bukan perjanjian dan bukan jaminan hasil. Angka mengikuti kebijakan pada tanggal terbit dan dapat berubah untuk alokasi baru. Layanan pelanggan: WhatsApp ${nomorLayananProposal()}.`,
    },
    kaki: KAKI_DOKUMEN,
    baris,
  };
}
