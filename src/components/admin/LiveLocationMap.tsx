import { useQuery } from "convex/react";
import L from "leaflet";
import { Crosshair, Loader2, MapPin, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { namaHurufBesar } from "@/lib/nama";
import { DEFAULT_CONFIG } from "@/lib/system-config";
import { formatUmurLokasi, umurDetikSejak } from "@/lib/umurLokasi";
import { formatWaktuWIB } from "@/lib/waktu";

import { KartuFeedLokasi } from "./KartuFeedLokasi";

import "leaflet/dist/leaflet.css";

const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = "&copy; OpenStreetMap contributors";
/** Basemap cadangan bila tile OSM tidak dapat dimuat dari jaringan pengguna. */
const FALLBACK_TILE_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";

/**
 * Satu baris `admin.petaPeminjam`.
 *
 * Kolom keaktifan sengaja OPSIONAL: halaman ini bisa saja sudah versi baru
 * sementara fungsi Convex di deployment masih versi lama (deploy backend dan
 * deploy situs tidak selalu bersamaan). Tanpa tanda opsional, peta admin akan
 * pecah pada masa peralihan itu — jadi setiap kolom baru dibaca dengan nilai
 * cadangan yang jujur: "tidak diketahui", bukan "langsung".
 */
type BarisPeta = {
  userId: string;
  namaLengkap: string;
  nomorReferensi: string;
  statusPinjaman: string;
  posisi: {
    lat: number;
    lng: number;
    waktu: number;
    /** "realtime" adalah nilai lama sebelum panel ini memakai "perangkat". */
    sumber: "perangkat" | "pengajuan" | "realtime";
  } | null;
  umurDetik?: number | null;
  langsung?: boolean;
  akurasi?: number | null;
  jalur?: Array<{ lat: number; lng: number; waktu: number }>;
  perangkat?: {
    platform: string;
    versiApp: string;
    terakhirDilihat: number;
    aktif: boolean;
  } | null;
  jarakVaultKm: number | null;
  mismatch: boolean;
  tanda: string[];
};

type FilterStatus = "semua" | "langsung" | "aman" | "diLuar";

/**
 * Status langsung dihitung ULANG di peramban dari waktu titik + ambang server.
 *
 * Data Convex hanya berubah saat ada heartbeat masuk. Tanpa hitung ulang ini,
 * penanda terakhir akan tetap berdenyut selamanya walau perangkatnya sudah
 * mati — persis kesan "live" palsu yang ingin dihilangkan. Ambangnya tetap
 * milik server (`lokasiMaxUmurMenit`), bukan angka baru di antarmuka.
 */
function masihLangsung(r: BarisPeta, sekarang: number, batasMenit: number): boolean {
  if (r.posisi === null) return false;
  // "realtime" = nama sumber dari versi server sebelumnya; keduanya berarti
  // titik datang dari perangkat, bukan dari formulir pengajuan.
  if (r.posisi.sumber === "pengajuan") return false;
  return sekarang - r.posisi.waktu <= Math.max(1, batasMenit) * 60_000;
}

/** Teks pengguna disisipkan ke HTML tooltip Leaflet — harus di-escape. */
function escapeHtml(teks: string): string {
  const peta: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return teks.replace(/[&<>"']/g, (c) => peta[c] ?? c);
}

/** Isi tooltip & popup satu titik — satu sumber supaya keduanya tidak beda. */
function rincianTitik(r: BarisPeta, sekarang: number, batasMenit: number): string {
  if (r.posisi === null) return "";
  const umur = formatUmurLokasi(umurDetikSejak(r.posisi.waktu, sekarang));
  const perangkat = r.perangkat ?? null;
  const akurasi = typeof r.akurasi === "number" ? r.akurasi : null;
  const sumber =
    r.posisi.sumber === "pengajuan"
      ? "titik pengajuan (bukan heartbeat)"
      : perangkat !== null
        ? `aplikasi ${perangkat.platform}${perangkat.aktif ? "" : " (berhenti mengirim)"}`
        : "peramban";
  const baris = [
    `<strong>${escapeHtml(namaHurufBesar(r.namaLengkap))}</strong>`,
    `${escapeHtml(r.nomorReferensi)} · status ledger: ${escapeHtml(r.statusPinjaman)}`,
    `${masihLangsung(r, sekarang, batasMenit) ? "Langsung" : "Tidak aktif"} · ${umur} (${formatWaktuWIB(r.posisi.waktu)} WIB)`,
    `Sumber: ${sumber}${akurasi !== null ? ` · GPS ±${Math.round(akurasi)} m` : ""}`,
  ];
  if (perangkat !== null) {
    baris.push(
      `Heartbeat perangkat terakhir ${formatUmurLokasi(umurDetikSejak(perangkat.terakhirDilihat, sekarang))}`,
    );
  }
  if (r.tanda.length > 0) baris.push("POLA KOORDINAT DICURIGAI (OTOMATIS)");
  if (r.mismatch) baris.push("DI LUAR AMBANG JARAK (OTOMATIS)");
  else if (r.jarakVaultKm !== null) {
    baris.push(`${r.jarakVaultKm.toFixed(1)} km dari titik acuan`);
  }
  return baris.join("<br/>");
}

export function LiveLocationMap() {
  const data = useQuery(api.admin.petaPeminjam);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const acuanRef = useRef<L.LayerGroup | null>(null);
  const acuanKunciRef = useRef<string>("");
  const dataRef = useRef<typeof data>(undefined);
  // Ambang disimpan di ref: efek peta dipasang SEKALI, jadi ia tidak boleh
  // bergantung pada nilai yang baru tiba bersama data (kalau tidak, peta
  // dibongkar-pasang tepat saat data pertama masuk).
  const batasRef = useRef(Math.max(1, DEFAULT_CONFIG.lokasiMaxUmurMenit));
  const filterRef = useRef<FilterStatus>("semua");
  const drawRef = useRef<(() => void) | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const markerRef = useRef<Record<string, L.CircleMarker>>({});
  /** Status terakhir per penanda — kelas denyut hanya bisa dipasang saat dibuat. */
  const langsungRef = useRef<Record<string, boolean>>({});
  const jalurRef = useRef<Record<string, L.Polyline>>({});
  /** Peta hanya dipusatkan SEKALI; sesudahnya admin yang menentukan pandangan. */
  const sudahDipusatkanRef = useRef(false);

  const [filter, setFilter] = useState<FilterStatus>("semua");
  const [targetId, setTargetId] = useState<string | null>(null);
  /** Jam berdetak: umur titik ikut bertambah walau tidak ada data baru. */
  const [sekarang, setSekarang] = useState(() => Date.now());

  const batasUmurMenit =
    data?.batasUmurMenit ?? Math.max(1, DEFAULT_CONFIG.lokasiMaxUmurMenit);

  useEffect(() => {
    const timer = window.setInterval(() => setSekarang(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

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

    const cocokFilter = (r: BarisPeta, f: FilterStatus, sekarangMs: number): boolean => {
      if (f === "semua") return true;
      if (f === "langsung") return masihLangsung(r, sekarangMs, batasRef.current);
      const mencurigakan = r.mismatch || r.tanda.length > 0;
      return f === "aman" ? !mencurigakan : mencurigakan;
    };

    const warnaTitik = (r: BarisPeta, langsung: boolean): string => {
      if (r.tanda.length > 0) return "#b45309";
      if (r.mismatch) return "#a5303a";
      return langsung ? "#17544e" : "#94a3b8";
    };

    const barisTampil = (sekarangMs: number): BarisPeta[] =>
      ((dataRef.current?.rows ?? []) as BarisPeta[]).filter((r) =>
        cocokFilter(r, filterRef.current, sekarangMs),
      );

    /** Titik acuan + cincin ambang: digambar ulang hanya bila nilainya berubah. */
    const gambarAcuan = (map: L.Map, vault: { lat: number; lng: number }, radiusKm: number) => {
      const kunci = `${vault.lat}:${vault.lng}:${radiusKm}`;
      if (acuanRef.current !== null && acuanKunciRef.current === kunci) return;
      acuanKunciRef.current = kunci;
      if (acuanRef.current !== null) acuanRef.current.remove();
      const grup = L.layerGroup().addTo(map);
      L.circleMarker([vault.lat, vault.lng], {
        radius: 10,
        color: "#1f6a62",
        fillColor: "#6fa39b",
        fillOpacity: 0.9,
        weight: 3,
      })
        .bindTooltip("Titik acuan konfigurasi (bukan posisi gudang terverifikasi)", {
          direction: "top",
        })
        .addTo(grup);
      L.circle([vault.lat, vault.lng], {
        radius: radiusKm * 1000,
        color: "#6fa39b",
        fillColor: "#6fa39b",
        fillOpacity: 0.05,
        weight: 1,
        dashArray: "6 6",
      }).addTo(grup);
      acuanRef.current = grup;
    };

    const pusatkan = (sekarangMs: number) => {
      const map = mapRef.current;
      if (map === null) return;
      const vault =
        dataRef.current?.vault ?? { lat: DEFAULT_CONFIG.vaultLat, lng: DEFAULT_CONFIG.vaultLng };
      const titik = barisTampil(sekarangMs)
        .filter((r) => r.posisi !== null && validCoord(r.posisi.lat, r.posisi.lng))
        .map((r) => [r.posisi!.lat, r.posisi!.lng] as L.LatLngTuple);
      if (titik.length === 0) {
        map.setView([vault.lat, vault.lng], 12, { animate: false });
        return;
      }
      const bounds = L.latLngBounds(titik);
      bounds.extend([vault.lat, vault.lng]);
      map.fitBounds(bounds, { animate: false, padding: [30, 30], maxZoom: 15 });
    };

    const draw = () => {
      const map = mapRef.current;
      const layer = layerRef.current;
      if (map === null || layer === null) return;
      const sekarangMs = Date.now();
      // Selagi data server belum tiba, gambar dulu baseline gudang dari
      // konfigurasi default supaya peta tidak pernah tampil kosong.
      const current = dataRef.current;
      const vault = current?.vault ?? { lat: DEFAULT_CONFIG.vaultLat, lng: DEFAULT_CONFIG.vaultLng };
      if (!validCoord(vault.lat, vault.lng)) {
        console.error("Koordinat gudang tidak valid", vault);
        return;
      }
      const radiusKm =
        current !== undefined && Number.isFinite(current.gpsMismatchKm)
          ? Math.max(0, current.gpsMismatchKm)
          : DEFAULT_CONFIG.gpsMismatchKm;
      gambarAcuan(map, vault, radiusKm);

      // Penanda diperbarui DI TEMPAT, bukan dihapus lalu dibuat ulang: peta
      // yang dipantau tidak boleh berkedip, menutup popup, atau melompat ke
      // zoom awal setiap kali satu nasabah mengirim heartbeat.
      const tampil = barisTampil(sekarangMs);
      const idTampil = new Set<string>();
      for (const r of tampil) {
        if (r.posisi === null || !validCoord(r.posisi.lat, r.posisi.lng)) continue;
        idTampil.add(r.userId);
        const langsung = masihLangsung(r, sekarangMs, batasRef.current);
        const warna = warnaTitik(r, langsung);
        const rincian = rincianTitik(r, sekarangMs, batasRef.current);
        const opsi: L.CircleMarkerOptions = {
          radius: langsung ? 7 : 6,
          color: warna,
          fillColor: warna,
          fillOpacity: langsung ? 0.9 : 0.45,
          weight: langsung ? 2 : 1.5,
          dashArray: langsung ? undefined : "3 3",
          className: langsung ? "penanda-lokasi-langsung" : undefined,
        };
        const posisi: L.LatLngTuple = [r.posisi.lat, r.posisi.lng];

        let marker: L.CircleMarker | undefined = markerRef.current[r.userId];
        // `className` hanya dibaca Leaflet saat marker dibuat. Marker dibuat
        // ulang HANYA ketika status langsungnya berubah (jarang), bukan tiap
        // pembaruan titik.
        if (marker !== undefined && langsungRef.current[r.userId] !== langsung) {
          layer.removeLayer(marker);
          delete markerRef.current[r.userId];
          marker = undefined;
        }
        if (marker === undefined) {
          marker = L.circleMarker(posisi, opsi)
            .bindTooltip(rincian, { direction: "top" })
            .bindPopup(rincian, { autoPan: true })
            .addTo(layer);
          markerRef.current[r.userId] = marker;
          langsungRef.current[r.userId] = langsung;
        } else {
          marker.setLatLng(posisi);
          marker.setStyle(opsi);
          marker.setTooltipContent(rincian);
          marker.setPopupContent(rincian);
        }
        if (langsung) marker.bringToFront();

        // Jalur pergerakan dua jam terakhir: membuktikan titiknya bergerak,
        // bukan satu pin yang kebetulan baru diperbarui.
        const titikJalur = (r.jalur ?? [])
          .filter((p) => validCoord(p.lat, p.lng))
          .map((p) => [p.lat, p.lng] as L.LatLngTuple);
        let garis: L.Polyline | undefined = jalurRef.current[r.userId];
        if (titikJalur.length >= 2) {
          if (garis === undefined) {
            garis = L.polyline(titikJalur, {
              color: warna,
              weight: 2,
              opacity: langsung ? 0.55 : 0.25,
              dashArray: langsung ? undefined : "4 6",
              interactive: false,
            }).addTo(layer);
            jalurRef.current[r.userId] = garis;
          } else {
            garis.setLatLngs(titikJalur);
            garis.setStyle({
              color: warna,
              opacity: langsung ? 0.55 : 0.25,
              dashArray: langsung ? undefined : "4 6",
            });
          }
        } else if (garis !== undefined) {
          layer.removeLayer(garis);
          delete jalurRef.current[r.userId];
        }
      }

      for (const id of Object.keys(markerRef.current)) {
        if (idTampil.has(id)) continue;
        layer.removeLayer(markerRef.current[id]);
        delete markerRef.current[id];
        delete langsungRef.current[id];
      }
      for (const id of Object.keys(jalurRef.current)) {
        if (idTampil.has(id)) continue;
        layer.removeLayer(jalurRef.current[id]);
        delete jalurRef.current[id];
      }

      map.invalidateSize({ pan: false });
      if (!sudahDipusatkanRef.current && tampil.length > 0) {
        sudahDipusatkanRef.current = true;
        pusatkan(sekarangMs);
      }
    };
    drawRef.current = draw;
    fitRef.current = () => pusatkan(Date.now());

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
    // Pemicu ukur ulang tepat setelah mount: kontainer baru saja tampil dan
    // Leaflet kadang masih membaca ukuran 0 × 0 px sebelum tata letak stabil.
    const timerUkur = window.setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 200);
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
      window.clearTimeout(timerUkur);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      drawRef.current = null;
      fitRef.current = null;
      const map = mapRef.current;
      mapRef.current = null;
      layerRef.current = null;
      acuanRef.current = null;
      acuanKunciRef.current = "";
      markerRef.current = {};
      langsungRef.current = {};
      jalurRef.current = {};
      sudahDipusatkanRef.current = false;
      map?.remove();
    };
  }, []);

  useEffect(() => {
    dataRef.current = data;
    batasRef.current = Math.max(1, data?.batasUmurMenit ?? DEFAULT_CONFIG.lokasiMaxUmurMenit);
    drawRef.current?.();
  }, [data]);

  // Ganti filter harus ikut mengubah penanda di peta — dulu chip filter hanya
  // menyaring daftar di sisi kanan sementara peta tetap menampilkan semua titik.
  useEffect(() => {
    filterRef.current = filter;
    sudahDipusatkanRef.current = false;
    drawRef.current?.();
  }, [filter]);

  // Setiap 30 detik status "langsung" dihitung ulang dari waktu titik, supaya
  // penanda berubah redup saat perangkat berhenti mengirim walau tidak ada
  // data baru yang masuk.
  useEffect(() => {
    const timer = window.setInterval(() => drawRef.current?.(), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (targetId === null) return;
    const marker = markerRef.current[targetId];
    const map = mapRef.current;
    if (marker === undefined || map === null) return;
    // Terbang ke titik nasabah lalu buka popup detailnya. SENGAJA tidak
    // menggambar ulang setelah terbang: `draw()` memusatkan ulang peta dan
    // membuat popup tertutup.
    const latlng = marker.getLatLng();
    map.flyTo(latlng, 15, { animate: true, duration: 0.6 });
    marker.openPopup();
    const timer = window.setTimeout(() => map.invalidateSize({ pan: false }), 650);
    return () => window.clearTimeout(timer);
  }, [targetId]);

  // TIDAK ada early-return di sini, dan itu bukan kelalaian: kontainer peta
  // WAJIB sudah ada pada render pertama. Efek inisialisasi Leaflet memasang
  // dirinya sekali, dan keluar lebih awal bila `containerRef.current` belum ada
  // — kalau kontainernya baru muncul setelah data tiba, efek itu tidak pernah
  // dijalankan ulang, peta tidak pernah dibuat, dan yang tampil hanyalah kotak
  // abu-abu kosong seterusnya. Selagi menunggu, peta sudah menggambar titik
  // acuan dari konfigurasi default (lihat `draw`), jadi tidak pernah kosong.
  const baris = data?.rows ?? [];
  const jumlahLangsung = baris.filter((r) =>
    masihLangsung(r as BarisPeta, sekarang, batasUmurMenit),
  ).length;

  const cocok = (r: BarisPeta): boolean => {
    if (filter === "semua") return true;
    if (filter === "langsung") return masihLangsung(r, sekarang, batasUmurMenit);
    const mencurigakan = r.mismatch || r.tanda.length > 0;
    return filter === "aman" ? !mencurigakan : mencurigakan;
  };
  const filteredRows = (baris as BarisPeta[]).filter(cocok);

  const stats = {
    semua: baris.length,
    langsung: jumlahLangsung,
    aman: baris.filter((r) => !r.mismatch && r.tanda.length === 0).length,
    diLuar: baris.filter((r) => r.mismatch || r.tanda.length > 0).length,
  };

  return (
    <div className="animate-masuk flex min-h-0 flex-col gap-4 md:flex-row">
      {/* sidebar kiri: peta 70% */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:w-[70%]">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-600">
            <MapPin className="size-4" />
            <span className="font-medium text-navy">Lokasi langsung &amp; geofence</span>
            {data !== undefined && (
              <span className="text-slate-500">
                · {jumlahLangsung} dari {baris.length} mengirim dalam {batasUmurMenit} menit
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip selected={filter === "semua"} onClick={() => setFilter("semua")}>
              Semua ({stats.semua})
            </FilterChip>
            <FilterChip selected={filter === "langsung"} onClick={() => setFilter("langsung")}>
              Langsung ({stats.langsung})
            </FilterChip>
            <FilterChip selected={filter === "aman"} onClick={() => setFilter("aman")}>
              Aman ({stats.aman})
            </FilterChip>
            <FilterChip selected={filter === "diLuar"} onClick={() => setFilter("diLuar")}>
              Di Luar Ambang ({stats.diLuar})
            </FilterChip>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full border-slate-200 px-3 text-[11px] text-slate-600 hover:bg-slate-100"
              onClick={() => fitRef.current?.()}
            >
              <Crosshair className="mr-1 size-3.5" /> Pusatkan
            </Button>
          </div>
        </div>

        <div className="relative h-[580px] w-full overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
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
          <div className="absolute right-3 top-3 z-20 rounded-xl bg-white/90 p-3 text-xs shadow-md backdrop-blur-md">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Legenda penanda
            </p>
            <ul className="mt-1 space-y-1">
              <li className="flex items-center gap-2 text-xs text-slate-700">
                <span className="flex size-2.5 shrink-0 rounded-full border border-emerald-700 bg-emerald-700" />
                Langsung (masih mengirim)
              </li>
              <li className="flex items-center gap-2 text-xs text-slate-700">
                <span className="flex size-2.5 shrink-0 rounded-full border border-slate-400 bg-slate-300" />
                Tidak aktif (titik lama)
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
          Titik mengikuti heartbeat perangkat tiap ±{data?.intervalDetik ?? 60} detik; peramban
          hanya mengirim selama dashboard terbuka. Titik yang lebih tua dari {batasUmurMenit} menit
          ditandai tidak aktif dan tidak dihitung sebagai lokasi langsung. Ambang pola{" "}
          {data?.gpsMismatchKm ?? DEFAULT_CONFIG.gpsMismatchKm} km.
        </p>
      </div>

      {/* sidebar kanan: live feed 30% */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 border-t md:border-t-0 md:border-l border-slate-200 md:w-[30%]">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Users className="size-4 text-primary" />
          <span className="font-semibold text-navy">Umpan lokasi langsung</span>
          {data !== undefined && (
            <span className="text-muted-foreground">
              · {filteredRows.length} tampil · {jumlahLangsung} langsung
            </span>
          )}
        </div>

        <div className="flex max-h-[580px] flex-col gap-3 overflow-y-auto pr-2">
          {data === undefined ? (
            <p className="flex h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Memuat feed lokasi…
            </p>
          ) : filteredRows.length === 0 ? (
            <p className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              Tidak ada nasabah sesuai filter.
            </p>
          ) : (
            filteredRows.map((r) => (
              <KartuFeedLokasi
                key={r.userId}
                r={{
                  ...r,
                  umurDetik: umurDetikSejak(r.posisi?.waktu ?? null, sekarang),
                  langsung: masihLangsung(r, sekarang, batasUmurMenit),
                  perangkat:
                    r.perangkat === null || r.perangkat === undefined
                      ? null
                      : `${r.perangkat.platform} · v${r.perangkat.versiApp}`,
                }}
                onPilih={setTargetId}
              />
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
