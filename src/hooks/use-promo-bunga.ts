import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { pilihPromoBunga, type PromoBungaRingkas } from "@/lib/promoBunga";

/**
 * Promo bunga yang sedang berlaku, dibaca dari server.
 *
 * Server sudah menyaring nonaktif dan tanggal, jadi hook ini hanya menyediakan
 * daftar siap pakai untuk layar. `undefined` (query belum termuat) diperlakukan
 * sebagai daftar kosong: layar menampilkan tarif normal lebih dulu, lalu promo
 * muncul saat datanya tiba — bukan menahan seluruh halaman.
 */
export function usePromoBungaAktif(): PromoBungaRingkas[] {
  const data = useQuery(api.promoBunga.berjalan, {});
  return data ?? [];
}

/** Promo terbaik untuk satu tenor sekarang, atau null bila tidak ada. */
export function usePromoBungaTenor(tenor: number): PromoBungaRingkas | null {
  const daftar = usePromoBungaAktif();
  return pilihPromoBunga(daftar, { tenor, sekarang: Date.now() });
}
