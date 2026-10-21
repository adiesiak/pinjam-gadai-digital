/**
 * Teks tarif potongan di muka untuk halaman publik.
 *
 * Beranda, `/biaya`, syarat & ketentuan, dan poster promo menampilkan biaya
 * yang sama. Supaya tidak ada persentase yang disalin ke JSX lalu tertinggal
 * saat admin mengubah Pengaturan Parameter Bisnis, ketiganya memakai helper ini
 * di atas tarif dari `system.getKetentuanBiaya`; tarif bawaan hanya menjadi
 * cadangan selama query belum termuat.
 */
import { formatRupiah } from "./money";
import { tarifBiayaAman, type TarifBiaya } from "./loan";

/** Persen gaya Indonesia: `2%`, `0,5%`. */
export function persenTeks(nilai: number): string {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(nilai)}%`;
}

/** Ada biaya ekspres yang benar-benar dipungut (semua tier nol berarti mati). */
export function adaBiayaEkspres(tarif?: Partial<TarifBiaya> | null): boolean {
  const { tier1, tier2, tier3 } = tarifBiayaAman(tarif).ekspres;
  return Math.max(tier1, tier2, tier3) > 0;
}

/** Nominal ekspres sekali pencairan: rentang bila tier berbeda, satu angka bila sama. */
export function rentangEkspres(tarif?: Partial<TarifBiaya> | null): string {
  const { tier1, tier2, tier3 } = tarifBiayaAman(tarif).ekspres;
  const nominal = [tier1, tier2, tier3];
  const terkecil = Math.min(...nominal);
  const terbesar = Math.max(...nominal);
  return terkecil === terbesar
    ? formatRupiah(terkecil)
    : `${formatRupiah(terkecil)}–${formatRupiah(terbesar)}`;
}

/**
 * Rincian potongan di muka dalam satu frasa, mis.
 * `admin 2% + asuransi 0,5% + ekspres Rp 5.000–Rp 10.000 bila dipilih`.
 * Komponen yang tidak dipungut tidak ikut disebut.
 */
export function rincianPotonganDiMuka(
  tarif?: Partial<TarifBiaya> | null,
): string {
  const t = tarifBiayaAman(tarif);
  const bagian = [`admin ${persenTeks(t.adminPersen)}`];
  if (t.asuransiPersen > 0) {
    bagian.push(`asuransi ${persenTeks(t.asuransiPersen)}`);
  }
  if (adaBiayaEkspres(t)) {
    bagian.push(`ekspres ${rentangEkspres(t)} bila dipilih`);
  }
  return bagian.join(" + ");
}
