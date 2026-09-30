import SignaturePad from "signature_pad";
import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Eraser, Loader2, PenLine, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CONTRACT_TERMS_VERSION } from "@/lib/contract";

import { ContractPrintButton } from "./ContractPrintButton";
import { wrapContractHtml } from "./contract-doc";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  reference: string;
  borrowerName: string;
  html: string;
  signature: string | null;
  signedAt: number | null;
  consentAt: number | null;
  consentVersion: string | null;
  signingDisabledReason?: string | null;
  onSign: (dataUrl: string) => Promise<void>;
};

/** Dialog pencatatan checkbox dan gambar tanda tangan pada ledger internal. */
export function ContractSigningDialog({
  open,
  onOpenChange,
  title,
  reference,
  borrowerName,
  html,
  signature,
  signedAt,
  consentAt,
  consentVersion,
  signingDisabledReason = null,
  onSign,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fullySigned =
    signature !== null &&
    signedAt !== null &&
    consentAt !== null &&
    consentVersion === CONTRACT_TERMS_VERSION;

  useEffect(() => {
    if (!open) return;
    setConsentChecked(false);
    setHasSignature(false);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open || fullySigned || signingDisabledReason !== null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pad = new SignaturePad(canvas, {
      backgroundColor: "rgba(255,255,255,0)",
      penColor: "#172b3a",
      minWidth: 1.2,
      maxWidth: 2.4,
    });
    const updateSignature = () => setHasSignature(!pad.isEmpty());
    pad.addEventListener("endStroke", updateSignature);
    padRef.current = pad;

    const resize = () => {
      if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = pad.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.clear();
      pad.fromData(data);
      setHasSignature(!pad.isEmpty());
    };

    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      pad.removeEventListener("endStroke", updateSignature);
      pad.off();
      if (padRef.current === pad) padRef.current = null;
    };
  }, [open, fullySigned, signingDisabledReason]);

  const submit = async () => {
    const pad = padRef.current;
    if (!consentChecked) {
      setError("Peminjam perlu menyetujui syarat dan ketentuan terlebih dahulu.");
      return;
    }
    if (!pad || pad.isEmpty()) {
      setHasSignature(false);
      setError("Tanda tangan Peminjam masih kosong.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSign(pad.toDataURL("image/png"));
      toast.success("Catatan persetujuan aplikasi dan gambar tanda tangan tersimpan.");
      onOpenChange(false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Gagal menyimpan akad.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-slate-200 px-5 py-5 pr-12 text-left sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-primary/25 bg-primary/5 text-primary">
              {fullySigned ? <BadgeCheck className="size-3.5" /> : <PenLine className="size-3.5" />}
              {fullySigned ? "Perjanjian tersimpan" : "Tanda tangan"}
            </Badge>
            <span className="text-xs tabular-nums text-muted-foreground">Syarat {CONTRACT_TERMS_VERSION}</span>
          </div>
          <DialogTitle className="text-left text-lg font-semibold tracking-tight text-navy">
            {title}
          </DialogTitle>
          <DialogDescription className="text-left tabular-nums">
            {reference} · Peminjam: {borrowerName}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <section aria-label="Pratinjau syarat dan ketentuan" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-navy">Perjanjian dan rincian pengajuan</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tinjau nama, angka, dan ketentuan sebelum peminjam menandatangani.
                </p>
              </div>
              <ContractPrintButton html={html} label="Cetak / simpan PDF" />
            </div>
            <iframe
              title={`Pratinjau ${title}`}
              srcDoc={wrapContractHtml(html)}
              sandbox=""
              className="h-72 w-full rounded-xl border border-slate-200 bg-white sm:h-80"
            />
          </section>

          {fullySigned ? (
            <section className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                    <BadgeCheck className="size-4" /> Persetujuan dan tanda tangan tersimpan
                  </p>
                  <p className="mt-1 text-xs leading-5 text-emerald-800">
                    Versi tampilan {consentVersion} · {new Date(consentAt).toLocaleString("id-ID")}
                  </p>
                </div>
                <Badge className="bg-emerald-700 text-white hover:bg-emerald-700">Peminjam</Badge>
              </div>
              <img
                src={signature}
                alt={`Gambar tanda tangan yang dicatat untuk nama ${borrowerName}`}
                className="h-20 max-w-full rounded-lg border border-emerald-100 bg-white object-contain p-2"
              />
              <p className="text-xs text-emerald-800">
                Gambar dicatat pada {new Date(signedAt).toLocaleString("id-ID")}.
              </p>
            </section>
          ) : signingDisabledReason !== null ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
              <p className="text-xs leading-5 text-amber-900">{signingDisabledReason}</p>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
                <p className="text-xs leading-5 text-amber-900">
                  Serahkan perangkat kepada peminjam untuk membaca dan menandatangani sendiri; jangan mengisi atas nama orang lain. Sesi yang tercatat adalah sesi admin.
                </p>
              </div>

              {signature !== null && consentVersion !== CONTRACT_TERMS_VERSION && (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  Ada gambar lama tanpa catatan checkbox untuk tampilan versi {CONTRACT_TERMS_VERSION}. Pemeriksaan ulang hanya memperbarui catatan aplikasi.
                </p>
              )}

              <section className="space-y-2" aria-labelledby="signature-heading">
                <div>
                  <h3 id="signature-heading" className="text-sm font-semibold text-navy">
                    Gambar tanda tangan pada pengajuan
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Area ini menyimpan goresan sebagai gambar pada pengajuan.
                  </p>
                </div>
                <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <canvas
                    ref={canvasRef}
                    aria-label="Kanvas tanda tangan Peminjam"
                    className="h-28 w-full touch-none"
                  />
                  <span className="pointer-events-none absolute inset-x-4 bottom-8 border-b border-dashed border-slate-200" />
                  <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] text-slate-400">
                    Peminjam · {borrowerName}
                  </span>
                </div>
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  className="h-8 px-2 text-xs text-muted-foreground"
                  disabled={busy}
                  onClick={() => {
                    padRef.current?.clear();
                    setHasSignature(false);
                    setError(null);
                  }}
                >
                  <Eraser className="mr-1.5 size-3.5" /> Hapus tanda tangan
                </Button>
              </section>

              <label
                htmlFor="borrower-contract-consent"
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6"
              >
                <Checkbox
                  id="borrower-contract-consent"
                  checked={consentChecked}
                  disabled={busy}
                  onCheckedChange={(checked) => {
                    setConsentChecked(checked === true);
                    if (checked === true) setError(null);
                  }}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-navy">
                    Saya telah membaca dan menyetujui isi perjanjian ini
                    (versi {CONTRACT_TERMS_VERSION}).
                  </span>{" "}
                  Penandatanganan ini dicatat pada perjanjian.
                </span>
              </label>
            </>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        {!fullySigned && signingDisabledReason === null && (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-xs text-muted-foreground">
              {consentChecked && hasSignature
                ? "Persetujuan dan tanda tangan siap disimpan pada perjanjian."
                : "Centang persetujuan dan bubuhkan tanda tangan untuk melanjutkan."}
            </p>
            <Button
              type="button"
              className="gradient-primary min-w-52 border-0"
              disabled={busy || !consentChecked || !hasSignature}
              onClick={() => void submit()}
            >
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <PenLine className="mr-2 size-4" />}
              {busy ? "Menyimpan…" : "Simpan perjanjian"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
