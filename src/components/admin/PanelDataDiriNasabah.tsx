import { useQuery } from "convex/react";
import { IdCard, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { WatermarkedDoc } from "@/components/WatermarkedDoc";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";

/**
 * Data diri TERSIMPAN milik nasabah — dibaca peninjau saat memeriksa pengajuan.
 *
 * Kenapa dipisah dari `LoanKycPanel`: panel itu menampilkan data KYC yang
 * diunggah pada SATU pengajuan. Di sini yang ditampilkan adalah data diri yang
 * disimpan per nasabah (diisi admin atau disunting nasabah), sehingga peninjau
 * bisa membandingkan identitas acuan dengan isian pengajuan.
 *
 * Komponen ini read-only — penyuntingannya lewat panel Nasabah agar satu jalur.
 */
export type DataDiriTampil = {
  nama: string;
  email: string | null;
  ada: boolean;
  data: {
    namaLengkap: string;
    nik: string;
    nomorWhatsApp: string;
    alamat: string;
    pekerjaan: string;
    penghasilanBulanan: number | null;
    namaBank: string;
    nomorRekening: string;
  };
  fotoKtpUrl: string | null;
  diperbaruiPada: number | null;
  diperbaruiOlehLabel: string | null;
  sumber: "admin" | "nasabah" | null;
};

export function PanelDataDiriNasabah({ userId }: { userId: Id<"users"> }) {
  const data = useQuery(api.admin.dataDiriNasabah, { userId });

  if (data === undefined) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat data diri tersimpan…
      </div>
    );
  }
  return <DataDiriRingkas data={data} />;
}

/** Bagian presentasional — dipisah agar bisa diuji sebagai markup. */
export function DataDiriRingkas({ data }: { data: DataDiriTampil }) {
  const { data: d } = data;
  const baris: Array<[string, string]> = [
    ["NIK", d.nik === "" ? "—" : d.nik],
    ["WhatsApp", d.nomorWhatsApp === "" ? "—" : d.nomorWhatsApp],
    ["Alamat", d.alamat === "" ? "—" : d.alamat],
    ["Pekerjaan", d.pekerjaan === "" ? "—" : d.pekerjaan],
    ["Penghasilan", d.penghasilanBulanan === null ? "—" : formatRupiah(d.penghasilanBulanan)],
    ["Bank / e-wallet", d.namaBank === "" ? "—" : d.namaBank],
    ["Rekening", d.nomorRekening === "" ? "—" : d.nomorRekening],
  ];

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <IdCard className="size-3.5" aria-hidden /> Data diri tersimpan
        </p>
        {data.ada && (
          <Badge
            className={
              data.sumber === "nasabah"
                ? "border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100"
                : "border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
            }
          >
            {data.sumber === "nasabah" ? "terakhir diubah nasabah" : "diisi admin"}
          </Badge>
        )}
      </div>

      {!data.ada ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-xs text-muted-foreground">
          Belum ada data diri tersimpan untuk nasabah ini. Lengkapi lewat panel{" "}
          <strong>Nasabah → Isi data diri</strong>.
        </p>
      ) : (
        <>
          <p className="text-xs leading-5 text-muted-foreground">
            Data diri disimpan per nasabah — terpisah dari isian pengajuan di bawah. Perbandingan
            keduanya membantu peninjau melihat perbedaan sebelum memutuskan.
            {data.diperbaruiPada !== null && (
              <>
                {" "}
                Diperbarui {new Date(data.diperbaruiPada).toLocaleString("id-ID")} oleh{" "}
                {data.diperbaruiOlehLabel ?? "—"}.
              </>
            )}
          </p>
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            {baris.map(([label, nilai]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="break-words tabular-nums text-navy">{nilai}</dd>
              </div>
            ))}
          </dl>
          {data.fotoKtpUrl !== null ? (
            <WatermarkedDoc src={data.fotoKtpUrl} label="KTP tersimpan" />
          ) : (
            <p className="inline-flex w-full items-center justify-center rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-muted-foreground">
              Belum ada foto KTP tersimpan.
            </p>
          )}
        </>
      )}
    </div>
  );
}
