/**
 * Peringatan konsekuensi keterlambatan yang dibaca peminjam SEBELUM mengirim
 * pengajuan.
 *
 * Kalimatnya sengaja hanya menyebut langkah yang benar-benar dijalankan
 * aplikasi: denda, pengingat, somasi ke kontak peminjam, dan jalur
 * restrukturisasi. Tempat kerja, keluarga, dan tetangga tidak disebut sebagai
 * sasaran penagihan karena `lib/penagihan.ts` memang melarangnya — ancaman
 * yang tidak akan dijalankan hanya merusak kepercayaan dan melanggar aturan
 * penagihan.
 *
 * Angka denda datang dari pengaturan yang berlaku, bukan ditulis ulang di layar,
 * supaya peringatan tidak pernah berbeda dari yang ditagih mesin pinjaman.
 */
import { MIN_HARI_SOMASI } from "./suratSomasi";

export type TarifDendaKeterlambatan = {
  /** Denda per hari, dalam persen dari pokok. */
  perHari: number;
  /** Batas maksimum denda, dalam persen dari pokok. */
  maks: number;
};

/** Angka persen dengan koma desimal, mengikuti cara baca orang Indonesia. */
function persen(nilai: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(nilai);
}

/** Daftar konsekuensi lengkap untuk dialog persetujuan pengajuan. */
export function konsekuensiKeterlambatan(tarif: TarifDendaKeterlambatan): string[] {
  return [
    `Denda ${persen(tarif.perHari)}% per hari dari pokok, dibatasi ${persen(tarif.maks)}% dari pokok. Tidak ada masa tenggang.`,
    "Pengingat dikirim ke WhatsApp Anda pada H-3, hari jatuh tempo, dan setelah jatuh tempo.",
    `Mulai hari ke-${MIN_HARI_SOMASI} setelah jatuh tempo, PINDAI dapat menerbitkan somasi tertulis dan mengirimkannya ke WhatsApp atau email yang Anda daftarkan.`,
    "Penagihan hanya ditujukan kepada Anda. Keluarga, tetangga, dan tempat kerja tidak dihubungi.",
    "Bila pembayaran mulai berat, ajukan restrukturisasi atau hubungi CS sebelum jatuh tempo.",
  ];
}

/**
 * Patokan konservatif: kewajiban satu periode tidak lebih dari 30% penghasilan
 * pada periode yang sama. Bukan aturan resmi dan bukan penolakan — hanya ambang
 * untuk memunculkan peringatan.
 */
export const BATAS_RASIO_KEWAJIBAN = 0.3;

type ArgumenKemampuanBayar = {
  /** Penghasilan bulanan yang diisi/diverifikasi. */
  penghasilanBulanan: number;
  /** Yang harus dibayar pada satu periode: cicilan bulanan, atau total harian. */
  kewajiban: number;
  /** Panjang periode kewajiban dalam hari (30 untuk cicilan bulanan). */
  hari: number;
};

/**
 * Peringatan bila kewajiban menyerap terlalu besar penghasilan pada periode
 * yang sama. Untuk pinjaman harian, penghasilan bulanan dipecah ke jumlah hari
 * tenor lebih dulu — membandingkan utang 7 hari dengan gaji sebulan penuh akan
 * membuat hampir semua pengajuan tampak aman.
 */
export function peringatanKemampuanBayar({
  penghasilanBulanan,
  kewajiban,
  hari,
}: ArgumenKemampuanBayar): string | null {
  if (!Number.isFinite(penghasilanBulanan) || penghasilanBulanan <= 0) return null;
  if (!Number.isFinite(kewajiban) || kewajiban <= 0) return null;
  if (!Number.isFinite(hari) || hari <= 0) return null;

  const penghasilanPeriode = (penghasilanBulanan * Math.min(hari, 30)) / 30;
  const rasio = kewajiban / penghasilanPeriode;
  if (rasio <= BATAS_RASIO_KEWAJIBAN) return null;

  const persenRasio = Math.round(rasio * 100);
  const lama = Math.round(Math.min(hari, 30));
  return (
    `Kewajiban ini setara ${persenRasio}% penghasilan Anda selama ${lama} hari, ` +
    `di atas patokan konservatif 30%. Sisa penghasilan untuk kebutuhan lain menjadi tipis. ` +
    "Pertimbangkan nominal lebih kecil atau tenor lebih panjang; ini saran, bukan penolakan."
  );
}

/**
 * Versi satu paragraf untuk formulir ringkas. Tetap menyebut denda, somasi, dan
 * batas penagihan — tiga hal yang paling sering tidak dibaca peminjam.
 */
export function ringkasKonsekuensi(tarif: TarifDendaKeterlambatan): string {
  return (
    `Bila terlambat: denda ${persen(tarif.perHari)}% per hari dari pokok ` +
    `(maksimum ${persen(tarif.maks)}%), pengingat WhatsApp, dan somasi mulai hari ` +
    `ke-${MIN_HARI_SOMASI}. Penagihan hanya kepada Anda, bukan tempat kerja.`
  );
}
