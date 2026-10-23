/**
 * Formatter tanggal bersama panel admin.
 *
 * Fungsi non-komponen tinggal di file terpisah dari `admin-shared.tsx` supaya
 * file yang mengekspor komponen hanya mengekspor komponen (Fast Refresh).
 */
import { formatTanggalWIB } from "@/lib/waktu";

export function formatDate(ts: number): string {
  return formatTanggalWIB(ts);
}
