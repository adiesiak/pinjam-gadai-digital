/**
 * Lapisan aurora hangat layar penuh untuk tema "Senja".
 *
 * Dua lapisan gradien (amber + rose) bergeser perlahan murni lewat CSS (lihat
 * `.senja-*` di index.css). Komponen ini tidak merender apa pun yang terlihat
 * kecuali ketika tema `senja` sedang aktif — pemanggil yang menentukan, dan
 * animasinya otomatis berhenti saat `prefers-reduced-motion: reduce`.
 */
export function SenjaGlow() {
  return (
    <div className="senja-layer" aria-hidden="true">
      <span className="senja-glow senja-glow--1" />
      <span className="senja-glow senja-glow--2" />
    </div>
  );
}
