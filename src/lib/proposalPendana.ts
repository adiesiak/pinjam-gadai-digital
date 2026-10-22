/**
 * Proposal pembagian hasil pendanaan: dokumen PDF yang bisa diunduh siapa pun
 * dari halaman "Jadi pendana", tanpa akun dan tanpa menunggu admin.
 *
 * Kenapa dokumennya disusun dari fungsi murni: halaman, unduhan, dan uji harus
 * memakai angka yang sama. Semua nominal di sini dihitung oleh
 * `lib/imbalPendana` dan `lib/bagiHasil`, modul yang juga dipakai server saat
 * mencatat hak pendana. Tidak ada persentase yang disalin ke teks: tenor,
 * Imbal Hasil, dan biaya platform dibaca dari konstanta atau dari Pengaturan
 * Sistem yang berlaku saat tombol unduh ditekan.
 *
 * Bentuk dokumennya meniru lembar penawaran, bukan cetakan tabel: satu sampul
 * dengan tiga angka kunci, lalu dua halaman isi dengan bagian yang dipisah
 * garis kuningan, satu pita angka untuk hasil bersih, dan tabel simulasi tiga
 * kolom. Bagian risiko tetap dicetak terbuka sebelum kontak, karena dokumen
 * yang hanya menjual angka tidak layak dipakai sebagai bahan pertimbangan.
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
const KAKI_DOKUMEN = "PINDAI - proposal pembagian hasil pendanaan";

/** Nominal yang diuraikan baris demi baris sebagai contoh utama. */
export const NOMINAL_CONTOH_PROPOSAL = 10_000_000;

/**
 * Nominal simulasi tambahan. Angkanya dipilih supaya calon pendana bisa
 * membandingkan skala kecil dan besar tanpa membuka kalkulator.
 */
export const NOMINAL_SIMULASI_PROPOSAL = [
  5_000_000, 25_000_000, 50_000_000, 100_000_000,
] as const;

