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

type Sesi = { isAuthenticated: boolean; user: { role?: string } | undefined };

let sesi: Sesi = { isAuthenticated: false, user: undefined };

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
  cek(
    "tombol pasang tidak diduplikasi per platform",
    (markup.match(/Pasang aplikasi/g) ?? []).length === 1,
  );
  tidakAda(markup, "play.google", "beranda tidak menautkan Play Store");
  tidakAda(markup, "apps.apple", "beranda tidak menautkan App Store");
}

console.log(`qa-landing-rute: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
