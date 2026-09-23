/**
 * STOP-UP! — Virtual Keyboard QWERTY untuk layar sentuh.
 *
 * Dipakai pada tipe pengiriman INJECT_EMAIL (input email pembeli) dan input
 * teks lain yang tidak muat di numpad. Tombol minimal 56px, umpan balik tekan
 * `active:scale-95`.
 *
 * Catatan: keyboard FISIK tetap berfungsi (pengguna bisa mengetik langsung pada
 * input), jadi komponen ini melengkapi — bukan menggantikan — input biasa.
 */

type VirtualKeyboardProps = {
  onKey: (karakter: string) => void;
  onBackspace: () => void;
  onClear?: () => void;
  onEnter?: () => void;
  /** Nonaktifkan tombol enter (mis. saat validasi belum lolos). */
  enterDisabled?: boolean;
  labelEnter?: string;
  className?: string;
};

const BARIS_1 = ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"];
const BARIS_2 = ["a", "s", "d", "f", "g", "h", "j", "k", "l"];
const BARIS_3 = ["z", "x", "c", "v", "b", "n", "m"];

/** Simbol yang paling sering dipakai di email Indonesia. */
const SIMBOL = ["@", ".", "_", "-", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

function Tombol({
  children,
  onPress,
  className = "",
  label,
}: {
  children: React.ReactNode;
  onPress: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
      className={`touch-key flex h-14 min-w-12 items-center justify-center rounded-xl border border-slate-500/25 bg-slate-800/80 px-3 text-lg font-semibold text-slate-100 shadow-[inset_0_-3px_0_rgba(0,0,0,0.35)] hover:border-sky-400/60 hover:bg-slate-700/80 ${className}`}
    >
      {children}
    </button>
  );
}

export function VirtualKeyboard({
  onKey,
  onBackspace,
  onClear,
  onEnter,
  enterDisabled = false,
  labelEnter = "Lanjut",
  className = "",
}: VirtualKeyboardProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex justify-center gap-1.5">
        {BARIS_1.map((k) => (
          <Tombol key={k} onPress={() => onKey(k)} label={k}>
            {k}
          </Tombol>
        ))}
      </div>
      <div className="flex justify-center gap-1.5 px-4">
        {BARIS_2.map((k) => (
          <Tombol key={k} onPress={() => onKey(k)} label={k}>
            {k}
          </Tombol>
        ))}
      </div>
      <div className="flex justify-center gap-1.5">
        {BARIS_3.map((k) => (
          <Tombol key={k} onPress={() => onKey(k)} label={k}>
            {k}
          </Tombol>
        ))}
        <Tombol
          onPress={onBackspace}
          className="w-20 !bg-rose-500/20 !text-rose-200 hover:!border-rose-400/70"
          label="Hapus satu karakter"
        >
          ⌫
        </Tombol>
      </div>
      <div className="flex justify-center gap-1.5">
        {SIMBOL.map((s) => (
          <Tombol key={s} onPress={() => onKey(s)} label={s} className="!min-w-10 !px-2">
            {s}
          </Tombol>
        ))}
      </div>
      <div className="flex justify-center gap-2 pt-1">
        <Tombol
          onPress={() => onKey(" ")}
          className="w-56"
          label="Spasi"
        >
          spasi
        </Tombol>
        <Tombol
          onPress={() => onKey("@gmail.com")}
          className="w-40 !text-sm"
          label="Domain cepat gmail"
        >
          @gmail.com
        </Tombol>
        {onClear ? (
          <Tombol
            onPress={onClear}
            className="w-24 !bg-amber-400/20 !text-amber-100 hover:!border-amber-300/70"
            label="Bersihkan"
          >
            Hapus
          </Tombol>
        ) : null}
        {onEnter ? (
          <Tombol
            onPress={() => {
              if (!enterDisabled) onEnter();
            }}
            className={`w-40 !text-base ${
              enterDisabled
                ? "opacity-40 !bg-slate-700/60 !text-slate-400"
                : "!bg-sky-500/90 !text-slate-950 hover:!border-sky-300"
            }`}
            label={labelEnter}
          >
            {labelEnter} ▶
          </Tombol>
        ) : null}
      </div>
    </div>
  );
}

export default VirtualKeyboard;
