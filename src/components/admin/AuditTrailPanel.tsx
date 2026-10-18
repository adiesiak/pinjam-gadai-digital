import { useQuery } from "convex/react";
import { CheckCircle2, Clock, Download, Loader2, TriangleAlert } from "lucide-react";
import type { ComponentType } from "react";
import { useState } from "react";
import { toast } from "sonner";

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
import { unduhLewatAplikasi } from "@/lib/jembatanAndroid";
import {
  keCsvAudit,
  labelAksi,
  nadaAksi,
  namaBerkasAudit,
  type NadaTimeline,
} from "@/lib/auditTimeline";

import { PanelMemuat } from "./admin-shared";

/**
 * Rekam jejak aktivitas admin + daftar PENGHAPUSAN data.
 *
 * Bagian penghapusan sengaja terpisah dari daftar "terbaru": penghapusan itu
 * peristiwa langka, jadi menyaring 10 entri terakhir akan membuatnya hampir
 * tidak pernah terlihat. Angkanya dibaca dari rincian terstruktur
 * (`rincianHapus`) hasil mutation penghapusan — bukan dihitung ulang dari teks
 * atau ditebak. Baris lama tanpa rincian dilaporkan apa adanya sebagai
 * "tanpa rincian", tidak dikarang.
 *
 * Aktivitas terbaru kini berbentuk TIMELINE VISUAL: tiap kejadian punya titik
 * berwarna dengan aturan yang bisa diuji (`lib/auditTimeline.ts`) — HIJAU
 * berhasil, KUNING menunggu/dalam proses, MERAH kritis termasuk penghapusan.
 * Tombol Export CSV mengunduh gabungan jejak aktivitas dan penghapusan dengan
 * nada yang sama, sehingga tim bisa mengaudit di luar aplikasi.
 */

/** Penampilan satu nada timeline: kelas titik, ikon, dan labelnya. */
const GAYA_NADA: Record<NadaTimeline, { kelas: string; Icon: ComponentType<{ className?: string }>; label: string }> = {
  sukses: { kelas: "bg-emerald-100 text-emerald-700", Icon: CheckCircle2, label: "Berhasil" },
  pending: { kelas: "bg-amber-100 text-amber-700", Icon: Clock, label: "Menunggu" },
  kritis: { kelas: "bg-red-100 text-red-700", Icon: TriangleAlert, label: "Kritis" },
};

