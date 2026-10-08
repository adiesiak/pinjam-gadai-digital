import { useMutation, useQuery } from "convex/react";
import { IdCard, ImageUp, Loader2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  bacaDataDiri,
  formDariTersimpan,
  penghasilanDariTeks,
  type DataDiriForm,
} from "@/lib/dataDiri";
import { MAX_FILE_BYTES } from "@/lib/kyc";

/**
 * Isi & sunting data diri satu nasabah — admin.
 *
 * Wrapper ini hanya menjembatani Convex (query + mutation) ke `FormDataDiri`
 * yang murni presentasional, supaya form-nya bisa diuji lewat render tanpa
 * Convex maupun DOM (lihat DataDiriDialog.render.test.tsx). Aturan validasi
 * tinggal di lib/dataDiri.ts dan dipakai form maupun server.
 *
 * Foto KTP diunggah admin: klien meminta URL unggah, meng-POST berkasnya, lalu
 * mengirim storageId ke mutation. Foto lama dihapus server saat diganti.
 */
const KELAS_LABEL = "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400";
const KELAS_HINT = "text-[11px] leading-4 text-muted-foreground";

/** Perubahan foto KTP: `undefined` = biarkan, `null` = kosongkan, id = ganti. */
export type PerubahanFotoKtp = Id<"_storage"> | null | undefined;

