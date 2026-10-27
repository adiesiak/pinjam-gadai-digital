/**
 * Teks pengingat voucher H-3 — satu sumber untuk WhatsApp dan uji.
 *
 * Dipisah dari `convex/pengingatVoucher.ts` karena isi pesan adalah keputusan
 * bahasa, bukan keputusan pengiriman. Server tetap memutuskan SIAPA yang dikirimi
 * dan KAPAN; berkas ini hanya menyusun kalimat dari data voucher yang tersimpan.
 *
 * Tidak memakai template CMS: pengingat ini lahir dari masa berlaku voucher itu
 * sendiri, bukan dari kampanye penagihan. Kalau nanti admin perlu menyuntingnya,
 * tempatnya adalah template pesan baru — bukan menambah placeholder ke template
 * tagihan yang artinya berbeda.
 */
import { formatTanggalWIB } from "./waktu";

export const PENGINGAT_VOUCHER = {
  /** Pengingat mulai berlaku H-3 sebelum voucher hangus. */
  hari: 3,
  /** Batas voucher yang diperiksa satu putaran cron. */
  batasKandidat: 200,
} as const;

/**
 * Sisa HARI PENUH menuju kedaluwarsa; minimal 1 supaya kalimatnya tidak
 * "0 hari".
 *
 * Dibulatkan ke bawah, bukan ke atas: voucher yang tinggal 2 hari 5 jam lebih
 * jujur disebut "2 hari lagi" daripada "3 hari lagi" — angka yang lebih besar
 * membuat nasabah merasa masih longgar padahal tidak.
 */
export function sisaHariVoucher(berlakuSampai: number, sekarang: number): number {
  return Math.max(1, Math.floor((berlakuSampai - sekarang) / 86_400_000));
}

export function pesanPengingatVoucher(args: {
  nama: string;
  judul: string;
  kode: string;
  berlakuSampai: number;
  sekarang: number;
}): string {
  const hari = sisaHariVoucher(args.berlakuSampai, args.sekarang);
  return (
    `Halo ${args.nama}, voucher ${args.judul} (${args.kode}) di PINDAI berlaku sampai ` +
    `${formatTanggalWIB(args.berlakuSampai)} — ${hari} hari lagi. Pakai pada pengajuan ` +
    `berikutnya sebelum hangus. Bila sudah terpakai, abaikan pesan ini.`
  );
}