export function AuditTrailPanel() {
  const data = useQuery(api.system.getConfigAdmin);
  const [jenis, setJenis] = useState<JenisHapus>("semua");
  const hapus = useQuery(api.system.auditPenghapusan, { jenis });
  const [mengekspor, setMengekspor] = useState(false);

  if (data === undefined) {
    return <PanelMemuat />;
  }

  const ringkasan = hapus?.ringkasan;

  /**
   * Unduh gabungan dua daftar sebagai CSV. Baris ganda (penghapusan yang juga
   * muncul di aktivitas terbaru) dibuang lewat `_id` supaya berkas audit tidak
   * melaporkan satu kejadian dua kali.
   */
  const ekspor = async () => {
    setMengekspor(true);
    try {
      const terlihat = new Set<string>();
      const baris = [...(hapus?.rows ?? []), ...data.auditTerbaru]
        .filter((r) => {
          if (terlihat.has(r._id)) return false;
          terlihat.add(r._id);
          return true;
        })
        .sort((a, b) => b.waktu - a.waktu)
        .map((r) => ({
          waktu: r.waktu,
          aktorLabel: r.aktorLabel,
          aksi: r.aksi,
          target: r.target ?? null,
          detail: r.detail ?? null,
        }));
      if (baris.length === 0) {
        toast.info("Belum ada aktivitas untuk diekspor.");
        return;
      }
      // BOM UTF-8 supaya Excel membaca huruf beraksen dengan benar.
      const blob = new Blob([`\uFEFF${keCsvAudit(baris)}`], {
        type: "text/csv;charset=utf-8",
      });
      const nama = namaBerkasAudit(Date.now());
      // Di aplikasi Android, unduhan blob: tidak ditangani WebView.
      if (await unduhLewatAplikasi(nama, "text/csv", blob)) {
        toast.success(`${baris.length} catatan audit diekspor ke CSV.`);
        return;
      }
      const url = URL.createObjectURL(blob);
      const tautan = document.createElement("a");
      tautan.href = url;
      tautan.download = nama;
      document.body.appendChild(tautan);
      tautan.click();
      tautan.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${baris.length} catatan audit diekspor ke CSV.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengekspor audit trail.");
    } finally {
      setMengekspor(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Kepala: judul + ekspor CSV (satu tempat untuk kedua daftar di bawah). */}
      <header className="animate-masuk flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy">Audit Trail</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Timeline aktivitas admin dan daftar penghapusan. Entri audit tidak pernah dihapus.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={mengekspor}
          onClick={ekspor}
          className="shrink-0"
        >
          {mengekspor ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <Download className="mr-1.5 size-4" />
          )}
          Export CSV
        </Button>
      </header>

      <section className="animate-masuk rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-navy">Penghapusan data</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Setiap penghapusan menyimpan alasan dan jumlah baris yang ikut terhapus. Jurnal catatan internal
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

        <div className="flex flex-wrap gap-2 px-5 pb-2" role="group" aria-label="Saring penghapusan">
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

        {/* Counter filter hub: berapa yang tampil vs berapa yang ada. */}
        {hapus !== undefined && ringkasan !== undefined && (
          <p
            aria-live="polite"
            className="px-5 pb-3 text-[11px] tabular-nums text-muted-foreground"
          >
            Menampilkan {hapus.rows.length} dari {ringkasan.jumlah} data
            {jenis === "semua" ? "" : ` · filter “${LABEL_JENIS[jenis]}” aktif`}
          </p>
        )}

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

      {/* ── Timeline visual aktivitas admin ── */}
      <section className="animate-masuk rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-navy">Timeline aktivitas admin</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Termasuk penghapusan data yang disertai alasan; entri audit tetap dipertahankan.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(Object.keys(GAYA_NADA) as NadaTimeline[]).map((nada) => {
              const { kelas, Icon, label } = GAYA_NADA[nada];
              return (
                <span
                  key={nada}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${kelas}`}
                >
                  <Icon className="size-3" aria-hidden="true" /> {label}
                </span>
              );
            })}
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              {data.auditTerbaru.length} entri terbaru
            </Badge>
          </div>
        </div>

        {data.auditTerbaru.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Belum ada aktivitas tercatat.</p>
        ) : (
          <ol className="mt-4 space-y-0 border-l border-slate-200 pl-5">
            {data.auditTerbaru.map((a) => {
              const nada = nadaAksi(a.aksi);
              const { kelas, Icon, label } = GAYA_NADA[nada];
              return (
                <li key={a._id} className="relative pb-4 last:pb-0">
                  <span
                    title={label}
                    aria-hidden="true"
                    className={`absolute -left-[30px] flex size-5 items-center justify-center rounded-full ring-4 ring-white ${kelas}`}
                  >
                    <Icon className="size-3" />
                  </span>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm">
                      <span className="font-semibold text-navy">{a.aktorLabel}</span>{" "}
                      <Badge
                        variant={nada === "kritis" ? "destructive" : "outline"}
                        className={`mx-1 text-[10px] uppercase ${
                          nada === "pending" ? "border-amber-200 bg-amber-50 text-amber-700" : ""
                        }`}
                      >
                        {labelAksi(a.aksi)}
                      </Badge>{" "}
                      <span className="text-muted-foreground">{a.target ?? ""}</span>
                    </p>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {new Date(a.waktu).toLocaleString("id-ID")}
                    </span>
                  </div>
                  {a.detail && <p className="mt-1 text-xs leading-5 text-muted-foreground">{a.detail}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
