import { useCallback, useSyncExternalStore } from "react";

/**
 * Satu kueri media sebagai boolean React.
 *
 * Dipakai untuk dua hal yang TIDAK bisa diselesaikan CSS saja, karena keduanya
 * mengubah jumlah elemen yang dirender (bukan sekadar gayanya):
 * - sidebar panel admin otomatis mengecil di layar sempit, lalu tetap bisa
 *   dibuka-tutup manual oleh petugas;
 * - daftar antrean KYC berubah menjadi laci di layar sempit, sedangkan di layar
 *   lebar ia berdiri sebagai kolom.
 *
 * Nilai awalnya `false` saat belum ada DOM (render statis/uji) supaya markup
 * pertama tidak bergantung pada `window`. Setelah terpasang, `matchMedia`
 * memberi nilai sebenarnya dan setiap perubahan lebar layar memicu render ulang.
 */
export function useMediaQuery(kueri: string): boolean {
  const berlangganan = useCallback(
    (lapor: () => void) => {
      const mql = window.matchMedia(kueri);
      mql.addEventListener("change", lapor);
      return () => mql.removeEventListener("change", lapor);
    },
    [kueri],
  );

  const nilai = useCallback(() => window.matchMedia(kueri).matches, [kueri]);
  const nilaiStatis = useCallback(() => false, []);

  return useSyncExternalStore(berlangganan, nilai, nilaiStatis);
}
