import { Badge } from "@/components/ui/badge";
import { loanStatusMeta, type LoanStatus } from "@/lib/loan";
import { pawnStatusMeta, type PawnStatus } from "@/lib/pawn";

export function StatusBadge({
  status,
  kind,
}: {
  status: string;
  kind: "loan" | "pawn";
}) {
  if (kind === "loan" && status === "didanai") {
    return (
      <Badge className="gradient-primary border-0 text-primary-foreground">
        Target tercapai (ledger)
      </Badge>
    );
  }
  if (kind === "loan" && status === "lunas") {
    return (
      <Badge className="border-primary/30 bg-primary/10 text-accent-foreground">
        Lunas (ledger)
      </Badge>
    );
  }
  const meta =
    kind === "loan"
      ? loanStatusMeta(status as LoanStatus)
      : pawnStatusMeta(status as PawnStatus);

  if (status === "disetujui") {
    return (
      <Badge className="border-primary/30 bg-primary/10 text-accent-foreground">
        {meta.label}
      </Badge>
    );
  }
  if (status === "ditolak") {
    return <Badge variant="destructive">{meta.label}</Badge>;
  }
  // Status proses berjalan (review/penilaian/aktif/pelepasan) — emerald lembut;
  // alur gadai memakai aksen gold agar jalurnya terlihat jelas.
  if (
    (kind === "pawn" &&
      (status === "aktif" ||
        status === "menunggu_pelepasan" ||
        status === "lunas_dilepas" ||
        status === "sedang_dinilai")) ||
    (kind === "loan" && status === "sedang_direview")
  ) {
    return (
      <Badge className="border-gold/40 bg-gold/15 text-gold-foreground">
        {meta.label}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {meta.label}
    </Badge>
  );
}
