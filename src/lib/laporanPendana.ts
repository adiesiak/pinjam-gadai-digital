/**
 * Isi laporan pendana: tiga dokumen PDF yang keluar dari ruang penyedia dana.
 *
 * Fungsi di berkas ini MURNI (tanpa Convex, React, maupun jaringan) supaya
 * kalimat dan angkanya bisa diuji sebagai skrip biasa, dan supaya tidak ada
 * salinan aturan kedua di dalam aksi pengiriman.
 *
 * Tiga laporan, tiga pertanyaan:
 *  1. `laporanPelunasan` menjawab "pinjaman saya yang mana yang baru lunas, dan
 *     berapa yang dibukukan" untuk SATU pinjaman, dikirim otomatis saat admin
 *     menandai lunas.
 *  2. `laporanPortofolio` menjawab "bagaimana posisi seluruh pendanaan saya"
 *     untuk SEMUA pinjaman atas nama pendana itu, dikirim saat ia memintanya.
 *  3. `laporanRekapPendana` menjawab "bagaimana posisi semua pendana" untuk
 *     Super Admin: satu berkas berisi angka seluruh pendana, bisa diunduh atau
 *     dikirim ke WhatsApp.
 *
 * Istilahnya sengaja sama persis dengan ruang penyedia dana (Dana tersalurkan,
 * Keuntungan dibukukan, Keuntungan perkiraan, Porsi platform). Laporan ini
 * salinan angka yang sudah dibaca pendana di layar, jadi memakai kata lain akan
 * memaksa pembaca mencocokkan dua istilah untuk satu angka yang sama.
 *
 * Nama peminjam SELALU disamarkan di laporan yang dibaca pendana. Penyamaran
 * dilakukan di sini, bukan di pemanggil, supaya jalur unduhan, lampiran
 * WhatsApp, dan pesan teks tidak pernah memakai aturan yang berbeda.
 */
import { imbalPendana } from "./imbalPendana";
import { formatRupiahAman } from "./money";
import { tanggalRingkas } from "./jatuhTempo";
import { samarkanNama } from "./nama";
import type {
  BarisTabelResmi,
  BlokResmiPdf,
  DokumenResmiPdf,
} from "./pdfSederhana";
import type { SumberPendana, TotalPendana } from "./tabelPendana";

/**
 * Batas jumlah baris pinjaman yang dicetak per bagian.
 *
 * Bukan batas teknis: gateway WhatsApp membatasi ukuran lampiran (di bawah
 * 4 MB), sedangkan laporan ini jauh lebih kecil. Batasnya untuk keterbacaan dan
 * untuk menjaga laporan tetap bisa dibaca di layar ponsel. Sisa barisnya
 * disebutkan jumlahnya, bukan dihilangkan diam-diam.
 */
export const BATAS_PINJAMAN_LAPORAN = 25;

/** Data satu pinjaman yang baru dicatat lunas. */
export type DataPelunasanPendana = {
  namaPendana: string;
  nomorReferensi: string;
  namaPeminjam: string;
  pokokPinjaman: number;
  /** Total kewajiban peminjam (pokok + bunga). */
  totalLunas: number;
  /** Porsi platform (13/60 marjin) atas pinjaman ini. */
  potonganAdmin: number;
  /** Keuntungan pendana yang dibukukan dari pinjaman ini. */
  keuntunganPendana: number;
  didanaiPada: number | null;
  lunasPada: number;
  /** Apakah admin sudah mencatat transfer keuntungannya. */
  transferDicatat: boolean;
  dicetakPada: number;
};

/** Satu baris pinjaman di laporan portofolio. */
export type BarisPortofolioPendana = {
  nomorReferensi: string;
  namaPeminjam: string;
  pokokPinjaman: number;
  keuntunganPendana: number;
  /** Tanggal acuan baris ini: pelunasan untuk lunas, pendanaan untuk berjalan. */
  tanggal: number | null;
  /**
   * Jatuh tempo siklus pendana 30 hari — PROYEKSI tanggal return, bukan janji
   * pembayaran. Null bila siklus belum dimulai; laporan mengatakannya, tidak
   * mengarang.
   */
  tanggalReturn: number | null;
};

/** Angka ringkasan portofolio satu pendana (sumber: ruang penyedia dana). */
export type DataPortofolioPendana = {
  namaPendana: string;
  dicetakPada: number;
  totalDisalurkan: number;
  saldoBerjalan: number;
  keuntunganDibukukan: number;
  keuntunganPerkiraan: number;
  totalKeuntungan: number;
  /** Porsi platform (13/60 marjin) atas pinjaman berjalan + lunas. */
  potonganAdmin: number;
  jumlahBerjalan: number;
  jumlahLunas: number;
  pinjamanBerjalan: BarisPortofolioPendana[];
  pinjamanLunas: BarisPortofolioPendana[];
  /** Pinjaman lunas yang catatan transfer keuntungannya belum dibuat admin. */
  transferBelumDicatat: number;
};

/**
 * Data rekap seluruh pendana.
 *
 * `total` datang dari fungsi yang sama dengan baris total tabel di ruang
 * pendana (`totalPendana`), jadi jumlah di PDF tidak mungkin berbeda dari
 * jumlah yang bisa dibaca admin di layar.
 */
