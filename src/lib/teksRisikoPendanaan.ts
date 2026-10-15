/**
 * Satu sumber teks risiko pendanaan: banner, dua belas poin panel risiko, dan
 * versi teksnya.
 *
 * Kenapa dikumpulkan di sini: teks ini muncul di dua permukaan (banner di atas
 * halaman dan panel "Risiko pendanaan"), dan persetujuan pendana disimpan per
 * VERSI teks. Kalau kalimatnya diubah, naikkan `RISK_TEXT_VERSION` supaya
 * pendana yang sudah menyetujui versi lama diminta menyetujui lagi. Teks yang
 * disetujui tidak boleh berbeda dari teks yang dibaca.
 *
 * Nada bahasa: awam, faktual, tanpa klaim yang tidak bisa dibuktikan. Kata
 * "jaminan" hanya dipakai dalam bentuk penyangkalan ("bukan jaminan",
 * "tidak dijamin").
 */

/** Versi teks risiko yang berlaku sekarang. Naikkan bila isinya berubah. */
export const RISK_TEXT_VERSION = 1;

/** Id jangkar panel risiko, dipakai tombol "Baca selengkapnya" di banner. */
export const ANCHOR_RISIKO_PENDANAAN = "risiko-pendanaan";

/** Judul panel risiko. */
export const JUDUL_RISIKO_PENDANAAN = "Risiko pendanaan";

/** Teks banner di bawah judul halaman. Tidak bisa ditutup permanen. */
export const TEKS_BANNER_RISIKO =
  "Semua bentuk pendanaan mengandung risiko. Pendanaan pinjaman tidak memberikan keuntungan yang pasti. Peminjam dapat terlambat atau gagal membayar, sehingga keuntungan maupun pokok dana dapat berkurang atau tidak kembali sama sekali. Angka estimasi di halaman ini bukan jaminan. Danai hanya dengan dana yang siap Anda tanggung risikonya.";

/** Satu poin risiko: nomor, judul singkat, dan penjelasan 1-2 kalimat. */
export type PoinRisiko = {
  nomor: number;
  judul: string;
  isi: string;
};

/** Dua belas poin risiko pendanaan, bahasa awam, satu topik per poin. */
export const POIN_RISIKO_PENDANAAN: readonly PoinRisiko[] = [
  {
    nomor: 1,
    judul: "Gagal bayar",
    isi: "Peminjam bisa tidak membayar sama sekali. Kalau itu terjadi, pokok dana yang Anda danai tidak kembali dan keuntungannya tidak terwujud.",
  },
  {
    nomor: 2,
    judul: "Keterlambatan",
    isi: "Pembayaran bisa datang lebih lambat dari jadwal. Selama belum lunas, dana Anda masih tertahan pada pinjaman itu dan keuntungannya belum menjadi hak Anda.",
  },
  {
    nomor: 3,
    judul: "Keuntungan tidak dijamin",
    isi: "Angka keuntungan berlabel perkiraan adalah hitungan atas pinjaman yang masih berjalan, bukan janji. Angka itu baru menjadi hak Anda setelah pinjamannya lunas.",
  },
  {
    nomor: 4,
    judul: "Likuiditas dana",
    isi: "Dana tidak bisa ditarik sebelum pinjamannya lunas atau jatuh tempo. Tidak ada jadwal penarikan bebas seperti pada rekening tabungan.",
  },
  {
    nomor: 5,
    judul: "Konsentrasi",
    isi: "Satu pinjaman didanai satu pendana. Jadi seluruh pokok pada satu pinjaman tertahan pada satu peminjam saja, bukan tersebar ke banyak peminjam.",
  },
  {
    nomor: 6,
    judul: "Potongan admin mengurangi hasil bersih",
    isi: "Potongan admin diambil dari uang yang kembali, sehingga keuntungan bersih yang Anda terima lebih kecil daripada bunga yang tercatat pada pinjaman.",
  },
  {
    nomor: 7,
    judul: "Risiko data dan penilaian peminjam",
    isi: "Skor kepercayaan dan identitas peminjam bersumber dari informasi yang diberikan peminjam serta catatan PINDAI. Informasi itu bisa tidak lengkap atau tidak akurat, sehingga penilaiannya bisa keliru.",
  },
  {
    nomor: 8,
    judul: "Risiko gadai dan kredit barang",
    isi: "Pada gadai, nilai taksiran barang bisa turun dan barang bisa rusak atau sulit dijual. Pada kredit barang, nilai barang menyusut lebih cepat daripada sisa kewajibannya.",
  },
  {
    nomor: 9,
    judul: "Risiko operasional dan sistem",
    isi: "Gangguan sistem, kesalahan pencatatan, atau keterbatasan layanan bisa menunda proses pencatatan dan pencairan meski pinjamannya berjalan normal.",
  },
  {
    nomor: 10,
    judul: "Risiko hukum dan regulasi",
    isi: "Aturan yang berlaku bisa berubah. Perubahan itu dapat memengaruhi cara penagihan, penyelesaian pinjaman bermasalah, atau hak Anda sebagai pendana.",
  },
  {
    nomor: 11,
    judul: "Status penjaminan",
    isi: "Dana pendanaan tidak dijamin oleh LPS atau pihak lain, kecuali ada perjanjian tertulis yang menyatakannya.",
  },
  {
    nomor: 12,
    judul: "Catatan internal bukan bukti transaksi",
    isi: "Angka di ruang ini adalah catatan internal PINDAI, bukan bukti transaksi, bukan rekening koran, dan bukan tanda terima pembayaran.",
  },
];

/** Catatan kaki singkat yang diletakkan dekat angka keuntungan. */
export const CATATAN_INTERNAL_SINGKAT =
  "Angka ini catatan internal PINDAI, bukan bukti transaksi. Pokok dan keuntungan dapat tidak kembali jika terjadi gagal bayar.";
