/**
 * SURAT SOMASI — isi surat penagihan untuk pinjaman yang sudah melewati
 * jatuh tempo.
 *
 * Satu sumber untuk pratinjau di layar dan berkas PDF. Semua nominal datang
 * dari `pelunasanPinjaman` (mesin yang sama dengan dashboard penagihan), bukan
 * dihitung ulang di sini.
 *
 * Batas isi surat: menyebut kewajiban, tenggat, dan langkah penyelesaian sesuai
 * perjanjian. Tidak ada ancaman, penyebaran data ke pihak lain, atau janji yang
 * tidak bisa ditepati, karena surat ini bisa dibaca siapa pun yang menerimanya.
 */
import { formatRupiah } from "./money";
import { formatTanggalWIB, kodeTanggalWIB } from "./waktu";

const HARI_MS = 86_400_000;

/** Batas bayar bawaan: 7 hari kalender sejak tanggal surat. */
export const BATAS_BAYAR_HARI = 7;

export type RekeningPembayaran = {
  nama: string;
  bank: string;
  nomor: string;
};

export type DataSuratSomasi = {
  nomorReferensi: string;
  namaPeminjam: string;
  pokokPinjaman: number;
  jatuhTempoPada: number;
  hariTerlambat: number;
  dendaTerlambat: number;
  /** Pokok + bunga + denda pada saat surat dibuat. */
  totalKewajiban: number;
  /** Tarif denda berlaku (% pokok per hari) untuk label rincian. */
  persenDendaPerHari: number;
  /** Rekening usaha admin; null berarti instruksi pembayaran lewat petugas. */
  rekening: RekeningPembayaran | null;
};

export type OpsiSuratSomasi = {
  /** Waktu surat dibuat. */
  sekarang: number;
  /** Hari kalender sampai batas bayar. */
  batasHari?: number;
};

export type BarisRincianSomasi = { label: string; nilai: string };

export type SuratSomasi = {
  nomorSurat: string;
  perihal: string;
  tanggalTeks: string;
  batasBayarPada: number;
  batasBayarTeks: string;
  kepada: string;
  paragraf: string[];
  rincian: BarisRincianSomasi[];
  instruksiBayar: string[];
  penutup: string[];
  pembuat: string;
  dibuatPada: number;
};

/** Apakah pinjaman ini boleh dibuatkan somasi, beserta alasannya bila tidak. */
export function cekSomasi(data: {
  hariTerlambat: number;
  totalKewajiban: number | null;
}): { ok: true } | { ok: false; alasan: string } {
  if (!(data.hariTerlambat > 0)) {
    return {
      ok: false,
      alasan: "Pinjaman belum melewati jatuh tempo, jadi surat somasi belum dapat dibuat.",
    };
  }
  if (data.totalKewajiban === null || data.totalKewajiban <= 0) {
    return {
      ok: false,
      alasan: "Kewajiban pinjaman ini belum bisa dihitung, jadi surat somasi belum dapat dibuat.",
    };
  }
  return { ok: true };
}

/** Nomor surat: SOMASI/<referensi>/<YYYYMMDD> menurut kalender WIB. */
export function nomorSuratSomasi(nomorReferensi: string, sekarang: number): string {
  const referensi = nomorReferensi.trim().replace(/[^A-Za-z0-9-]/g, "-") || "PINDAI";
  return `SOMASI/${referensi}/${kodeTanggalWIB(sekarang)}`;
}

/** Nama berkas PDF; nomor referensi dipertahankan supaya mudah dicari. */
export function namaBerkasSomasi(surat: SuratSomasi): string {
  const referensi = surat.nomorSurat.split("/")[1] ?? "PINDAI";
  return `somasi-${referensi.toLowerCase()}.pdf`;
}

/**
 * Susun isi surat. Pemanggil WAJIB melewati `cekSomasi` lebih dulu; fungsi ini
 * tidak mengulang pemeriksaan bisnis, hanya menyusun kalimat dari angka yang
 * sudah dihitung server.
 */
