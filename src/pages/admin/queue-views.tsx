import { ClipboardList, Package, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { GadaiDanaPanel } from "@/components/GadaiDanaPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate } from "@/components/admin/admin-format";
import {
  EmptyQueue,
  QueueRow,
  SubTabFilter,
  type LoanRow,
  type OpsiSubTab,
  type PawnRow,
} from "@/components/admin/admin-shared";
import { loanPurposeLabel } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import { Input } from "@/components/ui/input";

/**
 * Sub-tab antrean pinjaman: memisahkan catatan yang masih perlu ditindak dari
 * yang sudah selesai, supaya satu daftar tidak mencampur keduanya. Urutannya
 * mengikuti alur status di `LOAN_STATUS_FLOW`.
 *
 * Diekspor agar uji render bisa memastikan setiap status pinjaman punya satu
 * sub-tab. Tanpa tab "Didanai", pinjaman yang dananya sudah tersalurkan tidak
 * cocok dengan sub-tab mana pun: barisnya hanya terlihat di "Semua", dan
 * jumlah seluruh sub-tab status tidak pernah sama dengan "Semua".
 */
export const SUB_TAB_PINJAMAN: readonly OpsiSubTab<LoanRow>[] = [
  {
    id: "semua",
    label: "Semua",
    hint: "Seluruh catatan pinjaman, apa pun statusnya.",
    cocok: () => true,
  },
  {
    id: "belum-didanai",
    label: "Belum didanai",
    hint: "Diajukan, sedang direview, dan disetujui internal — belum ada dana yang tersalurkan.",
    cocok: (pinjaman) =>
      pinjaman.status === "diajukan" ||
      pinjaman.status === "sedang_direview" ||
      pinjaman.status === "disetujui",
  },
  {
    id: "didanai",
    label: "Didanai",
    hint: "Dana sudah tersalurkan dan pinjaman sedang berjalan — belum lunas.",
    cocok: (pinjaman) => pinjaman.status === "didanai",
  },
  {
    id: "ditolak",
    label: "Ditolak",
    hint: "Catatan pengajuan yang tidak dilanjutkan.",
    cocok: (pinjaman) => pinjaman.status === "ditolak",
  },
  {
    id: "lunas",
    label: "Lunas",
    hint: "Kewajiban yang sudah selesai di ledger internal.",
    cocok: (pinjaman) => pinjaman.status === "lunas",
  },
];

/** Sub-tab antrean gadai, mengikuti alur status di `PAWN_STATUS_FLOW`. */
const SUB_TAB_GADAI: readonly OpsiSubTab<PawnRow>[] = [
  {
    id: "semua",
    label: "Semua",
    hint: "Seluruh catatan gadai, apa pun statusnya.",
    cocok: () => true,
  },
  {
    id: "belum-aktif",
    label: "Belum aktif",
    hint: "Diajukan, sedang dinilai, dan disetujui internal — barang belum tercatat aktif di ledger.",
    cocok: (gadai) =>
      gadai.status === "diajukan" ||
      gadai.status === "sedang_dinilai" ||
      gadai.status === "disetujui",
  },
  {
    id: "berjalan",
    label: "Berjalan",
    hint: "Gadai aktif dan yang menunggu pembaruan status pelepasan barang.",
    cocok: (gadai) => gadai.status === "aktif" || gadai.status === "menunggu_pelepasan",
  },
  {
    id: "ditolak",
    label: "Ditolak",
    hint: "Pengajuan gadai yang tidak dilanjutkan.",
    cocok: (gadai) => gadai.status === "ditolak",
  },
  {
    id: "lunas",
    label: "Lunas",
    hint: "Kewajiban lunas dan barang sudah ditandai dilepas di ledger internal.",
    cocok: (gadai) => gadai.status === "lunas_dilepas",
  },
];

/** Tab Pinjaman — antrean pengajuan pinjaman dengan sub-tab status. */
export function LoanQueueSection({
  loans,
  onOpen,
}: {
  loans: LoanRow[];
  onOpen: (l: LoanRow) => void;
}) {
  const [tabAktif, setTabAktif] = useState(SUB_TAB_PINJAMAN[0].id);
  const [search, setSearch] = useState("");
  const aktif = SUB_TAB_PINJAMAN.find((t) => t.id === tabAktif) ?? SUB_TAB_PINJAMAN[0];
  const cocokAktif = aktif.cocok;
  const filteredLoans = useMemo(() => {
    const diTab = loans.filter(cocokAktif);
    const needle = search.trim().toLowerCase();
    if (!needle) return diTab;
    return diTab.filter((loan) =>
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
  }, [loans, search, cocokAktif]);
  if (loans.length === 0) {
    return <EmptyQueue icon={ClipboardList} title="Belum ada pengajuan pinjaman" />;
  }
  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        Nominal dan status pinjaman yang ditampilkan mengikuti catatan ledger internal.
      </p>
      <SubTabFilter
        nama="Sub-tab status pinjaman"
        opsi={SUB_TAB_PINJAMAN}
        aktif={aktif.id}
        onPilih={setTabAktif}
        baris={loans}
      />
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Cari peminjam atau pengajuan tunai" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, email, referensi, atau keperluan…" className="pl-9" />
      </div>
      {filteredLoans.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-muted-foreground">
          {search.trim()
            ? "Tidak ada pengajuan yang cocok dengan pencarian."
            : `Tidak ada pinjaman pada sub-tab ${aktif.label}.`}
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {filteredLoans.map((l) => (
            <li key={l._id}>
              <QueueRow
                reference={l.nomorReferensi}
                date={formatDate(l._creationTime)}
                title={l.namaLengkap.toUpperCase()}
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

/** Tab Gadai — antrean pengajuan gadai + panel hitungan internal. */
export function PawnQueueSection({
  pawns,
  onOpen,
}: {
  pawns: PawnRow[];
  onOpen: (p: PawnRow) => void;
}) {
  const [tabAktif, setTabAktif] = useState(SUB_TAB_GADAI[0].id);
  const [search, setSearch] = useState("");
  const aktif = SUB_TAB_GADAI.find((t) => t.id === tabAktif) ?? SUB_TAB_GADAI[0];
  const cocokAktif = aktif.cocok;
  const filteredPawns = useMemo(() => {
    const diTab = pawns.filter(cocokAktif);
    const needle = search.trim().toLowerCase();
    if (!needle) return diTab;
    return diTab.filter((pawn) =>
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
  }, [pawns, search, cocokAktif]);
  return (
    <>
      {pawns.length === 0 ? (
        <EmptyQueue
          icon={Package}
          title="Belum ada pengajuan gadai"
          deskripsi="Antrean gadai akan muncul di sini begitu nasabah mengirim pengajuan barang jaminan."
          poin={[
            "Barang jaminan, kategori, dan nilai taksiran",
            "Status penilaian serta hasil review tim",
            "Posisi gadai aktif (Skema B) yang sudah disetujui",
          ]}
        />
      ) : (
        <div className="space-y-3">
          <SubTabFilter
            nama="Sub-tab status gadai"
            opsi={SUB_TAB_GADAI}
            aktif={aktif.id}
            onPilih={setTabAktif}
            baris={pawns}
          />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Cari pemohon atau pengajuan gadai" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, email, referensi, barang, atau kategori…" className="pl-9" />
          </div>
          {filteredPawns.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-muted-foreground">
              {search.trim()
                ? "Tidak ada pengajuan yang cocok dengan pencarian."
                : `Tidak ada pengajuan gadai pada sub-tab ${aktif.label}.`}
            </p>
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
      <GadaiDanaPanel pawns={pawns} />
    </>
  );
}
