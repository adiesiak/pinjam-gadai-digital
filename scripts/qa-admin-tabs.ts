/**
 * Harness SSR sidebar panel admin: dua keadaan lebar (240px / 72px), ingatan
 * pilihan di localStorage, pintasan Ctrl+B, dan penghapusan kartu judul pada
 * modul Verifikasi KYC.
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
 *    bawaannya TERBUKA saat belum pernah memilih atau saat localStorage ditolak;
 *  - kolom sidebar merender seluruh modulnya sekaligus (bukan accordion), karena
 *    semua menu harus terjangkau berurutan dengan Tab;
 *  - modul Verifikasi KYC tidak lagi memakai kartu judul generik dan kolomnya
 *    dilebarkan: itu yang memberi ruang pada area bukti.
 *
 * Batas uji: harness ini merender ke string, jadi laci ponsel (portal Radix),
 * transisi lebar, dan `matchMedia` tidak bisa dijalankan di sini; yang diuji
 * adalah jalur pilihan tersimpan, markup kolom sidebar, dan kontrak di sumbernya.
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

const { AdminTabs } = await import("@/pages/admin/admin-tabs");
const { bacaSidebarTerbuka, KELAS_GESER_KONTEN, KELAS_LEBAR_SIDEBAR, pintasanSidebar } =
  await import("@/components/admin/admin-sidebar");

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

/** Jalankan `bacaSidebarTerbuka` dengan localStorage tiruan, lalu kembalikan jendela. */
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
    return bacaSidebarTerbuka();
  } finally {
    if (jendelaAsli === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      Object.defineProperty(globalThis, "window", jendelaAsli);
    }
  }
}

// ===== 1. Pilihan sidebar yang tersimpan =====
cek("1a tersimpan '1' berarti terbuka", denganPenyimpanan("1") === true);
cek("1b tersimpan '0' berarti menyempit jadi ikon", denganPenyimpanan("0") === false);
cek("1c belum pernah memilih berarti TERBUKA (bawaan pertama)", denganPenyimpanan(null) === true);
cek(
  "1d localStorage yang ditolak tidak menggagalkan panel (tetap terbuka)",
  denganPenyimpanan(null, false) === true,
);

// Pintasan Ctrl+B (⌘B di Mac): hanya modifier itu, tanpa Shift/Alt, dan huruf
// besar-kecil tidak berpengaruh.
const tombol = (ubah: Partial<Parameters<typeof pintasanSidebar>[0]>) => ({
  key: "b",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...ubah,
});
cek("1e Ctrl+B dikenali", pintasanSidebar(tombol({ ctrlKey: true })));
cek("1f Cmd+B dikenali", pintasanSidebar(tombol({ metaKey: true })));
cek("1g B tanpa modifier tidak dikenali", !pintasanSidebar(tombol({})));
cek("1h Ctrl+Shift+B tidak dikenali", !pintasanSidebar(tombol({ ctrlKey: true, shiftKey: true })));
cek("1i Ctrl+B tanpa huruf b tidak dikenali", !pintasanSidebar(tombol({ ctrlKey: true, key: "c" })));

// ===== 2. Sidebar (keadaan bawaan) memuat seluruh modulnya sekaligus =====
const html = renderToStaticMarkup(
  createElement(AdminTabs, {
    overview: { loans: [], pawns: [], kredit: [] },
    stats: undefined,
    onOpenLoan: () => {},
    onOpenPawn: () => {},
    onOpenSetup: () => {},
  }),
);
cek("2a sidebar lebar 240px", html.includes("lg:w-60"));
cek("2b kolom konten digeser sesuai lebar sidebar", html.includes("lg:pl-60"));
cek(
  "2c transisi lebar terpasang lewat kelas CSS",
  html.includes("sidebar-admin") && html.includes("kolom-admin"),
);
cek(
  "2d tombol buka/tutup memakai aria-expanded + aria-label",
  html.includes('aria-label="Tutup menu"') && html.includes('aria-expanded="true"'),
);
cek("2e modul KYC terdaftar di sidebar", html.includes('id="tab-kyc"'));
cek(
  "2f semua menu terlihat tanpa klik (modul terakhir grup Sistem)",
  html.includes('id="tab-backup"') && html.includes('id="tab-killswitch"'),
);
cek(
  "2g pengelompokan tampil sebagai judul seksi berlabel",
  html.includes('aria-label="Operasional"') && html.includes('aria-label="Keamanan &amp; audit"'),
);
cek("2h panel Ringkasan tetap terpasang", html.includes('id="panel-hari-ini"'));
cek("2i region menyebut modulnya untuk pembaca layar", html.includes('aria-label="Ringkasan"'));
cek("2j tanpa NaN", !html.includes("NaN"));
cek("2k tanpa undefined", !html.includes("undefined"));

