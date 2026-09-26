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

const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = "&copy; OpenStreetMap contributors";
/** Basemap cadangan bila tile OSM tidak dapat dimuat dari jaringan pengguna. */
const FALLBACK_TILE_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";

export function LiveLocationMap() {
  const data = useQuery(api.admin.petaPeminjam);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const dataRef = useRef<typeof data>(undefined);
  const drawRef = useRef<(() => void) | null>(null);

  // Radix Tabs menyimpan konten tab non-aktif dengan atribut `hidden`
  // (lihat @radix-ui/react-tabs → Presence). Leaflet yang diinisialisasi pada
  // kontainer berukuran 0 × 0 px tidak akan memuat tile maupun menggambar
  // marker — persis gejala "peta blank". Karena itu peta baru dibuat setelah
  // kontainer benar-benar terlihat dan terukur.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let disposed = false;

    const validCoord = (lat: number, lng: number) =>
      Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

    const draw = () => {
      const map = mapRef.current;
      const layer = layerRef.current;
      if (map === null || layer === null) return;
      // Selagi data server belum tiba, gambar dulu baseline gudang dari
      // konfigurasi default supaya peta tidak pernah tampil kosong.
      const current = dataRef.current;
      const vault = current?.vault ?? { lat: DEFAULT_CONFIG.vaultLat, lng: DEFAULT_CONFIG.vaultLng };
      if (!validCoord(vault.lat, vault.lng)) {
        console.error("Koordinat gudang tidak valid", vault);
        return;
      }
      layer.clearLayers();
      L.circleMarker([vault.lat, vault.lng], {
        radius: 10,
        color: "#0EA5E9",
        fillColor: "#38BDF8",
        fillOpacity: 0.9,
        weight: 3,
      })
        .bindTooltip("Gudang Brankas PINDAI", { direction: "top" })
        .addTo(layer);
      const radiusKm =
        current !== undefined && Number.isFinite(current.gpsMismatchKm)
          ? Math.max(0, current.gpsMismatchKm)
          : DEFAULT_CONFIG.gpsMismatchKm;
      L.circle([vault.lat, vault.lng], {
        radius: radiusKm * 1000,
        color: "#38BDF8",
        fillColor: "#38BDF8",
        fillOpacity: 0.05,
        weight: 1,
        dashArray: "6 6",
      }).addTo(layer);
      const titikPeminjam: L.LatLngTuple[] = [];
      for (const r of current?.rows ?? []) {
        if (!r.posisi || !validCoord(r.posisi.lat, r.posisi.lng)) continue;
        titikPeminjam.push([r.posisi.lat, r.posisi.lng]);
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
              (r.mismatch ? "GPS MISMATCH" : r.jarakVaultKm !== null ? `${r.jarakVaultKm.toFixed(1)} km dari vault` : ""),
            { direction: "top" },
          )
          .addTo(layer);
      }
      map.invalidateSize({ pan: false });
      // Satu titik tidak punya luasan, sehingga fitBounds akan melompat ke zoom
      // maksimum (peta nyaris kosong). Pakai tampilan kota bila belum ada
      // posisi peminjam.
      if (titikPeminjam.length === 0) {
        map.setView([vault.lat, vault.lng], 12, { animate: false });
      } else {
        const bounds = L.latLngBounds(titikPeminjam);
        bounds.extend([vault.lat, vault.lng]);
        map.fitBounds(bounds, { animate: false, padding: [30, 30], maxZoom: 15 });
      }
    };
    drawRef.current = draw;

    const ensureMap = () => {
      if (disposed || mapRef.current !== null) return;
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      try {
        const map = L.map(container, { scrollWheelZoom: true }).setView(
          [DEFAULT_CONFIG.vaultLat, DEFAULT_CONFIG.vaultLng],
          12,
        );
        let tiles = L.tileLayer(OSM_TILE_URL, {
          attribution: OSM_ATTRIBUTION,
          maxZoom: 19,
        }).addTo(map);
        // OSM sesekali memblokir/limiting tile dari sebagian jaringan. Bila tile
        // gagal berulang, pindah ke basemap cadangan agar peta tidak tinggal
        // abu-abu tanpa isi.
        let tileErrors = 0;
        let switched = false;
        tiles.on("tileerror", () => {
          if (switched) return;
          tileErrors += 1;
          console.warn(`Tile peta gagal dimuat (${tileErrors}×)`);
          if (tileErrors < 4) return;
          switched = true;
          const pengganti = L.tileLayer(FALLBACK_TILE_URL, {
            attribution: `${OSM_ATTRIBUTION} &copy; CARTO`,
            maxZoom: 19,
          }).addTo(map);
          map.removeLayer(tiles);
          tiles = pengganti;
        });
        mapRef.current = map;
        layerRef.current = L.layerGroup().addTo(map);
        draw();
        requestAnimationFrame(() => {
          if (disposed) return;
          mapRef.current?.invalidateSize({ pan: false });
          drawRef.current?.();
        });
      } catch (error) {
        console.error("Gagal menginisialisasi peta admin", error);
        mapRef.current = null;
        layerRef.current = null;
      }
    };

    ensureMap();
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        ensureMap();
        if (container.clientWidth > 0 && container.clientHeight > 0) {
          mapRef.current?.invalidateSize({ pan: false });
        }
      });
      resizeObserver.observe(container);
    }
    // Jaring pengaman tambahan saat tab baru dibuka/ditampilkan kembali.
    if (typeof IntersectionObserver !== "undefined") {
      intersectionObserver = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) ensureMap();
      });
      intersectionObserver.observe(container);
    }

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      drawRef.current = null;
      const map = mapRef.current;
      mapRef.current = null;
      layerRef.current = null;
      map?.remove();
    };
  }, []);

  useEffect(() => {
    dataRef.current = data;
    drawRef.current?.();
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
      <div
        className="relative h-[420px] min-h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-sky-50 shadow-[0_14px_30px_-20px_oklch(0.55_0.12_240/0.35)]"
        style={{ height: 420, minHeight: 420 }}
      >
        <div
          ref={containerRef}
          role="region"
          aria-label="Peta lokasi peminjam"
          className="absolute inset-0 z-0 bg-[#ddd]"
        />
        {data === undefined && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs text-muted-foreground shadow-sm">
              <Loader2 className="size-3.5 animate-spin" /> Memuat titik lokasi…
            </span>
          </div>
        )}
      </div>
      {data !== undefined && (
        <ul className="divide-y divide-sky-100 rounded-2xl border border-slate-200 bg-white">
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
    <ul className="divide-y divide-sky-100 rounded-2xl border border-slate-200 bg-white">
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
    <ul className="divide-y divide-sky-100 rounded-2xl border border-slate-200 bg-white">
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
              <li key={p._id} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
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
          <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`mt-1 text-sm font-semibold tabular-nums ${label === "Status" ? (summary.seimbang ? "text-emerald-600" : "text-red-600") : "text-navy"}`}>
              {value}
            </p>
          </div>
        ))}
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari akun / grup / keterangan…" className="rounded-full" />
      <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-slate-200 bg-white">
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
