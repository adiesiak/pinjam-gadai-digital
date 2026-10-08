import L from "leaflet";
import { MapPin } from "lucide-react";
import { useEffect, useRef } from "react";

import { labelTandaLokasi } from "@/lib/lokasi";
import { namaHurufBesar } from "@/lib/nama";
import type { TitikPeminjam } from "@/convex/penyediaDana";

import "leaflet/dist/leaflet.css";

/**
 * Peta OpenStreetMap (Leaflet, gratis) titik lokasi terakhir peminjam untuk
 * ruang penyedia dana.
 *
 * Sifatnya "live" karena datanya berasal dari query Convex reaktif: setiap kali
 * perangkat peminjam mengirim titik GPS baru (±60 detik selama dashboardnya
 * terbuka), titik di peta ikut berpindah tanpa memuat ulang halaman. Peta ini
 * hanya menggambar apa yang dilaporkan perangkat — bukan bukti posisi fisik.
 */
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = "&copy; OpenStreetMap contributors";
/** Basemap cadangan bila tile OSM tidak dapat dimuat dari jaringan pengguna. */
const FALLBACK_TILE_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";

const WARNA_NORMAL = "#17544e";
const WARNA_DITANDAI = "#b45309";
const WARNA_ACUAN = "#6fa39b";

function koordinatValid(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function waktuRingkas(ms: number): string {
  return new Date(ms).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PetaLokasiPeminjam({
  rows,
  vault,
}: {
  rows: TitikPeminjam[];
  vault: { lat: number; lng: number };
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const dataRef = useRef<{ rows: TitikPeminjam[]; vault: { lat: number; lng: number } }>({
    rows,
    vault,
  });
  const drawRef = useRef<(() => void) | null>(null);

  // Radix Tabs menyembunyikan konten tab non-aktif. Leaflet yang dibuat pada
  // kontainer 0 × 0 px tidak memuat tile sama sekali (gejala peta kosong),
  // karena itu peta baru diinisialisasi setelah kontainer benar-benar terlihat.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let disposed = false;

    const draw = () => {
      const map = mapRef.current;
      const layer = layerRef.current;
      if (map === null || layer === null) return;
      const current = dataRef.current;
      const vaultValid = koordinatValid(current.vault.lat, current.vault.lng);
      layer.clearLayers();

      if (vaultValid) {
        L.circleMarker([current.vault.lat, current.vault.lng], {
          radius: 8,
          color: "#1f6a62",
          fillColor: WARNA_ACUAN,
          fillOpacity: 0.85,
          weight: 2,
        })
          .bindTooltip("Titik acuan konfigurasi (bukan posisi gudang terverifikasi)", {
            direction: "top",
          })
          .addTo(layer);
      }

      const titik: L.LatLngTuple[] = [];
      for (const r of current.rows) {
        const { lat, lng } = r.posisi;
        if (!koordinatValid(lat, lng)) continue;
        titik.push([lat, lng]);
        const ditandai = r.posisi.tanda.length > 0;
        const warna = ditandai ? WARNA_DITANDAI : WARNA_NORMAL;
        const keterangan = [
          `<strong>${namaHurufBesar(r.namaLengkap)}</strong>`,
          `${r.nomorReferensi} · ${r.kategori}`,
          `titik terakhir: ${waktuRingkas(r.posisi.waktu)} (±${Math.round(r.posisi.akurasi)} m, ${r.posisi.sumber})`,
          ditandai ? `POLA KOORDINAT DICURIGAI (OTOMATIS): ${r.posisi.tanda.map(labelTandaLokasi).join(", ")}` : "",
        ]
          .filter((baris) => baris !== "")
          .join("<br/>");
        L.circleMarker([lat, lng], {
          radius: 7,
          color: warna,
          fillColor: warna,
          fillOpacity: 0.85,
          weight: 2,
        })
          .bindTooltip(keterangan, { direction: "top" })
          .addTo(layer);
      }

      map.invalidateSize({ pan: false });
      // Satu titik tidak punya luasan — fitBounds akan melompat ke zoom maksimum
      // dan peta tampak kosong. Pakai tampilan kota bila titiknya tinggal satu.
      if (titik.length <= 1) {
        const pusat = titik[0] ?? (vaultValid ? [current.vault.lat, current.vault.lng] : null);
        if (pusat !== null) map.setView(pusat, 13, { animate: false });
      } else {
        const bounds = L.latLngBounds(titik);
        if (vaultValid) bounds.extend([current.vault.lat, current.vault.lng]);
        map.fitBounds(bounds, { animate: false, padding: [30, 30], maxZoom: 15 });
      }
    };
    drawRef.current = draw;

    const ensureMap = () => {
      if (disposed || mapRef.current !== null) return;
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      try {
        const map = L.map(container, { scrollWheelZoom: true }).setView(
          [dataRef.current.vault.lat, dataRef.current.vault.lng],
          12,
        );
        let tiles = L.tileLayer(OSM_TILE_URL, {
          attribution: OSM_ATTRIBUTION,
          maxZoom: 19,
        }).addTo(map);
        let tileErrors = 0;
        let switched = false;
        tiles.on("tileerror", () => {
          if (switched) return;
          tileErrors += 1;
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
        console.error("[PINDAI] Gagal menginisialisasi peta ruang penyedia dana", error);
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
    dataRef.current = { rows, vault };
    drawRef.current?.();
  }, [rows, vault]);

  return (
    <div className="relative h-[52vh] min-h-[280px] max-h-[440px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm sm:h-[440px]">
      <div
        ref={containerRef}
        role="region"
        aria-label="Peta titik lokasi terakhir peminjam"
        className="absolute inset-0 z-0 bg-[#ddd]"
      />
      {rows.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
          <span className="flex max-w-sm items-center gap-2 rounded-2xl bg-white/95 px-4 py-3 text-center text-xs leading-5 text-muted-foreground shadow-sm">
            <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
            Belum ada titik lokasi yang terkirim dari perangkat peminjam.
          </span>
        </div>
      )}
    </div>
  );
}
