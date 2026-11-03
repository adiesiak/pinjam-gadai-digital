/**
 * Laporan efektivitas bunga promo.
 *
 * Menjawab satu pertanyaan: kampanye mana yang benar-benar dipakai, dan berapa
 * rupiah bunga yang disubsidi platform karenanya. Angka pinjaman dibaca dari
 * snapshot (`promoBungaPersen` dan `promoBungaPersenNormal`), bukan dari tarif
 * promo hari ini, jadi laporan tidak berubah saat kampanye disunting.
 */
import { useQuery } from "convex/react";
import { BarChart3, Download, FileText, Info } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { csvEfektivitasPromo } from "@/lib/csvPromoBunga";
import { buatPdfLaporanPromo } from "@/lib/laporanPromoPdf";
import {
  KELAS_STATUS_PROMO_BUNGA,
  LABEL_STATUS_PROMO_BUNGA,
} from "@/lib/promoBunga";
import { formatRupiahAman } from "@/lib/money";
import { formatPeriodePromo, tanggalKeMsWIB } from "@/lib/promoPinjaman";
import { formatTanggalWIB, tanggalWIB } from "@/lib/waktu";
import type { TrenMingguan } from "@/lib/trenPromo";

/** Unduh isi berkas dari memori; tidak ada permintaan jaringan. */
function unduhBerkas(nama: string, isi: string | Uint8Array, tipe: string): void {
  // Salin ke ArrayBuffer biasa: tipe `Uint8Array` di TS 5.7 masih membawa
  // ArrayBufferLike (termasuk SharedArrayBuffer) yang bukan BlobPart.
  const bagian: BlobPart =
    typeof isi === "string" ? isi : (new Uint8Array(isi).buffer as ArrayBuffer);
  const blob = new Blob([bagian], { type: tipe });
  const url = URL.createObjectURL(blob);
  const tautan = document.createElement("a");
  tautan.href = url;
  tautan.download = nama;
  document.body.appendChild(tautan);
  tautan.click();
  tautan.remove();
  URL.revokeObjectURL(url);
}

