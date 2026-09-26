import type { Id } from "@/convex/_generated/dataModel";

import { LoanContractBlock } from "./contract/LoanContractBlock";
import { PawnContractBlock } from "./contract/PawnContractBlock";

export { ContractPrintButton } from "./contract/ContractPrintButton";

/**
 * Widget E-Contract: preview perjanjian (HTML), tanda tangan canvas digital,
 * dan unduh PDF via dialog cetak browser. Dipakai di dialog detail pinjaman
 * & gadai pada panel admin.
 * Implementasi tiap blok ada di `./contract/*`.
 */

type Props =
  | { kind: "loan"; loanId: Id<"loans"> }
  | { kind: "pawn"; pawnRef: string; pawnId: Id<"pawns"> };

export function EContractWidget(props: Props) {
  if (props.kind === "pawn") {
    return <PawnContractBlock pawnId={props.pawnId} pawnRef={props.pawnRef} />;
  }
  return <LoanContractBlock loanId={props.loanId} />;
}
