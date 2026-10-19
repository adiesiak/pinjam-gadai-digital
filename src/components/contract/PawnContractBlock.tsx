import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, PenLine } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildGadaiContract, CONTRACT_TERMS_VERSION, nomorContract } from "@/lib/contract";
import { urlVerifikasi } from "@/lib/kontrakDigital";
import { namaHurufBesar } from "@/lib/nama";
import { useQrDataUrl } from "@/hooks/use-qr";

import { ContractSigningDialog } from "./ContractSigningDialog";

/** Widget perjanjian gadai, tersedia setelah angka dicatat di aplikasi. */
export function PawnContractBlock({ pawnId, pawnRef }: { pawnId: Id<"pawns">; pawnRef: string }) {
  const [open, setOpen] = useState(false);
  const detail = useQuery(api.admin.contractDetailPawn, { pawnId });
  const digital = useQuery(api.kontrakDigital.infoGadai, { pawnId });
  const qr = useQrDataUrl(digital ? urlVerifikasi(digital.kode) : null);
  const save = useMutation(api.admin.simpanTandaTanganGadai);

  if (detail === undefined) {
    return (
      <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat perjanjian…
      </p>
    );
  }
  if (detail === null || detail.nilaiTaksiran === undefined) {
    return (
      <p className="text-sm text-muted-foreground">
Perjanjian gadai tersedia setelah nilai taksiran dimasukkan ke aplikasi.
      </p>
    );
  }

  const pokokGadai = detail.pokokGadai ?? undefined;
  const persenSewaModal = detail.persenSewaModal ?? undefined;
  const detailSiap = pokokGadai !== undefined && persenSewaModal !== undefined;
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
  );

  return (
    <>
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Perjanjian · gadai
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Data barang dan nilai tercatat pada perjanjian ini.
            </p>
          </div>
          <Badge
            variant="outline"
            className={signed ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "text-muted-foreground"}
          >
            {signed ? "Akad tertanda tangan" : "Belum ditandatangani"}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {nomorContract("gadai", pawnRef)} · nilai taksiran pada ledger
          </span>
          <Button size="sm" className="gradient-primary rounded-full border-0" onClick={() => setOpen(true)}>
            <PenLine className="mr-1.5 size-4" /> {signed ? "Lihat akad" : "Lihat & tanda tangan"}
          </Button>
        </div>
      </div>

      <ContractSigningDialog
        open={open}
        onOpenChange={setOpen}
        title="Perjanjian Gadai"
        reference={detail.nomorReferensi}
        borrowerName={namaHurufBesar(detail.namaLengkap)}
        html={html}
        signature={contractData.ttdPeminjam}
        signedAt={contractData.ttdPada}
        consentAt={contractData.persetujuanPada}
        consentVersion={contractData.persetujuanVersi}
        signingDisabledReason={
          detail.status === "ditolak"
            ? "Pengajuan gadai berstatus ditolak. Penandatanganan akad dinonaktifkan."
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