/** CSV dengan BOM supaya Excel membaca UTF-8. */
function unduhCsv(nama: string, isi: string): void {
  unduhBerkas(nama, `\uFEFF${isi}`, "text/csv;charset=utf-8");
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
          Pinjaman yang lahir saat promo berlaku dan subsidi promo yang ditanggung
          platform, termasuk biaya admin yang dibebaskan. Voucher potongan bunga dihitung
          terpisah, bukan bagian dari angka ini.
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
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
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
            CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={data === undefined || data.baris.length === 0}
            onClick={() => {
              if (data === undefined) return;
              const berkas = buatPdfLaporanPromo({
                baris: data.baris.map((baris) => ({
                  nama: baris.nama,
                  status: baris.status,
                  jenis: baris.jenis,
                  persenBunga: baris.persenBunga,
                  potonganPersen: baris.potonganPersen,
                  tenor: baris.tenor,
                  mulai: baris.mulai,
                  selesai: baris.selesai,
                  pinjaman: baris.pinjaman,
                  pokok: baris.pokok,
                  subsidi: baris.subsidi,
                })),
                tren: data.tren,
                total: data.total,
                periode:
                  mulaiMs === undefined && selesaiMs === undefined
                    ? null
                    : {
                        ...(mulaiMs === undefined ? {} : { dari: mulaiMs }),
                        ...(selesaiMs === undefined ? {} : { sampai: selesaiMs }),
                      },
                dibuatPada: Date.now(),
                dibatasi: data.dibatasi,
              });
              unduhBerkas(
                `laporan-promo-${tanggalWIB(Date.now())}.pdf`,
                berkas,
                "application/pdf",
              );
            }}
          >
            <FileText className="size-3.5" aria-hidden="true" />
            PDF
          </Button>
        </div>
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
          {data.tren.length > 0 && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-slate-800">Tren mingguan</p>
                <p className="text-[10px] text-slate-500">
                  Batang = subsidi promo · angka di atas = jumlah pinjaman · minggu mulai
                  Senin (WIB)
                </p>
              </div>
              <GrafikTrenPromo tren={data.tren} />
            </div>
          )}

          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <AngkaRingkas label="Pinjaman" nilai={String(data.total.pinjaman)} />
            <AngkaRingkas label="Pokok" nilai={formatRupiahAman(data.total.pokok)} />
            <AngkaRingkas
              label="Subsidi promo"
              nilai={formatRupiahAman(data.total.subsidi)}
              aksen
            />
            <AngkaRingkas
              label="Subsidi voucher"
              nilai={formatRupiahAman(data.total.subsidiVoucher)}
            />
            <AngkaRingkas
              label="Total subsidi"
              nilai={formatRupiahAman(data.total.subsidiGabungan)}
            />
          </dl>
          <p className="mt-2 text-[11px] leading-4 text-slate-500">
            Subsidi voucher dihitung terpisah karena ia tidak dibatasi pagu kampanye. Yang
            perlu dijaga justru jumlah keduanya: promo dan voucher sama-sama mengurangi
            pendapatan platform, walau hanya promo yang berhenti sendiri saat pagunya habis.
          </p>

          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[34rem] text-xs">
              <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Promo</th>
                  <th className="px-3 py-2 text-right font-semibold">Pinjaman</th>
                  <th className="px-3 py-2 text-right font-semibold">Pokok</th>
                  <th className="px-3 py-2 text-right font-semibold">Subsidi</th>
                  <th className="px-3 py-2 text-right font-semibold">Voucher</th>
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
                        {baris.jenis === "bebas_admin"
                          ? "Bebas biaya admin"
                          : baris.jenis === "potongan_bunga"
                            ? `Potongan ${baris.potonganPersen ?? 0} poin`
                            : `${baris.persenBunga}%`}{" "}
                        · tenor {baris.tenor.join(" / ")} hari ·{" "}
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
                      {baris.paguSubsidi !== null && baris.paguSubsidi > 0 && (
                        <div className="mt-1">
                          <div
                            className="ml-auto h-1 w-20 overflow-hidden rounded-full bg-slate-200"
                            role="img"
                            aria-label={`Pagu terpakai ${Math.min(
                              100,
                              Math.round((baris.subsidi / baris.paguSubsidi) * 100),
                            )}%`}
                          >
                            <div
                              className={
                                baris.subsidi >= baris.paguSubsidi
                                  ? "h-full rounded-full bg-destructive"
                                  : "h-full rounded-full bg-success"
                              }
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.round((baris.subsidi / baris.paguSubsidi) * 100),
                                )}%`,
                              }}
                            />
                          </div>
                          <p className="mt-0.5 text-[10px] font-normal text-slate-500">
                            {Math.round((baris.subsidi / baris.paguSubsidi) * 100)}% dari{" "}
                            {formatRupiahAman(baris.paguSubsidi)}
                          </p>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      {baris.subsidiVoucher === 0
                        ? "—"
                        : formatRupiahAman(baris.subsidiVoucher)}
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

/**
 * Grafik batang SVG biasa, bukan pustaka grafik: `recharts` di repo ini gagal
 * dimuat di lingkungan build (lihat RingkasanAnalitik). Satu seri batang cukup —
 * subsidi (rupiah) dan pemakaian (jumlah) beda skala, jadi jumlah pinjaman
 * dicetak di atas batangnya alih-alih dipaksa ke sumbu kedua.
 */
export function GrafikTrenPromo({ tren }: { tren: readonly TrenMingguan[] }) {
  const LEBAR = 560;
  const TINGGI = 176;
  const KIRI = 58;
  const KANAN = 8;
  const ATAS = 24;
  const BAWAH = 28;
  const lebarPlot = LEBAR - KIRI - KANAN;
  const tinggiPlot = TINGGI - ATAS - BAWAH;

  // Dua belas minggu terakhir supaya batang tetap terbaca di panel selebar apa pun.
  const tampil = tren.slice(-12);
  const maks = Math.max(1, ...tampil.map((baris) => baris.subsidi));
  const langkah = lebarPlot / tampil.length;
  const lebarBatang = Math.min(38, langkah * 0.52);

  const ringkas = (nilai: number): string => {
    if (nilai >= 1_000_000) {
      return `Rp${(nilai / 1_000_000).toLocaleString("id-ID", {
        maximumFractionDigits: 1,
      })}jt`;
    }
    if (nilai >= 1_000) return `Rp${Math.round(nilai / 1_000)}rb`;
    return `Rp${nilai}`;
  };

  const total = tampil.reduce((jumlah, baris) => jumlah + baris.subsidi, 0);

  return (
    <svg
      viewBox={`0 0 ${LEBAR} ${TINGGI}`}
      className="mt-2 h-44 w-full"
      role="img"
      aria-label={`Tren subsidi promo ${tampil.length} minggu terakhir, total ${formatRupiahAman(total)}`}
    >
      {[0, 0.5, 1].map((bagian) => {
        const y = ATAS + tinggiPlot * (1 - bagian);
        return (
          <g key={bagian}>
            <line
              x1={KIRI}
              x2={LEBAR - KANAN}
              y1={y}
              y2={y}
              stroke="var(--border)"
              strokeDasharray={bagian === 0 ? undefined : "3 4"}
            />
            <text x={KIRI - 6} y={y + 3} textAnchor="end" fontSize={12} fill="var(--muted-foreground)">
              {ringkas(maks * bagian)}
            </text>
          </g>
        );
      })}

      {tampil.map((baris, indeks) => {
        const tinggi = (baris.subsidi / maks) * tinggiPlot;
        const x = KIRI + indeks * langkah + (langkah - lebarBatang) / 2;
        const y = ATAS + tinggiPlot - tinggi;
        return (
          <g key={baris.mulai}>
            <rect
              x={x}
              y={y}
              width={lebarBatang}
              height={Math.max(1, tinggi)}
              rx={3}
              fill="var(--chart-1)"
              opacity={0.85}
            >
              <title>
                {`Minggu ${formatTanggalWIB(baris.mulai)} · ${baris.pinjaman} pinjaman · ${formatRupiahAman(baris.subsidi)}`}
              </title>
            </rect>
            <text
              x={x + lebarBatang / 2}
              y={Math.max(ATAS - 6, y - 6)}
              textAnchor="middle"
              fontSize={12}
              fill="var(--navy)"
              fontWeight={600}
            >
              {baris.pinjaman}
            </text>
            <text
              x={x + lebarBatang / 2}
              y={TINGGI - 8}
              textAnchor="middle"
              fontSize={12}
              fill="var(--muted-foreground)"
            >
              {formatTanggalWIB(baris.mulai, { day: "numeric", month: "short" })}
            </text>
          </g>
        );
      })}
    </svg>
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
