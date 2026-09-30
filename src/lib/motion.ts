import type { Variants } from "framer-motion";

/**
 * Nilai animasi bersama PINDAI — dipakai landing, halaman auth, dan dashboard
 * agar easing serta temponya seragam. Komponen pembungkusnya ada di
 * `@/components/Reveal`.
 */

/** Kurva easing lembut yang dipakai semua animasi PINDAI. */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Wadah yang memunculkan anaknya secara berurutan. */
export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
};

/** Satu item di dalam wadah berurutan. */
export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_OUT } },
};
