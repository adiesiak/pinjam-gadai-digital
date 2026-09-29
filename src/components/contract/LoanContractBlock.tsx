import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, PenLine } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  buildPinjamanContract,
  CONTRACT_TERMS_VERSION,
  nomorContract,
} from "@/lib/contract";
import { formatRupiah } from "@/lib/money";

import { ContractSigningDialog } from "./ContractSigningDialog";

/** Widget akad pinjaman: preview, persetujuan, dan tanda tangan Peminjam. */
export function LoanContractBlock({ loanId }: { loanId: Id<"loans"> }) {
  const [open, setOpen] = useState(false);
  const save = useMutation(api.admin.simpanTandaTangan);
  const detail = useQuery(api.admin.contractDetail, { loanId });
  const contractData = useQuery(api.admin.contractData, { loanId });

  if (detail === undefined || contractData === undefined) {
    return (
      <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat data kontrak…
      </p>
    );
  }
  if (detail === null || contractData === null) {
    return <p className="text-sm text-muted-foreground">Data kontrak tidak tersedia.</p>;
  }

  const tandaTanganPeminjam =
    contractData.ttdPeminjam !== null &&
    contractData.ttdPada !== null &&
    contractData.persetujuanPada !== null &&
    contractData.persetujuanVersi === CONTRACT_TERMS_VERSION
      ? {
          dataUrl: contractData.ttdPeminjam,
          tandaTanganPada: contractData.ttdPada,
          persetujuanSyaratPada: contractData.persetujuanPada,
        }
      : undefined;
  const signed = tandaTanganPeminjam !== undefined;

  const html = buildPinjamanContract(
    {
      namaLengkap: detail.namaLengkap,
      nomorRekening: detail.nomorRekening,
      nik: detail.nik,
      email: null,
    },
    {
      pokok: detail.pokokPinjaman,
      biayaAdmin: detail.quote.biayaAdmin,
      biayaPlatform: detail.quote.biayaPlatform,
      totalPotonganDiMuka: detail.quote.totalPotonganDiMuka,
      danaBersihDitransfer: detail.quote.danaBersihDitransfer,
      bunga: detail.quote.bunga,
      totalKewajibanPelunasan: detail.quote.totalKewajibanPelunasan,
    },
    {
      nomorReferensi: detail.nomorReferensi,
      lokasi: detail.lokasiAjukan,
      timestampPada: tandaTanganPeminjam?.tandaTanganPada ?? detail._creationTime,
      ...(tandaTanganPeminjam ? { tandaTanganPeminjam } : {}),
    },
    detail.tenorHari ?? 30,
    detail.bulanan ?? null,
  );

  return (
    <>
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              E-Contract · pinjaman
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Peminjam membaca syarat, menyetujui, lalu menandatangani sendiri.
            </p>
          </div>
          <Badge
            variant="outline"
            className={signed ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "text-muted-foreground"}
          >
            {signed ? "Sudah disetujui" : "Menunggu persetujuan"}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {nomorContract("pinjaman", detail.nomorReferensi)} · Pokok {formatRupiah(detail.pokokPinjaman)}
          </span>
          <Button size="sm" className="gradient-primary rounded-full border-0" onClick={() => setOpen(true)}>
            <PenLine className="mr-1.5 size-4" /> {signed ? "Lihat akad" : "Buka & minta persetujuan"}
          </Button>
        </div>
      </div>

      <ContractSigningDialog
        open={open}
        onOpenChange={setOpen}
        title="Akad Pinjaman Digital"
        reference={detail.nomorReferensi}
        borrowerName={detail.namaLengkap}
        html={html}
        signature={contractData.ttdPeminjam}
        signedAt={contractData.ttdPada}
        consentAt={contractData.persetujuanPada}
        consentVersion={contractData.persetujuanVersi}
        signingDisabledReason={
          detail.status === "ditolak"
            ? "Pengajuan berstatus ditolak. Persetujuan dan tanda tangan akad dinonaktifkan."
            : null
        }
        onSign={async (dataUrl) => {
          await save({ loanId, dataUrl, persetujuanPeminjam: true });
        }}
      />
    </>
  );
}
