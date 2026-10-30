import { Badge } from "@/components/ui/badge";

/** Label status kredit barang — satu sumber untuk tabel, dialog, dan teks urut. */
export const STATUS_LABEL_KREDIT: Record<string, string> = {
  diajukan: "Diajukan",
  sedang_ditinjau: "Sedang ditinjau",
  disetujui: "Disetujui (status aplikasi)",
  ditolak: "Ditolak",
  didanai: "Target tercapai (ledger)",
  lunas: "Lunas (ledger)",
};

/**
 * Warna chip status kredit barang — mengikuti SATU sistem warna yang sama
 * dengan `components/StatusBadge`: success (petrol) = berjalan/selesai, kuning
 * = menunggu tindakan, merah muda = ditolak, abu = di luar ketiganya.
 */
const KREDIT_KELAS: Record<string, string> = {
  didanai: "border-success-border bg-success-soft text-success-foreground",
  lunas: "border-success-border bg-success-soft text-success-foreground",
  disetujui: "border-success-border bg-success-soft text-success-foreground",
  ditolak: "border-rose-300 bg-rose-100 text-rose-800",
  sedang_ditinjau: "border-amber-300 bg-amber-100 text-amber-800",
};

export function KreditStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
        KREDIT_KELAS[status] ?? "border-slate-300 bg-slate-100 text-slate-700"
      }`}
    >
      {STATUS_LABEL_KREDIT[status] ?? status}
    </Badge>
  );
}
