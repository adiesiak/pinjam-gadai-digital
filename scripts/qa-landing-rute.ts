/**
 * Harness SSR beranda publik: tujuan tombol akun per peran.
 *
 * Beranda pernah menautkan `/admin`, jalur yang bukan rute nyata, sehingga akun
 * admin yang menekan tombol akun mendarat di halaman 404; panel admin ada di
 * rute yang disamarkan (`ADMIN_ROUTE`). Halaman dirender apa adanya dengan sesi
 * distub, karena `useAuth` membaca Convex lewat hook.
 *
 * Run: bun scripts/qa-landing-rute.ts
 */
import { mock } from "bun:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { ADMIN_ROUTE } from "@/lib/routes";
import { KONTEN_LANDING_DEFAULT } from "@/lib/landing-cms";

type Sesi = { isAuthenticated: boolean; user: { role?: string } | undefined };

let sesi: Sesi = { isAuthenticated: false, user: undefined };

/**
 * Beranda membaca teks dari `announcements.getPublic`. Harness ini tidak punya
 * deployment Convex, jadi hook-nya diganti nilai tetap: `undefined` untuk
 * membuktikan fallback bawaan, atau objek `landing` untuk membuktikan teks CMS
 * benar-benar dipakai.
 */
let cmsUji: { landing: typeof KONTEN_LANDING_DEFAULT } | undefined;

const convexReact = await import("convex/react");
mock.module("convex/react", () => ({
  ...convexReact,
  useQuery: () => cmsUji,
}));

mock.module("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: sesi.isAuthenticated,
    isAnonymous: false,
    user: sesi.user,
    signIn: async () => undefined,
    signOut: async () => undefined,
  }),
}));

const { default: LandingHome } = await import("@/pages/LandingHome");

let lulus = 0;
let gagal = 0;
function cek(nama: string, syarat: boolean) {
  if (syarat) {
    lulus += 1;
    console.log(`ok   ${nama}`);
  } else {
    gagal += 1;
    console.error(`FAIL ${nama}`);
  }
}
const ada = (markup: string, teks: string, nama: string) =>
  cek(`${nama} (memuat ${teks})`, markup.includes(teks));
const tidakAda = (markup: string, teks: string, nama: string) =>
  cek(`${nama} (tidak memuat ${teks})`, !markup.includes(teks));

/** Render beranda dengan satu sesi uji. */
function render(s: Sesi): string {
  sesi = s;
  return renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: ["/"] }, createElement(LandingHome)),
  );
}

// 1. Akun admin: tombol akun menuju panel admin, bukan jalur lama.
{
  const markup = render({ isAuthenticated: true, user: { role: "admin" } });
  ada(markup, `href="${ADMIN_ROUTE}"`, "akun admin diarahkan ke panel admin");
  tidakAda(markup, 'href="/admin"', "tidak ada tautan ke jalur lama /admin");
}

// 2. Akun nasabah dan pendana: dashboard, tanpa rute panel admin.
for (const role of ["peminjam", "dana"]) {
  const markup = render({ isAuthenticated: true, user: { role } });
  ada(markup, 'href="/dashboard"', `peran ${role} diarahkan ke dashboard`);
  tidakAda(markup, 'href="/admin"', `peran ${role} tidak ke jalur lama`);
  tidakAda(markup, ADMIN_ROUTE, `peran ${role} tidak diberi rute panel admin`);
}

// 3. Belum masuk: halaman masuk.
{
  const markup = render({ isAuthenticated: false, user: undefined });
  ada(markup, 'href="/auth"', "tamu diarahkan ke halaman masuk");
  tidakAda(markup, ADMIN_ROUTE, "tamu tidak diberi rute panel admin");
}

// 4. Tombol pemasangan aplikasi ikut ter-render di beranda, tanpa tautan toko
//    yang belum ada (Play Store/App Store belum punya listing).
{
  const markup = render({ isAuthenticated: false, user: undefined });
  ada(markup, "Pasang aplikasi", "beranda menampilkan satu tombol pasang");
  ada(markup, 'href="/pindai.apk"', "beranda menautkan berkas APK");
  cek(
    "tombol pasang tidak diduplikasi per platform",
    (markup.match(/Pasang aplikasi/g) ?? []).length === 1,
  );
  tidakAda(markup, "play.google", "beranda tidak menautkan Play Store");
  tidakAda(markup, "apps.apple", "beranda tidak menautkan App Store");
}

// 5. Teks CMS benar-benar dipakai beranda — bukan hanya tersimpan di database.
{
  cmsUji = {
    landing: {
      ...KONTEN_LANDING_DEFAULT,
      heroJudul1: "Judul dari CMS",
      layanan: KONTEN_LANDING_DEFAULT.layanan.map((kartu, i) =>
        i === 0 ? { ...kartu, judul: "Kartu dari CMS" } : kartu,
      ),
      panduan: KONTEN_LANDING_DEFAULT.panduan.map((item, i) =>
        i === 1 ? { ...item, isi: "Panduan dari CMS." } : item,
      ),
      footerDeskripsi: "Footer dari CMS.",
    },
  };
  const markup = render({ isAuthenticated: false, user: undefined });
  ada(markup, "Judul dari CMS", "judul hero memakai teks CMS");
  ada(markup, "Kartu dari CMS", "kartu layanan memakai teks CMS");
  ada(markup, "Panduan dari CMS.", "panduan memakai teks CMS");
  ada(markup, "Footer dari CMS.", "footer memakai teks CMS");
  tidakAda(
    markup,
    KONTEN_LANDING_DEFAULT.heroJudul1,
    "teks bawaan tidak menimpa teks CMS",
  );
  cmsUji = undefined;
}

// 6. Menu unduh aplikasi: halaman /aplikasi nyata dan bisa dijangkau dari
//    navigasi beranda, bukan tautan mati.
{
  const markup = render({ isAuthenticated: false, user: undefined });
  ada(markup, 'href="/aplikasi"', "beranda menautkan halaman unduh aplikasi");
  ada(markup, "Aplikasi Android", "menu menyebut aplikasi Android");
}

console.log(`qa-landing-rute: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
