import { useQuery } from "convex/react";
import L from "leaflet";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { api } from "@/convex/_generated/api";
import { labelTandaLokasi } from "@/lib/lokasi";
import { DEFAULT_CONFIG } from "@/lib/system-config";

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
      const titikPeminjam: L.LatLngTuple[] = [];
      for (const r of current?.rows ?? []) {
        if (!r.posisi || !validCoord(r.posisi.lat, r.posisi.lng)) continue;
        titikPeminjam.push([r.posisi.lat, r.posisi.lng]);
        // Titik yang dicurigai palsu dibedakan warnanya: merah tetap untuk
        // mismatch (di luar radius), karena itu masalah operasional lain.
        const warna = r.tanda.length > 0 ? "#b45309" : r.mismatch ? "#a5303a" : "#17544e";
        L.circleMarker([r.posisi.lat, r.posisi.lng], {
          radius: 7,
          color: warna,
          fillColor: warna,
          fillOpacity: 0.85,
          weight: 2,
        })
          .bindTooltip(
            `<strong>${r.namaLengkap}</strong><br/>${r.nomorReferensi} · status ledger: ${r.statusPinjaman}<br/>` +
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          OpenStreetMap — koordinat yang dilaporkan perangkat dan titik acuan konfigurasi. Penanda jarak/pola dihitung otomatis dari koordinat yang dilaporkan. Ambang pola {data?.gpsMismatchKm ?? DEFAULT_CONFIG.gpsMismatchKm} km.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Dalam ambang jarak</Badge>
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Di luar ambang jarak</Badge>
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pola koordinat ditandai</Badge>
        </div>
      </div>
      <div
        className="relative h-[55vh] min-h-[280px] max-h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm sm:h-[420px]"
      >
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
      </div>
      {data !== undefined && (
        <ul className="animate-masuk divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {data.rows
            .filter((r) => r.mismatch || r.tanda.length > 0)
            .map((r) => (
              <li key={r.userId} className="flex flex-col items-start justify-between gap-2 px-3 py-3 text-sm sm:flex-row sm:items-center sm:gap-3 sm:px-5">
                <span className="min-w-0">
                  {r.mismatch && (
                    <Badge className="mr-2 bg-red-100 text-red-700 hover:bg-red-100">Di luar ambang jarak</Badge>
                  )}
                  {r.tanda.length > 0 && (
                    <Badge className="mr-2 bg-amber-100 text-amber-800 hover:bg-amber-100">Pola koordinat ditandai</Badge>
                  )}
                  {r.namaLengkap} · {r.nomorReferensi}
                </span>
                <span className="shrink-0 tabular-nums text-xs text-muted-foreground sm:text-sm">
                  {r.tanda.length > 0
                    ? "koordinat berulang (indikator otomatis)"
                    : r.jarakVaultKm !== null
                      ? `${r.jarakVaultKm.toFixed(1)} km dari titik acuan`
                      : ""}
                </span>
              </li>
            ))}
          {data.rows.every((r) => !r.mismatch && r.tanda.length === 0) && (
            <li className="px-5 py-3 text-sm text-muted-foreground">
              Tidak ada koordinat yang melampaui ambang pola saat ini. Hasil otomatis ini bukan konfirmasi lokasi fisik.
            </li>
          )}
        </ul>
      )}
      <PeringatanLokasiTerbaru />
    </div>
  );
}

/**
 * Riwayat peringatan "lokasi dicurigai" — termasuk status pengiriman
 * WhatsApp-nya, sehingga tim tahu bila pesan tidak sampai karena gateway WA
 * belum diaktifkan atau nomor nasabah belum lengkap di KYC.
 */
function PeringatanLokasiTerbaru() {
  const rows = useQuery(api.admin.peringatanLokasiTerbaru, {});
  if (rows === undefined) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat peringatan lokasi…
      </p>
    );
  }
  if (rows.length === 0) return null;
  return (
    <div className="animate-masuk rounded-2xl border border-amber-200 bg-white">
      <p className="border-b border-amber-100 bg-amber-50/70 px-5 py-3 text-sm font-medium text-amber-900">
        Peringatan lokasi terbaru (dikirim otomatis ke nasabah)
      </p>
      <ul className="divide-y divide-slate-200">
        {rows.map((r) => (
          <li
            key={r._id}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
          >
            <span className="min-w-0">
              <span className="font-medium">{r.nama}</span>
              {r.nomorReferensi !== null && (
                <span className="text-muted-foreground"> · {r.nomorReferensi}</span>
              )}
              <span className="mt-1 block text-xs text-muted-foreground">
                {r.tanda.map(labelTandaLokasi).join(", ")} ·{" "}
                {new Date(r.waktu).toLocaleString("id-ID")}
              </span>
            </span>
            <span className="flex shrink-0 flex-wrap items-center gap-2">
              <Badge
                className={
                  r.waStatus === "terkirim"
                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-100"
                }
              >
                {r.waStatus === "terkirim"
                  ? "WA terkirim"
                  : r.waStatus === "tanpa_nomor"
                    ? "WA: nomor belum ada"
                    : r.waStatus === "dinonaktifkan"
                      ? "WA: belum diaktifkan"
                      : r.waStatus === "gagal"
                        ? "WA gagal"
                        : "WA: menunggu"}
              </Badge>
              <Badge
                className={
                  r.dibacaPada === null
                    ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-100"
                }
              >
                {r.dibacaPada === null ? "Belum diakui nasabah" : "Sudah diakui"}
              </Badge>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
