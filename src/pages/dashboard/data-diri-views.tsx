import { useMutation, useQuery } from "convex/react";
import { IdCard, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FormDataDiri } from "@/components/DataDiriForm";
import { Badge } from "@/components/ui/badge";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formDariTersimpan, penghasilanDariTeks } from "@/lib/dataDiri";
import { MAX_FILE_BYTES } from "@/lib/kyc";

/**
 * Data diri nasabah — sunting mandiri dari dashboard.
 *
 * Memakai form yang SAMA dengan panel admin (`components/DataDiriForm`), dan
 * server menulis lewat helper yang sama (`convex/dataDiriProfil.ts`), sehingga
 * bentuk dan aturannya tidak mungkin berbeda.
 *
 * Kapan admin terakhir menyunting, catatan itu ditampilkan: data bukan rahasia
 * bagi pemiliknya, tetapi pemiliknya perlu tahu bahwa admin bisa menimpanya.
 */
export function DataDiriSection() {
  const data = useQuery(api.profilNasabah.dataDiriSaya);
  const simpan = useMutation(api.profilNasabah.simpanDataDiriSaya);
  const buatUrl = useMutation(api.profilNasabah.generateUploadUrlDataDiriSaya);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unggah = async (file: File): Promise<Id<"_storage">> => {
    if (file.size > MAX_FILE_BYTES) throw new Error("Ukuran foto KTP maksimal 5 MB.");
    const url = await buatUrl();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    const json = (await res.json()) as { storageId?: Id<"_storage"> };
    if (!res.ok || !json.storageId) throw new Error("Foto KTP gagal diunggah. Coba lagi.");
    return json.storageId;
  };

  if (data === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat data diri…
      </div>
    );
  }

  const sumber =
    data.sumber === "admin"
      ? "Terakhir diubah admin"
      : data.sumber === "nasabah"
        ? "Terakhir Anda ubah"
        : "Belum pernah diubah";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-navy">
            <IdCard className="size-4" aria-hidden /> Data diri
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Isi data diri Anda agar pengajuan berikutnya tidak perlu mengetik ulang NIK dan nomor
            WhatsApp. Data yang sudah dilengkapi admin dapat Anda perbarui; suntingan admin
            berikutnya menimpa perubahan ini.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge
            className={
              data.ada
                ? "border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                : "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100"
            }
          >
            {data.ada ? "Tersimpan" : "Belum diisi"}
          </Badge>
          <Badge className="border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100">
            {sumber}
          </Badge>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-sky-700" aria-hidden />
        <p className="text-[11px] leading-4 text-sky-900">
          Data diri hanya dipakai untuk pengajuan pinjaman/gadai Anda. Foto KTP ditampilkan
          ter-watermark saat ditinjau tim PINDAI.
        </p>
      </div>

      {/* `key` mengikuti stempel pembaruan server: setelah simpan berhasil,
          form dimuat ulang dengan nilai yang BENAR-BENAR tersimpan (sudah
          dinormalkan server), bukan teks mentah yang baru diketik. */}
      <div className="mt-4">
        <FormDataDiri
          key={`${data.ada}-${data.diperbaruiPada ?? 0}`}
          nama={data.nama}
          awal={formDariTersimpan(data.data)}
          fotoKtpUrl={data.fotoKtpUrl}
          sebelumnya={
            data.ada && data.diperbaruiPada !== null
              ? `Terakhir diperbarui ${new Date(data.diperbaruiPada).toLocaleString("id-ID")}`
              : "Data diri belum pernah diisi."
          }
          unggah={unggah}
          busy={busy}
          error={error}
          labelSimpan={data.ada ? "Simpan perubahan" : "Simpan data diri"}
          onSimpan={(form, foto) => {
            setBusy(true);
            setError(null);
            void simpan({
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
              .then(() => toast.success("Data diri tersimpan."))
              .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : "Gagal menyimpan data diri."),
              )
              .finally(() => setBusy(false));
          }}
        />
      </div>
    </section>
  );
}
