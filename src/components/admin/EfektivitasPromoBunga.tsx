/**
 * Laporan efektivitas bunga promo.
 *
 * Menjawab satu pertanyaan: kampanye mana yang benar-benar dipakai, dan berapa
 * rupiah bunga yang disubsidi platform karenanya. Angka pinjaman dibaca dari
 * snapshot (`promoBungaPersen` dan `promoBungaPersenNormal`), bukan dari tarif
 * promo hari ini, jadi laporan tidak berubah saat kampanye disunting.
 */
import { useQuery } from "convex/react";
import { BarChart3, Download, Info } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { csvEfektivitasPromo } from "@/lib/csvPromoBunga";
import {
  KELAS_STATUS_PROMO_BUNGA,
  LABEL_STATUS_PROMO_BUNGA,
} from "@/lib/promoBunga";
import { formatRupiahAman } from "@/lib/money";
import { formatPeriodePromo, tanggalKeMsWIB } from "@/lib/promoPinjaman";
import { tanggalWIB } from "@/lib/waktu";

/** Unduh teks CSV sebagai berkas; BOM supaya Excel membaca UTF-8. */
function unduhCsv(nama: string, isi: string): void {
  const blob = new Blob([`\uFEFF${isi}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const tautan = document.createElement("a");
  tautan.href = url;
  tautan.download = nama;
  document.body.appendChild(tautan);
  tautan.click();
  tautan.remove();
  URL.revokeObjectURL(url);
}

export function EfektivitasPromoBunga({ className }: { className?: string }) {
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const mulaiMs = dari === "" ? undefined : (tanggalKeMsWIB(dari) ?? undefined);
  const selesaiMs = sampai === "" ? undefined : (tanggalKeMsWIB(sampai, true) ?? undefined);
  const data = useQuery(api.promoBunga.efektivitas, {
    ...(mulaiMs === undefined ? {} : { dari: mulaiMs }),
    ...(selesaiMs === undefined ? {} : { sampai: selesaiMs }),
  });
  const adaSaringan = dari !== "" || sampai !== "";

  return (
    <section className={className} aria-labelledby="judul-efektivitas-promo">
      <div className="max-w-2xl">
        <h3
          id="judul-efektivitas-promo"
          className="flex items-center gap-2 text-sm font-semibold text-slate-900"
        >
          <BarChart3 className="size-4 text-primary" aria-hidden="true" />
          Efektivitas promo
        </h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Pinjaman yang lahir saat promo berlaku dan subsidi bunga yang ditanggung
          platform. Voucher potongan bunga dihitung terpisah, bukan bagian dari angka ini.
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-[11px] font-medium text-slate-600">
          Pengajuan dari
          <Input
            type="date"
            className="mt-0.5 h-9 w-36"
            value={dari}
            max={sampai === "" ? undefined : sampai}
            onChange={(e) => setDari(e.target.value)}
          />
        </label>
        <label className="text-[11px] font-medium text-slate-600">
          sampai
          <Input
            type="date"
            className="mt-0.5 h-9 w-36"
            value={sampai}
            min={dari === "" ? undefined : dari}
            onChange={(e) => setSampai(e.target.value)}
          />
        </label>
        {adaSaringan && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setDari("");
              setSampai("");
            }}
          >
            Semua tanggal
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto gap-1.5"
          disabled={data === undefined || data.baris.length === 0}
          onClick={() => {
            if (data === undefined) return;
            unduhCsv(
              `efektivitas-promo-${tanggalWIB(Date.now())}.csv`,
              csvEfektivitasPromo(
                data.baris.map((baris) => ({
                  ...baris,
                  status: LABEL_STATUS_PROMO_BUNGA[baris.status],
                })),
              ),
            );
          }}
        >
          <Download className="size-3.5" aria-hidden="true" />
          Unduh CSV
        </Button>
      </div>

      {data === undefined ? (
        <p role="status" className="mt-3 text-xs text-slate-500">
          Menghitung pemakaian promo…
        </p>
      ) : data.baris.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-3 py-4 text-xs text-slate-500">
          {adaSaringan
            ? "Tidak ada pinjaman promo pada rentang tanggal ini. Longgarkan tanggalnya atau pilih Semua tanggal."
            : "Belum ada promo bunga yang dibuat, jadi belum ada yang bisa diukur."}
        </p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <AngkaRingkas label="Pinjaman" nilai={String(data.total.pinjaman)} />
            <AngkaRingkas label="Pokok" nilai={formatRupiahAman(data.total.pokok)} />
            <AngkaRingkas
              label="Subsidi bunga"
              nilai={formatRupiahAman(data.total.subsidi)}
              aksen
            />
            <AngkaRingkas
              label="Rata-rata / pinjaman"
              nilai={
                data.total.pinjaman > 0
                  ? formatRupiahAman(Math.round(data.total.subsidi / data.total.pinjaman))
                  : "—"
              }
            />
          </dl>

          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[34rem] text-xs">
              <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Promo</th>
                  <th className="px-3 py-2 text-right font-semibold">Pinjaman</th>
                  <th className="px-3 py-2 text-right font-semibold">Pokok</th>
                  <th className="px-3 py-2 text-right font-semibold">Subsidi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.baris.map((baris) => (
                  <tr key={baris.id} className="align-top transition-colors hover:bg-slate-50/70">
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${KELAS_STATUS_PROMO_BUNGA[baris.status]}`}
                        >
                          {LABEL_STATUS_PROMO_BUNGA[baris.status]}
                        </span>
                        <span className="font-medium text-slate-800">{baris.nama}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {baris.persenBunga}% · tenor {baris.tenor.join(" / ")} hari ·{" "}
                        {formatPeriodePromo(baris.mulai, baris.selesai)}
                      </p>
                      {baris.perkiraan && (
                        <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-amber-800">
                          <Info className="size-3" aria-hidden="true" />
                          sebagian pinjaman lama: subsidi memakai tarif promo saat ini
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {baris.pinjaman}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {formatRupiahAman(baris.pokok)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-emerald-900">
                      {formatRupiahAman(baris.subsidi)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.dibatasi && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
              Salah satu promo sudah dipakai lebih dari 500 pinjaman. Angka di tabel
              dihitung dari 500 pinjaman terbaru promo itu, jadi subsidi sebenarnya bisa
              lebih besar.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function AngkaRingkas({
  label,
  nilai,
  aksen = false,
}: {
  label: string;
  nilai: string;
  aksen?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm font-semibold tabular-nums ${
          aksen ? "text-emerald-900" : "text-slate-900"
        }`}
      >
        {nilai}
      </dd>
    </div>
  );
}
