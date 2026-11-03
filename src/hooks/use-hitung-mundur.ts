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
    // Sinkronkan sekali lewat timeout 0: perangkat bisa baru dibangunkan dari
    // tidur sehingga angka lama belum tentu benar, tetapi memperbarui state
    // langsung di badan efek memicu render berantai.
    const sinkron = window.setTimeout(() => setSekarang(Date.now()), 0);
    const id = window.setInterval(() => {
      if (Date.now() >= batas) {
        setSekarang(batas);
        window.clearInterval(id);
        return;
      }
      setSekarang(Date.now());
    }, 1000);
    return () => {
      window.clearTimeout(sinkron);
      window.clearInterval(id);
    };
  }, [mulaiPada, detikTotal]);

  if (mulaiPada === null) return null;
  const sisaMs = mulaiPada + detikTotal * 1000 - sekarang;
  return Math.max(0, Math.ceil(sisaMs / 1000));
}
