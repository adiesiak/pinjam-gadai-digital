import { Loader2, Maximize2, Minus, Plus, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { LapisanTandaAir } from "@/components/WatermarkedDoc";

/**
 * PENAMPIL KTP / JAMINAN BER-ZOOM untuk gerbang persetujuan admin.
 *
 * `WatermarkedDoc` tetap dipakai di daftar ringkas (lihat KYC di modal profil),
 * tetapi peninjau yang harus MEMUTUSKAN perlu bisa memperbesar detail dokumen:
 * angka NIK yang kabur, nama bank di slip, atau kondisi barang jaminan. Karena
 * itu penampil ini menambahkan kontrol zoom (−, +, reset 100%) dengan batas
 * 100–300%, dan area gambar bisa digeser (gulir) saat diperbesar.
 *
 * Tanda air "VERIFIKASI PINDAI" memakai lapisan yang SAMA dengan
 * `WatermarkedDoc` (`LapisanTandaAir`), jadi memperbesar dokumen tidak pernah
 * menghilangkan jejak perlindungan — lapisan itu ikut membesar bersama gambar.
 *
 * Batas zoom sengaja tidak lebih dari 300%: di atas itu dokumen hasil pindai
 * hanya menampilkan derau piksel, bukan informasi baru — dan itu membuat
 * peninjau merasa sudah memeriksa padahal tidak.
 */

const ZOOM_MIN = 1;
const ZOOM_MAKS = 3;
const ZOOM_LANGKAH = 0.5;

/** Tinggi jendela penampil; cukup untuk KTP pindai tanpa mendominasi dialog. */
const TINGGI_PENAMPIL = 208;

export function PenampilDokumen({
  src,
  label,
  petunjuk,
}: {
  src: string;
  /** Nama dokumen, dipakai pada tanda air dan sebagai alt gambar. */
  label: string;
  /** Keterangan singkat di bawah penampil (mis. "Periksa NIK dan foto"). */
  petunjuk?: string;
}) {
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const [dimuat, setDimuat] = useState(false);
  const [gagal, setGagal] = useState(false);

  const bisaMundur = zoom > ZOOM_MIN;
  const bisaMaju = zoom < ZOOM_MAKS;

  return (
    <figure className="min-w-0 space-y-1.5">
      <div
        className="relative overflow-auto overscroll-contain rounded-xl border border-slate-300 bg-slate-900/90"
        style={{ height: TINGGI_PENAMPIL }}
        // Gulir horizontal/vertikal di dalam penampil tidak boleh menggulir
        // dialog di belakangnya saat dokumen sudah diperbesar.
        onWheelCapture={(e) => {
          if (zoom > ZOOM_MIN) e.stopPropagation();
        }}
      >
        {!dimuat && !gagal && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-300">
            <Loader2 className="size-4 animate-spin" />
          </div>
        )}
        {gagal ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center text-slate-300">
            <TriangleAlert className="size-4" aria-hidden="true" />
            <p className="text-xs">Dokumen gagal dimuat. Muat ulang halaman lalu coba lagi.</p>
          </div>
        ) : (
          <div className="flex min-h-full min-w-full items-center justify-center p-2">
            <div
              className="relative transition-transform duration-200 ease-[var(--motion-ease-out)]"
              style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
            >
              <img
                src={src}
                alt={label}
                decoding="async"
                draggable={false}
                onLoad={() => setDimuat(true)}
                onError={() => setGagal(true)}
                // Jangan `hidden`/`loading=lazy` di sini: gambar `display: none`
                // tidak pernah dianggap terlihat oleh lazy-loading, sehingga
                // `onLoad` tak pernah menyala dan spinner berputar selamanya.
                // Transparan tetap mengambil ruang, jadi gambar benar-benar
                // dimuat; tiga lampiran ini kecil dan hanya dibuka admin.
                className={`max-h-48 w-auto object-contain transition-opacity duration-150 ${dimuat ? "opacity-100" : "opacity-0"}`}
              />
              {dimuat && <LapisanTandaAir label={label} />}
            </div>
          </div>
        )}
      </div>

      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-medium text-slate-600">{label}</span>
        <span className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label={`Perkecil ${label}`}
            disabled={!bisaMundur}
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_LANGKAH))}
          >
            <Minus className="size-3.5" />
          </Button>
          <span className="w-10 text-center text-[11px] font-semibold tabular-nums text-slate-600">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label={`Perbesar ${label}`}
            disabled={!bisaMaju}
            onClick={() => setZoom((z) => Math.min(ZOOM_MAKS, z + ZOOM_LANGKAH))}
          >
            <Plus className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Kembalikan zoom ${label} ke 100%`}
            disabled={!bisaMundur}
            onClick={() => setZoom(ZOOM_MIN)}
          >
            <Maximize2 className="size-3.5" />
          </Button>
        </span>
      </figcaption>

      {petunjuk !== undefined && (
        <p className="text-[10px] leading-4 text-muted-foreground">{petunjuk}</p>
      )}
    </figure>
  );
}
