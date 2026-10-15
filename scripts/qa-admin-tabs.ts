/**
 * Harness SSR sidebar panel admin: mode ikon (runtuh), ingatan pilihan di
 * localStorage, dan penghapusan kartu judul pada modul Verifikasi KYC.
 * Run: bun scripts/qa-admin-tabs.ts
 *
 * Kenapa di `scripts/`, bukan `.render.test.tsx` di dalam `src/`: berkas ini
 * butuh `mock.module` untuk mengganti `leaflet` dan `convex/react`, dan
 * `bun:test` bukan bagian dari program yang dikompilasi TypeScript
 * (`tsconfig.app.json` hanya menyertakan `src`). Harness lain yang memakai
 * `convex-test`/mocking, seperti `scripts/qa-meja-kerja.ts`, juga tinggal di sini.
 *
 * Yang dijaga:
 *  - pilihan petugas tersimpan di localStorage benar-benar dibaca ulang, dan
 *    nilai yang tidak tersedia diperlakukan sebagai "belum memilih" — bukan
 *    ditebak menjadi salah satu mode;
 *  - sidebar tetap merender seluruh modulnya setelah ditambahkan mode ikon;
 *  - modul Verifikasi KYC tidak lagi memakai kartu judul generik dan kolomnya
 *    dilebarkan: itu yang memberi ruang pada area bukti.
 *
 * Batas uji: harness ini merender ke string, jadi keadaan "mengecil otomatis di
 * layar sampai 1440px" (lewat `matchMedia` di peramban) tidak bisa dijalankan di
 * sini; yang diuji adalah jalur pilihan tersimpan dan struktur berkasnya.
 */
import { mock } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";

// `LiveLocationMap` menarik `leaflet`, yang menyentuh `window` saat modul dimuat.
// Panel itu tidak sedang dirender di sini (hanya tab aktif), jadi cukup distub.
mock.module("leaflet", () => ({ default: {} }));

// Panel yang tersambung server tidak diuji di sini; hook-nya distub dengan nilai
// "data belum tiba", dan ekspor provider ikut dilengkapi supaya rantai impor
// (mis. `@convex-dev/auth/react`) tetap bisa dimuat tanpa Convex berjalan.
const lewatkan = ({ children }: { children?: unknown }) => children;
mock.module("convex/react", () => ({
  useQuery: () => undefined,
  useQueries: () => ({ results: [] }),
  useMutation: () => async () => undefined,
  useAction: () => async () => undefined,
  useConvex: () => ({}),
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: false, isRefreshing: false }),
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: () => undefined }),
  useSubscription: () => undefined,
  useConvexConnectionState: () => ({ isWebSocketConnected: false }),
  useQuery_experimental: () => undefined,
  usePaginatedQuery_experimental: () => ({
    results: [],
    status: "Exhausted",
    loadMore: () => undefined,
  }),
  convexQueryOptions: (query: unknown) => ({ query }),
  ConvexReactClient: class {
    constructor() {}
  },
  ConvexProvider: lewatkan,
  ConvexProviderWithAuth: lewatkan,
  Authenticated: lewatkan,
  Unauthenticated: lewatkan,
  AuthLoading: lewatkan,
  AuthRefreshing: lewatkan,
}));

const { AdminTabs, bacaPilihanSidebar } = await import("@/pages/admin/admin-tabs");

let lulus = 0;
let gagal = 0;
function cek(nama: string, syarat: boolean, info?: string): void {
  if (syarat) {
    lulus += 1;
  } else {
    gagal += 1;
    console.error(`FAIL ${nama}${info === undefined ? "" : ` — ${info}`}`);
  }
}

/** Jalankan `bacaPilihanSidebar` dengan localStorage tiruan, lalu kembalikan jendela. */
function denganPenyimpanan(nilai: string | null, tersedia = true): boolean | null {
  const jendelaAsli = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      localStorage: tersedia
        ? {
            getItem: () => nilai,
            setItem: () => undefined,
          }
        : undefined,
    },
  });
  try {
    return bacaPilihanSidebar();
  } finally {
    if (jendelaAsli === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      Object.defineProperty(globalThis, "window", jendelaAsli);
    }
  }
}

// ===== 1. Pilihan sidebar yang tersimpan =====
cek("1a tersimpan '1' berarti mode ikon", denganPenyimpanan("1") === true);
cek("1b tersimpan '0' berarti sidebar lebar", denganPenyimpanan("0") === false);
cek("1c belum pernah memilih berarti null", denganPenyimpanan(null) === null);
cek(
  "1d localStorage yang tidak tersedia tidak menggagalkan panel",
  denganPenyimpanan(null, false) === null,
);

// ===== 2. Sidebar (keadaan bawaan) tetap memuat seluruh modulnya =====
const html = renderToStaticMarkup(
  createElement(AdminTabs, {
    overview: { loans: [], pawns: [], kredit: [] },
    stats: undefined,
    onOpenLoan: () => {},
    onOpenPawn: () => {},
    onOpenSetup: () => {},
  }),
);
cek("2a sidebar lebar memakai 256px", html.includes("lg:w-64"));
cek("2b kolom konten digeser sesuai lebar sidebar", html.includes("lg:pl-64"));
cek("2c tombol mengecilkan sidebar tersedia dan berlabel", html.includes("Kecilkan menjadi ikon"));
cek(
  "2d aria-label tombol sidebar ada untuk pembaca layar",
  html.includes("Kecilkan sidebar panel admin menjadi ikon"),
);
cek("2e modul KYC tetap terdaftar di sidebar", html.includes('id="tab-kyc"'));
cek("2f panel Ringkasan tetap terpasang", html.includes('id="panel-hari-ini"'));
cek("2g region menyebut modulnya untuk pembaca layar", html.includes('aria-label="Ringkasan"'));
cek("2h tanpa NaN", !html.includes("NaN"));
cek("2i tanpa undefined", !html.includes("undefined"));

// ===== 3. Kontrak di berkas: mode ikon, ambang 1440px, dan kartu KYC =====
const sumber = readFileSync(
  fileURLToPath(new URL("../src/pages/admin/admin-tabs.tsx", import.meta.url)),
  "utf8",
);
cek(
  "3a ambang mengecil otomatis 1440px",
  sumber.includes('const KUERI_SIDEBAR_OTOMATIS = "(max-width: 1440px)"'),
);
cek(
  "3b kunci penyimpanan pilihan sidebar",
  sumber.includes('const KUNCI_SIDEBAR_ADMIN = "pindai.admin.sidebar-ikon"'),
);
cek("3c lebar mode ikon ~64px", sumber.includes("lg:w-16"));
cek("3d kolom konten mengikuti lebar mode ikon", sumber.includes("lg:pl-16"));
cek("3e ikon modul punya aria-label dari nama modulnya", sumber.includes("aria-label={label}"));
cek(
  "3f kartu judul dilewati pada modul KYC",
  sumber.includes('aktif.value !== "hari-ini" && aktif.value !== "kyc"'),
);
cek(
  "3g kolom KYC memakai lebar penuh dengan padding rapat",
  sumber.includes('"max-w-none px-2 py-2 sm:px-3 sm:py-3 lg:pb-3"'),
);
cek(
  "3h panel KYC menunjuk aria-labelledby tombol yang benar di kedua mode",
  sumber.includes("sidebarIkon ? `tab-ikon-${aktif.value}` : `tab-${aktif.value}`"),
);

if (gagal > 0) {
  console.error(`\n${gagal} gagal, ${lulus} lulus`);
  process.exit(1);
}
console.log(`qa-admin-tabs: ${lulus} lulus`);
