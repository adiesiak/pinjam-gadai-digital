import { useQuery } from "convex/react";
import L from "leaflet";
import { BellRing, Gavel, Loader2, Send, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { DEFAULT_CONFIG } from "@/lib/system-config";
import { EmptyQueue, QueueRow, formatDate, type LoanRow } from "./admin-shared";

import "leaflet/dist/leaflet.css";

export function LiveLocationMap() {
  const data = useQuery(api.admin.petaPeminjam);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null || mapRef.current !== null) return;

    let map: L.Map | null = null;
    let resizeObserver: ResizeObserver | null = null;
    try {
      map = L.map(container, { scrollWheelZoom: true }).setView(
        [DEFAULT_CONFIG.vaultLat, DEFAULT_CONFIG.vaultLng],
        11,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      // Leaflet perlu ukuran container yang sudah terukur. invalidateSize
      // menjaga tile tetap terlihat ketika tab admin baru aktif di Firefox.
      requestAnimationFrame(() => {
        if (map !== null && mapRef.current === map) map.invalidateSize({ pan: false });
      });
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          if (map !== null && mapRef.current === map) map.invalidateSize({ pan: false });
        });
        resizeObserver.observe(container);
      }
    } catch (error) {
      console.error("Gagal menginisialisasi peta admin", error);
    }

    return () => {
      resizeObserver?.disconnect();
      if (mapRef.current === map) {
        map?.remove();
        mapRef.current = null;
      }
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer || data === undefined) return;

    const validCoord = (lat: number, lng: number) =>
      Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    if (!validCoord(data.vault.lat, data.vault.lng)) {
      console.error("Koordinat gudang tidak valid", data.vault);
      return;
    }
    layer.clearLayers();
    L.circleMarker([data.vault.lat, data.vault.lng], {
      radius: 10,
      color: "#0EA5E9",
      fillColor: "#38BDF8",
      fillOpacity: 0.9,
      weight: 3,
    })
      .bindTooltip("Gudang Brankas PINDAI", { direction: "top" })
      .addTo(layer);
    const radiusKm = Number.isFinite(data.gpsMismatchKm) ? Math.max(0, data.gpsMismatchKm) : DEFAULT_CONFIG.gpsMismatchKm;
    L.circle([data.vault.lat, data.vault.lng], {
      radius: radiusKm * 1000,
      color: "#38BDF8",
      fillColor: "#38BDF8",
      fillOpacity: 0.05,
      weight: 1,
      dashArray: "6 6",
    }).addTo(layer);
    const bounds = L.latLngBounds([L.latLng(data.vault.lat, data.vault.lng)]);
    for (const r of data.rows) {
      if (!r.posisi || !validCoord(r.posisi.lat, r.posisi.lng)) continue;
      bounds.extend([r.posisi.lat, r.posisi.lng]);
      const warna = r.mismatch ? "#EF4444" : "#10B981";
      L.circleMarker([r.posisi.lat, r.posisi.lng], {
        radius: 7,
        color: warna,
        fillColor: warna,
        fillOpacity: 0.85,
        weight: 2,
      })
        .bindTooltip(
          `<strong>${r.namaLengkap}</strong><br/>${r.nomorReferensi} · ${r.statusPinjaman}<br/>` +
            (r.mismatch ? `GPS MISMATCH` : r.jarakVaultKm !== null ? `${r.jarakVaultKm.toFixed(1)} km dari vault` : ""),
          { direction: "top" },
        )
        .addTo(layer);
    }
    map.invalidateSize({ pan: false });
    map.fitBounds(bounds.pad(0.25), { animate: false });
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Peta live OpenStreetMap (gratis) — posisi peminjam, gudang brankas, dan radius mismatch {data?.gpsMismatchKm ?? DEFAULT_CONFIG.gpsMismatchKm} km.
        </p>
        <div className="flex items-center gap-2 text-xs">
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Dalam radius</Badge>
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">GPS Mismatch</Badge>
        </div>
      </div>
      <div className="relative h-[420px] min-h-[420px] overflow-hidden rounded-2xl border border-sky-100 bg-sky-50 shadow-[0_14px_30px_-20px_oklch(0.55_0.12_240/0.35)]">
        <div
          ref={containerRef}
          aria-label="Peta lokasi peminjam"
          className="absolute inset-0 z-0"
        />
        {data === undefined && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      {data !== undefined && (
        <ul className="divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
          {data.rows.filter((r) => r.mismatch).map((r) => (
            <li key={r.userId} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="min-w-0 truncate">
                <Badge className="mr-2 bg-red-100 text-red-700 hover:bg-red-100">GPS Mismatch</Badge>
                {r.namaLengkap} · {r.nomorReferensi}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {r.jarakVaultKm !== null ? `${r.jarakVaultKm.toFixed(1)} km dari vault` : ""}
              </span>
            </li>
          ))}
          {data.rows.every((r) => !r.mismatch) && (
            <li className="px-5 py-3 text-sm text-muted-foreground">Tidak ada peminjam di luar radius — semua posisi aman.</li>
          )}
        </ul>
      )}
    </div>
  );
}