// ===== 3. Kontrak di berkas: dua lebar, laci ponsel, dan kartu KYC =====
const sumber = readFileSync(
  fileURLToPath(new URL("../src/pages/admin/admin-tabs.tsx", import.meta.url)),
  "utf8",
);
const sumberSidebar = readFileSync(
  fileURLToPath(new URL("../src/components/admin/admin-sidebar.tsx", import.meta.url)),
  "utf8",
);
const sumberShell = readFileSync(
  fileURLToPath(new URL("../src/pages/admin/admin-shell.tsx", import.meta.url)),
  "utf8",
);
const css = readFileSync(fileURLToPath(new URL("../src/index.css", import.meta.url)), "utf8");

cek(
  "3a kunci penyimpanan pilihan sidebar",
  sumberSidebar.includes('const KUNCI_SIDEBAR_ADMIN = "pindai.admin.sidebar-terbuka"'),
);
cek(
  "3b dua lebar: 240px dan 72px",
  sumberSidebar.includes("lg:w-60") && sumberSidebar.includes("lg:w-[4.5rem]"),
);
cek(
  "3c geseran kolom konten mengikuti kedua lebar",
  sumberSidebar.includes("lg:pl-60") && sumberSidebar.includes("lg:pl-[4.5rem]"),
);
cek(
  "3d transisi memakai token gerak dan mati saat reduced-motion",
  /\.sidebar-admin \{[^}]*var\(--motion-normal\)/.test(css) &&
    /\.kolom-admin \{[^}]*var\(--motion-normal\)/.test(css) &&
    /\.sidebar-admin,\s*\n\s*\.kolom-admin \{\s*\n\s*transition: none;/.test(css),
);
cek(
  "3e ikon modul punya aria-label dari nama modulnya",
  sumberSidebar.includes("aria-label={label}"),
);
cek(
  "3f tooltip nama menu muncul di sisi kanan ikon",
  sumberSidebar.includes('side="right"'),
);
cek(
  "3g tombol toggle memakai aria-expanded dan label buka/tutup",
  sumberSidebar.includes("aria-expanded={terbuka}") &&
    sumberSidebar.includes('terbuka ? "Tutup menu" : "Buka menu"'),
);
cek(
  "3h ikon toggle berputar mengikuti keadaan",
  sumberSidebar.includes("!tertutup &&") === false && sumberSidebar.includes('!terbuka && "rotate-180"'),
);
cek(
  "3i laci ponsel dibuka dari kiri lewat Sheet",
  sumberSidebar.includes('side="left"') &&
    sumberSidebar.includes('id="menu-panel-admin"') &&
    sumberSidebar.includes("drawerTerbuka"),
);
cek(
  "3j laci tertutup saat panel pertama dibuka",
  sumber.includes("useState(false)") && sumber.includes("setDrawerTerbuka(false)"),
);
cek(
  "3k turunnya pintasan Ctrl+B terpasang di kepala panel",
  sumber.includes("pintasanSidebar(e)") &&
    sumber.includes('document.addEventListener("keydown", tangani)') &&
    sumberShell.includes('aria-expanded={menuPonsel.terbuka}') &&
    sumberShell.includes('menuPonsel.terbuka ? "Tutup menu" : "Buka menu"'),
);
cek(
  "3l tombol lama di bawah sidebar sudah tidak ada, dan sidebar lepas dari accordion",
  !sumber.includes("Kecilkan menjadi ikon") &&
    !sumber.includes("PanelLeftClose") &&
    !sumber.includes("PanelLeftOpen") &&
    !sumber.includes("components/ui/accordion"),
);
cek(
  "3m kartu judul dilewati pada modul KYC",
  sumber.includes('aktif.value !== "hari-ini" && aktif.value !== "kyc"'),
);
cek(
  "3n kolom KYC memakai lebar penuh dengan padding rapat",
  sumber.includes('"max-w-none px-2 py-2 sm:px-3 sm:py-3 lg:pb-3"'),
);
cek(
  "3o panel menunjuk tombol yang benar: laci, kolom lebar, atau kolom ikon",
  sumber.includes("laci-${aktif.value}") &&
    sumber.includes("tab-ikon-${aktif.value}") &&
    sumber.includes("tab-${aktif.value}"),
);

// ===== 4. Keadaan menyempit, dirender lewat seluruh kerangka admin =====
// Bagian 2 di atas hanya menguji keadaan bawaan (terbuka), sedangkan bagian 1
// menguji pembacaan pilihannya saja. Yang belum terbukti: saat pilihannya
// "menyempit", kolom sidebar DAN geseran kolom konten benar-benar berubah
// bersamaan. Kalau salah satunya tertukar, sidebar 72px dengan konten menggeser
// 240px — tata letaknya rusak tanpa satu pun galat tipe.
const jendelaSebelumnya = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", {
  configurable: true,
  writable: true,
  // `framer-motion` memasang pendengar ke `window` begitu global ini ada,
  // jadi jendela tiruannya harus punya API peristiwa kosong juga.
  value: {
    localStorage: { getItem: () => "0", setItem: () => undefined },
    // `AdminTabs` membaca `?tab=` saat keadaan awal; tanpa ini render melempar
    // sebelum satu pun kontrak tata letak bisa diperiksa.
    location: { search: "" },
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  },
});
let htmlSempit = "";
let kendaliHeader: { terbuka: boolean; adaToggle: boolean; judul: string } | null = null;
try {
  htmlSempit = renderToStaticMarkup(
    createElement(AdminTabs, {
      header: (judul: string, menuPonsel: { terbuka: boolean; onToggle: () => void }) => {
        kendaliHeader = {
          terbuka: menuPonsel.terbuka,
          adaToggle: typeof menuPonsel.onToggle === "function",
          judul,
        };
        return null;
      },
      overview: { loans: [], pawns: [], kredit: [] },
      stats: undefined,
      onOpenLoan: () => {},
      onOpenPawn: () => {},
      onOpenSetup: () => {},
    }),
  );
} finally {
  if (jendelaSebelumnya === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    Object.defineProperty(globalThis, "window", jendelaSebelumnya);
  }
}

