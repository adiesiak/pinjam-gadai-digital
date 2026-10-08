import { FileCheck2, ImageUp, Loader2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Id } from "@/convex/_generated/dataModel";
import { unggahDokumen } from "@/lib/unggahDokumen";

const KELAS_LABEL = "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400";

/** Berkas yang sudah terunggah pada satu slot dokumen. */
export type DokumenTerunggah = { id: Id<"_storage">; nama: string };

/**
 * Satu slot unggah dokumen pengajuan (mis. selfie dengan KTP, bukti
 * penghasilan) untuk formulir pencatatan manual.
 *
 * Unggahan langsung dikirim ke Convex storage lewat URL yang diminta server;
 * yang disimpan formulir hanya id + nama berkasnya. Slot bisa dikosongkan lagi
 * sebelum pengajuan disimpan.
 */
export function UnggahDokumen({
  label,
  keterangan,
  nilai,
  onUbah,
  mintaUrl,
  disabled = false,
}: {
  label: string;
  keterangan: string;
  nilai: DokumenTerunggah | null;
  onUbah: (dokumen: DokumenTerunggah | null) => void;
  /** Mutation admin penerbit URL unggah. */
  mintaUrl: () => Promise<string>;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const pilih = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setGalat(null);
    try {
      const id = await unggahDokumen(file, mintaUrl, label);
      onUbah({ id, nama: file.name });
    } catch (err) {
      setGalat(err instanceof Error ? err.message : `${label} gagal diunggah.`);
    } finally {
      setBusy(false);
      // Izinkan memilih berkas yang sama lagi setelah gagal.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <Label className={KELAS_LABEL}>{label}</Label>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{keterangan}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1 px-2.5"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ImageUp className="size-3.5" />}
          {nilai === null ? "Pilih berkas" : "Ganti berkas"}
        </Button>
        {nilai !== null && (
          <>
            <span className="flex min-w-0 items-center gap-1 text-[11px] text-emerald-700">
              <FileCheck2 className="size-3.5 shrink-0" />
              <span className="truncate">{nilai.nama}</span>
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 gap-1 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={disabled || busy}
              onClick={() => onUbah(null)}
            >
              <Trash2 className="size-3.5" /> Hapus
            </Button>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        aria-label={`Berkas ${label}`}
        onChange={(event) => void pilih(event.target.files?.[0])}
      />
      {galat !== null && (
        <p role="alert" className="mt-2 text-[11px] leading-4 text-destructive">
          {galat}
        </p>
      )}
    </div>
  );
}
