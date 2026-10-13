import { Landmark } from "lucide-react";

import { StatusBadge } from "@/components/StatusBadge";
import type { Id } from "@/convex/_generated/dataModel";
import { loanPurposeLabel } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";

import { EmptyState } from "./empty-state";
import { formatDate } from "./shared";

/** Tab 6 — riwayat catatan pinjaman dan gadai pada aplikasi. */
export function HistorySection({
  loans,
  pawns,
  onOpenLoan,
  onOpenPawn,
}: {
  loans: Array<{
    _id: Id<"loans">;
    _creationTime: number;
    nomorReferensi: string;
    pokokPinjaman: number;
    /** Nominal asli pengajuan — beda bila disetujui sebagian. */
    pokokDiajukan?: number;
    tujuan: string;
    status: string;
  }>;
  pawns: Array<{
    _id: Id<"pawns">;
    _creationTime: number;
    nomorReferensi: string;
    deskripsiBarang: string;
    kategori: string;
    status: string;
  }>;
  onOpenLoan: (id: Id<"loans">) => void;
  onOpenPawn: (id: Id<"pawns">) => void;
}) {
  if (loans.length === 0 && pawns.length === 0) {
    return (
      <EmptyState
        icon={Landmark}
        title="Belum ada riwayat"
        body="Status pengajuan pinjaman dan gadai tampil di sini. Catatan ini tersimpan di PINDAI."
        action={{
          label: "Buat pengajuan pinjaman",
          variant: "outline",
          onClick: () => {
            // Penjembatan ke tab Form Pengajuan; komponen pembungkus bertanggung jawab
            // menangani tindakan ini melalui onBukaForm bila tersedia.
          },
        }}
      />
    );
  }
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 lg:col-span-2">
        Riwayat ini hanya menampilkan data dan status pada aplikasi. Nilai dan status mengikuti catatan PINDAI.
      </section>
      <section>
        <h3 className="text-sm font-semibold">Catatan pinjaman</h3>
        {loans.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">Belum ada.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {loans.map((l) => (
              <li key={l._id}>
                <button
                  type="button"
                  onClick={() => onOpenLoan(l._id)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium tabular-nums">
                      Pokok tersimpan {formatRupiah(l.pokokPinjaman)}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {l.nomorReferensi} · {loanPurposeLabel(l.tujuan)} · {formatDate(l._creationTime)}
                    </p>
                    {(l.pokokDiajukan ?? l.pokokPinjaman) !== l.pokokPinjaman && (
                      <p className="mt-1 text-xs text-amber-700">
                        Diajukan {formatRupiah(l.pokokDiajukan ?? l.pokokPinjaman)} · disetujui{" "}
                        {formatRupiah(l.pokokPinjaman)}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={l.status} kind="loan" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="text-sm font-semibold">Catatan gadai</h3>
        {pawns.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">Belum ada.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {pawns.map((p) => (
              <li key={p._id}>
                <button
                  type="button"
                  onClick={() => onOpenPawn(p._id)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.deskripsiBarang}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {p.nomorReferensi} · {p.kategori} · {formatDate(p._creationTime)}
                    </p>
                  </div>
                  <StatusBadge status={p.status} kind="pawn" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
