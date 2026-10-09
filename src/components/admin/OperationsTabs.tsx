import { useQuery } from "convex/react";
import { BellRing, Gavel, Send, Wallet } from "lucide-react";
import { useState } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { namaHurufBesar } from "@/lib/nama";

import { formatDate } from "./admin-format";
import { EmptyQueue, PanelMemuat, QueueRow, type LoanRow } from "./admin-shared";

export function LoanAllocationQueueTab({ onOpen }: { onOpen: (l: LoanRow) => void }) {
  const overview = useQuery(api.admin.adminOverview);
  if (overview === undefined) {
    return <PanelMemuat />;
  }
  const pinjamanDisetujui = overview.loans.filter((l) => l.status === "disetujui");
  if (pinjamanDisetujui.length === 0) {
    return (
      <EmptyQueue
        icon={Wallet}
        title="Tidak ada pinjaman yang siap disalurkan"
        deskripsi="Antrean ini memuat pinjaman yang keputusan nominalnya sudah tercatat dan dananya belum ditandai tersalurkan — semuanya berstatus Ditinjau di daftar pinjaman."
      />
    );
  }
  return (
    <div className="animate-masuk space-y-3">
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
        Daftar ini menampilkan pinjaman yang keputusan nominalnya sudah tercatat dan dananya belum ditandai tersalurkan — statusnya masih <strong>Ditinjau</strong> pada daftar pinjaman. Tandai dana tersalurkan dari dialognya bila pencairan sudah terjadi.
      </p>
      <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
        {pinjamanDisetujui.map((l) => (
          <li key={l._id}>
            <QueueRow
              reference={l.nomorReferensi}
              date={formatDate(l._creationTime)}
              title={formatRupiah(l.pokokPinjaman)}
              subtitle={`${namaHurufBesar(l.namaLengkap)} · dana bersih ${formatRupiah(
                l.tenorBulan !== null
                  ? l.pokokPinjaman - (l.biayaLayananTotal ?? 0)
                  : Math.round(l.pokokPinjaman * 0.95),
              )} · rekening yang dimasukkan ${l.nomorRekening}`}
              status={<StatusBadge status={l.status} kind="loan" />}
              onOpen={() => onOpen(l)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DpdTab() {
  const overview = useQuery(api.admin.adminOverview);
  if (overview === undefined) {
    return <PanelMemuat />;
  }
  const terlambat = overview.loans.filter((l) => l.status === "didanai" && (l.hariTerlambat ?? 0) > 0);
  if (terlambat.length === 0) {
    return <EmptyQueue icon={BellRing} title="Tidak ada tanggal acuan yang terlewati" />;
  }
  return (
    <div className="animate-masuk space-y-3">
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
        Daftar ini memuat tanggal acuan yang dihitung aplikasi, bukan tunggakan/tagihan terverifikasi. Tautan WhatsApp membuka draf untuk ditinjau; pastikan isi pesan dan penerima sebelum mengirim.
      </p>
      <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
        {terlambat.map((l) => {
          const waText = encodeURIComponent(
            `Halo. Catatan aplikasi PINDAI ${l.nomorReferensi} menampilkan tanggal acuan yang terlewati ${l.hariTerlambat ?? 0} hari, dengan kewajiban ${formatRupiah(l.totalKewajibanDenganPenalti ?? 0)} dan denda ${formatRupiah(l.dendaTerlambat ?? 0)}. Ini hanya catatan ledger internal, bukan tagihan, tunggakan terverifikasi, bukti pembayaran, atau kewajiban aktual. Untuk pertanyaan, gunakan kanal resmi yang telah Anda konfirmasi.`,
          );
          const waNomor = l.nomorWhatsApp ?? "";
          return (
            <li key={l._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">Data pemohon: {namaHurufBesar(l.namaLengkap)} — pokok pinjaman {formatRupiah(l.pokokPinjaman)}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {l.nomorReferensi} · tanggal acuan terlewati {l.hariTerlambat} hari · denda {formatRupiah(l.dendaTerlambat ?? 0)} · kewajiban {formatRupiah(l.totalKewajibanDenganPenalti ?? 0)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {waNomor && (
                  <a
                    href={`https://wa.me/${waNomor}?text=${waText}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-transform hover:-translate-y-0.5 hover:bg-emerald-600"
                  >
                    <Send className="size-4" /> Tinjau pesan WA
                  </a>
                )}
                <StatusBadge status={l.status} kind="loan" />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function LelangTab() {
  const overview = useQuery(api.admin.adminOverview);
  const [nilaiLelang, setNilaiLelang] = useState<Record<string, string>>({});
  if (overview === undefined) {
    return <PanelMemuat />;
  }
  const kandidat = overview.pawns.filter((p) => p.status === "aktif" && (p.nilaiTaksiran ?? 0) > 0);
  return (
    <div className="animate-masuk space-y-4">
      <p className="text-sm text-muted-foreground">
        Kalkulator hipotetis: masukkan angka contoh untuk dibandingkan dengan kewajiban pada ledger. Harga/nilai barang dan kode rak mengikuti pencatatan internal. Tampilan ini tidak melaksanakan lelang, penjualan, pelunasan, ataupun pengembalian barang/dana.
      </p>
      {kandidat.length === 0 ? (
        <EmptyQueue icon={Gavel} title="Belum ada barang gadai aktif untuk kalkulator lelang" />
      ) : (
        <ul className="space-y-3">
          {kandidat.map((p) => {
            const input = nilaiLelang[p._id] ?? "";
            let hasil: string | null = null;
            try {
              const v = input.trim() === "" ? 0 : parseRupiah(input);
              const kewajiban = Math.round((p.nilaiTaksiran ?? 0) * 1.3);
              const sisa = v - kewajiban;
              hasil = v <= 0 ? null : sisa >= 0 ? `Selisih hipotetis: ${formatRupiah(sisa)} (tidak dibayarkan atau dikembalikan).` : `Selisih hipotetis: ${formatRupiah(-sisa)}; ini bukan penagihan atau kewajiban terverifikasi.`;
            } catch {
              hasil = "Nominal tidak valid.";
            }
            return (
              <li key={p._id} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.deskripsiBarang}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {p.nomorReferensi} · {p.kategori} · nilai taksiran internal {formatRupiah(p.nilaiTaksiran ?? 0)} · kode lokasi aplikasi {p.kodeRakVault ?? "—"}
                    </p>
                  </div>
                  <Label htmlFor={`harga-lelang-${p._id}`} className="sr-only">
                    Angka harga hipotetis untuk kalkulator lelang {p.nomorReferensi}
                  </Label>
                  <Input
                    id={`harga-lelang-${p._id}`}
                    inputMode="numeric"
                    value={input}
                    onChange={(e) => setNilaiLelang((m) => ({ ...m, [p._id]: e.target.value }))}
                    placeholder="Angka contoh (mis. 8.000.000)"
                    className="w-56"
                  />
                </div>
                {hasil && <p className="mt-2 text-xs font-medium text-navy">{hasil}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
