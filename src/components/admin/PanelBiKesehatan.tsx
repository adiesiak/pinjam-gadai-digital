/**
 * Panel "BI & Kesehatan" — metrik siap + sinyal operasional, dalam satu layar.
 *
 * Kenapa digabung: keduanya menjawab pertanyaan yang sama pada praktiknya —
 * "apakah hari ini berjalan normal?" — dan keduanya juga tidak boleh menampilkan
 * angka yang belum layak. Metrik tunda dari dokumen definisi ditampilkan
 * bersama alasannya, dan sinyal yang tidak terukur (latency, error rate,
 * kesehatan basis data) dinyatakan sebagai tidak diukur, bukan disembunyikan.
 *
 * Yang ditampilkan di sini berasal dari `convex/bi.ts` dan `convex/kesehatan.ts`;
 * keduanya admin ber-TOTP.
 */
import { useQuery } from "convex/react";
import { Activity, BarChart3, Loader2 } from "lucide-react";
import { useState } from "react";

import { api } from "@/convex/_generated/api";
import {
  LABEL_PERIODE_BI,
  METRIK_TUNDA,
  PERIODE_BI,
  definisiMetrik,
  labelMetrik,
  type PeriodeBi,
} from "@/lib/biMetrik";
import { formatRupiah } from "@/lib/money";

import { PanelMemuat } from "./admin-shared";

type MetrikBaris = {
  kode: string;
  nilai: number;
  satuan: "pengajuan" | "pinjaman" | "rupiah" | "gadai" | "kredit" | "nasabah" | "kasus";
  keterangan: string;
};

type SinyalBaris = {
  kunci: string;
  judul: string;
  nilai: number;
  ambang: string;
  sumber: string;
  keterangan: string;
  contoh: string | null;
};

function nilaiTampil(metrik: MetrikBaris): string {
  if (metrik.satuan === "rupiah") return formatRupiah(metrik.nilai);
  return `${metrik.nilai} ${metrik.satuan}`;
}

/**
 * Daftar metrik SIAP — komponen MURNI (tanpa server) supaya bisa diuji dengan
 * render statis. Setiap kartu menyebut sumber/keterangannya, karena angka BI
 * tanpa sumber tidak dapat dipercaya.
 */
export function DaftarMetrikBI({ metrik }: { metrik: MetrikBaris[] }) {
  if (metrik.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Belum ada metrik yang dapat dihitung pada periode ini.
      </p>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {metrik.map((m) => (
        <div key={m.kode} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {m.kode}
          </p>
          <p className="mt-0.5 text-sm font-medium text-navy">{labelMetrik(m.kode)}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-navy">{nilaiTampil(m)}</p>
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
            Sumber: {definisiMetrik(m.kode)?.sumber ?? "—"} · {m.keterangan}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Daftar sinyal kesehatan — MURNI (tanpa server) dan dapat diuji. */
export function DaftarSinyalKesehatan({ sinyal }: { sinyal: SinyalBaris[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1.5 pr-3 font-medium">Sinyal</th>
            <th className="py-1.5 pr-3 font-medium">Nilai</th>
            <th className="py-1.5 pr-3 font-medium">Sumber &amp; jendela</th>
            <th className="py-1.5 font-medium">Catatan</th>
          </tr>
        </thead>
        <tbody>
          {sinyal.map((s) => (
            <tr key={s.kunci} className="border-t border-slate-100 align-top">
              <td className="py-1.5 pr-3 text-slate-700">{s.judul}</td>
              <td className="py-1.5 pr-3 tabular-nums font-medium text-navy">{s.nilai}</td>
              <td className="py-1.5 pr-3 text-muted-foreground">{s.sumber}</td>
              <td className="py-1.5 text-slate-700">
                {s.keterangan}
                {s.contoh !== null && (
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    Contoh respons terakhir: {s.contoh}
                  </span>
                )}
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  Ambang: {s.ambang}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PanelBiKesehatan() {
  const [periode, setPeriode] = useState<PeriodeBi>("bulanan");
  const bi = useQuery(api.bi.ringkasanBI, { periode });
  const kesehatan = useQuery(api.kesehatan.kesehatanSistem, {});

  return (
    <div className="space-y-5">
      <section className="animate-masuk rounded-2xl border border-slate-200 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <BarChart3 className="size-4 text-primary" /> Metrik BI
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Definisi tiap metrik mengikuti register di <code>docs/bi-metrik-definisi.md</code>.
          Metrik yang belum punya definisi aman <b>tidak</b> ditampilkan sebagai nol.
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {PERIODE_BI.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriode(p)}
              className={
                p === periode
                  ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-navy hover:bg-slate-50"
              }
            >
              {LABEL_PERIODE_BI[p]}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {bi === undefined ? (
            <PanelMemuat baris={2} />
          ) : (
            <>
              <DaftarMetrikBI metrik={bi.metrik} />
              <p className="mt-2 text-[10px] text-muted-foreground">
                Dihitung {new Date(bi.dihitungPada).toLocaleString("id-ID")} · rentang{" "}
                {bi.rentang.mulai === 0
                  ? "seluruh catatan"
                  : `${new Date(bi.rentang.mulai).toLocaleString("id-ID")} — sekarang`}
                .
              </p>
            </>
          )}
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="text-xs font-semibold text-navy">Metrik yang belum tersedia</p>
          <ul className="mt-2 space-y-1.5">
            {METRIK_TUNDA.map((m) => (
              <li key={m.kode} className="text-[11px] leading-5 text-slate-700">
                <b>
                  {m.kode} · {m.label}
                </b>{" "}
                <span className="text-muted-foreground">({m.sumber})</span>
                <span className="block text-muted-foreground">{m.catatan}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="animate-masuk rounded-2xl border border-slate-200 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <Activity className="size-4 text-emerald-600" /> Kesehatan sistem
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Setiap angka menyebut sumber dan jendela waktunya. Ringkasan ledger tidak diulang di
          sini — kartunya sudah ada di ringkasan admin.
        </p>

        {kesehatan === undefined ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Memuat sinyal kesehatan…
          </div>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={
                  kesehatan.konfigurasi.killSwitch
                    ? "rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
                    : "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                }
              >
                Kill switch: {kesehatan.konfigurasi.killSwitch ? "AKTIF" : "nonaktif"}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                Mode perawatan: {kesehatan.konfigurasi.maintenanceMode ? "aktif" : "nonaktif"}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                Konfigurasi versi {kesehatan.konfigurasi.versi}
              </span>
            </div>

            <div className="mt-4">
              <DaftarSinyalKesehatan sinyal={kesehatan.sinyal} />
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-xs font-semibold text-navy">Sengaja tidak diukur</p>
              <ul className="mt-2 space-y-1.5">
                {kesehatan.tidakTerukur.map((t) => (
                  <li key={t.judul} className="text-[11px] leading-5 text-slate-700">
                    <b>{t.judul}</b>
                    <span className="block text-muted-foreground">{t.alasan}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
