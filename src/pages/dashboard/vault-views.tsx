import L from "leaflet";
import { ArrowRight, Package } from "lucide-react";
import { useEffect, useRef } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import { pawnStatusMeta, type PawnStatus } from "@/lib/pawn";
import { DEFAULT_CONFIG } from "@/lib/system-config";
import { EmptyState } from "./shared";

import "leaflet/dist/leaflet.css";

const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = "&copy; OpenStreetMap contributors";
/** Basemap cadangan bila tile OSM tidak dapat dimuat dari jaringan pengguna. */
const FALLBACK_TILE_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";

/** Tab 3 — Jaminan gadai (vault custody monitor) + peta vault Leaflet. */
export function PawnVaultSection({
  pawns,
  onOpenDetail,
}: {
  pawns: Array<{
    _id: Id<"pawns">;
    _creationTime: number;
    nomorReferensi: string;
    deskripsiBarang: string;
    kategori: string;
    status: string;
    nilaiTaksiran?: number;
    catatanReview?: string;
    pokokGadai?: number;
    sisaPokok?: number;
    persenSewaModal?: number;
  }>;
  onOpenDetail: (id: Id<"pawns">) => void;
}) {
  if (pawns.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="Belum ada jaminan gadai"
        body="Ajukan barang melalui tab Form Pengajuan Baru. Petugas memeriksa di lokasi dengan pencatatan live location."
      />
    );
  }

  return (
    <div className="space-y-6">
      <VaultMapCard />
      <ul className="space-y-3">
        {pawns.map((p) => {
          const meta = pawnStatusMeta(p.status as PawnStatus);
          const dalamVault = p.status === "aktif" || p.status === "menunggu_pelepasan";
          return (
            <li key={p._id} className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <Package className="size-5" strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{p.deskripsiBarang}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {p.kategori} · {p.nomorReferensi}
                    </p>
                  </div>
                </div>
                <StatusBadge status={p.status} kind="pawn" />
              </div>
              <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Status barang</dt>
                  <dd className="text-right">{meta.label}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Nilai taksiran resmi</dt>
                  <dd className="tabular-nums">
                    {p.nilaiTaksiran !== undefined
                      ? formatRupiah(p.nilaiTaksiran)
                      : "Menunggu penilaian"}
                  </dd>
                </div>
                {p.nilaiTaksiran !== undefined && (
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">Maksimal limit (LTV 70%)</dt>
                    <dd className="font-medium tabular-nums text-emerald-700">
                      {formatRupiah(Math.round(p.nilaiTaksiran * 0.7))}
                    </dd>
                  </div>
                )}
                {dalamVault && (
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">Lokasi penyimpanan</dt>
                    <dd>Brankas Custody PINDAI</dd>
                  </div>
                )}
              </dl>
              <Button size="sm" variant="ghost" className="mt-3" onClick={() => onOpenDetail(p._id)}>
                Detail & pelepasan <ArrowRight className="ml-1 size-3.5" />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Peta OpenStreetMap (Leaflet, gratis) lokasi gudang brankas. */
function VaultMapCard() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Radix Tabs meng-unmount konten tab non-aktif, sehingga Leaflet pernah
  // dibuat pada kontainer berukuran 0 × 0 px → peta tampil blank. Peta baru
  // dibuat setelah kontainer benar-benar terlihat dan terukur.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let disposed = false;

    const ensureMap = () => {
      if (disposed || mapRef.current !== null) return;
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      try {
        const map = L.map(container, { scrollWheelZoom: false }).setView(
          [DEFAULT_CONFIG.vaultLat, DEFAULT_CONFIG.vaultLng],
          14,
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
        L.circleMarker([DEFAULT_CONFIG.vaultLat, DEFAULT_CONFIG.vaultLng], {
          radius: 10,
          color: "#2563eb",
          fillColor: "#60a5fa",
          fillOpacity: 0.9,
          weight: 3,
        })
          .bindTooltip("Brankas Custody PINDAI — barang jaminan tersimpan di sini", {
            direction: "top",
          })
          .addTo(map);
        mapRef.current = map;
        requestAnimationFrame(() => {
          if (disposed) return;
          mapRef.current?.invalidateSize({ pan: false });
        });
      } catch (error) {
        console.error("Gagal menginisialisasi peta gudang", error);
        mapRef.current = null;
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
      const map = mapRef.current;
      mapRef.current = null;
      map?.remove();
    };
  }, []);

  return (
    <section className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Lokasi Gudang Brankas</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Barang jaminan disimpan terisolasi di brankas custody.
          </p>
        </div>
        <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          <Package className="mr-1 size-3" /> Brankas Custody
        </Badge>
      </div>
      <div
        className="relative mt-4 h-[260px] min-h-[260px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
        style={{ height: 260, minHeight: 260 }}
      >
        <div
          ref={containerRef}
          role="region"
          aria-label="Peta lokasi gudang brankas"
          className="absolute inset-0 z-0 bg-[#ddd]"
        />
      </div>
    </section>
  );
}
