import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Layar pemuatan bermerek PINDAI — logo brankas yang tenang dan interaktif.
 *
 * Dipakai sebagai fallback saat modul rute sedang diunduh dan saat sesi masuk
 * masih diperiksa, menggantikan teks polos "Memuat…". Brankas digambar dalam
 * keadaan tertutup dan tidak terbuka: yang bergerak hanya jarum dial, lingkaran
 * cahaya di belakangnya, garis pindai yang menyapu logo, dan bilah proses.
 *
 * Interaktif: menggerakkan kursor di atas brankas memiringkannya (parallax
 * ringan), dan mengetuknya memutar dial satu putaran penuh. Semua gerak
 * dihentikan otomatis lewat `prefers-reduced-motion` di index.css; kemiringan
 * ditulis sebagai CSS variable supaya media query itu juga bisa mematikannya.
 *
 * Tidak ada dependensi tambahan: SVG inline + animasi CSS, jadi layar ini tetap
 * murah dan tidak menambah bundel awal.
 */
export function LoadingScreen({ label = "Memuat…" }: { label?: string }) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [putar, setPutar] = useState(false);
  const timerRef = useRef<number | null>(null);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const kotak = event.currentTarget.getBoundingClientRect();
    const nx = (event.clientX - kotak.left) / kotak.width - 0.5;
    const ny = (event.clientY - kotak.top) / kotak.height - 0.5;
    setTilt({ x: nx * 18, y: ny * -18 });
  }, []);

  const onPointerLeave = useCallback(() => setTilt({ x: 0, y: 0 }), []);

  /** Ketuk logo → jarum dial berputar penuh sekali. */
  const putarDial = useCallback(() => {
    setPutar(true);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => setPutar(false), 1000);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  return (
    <div className="pindai-loader-bg flex min-h-screen w-full flex-col items-center justify-center gap-6 px-6 text-slate-900">
      <div className="pindai-loader flex flex-col items-center gap-6">
        <div
          role="button"
          tabIndex={0}
          onClick={putarDial}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              putarDial();
            }
          }}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          aria-label="Logo PINDAI — ketuk untuk memutar dial brankas"
          className={`pindai-loader__logo relative flex size-40 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 ${
            putar ? "pindai-loader__buka" : ""
          }`}
          style={
            {
              "--tilt-x": `${tilt.x}deg`,
              "--tilt-y": `${tilt.y}deg`,
            } as React.CSSProperties
          }
        >
          <span className="pindai-loader__halo" aria-hidden="true" />

          {/* Logo brankas PINDAI, digambar ulang inline agar layar pemuatan tidak
              bergantung pada modul halaman landing. Brankas selalu tertutup —
              tidak ada pintu yang berayun dan tidak ada uang yang keluar. */}
          <svg
            width="96"
            height="96"
            viewBox="0 0 64 64"
            fill="none"
            aria-hidden="true"
            className="relative"
          >
            <rect
              x="5"
              y="6"
              width="54"
              height="50"
              rx="12"
              fill="#0f3d3a"
              stroke="#b99b62"
              strokeWidth="2"
            />
            <path
              d="M15 10h34"
              stroke="#ffffff"
              strokeOpacity=".18"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <rect x="11" y="12" width="42" height="38" rx="7" fill="#f5f2e9" />
            <rect
              x="14"
              y="15"
              width="36"
              height="32"
              rx="5"
              stroke="#d9d2c1"
              strokeWidth="1.5"
            />
            <rect x="7" y="19" width="5" height="7" rx="2.5" fill="#cbb47e" />
            <rect x="7" y="36" width="5" height="7" rx="2.5" fill="#cbb47e" />
            <g className="pindai-loader__dial">
              <circle cx="31" cy="31" r="10" fill="#0f3d3a" />
              <circle cx="31" cy="31" r="7.2" stroke="#cbb47e" strokeWidth="1.5" />
              <path
                d="M31 31l7-5M31 24v2M38 31h-2M31 38v-2M24 31h2"
                stroke="#f5f2e9"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
              <circle cx="31" cy="31" r="2.2" fill="#cbb47e" />
            </g>
            <path d="M20 57h8M36 57h8" stroke="#0b2d2a" strokeWidth="3" strokeLinecap="round" />
          </svg>

          <span className="pindai-loader__scanline" aria-hidden="true" />
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <span className="flex items-baseline gap-1.5">
            <span className="text-lg font-black uppercase tracking-[0.34em] text-primary">
              PINDAI
            </span>
            <span className="size-1.5 rounded-full bg-[#b99b62]" aria-hidden="true" />
          </span>
          <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            <span className="h-px w-4 shrink-0 bg-[#b99b62]" aria-hidden="true" />
            Pinjam · Gadai Digital
            <span className="h-px w-4 shrink-0 bg-[#b99b62]" aria-hidden="true" />
          </span>
        </div>
      </div>

      <div className="flex w-52 flex-col items-center gap-2">
        <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200">
          <span className="pindai-loader__bar block h-full w-1/3 rounded-full bg-primary" />
        </div>
        <p role="status" aria-live="polite" className="text-xs font-medium text-slate-500">
          {label}
        </p>
      </div>
    </div>
  );
}
