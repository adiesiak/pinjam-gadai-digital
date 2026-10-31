import { useMutation } from "convex/react";
import { CheckCircle2, FileUp, Loader2, ShieldAlert } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ACCEPT_TTD_MANUAL,
  validasiBerkasTtdManual,
} from "@/lib/kontrakStatus";
import { unggahDokumen } from "@/lib/unggahDokumen";

/**
 * Penerimaan berkas kontrak bertanda tangan manual oleh admin.
 *
 * Berkas hanya ditautkan setelah perjanjian disetujui. Gambar tanda tangan
 * elektronik tidak diisi: bukti TTD manual hidup di kolomnya sendiri, sehingga
 * status dan audit trail tidak mencampuradukkan dua cara tanda tangan.
 */
export function ManualContractUpload({
  jenis,
  id,
  sudahAda,
  pada,
  oleh,
  url,
  bolehUnggah,
}: {
  jenis: "pinjaman" | "gadai";
  id: Id<"loans"> | Id<"pawns">;
  sudahAda: boolean;
  pada: number | null;
  oleh: string | null;
  url: string | null;
  /** Hanya true setelah persetujuan syarat tercatat. */
  bolehUnggah: boolean;
}) {
  const mintaUrl = useMutation(api.admin.generateKontrakManualUploadUrl);
  const lampirPinjaman = useMutation(api.admin.lampirkanKontrakManualPinjaman);
  const lampirGadai = useMutation(api.admin.lampirkanKontrakManualGadai);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const pilih = async (file: File | undefined) => {
    if (file === undefined) return;
    const pesan = validasiBerkasTtdManual(file);
    if (pesan !== null) {
      setGalat(pesan);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setBusy(true);
    setGalat(null);
    try {
      const berkasId = await unggahDokumen(
        file,
        () => mintaUrl({}),
        "Kontrak bertanda tangan",
      );
      if (jenis === "pinjaman") {
        await lampirPinjaman({ loanId: id as Id<"loans">, berkasId });
      } else {
        await lampirGadai({ pawnId: id as Id<"pawns">, berkasId });
      }
      toast.success("Berkas TTD manual diterima dan tercatat pada perjanjian.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Berkas TTD manual gagal diunggah.";
      setGalat(message);
      toast.error(message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <section
      aria-labelledby={`ttd-manual-${jenis}`}
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3
            id={`ttd-manual-${jenis}`}
            className="flex items-center gap-2 text-sm font-semibold text-navy"
          >
            {sudahAda ? (
              <CheckCircle2 className="size-4 text-emerald-700" aria-hidden="true" />
            ) : (
              <FileUp className="size-4 text-primary" aria-hidden="true" />
            )}
            Bukti TTD manual
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Unggah kontrak yang sudah ditandatangani dengan tinta. Berkas ini menjadi bukti
            status “TTD manual diterima”; gambar tanda tangan elektronik tidak diisi.
          </p>
        </div>
        {sudahAda && (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
            Diterima
          </span>
        )}
      </div>

      {!bolehUnggah ? (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Setujui perjanjian terlebih dahulu. Setelah persetujuan tercatat, berkas TTD
          manual dapat diunggah di sini.
        </p>
      ) : sudahAda ? (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
          <p className="text-xs font-medium text-emerald-900">
            Diterima {pada === null ? "—" : new Date(pada).toLocaleString("id-ID")}
            {oleh === null ? "" : ` oleh ${oleh}`}.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {url !== null && (
              <Button asChild size="sm" variant="outline" className="min-h-11 rounded-full">
                <a href={url} target="_blank" rel="noreferrer">
                  Lihat berkas
                </a>
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-11 rounded-full"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <FileUp className="mr-1.5 size-4" />
              )}
              {busy ? "Mengunggah…" : "Ganti berkas"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="min-h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <FileUp className="mr-1.5 size-4" />
            )}
            {busy ? "Mengunggah…" : "Unggah kontrak bertanda tangan"}
          </Button>
          <span className="text-[11px] text-muted-foreground">
            PDF, JPG, PNG, atau WEBP · maksimal 5 MB
          </span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_TTD_MANUAL}
        className="hidden"
        aria-label="Berkas kontrak bertanda tangan manual"
        onChange={(event) => void pilih(event.target.files?.[0])}
      />
      {galat !== null && (
        <p role="alert" className="text-xs leading-5 text-destructive">
          {galat}
        </p>
      )}
    </section>
  );
}
