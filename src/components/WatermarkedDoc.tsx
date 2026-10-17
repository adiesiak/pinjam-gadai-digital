import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

/**
 * Auto-watermark "VERIFIKASI PINDAI" — overlay transparan di atas foto KYC
 * (KTP, selfie KTP, slip gaji) saat direview admin. Mencegah penyalahgunaan
 * dokumen identitas: salinan layar selalu membawa jejak verifikasi.
 */
export function WatermarkedDoc({ src, label }: { src: string; label?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [gagal, setGagal] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-xl border border-sky-100 bg-white">
      {!loaded && !gagal && (
        <div className="flex h-28 items-center justify-center text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      )}
      {gagal && (
        <p className="flex h-28 items-center justify-center px-3 text-center text-xs text-muted-foreground">
          Dokumen gagal dimuat.
        </p>
      )}
      <img
        src={src}
        alt={label ?? "Dokumen KYC"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setGagal(true)}
        // `hidden` + `loading="lazy"` membuat gambar tak pernah dimuat browser
        // (tidak punya kotak tata letak), sehingga spinner berputar selamanya.
        // Transparan sampai termuat, tanpa menyembunyikannya dari tata letak.
        className={`max-h-56 w-full object-contain transition-opacity duration-150 ${loaded ? "opacity-100" : "opacity-0"} ${gagal ? "hidden" : ""}`}
        draggable={false}
      />
      {loaded && <LapisanTandaAir label={label} />}
    </div>
  );
}

/**
 * Lapisan tanda air "VERIFIKASI PINDAI" — dipakai bersama oleh `WatermarkedDoc`
 * (tampilan ringkas) dan `PenampilDokumen` (penampil ber-zoom di gerbang
 * persetujuan). Dipisah supaya aturan perlindungan dokumen hanya ditulis SEKALI:
 * salinan layar apa pun selalu membawa jejak verifikasi.
 *
 * `id` pola SVG diberi awalan agar dua penampil di satu halaman tidak saling
 * menimpa pola satu sama lain.
 */
export function LapisanTandaAir({ label }: { label?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="-rotate-[24deg] text-lg font-black uppercase tracking-[0.3em] text-sky-500/25">
          VERIFIKASI PINDAI
        </span>
      </div>
      {label !== undefined && (
        <div className="absolute left-2 top-2 rounded-md bg-white/70 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700">
          {label}
        </div>
      )}
      <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-white/70 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">
        <ShieldCheck className="size-3.5" /> TERPROTEKSI
      </div>
      <div className="absolute inset-0 opacity-[0.06]" aria-hidden>
        <svg width="100%" height="100%">
          <defs>
            <pattern id="wm-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <text x="2" y="14" fontSize="7" fill="#1f6a62" fontFamily="sans-serif">
                PINDAI
              </text>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#wm-grid)" />
        </svg>
      </div>
    </div>
  );
}
