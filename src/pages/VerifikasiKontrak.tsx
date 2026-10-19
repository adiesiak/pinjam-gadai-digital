import { useQuery } from "convex/react";
import { ArrowLeft, BadgeCheck, FileSearch, ShieldQuestion } from "lucide-react";
import { Link, useParams } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { waktuTerbitWib } from "@/lib/kontrakDigital";
import { formatRupiah } from "@/lib/money";

/**
 * Halaman publik verifikasi dokumen kontrak.
 *
 * Yang ditampilkan hanya data non-pribadi yang sudah disimpan server: kode,
 * nomor referensi, jenis, pokok, waktu terbit, dan hash. Nama, NIK, dan rekening
 * tidak pernah dikirim ke halaman ini — membuka kode tidak sama dengan membuka
 * berkas nasabah.
 */
export default function VerifikasiKontrak() {
  const { kode = "" } = useParams();
  const hasil = useQuery(api.kontrakDigital.verifikasiPublik, { kode });

  return (
    <main className="min-h-screen bg-[#f6f4ec] px-4 py-10 text-slate-900 sm:px-6 sm:py-16">
      <div className="mx-auto w-full max-w-2xl">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-emerald-900 underline decoration-emerald-800/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Kembali ke PINDAI
        </Link>

        <section className="mt-6 overflow-hidden rounded-3xl border border-emerald-950/10 bg-white shadow-[0_24px_70px_-48px_rgba(6,78,59,0.55)]">
          <header className="border-b border-emerald-950/10 bg-[#064E3B] px-6 py-6 text-white sm:px-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-100/80">
              Verifikasi dokumen
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Sidik jari kontrak PINDAI
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-emerald-50/85">
              Cocokkan kode dan hash pada dokumen cetak/PDF dengan yang tercatat di
              halaman ini. Halaman ini tidak menampilkan data pribadi nasabah.
            </p>
          </header>

          <div className="px-6 py-6 sm:px-8 sm:py-8">
            {hasil === undefined ? (
              <div className="space-y-3" role="status" aria-live="polite">
                <span className="sr-only">Memeriksa kode dokumen…</span>
                <Skeleton className="h-6 w-40 rounded-lg" />
                <Skeleton className="h-4 w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4 rounded-lg" />
              </div>
            ) : hasil === null ? (
              <div className="flex gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                  <ShieldQuestion className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-base font-semibold">Kode tidak ditemukan</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Kode <span className="font-mono font-semibold">{kode}</span> tidak
                    cocok dengan dokumen yang diterbitkan sistem. Periksa kembali
                    penulisannya; kode peka terhadap salah ketik, bukan terhadap huruf
                    besar/kecil.
                  </p>
                  <Button asChild variant="outline" className="mt-4 rounded-full">
                    <Link to="/biaya">Baca informasi layanan</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Badge className="gap-1.5 rounded-full border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-900">
                    <BadgeCheck className="size-3.5" aria-hidden="true" />
                    Tercatat di sistem
                  </Badge>
                  <span className="font-mono text-sm font-semibold tracking-[0.12em] text-emerald-950">
                    {hasil.kode}
                  </span>
                </div>

                <dl className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm sm:grid-cols-2 sm:p-5">
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                      Jenis dokumen
                    </dt>
                    <dd className="mt-1 font-medium capitalize">{hasil.jenis}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                      Nomor referensi
                    </dt>
                    <dd className="mt-1 font-mono font-medium">{hasil.nomorReferensi}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                      Pokok tercatat
                    </dt>
                    <dd className="mt-1 font-medium tabular-nums">{formatRupiah(hasil.pokok)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                      Diterbitkan
                    </dt>
                    <dd className="mt-1 font-medium">{waktuTerbitWib(hasil.diterbitkanPada)} WIB</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                      SHA-256
                    </dt>
                    <dd className="mt-1 break-all font-mono text-xs leading-6 text-slate-700">
                      {hasil.hash}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                      Versi syarat
                    </dt>
                    <dd className="mt-1 font-medium">{hasil.versi}</dd>
                  </div>
                </dl>

                <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm leading-6 text-amber-950">
                  <FileSearch className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                  <p>
                    Hash di atas membuktikan data kontrak yang tersimpan di PINDAI tidak
                    berubah sejak ditandatangani. Halaman ini bukan pengganti
                    pemeriksaan identitas penanda tangan; verifikasi KYC dan tanda
                    tangan tetap tercatat terpisah di sistem.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <p className="mt-6 text-center text-xs leading-5 text-slate-500">
          PT Pinjam Gadai Digital · PINDAI. Dokumen yang tidak dapat diverifikasi di
          halaman ini sebaiknya tidak diperlakukan sebagai berkas resmi.
        </p>
      </div>
    </main>
  );
}
