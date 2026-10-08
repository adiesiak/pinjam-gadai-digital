import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import {
  JENIS_HAPUS,
  LABEL_JENIS,
  labelBarisHapus,
  ringkasRincianHapus,
  type JenisHapus,
} from "@/lib/auditHapus";

const AKSI_HAPUS_PANEL = ["loan_delete", "kredit_delete", "pawn_delete"];

/**
 * Rekam jejak aktivitas admin + daftar PENGHAPUSAN data.
 *
 * Bagian penghapusan sengaja terpisah dari daftar "terbaru": penghapusan itu
 * peristiwa langka, jadi menyaring 10 entri terakhir akan membuatnya hampir
 * tidak pernah terlihat. Angkanya dibaca dari rincian terstruktur
 * (`rincianHapus`) hasil mutation penghapusan — bukan dihitung ulang dari teks
 * atau ditebak. Baris lama tanpa rincian dilaporkan apa adanya sebagai
 * "tanpa rincian", tidak dikarang.
 */
export function AuditTrailPanel() {
  const data = useQuery(api.system.getConfigAdmin);
  const [jenis, setJenis] = useState<JenisHapus>("semua");
  const hapus = useQuery(api.system.auditPenghapusan, { jenis });
  const isDeletion = (aksi: string) => AKSI_HAPUS_PANEL.includes(aksi);

  if (data === undefined) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat…
      </div>
    );
  }

  const ringkasan = hapus?.ringkasan;

  return (
    <div className="space-y-4">
      <section className="animate-masuk rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-navy">Penghapusan data</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Setiap penghapusan menyimpan alasan dan jumlah baris yang ikut terhapus. Jurnal ledger
              tidak pernah dihapus — angka &quot;dipertahankan&quot; di bawah menunjukkan jejak
              keuangan yang tetap ada.
            </p>
          </div>
          {ringkasan !== undefined && (
            <Badge
              className={
                ringkasan.menyeluruh === 0
                  ? "bg-slate-100 text-slate-700 hover:bg-slate-100"
                  : "bg-amber-100 text-amber-800 hover:bg-amber-100"
              }
            >
              {ringkasan.jumlah} penghapusan
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2 px-5 pb-4" role="group" aria-label="Saring penghapusan">
          {JENIS_HAPUS.map((nilai) => (
            <Button
              key={nilai}
              size="sm"
              variant={jenis === nilai ? "default" : "outline"}
              aria-pressed={jenis === nilai}
              onClick={() => setJenis(nilai)}
            >
              {LABEL_JENIS[nilai]}
            </Button>
          ))}
        </div>

        {hapus === undefined || ringkasan === undefined ? (
          <div className="flex items-center gap-2 px-5 pb-5 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Menghitung rincian penghapusan…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 px-5 pb-4 sm:grid-cols-4">
              {([
                ["Penghapusan menyeluruh", `${ringkasan.menyeluruh}`],
                ["Alokasi dana dihapus", `${ringkasan.alokasiDana}`],
                ["Bukti bayar dihapus", `${ringkasan.buktiBayar}`],
                ["Entri jurnal dipertahankan", `${ringkasan.jurnalDipertahankan}`],
              ] as const).map(([label, nilai]) => (
                <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-navy">{nilai}</p>
                </div>
              ))}
            </div>

            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {hapus.rows.map((row) => (
                <li key={row._id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm">
                      <Badge variant="destructive" className="text-[10px] uppercase">
                        HAPUS · {labelBarisHapus(row)}
                      </Badge>
                      <span className="font-semibold text-navy">{row.aktorLabel}</span>
                      <span className="text-muted-foreground">{row.target ?? ""}</span>
                    </p>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {new Date(row.waktu).toLocaleString("id-ID")}
                    </span>
                  </div>
                  {row.rincianHapus !== undefined && (
                    <p className="mt-1 text-xs font-medium text-amber-800">
                      {ringkasRincianHapus(row.rincianHapus)}
                    </p>
                  )}
                  {row.detail !== undefined && (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.detail}</p>
                  )}
                </li>
              ))}
              {hapus.rows.length === 0 && (
                <li className="px-5 py-6 text-sm text-muted-foreground">
                  Belum ada penghapusan pada kategori ini.
                </li>
              )}
            </ul>

            {ringkasan.tanpaRincian > 0 && (
              <p className="border-t border-slate-100 px-5 py-3 text-xs text-muted-foreground">
                {ringkasan.tanpaRincian} baris lama belum punya rincian terstruktur (ditulis sebelum
                kolom rincian ada). Angkanya TIDAK ikut dijumlahkan di atas, jadi total di atas hanya
                mencakup penghapusan yang mencatat rincian.
              </p>
            )}
            {hapus.rows.length >= hapus.batas && (
              <p className="border-t border-slate-100 px-5 py-3 text-xs text-muted-foreground">
                Menampilkan {hapus.batas} penghapusan terbaru untuk kategori ini.
              </p>
            )}
          </>
        )}
      </section>

      <section className="animate-masuk rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-navy">Aktivitas admin terbaru</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Termasuk penghapusan data yang disertai alasan; entri audit tetap dipertahankan.
            </p>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            {data.auditTerbaru.length} entri terbaru
          </Badge>
        </div>
        <ul className="divide-y divide-slate-100">
          {data.auditTerbaru.map((a) => (
            <li key={a._id} className="px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <span className="font-semibold text-navy">{a.aktorLabel}</span>{" "}
                  <Badge
                    variant={isDeletion(a.aksi) ? "destructive" : "outline"}
                    className="mx-1 text-[10px] uppercase"
                  >
                    {isDeletion(a.aksi) ? `HAPUS · ${a.aksi.replace("_delete", "")}` : a.aksi}
                  </Badge>{" "}
                  <span className="text-muted-foreground">{a.target ?? ""}</span>
                </p>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {new Date(a.waktu).toLocaleString("id-ID")}
                </span>
              </div>
              {a.detail && <p className="mt-1 text-xs text-muted-foreground">{a.detail}</p>}
            </li>
          ))}
          {data.auditTerbaru.length === 0 && (
            <li className="px-5 py-6 text-sm text-muted-foreground">Belum ada aktivitas tercatat.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