export function PencairanTab({ onOpen }: { onOpen: (l: LoanRow) => void }) {
  const overview = useQuery(api.admin.adminOverview);
  if (overview === undefined) {
    return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>;
  }
  const antrean = overview.loans.filter((l) => l.status === "disetujui");
  if (antrean.length === 0) {
    return <EmptyQueue icon={Wallet} title="Tidak ada pinjaman menunggu pencairan" />;
  }
  return (
    <ul className="divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
      {antrean.map((l) => (
        <li key={l._id}>
          <QueueRow
            reference={l.nomorReferensi}
            date={formatDate(l._creationTime)}
            title={formatRupiah(l.pokokPinjaman)}
            subtitle={`${l.namaLengkap} · dana bersih ${formatRupiah(Math.round(l.pokokPinjaman * 0.95))} ke ${l.nomorRekening}`}
            status={<StatusBadge status={l.status} kind="loan" />}
            onOpen={() => onOpen(l)}
          />
        </li>
      ))}
    </ul>
  );
}

export function DpdTab() {
  const overview = useQuery(api.admin.adminOverview);
  if (overview === undefined) {
    return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>;
  }
  const terlambat = overview.loans.filter((l) => l.status === "didanai" && (l.hariTerlambat ?? 0) > 0);
  if (terlambat.length === 0) {
    return <EmptyQueue icon={BellRing} title="Tidak ada pinjaman terlambat — koleksi bersih" />;
  }
  return (
    <ul className="divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
      {terlambat.map((l) => {
        const waText = encodeURIComponent(
          `Halo ${l.namaLengkap}, pengingat PINDAI untuk pinjaman ${l.nomorReferensi}. Total kewajiban Anda saat ini ${formatRupiah(l.totalKewajibanDenganPenalti ?? 0)} (terlambat ${l.hariTerlambat ?? 0} hari, termasuk denda ${formatRupiah(l.dendaTerlambat ?? 0)}). Mohon segera lakukan pelunasan. Terima kasih.`,
        );
        const waNomor = l.nomorWhatsApp ?? "";
        return (
          <li key={l._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{l.namaLengkap} — {formatRupiah(l.pokokPinjaman)}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {l.nomorReferensi} · terlambat <span className="font-semibold text-red-600">{l.hariTerlambat} hari</span> · denda {formatRupiah(l.dendaTerlambat ?? 0)} · total {formatRupiah(l.totalKewajibanDenganPenalti ?? 0)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {waNomor && (
                <a
                  href={`https://wa.me/${waNomor}?text=${waText}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_8px_18px_-8px_oklch(0.7_0.15_160/0.6)] transition-transform hover:-translate-y-0.5 hover:bg-emerald-600"
                >
                  <Send className="size-3.5" /> Kirim Tagihan WA
                </a>
              )}
              <StatusBadge status={l.status} kind="loan" />
            </div>
          </li>
        );
      })}
    </ul>
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
        Simulasi lelang barang jaminan wanprestasi: masukkan harga lelang untuk menghitung sisa hasil setelah pemenuhan kewajiban (pokok + imbal hasil Pendana). Sisa dikembalikan ke Peminjam.
      </p>
      {kandidat.length === 0 ? (
        <EmptyQueue icon={Gavel} title="Belum ada barang gadai aktif untuk simulasi lelang" />
      ) : (
        <ul className="space-y-3">
          {kandidat.map((p) => {
            const input = nilaiLelang[p._id] ?? "";
            let hasil: string | null = null;
            try {
              const v = input.trim() === "" ? 0 : parseRupiah(input);
              const kewajiban = Math.round((p.nilaiTaksiran ?? 0) * 1.3);
              const sisa = v - kewajiban;
              hasil = v <= 0 ? null : sisa >= 0 ? `Sisa hasil lelang ${formatRupiah(sisa)} dikembalikan ke Peminjam.` : `Kekurangan ${formatRupiah(-sisa)} — kewajiban belum tertutup penuh.`;
            } catch {
              hasil = "Nominal tidak valid.";
            }
            return (
              <li key={p._id} className="rounded-2xl border border-sky-100 bg-white px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.deskripsiBarang}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {p.nomorReferensi} · {p.kategori} · taksiran {formatRupiah(p.nilaiTaksiran ?? 0)} · rak {p.kodeRakVault ?? "—"}
                    </p>
                  </div>
                  <Input
                    value={input}
                    onChange={(e) => setNilaiLelang((m) => ({ ...m, [p._id]: e.target.value }))}
                    placeholder="Harga lelang (mis. 8.000.000)"
                    className="w-56 rounded-full"
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

export function LedgerTab() {
  const summary = useQuery(api.admin.ledgerSummary);
  const rows = useQuery(api.admin.ledgerRows);
  const [q, setQ] = useState("");
  if (summary === undefined || rows === undefined) {
    return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>;
  }
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
          ["Total Debit", formatRupiah(summary.totalDebit)],
          ["Total Kredit", formatRupiah(summary.totalKredit)],
          ["Jumlah Entri", `${summary.entryCount}`],
          ["Status", summary.seimbang ? "SEIMBANG" : "TIDAK SEIMBANG"],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-sky-100 bg-white px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`mt-1 text-sm font-semibold tabular-nums ${label === "Status" ? (summary.seimbang ? "text-emerald-600" : "text-red-600") : "text-navy"}`}>
              {value}
            </p>
          </div>
        ))}
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari akun / grup / keterangan…" className="rounded-full" />
      <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-sky-100 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-secondary/70 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Waktu</th>
              <th className="px-4 py-2.5">Grup</th>
              <th className="px-4 py-2.5">Akun</th>
              <th className="px-4 py-2.5">Arah</th>
              <th className="px-4 py-2.5 text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
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
