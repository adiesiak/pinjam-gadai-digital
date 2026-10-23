import { useAction, useMutation, useQuery } from "convex/react";
import { BadgeCheck, IdCard, Loader2, ShieldX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FormDataDiri, type PerubahanFotoKtp } from "@/components/DataDiriForm";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { MemuatBaris } from "@/components/ui/loading";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formDariTersimpan, penghasilanDariTeks } from "@/lib/dataDiri";
import { namaHurufBesar } from "@/lib/nama";
import { unggahDokumen, type ProgresUnggah } from "@/lib/unggahDokumen";
import { formatWaktuWIB } from "@/lib/waktu";

/**
 * Isi & sunting data diri satu nasabah — admin.
 *
 * Wrapper ini hanya menjembatani Convex (query + mutation) ke `FormDataDiri`
 * yang murni presentasional (dipakai bersama sunting mandiri nasabah), supaya
 * form-nya bisa diuji lewat render tanpa Convex maupun DOM. Aturan validasi
 * tinggal di lib/dataDiri.ts dan dipakai form maupun server.
 *
 * Foto KTP diunggah admin: klien meminta URL unggah, meng-POST berkasnya, lalu
 * mengirim storageId ke mutation. Foto lama dihapus server saat diganti.
 */
export function DataDiriDialog({
  userId,
  onClose,
}: {
  userId: Id<"users">;
  onClose: () => void;
}) {
  const data = useQuery(api.admin.dataDiriNasabah, { userId });
  const simpan = useMutation(api.admin.simpanDataDiriNasabah);
  const verifikasi = useMutation(api.admin.verifikasiIdentitasNasabah);
  const buatUrlUnggah = useMutation(api.admin.generateDataDiriUploadUrl);
  const periksaIsi = useAction(api.berkasIdentitas.periksaIsiBerkasKyc);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Unggah foto KTP lewat helper bersama (`lib/unggahDokumen`), bukan `fetch`
   * sendiri: batas ukuran, pemeriksaan status HTTP, pesan galat, dan laporan
   * progres byte-nya jadi sama dengan unggahan dokumen di jalur lain.
   */
  const unggahKtp = async (
    file: File,
    onProgres?: (progres: ProgresUnggah) => void,
  ): Promise<Id<"_storage">> => {
    const id = await unggahDokumen(file, buatUrlUnggah, "Foto KTP", undefined, onProgres);
    await periksaIsi({ id, label: "Foto KTP" });
    return id;
  };

  return (
    <Sheet
      open
      onOpenChange={(terbuka) => {
        if (!terbuka) onClose();
      }}
    >
      {/* Form identitas panjang: laci samping selebar separuh layar, bukan
          modal yang menggulir sendiri. Daftar nasabah tetap terlihat. */}
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto border-l border-slate-200 bg-white px-4 pb-8 sm:w-[50vw] sm:max-w-none sm:px-6 xl:w-[46vw]"
      >
        <SheetHeader className="px-0 pt-4 pb-2 pr-10">
          <SheetTitle className="flex items-center gap-2">
            <IdCard className="size-4" aria-hidden /> Data diri nasabah
          </SheetTitle>
          <SheetDescription>
            Lengkapi identitas nasabah — termasuk foto KTP. Perubahan tercatat di Audit Trail.
          </SheetDescription>
        </SheetHeader>

        {data === undefined ? (
          <MemuatBaris teks="Memuat data diri…" className="py-8" />
        ) : (
          <FormDataDiri
            nama={namaHurufBesar(data.nama)}
            awal={formDariTersimpan(data.data)}
            fotoKtpUrl={data.fotoKtpUrl}
            sebelumnya={keteranganSebelumnya(data)}
            unggah={unggahKtp}
            busy={busy}
            error={error}
            onSimpan={(form, foto) => {
              setBusy(true);
              setError(null);
              void simpan({
                userId,
                namaLengkap: form.namaLengkap,
                nik: form.nik,
                nomorWhatsApp: form.nomorWhatsApp,
                alamat: form.alamat,
                pekerjaan: form.pekerjaan,
                penghasilanBulanan: penghasilanDariTeks(form.penghasilan),
                namaBank: form.namaBank,
                nomorRekening: form.nomorRekening,
                ...(foto === undefined ? {} : { fotoKtpId: foto as PerubahanFotoKtp }),
              })
                .then(() => {
                  toast.success("Data diri nasabah tersimpan.");
                  onClose();
                })
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : "Gagal menyimpan data diri.");
                })
                .finally(() => setBusy(false));
            }}
            onBatal={onClose}
          />
        )}

        {data !== undefined && data.ada && (
          <PutusanVerifikasiIdentitas
            awal={data.verifikasiIdentitas}
            onPutuskan={async (status, catatan) => {
              await verifikasi({ userId, status, ...(catatan === "" ? {} : { catatan }) });
              toast.success(
                status === "terverifikasi"
                  ? "Identitas ditandai terverifikasi."
                  : "Verifikasi identitas ditolak.",
              );
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Putusan VERIFIKASI IDENTITAS — sengaja terpisah dari formulir dan dari
 * keputusan pinjaman. Menyimpan data diri TIDAK memverifikasi identitas, dan
 * menyetujui pinjaman juga tidak; petugas harus memutuskan di sini.
 *
 * Penolakan WAJIB beralasan (server menolak catatan kosong) supaya nasabah bisa
 * menindaklanjutinya. Setiap putusan masuk Audit Trail.
 */
function PutusanVerifikasiIdentitas({
  awal,
  onPutuskan,
}: {
  awal: {
    status: "terverifikasi" | "ditolak";
    pada: number;
    olehLabel: string;
    catatan?: string;
  } | null;
  onPutuskan: (status: "terverifikasi" | "ditolak", catatan: string) => Promise<void>;
}) {
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const putuskan = async (status: "terverifikasi" | "ditolak") => {
    setBusy(true);
    setError(null);
    try {
      await onPutuskan(status, catatan.trim());
      setCatatan("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan putusan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        Verifikasi identitas
      </p>
      <p className="text-[11px] leading-4 text-muted-foreground">
        Putusan ini berdiri sendiri: mengunggah dokumen atau menyetujui pinjaman TIDAK membuat
        identitas terverifikasi. Putusan lama dihapus otomatis bila nama, NIK, atau foto KTP berubah.
      </p>
      {awal === null ? (
        <p className="text-xs font-medium text-muted-foreground">Belum ada putusan.</p>
      ) : (
        <p className="flex items-center gap-1.5 text-xs font-medium">
          {awal.status === "terverifikasi" ? (
            <BadgeCheck className="size-3.5 text-emerald-600" aria-hidden />
          ) : (
            <ShieldX className="size-3.5 text-red-600" aria-hidden />
          )}
          {awal.status === "terverifikasi" ? "Terverifikasi" : "Ditolak"} ·{" "}
          {formatWaktuWIB(awal.pada)} WIB oleh {awal.olehLabel}
          {awal.catatan !== undefined && awal.catatan !== "" ? ` — ${awal.catatan}` : ""}
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="verifikasi-catatan" className="text-xs">
          Catatan (wajib saat menolak)
        </Label>
        <Textarea
          id="verifikasi-catatan"
          value={catatan}
          onChange={(event) => setCatatan(event.target.value)}
          rows={2}
          maxLength={300}
          placeholder="Contoh: foto KTP buram, NIK tidak terbaca"
          disabled={busy}
        />
      </div>
      {error !== null && (
        <p role="alert" className="text-[11px] leading-4 text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => void putuskan("terverifikasi")}>
          {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <BadgeCheck className="mr-1.5 size-3.5" />}
          Tandai terverifikasi
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => void putuskan("ditolak")}
        >
          <ShieldX className="mr-1.5 size-3.5" /> Tolak
        </Button>
      </div>
    </div>
  );
}

/** Kalimat "terakhir diperbarui …" termasuk siapa yang menyuntingnya. */
function keteranganSebelumnya(data: {
  ada: boolean;
  diperbaruiPada: number | null;
  diperbaruiOlehLabel: string | null;
  sumber: "admin" | "nasabah" | null;
}): string {
  if (!data.ada) return "Data diri belum pernah diisi.";
  const waktu =
    data.diperbaruiPada === null
      ? ""
      : `${formatWaktuWIB(data.diperbaruiPada)} WIB`;
  const oleh = data.diperbaruiOlehLabel ?? "admin";
  const sumber =
    data.sumber === "nasabah"
      ? " — terakhir diubah NASABAH; simpan untuk menimpanya"
      : data.sumber === "admin"
        ? " — terakhir diubah admin"
        : "";
  return `Terakhir diperbarui ${waktu} oleh ${oleh}${sumber}`;
}
