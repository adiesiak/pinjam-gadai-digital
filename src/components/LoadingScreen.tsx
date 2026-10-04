import { useCallback, useEffect, useRef, useState } from "react";

const BRANKAS = [
  "       ___________________",
  "      /__________________/|",
  "     |  .-------------.  ||",
  "     |==|             |  ||",
  "     |  |             |  ||",
  "     |  |             |  ||",
  "     |  |             |  ||",
  "     |==|             |  ||",
  "     |  '-------------'  ||",
  "     |___________________|/",
  "        |_|       |_|",
].join("\n");

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
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Ruang digital PINDAI
        </p>
        <div className="pindai-loader__scene">
          <button
            type="button"
            onClick={putarDial}
            aria-label="Brankas PINDAI tertutup — ketuk untuk memutar jarum dial"
            className={`pindai-loader__ascii relative block rounded-2xl p-4 font-mono text-sm text-primary sm:text-base outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 ${putar ? "pindai-loader__buka" : ""}`}
          >
            <span className="pindai-loader__halo" aria-hidden="true" />
            <pre aria-hidden="true" className="relative m-0 whitespace-pre text-left font-mono text-sm leading-5 sm:text-base sm:leading-6">
              {BRANKAS}
            </pre>
            <span className="pindai-loader__ascii-dial" aria-hidden="true">
              <span className="pindai-loader__needle" />
              <span className="pindai-loader__hub" />
            </span>
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
        <p role="status" aria-live="polite" className="text-center text-xs font-medium text-slate-500">
          {label}
        </p>
      </div>
    </div>
  );
}
