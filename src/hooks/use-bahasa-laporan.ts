/**
 * Bahasa laporan PDF pendana, tersimpan di perangkat.
 *
 * Hanya memengaruhi dokumen yang diunduh dari ruang pendana — bukan bahasa
 * antarmuka. Pemilik portofolio yang meneruskan laporannya ke pembaca Inggris
 * memilih sekali, lalu setiap unduhan memakai pilihan yang sama.
 */
import { useCallback, useState } from "react";

import type { BahasaLaporan } from "@/lib/laporanPendana";

const KUNCI = "pindai.bahasa-laporan";

function baca(): BahasaLaporan {
  if (typeof window === "undefined") return "id";
  try {
    return window.localStorage.getItem(KUNCI) === "en" ? "en" : "id";
  } catch {
    return "id";
  }
}

export function useBahasaLaporan(): [BahasaLaporan, (bhs: BahasaLaporan) => void] {
  const [bahasa, setBahasa] = useState<BahasaLaporan>(baca);

  const ubah = useCallback((bhs: BahasaLaporan) => {
    setBahasa(bhs);
    try {
      window.localStorage.setItem(KUNCI, bhs);
    } catch {
      // Mode privat bisa menolak penyimpanan; pilihan tetap berlaku di sesi ini.
    }
  }, []);

  return [bahasa, ubah];
}
