/**
 * Uji render kartu profil + pintasan peran di sisi kiri dashboard.
 * Run: bun src/pages/dashboard/dashboard-sidebar.render.test.tsx
 *
 * Kenapa uji ini ada: pintasan "Panel Admin" pernah menulis rute literal
 * `/admin`, padahal panel admin disamarkan di `lib/routes.ts`
 * (`ADMIN_ROUTE`). Akibatnya menekan pintasan itu mendarat di halaman "tidak
 * ditemukan", bukan ke panelnya. Yang dijaga di sini:
 *
 *  1. pintasan admin memakai `ADMIN_ROUTE` yang sama dengan `main.tsx`, dan
 *     tidak ada lagi `href="/admin"`;
 *  2. peran non-Peminjam TIDAK kehilangan tombol Keluar (dulu tombol itu
 *     dirender sebagai cabang `else` dari pintasan ruang, jadi hilang begitu
 *     akun pendana/admin mendapat pintasannya sendiri).
 */
import { renderToStaticMarkup } from "react-dom/server";

import { ADMIN_ROUTE } from "@/lib/routes";

import { DashboardSidebar } from "./dashboard-sidebar";

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

const props = {
  badges: {},
  activeTab: "pinjaman",
  onTabChange: () => {},
  onBuatPengajuan: () => {},
  onSignOut: () => {},
};

// ===== 1. Peran admin: pintasan menuju rute panel yang sesungguhnya =====
{
  const html = renderToStaticMarkup(
    <DashboardSidebar greetingName="chareloerya2" role="admin" {...props} />,
  );
  ada(html, "Panel Admin", "label pintasan admin tampil");
  ada(html, `href="${ADMIN_ROUTE}"`, "pintasan admin memakai ADMIN_ROUTE");
  tidakAda(
    html,
    'href="/admin"',
    "rute literal /admin tidak dipakai lagi",
  );
  ada(html, "Lihat menu untuk chareloerya2", "keterangan pintasan menyebut nama");
  ada(html, "Keluar", "admin tetap punya tombol keluar");
  ada(html, "Identitas dari pengisian mandiri", "penanda identitas tetap ada");
  bersih(html, "kartu profil admin");
}

// ===== 2. Peran pendana: pintasan ruang pendana + tombol keluar =====
{
  const html = renderToStaticMarkup(
    <DashboardSidebar greetingName="Chatur Surya" role="dana" {...props} />,
  );
  ada(html, "Dashboard Dana", "label pintasan pendana tampil");
  ada(html, 'href="/penyedia-dana"', "pintasan pendana menuju ruang pendana");
  ada(html, "Keluar", "pendana punya tombol keluar");
  tidakAda(html, `href="${ADMIN_ROUTE}"`, "pendana tidak diberi pintasan admin");
  bersih(html, "kartu profil pendana");
}

// ===== 3. Peran tak dikenal: tidak ada pintasan kosong =====
{
  const html = renderToStaticMarkup(
    <DashboardSidebar greetingName="Tamu" role="pengamat" {...props} />,
  );
  tidakAda(html, "Menu khusus", "peran tanpa pintasan tidak dapat kotak kosong");
  ada(html, "Keluar", "peran tanpa pintasan tetap punya tombol keluar");
  bersih(html, "kartu profil tanpa pintasan");
}

console.log(`dashboard-sidebar.render: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
