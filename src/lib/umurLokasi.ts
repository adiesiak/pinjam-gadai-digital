/**
 * Umur titik lokasi → teks dan angka yang bisa dibaca manusia.
 *
 * Dipakai bersama oleh kartu umpan (`components/admin/KartuFeedLokasi.tsx`) dan
 * peta (`components/admin/LiveLocationMap.tsx`). Satu sumber supaya detik yang
 * tertulis di kartu sama dengan yang di popup peta, dan supaya ambang "masih
 * mengirim" tetap milik server (`lokasiMaxUmurMenit`) — bukan angka lepas yang
 * ditulis ulang di antarmuka.
 */

/** Selisih detik antara `waktu` dan `sekarang`; null bila waktunya tidak ada. */
export function umurDetikSejak(waktu: number | null, sekarang: number): number | null {
  if (waktu === null || !Number.isFinite(waktu)) return null;
  return Math.max(0, Math.floor((sekarang - waktu) / 1000));
}

/**
 * Umur dalam bahasa Indonesia singkat: "baru saja", "12 dtk lalu", "4 mnt
 * lalu", "3 jam lalu", "2 hari lalu".
 *
 * Detik di bawah 10 ditulis "baru saja" karena heartbeat berjalan tiap ±60
 * detik: angka "3 dtk lalu" akan berubah sendiri tiap detik padahal tidak ada
 * data baru, dan itu justru membuat panel terlihat lebih hidup daripada
 * kenyataannya.
 */
export function formatUmurLokasi(detik: number | null): string {
  if (detik === null || !Number.isFinite(detik)) return "belum pernah";
  const d = Math.max(0, Math.floor(detik));
  if (d < 10) return "baru saja";
  if (d < 60) return `${d} dtk lalu`;
  const menit = Math.floor(d / 60);
  if (menit < 60) return `${menit} mnt lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  return `${Math.floor(jam / 24)} hari lalu`;
}