export type DataRekapPendana = {
  dicetakPada: number;
  baris: SumberPendana[];
  total: TotalPendana;
};

/**
 * Kaki halaman semua laporan berkop.
 *
 * Berisi identitas penerbit, bukan nomor halaman: nomor halaman dicetak
 * terpisah di kanan oleh penulis PDF, dan menyebutnya dua kali hanya membuat
 * baris kaki penuh.
 */
const KAKI_LAPORAN = "PINDAI - dokumen dibuat otomatis oleh sistem";

function rupiah(nilai: number): string {
  return formatRupiahAman(nilai);
}

function tanggal(ms: number | null): string {
  return ms === null ? "belum tercatat" : tanggalRingkas(ms);
}

/** Tanggal ISO (YYYY-MM-DD) untuk nama berkas, dihitung dari UTC. */
function tanggalIso(ms: number): string {
  const d = new Date(ms);
  const bulan = String(d.getUTCMonth() + 1).padStart(2, "0");
  const hari = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${bulan}-${hari}`;
}

/** Ubah teks menjadi bagian nama berkas yang aman di semua sistem. */
function slug(teks: string): string {
  const bersih = teks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return bersih === "" ? "pinjaman" : bersih;
}

/** Nama berkas lampiran laporan pelunasan. */
export function namaBerkasPelunasan(nomorReferensi: string): string {
  return `PINDAI-Laporan-Pelunasan-${slug(nomorReferensi)}.pdf`;
}

/** Nama berkas lampiran laporan portofolio. */
export function namaBerkasPortofolio(
  dicetakPada: number,
  bhs: BahasaLaporan = "id",
): string {
  const awalan = bhs === "en" ? "PINDAI-Funding-Report" : "PINDAI-Laporan-Pendanaan";
  return `${awalan}-${tanggalIso(dicetakPada)}.pdf`;
}

/** Nama berkas rekap seluruh pendana. */
export function namaBerkasRekapPendana(dicetakPada: number): string {
  return `PINDAI-Rekap-Pendana-${tanggalIso(dicetakPada)}.pdf`;
}

/** Judul laporan pelunasan, dipakai di PDF dan di keterangan pesan. */
export function judulPelunasan(): string {
  return "Laporan pelunasan pinjaman";
}

/** Bahasa dokumen laporan pendana. */
export type BahasaLaporan = "id" | "en";

/**
 * Teks laporan dua bahasa.
 *
 * Angka, nama, dan status tetap dihitung di tempat yang sama; hanya label dan
 * kalimatnya yang berganti. Versi Indonesia adalah bawaan, sehingga pemanggil
 * lama dan uji lama tidak berubah.
 */
type TeksLaporan = {
  kaki: string;
  belumTercatat: string;
  dicetak: string;
  subPelunasan: string;
  kartuPendanaPinjaman: string;
  namaPendana: string;
  peminjam: string;
  nomorReferensi: string;
  status: string;
  lunas: string;
  kartuTanggalTransfer: string;
  danaTersalurkan: string;
  tanggalLunas: string;
  transferKeuntungan: string;
  sudahDicatat: string;
  belumDicatat: string;
  dicetakLabel: string;
  hasilUntukAnda: string;
  deskripsiNominal: readonly [string, string];
  keuntunganDibukukan: string;
  pokokTersalur: string;
  totalKewajiban: string;
  biayaPlatform: string;
  keuntunganCallout: string;
  diterimaBersih: string;
  transferSudah: string;
  transferBelum: string;
  catatan: string;
  poinPelunasan: readonly [string, string];
  judulDokPelunasan: string;
  subPortofolio: string;
  nomorDokPortofolio: string;
  pendana: string;
  jumlahPinjaman: string;
  berjalanKata: string;
  lunasKata: string;
  ringkasanDana: string;
  masihBerjalan: string;
  totalKeuntungan: string;
  ringkasanKeuntungan: string;
  keuntunganLunas: string;
  keuntunganPerkiraan: string;
  totalKeuntunganPendana: string;
  catatanPerkiraan: string;
  pinjamanBerjalan: string;
  pinjamanLunas: string;
  kosong: string;
  kepalaBerjalan: readonly [string, string, string, string, string, string, string];
  kepalaLunas: readonly [string, string, string, string, string, string, string];
  sisaLain: (n: number) => string;
  poinProyeksi: string;
  poinBiaya: string;
  poinTransferLunas: (n: number) => string;
  poinTransferSemua: string;
  poinNamaSamar: string;
  judulDokPortofolio: string;
};

const TEKS: Record<BahasaLaporan, TeksLaporan> = {
  id: {
    kaki: KAKI_LAPORAN,
    belumTercatat: "belum tercatat",
    dicetak: "Dicetak",
    subPelunasan: "Laporan Pelunasan Pendana",
    kartuPendanaPinjaman: "Pendana & Pinjaman",
    namaPendana: "Nama Pendana",
    peminjam: "Peminjam",
    nomorReferensi: "Nomor Referensi",
    status: "Status",
    lunas: "Lunas",
    kartuTanggalTransfer: "Tanggal & Transfer",
    danaTersalurkan: "Dana Tersalurkan",
    tanggalLunas: "Tanggal Lunas",
    transferKeuntungan: "Transfer Keuntungan",
    sudahDicatat: "Sudah dicatat",
    belumDicatat: "Belum dicatat",
    dicetakLabel: "Dicetak",
    hasilUntukAnda: "Hasil untuk Anda",
    deskripsiNominal: ["DESKRIPSI KOMPONEN", "NOMINAL"],
    keuntunganDibukukan: "Keuntungan pendana (dibukukan)",
    pokokTersalur: "Dana tersalurkan (pokok)",
    totalKewajiban: "Total kewajiban peminjam",
    biayaPlatform: "Porsi platform (13/60 marjin)",
    keuntunganCallout: "Keuntungan yang dibukukan",
    diterimaBersih: "Diterima bersih (pokok + keuntungan)",
    transferSudah: "Catatan transfer keuntungan sudah dibuat admin.",
    transferBelum:
      "Catatan transfer keuntungan belum dibuat admin. Keuntungan di atas sudah dibukukan, tetapi pencairannya masih menunggu catatan transfer.",
    catatan: "Catatan",
    poinPelunasan: [
      "Nama peminjam disamarkan. Angka di laporan ini dihitung dari pinjaman yang alokasinya atas nama akun penerima, sama dengan yang tampil di ruang penyedia dana.",
      "Laporan ini salinan catatan internal PINDAI, bukan bukti transfer bank.",
    ],
    judulDokPelunasan: "LAPORAN PELUNASAN",
    subPortofolio: "Laporan Kinerja Pendanaan",
    nomorDokPortofolio: "LAPORAN PENDANAAN",
    pendana: "Pendana",
    jumlahPinjaman: "Jumlah Pinjaman",
    berjalanKata: "berjalan",
    lunasKata: "lunas",
    ringkasanDana: "Ringkasan Dana",
    masihBerjalan: "Masih Berjalan",
    totalKeuntungan: "Total Keuntungan",
    ringkasanKeuntungan: "Ringkasan Keuntungan",
    keuntunganLunas: "Keuntungan dibukukan (lunas)",
    keuntunganPerkiraan: "Keuntungan perkiraan (belum lunas)",
    totalKeuntunganPendana: "Total keuntungan pendana",
    catatanPerkiraan:
      "Keuntungan perkiraan dihitung dari pinjaman yang masih berjalan dan baru menjadi uang saat pinjaman itu lunas.",
    pinjamanBerjalan: "Pinjaman Berjalan",
    pinjamanLunas: "Pinjaman Lunas",
    kosong: "Belum ada pinjaman pada bagian ini.",
    kepalaBerjalan: [
      "REFERENSI",
      "PEMINJAM",
      "POKOK",
      "PERKIRAAN",
      "BIAYA",
      "DITERIMA",
      "JATUH TEMPO",
    ],
    kepalaLunas: [
      "REFERENSI",
      "PEMINJAM",
      "POKOK",
      "DIBUKUKAN",
      "BIAYA",
      "DITERIMA",
      "TANGGAL LUNAS",
    ],
    sisaLain: (n) =>
      `Dan ${n} pinjaman lain pada bagian ini. Daftar lengkapnya ada di ruang penyedia dana.`,
    poinProyeksi:
      "Tanggal jatuh tempo adalah proyeksi return dari tenor pinjaman, bukan janji pembayaran. Pembayaran dapat lebih lambat bila peminjam menunggak.",
    poinBiaya:
      "Porsi platform per pinjaman dihitung 13/60 dari marjin pinjaman (Imbal Hasil), bukan biaya layanan. DITERIMA adalah pokok ditambah keuntungan bersih, bukan tambahan di atasnya.",
    poinTransferLunas: (n) =>
      `${n} pinjaman lunas sudah dibukukan, tetapi catatan transfer keuntungannya belum dibuat admin.`,
    poinTransferSemua:
      "Seluruh keuntungan yang sudah dibukukan memiliki catatan transfer dari admin.",
    poinNamaSamar:
      "Nama peminjam disamarkan. Daftar lengkap pinjaman dan statusnya ada di ruang penyedia dana.",
    judulDokPortofolio: "LAPORAN PENDANAAN",
  },
  en: {
    kaki: "PINDAI - automatically generated document",
    belumTercatat: "not recorded",
    dicetak: "Printed",
    subPelunasan: "Investor Settlement Report",
    kartuPendanaPinjaman: "Investor & Loan",
    namaPendana: "Investor",
    peminjam: "Borrower",
    nomorReferensi: "Reference Number",
    status: "Status",
    lunas: "Settled",
    kartuTanggalTransfer: "Dates & Transfer",
    danaTersalurkan: "Funds Disbursed",
    tanggalLunas: "Settled On",
    transferKeuntungan: "Profit Transfer",
    sudahDicatat: "Recorded",
    belumDicatat: "Not recorded",
    dicetakLabel: "Printed",
    hasilUntukAnda: "Your Return",
    deskripsiNominal: ["COMPONENT", "AMOUNT"],
    keuntunganDibukukan: "Investor profit (booked)",
    pokokTersalur: "Funds disbursed (principal)",
    totalKewajiban: "Total borrower obligation",
    biayaPlatform: "Platform fee (service)",
    keuntunganCallout: "Booked profit",
    diterimaBersih: "Net received (principal + profit)",
    transferSudah: "The admin has recorded the profit transfer.",
    transferBelum:
      "The admin has not recorded the profit transfer yet. The profit above is booked, but payout is waiting for the transfer record.",
    catatan: "Notes",
    poinPelunasan: [
      "Borrower names are masked. The figures in this report come from loans allocated to the receiving account, the same figures shown in the investor room.",
      "This report is a copy of PINDAI internal records, not a bank transfer receipt.",
    ],
    judulDokPelunasan: "SETTLEMENT REPORT",
    subPortofolio: "Funding Performance Report",
    nomorDokPortofolio: "FUNDING REPORT",
    pendana: "Investor",
    jumlahPinjaman: "Loans",
    berjalanKata: "active",
    lunasKata: "settled",
    ringkasanDana: "Fund Summary",
    masihBerjalan: "Still Active",
    totalKeuntungan: "Total Profit",
    ringkasanKeuntungan: "Profit Summary",
    keuntunganLunas: "Booked profit (settled)",
    keuntunganPerkiraan: "Estimated profit (not yet settled)",
    totalKeuntunganPendana: "Total investor profit",
    catatanPerkiraan:
      "Estimated profit comes from loans still running and only becomes cash when those loans are settled.",
    pinjamanBerjalan: "Active Loans",
    pinjamanLunas: "Settled Loans",
    kosong: "No loans in this section yet.",
    kepalaBerjalan: [
      "REFERENCE",
      "BORROWER",
      "PRINCIPAL",
      "ESTIMATE",
      "FEE",
      "RECEIVED",
      "DUE DATE",
    ],
    kepalaLunas: [
      "REFERENCE",
      "BORROWER",
      "PRINCIPAL",
      "BOOKED",
      "FEE",
      "RECEIVED",
      "SETTLED ON",
    ],
    sisaLain: (n) => `Plus ${n} more loans in this section. The full list is in the investor room.`,
    poinProyeksi:
      "Due dates are projected returns from the loan tenor, not a payment promise. Payment can be later when a borrower falls behind.",
    poinBiaya:
      "The platform fee per loan is charged on the total return (principal + profit share). RECEIVED is principal plus net profit, not an extra amount on top.",
    poinTransferLunas: (n) =>
      `${n} settled loans are booked, but the admin has not recorded their profit transfers yet.`,
    poinTransferSemua: "Every booked profit has a transfer record from the admin.",
    poinNamaSamar:
      "Borrower names are masked. The full loan list and statuses are in the investor room.",
    judulDokPortofolio: "FUNDING REPORT",
  },
};

/** Tanggal ringkas bahasa Inggris; jalur Indonesia tetap memakai `tanggalRingkas`. */
function tanggalBahasa(ms: number | null, bhs: BahasaLaporan): string {
  if (bhs === "id") return tanggal(ms);
  if (ms === null) return TEKS.en.belumTercatat;
  return new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

/**
 * Susun laporan pelunasan satu pinjaman.
 *
 * Urutan bagiannya mengikuti pertanyaan pendana: berapa hasilnya, pinjaman mana
 * yang melunasinya, lalu apa langkah berikutnya. Status transfer disebut di
 * akhir karena itu bukan tanggung jawabnya, tetapi perlu ia ketahui.
 */
export function laporanPelunasan(
  data: DataPelunasanPendana,
  bhs: BahasaLaporan = "id",
): DokumenResmiPdf {
  const t = TEKS[bhs];
  const blok: BlokResmiPdf[] = [
    {
      jenis: "banner",
      merek: "PINDAI",
      subjudul: t.subPelunasan,
      nomor: data.nomorReferensi,
      tanggal: `${t.dicetak} ${tanggalBahasa(data.dicetakPada, bhs)}`,
    },
    {
      jenis: "kartu",
      kiri: {
        judul: t.kartuPendanaPinjaman,
        baris: [
          { label: t.namaPendana, nilai: data.namaPendana },
          { label: t.peminjam, nilai: samarkanNama(data.namaPeminjam) },
          { label: t.nomorReferensi, nilai: data.nomorReferensi },
          { label: t.status, nilai: t.lunas, nada: "bersih" },
        ],
      },
      kanan: {
        judul: t.kartuTanggalTransfer,
        baris: [
          { label: t.danaTersalurkan, nilai: tanggalBahasa(data.didanaiPada, bhs) },
          { label: t.tanggalLunas, nilai: tanggalBahasa(data.lunasPada, bhs) },
          {
            label: t.transferKeuntungan,
            nilai: data.transferDicatat ? t.sudahDicatat : t.belumDicatat,
            ...(data.transferDicatat ? { nada: "bersih" as const } : { nada: "potongan" as const }),
          },
          { label: t.dicetakLabel, nilai: tanggalBahasa(data.dicetakPada, bhs) },
        ],
      },
    },
    { jenis: "judul", nomor: "1", teks: t.hasilUntukAnda },
    {
      jenis: "tabel",
      kepala: [...t.deskripsiNominal],
      bobot: [8, 2],
      rataKanan: [1],
      baris: [
        { sel: [t.keuntunganDibukukan, rupiah(data.keuntunganPendana)] },
        { sel: [t.pokokTersalur, rupiah(data.pokokPinjaman)] },
        { sel: [t.totalKewajiban, rupiah(data.totalLunas)] },
        { sel: [t.biayaPlatform, rupiah(data.potonganAdmin)] },
        {
          sel: [
            t.diterimaBersih,
            rupiah(data.pokokPinjaman + data.keuntunganPendana),
          ],
          tebal: true,
          nada: "bersih",
        },
      ],
    },
    {
      jenis: "callout",
      label: t.keuntunganCallout,
      nilai: rupiah(data.keuntunganPendana),
      catatan: data.transferDicatat ? t.transferSudah : t.transferBelum,
    },
    { jenis: "judul", nomor: "2", teks: t.catatan },
    {
      jenis: "poin",
      teks: [...t.poinPelunasan],
    },
  ];
  return {
    nomor: data.nomorReferensi,
    judul: t.judulDokPelunasan,
    kaki: t.kaki,
    blok,
  };
}

/**
 * Baris tabel daftar pinjaman. Nama peminjam disamarkan di sini, bukan di
 * pemanggil, supaya semua kanal memakai penyamaran yang sama.
 */
function barisDaftarPinjaman(
  kumpulan: BarisPortofolioPendana[],
  jenis: "berjalan" | "lunas",
  bhs: BahasaLaporan,
): { baris: BarisTabelResmi[]; sisa: number } {
  const tampil = kumpulan.slice(0, BATAS_PINJAMAN_LAPORAN);
  return {
    baris: tampil.map((p) => {
      // `keuntunganPendana` SUDAH bersih setelah porsi platform. Imbal bruto
      // memakai skema tetap 30%, jadi biaya per pinjaman = bruto - bersih.
      const imbalBruto = imbalPendana(p.pokokPinjaman);
      const biaya = Math.max(0, imbalBruto - p.keuntunganPendana);
      const diterima = p.pokokPinjaman + p.keuntunganPendana;
      return {
        sel: [
          p.nomorReferensi,
          samarkanNama(p.namaPeminjam),
          rupiah(p.pokokPinjaman),
          rupiah(p.keuntunganPendana),
          rupiah(biaya),
          rupiah(diterima),
          tanggalBahasa(jenis === "berjalan" ? p.tanggalReturn : p.tanggal, bhs),
        ],
      };
    }),
    sisa: kumpulan.length - tampil.length,
  };
}

/**
 * Susun laporan portofolio seluruh pendanaan satu pendana.
 *
 * Angka ringkasannya datang dari ruang penyedia dana, bukan dihitung ulang di
 * sini: laporan yang angkanya sedikit berbeda dari layar akan membuat pemiliknya
 * kehilangan kepercayaan pada kedua tempat sekaligus.
 */
export function laporanPortofolio(
  data: DataPortofolioPendana,
  bhs: BahasaLaporan = "id",
): DokumenResmiPdf {
  const t = TEKS[bhs];
  const berjalan = barisDaftarPinjaman(data.pinjamanBerjalan, "berjalan", bhs);
  const lunas = barisDaftarPinjaman(data.pinjamanLunas, "lunas", bhs);
  const blok: BlokResmiPdf[] = [
    {
      jenis: "banner",
      merek: "PINDAI",
      subjudul: t.subPortofolio,
      nomor: t.nomorDokPortofolio,
      tanggal: `${t.dicetak} ${tanggalBahasa(data.dicetakPada, bhs)}`,
    },
    {
      jenis: "kartu",
      kiri: {
        judul: t.pendana,
        baris: [
          { label: t.namaPendana, nilai: data.namaPendana },
          {
            label: t.jumlahPinjaman,
            nilai: `${data.jumlahBerjalan} ${t.berjalanKata} - ${data.jumlahLunas} ${t.lunasKata}`,
          },
          { label: t.dicetakLabel, nilai: tanggalBahasa(data.dicetakPada, bhs) },
        ],
      },
      kanan: {
        judul: t.ringkasanDana,
        baris: [
          { label: "Dana Tersalurkan", nilai: rupiah(data.totalDisalurkan) },
          {
            label: t.masihBerjalan,
            nilai: `${rupiah(data.saldoBerjalan)} (${data.jumlahBerjalan} pinjaman)`,
          },
          {
            label: t.totalKeuntungan,
            nilai: rupiah(data.totalKeuntungan),
            nada: "bersih",
          },
        ],
      },
    },
    { jenis: "judul", nomor: "1", teks: t.ringkasanKeuntungan },
    {
      jenis: "tabel",
      kepala: [...t.deskripsiNominal],
      bobot: [8, 2],
      rataKanan: [1],
      baris: [
        { sel: [t.keuntunganLunas, rupiah(data.keuntunganDibukukan)] },
        {
          sel: [t.keuntunganPerkiraan, rupiah(data.keuntunganPerkiraan)],
        },
        {
          sel: [t.totalKeuntunganPendana, rupiah(data.totalKeuntungan)],
          tebal: true,
          nada: "bersih",
        },
        { sel: ["Porsi platform (13/60 marjin)", rupiah(data.potonganAdmin)] },
      ],
    },
    {
      jenis: "callout",
      label: t.totalKeuntunganPendana,
      nilai: rupiah(data.totalKeuntungan),
      catatan: t.catatanPerkiraan,
    },
    { jenis: "judul", nomor: "2", teks: t.pinjamanBerjalan },
  ];

  if (berjalan.baris.length === 0) {
    blok.push({
      jenis: "paragraf",
      teks: t.kosong,
    });
  } else {
    blok.push({
      jenis: "tabel",
      kepala: [...t.kepalaBerjalan],
      bobot: [2.1, 1.7, 1.3, 1.2, 1.05, 1.3, 1.45],
      rataKanan: [2, 3, 4, 5],
      baris: berjalan.baris,
    });
    if (berjalan.sisa > 0) {
      blok.push({
        jenis: "paragraf",
        kecil: true,
        teks: t.sisaLain(berjalan.sisa),
      });
    }
  }

  blok.push({ jenis: "judul", nomor: "3", teks: t.pinjamanLunas });
  if (lunas.baris.length === 0) {
    blok.push({
      jenis: "paragraf",
      teks: t.kosong,
    });
  } else {
    blok.push({
      jenis: "tabel",
      kepala: [...t.kepalaLunas],
      bobot: [2.1, 1.7, 1.3, 1.2, 1.05, 1.3, 1.45],
      rataKanan: [2, 3, 4, 5],
      baris: lunas.baris,
    });
    if (lunas.sisa > 0) {
      blok.push({
        jenis: "paragraf",
        kecil: true,
        teks: t.sisaLain(lunas.sisa),
      });
    }
  }

  blok.push(
    { jenis: "judul", nomor: "4", teks: t.catatan },
    {
      jenis: "poin",
      teks: [
        t.poinProyeksi,
        t.poinBiaya,
        data.transferBelumDicatat > 0
          ? t.poinTransferLunas(data.transferBelumDicatat)
          : t.poinTransferSemua,
        t.poinNamaSamar,
      ],
    },
  );

  return {
    nomor: t.nomorDokPortofolio,
    judul: t.judulDokPortofolio,
    kaki: t.kaki,
    blok,
  };
}

/**
 * Susun rekap pinjaman seluruh pendana untuk Super Admin.
 *
 * Dokumen ini menjawab pertanyaan yang sama dengan tabel "Rekap Dana Pendana",
 * dalam bentuk yang bisa disimpan dan diteruskan. Tidak ada nama peminjam di
 * sini: rekap ini tentang posisi pendana, dan rincian pinjamannya sudah punya
 * dokumen sendiri di ruang masing-masing.
 */
export function laporanRekapPendana(data: DataRekapPendana): DokumenResmiPdf {
  const total = data.total;
  const blok: BlokResmiPdf[] = [
    {
      jenis: "banner",
      merek: "PINDAI",
      subjudul: "Rekap Pinjaman Semua Pendana",
      nomor: "KHUSUS SUPER ADMIN",
      tanggal: `Dicetak ${tanggal(data.dicetakPada)}`,
    },
    {
      jenis: "kartu",
      kiri: {
        judul: "Cakupan",
        baris: [
          { label: "Jumlah Pendana", nilai: String(total.jumlahPendana) },
          {
            label: "Jumlah Pinjaman",
            nilai: `${total.jumlahPinjaman} (${total.jumlahAktif} berjalan, ${total.jumlahLunas} lunas)`,
          },
          { label: "Dicetak", nilai: tanggal(data.dicetakPada) },
        ],
      },
      kanan: {
        judul: "Total Dana",
        baris: [
          { label: "Dana Tersalurkan", nilai: rupiah(total.totalDisalurkan) },
          { label: "Masih Berjalan", nilai: rupiah(total.saldoBerjalan) },
          {
            label: "Transfer Belum Dicatat",
            nilai: `${total.transferBelumDicatat} pinjaman - ${rupiah(total.keuntunganBelumDicatat)}`,
          },
        ],
      },
    },
    { jenis: "judul", nomor: "1", teks: "Total Seluruh Pendana" },
    {
      jenis: "tabel",
      kepala: ["DESKRIPSI KOMPONEN", "NOMINAL"],
      bobot: [8, 2],
      rataKanan: [1],
      baris: [
        {
          sel: ["Keuntungan dibukukan (lunas)", rupiah(total.keuntunganPendanaLunas)],
        },
        {
          sel: [
            "Keuntungan perkiraan (belum lunas)",
            rupiah(total.keuntunganPendanaBelumLunas),
          ],
        },
        {
          sel: ["Total keuntungan pendana", rupiah(total.keuntunganPendana)],
          tebal: true,
          nada: "bersih",
        },
        { sel: ["Porsi platform (13/60 marjin)", rupiah(total.keuntunganAdmin)] },
      ],
    },
    {
      jenis: "callout",
      label: "Total Keuntungan Pendana",
      nilai: rupiah(total.keuntunganPendana),
      catatan: `${total.jumlahPendana} pendana, ${total.jumlahPinjaman} pinjaman. Salinan rekap internal, bukan bukti transfer.`,
    },
    { jenis: "judul", nomor: "2", teks: "Rincian per Pendana" },
  ];

  if (data.baris.length === 0) {
    blok.push({ jenis: "paragraf", teks: "Belum ada pendana yang bisa direkap." });
  } else {
    blok.push({
      jenis: "tabel",
      kepala: [
        "PENDANA",
        "PINJAMAN",
        "TERSALURKAN",
        "BERJALAN",
        "DIBUKUKAN",
        "PERKIRAAN",
        "TOTAL",
      ],
      bobot: [2.3, 0.9, 1.5, 1.4, 1.4, 1.4, 1.4],
      rataKanan: [1, 2, 3, 4, 5, 6],
      baris: [
        ...data.baris.map((r) => ({
          sel: [
            r.nama,
            String(r.jumlahPinjaman),
            rupiah(r.totalDisalurkan),
            rupiah(r.saldoBerjalan),
            rupiah(r.keuntunganPendanaLunas),
            rupiah(r.keuntunganPendanaBelumLunas),
            rupiah(r.keuntunganPendana),
          ],
        })),
        {
          sel: [
            "TOTAL",
            String(total.jumlahPinjaman),
            rupiah(total.totalDisalurkan),
            rupiah(total.saldoBerjalan),
            rupiah(total.keuntunganPendanaLunas),
            rupiah(total.keuntunganPendanaBelumLunas),
            rupiah(total.keuntunganPendana),
          ],
          tebal: true,
          nada: "total" as const,
        },
      ],
    });
  }

  blok.push(
    { jenis: "judul", nomor: "3", teks: "Cara Membaca" },
    {
      jenis: "poin",
      teks: [
        "Model 1 pinjaman = 1 pendana. Setiap angka dihitung dari pinjaman yang tercatat atas nama pendana itu.",
        "Keuntungan perkiraan berasal dari pinjaman yang masih berjalan dan baru menjadi uang saat pinjaman lunas.",
        "Nama peminjam tidak dicantumkan di rekap ini. Rincian pinjaman per pendana ada di dokumen laporan pendana masing-masing.",
        "Porsi platform adalah bagian PINDAI, bukan bagian pendana; angkanya dicetak terpisah agar tidak tertukar dengan keuntungan pendana.",
      ],
    },
  );

  return {
    nomor: "REKAP PENDANA",
    judul: "REKAP PENDANA",
    kaki: KAKI_LAPORAN,
    blok,
  };
}

/** Baris tabel monospace: label di kiri, nominal rata kanan di kolom tetap. */
function barisRincian(label: string, nominal: number): string {
  return `${label.padEnd(18)}${rupiah(nominal).padStart(14)}`;
}

/**
 * Keterangan pesan WhatsApp laporan pelunasan — LENGKAP DI PESAN, tanpa lampiran.
 *
 * Dulu pesan ini hanya menyebut angka penting lalu menunjuk lampiran PDF.
 * Gateway yang dipakai tidak selalu benar-benar mengantarkan lampirannya,
 * sehingga pendana menerima janji "rincian ada di lampiran" tanpa berkas.
 * Sekarang seluruh rincian ada di badan pesan sebagai tabel monospace, jadi
 * tidak ada yang bergantung pada lampiran yang mungkin tidak sampai.
 */
export function pesanPelunasan(
  data: DataPelunasanPendana,
  bhs: BahasaLaporan = "id",
): string {
  // Yang diterima pendana = pokok yang ia danai + keuntungannya. Angka ini sah
  // untuk skema harian maupun bulanan, karena biaya layanan tidak termasuk.
  const diterima = data.pokokPinjaman + data.keuntunganPendana;

  if (bhs === "en") {
    const tabel = [
      "LOAN SETTLEMENT DETAIL",
      barisRincian("Principal", data.pokokPinjaman),
      barisRincian("Platform share", data.potonganAdmin),
      barisRincian("Your profit", data.keuntunganPendana),
      barisRincian("You receive", diterima),
    ].join("\n");
    const status = data.transferDicatat
      ? "The admin has recorded your profit transfer."
      : "The admin has not recorded your profit transfer yet.";
    const tanggalDana =
      data.didanaiPada === null
        ? ""
        : `Funded ${tanggalBahasa(data.didanaiPada, "en")} · Settled ${tanggalBahasa(data.lunasPada, "en")}\n`;
    return (
      `Hello ${data.namaPendana}, loan ${data.nomorReferensi} for ${samarkanNama(data.namaPeminjam)} ` +
      `was settled on ${tanggalBahasa(data.lunasPada, "en")}.\n\n` +
      `\`\`\`\n${tabel}\n\`\`\`\n\n` +
      tanggalDana +
      `${status}\n\n` +
      "These figures are the same as the ones shown in the PINDAI funding room."
    );
  }

  const tabel = [
    "RINCIAN PELUNASAN",
    barisRincian("Pokok pinjaman", data.pokokPinjaman),
    barisRincian("Porsi platform", data.potonganAdmin),
    barisRincian("Keuntungan Anda", data.keuntunganPendana),
    barisRincian("Anda terima", diterima),
  ].join("\n");
  const status = data.transferDicatat
    ? "Catatan transfer keuntungannya sudah dibuat admin."
    : "Catatan transfer keuntungannya belum dibuat admin.";
  const tanggalDana =
    data.didanaiPada === null
      ? ""
      : `Didanai ${tanggal(data.didanaiPada)} · Lunas ${tanggal(data.lunasPada)}\n`;
  return (
    `Halo ${data.namaPendana}, pinjaman ${data.nomorReferensi} atas nama ${samarkanNama(data.namaPeminjam)} ` +
    `tercatat LUNAS pada ${tanggal(data.lunasPada)}.\n\n` +
    `\`\`\`\n${tabel}\n\`\`\`\n\n` +
    tanggalDana +
    `${status}\n\n` +
    "Angka ini sama dengan yang tampil di ruang penyedia dana PINDAI."
  );
}

