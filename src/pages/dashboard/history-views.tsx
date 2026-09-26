import { Landmark } from "lucide-react";

import { StatusBadge } from "@/components/StatusBadge";
import type { Id } from "@/convex/_generated/dataModel";
import { loanPurposeLabel } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";

import { EmptyState, formatDate } from "./shared";

/** Tab 6 — Riwayat transaksi pinjaman & gadai. */
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
        title="Belum ada transaksi"
        body="Pengajuan pinjaman dan gadai Anda tercatat di sini, termasuk yang sudah selesai."
      />
    );
  }
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section>
        <h3 className="text-sm font-semibold">Pinjaman</h3>
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
                    <p className="truncate text-sm font-medium tabular-nums">{formatRupiah(l.pokokPinjaman)}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {l.nomorReferensi} · {loanPurposeLabel(l.tujuan)} · {formatDate(l._creationTime)}
                    </p>
                  </div>
                  <StatusBadge status={l.status} kind="loan" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="text-sm font-semibold">Gadai</h3>
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
