/** Rute panel operasional; sengaja tidak ditautkan dari halaman publik. */
export const ADMIN_ROUTE = "/7c91f4d2e6a84b23b0f9d61a3e5c7a82";

/** Rute QC konsistensi — halaman uji mandiri untuk Super Admin. */
export const QC_ROUTE = "/qc";

/**
 * Pintu admin alternatif di landing: **Ctrl+Alt+A**.
 *
 * Dipakai sebagai pengganti 5× klik logo di layar berpapan tombol. Kombinasi
 * ini sengaja menghindari pintasan bawaan: `Ctrl+Shift+A` dipakai Chrome
 * (cari tab), sedangkan `Alt+Shift` adalah pintasan Windows untuk berganti
 * tata letak papan tombol. Yang dibaca `code` — bukan `key` — supaya
 * kombinasinya tetap sama pada tata letak non-QWERTY. Ini hanya pintu menuju
 * halaman masuk admin; gerbang sebenarnya tetap kata sandi + TOTP.
 */
export function kombinasiAdmin(tekanan: {
  ctrlKey: boolean;
  altKey: boolean;
  code: string;
}): boolean {
  return tekanan.ctrlKey && tekanan.altKey && tekanan.code === "KeyA";
}
