import { Badge } from "@/components/ui/badge";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildGadaiContract, nomorContract } from "@/lib/contract";

import { ContractPrintButton } from "./ContractPrintButton";

/** Blok e-contract untuk gadai: akad tersedia setelah taksiran ditetapkan. */
export function PawnContractBlock({ pawnId, pawnRef }: { pawnId: Id<"pawns">; pawnRef: string }) {
  const detail = useQuery(api.admin.contractDetailPawn, { pawnId });
  if (detail === undefined) {
    return (
      <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat akad…
      </p>
    );
  }
  if (detail === null || detail.nilaiTaksiran === undefined) {
    return (
      <p className="text-sm text-muted-foreground">
        Akad gadai tersedia setelah taksiran ditetapkan.
      </p>
    );
  }

  const html = buildGadaiContract(
    {
      namaLengkap: detail.namaLengkap,
      nomorRekening: detail.nomorRekening,
      email: null,
    },
    {
      deskripsiBarang: detail.deskripsiBarang,
      kategori: detail.kategori,
      nilaiTaksiran: detail.nilaiTaksiran,
      hargaPasar: detail.hargaPasar ?? 0,
      ltvPersen: 70,
      kodeRakVault: detail.kodeRakVault ?? "—",
      kondisiFisik: detail.kondisiFisik ?? "dinilai petugas",
    },
    {
      nomorReferensi: detail.nomorReferensi,
      lokasi: null,
      timestampPada: detail._creationTime,
    },
  );

  return (
    <div className="space-y-3 rounded-2xl border border-sky-100 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          E-Contract & legal dokumen
        </p>
        <Badge variant="outline" className="text-[10px] tabular-nums">
          {nomorContract("gadai", pawnRef)}
        </Badge>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Akad gadai mencantumkan objek, LTV, kode rak brankas, dan sisa hasil lelang.
      </p>
      <ContractPrintButton html={html} label="Unduh Akad PDF" />
    </div>
  );
}
