import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, PenLine } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildPinjamanContract, nomorContract } from "@/lib/contract";
import { urlVerifikasi } from "@/lib/kontrakDigital";
import {
  bolehUnggahTtdManual,
  labelStatusKontrak,
  namaBerkasKontrak,
  statusKontrak,
} from "@/lib/kontrakStatus";
import { formatRupiah } from "@/lib/money";
import { namaHurufBesar } from "@/lib/nama";
import { useQrDataUrl } from "@/hooks/use-qr";

import { ContractSigningDialog } from "./ContractSigningDialog";
import { ManualContractUpload } from "./ManualContractUpload";

/** Widget perjanjian pinjaman dan interaksi tanda tangan yang tersimpan di aplikasi. */
export function LoanContractBlock({ loanId }: { loanId: Id<"loans"> }) {
  const [open, setOpen] = useState(false);
  const save = useMutation(api.admin.simpanTandaTangan);
  const detail = useQuery(api.admin.contractDetail, { loanId });
  const contractData = useQuery(api.admin.contractData, { loanId });
  const digital = useQuery(api.kontrakDigital.infoPinjaman, { loanId });
  const qr = useQrDataUrl(digital ? urlVerifikasi(digital.kode) : null);
  // Tarif denda dibaca dari konfigurasi yang berlaku, bukan angka tetap di
  // berkas kontrak: perjanjian yang dicetak harus memuat tarif yang benar.
  const ketentuan = useQuery(api.system.getKetentuanBiaya, {});

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
    contractData.persetujuanMode !== "manual" && contractData.ttdPeminjam !== null
      ? {
          dataUrl: contractData.ttdPeminjam,
          tandaTanganPada: contractData.ttdPada,
          persetujuanSyaratPada: contractData.persetujuanPada,
          persetujuanSyaratVersi: contractData.persetujuanVersi,
        }
      : undefined;
  const status = statusKontrak({
    persetujuanPada: contractData.persetujuanPada,
    persetujuanVersi: contractData.persetujuanVersi,
    persetujuanMode: contractData.persetujuanMode,
    ttdDataUrl: contractData.ttdPeminjam,
    ttdPada: contractData.ttdPada,
    ttdManualPada: contractData.ttdManualPada,
  });
  const label = labelStatusKontrak(status);
  const sudahDisetujui = status !== "belum" && status !== "versi_lama";

  const html = buildPinjamanContract(
    {
      namaLengkap: detail.namaLengkap,
      namaBank: detail.namaBank,
      nomorRekening: detail.nomorRekening,
      nik: detail.nik,
      email: null,
    },
    {
      pokok: detail.pokokPinjaman,
      biayaAdmin: detail.quote.biayaAdmin,
      diskonAdmin: detail.quote.diskonAdmin ?? 0,
      biayaPlatform: detail.quote.biayaPlatform,
      biayaAsuransi: detail.quote.biayaAsuransi,
      biayaExpress: detail.quote.biayaExpress,
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
      persetujuanSyarat: {
        pada: contractData.persetujuanPada,
        versi: contractData.persetujuanVersi,
      },
      ...(digital
        ? {
            verifikasi: {
              kode: digital.kode,
              hash: digital.hash,
              diterbitkanPada: digital.diterbitkanPada,
              url: urlVerifikasi(digital.kode),
              qrDataUrl: qr,
            },
          }
        : {}),
    },
    detail.tenorHari ?? 30,
    detail.bulanan ?? null,
    ketentuan?.persenDendaKeterlambatan,
  );

  return (
    <>
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Perjanjian · pinjaman
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Rincian, checkbox persetujuan, dan gambar tanda tangan dicatat pada perjanjian ini.
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              label.nada === "selesai"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : label.nada === "info"
                  ? "border-sky-200 bg-sky-50 text-sky-800"
                  : label.nada === "peringatan"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "text-muted-foreground"
            }
          >
            {label.label}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {nomorContract("pinjaman", detail.nomorReferensi)} · Pokok {formatRupiah(detail.pokokPinjaman)}
          </span>
          <Button size="sm" className="gradient-primary rounded-full border-0" onClick={() => setOpen(true)}>
            <PenLine className="mr-1.5 size-4" />{" "}
            {sudahDisetujui ? "Lihat perjanjian" : "Lihat & tanda tangan"}
          </Button>
        </div>
      </div>

      <ContractSigningDialog
        open={open}
        onOpenChange={setOpen}
        title="Perjanjian Pinjaman"
        reference={detail.nomorReferensi}
        borrowerName={namaHurufBesar(detail.namaLengkap)}
        html={html}
        signature={contractData.ttdPeminjam}
        signedAt={contractData.ttdPada}
        consentAt={contractData.persetujuanPada}
        consentVersion={contractData.persetujuanVersi}
        consentMode={contractData.persetujuanMode}
        manualAt={contractData.ttdManualPada}
        fileName={namaBerkasKontrak("pinjaman", detail.nomorReferensi)}
        manualProof={
          status === "elektronik" ? null : (
          <ManualContractUpload
            jenis="pinjaman"
            id={loanId}
            sudahAda={contractData.ttdManualPada !== null}
            pada={contractData.ttdManualPada}
            oleh={contractData.ttdManualOleh}
            url={contractData.ttdManualUrl}
            bolehUnggah={bolehUnggahTtdManual({
              persetujuanPada: contractData.persetujuanPada,
              persetujuanVersi: contractData.persetujuanVersi,
              persetujuanMode: contractData.persetujuanMode,
              ttdDataUrl: contractData.ttdPeminjam,
              ttdPada: contractData.ttdPada,
              ttdManualPada: contractData.ttdManualPada,
            })}
          />
          )
        }
        signingDisabledReason={
          detail.status === "ditolak"
            ? "Pengajuan berstatus ditolak. Penandatanganan perjanjian dinonaktifkan."
            : null
        }
        onSign={async ({ dataUrl, mode }) => {
          await save({
            loanId,
            mode,
            ...(dataUrl !== null ? { dataUrl } : {}),
            persetujuanPeminjam: true,
          });
        }}
      />
    </>
  );
}