export type DataProposalPendana = {
  /** Biaya platform (layanan) dari uang yang kembali, persen. */
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

/** Nama berkas unduhan, mis. `proposal-pembagian-pendanaan-2026-10-22.pdf`. */
export function namaBerkasProposalPendana(dibuatPada: number): string {
  return `proposal-pembagian-pendanaan-${tanggalIso(dibuatPada)}.pdf`;
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
 * Tiga halaman: sampul, lalu dua halaman isi. Urutan isinya mengikuti cara
 * calon pendana membaca: skema dan contoh angkanya, simulasi nominal, hak dan
 * kewajiban, lalu alur, risiko, dan kontak. Pemisah halaman ditetapkan
 * eksplisit supaya langkah alur tidak terpotong di tengah halaman.
 */
export function proposalPembagianPendana(
  data: DataProposalPendana,
): DokumenPdf {
  const persen = formatPersen(data.persenPotonganAdmin);
  const contoh = bagiHasilPendana(
    NOMINAL_CONTOH_PROPOSAL,
    data.persenPotonganAdmin,
  );

  const simulasi: BarisPdf[] = [];
  for (const pokok of NOMINAL_SIMULASI_PROPOSAL) {
    const bagi = bagiHasilPendana(pokok, data.persenPotonganAdmin);
    simulasi.push({
      kolom: {
        kiri: rupiah(pokok),
        tengah: rupiah(bagi.imbal),
        kanan: rupiah(bagi.diterima),
      },
    });
  }

  const baris: BarisPdf[] = [
    { teks: "Ringkasan skema", gaya: "seksi" },
    { garis: true },
    { label: "Siklus pendanaan", nilai: `${TENOR_PENDANA_HARI} hari` },
    {
      label: "Imbal Hasil pendana",
      nilai: `${PERSEN_IMBAL_PENDANA}% flat per siklus`,
    },
    { label: "Dasar Imbal Hasil", nilai: "Pokok yang Anda danai" },
    {
      label: "Biaya platform (layanan)",
      nilai: `${persen} dari uang yang kembali`,
    },
    {
      label: "Pembayaran hasil",
      nilai: "Setelah pinjaman lunas dan transfer dicatat",
    },
    { label: "Pemetaan dana", nilai: "Satu pinjaman untuk satu pendana" },
    { jarak: 6 },
    {
      teks: `Imbal Hasil ${PERSEN_IMBAL_PENDANA}% dihitung dari pokok pendanaan, bukan dari bunga pinjaman peminjam. Perpanjangan tenor, perubahan bunga, atau cicilan pokok di sisi peminjam tidak mengubah hak pendana.`,
      gaya: "kecil",
    },

    { jarak: 14 },
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
      label: `Biaya platform (layanan) ${persen}`,
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
      teks: `Biaya platform dihitung dari uang yang kembali (pokok + Imbal Hasil), bukan dari Imbal Hasil saja. Karena itu pokok kembali utuh, sedangkan keuntungan bersih lebih kecil dari Imbal Hasil ${PERSEN_IMBAL_PENDANA}%.`,
      gaya: "kecil",
    },

    { jarak: 14 },
    { teks: "Simulasi nominal", gaya: "seksi" },
    { garis: true },
    {
      kolom: {
        kiri: "Nominal",
        tengah: "Imbal Hasil",
        kanan: "Diterima bersih",
      },
      tebal: true,
    },
    ...simulasi,
    {
      teks: "Semua simulasi memakai Imbal Hasil dan biaya platform yang sama dengan contoh di atas.",
      gaya: "kecil",
    },

    { jarak: 10 },
    { teks: "Hak dan kewajiban", gaya: "seksi" },
    { garis: true },
    { teks: "Pendana", gaya: "tebal" },
    {
      teks: "Menyetor dana sesuai kesepakatan, menerima pokok dan Imbal Hasil setelah pinjaman lunas, dan tidak dapat menarik dana selama pinjaman masih berjalan.",
      gaya: "biasa",
    },
    { teks: "PINDAI", gaya: "tebal" },
    {
      teks: "Mencatat alokasi, memantau jatuh tempo, menagih pinjaman, dan mencatat transfer hasil. PINDAI tidak menjamin pembayaran peminjam.",
      gaya: "biasa",
    },

    // Halaman isi pertama berhenti setelah hak dan kewajiban. Sisa isi (alur,
    // risiko, kontak) pindah ke halaman kedua supaya tidak ada paragraf yang
    // terpotong hanya demi mengisi sisa kertas.
    { halamanBaru: true },
    { teks: "Alur pendanaan", gaya: "seksi" },
    { garis: true },
    { teks: "1. Pendaftaran dan penyetoran", gaya: "tebal" },
    {
      teks: "Admin PINDAI membuatkan akun setelah rencana pendanaan disepakati. Anda masuk dengan OTP email. Dana disetor ke rekening usaha PINDAI di luar aplikasi. Aplikasi tidak memindahkan uang.",
      gaya: "biasa",
    },
    { teks: "2. Alokasi ke satu pinjaman", gaya: "tebal" },
    {
      teks: "Admin mencatat alokasi pada satu pinjaman yang identitas dan tujuannya sudah tercatat. Hak pendana disimpan terpisah dari kontrak peminjam.",
      gaya: "biasa",
    },
    { teks: "3. Berjalan sampai lunas", gaya: "tebal" },
    {
      teks: `Pinjaman berjalan sesuai tenor peminjam, sedangkan hak Anda tetap mengikuti siklus ${TENOR_PENDANA_HARI} hari. Setelah pinjaman lunas, keuntungan pendana dibukukan.`,
      gaya: "biasa",
    },
    { teks: "4. Transfer hasil", gaya: "tebal" },
    {
      teks: "Admin mentransfer hasil di luar aplikasi lalu mencatatnya. Tidak ada pemindahan dana otomatis. Catatan transfer bukan bukti mutasi bank.",
      gaya: "biasa",
    },

    { jarak: 8 },
    { teks: "Risiko yang perlu Anda baca", gaya: "seksi" },
    { garis: true },
    {
      teks: "Modal berisiko. Jika peminjam gagal bayar, pokok dan Imbal Hasil tidak kembali. Tidak ada jaminan dari LPS, asuransi, atau pihak ketiga.",
      gaya: "biasa",
    },
    {
      teks: "Konsentrasi. Satu pinjaman hanya didanai satu pendana, sehingga seluruh pokok pada satu alokasi tertahan pada satu peminjam.",
      gaya: "biasa",
    },
    {
      teks: `Waktu pembayaran. Siklus ${TENOR_PENDANA_HARI} hari adalah acuan hak pendana, bukan jadwal penagihan. Keterlambatan peminjam menunda pencairan hasil.`,
      gaya: "biasa",
    },

    { jarak: 8 },
    { teks: "Cara memulai", gaya: "seksi" },
    { garis: true },
    {
      teks: `Hubungi layanan pelanggan PINDAI di WhatsApp ${nomorLayananProposal()} untuk membahas rencana nominal, sumber dana, dan rekening pengembalian. Admin menjelaskan syarat dan langkah sebelum akun dibuat.`,
      gaya: "biasa",
    },
    { jarak: 8 },
    {
      teks: "Dokumen ini dibuat otomatis dari kebijakan aplikasi pada tanggal terbit. Rincian angkanya dapat diperiksa ulang di halaman Jadi pendana.",
      gaya: "kecil",
    },
  ];

  return {
    kop: {
      nama: NAMA_LAYANAN,
      keterangan: "Layanan pendanaan - proposal pembagian hasil",
      referensi: "PROPOSAL PENDANAAN",
    },
    sampul: {
      judul: "Pembagian hasil pendanaan",
      subjudul:
        "Skema pendanaan PINDAI untuk calon pendana. Satu pinjaman, satu pendana, dan pembagian yang tertulis sejak awal.",
      meta: `Diterbitkan ${tanggalProposal(data.dibuatPada)} / PINDAI / Untuk calon pendana`,
      fakta: [
        { nilai: `${TENOR_PENDANA_HARI} hari`, label: "Siklus pendanaan" },
        {
          nilai: `${PERSEN_IMBAL_PENDANA}%`,
          label: "Imbal Hasil per siklus",
        },
        { nilai: persen, label: "Biaya platform" },
      ],
      catatan:
        "Imbal Hasil dihitung dari pokok yang Anda danai, bukan dari bunga pinjaman peminjam. Biaya platform diambil dari uang yang kembali, setelah pinjaman lunas.",
      isi: [
        "Ringkasan skema dan syarat pembayaran",
        `Contoh pembagian ${rupiah(NOMINAL_CONTOH_PROPOSAL)} baris demi baris`,
        "Simulasi nominal Rp 5 juta sampai Rp 100 juta",
        "Hak, kewajiban, alur, dan risiko pendanaan",
        "Cara memulai dan kontak layanan",
      ],
      penutup:
        "Pendanaan bukan tabungan. Baca bagian risiko sebelum menyetor, karena Imbal Hasil baru menjadi uang Anda setelah pinjaman lunas.",
      kaki: `Dokumen ini bukan perjanjian dan bukan jaminan hasil. Angka mengikuti kebijakan yang berlaku pada tanggal terbit dan dapat berubah untuk alokasi baru. Layanan pelanggan: WhatsApp ${nomorLayananProposal()}.`,
    },
    kaki: KAKI_DOKUMEN,
    baris,
  };
}
