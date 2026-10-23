import { useQuery } from "convex/react";
import { BadgeCheck, IdCard, ShieldX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { MemuatBaris } from "@/components/ui/loading";
import { PenampilDokumen } from "./PenampilDokumen";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import { formatWaktuWIB } from "@/lib/waktu";

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
  /**
   * PUTUSAN verifikasi identitas petugas, atau `null` bila belum ada putusan.
   * Terpisah dari keputusan pinjaman: `null` berarti "belum diverifikasi",
   * BUKAN "dokumen belum diunggah".
   */
  verifikasiIdentitas: {
    status: "terverifikasi" | "ditolak";
    pada: number;
    olehLabel: string;
    catatan?: string;
  } | null;
};

export function PanelDataDiriNasabah({ userId }: { userId: Id<"users"> }) {
  const data = useQuery(api.admin.dataDiriNasabah, { userId });

  if (data === undefined) {
    return <MemuatBaris teks="Memuat data diri tersimpan…" className="py-3" />;
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
                Diperbarui {formatWaktuWIB(data.diperbaruiPada)} WIB oleh{" "}
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
            <PenampilDokumen
              src={data.fotoKtpUrl}
              label="KTP tersimpan"
              petunjuk="Perbesar untuk mencocokkan NIK/nama dengan isian pengajuan."
            />
          ) : (
            <p className="inline-flex w-full items-center justify-center rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-muted-foreground">
              Belum ada foto KTP tersimpan.
            </p>
          )}
          <VerifikasiIdentitasRingkas verifikasi={data.verifikasiIdentitas} />
        </>
      )}
    </div>
  );
}

/**
 * Putusan VERIFIKASI IDENTITAS petugas — sengaja berdiri sendiri dari keputusan
 * pinjaman. Panel ini hanya membacanya; yang memutuskan adalah petugas lewat
 * panel Nasabah. Tidak ada putusan (`null`) ditampilkan sebagai "belum
 * diverifikasi", bukan "sudah" — mengunggah dokumen tidak pernah dianggap
 * sebagai bukti identitas telah terverifikasi.
 */
export function VerifikasiIdentitasRingkas({
  verifikasi,
}: {
  verifikasi: DataDiriTampil["verifikasiIdentitas"];
}) {
  if (verifikasi === null) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 px-3 py-2.5">
        <p className="text-xs font-medium text-muted-foreground">Belum diverifikasi</p>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
          Identitas nasabah ini belum diputuskan petugas. Dokumen yang diunggah tidak otomatis
          berarti terverifikasi — petugas perlu mencatat putusannya.
        </p>
      </div>
    );
  }
  const terverifikasi = verifikasi.status === "terverifikasi";
  return (
    <div
      className={
        terverifikasi
          ? "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5"
          : "rounded-xl border border-red-200 bg-red-50 px-3 py-2.5"
      }
    >
      <p
        className={
          terverifikasi
            ? "flex items-center gap-1.5 text-xs font-semibold text-emerald-800"
            : "flex items-center gap-1.5 text-xs font-semibold text-red-800"
        }
      >
        {terverifikasi ? (
          <BadgeCheck className="size-4" aria-hidden />
        ) : (
          <ShieldX className="size-4" aria-hidden />
        )}
        {terverifikasi ? "Identitas terverifikasi" : "Verifikasi identitas ditolak"}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
        Diputuskan {formatWaktuWIB(verifikasi.pada)} WIB oleh {verifikasi.olehLabel}.
        Keputusan ini terpisah dari keputusan pinjaman.
      </p>
      {verifikasi.catatan !== undefined && verifikasi.catatan !== "" && (
        <p className="mt-1 text-[11px] leading-4 text-navy">Catatan: {verifikasi.catatan}</p>
      )}
    </div>
  );
}