export function DataDiriDialog({
  userId,
  onClose,
}: {
  userId: Id<"users">;
  onClose: () => void;
}) {
  const data = useQuery(api.admin.dataDiriNasabah, { userId });
  const simpan = useMutation(api.admin.simpanDataDiriNasabah);
  const buatUrlUnggah = useMutation(api.admin.generateDataDiriUploadUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unggahKtp = async (file: File): Promise<Id<"_storage">> => {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error("Ukuran foto KTP maksimal 5 MB.");
    }
    const url = await buatUrlUnggah();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    const json = (await res.json()) as { storageId?: Id<"_storage"> };
    if (!res.ok || !json.storageId) throw new Error("Foto KTP gagal diunggah. Coba lagi.");
    return json.storageId;
  };

  return (
    <Dialog
      open
      onOpenChange={(terbuka) => {
        if (!terbuka) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IdCard className="size-4" aria-hidden /> Data diri nasabah
          </DialogTitle>
          <DialogDescription>
            Lengkapi identitas nasabah — termasuk foto KTP. Perubahan tercatat di Audit Trail.
          </DialogDescription>
        </DialogHeader>

        {data === undefined ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Memuat data diri…
          </p>
        ) : (
          <FormDataDiri
            nama={data.nama}
            awal={formDariTersimpan(data.data)}
            fotoKtpUrl={data.fotoKtpUrl}
            sebelumnya={
              data.ada
                ? `Terakhir diperbarui ${new Date(data.diperbaruiPada ?? 0).toLocaleString("id-ID")} oleh ${
                    data.diperbaruiOlehLabel ?? "admin"
                  }`
                : "Data diri belum pernah diisi."
            }
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
                ...(foto === undefined ? {} : { fotoKtpId: foto }),
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
      </DialogContent>
    </Dialog>
  );
}

export type FormDataDiriProps = {
  nama: string;
  awal: DataDiriForm;
  /** URL foto KTP yang sudah tersimpan (sementara), atau null. */
  fotoKtpUrl: string | null;
  /** Keterangan singkat kapan/oleh siapa terakhir diperbarui. */
  sebelumnya: string;
  /** Unggah satu berkas; mengembalikan storage id. */
  unggah: (file: File) => Promise<Id<"_storage">>;
  busy: boolean;
  error: string | null;
  onSimpan: (form: DataDiriForm, foto: PerubahanFotoKtp) => void;
  onBatal: () => void;
};

/**
 * Form data diri — murni presentasional (tanpa hook Convex) supaya bisa diuji
 * sebagai markup. Semua isian disimpan lokal; validasi memakai aturan yang sama
 * dengan server sebelum memanggil `onSimpan`.
 */
export function FormDataDiri({
  nama,
  awal,
  fotoKtpUrl,
  sebelumnya,
  unggah,
  busy,
  error,
  onSimpan,
  onBatal,
}: FormDataDiriProps) {
  const [form, setForm] = useState<DataDiriForm>(awal);
  /** Perubahan foto KTP yang belum disimpan. */
  const [foto, setFoto] = useState<PerubahanFotoKtp>(undefined);
  /** Pratinjau foto (URL lokal saat baru diunggah, atau URL tersimpan). */
  const [preview, setPreview] = useState<string | null>(fotoKtpUrl);
  const [fotoBusy, setFotoBusy] = useState(false);
  const [galatLokal, setGalatLokal] = useState<string | null>(null);
  const inputFotoRef = useRef<HTMLInputElement | null>(null);

  const ubah = (kunci: keyof DataDiriForm) => (nilai: string) =>
    setForm((p) => ({ ...p, [kunci]: nilai }));

  const pilihFoto = async (file: File | undefined) => {
    if (!file) return;
    setFotoBusy(true);
    setGalatLokal(null);
    try {
      const id = await unggah(file);
      setFoto(id);
      setPreview(typeof URL !== "undefined" && "createObjectURL" in URL ? URL.createObjectURL(file) : null);
    } catch (err) {
      setGalatLokal(err instanceof Error ? err.message : "Foto KTP gagal diunggah.");
    } finally {
      setFotoBusy(false);
      // Izinkan memilih berkas yang sama lagi setelah gagal.
      if (inputFotoRef.current) inputFotoRef.current.value = "";
    }
  };

  const simpan = () => {
    const { tersimpan, pesan } = bacaDataDiri(form);
    if (tersimpan === null) {
      setGalatLokal(pesan);
      return;
    }
    setGalatLokal(null);
    onSimpan(form, foto);
  };

  const pesanGalat = galatLokal ?? error;
  const adaFoto = preview !== null;

  return (
    <div className="space-y-4">
      <p className={KELAS_HINT}>
        Nasabah: <span className="font-semibold text-navy">{nama}</span> · {sebelumnya}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="dd-nama" className={KELAS_LABEL}>
            Nama lengkap (sesuai KTP)
          </Label>
          <Input
            id="dd-nama"
            value={form.namaLengkap}
            onChange={(e) => ubah("namaLengkap")(e.target.value)}
            placeholder="Mis. Rani Puspita"
            disabled={busy}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dd-nik" className={KELAS_LABEL}>
            Nomor KTP (NIK)
          </Label>
          <Input
            id="dd-nik"
            inputMode="numeric"
            className="tabular-nums"
            value={form.nik}
            onChange={(e) => ubah("nik")(e.target.value)}
            placeholder="16 angka"
            disabled={busy}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dd-wa" className={KELAS_LABEL}>
            Nomor WhatsApp
          </Label>
          <Input
            id="dd-wa"
            inputMode="tel"
            className="tabular-nums"
            value={form.nomorWhatsApp}
            onChange={(e) => ubah("nomorWhatsApp")(e.target.value)}
            placeholder="6281234567890"
            disabled={busy}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="dd-alamat" className={KELAS_LABEL}>
            Alamat
          </Label>
          <Textarea
            id="dd-alamat"
            rows={2}
            value={form.alamat}
            onChange={(e) => ubah("alamat")(e.target.value)}
            placeholder="Alamat sesuai KTP (opsional)"
            disabled={busy}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dd-pekerjaan" className={KELAS_LABEL}>
            Pekerjaan
          </Label>
          <Input
            id="dd-pekerjaan"
            value={form.pekerjaan}
            onChange={(e) => ubah("pekerjaan")(e.target.value)}
            placeholder="Mis. Karyawan swasta (opsional)"
            disabled={busy}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dd-penghasilan" className={KELAS_LABEL}>
            Penghasilan per bulan
          </Label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400"
            >
              Rp
            </span>
            <Input
              id="dd-penghasilan"
              inputMode="numeric"
              className="pl-8 tabular-nums"
              value={form.penghasilan}
              onChange={(e) => ubah("penghasilan")(e.target.value.replace(/\D/g, ""))}
              onBlur={() =>
                setForm((p) => ({
                  ...p,
                  penghasilan:
                    p.penghasilan === ""
                      ? ""
                      : new Intl.NumberFormat("id-ID").format(Number(p.penghasilan)),
                }))
              }
              placeholder="Opsional"
              disabled={busy}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dd-bank" className={KELAS_LABEL}>
            Nama bank / e-wallet
          </Label>
          <Input
            id="dd-bank"
            value={form.namaBank}
            onChange={(e) => ubah("namaBank")(e.target.value)}
            placeholder="Mis. BCA (opsional)"
            disabled={busy}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dd-rekening" className={KELAS_LABEL}>
            Nomor rekening
          </Label>
          <Input
            id="dd-rekening"
            inputMode="numeric"
            className="tabular-nums"
            value={form.nomorRekening}
            onChange={(e) => ubah("nomorRekening")(e.target.value.replace(/\D/g, ""))}
            placeholder="Opsional"
            disabled={busy}
          />
        </div>
      </div>

      {/* Foto KTP: unggah, pratinjau, dan tombol kosongkan. */}
      <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className={KELAS_LABEL}>Foto KTP</Label>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1 px-2.5"
              disabled={busy || fotoBusy}
              onClick={() => inputFotoRef.current?.click()}
            >
              {fotoBusy ? <Loader2 className="size-3.5 animate-spin" /> : <ImageUp className="size-3.5" />}
              {adaFoto ? "Ganti foto" : "Unggah foto"}
            </Button>
            {adaFoto && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 gap-1 px-2.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busy || fotoBusy}
                onClick={() => {
                  setFoto(null);
                  setPreview(null);
                }}
              >
                <Trash2 className="size-3.5" />
                Hapus
              </Button>
            )}
          </div>
        </div>
        <input
          ref={inputFotoRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Berkas foto KTP"
          onChange={(e) => void pilihFoto(e.target.files?.[0])}
        />
        {adaFoto ? (
          <img
            src={preview ?? ""}
            alt="Pratinjau foto KTP"
            className="mt-2 max-h-56 w-full rounded-lg border border-slate-200 object-contain"
          />
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Belum ada foto KTP. Format gambar apa pun, maksimal 5 MB.
          </p>
        )}
        {foto === null && fotoKtpUrl !== null && (
          <p className="mt-1 text-[11px] text-amber-700">
            Foto KTP lama akan dihapus saat Anda menyimpan.
          </p>
        )}
      </div>

      {pesanGalat !== null && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {pesanGalat}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onBatal}>
          Batal
        </Button>
        <Button type="button" disabled={busy || fotoBusy} onClick={simpan}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Simpan data diri
        </Button>
      </DialogFooter>
    </div>
  );
}
