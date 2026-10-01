/**
 * Formatter tanggal bersama panel admin.
 *
 * Fungsi non-komponen tinggal di file terpisah dari `admin-shared.tsx` supaya
 * file yang mengekspor komponen hanya mengekspor komponen (Fast Refresh).
 */
export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
