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
 * Isinya sengaja berbentuk lembar penawaran, bukan iklan: skema, contoh
 * perhitungan, simulasi nominal, alur uang, hak dan kewajiban, lalu risiko.
 * Bagian risiko tidak boleh dihapus agar berkas ini tetap jujur dipakai
 * sebagai bahan pertimbangan calon pendana.
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
const KAKI_DOKUMEN =
  "PINDAI - proposal pembagian hasil pendanaan, bukan perjanjian";

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
  /** Waktu dokumen disusun (epoch ms); dipakai di kop dan nama berkas. */
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
 * Urutan bagian mengikuti cara calon pendana membaca: apa skemanya, berapa
 * hasilnya, bagaimana uang bergerak, apa haknya, lalu apa risikonya. Risiko
 * diletakkan sebelum kontak, bukan di catatan kaki, supaya keputusan diambil
 * setelah pembaca melihat sisi yang tidak menguntungkan.
 */
export function proposalPembagianPendana(
  data: DataProposalPendana,
): DokumenPdf {
  const contoh = bagiHasilPendana(
    NOMINAL_CONTOH_PROPOSAL,
    data.persenPotonganAdmin,
  );
  const persen = formatPersen(data.persenPotonganAdmin);

  const simulasi: BarisPdf[] = [];
  for (const pokok of NOMINAL_SIMULASI_PROPOSAL) {
    const bagi = bagiHasilPendana(pokok, data.persenPotonganAdmin);
    simulasi.push(
      { teks: rupiah(pokok), gaya: "seksi" },
      {
        label: `Imbal Hasil (${PERSEN_IMBAL_PENDANA}%)`,
        nilai: rupiah(bagi.imbal),
      },
      {
        label: `Biaya platform (${persen})`,
        nilai: rupiah(bagi.potonganAdmin),
      },
      { label: "Diterima bersih", nilai: rupiah(bagi.diterima), tebal: true },
      {
        label: "Keuntungan bersih",
        nilai: rupiah(bagi.keuntungan),
        tebal: true,
      },
    );
  }

  const baris: BarisPdf[] = [
    { teks: "Proposal pembagian hasil pendanaan", gaya: "judul" },
    {
      teks: "Skema pendanaan PINDAI untuk calon pendana",
      gaya: "subjudul",
    },
    {
      teks: `Diterbitkan ${tanggalProposal(data.dibuatPada)} dari kebijakan yang berlaku di aplikasi`,
      gaya: "kecil",
    },
    { garis: true },

    { teks: "Ringkasan skema", gaya: "seksi" },
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
    { kosong: true },
    {
      teks: `Imbal Hasil ${PERSEN_IMBAL_PENDANA}% dihitung dari pokok pendanaan, bukan dari bunga pinjaman peminjam. Perpanjangan tenor, perubahan bunga, atau cicilan pokok di sisi peminjam tidak mengubah hak pendana.`,
      gaya: "biasa",
    },

    {
      teks: `Contoh pembagian ${rupiah(NOMINAL_CONTOH_PROPOSAL)}`,
      gaya: "seksi",
    },
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
    { label: "Diterima bersih", nilai: rupiah(contoh.diterima), tebal: true },
    {
      label: "Keuntungan bersih",
      nilai: rupiah(contoh.keuntungan),
      tebal: true,
    },
    { kosong: true },
    {
      teks: `Biaya platform dihitung dari uang yang kembali (pokok + Imbal Hasil), bukan dari Imbal Hasil saja. Karena itu pokok kembali utuh, sedangkan keuntungan bersih lebih kecil dari Imbal Hasil ${PERSEN_IMBAL_PENDANA}% yang tercatat.`,
      gaya: "kecil",
    },

    { teks: "Simulasi nominal lain", gaya: "seksi" },
    {
      teks: "Angka di bawah memakai biaya platform dan Imbal Hasil yang sama dengan contoh di atas.",
      gaya: "kecil",
    },
    ...simulasi,

    { teks: "Alur pendanaan", gaya: "seksi" },
    {
      teks: "1. Pendaftaran. Admin PINDAI membuatkan akun pendana setelah rencana pendanaan disepakati. Anda masuk dengan OTP email.",
      gaya: "biasa",
    },
    {
      teks: "2. Penyetoran. Dana disetor ke rekening usaha PINDAI di luar aplikasi. Aplikasi tidak memindahkan uang.",
      gaya: "biasa",
    },
    {
      teks: "3. Alokasi. Admin mencatat alokasi pada satu pinjaman yang identitas dan tujuannya sudah tercatat.",
      gaya: "biasa",
    },
    {
      teks: "4. Berjalan. Pinjaman berjalan sesuai tenor peminjam. Hak pendana tetap mengikuti siklus pendana.",
      gaya: "biasa",
    },
    {
      teks: "5. Pelunasan. Setelah pinjaman lunas, keuntungan pendana dibukukan sebagai hak Anda.",
      gaya: "biasa",
    },
    {
      teks: "6. Transfer. Admin mentransfer hasil di luar aplikasi lalu mencatatnya. Catatan transfer bukan bukti mutasi bank.",
      gaya: "biasa",
    },

    { teks: "Hak dan kewajiban", gaya: "seksi" },
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

    { teks: "Risiko yang perlu Anda baca", gaya: "seksi" },
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
    {
      teks: "Transfer manual. PINDAI tidak memindahkan dana otomatis, sehingga pencatatan bisa tertunda bila admin belum membuat catatan transfer.",
      gaya: "biasa",
    },
    {
      teks: "Dokumen ini bukan perjanjian dan bukan jaminan hasil. Angka mengikuti kebijakan yang berlaku pada tanggal terbit dan dapat berubah untuk alokasi baru.",
      gaya: "biasa",
    },

    { teks: "Cara memulai", gaya: "seksi" },
    {
      teks: `Hubungi layanan pelanggan PINDAI di WhatsApp ${nomorLayananProposal()} dan sampaikan bahwa Anda ingin menjadi pendana.`,
      gaya: "biasa",
    },
    {
      teks: "Siapkan rencana nominal pendanaan, sumber dana, dan rekening tujuan pengembalian. Admin akan menjelaskan syarat dan langkah sebelum akun dibuat.",
      gaya: "biasa",
    },
    { kosong: true },
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
    kaki: KAKI_DOKUMEN,
    baris,
  };
}
