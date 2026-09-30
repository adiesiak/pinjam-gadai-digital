import { useQuery } from "convex/react";
import { BellRing, Gavel, Loader2, Send, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { formatRupiah, parseRupiah } from "@/lib/money";

import { EmptyQueue, QueueRow, formatDate, type LoanRow } from "./admin-shared";

export function LoanAllocationQueueTab({ onOpen }: { onOpen: (l: LoanRow) => void }) {
  const overview = useQuery(api.admin.adminOverview);
  if (overview === undefined) {
    return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>;
  }
  const pinjamanDisetujui = overview.loans.filter((l) => l.status === "disetujui");
  if (pinjamanDisetujui.length === 0) {
    return <EmptyQueue icon={Wallet} title="Tidak ada pengajuan berstatus disetujui internal" />;
  }
  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
        Daftar ini hanya menampilkan keputusan review internal dan hitungan aplikasi. Persetujuan admin tercatat sebagai keputusan review pada ledger internal.
      </p>
      <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
        {pinjamanDisetujui.map((l) => (
          <li key={l._id}>
            <QueueRow
              reference={l.nomorReferensi}
              date={formatDate(l._creationTime)}
              title={formatRupiah(l.pokokPinjaman)}
              subtitle={`${l.namaLengkap} · nilai bersih ${formatRupiah(Math.round(l.pokokPinjaman * 0.95))} · rekening yang dimasukkan ${l.nomorRekening}`}
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
    return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>;
  }
  const terlambat = overview.loans.filter((l) => l.status === "didanai" && (l.hariTerlambat ?? 0) > 0);
  if (terlambat.length === 0) {
    return <EmptyQueue icon={BellRing} title="Tidak ada tanggal acuan yang terlewati" />;
  }
  return (
    <div className="space-y-3">
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
                <p className="truncate text-sm font-medium">Data pemohon: {l.namaLengkap} — pokok pinjaman {formatRupiah(l.pokokPinjaman)}</p>
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
    return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>;
  }
  const kandidat = overview.pawns.filter((p) => p.status === "aktif" && (p.nilaiTaksiran ?? 0) > 0);
  return (
    <div className="space-y-4">
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

/**
 * Grafik tren nilai biaya platform pada ledger per bulan (12 bulan terakhir).
 * Recharts langsung (Area) — warna dari token tema `--primary` agar selaras
 * dengan "tinta & kuningan"; axis ringkas, tooltip rupiah penuh.
 */
function TrenPendapatanChart({
  data,
}: {
  data: Array<{ kunci: string; label: string; jumlah: number }> | undefined;
}) {
  const total = useMemo(
    () => (data ?? []).reduce((acc, d) => acc + d.jumlah, 0),
    [data],
  );
  if (data === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat grafik tren…
      </div>
    );
  }
  const semuaNol = total === 0;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-navy">Tren biaya pada ledger — 12 bulan terakhir</h3>
        <p className="text-sm font-semibold tabular-nums text-navy">{formatRupiah(total)}</p>
      </div>
      <div className="mt-4 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="gradPendapatan" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              interval="preserveStartEnd"
            />
            <YAxis
              width={64}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickFormatter={(v: number) =>
                v >= 1_000_000 ? `${Math.round(v / 1_000_000)}jt` : v > 0 ? `${Math.round(v / 1_000)}rb` : "0"
              }
            />
            <RechartsTooltip
              formatter={(value) => [formatRupiah(Number(value)), "Nilai ledger"]}
              labelFormatter={(label) => `Bulan ${label}`}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="jumlah"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#gradPendapatan)"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {semuaNol && (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Belum ada biaya platform yang tercatat pada ledger internal dalam 12 bulan terakhir.
        </p>
      )}
    </div>
  );
}

export function LedgerTab() {
  const summary = useQuery(api.admin.ledgerSummary);
  const rows = useQuery(api.admin.ledgerRows);
  const tren = useQuery(api.admin.trenPendapatanBulanan);
  const [q, setQ] = useState("");
  if (summary === undefined || rows === undefined) {
    return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>;
  }
  const rincian = summary.rincianSkema;
  const filtered = q.trim()
    ? rows.filter(
        (r) =>
          r.groupId.includes(q.trim()) ||
          r.akun.toLowerCase().includes(q.trim().toLowerCase()) ||
          r.keterangan.toLowerCase().includes(q.trim().toLowerCase()),
      )
    : rows;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ["Total debit", formatRupiah(summary.totalDebit)],
          ["Total kredit", formatRupiah(summary.totalKredit)],
          ["Jumlah entri", `${summary.entryCount}`],
          ["Status", summary.seimbang ? "Seimbang" : "Tidak seimbang"],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`mt-1 text-sm font-semibold tabular-nums ${label === "Status" ? (summary.seimbang ? "text-emerald-600" : "text-red-600") : "text-navy"}`}>
              {value}
            </p>
          </div>
        ))}
      </div>
      <TrenPendapatanChart data={tren} />

      {/* Nilai biaya platform internal per skema — dari entri platform:FEE. */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-navy">Nilai biaya pada ledger per skema</h3>
          <p className="text-sm font-semibold tabular-nums text-navy">
            {formatRupiah(summary.pendapatanPlatform)}
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ["Pinjaman tunai", rincian.pinjaman, "Biaya pinjaman harian 5%; tenor bulanan 7% untuk 3/6 bulan dan 3% untuk 1 bulan"],
            ["Gadai (Skema B)", rincian.gadai, "Nilai potongan 1% + sewa modal"],
            ["Kredit barang (Skema C)", rincian.kredit, "Biaya tenor 12/24 bulan 3%; tenor 3/6 bulan admin 5% + platform 2%"],
            ["Lainnya", rincian.lainnya, "Entri biaya internal di luar tiga skema utama"],
          ] as const).map(([label, value, hint]) => (
            <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-navy">{formatRupiah(value)}</p>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{hint}</p>
            </div>
          ))}
        </div>
      </div>
      <Input aria-label="Cari akun, grup, atau keterangan ledger" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari akun / grup / keterangan…" />
      <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-100 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Waktu</th>
              <th className="px-4 py-2.5">Grup</th>
              <th className="px-4 py-2.5">Akun</th>
              <th className="px-4 py-2.5">Arah</th>
              <th className="px-4 py-2.5 text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.slice(0, 200).map((r) => (
              <tr key={r._id}>
                <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{new Date(r.waktu).toLocaleString("id-ID")}</td>
                <td className="max-w-32 truncate px-4 py-2 text-muted-foreground">{r.groupId}</td>
                <td className="px-4 py-2 font-medium">{r.akun}</td>
                <td className="px-4 py-2">
                  <span className={r.arah === "debit" ? "text-emerald-600" : "text-sky-600"}>{r.arah}</span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{formatRupiah(r.jumlah)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
