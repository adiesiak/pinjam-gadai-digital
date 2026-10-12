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
 *
 * Lencana ini juga memakai `.badge-pop`: status KYC adalah hal pertama yang
 * dicari nasabah di dashboard, jadi ia masuk dengan membesar halus dan
 * merespon hover — tanpa mengubah teks maupun nadanya.
 */
export function StatusKycBadge({
  status,
  className,
}: {
  status: StatusKyc;
  className?: string;
}) {
  return (
    <Badge className={cn("badge-pop border", NADA_STATUS_KYC[status], className)}>
      {LABEL_STATUS_KYC[status]}
    </Badge>
  );
}
