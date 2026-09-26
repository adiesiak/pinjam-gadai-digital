import { ClipboardList, Package } from "lucide-react";

import { GadaiPendanaanPanel } from "@/components/GadaiPendanaanPanel";
import { StatusBadge } from "@/components/StatusBadge";
import {
  EmptyQueue,
  QueueRow,
  formatDate,
  type LoanRow,
  type PawnRow,
} from "@/components/admin/admin-shared";
import { loanPurposeLabel } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";

/** Tab Pinjaman — antrean pengajuan pinjaman. */
export function LoanQueueSection({
  loans,
  onOpen,
}: {
  loans: LoanRow[];
  onOpen: (l: LoanRow) => void;
}) {
  if (loans.length === 0) {
    return <EmptyQueue icon={ClipboardList} title="Belum ada pengajuan pinjaman" />;
  }
  return (
    <ul className="divide-y divide-sky-100 rounded-2xl border border-slate-200 bg-white">
      {loans.map((l) => (
        <li key={l._id}>
          <QueueRow
            reference={l.nomorReferensi}
            date={formatDate(l._creationTime)}
            title={formatRupiah(l.pokokPinjaman)}
            subtitle={`${l.namaLengkap} · ${l.emailPeminjam ?? "tanpa email"} · ${loanPurposeLabel(l.tujuan)}`}
            status={<StatusBadge status={l.status} kind="loan" />}
            onOpen={() => onOpen(l)}
          />
        </li>
      ))}
    </ul>
  );
}

/** Tab Gadai — antrean pengajuan gadai + panel pendanaan. */
export function PawnQueueSection({
  pawns,
  onOpen,
}: {
  pawns: PawnRow[];
  onOpen: (p: PawnRow) => void;
}) {
  return (
    <>
      {pawns.length === 0 ? (
        <EmptyQueue icon={Package} title="Belum ada pengajuan gadai" />
      ) : (
        <ul className="divide-y divide-sky-100 rounded-2xl border border-slate-200 bg-white">
          {pawns.map((p) => (
            <li key={p._id}>
              <QueueRow
                reference={p.nomorReferensi}
                date={formatDate(p._creationTime)}
                title={p.deskripsiBarang}
                subtitle={`${p.namaLengkap} · ${p.emailPeminjam ?? "tanpa email"} · ${p.kategori}`}
                status={<StatusBadge status={p.status} kind="pawn" />}
                onOpen={() => onOpen(p)}
              />
            </li>
          ))}
        </ul>
      )}
      <GadaiPendanaanPanel pawns={pawns} />
    </>
  );
}
