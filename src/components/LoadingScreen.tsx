import { useCallback, useEffect, useRef, useState } from "react";

/** Five-second visual cycle only: data/auth readiness still controls unmount. */
export function LoadingScreen({ label = "Memuat…" }: { label?: string }) {
  const [putar, setPutar] = useState(false);
  const timerRef = useRef<number | null>(null);
  const putarDial = useCallback(() => {
    setPutar(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setPutar(false), 1000);
  }, []);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  return (
    <div className="pindai-loader-bg flex min-h-screen w-full flex-col items-center justify-center gap-8 px-6 text-slate-900">
      <div className="pindai-loader flex flex-col items-center gap-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Ruang digital PINDAI
        </p>
        <div className="pindai-loader__scene">
          <button
            type="button"
            onClick={putarDial}
            aria-label="Brankas PINDAI tertutup — ketuk untuk memutar jarum dial"
            className={`relative block rounded-2xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 ${putar ? "pindai-loader__buka" : ""}`}
          >
            <span className="pindai-loader__halo" aria-hidden="true" />
            <svg
              viewBox="0 0 240 240"
              width="240"
              height="240"
              aria-hidden="true"
              focusable="false"
              className="pindai-loader__safe relative h-auto w-48 sm:w-56"
            >
              <ellipse cx="120" cy="222" rx="82" ry="9" fill="#0f3d3a" opacity="0.08" />
              <rect x="56" y="194" width="22" height="20" rx="5" fill="#092e2c" />
              <rect x="154" y="194" width="22" height="20" rx="5" fill="#092e2c" />
              <path d="M48 36 62 24H196L182 36Z" fill="#37645e" />
              <path d="M182 36 196 24Q208 24 208 38V178Q208 188 196 198L182 208Z" fill="#092e2c" />
              <rect x="32" y="36" width="164" height="172" rx="20" fill="#0f3d3a" />
              <rect x="40" y="44" width="148" height="156" rx="15" fill="#20534d" />
              <rect x="50" y="54" width="128" height="136" rx="12" fill="#e8dfcc" />
              <rect x="54" y="58" width="120" height="128" rx="10" fill="#f5f2e9" />
              <path d="M66 64H160" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
              <rect x="42" y="77" width="15" height="25" rx="5" fill="#b99b62" />
              <rect x="42" y="144" width="15" height="25" rx="5" fill="#b99b62" />
              <rect x="152" y="108" width="8" height="29" rx="4" fill="#b99b62" />
              <circle cx="114" cy="120" r="31" fill="#ded3bc" />
              <circle cx="114" cy="120" r="27" fill="#0f3d3a" />
              <circle cx="114" cy="120" r="23" fill="none" stroke="#b99b62" strokeWidth="2" />
              <path d="M114 99V103M135 120H131M114 141V137M93 120H97" stroke="#b99b62" strokeWidth="2" strokeLinecap="round" />
              <g className="pindai-loader__needle">
                <path d="M114 120V106" stroke="#f5f2e9" strokeWidth="3" strokeLinecap="round" />
              </g>
              <circle cx="114" cy="120" r="5" fill="#b99b62" />
              <rect x="93" y="163" width="42" height="7" rx="3.5" fill="#ded3bc" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="flex items-baseline gap-1.5">
            <span className="text-lg font-black uppercase tracking-[0.34em] text-primary">PINDAI</span>
            <span className="size-1.5 rounded-full bg-[#b99b62]" aria-hidden="true" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Pinjam · Gadai Digital
          </span>
        </div>
      </div>
      <div className="flex w-52 flex-col items-center gap-3">
        <div aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-slate-200">
          <span className="pindai-loader__bar block h-full w-1/3 rounded-full bg-primary" />
        </div>
        <p role="status" aria-live="polite" className="text-center text-sm font-medium text-slate-600">
          {label}
        </p>
      </div>
    </div>
  );
}
