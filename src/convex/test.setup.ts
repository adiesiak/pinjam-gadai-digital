/// <reference types="vite/client" />
/**
 * Modul Convex untuk convex-test.
 * Pola resmi: glob seluruh file fungsi di src/convex (eksklusi file test &
 * setup agar tidak rekursif) lalu dioper sebagai argumen kedua convexTest().
 */
export const modules = import.meta.glob("./**/!(*.*.*)*.*s");
