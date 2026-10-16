/**
 * Isi laporan pendana: dua laporan yang dikirim sebagai PDF ke WhatsApp pemilik
 * akun pendana.
 *
 * Fungsi di berkas ini MURNI (tanpa Convex, React, maupun jaringan) supaya
 * kalimat dan angkanya bisa diuji sebagai skrip biasa, dan supaya tidak ada
 * salinan aturan kedua di dalam aksi pengiriman.
 *
 * Dua laporan, dua pertanyaan:
 *  1. `laporanPelunasan` menjawab "pinjaman saya yang mana yang baru lunas, dan
 *     berapa yang dibukukan" untuk SATU pinjaman, dikirim otomatis saat admin
 *     menandai lunas.
 *  2. `laporanPortofolio` menjawab "bagaimana posisi seluruh pendanaan saya"
 *     untuk SEMUA pinjaman atas nama pendana itu, dikirim saat ia memintanya.
 *
 * Istilahnya sengaja sama persis dengan ruang penyedia dana (Dana tersalurkan,
 * Keuntungan dibukukan, Keuntungan perkiraan, Biaya platform). Laporan ini
 * salinan angka yang sudah dibaca pendana di layar, jadi memakai kata lain akan
 * memaksa pembaca mencocokkan dua istilah untuk satu angka yang sama.
 */
import { formatRupiahAman } from "./money";
import { tanggalRingkas } from "./jatuhTempo";
import type { BarisPdf, DokumenPdf } from "./pdfSederhana";

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
  /** Biaya platform (layanan) atas pinjaman ini. */
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
  /** Biaya platform (layanan) atas pinjaman berjalan + lunas. */
  potonganAdmin: number;
  jumlahBerjalan: number;
  jumlahLunas: number;
  pinjamanBerjalan: BarisPortofolioPendana[];
  pinjamanLunas: BarisPortofolioPendana[];
  /** Pinjaman lunas yang catatan transfer keuntungannya belum dibuat admin. */
  transferBelumDicatat: number;
};

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
  return `laporan-pelunasan-${slug(nomorReferensi)}.pdf`;
}

/** Nama berkas lampiran laporan portofolio. */
export function namaBerkasPortofolio(dicetakPada: number): string {
  return `laporan-pendanaan-${tanggalIso(dicetakPada)}.pdf`;
}

/** Judul laporan pelunasan, dipakai di PDF dan di keterangan pesan. */
export function judulPelunasan(): string {
  return "Laporan pelunasan pinjaman";
}

/**
 * Susun laporan pelunasan satu pinjaman.
 *
 * Urutan bagiannya mengikuti pertanyaan pendana: apa yang terjadi, kapan, lalu
 * berapa hasilnya. Status transfer disebut di akhir karena itu langkah
 * berikutnya yang bukan tanggung jawabnya, tetapi perlu ia ketahui.
 */
export function laporanPelunasan(data: DataPelunasanPendana): DokumenPdf {
  const baris: BarisPdf[] = [
    { teks: judulPelunasan(), gaya: "judul" },
    { teks: `${data.nomorReferensi} - ${data.namaPendana}`, gaya: "biasa" },
    { teks: `Dicetak ${tanggal(data.dicetakPada)} dari ruang penyedia dana`, gaya: "kecil" },
    { garis: true },
    { teks: "Pinjaman", gaya: "seksi" },
    { teks: `Nomor referensi: ${data.nomorReferensi}`, gaya: "biasa" },
    { teks: `Peminjam: ${data.namaPeminjam}`, gaya: "biasa" },
    { teks: `Dana tersalurkan (pokok): ${rupiah(data.pokokPinjaman)}`, gaya: "biasa" },
    { teks: `Tanggal dana tersalurkan: ${tanggal(data.didanaiPada)}`, gaya: "biasa" },
    { teks: `Tanggal lunas: ${tanggal(data.lunasPada)}`, gaya: "biasa" },
    { kosong: true },
    { teks: "Hasil untuk Anda", gaya: "seksi" },
    { teks: `Keuntungan pendana (dibukukan): ${rupiah(data.keuntunganPendana)}`, gaya: "tebal" },
    { teks: `Total kewajiban peminjam: ${rupiah(data.totalLunas)}`, gaya: "biasa" },
    { teks: `Biaya platform (layanan): ${rupiah(data.potonganAdmin)}`, gaya: "biasa" },
    { kosong: true },
    {
      teks: data.transferDicatat
        ? "Catatan transfer keuntungan sudah dibuat admin."
        : "Catatan transfer keuntungan belum dibuat admin. Keuntungan di atas tercatat lunas, tetapi pencairannya masih menunggu catatan transfer.",
      gaya: "kecil",
    },
    {
      teks: "Angka di laporan ini dihitung dari pinjaman yang alokasinya atas nama akun penerima, sama dengan yang tampil di ruang penyedia dana.",
      gaya: "kecil",
    },
  ];
  return { kaki: "PINDAI", baris };
}

