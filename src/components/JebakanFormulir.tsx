import { KOLOM_JEBAKAN } from "@/lib/gerbangKirim";

/**
 * Kolom jebakan pengisi otomatis (honeypot) untuk formulir pengajuan.
 *
 * Satu-satunya yang mengisi kolom ini adalah robot yang mengisi setiap isian
 * yang ditemukannya. Supaya pengguna sungguhan tidak pernah tersentuh: kolomnya
 * berada di luar layar, dikeluarkan dari urutan Tab, dan disembunyikan dari
 * pembaca layar. Nilainya tetap ikut dikirim ke server, dan `gerbangPengajuan`
 * menolak pengiriman yang mengisinya.
 *
 * Dipakai sebagai komponen, bukan disalin ke tiap formulir, supaya aturan "di
 * luar layar, tidak bisa di-Tab, tidak terbaca pembaca layar" hanya ada di satu
 * tempat dan tidak bisa berbeda diam-diam antar formulir.
 */
export function JebakanFormulir({
  nilai,
  onUbah,
}: {
  nilai: string;
  onUbah: (nilai: string) => void;
}) {
  return (
    <input
      type="text"
      name={KOLOM_JEBAKAN}
      value={nilai}
      onChange={(event) => onUbah(event.target.value)}
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      className="pointer-events-none absolute -left-[9999px] h-0 w-0 opacity-0"
    />
  );
}