/**
 * Data CONTOH untuk mengirim format laporan ke CS.
 *
 * Sengaja bukan pinjaman nyata: yang diperiksa tampilan pesannya, bukan data
 * orang. Angkanya mengikuti kebijakan 47 : 13 pada pokok Rp1.000.000.
 */
export function contohDataPelunasan(sekarang = Date.now()): DataPelunasanPendana {
  const sehari = 24 * 60 * 60 * 1000;
  return {
    namaPendana: "Contoh Pendana",
    nomorReferensi: "PGD-CONTOH-0001",
    namaPeminjam: "Contoh Peminjam",
    pokokPinjaman: 1_000_000,
    totalLunas: 1_320_000,
    potonganAdmin: 69_333,
    keuntunganPendana: 250_667,
    didanaiPada: sekarang - 30 * sehari,
    lunasPada: sekarang,
    transferDicatat: false,
    dicetakPada: sekarang,
  };
}

/** Pembuka pesan contoh supaya penerimanya tahu ini bukan tagihan nyata. */
export const PEMBUKA_CONTOH_LAPORAN =
  "CONTOH format laporan pelunasan PINDAI. Angka di bawah ini data contoh, bukan pinjaman atau tagihan siapa pun.";

/**
 * Jatuh tempo terdekat dari pinjaman yang masih berjalan.
 *
 * Dipakai pesan WhatsApp supaya pendana tahu kapan return berikutnya
 * diperkirakan masuk tanpa membuka lampiran. Null bila tidak ada tanggal yang
 * terbaca — pesan tidak boleh mengarang tanggal.
 */
