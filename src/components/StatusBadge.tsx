import { Badge } from "@/components/ui/badge";
import { loanStatusMeta, type LoanStatus } from "@/lib/loan";
import { pawnStatusMeta, type PawnStatus } from "@/lib/pawn";
import { diTahapTinjauan } from "@/lib/statusPinjaman";

/**
 * Lencana status untuk pinjaman (`kind="loan"`) dan gadai (`kind="pawn"`).
 *
 * Pinjaman punya EMPAT status yang ditampilkan — Ditinjau, Disalurkan,
 * Ditolak, Lunas — sehingga tiga ejaan tahap tinjauan (`diajukan`,
 * `sedang_direview`, `disetujui`) memakai warna yang sama, bukan tiga warna
 * berbeda untuk label yang sama.
 */
export function StatusBadge({
  status,
  kind,
}: {
  status: string;
  kind: "loan" | "pawn";
}) {
  const meta =
    kind === "loan"
      ? loanStatusMeta(status as LoanStatus)
      : pawnStatusMeta(status as PawnStatus);

  if (status === "ditolak") {
    return <Badge variant="destructive">{meta.label}</Badge>;
  }
  if (kind === "loan" && status === "lunas") {
    return (
      <Badge className="border-primary/30 bg-primary/10 text-primary">
        {meta.label}
      </Badge>
    );
  }
  if (kind === "loan" && status === "didanai") {
    return (
      <Badge className="gradient-primary border-0 text-primary-foreground">
        {meta.label}
      </Badge>
    );
  }
  // Tahap tinjauan pinjaman — termasuk ejaan lama yang sudah digabung.
  if (kind === "loan" && diTahapTinjauan(status)) {
    return (
      <Badge className="border-gold/40 bg-gold/15 text-gold-foreground">
        {meta.label}
      </Badge>
    );
  }
  // Status proses berjalan gadai (penilaian/aktif/pelepasan) — aksen gold agar
  // jalur gadai terlihat jelas.
  if (
    kind === "pawn" &&
    (status === "aktif" ||
      status === "menunggu_pelepasan" ||
      status === "lunas_dilepas" ||
      status === "sedang_dinilai")
  ) {
    return (
      <Badge className="border-gold/40 bg-gold/15 text-gold-foreground">
        {meta.label}
      </Badge>
    );
  }
  if (status === "disetujui") {
    return (
      <Badge className="border-primary/30 bg-primary/10 text-primary">
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