cek("4a kolom sidebar menyempit jadi 72px", htmlSempit.includes("lg:w-[4.5rem]"));
cek("4b kolom konten ikut menggeser 72px", htmlSempit.includes("lg:pl-[4.5rem]"));
cek(
  "4c tidak ada sisa kelas keadaan lebar",
  !htmlSempit.includes("lg:w-60") && !htmlSempit.includes("lg:pl-60"),
);
cek(
  "4d label menu diganti nama di aria-label",
  htmlSempit.includes('id="tab-ikon-hari-ini"') && htmlSempit.includes('aria-label="Ringkasan"'),
);
cek(
  "4e kepala panel menerima judul modul aktif dan kendali laci yang bisa diklik",
  kendaliHeader !== null &&
    kendaliHeader.judul === "Ringkasan" &&
    kendaliHeader.terbuka === false &&
    kendaliHeader.adaToggle,
  JSON.stringify(kendaliHeader),
);
cek("4f tanpa NaN", !htmlSempit.includes("NaN"));
cek("4g tanpa undefined", !htmlSempit.includes("undefined"));

// Lebar kolom dan geseran konten harus sepasang di KEDUA keadaan, bukan hanya
// sama-sama ada: `lg:w-60` wajib berpasangan dengan `lg:pl-60`.
const ukuran = (kelas: string) => kelas.match(/lg:(?:w|pl)-(\S+)/)?.[1];
cek(
  "4h ukuran sidebar dan geseran konten sepasang di keadaan terbuka",
  ukuran(KELAS_LEBAR_SIDEBAR.terbuka) === ukuran(KELAS_GESER_KONTEN.terbuka),
);
cek(
  "4i ukuran sidebar dan geseran konten sepasang di keadaan menyempit",
  ukuran(KELAS_LEBAR_SIDEBAR.tertutup) === ukuran(KELAS_GESER_KONTEN.tertutup),
);

if (gagal > 0) {
  console.error(`\n${gagal} gagal, ${lulus} lulus`);
  process.exit(1);
}
console.log(`qa-admin-tabs: ${lulus} lulus`);