export function proyeksiReturnTerdekat(
  data: DataPortofolioPendana,
): number | null {
  const daftar = data.pinjamanBerjalan
    .map((p) => p.tanggalReturn)
    .filter((t): t is number => t !== null);
  return daftar.length === 0 ? null : Math.min(...daftar);
}

/** Keterangan pesan WhatsApp untuk laporan portofolio. */
export function pesanPortofolio(
  data: DataPortofolioPendana,
  bhs: BahasaLaporan = "id",
): string {
  const terdekat = proyeksiReturnTerdekat(data);
  if (bhs === "en") {
    const proyeksiEn =
      terdekat === null
        ? "No return date is projected from active loans yet. "
        : `Nearest projected return ${tanggalBahasa(terdekat, "en")}. `;
    return (
      `Hello ${data.namaPendana}, here is your funding performance report as of ${tanggalBahasa(data.dicetakPada, "en")}. ` +
      `Funds disbursed ${rupiah(data.totalDisalurkan)}, booked profit ${rupiah(data.keuntunganDibukukan)}, ` +
      `estimated from active loans ${rupiah(data.keuntunganPerkiraan)}. ` +
      proyeksiEn +
      "Full figures per loan are in the attached PDF."
    );
  }
  const proyeksi =
    terdekat === null
      ? "Belum ada proyeksi tanggal return dari pinjaman berjalan. "
      : `Proyeksi return terdekat ${tanggal(terdekat)}. `;
  return (
    `Halo ${data.namaPendana}, ini salinan laporan kinerja pendanaan Anda per ${tanggal(data.dicetakPada)}. ` +
    `Dana tersalurkan ${rupiah(data.totalDisalurkan)}, keuntungan dibukukan ${rupiah(data.keuntunganDibukukan)}, ` +
    `perkiraan dari pinjaman berjalan ${rupiah(data.keuntunganPerkiraan)}. ` +
    proyeksi +
    "Angka lengkap per pinjaman ada di lampiran PDF."
  );
}

/** Keterangan pesan WhatsApp untuk rekap seluruh pendana. */
export function pesanRekapPendana(data: DataRekapPendana): string {
  const total = data.total;
  return (
    `Rekap pinjaman seluruh pendana per ${tanggal(data.dicetakPada)}: ` +
    `${total.jumlahPendana} pendana, ${total.jumlahPinjaman} pinjaman. ` +
    `Dana tersalurkan ${rupiah(total.totalDisalurkan)}, keuntungan dibukukan ${rupiah(total.keuntunganPendanaLunas)}, ` +
    `perkiraan ${rupiah(total.keuntunganPendanaBelumLunas)}. ` +
    `Rincian per pendana ada di lampiran PDF.`
  );
}
