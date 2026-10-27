/// <reference types="vite/client" />
// Rahasia tautan berkas untuk uji: `convex/berkas.ts` menolak menandatangani
// tanpa rahasia asli, dan deployment uji tidak menyetel variabel environment.
process.env.BERKAS_LINK_SECRET ??= "uji-tautan-berkas-lokal";

/**
 * Modul Convex untuk convex-test.
 * Pola resmi: glob seluruh file fungsi di src/convex (eksklusi file test &
 * setup agar tidak rekursif) lalu dioper sebagai argumen kedua convexTest().
 */
export const modules = import.meta.glob("./**/!(*.*.*)*.*s");
