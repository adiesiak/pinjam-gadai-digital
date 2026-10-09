import { Badge } from "@/components/ui/badge";
import { LABEL_STATUS_KYC, NADA_STATUS_KYC, type StatusKyc } from "@/lib/kycStatus";
import { cn } from "@/lib/utils";

/**
 * Lencana status KYC — SATU tempat yang mengubah status jadi teks + warna.
 *
 * Modul KYC dipakai di dua permukaan (dashboard nasabah dan panel petugas) yang
 * bisa berbeda pendapat kalau labelnya ditulis ulang di masing-masing. Karena
 * itu label dan nada diambil dari `lib/kycStatus.ts`: teks selalu ikut tampil
 * bersama warnanya, sehingga status tidak pernah hanya dibedakan warna.
 */
export function StatusKycBadge({
  status,
  className,
}: {
  status: StatusKyc;
  className?: string;
}) {
  return (
    <Badge className={cn("border", NADA_STATUS_KYC[status], className)}>
      {LABEL_STATUS_KYC[status]}
    </Badge>
  );
}
