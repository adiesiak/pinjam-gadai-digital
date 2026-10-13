/**
 * Uji render kartu profil + menu peran di sisi kiri dashboard.
 * Run: bun src/pages/dashboard/dashboard-sidebar.render.test.tsx
 *
 * Kenapa uji ini ada:
 *
 *  1. pintasan admin memakai `ADMIN_ROUTE` yang sama dengan `main.tsx`, dan
 *     tidak ada lagi `href="/admin"`;
 *  2. peran non-Peminjam TIDAK kehilangan tombol Keluar (dulu tombol itu
 *     dirender sebagai cabang `else` dari pintasan ruang, jadi hilang begitu
 *     akun pendana/admin mendapat pintasannya sendiri);
 *  3. area admin hanya punya SATU pintu masuk. Dulu akun admin melihat pintasan
 *     "Panel Admin" di kartu profil SEKALIGUS kartu "Menu khusus" statis yang
 *     tidak bisa diklik dan memuat nama pengguna tanpa alasan;
 *  4. grup menu admin hanya dirender bila SERVER mengenali akun sebagai admin
 *     (`adminTerverifikasi`), bukan sekadar dari `role` di dokumen profil;
 *  5. di layar sempit kolom kiri TIDAK lagi menumpuk di atas konten: menunya
 *     hidup di drawer, dan drawer memakai ISI MENU yang sama dengan kolom kiri.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";

import { LABEL_STATUS_KYC } from "@/lib/kycStatus";
import { ADMIN_ROUTE } from "@/lib/routes";

import { DashboardSidebar, MenuAdminNav } from "./dashboard-sidebar";
import { badgeToneClass, labelTujuan } from "./dashboard-tab-nav";

/** Isi berkas sumber relatif terhadap `src/` — dipakai memeriksa pemasangan. */
function bacaSumber(relatif: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relatif}`, import.meta.url)), "utf8");
}

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function ada(html: string, teks: string, label: string): void {
  ok(html.includes(teks), `${label} (memuat "${teks}")`);
}
function tidakAda(html: string, teks: string, label: string): void {
  ok(!html.includes(teks), `${label} (tidak memuat "${teks}")`);
}
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}
/** Cacah kemunculan sebuah teks — dipakai membuktikan tidak ada pintu ganda. */
function cacah(html: string, teks: string): number {
  return html.split(teks).length - 1;
}

const props = {
  badges: {},
  activeTab: "pinjaman",
  onTabChange: () => {},
  onBuatPengajuan: () => {},
  onSignOut: () => {},
};

// ===== 1. Admin terverifikasi: satu pintu masuk ke panel =====
{
  const html = renderToStaticMarkup(
    <DashboardSidebar
      greetingName="chareloerya2"
      role="admin"
      adminTerverifikasi
      {...props}
    />,
  );
  ada(html, "Menu admin", "grup menu admin punya nama untuk pembaca layar");
  ada(html, "Panel Admin", "label pintasan admin tampil");
  ok(
    cacah(html, `href="${ADMIN_ROUTE}"`) === 1,
    `hanya SATU tautan ke panel admin (ditemukan ${cacah(html, `href="${ADMIN_ROUTE}"`)})`,
  );
  tidakAda(html, 'href="/admin"', "rute literal /admin tidak dipakai lagi");
  tidakAda(
    html,
    "Lihat menu untuk",
    "teks nama pengguna tanpa aksi tidak ditampilkan lagi",
  );
  tidakAda(html, "Menu khusus", "kartu Menu khusus yang statis sudah tidak ada");
  ada(html, "Keluar", "admin tetap punya tombol keluar");
  tidakAda(
    html,
    "Identitas dari pengisian mandiri",
    "penanda identitas berteks tetap tidak dipakai lagi",
  );
  bersih(html, "kartu profil admin");
}

// ===== 2. Admin yang belum lolos pemeriksaan server: tanpa menu admin =====
// `role` di dokumen profil saja tidak cukup: siapa pun yang memaksa nilainya
// tidak boleh melihat pintu yang tidak diakui server.
{
  const html = renderToStaticMarkup(
    <DashboardSidebar greetingName="chareloerya2" role="admin" {...props} />,
  );
  tidakAda(html, "Menu admin", "tanpa pengakuan server, grup menu admin disembunyikan");
  tidakAda(html, ADMIN_ROUTE, "tanpa pengakuan server, rute admin tidak diekspos");
  ada(html, "Keluar", "akun tetap punya tombol keluar");
  bersih(html, "kartu profil admin belum terverifikasi");
}

// ===== 3. Peran pendana: pintasan ruang pendana + tombol keluar =====
{
  const html = renderToStaticMarkup(
    <DashboardSidebar greetingName="Chatur Surya" role="dana" {...props} />,
  );
  ada(html, "Dashboard Dana", "label pintasan pendana tampil");
  ada(html, 'href="/penyedia-dana"', "pintasan pendana menuju ruang pendana");
  ada(html, "Keluar", "pendana punya tombol keluar");
  tidakAda(html, `href="${ADMIN_ROUTE}"`, "pendana tidak diberi pintasan admin");
  tidakAda(html, "Menu admin", "pendana tidak melihat grup menu admin");
  bersih(html, "kartu profil pendana");
}

// ===== 4. Nasabah Peminjam: tidak ada menu admin sama sekali =====
{
  const html = renderToStaticMarkup(<DashboardSidebar greetingName="Rani" role="peminjam" {...props} />);
  tidakAda(html, "Menu admin", "peminjam tidak melihat grup menu admin");
  tidakAda(html, ADMIN_ROUTE, "peminjam tidak diberi rute admin");
  tidakAda(html, "Menu khusus", "peran tanpa pintasan tidak dapat kotak kosong");
  ada(html, "Keluar", "peran tanpa pintasan tetap punya tombol keluar");
  bersih(html, "kartu profil peminjam");
}

// ===== 5. Grup menu admin berdiri sendiri: tautan benar + aksesibilitas =====
{
  const html = renderToStaticMarkup(<MenuAdminNav />);
  ada(html, 'aria-label="Menu admin"', "dibungkus nav berlabel");
  ada(html, `href="${ADMIN_ROUTE}"`, "mengarah ke rute panel yang sebenarnya");
  ada(html, "Panel Admin", "itemnya bernama jelas");
  bersih(html, "grup menu admin");
}

// ===== 6. Lencana status KYC memakai label kanonik `lib/kycStatus.ts` =====
// Sebelumnya kartu profil selalu berbunyi "Identitas dari pengisian mandiri",
// bahkan untuk akun yang sudah terverifikasi atau justru ditolak — sinyal yang
// bertentangan dengan status di kartu Ringkasan dan modul KYC.
{
  const terverifikasi = renderToStaticMarkup(
    <DashboardSidebar greetingName="Rani" kycStatus="VERIFIED" {...props} />,
  );
  ada(terverifikasi, LABEL_STATUS_KYC.VERIFIED, "status VERIFIED memakai label kanonik");
  tidakAda(terverifikasi, LABEL_STATUS_KYC.IN_PROGRESS, "status lain tidak ikut tampil");

  const perluPerbaikan = renderToStaticMarkup(
    <DashboardSidebar greetingName="Rani" kycStatus="NEEDS_CORRECTION" {...props} />,
  );
  ada(
    perluPerbaikan,
    LABEL_STATUS_KYC.NEEDS_CORRECTION,
    "status yang butuh tindakan tampil apa adanya",
  );

  const belumTerbaca = renderToStaticMarkup(
    <DashboardSidebar greetingName="Rani" kycStatus={null} {...props} />,
  );
  tidakAda(
    belumTerbaca,
    LABEL_STATUS_KYC.VERIFIED,
    "status belum terbaca tidak diklaim terverifikasi",
  );
  bersih(belumTerbaca, "kartu profil tanpa status KYC");
}

// ===== 7. Layar sempit: menu pindah ke drawer, tidak menumpuk di atas konten =====
{
  const dashboard = bacaSumber("pages/Dashboard.tsx");
  ada(
    dashboard,
    'className="hidden w-full shrink-0 lg:sticky lg:top-20 lg:block lg:w-64"',
    "kolom kiri hanya dirender pada layar lebar",
  );
  ada(dashboard, '<Sheet open={menuTerbuka}', "drawer menu dikendalikan state");
  ada(dashboard, 'side="left"', "drawer menu terbuka dari kiri");
  ada(dashboard, 'aria-haspopup="dialog"', "pemicu menu menyatakan membuka dialog");
  ok(
    (dashboard.match(/lg:hidden/g) ?? []).length >= 1,
    "pemicu menu hanya tampil di layar sempit (lg:hidden)",
  );
  ada(
    dashboard,
    "useEffect(() => setMenuTerbuka(false), [activeTab])",
    "memilih bagian menutup drawer sendiri",
  );
  ok(
    cacah(dashboard, "{isiMenu}") === 2,
    `isi menu dipakai kolom kiri DAN drawer (ditemukan ${cacah(dashboard, "{isiMenu}")})`,
  );
  ada(dashboard, "{labelTujuan(activeTab)}", "pemicu menyebut bagian yang sedang terbuka");
}

// ===== 8. Nama bagian & nada lencana: satu sumber dengan menu =====
{
  ok(labelTujuan("kyc") === "Verifikasi KYC", "label bagian dibaca dari menu yang sama");
  ok(labelTujuan("tidak-ada") === "Menu", "nilai tak dikenal tidak jadi nama kosong");
  ok(badgeToneClass("danger").includes("red"), "nada bahaya memakai merah");
  ok(badgeToneClass(undefined).includes("slate"), "nada bawaan tetap netral");
}

console.log(`dashboard-sidebar.render: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
