import SignaturePad from "signature_pad";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildPinjamanContract, judulContract, nomorContract } from "@/lib/contract";
import { formatRupiah } from "@/lib/money";

import { ContractPrintButton } from "./ContractPrintButton";
import { wrapContractHtml } from "./contract-doc";

/** Blok e-contract untuk pinjaman: preview ringkas, tanda tangan, unduh PDF. */
export function LoanContractBlock({ loanId }: { loanId: Id<"loans"> }) {
  const save = useMutation(api.admin.simpanTandaTangan);
  const detail = useQuery(api.admin.contractDetail, { loanId });
  const ttdRow = useQuery(api.admin.contractData, { loanId });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePad(canvas, {
      backgroundColor: "rgba(255,255,255,0)",
      penColor: "#0F172A",
      minWidth: 1.2,
      maxWidth: 2.4,
    });
    padRef.current = pad;
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = pad.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.clear();
      pad.fromData(data);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      pad.off();
    };
  }, []);

  if (detail === undefined || ttdRow === undefined || ttdRow === null) {
    return (
      <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat data kontrak…
      </p>
    );
  }
  if (detail === null) {
    return <p className="text-sm text-muted-foreground">Data kontrak tidak tersedia.</p>;
  }

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
      timestampPada: ttdRow.ttdPada ?? detail._creationTime,
    },
    detail.tenorHari ?? 30,
  );

  const simpanTtd = async () => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      toast.error("Tanda tangan masih kosong — gambar terlebih dahulu.");
      return;
    }
    setBusy(true);
    try {
      await save({ loanId, dataUrl: pad.toDataURL("image/png") });
      pad.clear();
      toast.success("Tanda tangan digital tersimpan.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan tanda tangan.");
    } finally {
      setBusy(false);
    }
  };

  const lihat = () => {
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Popup diblokir browser — izinkan popup untuk melihat kontrak.");
      return;
    }
    w.document.write(wrapContractHtml(html));
    w.document.close();
  };

  return (
    <div className="space-y-3 rounded-2xl border border-sky-100 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          E-Contract & legal dokumen
        </p>
        <Badge variant="outline" className="text-[10px] tabular-nums">
          {nomorContract("pinjaman", detail.nomorReferensi)}
        </Badge>
      </div>

      <div className="max-h-44 overflow-y-auto rounded-xl border border-sky-100 bg-secondary/40 p-3 text-[11px] leading-5 text-muted-foreground">
        <p className="font-semibold text-navy">{judulContract("pinjaman")}</p>
        <p className="mt-1">
          Peminjam {detail.namaLengkap} · pokok {formatRupiah(detail.pokokPinjaman)} ·
          dana bersih {formatRupiah(detail.quote.danaBersihDitransfer)} (95%) ·
          total kewajiban {formatRupiah(detail.quote.totalKewajibanPelunasan)} (130%) ·
          GPS {detail.lokasiAjukan ? `${detail.lokasiAjukan.lat.toFixed(4)}, ${detail.lokasiAjukan.lng.toFixed(4)}` : "—"} ·
          timestamp {new Date(ttdRow.ttdPada ?? detail._creationTime).toLocaleString("id-ID")}
        </p>
      </div>

      {ttdRow.ttdPeminjam ? (
        <div className="rounded-xl border border-sky-100 bg-secondary/40 p-3">
          <p className="mb-1.5 text-xs font-medium">Tanda tangan elektronik Peminjam</p>
          <img src={ttdRow.ttdPeminjam} alt="Tanda tangan peminjam" className="h-16 rounded-lg bg-white" />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-sky-200 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
            <PenLine className="size-3.5 text-primary" /> Tanda tangan peminjam (canvas)
          </p>
          <canvas
            ref={canvasRef}
            className="h-20 w-full rounded-lg border border-sky-100 bg-white touch-none"
          />
          <Button
            size="sm"
            className="gradient-primary mt-2 rounded-full border-0"
            disabled={busy}
            onClick={simpanTtd}
          >
            {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            Simpan tanda tangan
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="rounded-full" onClick={lihat}>
          Lihat E-Contract
        </Button>
        <ContractPrintButton html={html} />
      </div>
    </div>
  );
}
