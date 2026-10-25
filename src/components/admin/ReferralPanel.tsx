/**
 * Panel referral di menu Voucher.
 *
 * Menjawab tiga pertanyaan admin: berapa klaim yang masuk, siapa yang paling
 * banyak mengajak, dan klaim mana yang perlu dibatalkan. Voucher hadiahnya
 * sendiri tetap terlihat di daftar voucher dengan label "Referral".
 */
import { useMutation, useQuery } from "convex/react";
import { Loader2, Users, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { StatusKlaimReferral } from "@/lib/referral";
import { formatRupiahAman } from "@/lib/money";
import { formatTanggalWIB } from "@/lib/waktu";
import { cn } from "@/lib/utils";

const KELAS_STATUS: Record<StatusKlaimReferral, string> = {
  menunggu_lunas: "border-amber-200 bg-amber-50 text-amber-800",
  hadiah_diberikan: "border-emerald-200 bg-emerald-50 text-emerald-800",
  batal: "border-slate-200 bg-slate-100 text-slate-600",
};

export function ReferralPanel({ className }: { className?: string }) {
  const data = useQuery(api.referral.daftarAdmin);
  const batalkan = useMutation(api.referral.batalkanKlaim);
  const [dibatalkan, setDibatalkan] = useState<{ id: string; kode: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const konfirmasi = async () => {
    if (dibatalkan === null) return;
    setSibuk(true);
    try {
      await batalkan({ klaimId: dibatalkan.id as Id<"referralKlaim"> });
      toast.success(`Klaim ${dibatalkan.kode} dibatalkan.`);
      setDibatalkan(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Klaim gagal dibatalkan.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <section
      className={cn("rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5", className)}
      aria-labelledby="judul-referral-admin"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2
            id="judul-referral-admin"
            className="flex items-center gap-2 text-lg font-semibold text-navy"
          >
            <Users className="size-4 text-primary" aria-hidden="true" />
            Referral nasabah
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Hadiah {formatRupiahAman(data?.hadiah.perujuk ?? 0)} untuk pemilik kode dan{" "}
            {formatRupiahAman(data?.hadiah.pengundang ?? 0)} untuk pemakai kode, terbit saat
            pinjaman pertama pemakai kode lunas. Batas {data?.hadiah.maksPerBulan ?? 10} hadiah
            perujuk per bulan.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
          {data === undefined ? "Memuat…" : `${data.total.klaim} klaim`}
        </span>
      </div>

      {data === undefined ? (
        <p role="status" className="mt-3 text-sm text-slate-500">
          Memuat klaim referral…
        </p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Menunggu lunas", nilai: data.total.menunggu },
              { label: "Berhasil", nilai: data.total.berhasil },
              { label: "Dibatalkan", nilai: data.total.batal },
              { label: "Klaim tampil", nilai: data.daftar.length },
            ].map((kotak) => (
              <div key={kotak.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {kotak.label}
                </dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                  {kotak.nilai}
                </dd>
              </div>
            ))}
          </dl>

          {data.peringkat.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium text-slate-500">Paling banyak mengajak:</span>
              {data.peringkat.map((orang) => (
                <span
                  key={orang.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-900"
                >
                  <strong className="font-semibold">{orang.nama}</strong>
                  <span className="text-emerald-700">
                    {orang.berhasil}/{orang.jumlah}
                  </span>
                </span>
              ))}
            </div>
          )}

          {data.daftar.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500">
              Belum ada klaim referral. Kode dibagikan nasabah dari kartu Ringkasan dashboard.
            </p>
          ) : (
            <div className="mt-3 hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
              <table className="w-full min-w-[44rem] text-xs">
                <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Kode</th>
                    <th className="px-3 py-2 font-semibold">Perujuk</th>
                    <th className="px-3 py-2 font-semibold">Pemakai kode</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Diklaim</th>
                    <th className="px-3 py-2 text-right font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.daftar.map((baris) => (
                    <tr key={baris.id} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{baris.kode}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{baris.perujuk}</td>
                      <td className="px-3 py-2 text-slate-700">{baris.pengundang}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            KELAS_STATUS[baris.status],
                          )}
                        >
                          {baris.labelStatus}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {formatTanggalWIB(baris.diklaimPada)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {baris.status === "menunggu_lunas" ? (
                          <button
                            type="button"
                            onClick={() => setDibatalkan({ id: baris.id, kode: baris.kode })}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-800 hover:bg-rose-50"
                          >
                            <XCircle className="size-3" aria-hidden="true" />
                            Batalkan
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.daftar.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 md:hidden">
              {data.daftar.map((baris) => (
                <li key={baris.id} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-500">{baris.kode}</span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        KELAS_STATUS[baris.status],
                      )}
                    >
                      {baris.labelStatus}
                    </span>
                    <span className="ml-auto text-[10px] text-slate-500">
                      {formatTanggalWIB(baris.diklaimPada)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-800">
                    {baris.perujuk} → {baris.pengundang}
                  </p>
                  {baris.status === "menunggu_lunas" && (
                    <button
                      type="button"
                      onClick={() => setDibatalkan({ id: baris.id, kode: baris.kode })}
                      className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-800 hover:bg-rose-50"
                    >
                      <XCircle className="size-3" aria-hidden="true" />
                      Batalkan klaim
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {data.dibatasi && (
            <p className="mt-2 text-[11px] text-amber-800">
              Menampilkan {data.daftar.length} klaim terbaru; statistik di atas dihitung dari seluruh
              klaim.
            </p>
          )}
        </>
      )}

      <AlertDialog
        open={dibatalkan !== null}
        onOpenChange={(terbuka) => {
          if (!terbuka && !sibuk) setDibatalkan(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan klaim {dibatalkan?.kode}?</AlertDialogTitle>
            <AlertDialogDescription>
              Klaim ditandai batal, tidak lagi menunggu pelunasan, dan tidak menerbitkan hadiah.
              Tindakan ini tercatat di audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sibuk}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={sibuk}
              onClick={(e) => {
                e.preventDefault();
                void konfirmasi();
              }}
            >
              {sibuk && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Batalkan klaim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
