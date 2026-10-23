import { ClipboardList, Package, Zap } from "lucide-react";
import { useMemo, useState } from "react";

import { GadaiDanaPanel } from "@/components/GadaiDanaPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { CatatPengajuanManualButton } from "@/components/admin/CatatPengajuanManual";
import {
  EmptyQueue,
  SubTabFilter,
  type LoanRow,
  type PawnRow,
} from "@/components/admin/admin-shared";
import {
  PencarianCepat,
  TabelAntrean,
  TombolAksiAntrean,
} from "@/components/admin/TabelAntrean";
import {
  pakaiCairEkspres,
  urutkanAntreanEkspres,
} from "@/lib/admin-queue";
import { loanPurposeLabel, loanStatusMeta } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import { namaHurufBesar } from "@/lib/nama";
import { pawnStatusMeta } from "@/lib/pawn";
import { ringkasJumlah } from "@/lib/saringanPengajuan";
import { diTahapTinjauan } from "@/lib/statusPinjaman";
import { SUB_TAB_GADAI, SUB_TAB_PINJAMAN } from "@/lib/subTabAntrean";

/**
 * Sub-tab antrean pinjaman & gadai tinggal di `@/lib/subTabAntrean` — data
 * murni, supaya berkas ini hanya berisi komponen dan aturan "setiap status
 * punya satu sub-tab" bisa diuji tanpa membawa React.
 *
 * Tabelnya sendiri ada di `components/admin/TabelAntrean` karena dipakai juga
 * oleh antrean Kredit Barang. Dengan begitu ketiga produk konvensional
 * memakai kolom, pengurutan, dan bentuk aksi yang sama.
 */

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
    // Pengajuan cair ekspres selalu di paling atas: peminjam memilih dan
    // membayar jalur pencairan itu, jadi keputusannya tidak boleh menunggu di
    // belakang antrean biasa.
    if (!needle) return urutkanAntreanEkspres(diTab);
    return urutkanAntreanEkspres(
      diTab.filter((loan) =>
        [
          loan.namaLengkap,
          loan.emailPeminjam ?? "",
          loan.nomorReferensi,
          loan.tujuan,
          loan.catatanPeminjam ?? "",
          loan.namaBank ?? "",
          loan.nomorRekening,
        ].some((value) => value.toLowerCase().includes(needle)),
      ),
    );
  }, [loans, search, cocokAktif]);
  if (loans.length === 0) {
    return (
      <div className="space-y-3">
        {/* Pencatatan manual tetap tersedia walau antrean kosong: pengajuan
            yang diterima di luar aplikasi masuk lewat jalur ini. */}
        <div className="flex justify-end">
          <CatatPengajuanManualButton jenis="pinjaman" />
        </div>
        <EmptyQueue icon={ClipboardList} title="Belum ada pengajuan pinjaman" />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <CatatPengajuanManualButton jenis="pinjaman" />
      </div>
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        Nominal dan status pinjaman yang ditampilkan mengikuti catatan internal aplikasi.
      </p>
      <SubTabFilter
        nama="Sub-tab status pinjaman"
        opsi={SUB_TAB_PINJAMAN}
        aktif={aktif.id}
        onPilih={setTabAktif}
        baris={loans}
      />
      <PencarianCepat
        value={search}
        onChange={setSearch}
        ariaLabel="Cari peminjam atau pengajuan tunai"
        placeholder="Cari nama, email, referensi, atau keperluan…"
      />
      {/* Counter filter hub: berapa baris yang tampil dibanding seluruh antrean,
          supaya admin tahu saringan masih menyembunyikan data. */}
      <p aria-live="polite" className="text-[11px] tabular-nums text-muted-foreground">
        {ringkasJumlah(filteredLoans.length, loans.length)}
        {search.trim() !== "" || aktif.id !== SUB_TAB_PINJAMAN[0].id ? " · filter aktif" : ""}
      </p>
      {filteredLoans.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-muted-foreground">
          {search.trim()
            ? "Tidak ada pengajuan yang cocok dengan pencarian."
            : `Tidak ada pinjaman pada sub-tab ${aktif.label}.`}
        </p>
      ) : (
        <TabelAntrean
          keterangan={`Antrean pinjaman, ${filteredLoans.length} pengajuan`}
          judulKeperluan="Keperluan & tanggal"
          baris={filteredLoans.map((l) => {
            const labelAksi = diTahapTinjauan(l.status) ? "Proses" : "Detail";
            return {
              id: l._id,
              referensi: l.nomorReferensi,
              nama: namaHurufBesar(l.namaLengkap),
              email: l.emailPeminjam,
              nominal: l.pokokPinjaman,
              keperluan: loanPurposeLabel(l.tujuan),
              waktu: l._creationTime,
              statusTeks: loanStatusMeta(l.status).label,
              lencana: pakaiCairEkspres(l) ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
                  title="Peminjam memilih cair ekspres; biaya ekspres dipotong di muka."
                >
                  <Zap className="size-3" aria-hidden="true" />
                  Cair ekspres
                </span>
              ) : null,
              status: <StatusBadge status={l.status} kind="loan" />,
              aksi: (
                <TombolAksiAntrean
                  label={labelAksi}
                  utama={labelAksi === "Proses"}
                  onClick={() => onOpen(l)}
                  ariaLabel={`${labelAksi} pengajuan ${l.nomorReferensi}`}
                />
              ),
            };
          })}
        />
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
      <div className="mb-3 flex justify-end">
        <CatatPengajuanManualButton jenis="gadai" />
      </div>
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
          <PencarianCepat
            value={search}
            onChange={setSearch}
            ariaLabel="Cari pemohon atau pengajuan gadai"
            placeholder="Cari nama, email, referensi, barang, atau kategori…"
          />
          {/* Counter filter hub — aturan yang sama dengan antrean pinjaman. */}
          <p aria-live="polite" className="text-[11px] tabular-nums text-muted-foreground">
            {ringkasJumlah(filteredPawns.length, pawns.length)}
            {search.trim() !== "" || aktif.id !== SUB_TAB_GADAI[0].id ? " · filter aktif" : ""}
          </p>
          {filteredPawns.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-muted-foreground">
              {search.trim()
                ? "Tidak ada pengajuan yang cocok dengan pencarian."
                : `Tidak ada pengajuan gadai pada sub-tab ${aktif.label}.`}
            </p>
          ) : (
            <TabelAntrean
              keterangan={`Antrean gadai, ${filteredPawns.length} pengajuan`}
              judulNominal="Nominal"
              judulKeperluan="Barang & tanggal"
              baris={filteredPawns.map((p) => {
                const menunggu = p.status === "diajukan" || p.status === "sedang_dinilai";
                const labelAksi = menunggu ? "Proses" : "Detail";
                return {
                  id: p._id,
                  referensi: p.nomorReferensi,
                  nama: namaHurufBesar(p.namaLengkap),
                  email: p.emailPeminjam,
                  nominal: p.pokokGadai ?? p.nilaiTaksiran ?? null,
                  keperluan: `${p.deskripsiBarang} · ${p.kategori}`,
                  waktu: p._creationTime,
                  statusTeks: pawnStatusMeta(p.status).label,
                  status: <StatusBadge status={p.status} kind="pawn" />,
                  aksi: (
                    <TombolAksiAntrean
                      label={labelAksi}
                      utama={menunggu}
                      onClick={() => onOpen(p)}
                      ariaLabel={`${labelAksi} pengajuan ${p.nomorReferensi}`}
                    />
                  ),
                };
              })}
            />
          )}
        </div>
      )}
      <GadaiDanaPanel pawns={pawns} />
    </>
  );
}
