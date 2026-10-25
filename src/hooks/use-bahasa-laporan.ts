/**
 * Bahasa laporan PDF pendana.
 *
 * Sumber utama adalah profil akun, sehingga pilihan yang dibuat sekali dipakai
 * laporan WhatsApp yang disusun server dan tetap berlaku di perangkat lain.
 * Penyimpanan perangkat hanya cadangan sebelum query selesai — bukan sumber
 * kedua yang bisa berbeda diam-diam.
 */
import { useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";

import { api } from "@/convex/_generated/api";
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

function simpanLokal(bhs: BahasaLaporan): void {
  try {
    window.localStorage.setItem(KUNCI, bhs);
  } catch {
    // Mode privat bisa menolak penyimpanan; profil akun tetap menyimpan pilihan.
  }
}

export function useBahasaLaporan(): [BahasaLaporan, (bhs: BahasaLaporan) => void] {
  const tersimpan = useQuery(api.bahasaPendana.preferensi);
  const simpanProfil = useMutation(api.bahasaPendana.simpan);
  const [lokal, setLokal] = useState<BahasaLaporan>(baca);

  const bahasa: BahasaLaporan = tersimpan ?? lokal;

  const ubah = useCallback(
    (bhs: BahasaLaporan) => {
      setLokal(bhs);
      simpanLokal(bhs);
      void simpanProfil({ bahasa: bhs }).catch(() => {
        // Tanpa sesi, pilihan tetap berlaku di perangkat ini.
      });
    },
    [simpanProfil],
  );

  return [bahasa, ubah];
}