export function susunSuratSomasi(
  data: DataSuratSomasi,
  opsi: OpsiSuratSomasi,
): SuratSomasi {
  const batasHari = opsi.batasHari ?? BATAS_BAYAR_HARI;
  const batasBayarPada = opsi.sekarang + batasHari * HARI_MS;
  const tanggalTeks = formatTanggalWIB(opsi.sekarang);
  const jatuhTempoTeks = formatTanggalWIB(data.jatuhTempoPada);
  const batasBayarTeks = formatTanggalWIB(batasBayarPada);
  const ref = data.nomorReferensi;

  // Baris bunga/biaya hanya muncul bila memang ada, supaya jumlah baris di
  // surat benar-benar sama dengan total yang ditagih.
  const bungaBiaya = data.totalKewajiban - data.pokokPinjaman - data.dendaTerlambat;
  const rincian: BarisRincianSomasi[] = [
    { label: "Pokok pinjaman", nilai: formatRupiah(data.pokokPinjaman) },
    ...(bungaBiaya > 0
      ? [{ label: "Bunga dan biaya tercatat", nilai: formatRupiah(bungaBiaya) }]
      : []),
    {
      label: `Denda keterlambatan (${data.hariTerlambat} hari${
        data.persenDendaPerHari > 0 ? `, ${data.persenDendaPerHari}% dari pokok per hari` : ""
      })`,
      nilai: formatRupiah(data.dendaTerlambat),
    },
    { label: "Total yang harus dibayar", nilai: formatRupiah(data.totalKewajiban) },
  ];

  const instruksiBayar: string[] = [];
  if (data.rekening !== null) {
    const tujuan =
      data.rekening.bank.trim() === ""
        ? data.rekening.nomor
        : `${data.rekening.bank} ${data.rekening.nomor}`;
    instruksiBayar.push(
      `Transfer ke rekening usaha ${tujuan} atas nama ${data.rekening.nama}.`,
    );
    instruksiBayar.push(
      `Cantumkan nomor referensi ${ref} pada berita transfer agar pembayaran mudah dicocokkan.`,
    );
    instruksiBayar.push(
      "Simpan bukti transfer dan unggah melalui menu Bantuan di aplikasi PINDAI supaya pembayaran dicatat petugas.",
    );
  } else {
    instruksiBayar.push(
      "Hubungi petugas melalui menu Bantuan di aplikasi PINDAI untuk memperoleh instruksi pembayaran yang berlaku.",
    );
    instruksiBayar.push(
      `Sebutkan nomor referensi ${ref} saat menghubungi petugas agar catatan pinjaman Anda ditemukan.`,
    );
  }

  return {
    nomorSurat: nomorSuratSomasi(ref, opsi.sekarang),
    perihal: "Somasi keterlambatan pembayaran pinjaman",
    tanggalTeks,
    batasBayarPada,
    batasBayarTeks,
    kepada: data.namaPeminjam,
    paragraf: [
      `Dengan hormat, kami menyampaikan pemberitahuan keterlambatan pembayaran pinjaman ${ref} atas nama ${data.namaPeminjam}.`,
      `Berdasarkan catatan internal PINDAI, pinjaman ini telah melewati jatuh tempo pada ${jatuhTempoTeks} dan belum tercatat lunas sampai surat ini dibuat pada ${tanggalTeks}. Keterlambatan tercatat ${data.hariTerlambat} hari.`,
      "Rincian kewajiban pada saat surat ini dibuat adalah sebagai berikut.",
    ],
    rincian,
    instruksiBayar,
    penutup: [
      `Kami meminta Anda menyelesaikan total kewajiban tersebut paling lambat ${batasBayarTeks} (${batasHari} hari kalender sejak tanggal surat).`,
      "Bila batas waktu tersebut terlewati tanpa pembayaran atau kesepakatan tertulis, keterlambatan tetap tercatat dan PINDAI akan menempuh langkah penyelesaian sesuai perjanjian pinjaman dan ketentuan yang berlaku. Kami tetap membuka ruang pembicaraan untuk penjadwalan ulang pembayaran.",
      "Tanggapan, sanggahan, atau pengaduan dapat disampaikan melalui menu Bantuan di aplikasi PINDAI.",
      "Surat ini dibuat berdasarkan catatan internal PINDAI dan bukan putusan pengadilan. Surat ini tidak mengurangi hak Anda untuk menyampaikan sanggahan atau pengaduan.",
      "PINDAI tidak pernah meminta kode OTP, PIN, atau kata sandi melalui WhatsApp maupun email.",
    ],
    pembuat: "Tim Penagihan PINDAI",
    dibuatPada: opsi.sekarang,
  };
}
