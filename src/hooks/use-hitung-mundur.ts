import { useEffect, useState } from "react";

/**
 * Hitung mundur berbasis WAKTU ABSOLUT, bukan penghitung lokal.
 *
 * Timer token admin boleh saja tampak "beku" saat tab tidur atau perangkat
 * di-lock; karena itu yang disimpan adalah waktu mulai (epoch ms) dan sisanya
 * dihitung ulang setiap detik terhadap jam perangkat. Efeknya: setelah tab
 * aktif kembali, angka yang tampil langsung benar — bukan hasil akumulasi
 * interval yang meleset.
 *
 * Mengembalikan `null` bila belum ada token yang dikirim (`mulaiPada === null`)
 * sehingga pemanggil tidak perlu tahu soal timer sama sekali.
 */
export function useHitungMundur(
  mulaiPada: number | null,
  detikTotal: number,
): number | null {
  const [sekarang, setSekarang] = useState(() => Date.now());

  useEffect(() => {
    if (mulaiPada === null) return;
    const batas = mulaiPada + detikTotal * 1000;
    // Langsung sinkronkan sekali: perangkat bisa baru dibangunkan dari tidur.
    setSekarang(Date.now());
    if (Date.now() >= batas) return;
    const id = setInterval(() => {
      if (Date.now() >= batas) {
        setSekarang(batas);
        clearInterval(id);
        return;
      }
      setSekarang(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [mulaiPada, detikTotal]);

  if (mulaiPada === null) return null;
  const sisaMs = mulaiPada + detikTotal * 1000 - sekarang;
  return Math.max(0, Math.ceil(sisaMs / 1000));
}
