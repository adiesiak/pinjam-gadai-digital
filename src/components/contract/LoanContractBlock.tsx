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
import { urlVerifikasi } from "@/lib/kontrakDigital";
import { formatRupiah } from "@/lib/money";
import { namaHurufBesar } from "@/lib/nama";
import { useQrDataUrl } from "@/hooks/use-qr";

import { ContractSigningDialog } from "./ContractSigningDialog";

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
    contractData.ttdPeminjam !== null
      ? {
          dataUrl: contractData.ttdPeminjam,
          tandaTanganPada: contractData.ttdPada,
          persetujuanSyaratPada: contractData.persetujuanPada,
          persetujuanSyaratVersi: contractData.persetujuanVersi,
        }
      : undefined;
  const signed =
    tandaTanganPeminjam !== undefined &&
    tandaTanganPeminjam.persetujuanSyaratPada !== null &&
    tandaTanganPeminjam.persetujuanSyaratVersi === CONTRACT_TERMS_VERSION;

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
      biayaPlatform: detail.quote.biayaPlatform,
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
            className={signed ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "text-muted-foreground"}
          >
            {signed ? "Perjanjian tertanda tangan" : "Belum ditandatangani"}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {nomorContract("pinjaman", detail.nomorReferensi)} · Pokok {formatRupiah(detail.pokokPinjaman)}
          </span>
          <Button size="sm" className="gradient-primary rounded-full border-0" onClick={() => setOpen(true)}>
            <PenLine className="mr-1.5 size-4" /> {signed ? "Lihat perjanjian" : "Lihat & tanda tangan"}
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
        signingDisabledReason={
          detail.status === "ditolak"
            ? "Pengajuan berstatus ditolak. Penandatanganan perjanjian dinonaktifkan."
            : null
        }
        onSign={async (dataUrl) => {
          await save({ loanId, dataUrl, persetujuanPeminjam: true });
        }}
      />
    </>
  );
}
