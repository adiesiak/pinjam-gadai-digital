import { useMutation, useQuery } from "convex/react";
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  MapPin,
  MessageCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  LABEL_STATUS_MINAT_PENDANA,
  LABEL_SUMBER_MINAT_PENDANA,
  STATUS_MINAT_PENDANA,
  pesanTindakLanjutMinatPendana,
  type StatusMinatPendana,
} from "@/lib/minatPendana";
import { formatRupiah } from "@/lib/money";
import { urlWhatsapp } from "@/lib/pengingatWhatsapp";

const KARTU = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5";

const KELAS_STATUS: Record<StatusMinatPendana, string> = {
  baru: "border-border bg-secondary text-foreground hover:bg-secondary",
  dihubungi: "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-50",
  selesai:
    "border-success-border bg-success-soft text-success-foreground hover:bg-success-soft",
  batal: "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100",
};

function tanggal(ms: number): string {
  return new Date(ms).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function labelSumber(sumber: string | undefined): string {
  if (sumber === undefined) return "Belum diisi";
  return (
    LABEL_SUMBER_MINAT_PENDANA[sumber as keyof typeof LABEL_SUMBER_MINAT_PENDANA] ??
    sumber
  );
}

/**
 * Inbox calon pendana.
 *
 * Tombol WhatsApp membuka percakapan dengan template dari `lib/minatPendana`;
 * status hanya dicatat setelah admin menekan tombol, bukan otomatis. Tidak ada
 * pengiriman massal dari sini — ini antrean percakapan manusia.
 */
export function MinatPendanaPanel() {
  const daftar = useQuery(api.minatPendana.daftar, {});
  const ubahStatus = useMutation(api.minatPendana.ubahStatus);
  const [filter, setFilter] = useState<"semua" | StatusMinatPendana>("semua");
  const [busyId, setBusyId] = useState<Id<"minatPendana"> | null>(null);

  if (daftar === undefined) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat minat pendana…
      </div>
    );
  }

  const baru = daftar.filter((row) => row.status === "baru").length;
  const tampil = filter === "semua" ? daftar : daftar.filter((row) => row.status === filter);

  const ubah = async (id: Id<"minatPendana">, status: StatusMinatPendana) => {
    setBusyId(id);
    try {
      await ubahStatus({ id, status });
      toast.success(`Status diubah menjadi “${LABEL_STATUS_MINAT_PENDANA[status]}”.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Status belum bisa diubah.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className={KARTU}>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900">Calon Pendana</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Minat dari halaman publik. Hubungi lewat WhatsApp, lalu catat statusnya.
              Tidak ada pengiriman massal atau perubahan akun dari daftar ini.
            </p>
          </div>
          <Badge className="border-border bg-secondary text-foreground hover:bg-secondary">
            {baru} baru
          </Badge>
        </header>

        <div
          className="mt-4 flex flex-wrap gap-2"
          role="group"
          aria-label="Saring status calon pendana"
        >
          <Button
            type="button"
            size="sm"
            variant={filter === "semua" ? "default" : "outline"}
            aria-pressed={filter === "semua"}
            onClick={() => setFilter("semua")}
            className="min-h-11"
          >
            Semua <span className="ml-1 tabular-nums">{daftar.length}</span>
          </Button>
          {STATUS_MINAT_PENDANA.map((status) => (
            <Button
              key={status}
              type="button"
              size="sm"
              variant={filter === status ? "default" : "outline"}
              aria-pressed={filter === status}
              onClick={() => setFilter(status)}
              className="min-h-11"
            >
              {LABEL_STATUS_MINAT_PENDANA[status]}{" "}
              <span className="ml-1 tabular-nums">
                {daftar.filter((row) => row.status === status).length}
              </span>
            </Button>
          ))}
        </div>
      </section>

      {tampil.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
          <p className="text-sm font-semibold text-slate-900">
            {daftar.length === 0 ? "Belum ada minat masuk." : "Tidak ada yang cocok dengan saringan."}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {daftar.length === 0
              ? "Bagikan tautan /pendana/daftar atau tautan “Jadi pendana” di footer."
              : "Pilih “Semua” untuk melihat seluruh prospek."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {tampil.map((row) => {
            const wa = urlWhatsapp(
              row.nomorWhatsApp,
              pesanTindakLanjutMinatPendana({
                nama: row.nama,
                nominalRencana: row.nominalRencana,
              }),
            );
            return (
              <li key={row._id} className={KARTU}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-900">{row.nama}</h4>
                      <Badge className={KELAS_STATUS[row.status]}>
                        {LABEL_STATUS_MINAT_PENDANA[row.status]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.nomorWhatsApp} · {labelSumber(row.sumber)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-emerald-800">
                    {formatRupiah(row.nominalRencana)}
                  </p>
                </div>

                <dl className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600 sm:grid-cols-2">
                  <div className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <div>
                      <dt className="sr-only">Kota</dt>
                      <dd>{row.kota}</dd>
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <div>
                      <dt className="sr-only">Waktu masuk</dt>
                      <dd>{tanggal(row.dibuatPada)}</dd>
                    </div>
                  </div>
                </dl>

                {row.catatan !== undefined && row.catatan !== "" && (
                  <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
                    {row.catatan}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {wa !== null && (
                    <Button asChild size="sm" className="min-h-11 gap-2">
                      <a href={wa} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="size-3.5" aria-hidden="true" />
                        WhatsApp
                      </a>
                    </Button>
                  )}
                  {row.status !== "dihubungi" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === row._id}
                      className="min-h-11"
                      onClick={() => void ubah(row._id, "dihubungi")}
                    >
                      {busyId === row._id ? (
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      ) : null}
                      Tandai dihubungi
                    </Button>
                  )}
                  {row.status !== "selesai" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === row._id}
                      className="min-h-11"
                      onClick={() => void ubah(row._id, "selesai")}
                    >
                      <CheckCircle2 className="mr-1.5 size-3.5" aria-hidden="true" />
                      Selesai
                    </Button>
                  )}
                  {row.status !== "batal" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busyId === row._id}
                      className="min-h-11"
                      onClick={() => void ubah(row._id, "batal")}
                    >
                      Batal
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
