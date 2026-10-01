import { ClipboardList, Package, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { GadaiPendanaanPanel } from "@/components/GadaiPendanaanPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate } from "@/components/admin/admin-format";
import {
  EmptyQueue,
  QueueRow,
  type LoanRow,
  type PawnRow,
} from "@/components/admin/admin-shared";
import { loanPurposeLabel } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import { Input } from "@/components/ui/input";

/** Tab Pinjaman — antrean pengajuan pinjaman. */
export function LoanQueueSection({
  loans,
  onOpen,
}: {
  loans: LoanRow[];
  onOpen: (l: LoanRow) => void;
}) {
  const [search, setSearch] = useState("");
  const filteredLoans = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return loans;
    return loans.filter((loan) =>
      [
        loan.namaLengkap,
        loan.emailPeminjam ?? "",
        loan.nomorReferensi,
        loan.tujuan,
        loan.catatanPeminjam ?? "",
        loan.namaBank ?? "",
        loan.nomorRekening,
      ].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [loans, search]);
  if (loans.length === 0) {
    return <EmptyQueue icon={ClipboardList} title="Belum ada pengajuan pinjaman" />;
  }
  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        Nominal dan status pinjaman yang ditampilkan mengikuti catatan ledger internal.
      </p>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Cari peminjam atau pengajuan tunai" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, email, referensi, atau keperluan…" className="pl-9" />
      </div>
      {filteredLoans.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-muted-foreground">Tidak ada pengajuan yang cocok dengan pencarian.</p>
      ) : (
    <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
      {filteredLoans.map((l) => (
        <li key={l._id}>
          <QueueRow
            reference={l.nomorReferensi}
            date={formatDate(l._creationTime)}
            title={l.namaLengkap}
            subtitle={`${l.emailPeminjam ?? "tanpa email"} · ${l.nomorReferensi} · pokok ${formatRupiah(l.pokokPinjaman)} · ${loanPurposeLabel(l.tujuan)}`}
            status={<StatusBadge status={l.status} kind="loan" />}
            onOpen={() => onOpen(l)}
          />
        </li>
      ))}
    </ul>
      )}
    </div>
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
  const [search, setSearch] = useState("");
  const filteredPawns = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return pawns;
    return pawns.filter((pawn) =>
      [
        pawn.namaLengkap,
        pawn.emailPeminjam ?? "",
        pawn.nomorReferensi,
        pawn.deskripsiBarang,
        pawn.kategori,
        pawn.catatanPeminjam ?? "",
        pawn.namaBank ?? "",
        pawn.nomorRekening,
      ].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [pawns, search]);
  return (
    <>
      {pawns.length === 0 ? (
        <EmptyQueue icon={Package} title="Belum ada pengajuan gadai" />
      ) : (
        <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Cari pemohon atau pengajuan gadai" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, email, referensi, barang, atau kategori…" className="pl-9" />
        </div>
        {filteredPawns.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-muted-foreground">Tidak ada pengajuan yang cocok dengan pencarian.</p>
        ) : (
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {filteredPawns.map((p) => (
            <li key={p._id}>
              <QueueRow
                reference={p.nomorReferensi}
                date={formatDate(p._creationTime)}
                title={p.namaLengkap}
                subtitle={`${p.emailPeminjam ?? "tanpa email"} · ${p.nomorReferensi} · ${p.deskripsiBarang} · ${p.kategori}`}
                status={<StatusBadge status={p.status} kind="pawn" />}
                onOpen={() => onOpen(p)}
              />
            </li>
          ))}
        </ul>
        )}
        </div>
      )}
      <GadaiPendanaanPanel pawns={pawns} />
    </>
  );
}
