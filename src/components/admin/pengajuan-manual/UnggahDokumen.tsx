import { FileCheck2, ImageUp, Loader2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { BilahProgres } from "@/components/ui/loading";
import type { Id } from "@/convex/_generated/dataModel";
import { progresPersen } from "@/lib/formInteraksi";
import { unggahDokumen, type ProgresUnggah } from "@/lib/unggahDokumen";

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
 *
 * Umpan balik prosesnya dibedakan per TAHAP — "Mengunggah …" lalu
 * "Memeriksa isi …". Selama berkas dikirim, bilahnya memakai PERSEN NYATA dari
 * byte yang dilaporkan lapisan pengiriman (`unggahDokumen` memakai XHR saat
 * tersedia); bila total byte tidak diketahui, bilahnya kembali TAK TENTU —
 * bukan persen karangan. Tahap pemeriksaan isi di server selalu tak tentu,
 * karena server tidak melaporkan kemajuannya. Saat gagal, pesannya menyebutkan
 * cara mencoba ulang (pilih berkasnya sekali lagi), bukan sekadar "gagal".
 */
export function UnggahDokumen({
  label,
  keterangan,
  nilai,
  onUbah,
  mintaUrl,
  periksa,
  disabled = false,
  accept = "image/*,application/pdf",
  onBerkasDipilih,
}: {
  label: string;
  keterangan: string;
  /**
   * Jenis berkas yang boleh dipilih. Bawaannya gambar atau PDF (pengajuan
   * manual); modul KYC mempersempitnya ke `image/*` karena KTP/selfie/bukti
   * penghasilan di sana WAJIB gambar menurut pemeriksa isi berkas di server.
   */
  accept?: string;
  nilai: DokumenTerunggah | null;
  onUbah: (dokumen: DokumenTerunggah | null) => void;
  /** Mutation admin penerbit URL unggah. */
  mintaUrl: () => Promise<string>;
  /**
   * Pemeriksa ISI berkas sesudah unggah (opsional) — mis. action magic bytes
   * `berkasIdentitas.periksaIsiBerkasKyc`, dipanggil dengan storage id + label.
   */
  periksa?: (id: Id<"_storage">, label: string) => Promise<void>;
  disabled?: boolean;
  /**
   * Dipanggil dengan berkas yang BARU dipilih (sebelum diunggah). Dipakai
   * pemanggil yang ingin menampilkan pratinjau lokal — tanpa perlu mengubah
   * cara unggah atau menitipkan berkas ke server lebih dulu.
   */
  onBerkasDipilih?: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** Tahap proses yang sedang berjalan — menentukan label yang ditampilkan. */
  const [tahap, setTahap] = useState<"diam" | "unggah" | "periksa">("diam");
  const [galat, setGalat] = useState<string | null>(null);
  // Byte terakhir yang dilaporkan jaringan. Dipakai HANYA saat berkas sedang
  // dikirim; saat memeriksa isi di server, angkanya dibuang lagi supaya tidak
  // ada "100%" yang tertinggal di layar padahal pekerjaannya belum selesai.
  const [progres, setProgres] = useState<ProgresUnggah | null>(null);
  const busy = tahap !== "diam";

  const pilih = async (file: File | undefined) => {
    if (!file) return;
    onBerkasDipilih?.(file);
    setTahap("unggah");
    setGalat(null);
    setProgres(null);
    try {
      const id = await unggahDokumen(
        file,
        mintaUrl,
        label,
        periksa === undefined
          ? undefined
          : async (sid) => {
              // Tahap kedua: server memeriksa ISI berkas (magic bytes). Unggahan
              // sudah selesai di titik ini, jadi labelnya harus berubah — bukan
              // berhenti di "mengunggah" sampai pemeriksaan kelar.
              setTahap("periksa");
              setProgres(null);
              await periksa(sid, label);
            },
        (p) => setProgres(p),
      );
      onUbah({ id, nama: file.name });
    } catch (err) {
      setGalat(err instanceof Error ? err.message : `${label} gagal diunggah.`);
    } finally {
      setTahap("diam");
      setProgres(null);
      // Izinkan memilih berkas yang sama lagi setelah gagal.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div
      aria-busy={busy || undefined}
      className="rounded-xl border border-slate-200 bg-white p-3"
    >
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
        accept={accept}
        className="hidden"
        aria-label={`Berkas ${label}`}
        onChange={(event) => void pilih(event.target.files?.[0])}
      />
      {busy &&
        (tahap === "periksa" ? (
          <BilahProgres
            className="mt-2"
            nilai={null}
            label={`Memeriksa isi ${label.toLowerCase()}…`}
          />
        ) : (
          <BilahProgres
            className="mt-2"
            nilai={progres === null ? null : progresPersen(progres.dimuat, progres.total)}
            label={`Mengunggah ${label.toLowerCase()}… jangan tutup panel ini.`}
          />
        ))}
      {galat !== null && (
        <p role="alert" className="mt-2 text-[11px] leading-4 text-destructive">
          {galat} Pilih berkasnya sekali lagi untuk mencoba ulang.
        </p>
      )}
    </div>
  );
}
