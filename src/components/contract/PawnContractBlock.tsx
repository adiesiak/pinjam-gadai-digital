import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, PenLine } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildGadaiContract, CONTRACT_TERMS_VERSION, nomorContract } from "@/lib/contract";
import { quoteGadai } from "@/lib/gadai";

import { ContractSigningDialog } from "./ContractSigningDialog";

/** Widget catatan pengajuan gadai, tersedia setelah angka dicatat di aplikasi. */
export function PawnContractBlock({ pawnId, pawnRef }: { pawnId: Id<"pawns">; pawnRef: string }) {
  const [open, setOpen] = useState(false);
  const detail = useQuery(api.admin.contractDetailPawn, { pawnId });
  const save = useMutation(api.admin.simpanTandaTanganGadai);

  if (detail === undefined) {
    return (
      <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat catatan pengajuan…
      </p>
    );
  }
  if (detail === null || detail.nilaiTaksiran === undefined) {
    return (
      <p className="text-sm text-muted-foreground">
Catatan gadai tersedia setelah nilai taksiran dimasukkan ke aplikasi.
      </p>
    );
  }

  const pokokGadai = detail.pokokGadai ?? undefined;
  const persenSewaModal = detail.persenSewaModal ?? undefined;
  const detailSiap = pokokGadai !== undefined && persenSewaModal !== undefined;
  const quote =
    pokokGadai !== undefined && persenSewaModal !== undefined
      ? quoteGadai(pokokGadai, persenSewaModal)
      : null;
  const contractData = {
    ttdPeminjam: detail.ttdPeminjam,
    ttdPada: detail.ttdPada,
    persetujuanPada: detail.persetujuanPada,
    persetujuanVersi: detail.persetujuanVersi,
  };
  const tandaTanganPeminjam =
    detail.ttdPeminjam !== null
      ? {
          dataUrl: detail.ttdPeminjam,
          tandaTanganPada: detail.ttdPada,
          persetujuanSyaratPada: detail.persetujuanPada,
          persetujuanSyaratVersi: detail.persetujuanVersi,
        }
      : undefined;
  const signed =
    tandaTanganPeminjam !== undefined &&
    tandaTanganPeminjam.persetujuanSyaratPada !== null &&
    tandaTanganPeminjam.persetujuanSyaratVersi === CONTRACT_TERMS_VERSION;
  const html = buildGadaiContract(
    {
      namaLengkap: detail.namaLengkap,
      namaBank: detail.namaBank,
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
      ...(detailSiap
        ? {
            pokokGadai,
            persenSewaModal,
          }
        : {}),
    },
    {
      nomorReferensi: detail.nomorReferensi,
      lokasi: null,
      timestampPada: tandaTanganPeminjam?.tandaTanganPada ?? detail._creationTime,
      ...(tandaTanganPeminjam ? { tandaTanganPeminjam } : {}),
    },
  );

  return (
    <>
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Catatan pengajuan · gadai
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Data barang dan nilai adalah catatan aplikasi, bukan bukti inspeksi, penitipan, kontrak, atau tanda tangan digital terverifikasi.
            </p>
          </div>
          <Badge
            variant="outline"
            className={signed ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "text-muted-foreground"}
          >
            {signed ? "Catatan interaksi tersimpan" : "Belum ada catatan interaksi"}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {nomorContract("gadai", pawnRef)} · nilai taksiran pada ledger
          </span>
          <Button size="sm" className="gradient-primary rounded-full border-0" onClick={() => setOpen(true)}>
            <PenLine className="mr-1.5 size-4" /> {signed ? "Lihat catatan" : "Lihat & catat interaksi"}
          </Button>
        </div>
      </div>

      <ContractSigningDialog
        open={open}
        onOpenChange={setOpen}
        title="Catatan Gadai"
        reference={detail.nomorReferensi}
        borrowerName={detail.namaLengkap}
        html={html}
        signature={contractData.ttdPeminjam}
        signedAt={contractData.ttdPada}
        consentAt={contractData.persetujuanPada}
        consentVersion={contractData.persetujuanVersi}
        signingDisabledReason={
          detail.status === "ditolak"
            ? "Pengajuan gadai berstatus ditolak. Pencatatan interaksi aplikasi dinonaktifkan."
            : !detailSiap
              ? "Masukkan pokok gadai dan persentase sewa modal terlebih dahulu agar rincian ledger dapat ditampilkan."
              : null
        }
        onSign={async (dataUrl) => {
          await save({ pawnId, dataUrl, persetujuanPeminjam: true });
        }}
      />
    </>
  );
}
