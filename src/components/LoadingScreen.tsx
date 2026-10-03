import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Layar pemuatan bermerek PINDAI — brankas yang terbuka, memancarkan kilatan
 * cahaya, lalu menyemburkan banyak uang dari dalam.
 *
 * Dipakai sebagai fallback saat modul rute sedang diunduh dan saat sesi masuk
 * masih diperiksa, menggantikan teks polos "Memuat…". Satu siklus animasi
 * (3,2 detik, berulang):
 *   brankas tertutup → pintu berayun terbuka → kilatan cahaya dari dalam →
 *   uang menyembur deras keluar dari mulut brankas → pintu menutup lagi.
 * Tidak ada kotak/cincin yang mengurung brankas.
 *
 * Interaktif: menggerakkan kursor di atas brankas memiringkannya (parallax
 * ringan), dan mengetuknya memutar dial satu putaran penuh. Semua gerak
 * dihentikan otomatis lewat `prefers-reduced-motion` di index.css; kemiringan
 * ditulis sebagai CSS variable supaya media query itu juga bisa mematikannya.
 *
 * Tidak ada dependensi tambahan: SVG inline + animasi CSS, jadi layar ini tetap
 * murah dan tidak menambah bundel awal.
 */

type Serpihan = {
  /** Sudut semburan dalam derajat; 0 = lurus ke atas, negatif = ke kiri. */
  arah: number;
  /** Jarak tempuh puncak dalam piksel. */
  jarak: number;
  /** Jeda antar-serpihan (detik) — durasi animasi dikurangi sebesar ini supaya
   *  setiap serpihan tetap sefase dengan siklus pintu. */
  delay: number;
  /** Putaran badan serpihan selama melayang. */
  spin: number;
  jenis: "koin" | "kertas";
};

/** Semburan uang: 18 keping, sudut disebar merata, jarak dan jeda bervariasi. */
const UANG: Serpihan[] = [
  { arah: -76, jarak: 58, delay: 0.34, spin: -320, jenis: "kertas" },
  { arah: -66, jarak: 74, delay: 0.16, spin: 280, jenis: "koin" },
  { arah: -56, jarak: 50, delay: 0.42, spin: -430, jenis: "kertas" },
  { arah: -46, jarak: 78, delay: 0.05, spin: 360, jenis: "koin" },
  { arah: -36, jarak: 62, delay: 0.28, spin: -260, jenis: "kertas" },
  { arah: -26, jarak: 76, delay: 0.12, spin: 480, jenis: "koin" },
  { arah: -17, jarak: 52, delay: 0.38, spin: -300, jenis: "kertas" },
  { arah: -8, jarak: 78, delay: 0.02, spin: 420, jenis: "koin" },
  { arah: 0, jarak: 66, delay: 0.22, spin: -240, jenis: "kertas" },
  { arah: 8, jarak: 77, delay: 0.08, spin: 300, jenis: "koin" },
  { arah: 17, jarak: 54, delay: 0.44, spin: -360, jenis: "kertas" },
  { arah: 26, jarak: 74, delay: 0.14, spin: 260, jenis: "koin" },
  { arah: 36, jarak: 64, delay: 0.3, spin: -420, jenis: "kertas" },
  { arah: 46, jarak: 76, delay: 0.06, spin: 340, jenis: "koin" },
  { arah: 56, jarak: 50, delay: 0.4, spin: -280, jenis: "kertas" },
  { arah: 66, jarak: 72, delay: 0.18, spin: 400, jenis: "koin" },
  { arah: 76, jarak: 58, delay: 0.36, spin: -320, jenis: "kertas" },
  { arah: -20, jarak: 68, delay: 0.24, spin: 220, jenis: "koin" },
];

export function LoadingScreen({ label = "Memuat…" }: { label?: string }) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [buka, setBuka] = useState(false);
  const timerRef = useRef<number | null>(null);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const kotak = event.currentTarget.getBoundingClientRect();
    const nx = (event.clientX - kotak.left) / kotak.width - 0.5;
    const ny = (event.clientY - kotak.top) / kotak.height - 0.5;
    setTilt({ x: nx * 18, y: ny * -18 });
  }, []);

  const onPointerLeave = useCallback(() => setTilt({ x: 0, y: 0 }), []);

  /** Ketuk brankas → dial berputar penuh sekali (efek "membuka brankas"). */
  const putarDial = useCallback(() => {
    setBuka(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setBuka(false), 1000);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <div className="pindai-loader-bg flex min-h-screen w-full flex-col items-center justify-center gap-7 px-6 text-slate-900">
      <div className="pindai-loader flex flex-col items-center gap-7">
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
          aria-label="Brankas PINDAI — ketuk untuk memutar dial"
          className={`pindai-loader__logo relative flex size-40 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 ${
            buka ? "pindai-loader__buka" : ""
          }`}
          style={{ "--tilt-x": `${tilt.x}deg`, "--tilt-y": `${tilt.y}deg` } as React.CSSProperties}
        >
          <span className="pindai-loader__halo" aria-hidden="true" />

          {/* Brankas PINDAI, digambar ulang inline agar layar pemuatan tidak
              bergantung pada modul halaman landing. Urutan lapis penting:
              ruang dalam digambar sebelum pintu supaya tersingkap saat pintu
              berayun terbuka. */}
          <svg
            width="96"
            height="96"
            viewBox="0 0 64 64"
            fill="none"
            aria-hidden="true"
            className="relative z-20"
          >
            {/* Badan brankas */}
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

            {/* Ruang dalam — bercahaya saat pintu terbuka */}
            <rect
              className="pindai-loader__isi"
              x="11"
              y="12"
              width="42"
              height="38"
              rx="7"
              fill="#08201e"
            />

            {/* Engsel tetap di rangka */}
            <rect x="7" y="19" width="5" height="7" rx="2.5" fill="#cbb47e" />
            <rect x="7" y="36" width="5" height="7" rx="2.5" fill="#cbb47e" />

            {/* Pintu: berayun terbuka dari sisi engsel (kiri) */}
            <g className="pindai-loader__pintu">
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
            </g>

            <path d="M20 57h8M36 57h8" stroke="#0b2d2a" strokeWidth="3" strokeLinecap="round" />
          </svg>

          <span className="pindai-loader__scanline" aria-hidden="true" />

          {/* Kilatan cahaya dari dalam brankas — tepat saat pintu terbuka. */}
          <span className="pindai-loader__pendar" aria-hidden="true" />
          <span className="pindai-loader__kilat" aria-hidden="true" />

          {/* Uang yang menyembur dari mulut brankas. Sudut digambar relatif
              pusat pintu: dx ke samping, dy ke atas (negatif), lalu jatuh lagi
              karena gravitasi di ekor keyframe. */}
          {UANG.map((u) => {
            const rad = (u.arah * Math.PI) / 180;
            return (
              <span
                key={`${u.arah}-${u.delay}`}
                aria-hidden="true"
                className={`pindai-loader__money ${
                  u.jenis === "koin" ? "pindai-loader__koin" : "pindai-loader__kertas"
                }`}
                style={
                  {
                    "--dx": `${(Math.sin(rad) * u.jarak).toFixed(1)}px`,
                    "--dy": `${(-Math.cos(rad) * u.jarak).toFixed(1)}px`,
                    "--spin": `${u.spin}deg`,
                    "--delay": `${u.delay}s`,
                  } as React.CSSProperties
                }
              />
            );
          })}
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
