/**
 * Lapisan salju layar penuh untuk tema "Musim Salju".
 *
 * Tiga kedalaman salju (kecil/lambat → besar/cepat) dijalankan murni lewat CSS
 * (lihat `.salju-*` di index.css). Komponen ini tidak merender apa pun yang
 * terlihat kecuali ketika tema `salju` sedang aktif — pemanggil yang menentukan,
 * dan animasinya otomatis berhenti saat `prefers-reduced-motion: reduce`.
 */
export function Snowfall() {
  return (
    <div className="salju-layer" aria-hidden="true">
      <span className="salju-flake salju-flake--1" />
      <span className="salju-flake salju-flake--2" />
      <span className="salju-flake salju-flake--3" />
    </div>
  );
}
