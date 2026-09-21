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
    return <Badge className="bg-foreground text-background hover:bg-foreground">Didanai</Badge>;
  }
  const meta =
    kind === "loan"
      ? loanStatusMeta(status as LoanStatus)
      : pawnStatusMeta(status as PawnStatus);

  if (status === "disetujui") {
    return (
      <Badge className="bg-foreground text-background hover:bg-foreground">
        {meta.label}
      </Badge>
    );
  }
  if (status === "ditolak") {
    return <Badge variant="destructive">{meta.label}</Badge>;
  }
  if (kind === "pawn" && status === "sedang_dinilai") {
    return (
      <Badge variant="outline" className="border-foreground/40 text-foreground">
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
