/**
 * Membaca preferensi gerak perangkat tanpa membawa `framer-motion` ke bundle
 * awal landing. Nilai awal dibaca sinkron di klien supaya kartu hero tidak
 * sempat beranimasi satu frame sebelum pengaturan reduced-motion terbaca.
 */
import { useSyncExternalStore } from "react";

const KUERI = "(prefers-reduced-motion: reduce)";

function langganan(berubah: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const media = window.matchMedia(KUERI);
  media.addEventListener?.("change", berubah);
  return () => media.removeEventListener?.("change", berubah);
}

function cuplikan(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(KUERI).matches;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(langganan, cuplikan, () => false);
}
