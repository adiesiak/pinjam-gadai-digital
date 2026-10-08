import { useMutation, useQuery } from "convex/react";
import { IdCard, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FormDataDiri, type PerubahanFotoKtp } from "@/components/DataDiriForm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formDariTersimpan, penghasilanDariTeks } from "@/lib/dataDiri";
import { MAX_FILE_BYTES } from "@/lib/kyc";

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
      </DialogContent>
    </Dialog>
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
  const waktu = data.diperbaruiPada === null ? "" : new Date(data.diperbaruiPada).toLocaleString("id-ID");
  const oleh = data.diperbaruiOlehLabel ?? "admin";
  const sumber =
    data.sumber === "nasabah"
      ? " — terakhir diubah NASABAH; simpan untuk menimpanya"
      : data.sumber === "admin"
        ? " — terakhir diubah admin"
        : "";
  return `Terakhir diperbarui ${waktu} oleh ${oleh}${sumber}`;
}