/** Potongan baris pinjaman untuk bagian daftar (berjalan atau lunas). */
function barisDaftar(judul: string, nominal: string, kumpulan: BarisPortofolioPendana[]): BarisPdf[] {
  const hasil: BarisPdf[] = [{ teks: judul, gaya: "seksi" }];
  if (kumpulan.length === 0) {
    hasil.push({ teks: "Belum ada pinjaman pada bagian ini.", gaya: "biasa" });
    return hasil;
  }
  for (const p of kumpulan.slice(0, BATAS_PINJAMAN_LAPORAN)) {
    hasil.push({
      teks: `${p.nomorReferensi} - ${p.namaPeminjam} - pokok ${rupiah(p.pokokPinjaman)} - ${nominal} ${rupiah(p.keuntunganPendana)} - ${tanggal(p.tanggal)}`,
      gaya: "kecil",
    });
  }
  if (kumpulan.length > BATAS_PINJAMAN_LAPORAN) {
    hasil.push({
      teks: `Dan ${kumpulan.length - BATAS_PINJAMAN_LAPORAN} pinjaman lain pada bagian ini. Daftar lengkapnya ada di ruang penyedia dana.`,
      gaya: "kecil",
    });
  }
  return hasil;
}

/**
 * Susun laporan portofolio seluruh pendanaan satu pendana.
 *
 * Angka ringkasannya datang dari ruang penyedia dana, bukan dihitung ulang di
 * sini: laporan yang angkanya sedikit berbeda dari layar akan membuat pemiliknya
 * kehilangan kepercayaan pada kedua tempat sekaligus.
 */
export function laporanPortofolio(data: DataPortofolioPendana): DokumenPdf {
  const baris: BarisPdf[] = [
    { teks: "Laporan kinerja pendanaan", gaya: "judul" },
    { teks: `Pendana: ${data.namaPendana}`, gaya: "biasa" },
    { teks: `Dicetak ${tanggal(data.dicetakPada)} dari ruang penyedia dana`, gaya: "kecil" },
    { garis: true },
    { teks: "Ringkasan", gaya: "seksi" },
    { teks: `Dana tersalurkan: ${rupiah(data.totalDisalurkan)}`, gaya: "biasa" },
    { teks: `Masih berjalan: ${rupiah(data.saldoBerjalan)} (${data.jumlahBerjalan} pinjaman)`, gaya: "biasa" },
    { teks: `Keuntungan dibukukan (lunas): ${rupiah(data.keuntunganDibukukan)}`, gaya: "biasa" },
    {
      teks: `Keuntungan perkiraan (belum lunas): ${rupiah(data.keuntunganPerkiraan)}`,
      gaya: "biasa",
    },
    { teks: `Total keuntungan pendana: ${rupiah(data.totalKeuntungan)}`, gaya: "tebal" },
    { teks: `Biaya platform (layanan): ${rupiah(data.potonganAdmin)}`, gaya: "biasa" },
    { teks: `Pinjaman lunas: ${data.jumlahLunas}`, gaya: "biasa" },
    { kosong: true },
    ...barisDaftar("Pinjaman berjalan", "perkiraan", data.pinjamanBerjalan),
    { kosong: true },
    ...barisDaftar("Pinjaman lunas", "dibukukan", data.pinjamanLunas),
    { kosong: true },
    {
      teks: "Keuntungan perkiraan dihitung dari pinjaman yang masih berjalan: angkanya baru menjadi uang saat pinjaman itu lunas.",
      gaya: "kecil",
    },
    {
      teks:
        data.transferBelumDicatat > 0
          ? `${data.transferBelumDicatat} pinjaman lunas sudah dibukukan, tetapi catatan transfer keuntungannya belum dibuat admin.`
          : "Seluruh keuntungan yang sudah dibukukan memiliki catatan transfer dari admin.",
      gaya: "kecil",
    },
  ];
  return { kaki: "PINDAI", baris };
}

/**
 * Keterangan pesan WhatsApp yang menemani lampiran.
 *
 * Sengaja pendek dan menunjuk lampirannya: pesan panjang dengan angka yang sama
 * dengan PDF membuat dua versi angka beredar di percakapan, dan yang salah
 * dibaca adalah yang paling akhir terlihat.
 */
export function pesanPelunasan(data: DataPelunasanPendana): string {
  const transfer = data.transferDicatat
    ? "Catatan transfer keuntungannya sudah dibuat admin."
    : "Catatan transfer keuntungannya belum dibuat admin.";
  return (
    `Halo ${data.namaPendana}, pinjaman ${data.nomorReferensi} atas nama ${data.namaPeminjam} ` +
    `tercatat lunas pada ${tanggal(data.lunasPada)}. ` +
    `Keuntungan yang dibukukan untuk Anda ${rupiah(data.keuntunganPendana)}. ` +
    `${transfer} Rincian lengkapnya ada di lampiran PDF.`
  );
}

/** Keterangan pesan WhatsApp untuk laporan portofolio. */
export function pesanPortofolio(data: DataPortofolioPendana): string {
  return (
    `Halo ${data.namaPendana}, ini salinan laporan kinerja pendanaan Anda per ${tanggal(data.dicetakPada)}. ` +
    `Dana tersalurkan ${rupiah(data.totalDisalurkan)}, keuntungan dibukukan ${rupiah(data.keuntunganDibukukan)}, ` +
    `perkiraan dari pinjaman berjalan ${rupiah(data.keuntunganPerkiraan)}. ` +
    `Angka lengkap per pinjaman ada di lampiran PDF.`
  );
}
