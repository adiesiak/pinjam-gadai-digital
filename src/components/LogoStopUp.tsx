/**
 * STOP-UP! — Logo resmi `ST[O]P-UP!`
 *
 * Aturan branding:
 * - "ST" dan "P"  : merah neon berpendar (`glow-text-red`).
 * - "O"           : ikon bulat STOP / No-Entry, latar TRANSPARAN, dengan
 *                   pendaran neon merah (`animate-stop-glow`).
 * - "-UP!"        : kuning amber neon (`glow-text-yellow`).
 * - Dilarang menambahkan kata/embel-embel "kiosk".
 */

type LogoStopUpProps = {
  /** Tinggi teks logo dalam px (ikon STOP ikut menyesuaikan). */
  size?: number;
  className?: string;
  /** Tampilkan tagline "Stop Sejenak, Top-Up Cepat!". */
  tagline?: boolean;
  /** Tagline ditempel di bawah logo (default) atau hanya dibaca screen reader. */
  taglineClassName?: string;
};

/** Ikon bulat STOP: lingkaran + garis diagonal, isi transparan. */
function IkonStop({ ukuran }: { ukuran: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={ukuran}
      height={ukuran}
      role="img"
      aria-label="O"
      className="animate-stop-glow shrink-0"
      style={{ marginInline: `${Math.round(ukuran * 0.04)}px` }}
    >
      {/* Lingkaran luar */}
      <circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        stroke="#ff2d3d"
        strokeWidth="12"
      />
      {/* Garis melintang diagonal (dari kiri-atas ke kanan-bawah) */}
      <line
        x1="21"
        y1="21"
        x2="79"
        y2="79"
        stroke="#ff2d3d"
        strokeWidth="12"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LogoStopUp({
  size = 40,
  className = "",
  tagline = false,
  taglineClassName = "",
}: LogoStopUpProps) {
  return (
    <span className={`inline-flex flex-col ${className}`}>
      <span
        className="inline-flex items-center font-black leading-none tracking-tight"
        style={{ fontSize: `${size}px` }}
      >
        <span className="glow-text-red">ST</span>
        <IkonStop ukuran={Math.round(size * 0.86)} />
        <span className="glow-text-red">P-</span>
        <span className="glow-text-yellow">UP!</span>
      </span>
      {tagline ? (
        <span
          className={`mt-1.5 text-[0.62em] font-semibold uppercase tracking-[0.24em] text-slate-300/80 ${taglineClassName}`}
          style={{ fontSize: `${Math.max(10, Math.round(size * 0.26))}px` }}
        >
          Stop Sejenak, Top-Up Cepat!
        </span>
      ) : null}
    </span>
  );
}

/** Versi ringkas untuk rel/sidebar admin (ikon + teks). */
export function LogoStopUpRingkas({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center font-black leading-none">
      <span className="glow-text-red" style={{ fontSize: `${size}px` }}>
        ST
      </span>
      <IkonStop ukuran={Math.round(size * 0.8)} />
      <span className="glow-text-red" style={{ fontSize: `${size}px` }}>
        P-
      </span>
      <span
        className="glow-text-yellow"
        style={{ fontSize: `${size}px` }}
      >
        UP!
      </span>
    </span>
  );
}

export default LogoStopUp;
