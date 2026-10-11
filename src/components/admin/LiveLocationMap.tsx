import { useQuery } from "convex/react";
import L from "leaflet";
import { Loader2, MapPin, Radio, ShieldX, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { labelTandaLokasi } from "@/lib/lokasi";
import { namaHurufBesar } from "@/lib/nama";
import { DEFAULT_CONFIG } from "@/lib/system-config";

import "leaflet/dist/leaflet.css";

const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = "&copy; OpenStreetMap contributors";
/** Basemap cadangan bila tile OSM tidak dapat dimuat dari jaringan pengguna. */
const FALLBACK_TILE_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";

type FilterStatus = "semua" | "aman" | "diLuar";

export function LiveLocationMap() {
  const data = useQuery(api.admin.petaPeminjam);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const dataRef = useRef<typeof data>(undefined);
  const drawRef = useRef<(() => void) | null>(null);
  const markerRef = useRef<Record<string, L.CircleMarker>>({});

  const [filter, setFilter] = useState<FilterStatus>("semua");
  const [targetId, setTargetId] = useState<string | null>(null);

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
      const vault =
        current?.vault ?? { lat: DEFAULT_CONFIG.vaultLat, lng: DEFAULT_CONFIG.vaultLng };
      if (!validCoord(vault.lat, vault.lng)) {
        console.error("Koordinat gudang tidak valid", vault);
        return;
      }
      layer.clearLayers();
      Object.keys(markerRef.current).forEach((k) => delete markerRef.current[k]);

      L.circleMarker([vault.lat, vault.lng], {
        radius: 10,
        color: "#1f6a62",
        fillColor: "#6fa39b",
        fillOpacity: 0.9,
        weight: 3,
      })
        .bindTooltip("Titik acuan konfigurasi (bukan posisi gudang terverifikasi)", { direction: "top" })
        .addTo(layer);

      const radiusKm =
        current !== undefined && Number.isFinite(current.gpsMismatchKm)
          ? Math.max(0, current.gpsMismatchKm)
          : DEFAULT_CONFIG.gpsMismatchKm;
      L.circle([vault.lat, vault.lng], {
        radius: radiusKm * 1000,
        color: "#6fa39b",
        fillColor: "#6fa39b",
        fillOpacity: 0.05,
        weight: 1,
        dashArray: "6 6",
      }).addTo(layer);

      const filteredRows = current?.rows ?? [];
      for (const r of filteredRows) {
        if (!r.posisi || !validCoord(r.posisi.lat, r.posisi.lng)) continue;
        const warna = r.tanda.length > 0 ? "#b45309" : r.mismatch ? "#a5303a" : "#17544e";
        const marker = L.circleMarker([r.posisi.lat, r.posisi.lng], {
          radius: 7,
          color: warna,
          fillColor: warna,
          fillOpacity: 0.85,
          weight: 2,
        })
          .bindTooltip(
            `<strong>${namaHurufBesar(r.namaLengkap)}</strong><br/>${r.nomorReferensi} · status ledger: ${r.statusPinjaman}<br/>` +
              (r.tanda.length > 0 ? "POLA KOORDINAT DICURIGAI (OTOMATIS)" : "") +
              (r.tanda.length > 0 && r.jarakVaultKm !== null ? " · " : "") +
              (r.mismatch
                ? "DI LUAR AMBANG JARAK (OTOMATIS)"
                : r.jarakVaultKm !== null
                  ? `${r.jarakVaultKm.toFixed(1)} km dari titik acuan`
                  : ""),
            { direction: "top" },
          )
          .addTo(layer);
        markerRef.current[r.userId] = marker;
      }

      map.invalidateSize({ pan: false });
      // Satu titik tidak punya luasan, sehingga fitBounds akan melompat ke zoom
      // maksimum (peta nyaris kosong). Pakai tampilan kota bila belum ada
      // posisi peminjam.
      const visible = filteredRows.filter(
        (r) => r.posisi && validCoord(r.posisi.lat, r.posisi.lng),
      );
      if (visible.length === 0) {
        map.setView([vault.lat, vault.lng], 12, { animate: false });
      } else {
        const titikPeminjam = visible.map((r) => [r.posisi!.lat, r.posisi!.lng] as L.LatLngTuple);
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
      markerRef.current = {};
      map?.remove();
    };
  }, []);

  useEffect(() => {
    dataRef.current = data;
    drawRef.current?.();
  }, [data]);

  useEffect(() => {
    if (targetId === null || !markerRef.current[targetId]) return;
    const marker = markerRef.current[targetId];
    const map = mapRef.current;
    if (map === null) return;
    const latlng = marker.getLatLng();
    map.flyTo(latlng, 15, { animate: true, duration: 0.6 });
    setTimeout(() => {
      map.invalidateSize({ pan: false });
      drawRef.current?.();
    }, 650);
  }, [targetId]);

  if (data === undefined) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat peta lokasi…
      </div>
    );
  }

  const filteredRows =
    filter === "semua"
      ? data.rows
      : filter === "aman"
        ? data.rows.filter((r) => !r.mismatch && r.tanda.length === 0)
        : data.rows.filter((r) => r.mismatch || r.tanda.length > 0);

  const stats = {
    semua: data.rows.length,
    aman: data.rows.filter((r) => !r.mismatch && r.tanda.length === 0).length,
    diLuar: data.rows.filter((r) => r.mismatch || r.tanda.length > 0).length,
  };

  return (
    <div className="animate-masuk flex min-h-0 flex-col gap-4 md:flex-row">
      {/* sidebar kiri: peta 70% */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:w-[70%]">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <MapPin className="size-4" />
            <span className="font-medium text-navy">Live Location &amp; Geofencing</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip selected={filter === "semua"} onClick={() => setFilter("semua")}>
              Semua ({stats.semua})
            </FilterChip>
            <FilterChip selected={filter === "aman"} onClick={() => setFilter("aman")}>
              Aman ({stats.aman})
            </FilterChip>
            <FilterChip selected={filter === "diLuar"} onClick={() => setFilter("diLuar")}>
              Di Luar Ambang Jarak ({stats.diLuar})
            </FilterChip>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm md:h-[420px]">
          <div
            ref={containerRef}
            role="region"
            aria-label="Peta koordinat yang dilaporkan perangkat"
            className="absolute inset-0 z-0 bg-[#ddd]"
          />
          {data === undefined && (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs text-muted-foreground shadow-sm">
                <Loader2 className="size-4 animate-spin" /> Memuat titik lokasi…
              </span>
            </div>
          )}

          {/* Floating Map Legend */}
          <div className="absolute right-3 top-3 z-20 rounded-xl border border-slate-200 bg-white/95 backdrop-blur px-3 py-2 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Legenda Radius
            </p>
            <ul className="mt-1 space-y-1">
              <li className="flex items-center gap-2 text-xs text-slate-700">
                <span className="flex size-2.5 shrink-0 rounded-full border border-emerald-500 bg-emerald-500" />
                Radius Aman
              </li>
              <li className="flex items-center gap-2 text-xs text-slate-700">
                <span className="flex size-2.5 shrink-0 rounded-full border border-red-500 bg-red-500" />
                Di Luar Ambang Jarak
              </li>
              <li className="flex items-center gap-2 text-xs text-slate-700">
                <span className="flex size-2.5 shrink-0 rounded-full border border-amber-500 bg-amber-500" />
                Pola Koordinat Ditandai
              </li>
            </ul>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          OpenStreetMap — koordinat yang dilaporkan perangkat dan titik acuan konfigurasi. Penanda jarak/pola dihitung otomatis dari koordinat yang dilaporkan. Ambang pola {data?.gpsMismatchKm ?? DEFAULT_CONFIG.gpsMismatchKm} km.
        </p>
      </div>

      {/* sidebar kanan: live feed 30% */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 border-t md:border-t-0 md:border-l border-slate-200 md:w-[30%]">
        <div className="flex items-center gap-2 text-xs">
          <Users className="size-4 text-primary" />
          <span className="font-semibold text-navy">Live Geofence Feed</span>
          <span className="text-muted-foreground">· {filteredRows.length} nasabah tampil</span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
          {filteredRows.length === 0 ? (
            <p className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              Tidak ada nasabah sesuai filter.
            </p>
          ) : (
            filteredRows.map((r) => (
              <Button
                key={r.userId}
                type="button"
                variant="ghost"
                className={`justify-start gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white ${
                  r.mismatch ? "border-l-2 border-l-red-400" : r.tanda.length > 0 ? "border-l-2 border-l-amber-400" : ""
                }`}
                onClick={() => setTargetId(r.userId)}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {r.mismatch ? (
                      <ShieldX className="shrink-0 size-3.5 text-red-600" />
                    ) : r.tanda.length > 0 ? (
                      <Radio className="shrink-0 size-3.5 text-amber-600" />
                    ) : (
                      <Radio className="shrink-0 size-3.5 text-emerald-600" />
                    )}
                    <span className="truncate font-medium text-navy">
                      {namaHurufBesar(r.namaLengkap)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {r.nomorReferensi}
                    {r.jarakVaultKm !== null ? ` · ${r.jarakVaultKm.toFixed(1)} km` : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {r.mismatch
                      ? "di luar ambang jarak"
                      : r.tanda.length > 0
                        ? labelTandaLokasi(r.tanda[r.tanda.length - 1])
                        : r.jarakVaultKm !== null
                          ? `sekitar gudang (${r.jarakVaultKm.toFixed(1)} km)`
                          : "—"}
                  </p>
                </div>
              </Button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={selected ? "default" : "outline"}
      size="sm"
      className={`rounded-full px-3 text-[11px] font-medium ${
        selected ? "bg-[#064E3B] text-white hover:bg-[#021E17]" : "border-slate-200 text-slate-600 hover:bg-slate-100"
      }`}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
