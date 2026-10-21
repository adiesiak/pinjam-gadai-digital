/**
 * Helper format dan konstanta kelas Ruang Pendana.
 *
 * Dipisah dari `bagian-umum.tsx` supaya berkas komponen hanya mengekspor
 * komponen (aturan `react-refresh/only-export-components`), dan supaya angka
 * yang diformat di halaman dan di sel tabel dijamin memakai satu fungsi yang
 * sama.
 */
import { useEffect, useState } from "react";

import { formatRupiahAman } from "@/lib/money";

export function tanggalRingkas(ms: number): string {
  return new Date(ms).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Jalankan perhitungan kuotasi tanpa pernah merobohkan halaman (data warisan). */
export function coba<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

/**
 * Format rupiah defensif: halaman baca-saja tidak boleh gagal total hanya
 * karena satu baris data warisan bernilai bukan rupiah bulat.
 */
export function rupiah(nilai: number): string {
  return formatRupiahAman(nilai);
}

/**
 * Umur titik lokasi dalam bahasa manusia. Selalu relatif terhadap waktu
 * sekarang, sehingga klaim "live" tidak pernah menyesatkan: titik yang berhenti
 * dikirim akan terlihat makin tua sendiri.
 */
export function labelUmur(waktu: number, sekarang: number): string {
  const detik = Math.max(0, Math.round((sekarang - waktu) / 1000));
  if (detik < 90) return "baru saja";
  const menit = Math.round(detik / 60);
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.round(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  return `${Math.round(jam / 24)} hari lalu`;
}

/**
 * Jam berjalan untuk label umur lokasi. Tanpa ini, label "3 menit lalu" akan
 * membeku di layar ketika tidak ada data baru yang masuk (Convex hanya
 * merender ulang saat data berubah).
 */
export function useJamBerjalan(intervalMs = 60_000): number {
  const [sekarang, setSekarang] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setSekarang(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return sekarang;
}

/** Tautan peta eksternal + embed OpenStreetMap untuk satu koordinat. */
export function tautanPeta(lat: number, lng: number): { embed: string; penuh: string } {
  const d = 0.008;
  return {
    embed: `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d}%2C${lat - d}%2C${
      lng + d
    }%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lng}`,
    penuh: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`,
  };
}

/**
 * Kelas bersama chip status: pil lembut bergaris tipis.
 *
 * Dipakai semua badge status di ruang ini supaya "Disalurkan/Lunas" selalu
 * hijau, "Ditinjau/Menunggu" selalu kuning, dan "Ditolak" selalu merah muda —
 * warna yang sama untuk arti yang sama, di tabel maupun di kartu.
 */
export const KELAS_PIL_STATUS =
  "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold";

/** Label status kredit barang beserta kelas pilnya. */
export const LABEL_KREDIT: Record<string, { label: string; kelas: string }> = {
  diajukan: { label: "Menunggu review", kelas: "border-amber-200 bg-amber-50 text-amber-900" },
  sedang_ditinjau: {
    label: "Sedang ditinjau",
    kelas: "border-amber-200 bg-amber-50 text-amber-900",
  },
  disetujui: {
    label: "Disetujui tim PINDAI",
    kelas: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  ditolak: { label: "Tidak disetujui", kelas: "border-rose-200 bg-rose-50 text-rose-800" },
  didanai: {
    label: "Pendanaan tercatat penuh",
    kelas: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  lunas: { label: "Lunas (ledger)", kelas: "border-emerald-200 bg-emerald-50 text-emerald-800" },
};

/**
 * Satu warna untuk satu makna.
 *
 * Sebelumnya semua kartu memakai garis emerald yang sama, sehingga "dana
 * tersalurkan", "masih berjalan", "sudah dibukukan", dan "masih perkiraan"
 * terbaca sebagai empat angka setara padahal maknanya berbeda. Sekarang:
 * dibukukan = hijau tua penuh, perkiraan = pucat bergaris (bukan oranye yang
 * terbaca seperti peringatan), tersalurkan = navy, berjalan = hijau separuh.
 */
export const AKSEN_RINGKASAN = {
  tersalurkan: { garis: "bg-navy" },
  berjalan: { garis: "bg-emerald-700/50" },
  dibukukan: { garis: "bg-emerald-700" },
  perkiraan: {
    garis: "bg-[repeating-linear-gradient(135deg,var(--color-slate-400)_0_3px,transparent_3px_6px)]",
  },
} as const;
