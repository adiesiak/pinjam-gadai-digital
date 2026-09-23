/**
 * STOP-UP! — Numpad virtual layar sentuh.
 * Setiap tombol minimal 64x64 px (fat-finger proof) dengan umpan balik tekan.
 */

type NumpadProps = {
  onAngka: (digit: string) => void;
  onHapus: () => void;
  onBersihkan?: () => void;
  /** Nonaktifkan seluruh tombol (mis. saat memproses). */
  nonaktif?: boolean;
  className?: string;
};

const TOMBOL = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function Numpad({
  onAngka,
  onHapus,
  onBersihkan,
  nonaktif = false,
  className = "",
}: NumpadProps) {
  return (
    <div className={`grid select-none grid-cols-3 gap-3 ${className}`}>
      {TOMBOL.map((t) => (
        <button
          key={t}
          type="button"
          disabled={nonaktif}
          onPointerDown={(e) => {
            e.preventDefault();
            onAngka(t);
          }}
          className="touch-key kiosk-surface-hover flex h-[72px] items-center justify-center rounded-2xl text-3xl font-bold text-slate-50 shadow-lg disabled:opacity-40"
        >
          {t}
        </button>
      ))}
      {onBersihkan ? (
        <button
          type="button"
          disabled={nonaktif}
          onPointerDown={(e) => {
            e.preventDefault();
            onBersihkan();
          }}
          className="touch-key flex h-[72px] items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/15 text-base font-bold text-amber-200 disabled:opacity-40"
        >
          HAPUS
        </button>
      ) : (
        <span className="h-[72px]" />
      )}
      <button
        type="button"
        disabled={nonaktif}
        onPointerDown={(e) => {
          e.preventDefault();
          onAngka("0");
        }}
        className="touch-key kiosk-surface-hover flex h-[72px] items-center justify-center rounded-2xl text-3xl font-bold text-slate-50 shadow-lg disabled:opacity-40"
      >
        0
      </button>
      <button
        type="button"
        disabled={nonaktif}
        aria-label="Hapus satu digit"
        onPointerDown={(e) => {
          e.preventDefault();
          onHapus();
        }}
        className="touch-key flex h-[72px] items-center justify-center rounded-2xl border border-rose-400/30 bg-rose-500/15 text-2xl font-bold text-rose-200 disabled:opacity-40"
      >
        ⌫
      </button>
    </div>
  );
}

export default Numpad;
