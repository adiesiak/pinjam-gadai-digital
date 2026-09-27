import { defineConfig } from "vitest/config";

/**
 * Vitest hanya untuk test integrasi Convex (convex-test).
 * Runtime harus edge-runtime (runtime Convex), bukan node — import.meta.glob
 * dan beberapa API Convex hanya tersedia di sana.
 * Test murni di src/lib tetap memakai runner `bun` (tanpa framework).
 */
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["src/convex/**/*.convex.test.ts"],
    server: {
      deps: {
        // convex-test wajib di-inline agar Vitest mengubahnya untuk edge-runtime.
        inline: ["convex-test"],
      },
    },
  },
});
