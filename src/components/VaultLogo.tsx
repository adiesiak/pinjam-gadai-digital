/* Ikon brankas PINDAI — proporsi kokoh dengan detail dial yang tetap terbaca kecil.
   Saat tema "Musim Salju" aktif, dial berputar, rona logo bergeser, dan lapisan
   salju menutupi bagian atas brankas; tema "Karnival" membuatnya memantul
   (kelas `vault-*`, lihat index.css).

   Satu sumber kebenaran untuk lambang brand: dipakai di header landing,
   dashboard nasabah, panel admin, dan halaman penyedia dana. */
export function VaultLogo({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`vault-logo ${className ?? ""}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
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
      <path d="M15 10h34" stroke="#ffffff" strokeOpacity=".18" strokeWidth="2" strokeLinecap="round" />
      <rect x="11" y="12" width="42" height="38" rx="7" fill="#f5f2e9" />
      <rect x="14" y="15" width="36" height="32" rx="5" stroke="#d9d2c1" strokeWidth="1.5" />
      <rect x="7" y="19" width="5" height="7" rx="2.5" fill="#cbb47e" />
      <rect x="7" y="36" width="5" height="7" rx="2.5" fill="#cbb47e" />
      <g className="vault-dial">
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
      <g className="vault-snow" aria-hidden="true">
        <path
          d="M6 16 C 13 9, 21 17, 31 12 C 41 7, 49 16, 58 10 L58 9 C58 7 56 6 54 6 L10 6 C8 6 6 7 6 9 Z"
          fill="#ffffff"
          opacity="0.96"
        />
        <circle cx="17" cy="13" r="2.6" fill="#ffffff" opacity="0.9" />
        <circle cx="45" cy="12" r="3" fill="#ffffff" opacity="0.92" />
      </g>
    </svg>
  );
}
