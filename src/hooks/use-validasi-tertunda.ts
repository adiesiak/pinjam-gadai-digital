import { useEffect, useRef, useState } from "react";

import {
  bolehValidasiAsinkron,
  hasilMasihBerlaku,
  JEDA_VALIDASI_MS,
  type TahapValidasi,
} from "@/lib/formInteraksi";

/**
 * Validasi asinkron yang tertunda (debounce) — dipakai untuk pemeriksaan yang
 * hanya masuk akal setelah pengguna berhenti mengetik, mis. pencarian nasabah
 * tujuan pencatatan atau "apakah NIK ini sudah terdaftar?".
 *
 * Kenapa ada dua lapis:
 *
 * 1. **Nilai tertunda** (`useNilaiTertunda`) menyerap ketikan cepat. Ini pola
 *    yang dipakai bersama Convex: nilai yang diketik disimpan lokal apa adanya,
 *    sedangkan NILAI TERTUNDA yang dioper sebagai argumen query. Tanpa ini,
 *    setiap huruf membuat langganan query baru.
 * 2. **Versi pemeriksaan** (`useValidasiAsinkron`) menutup celah jawaban basi:
 *    bila jawaban pemeriksaan lama datang setelah pengguna menambah digit baru,
 *    jawaban itu DIBUANG (`hasilMasihBerlaku`), bukan ditempelkan ke isian yang
 *    sudah berubah. Hook ini juga mengembalikan `nilaiDiperiksa` supaya
 *    pemanggil hanya menampilkan hasil untuk isian yang BENAR-BENAR diperiksa —
 *    tidak ada "tidak ada yang cocok" yang tertinggal dari teks sebelumnya.
 *
 * Keduanya tidak pernah menggantikan validasi server: pemeriksaan ini hanya
 * memberi tahu lebih awal, dan server tetap memutuskan apa yang boleh disimpan.
 *
 * Catatan penerapan: seluruh perubahan state terjadi di dalam timer, bukan di
 * badan efek (aturan `react-hooks/set-state-in-effect`). Sama seperti hook lain
 * di folder ini, jeda itu justru yang diinginkan: keadaan berubah tepat saat
 * pekerjaannya benar-benar dimulai, bukan saat render.
 */

/** Nilai yang baru berubah setelah pengguna berhenti mengetik selama `jedaMs`. */
export function useNilaiTertunda<T>(nilai: T, jedaMs: number = JEDA_VALIDASI_MS): T {
  const [tertunda, setTertunda] = useState(nilai);

  useEffect(() => {
    const id = setTimeout(() => setTertunda(nilai), jedaMs);
    return () => clearTimeout(id);
  }, [nilai, jedaMs]);

  return tertunda;
}

type KeadaanValidasi<T> = {
  /** Nilai yang sedang/sudah diperiksa. */
  nilai: string;
  tahap: TahapValidasi;
  hasil: T | null;
};

/**
 * Jalankan pemeriksaan asinkron atas satu isian setelah jeda, dan kembalikan
 * tahapnya. `periksa` harus stabil (biasanya `useCallback`) supaya pemeriksaan
 * tidak diulang hanya karena render.
 *
 * Bila isian terlalu pendek untuk mungkin cocok, tahapnya `diam` dan `periksa`
 * tidak dipanggil sama sekali — tidak ada kueri yang dibuang percuma.
 */
export function useValidasiAsinkron<T>({
  nilai,
  minimalKarakter,
  periksa,
  jedaMs = JEDA_VALIDASI_MS,
}: {
  nilai: string;
  minimalKarakter: number;
  periksa: (nilai: string) => Promise<T | null>;
  jedaMs?: number;
}): { tahap: TahapValidasi; hasil: T | null; nilaiDiperiksa: string | null } {
  const [keadaan, setKeadaan] = useState<KeadaanValidasi<T> | null>(null);
  const versiRef = useRef(0);

  useEffect(() => {
    const versi = versiRef.current + 1;
    versiRef.current = versi;
    const id = setTimeout(() => {
      if (!bolehValidasiAsinkron(nilai, minimalKarakter)) {
        setKeadaan({ nilai, tahap: "diam", hasil: null });
        return;
      }
      setKeadaan({ nilai, tahap: "memvalidasi", hasil: null });
      void periksa(nilai)
        .then((res) => {
          // Jawaban dari teks yang sudah berubah dibuang, bukan ditempelkan.
          if (!hasilMasihBerlaku(versi, versiRef.current)) return;
          setKeadaan({ nilai, tahap: "sah", hasil: res });
        })
        .catch(() => {
          if (!hasilMasihBerlaku(versi, versiRef.current)) return;
          setKeadaan({ nilai, tahap: "galat", hasil: null });
        });
    }, jedaMs);
    return () => clearTimeout(id);
  }, [nilai, minimalKarakter, periksa, jedaMs]);

  return {
    tahap: keadaan?.tahap ?? "diam",
    hasil: keadaan?.hasil ?? null,
    nilaiDiperiksa: keadaan?.nilai ?? null,
  };
}
