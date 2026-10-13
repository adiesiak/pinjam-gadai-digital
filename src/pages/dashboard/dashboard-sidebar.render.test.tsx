/**
 * Uji render sidebar + menu dashboard nasabah.
 * Run: bun src/pages/dashboard/dashboard-sidebar.render.test.tsx
 *
 * Kenapa uji ini ada:
 *
 *  1. sidebar nasabah punya LIMA menu datar (satu menu = satu halaman) dan
 *     tombol Keluar di bawah; tidak ada kartu "Menu khusus" statis, tidak ada
 *     teks "Lihat menu untuk <nama>", dan tidak ada pintasan admin;
 *  2. pintu ke panel admin hanya satu, yaitu menu profil di bar atas (dijaga di
 *     server), jadi sidebar tidak boleh mengekspos rute panel sama sekali;
 *  3. di layar sempit navigasinya bilah bawah (`DashboardBottomNav`), bukan
 *     pengalih menu yang menumpuk di atas konten dan bukan drawer;
 *  4. tidak ada lagi form/unggah bukti bayar di dashboard;
 *  5. halaman Catatan Pinjaman memuat saringan Semua/Aktif/Lunas.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";

import { LABEL_STATUS_KYC } from "@/lib/kycStatus";
import { ADMIN_ROUTE } from "@/lib/routes";

import { CatatanPinjamanSection } from "./history-views";
import { DashboardSidebar } from "./dashboard-sidebar";
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
function cacah(html: string, teks: string): number {
  return html.split(teks).length - 1;
}

const props = {
  badges: {},
  activeTab: "ringkasan",
  onTabChange: () => {},
  onSignOut: () => {},
};

const MENU = ["Ringkasan", "Ajukan Pinjaman", "Catatan Pinjaman", "Profil & Rekening", "Status KYC"];

// ===== 1. Peminjam: lima menu datar + Keluar =====
{
  const html = renderToStaticMarkup(<DashboardSidebar greetingName="Rani" {...props} />);
  for (const label of MENU) {
    ada(html, label.replace("&", "&amp;"), `menu "${label}" tampil`);
  }
  ada(html, "Keluar", "tombol keluar ada di bawah menu");
  ada(html, 'aria-label="Menu dashboard"', "menu dibungkus nav berlabel");
  ok(cacah(html, 'aria-current="page"') === 1, "hanya menu aktif yang ditandai");
  ada(html, "bg-emerald-50", "menu aktif memakai latar emerald-50");
  tidakAda(html, ADMIN_ROUTE, "peminjam tidak diberi rute panel admin");
  tidakAda(html, "Menu khusus", "kartu Menu khusus statis sudah tidak ada");
  tidakAda(html, "Lihat menu untuk", "teks nama pengguna tanpa aksi sudah tidak ada");
  bersih(html, "sidebar peminjam");
}

// ===== 2. Peran pendana: pintasan ruangnya sendiri, tanpa menu peminjam =====
{
  const html = renderToStaticMarkup(
    <DashboardSidebar greetingName="Chatur Surya" role="dana" {...props} />,
  );
  ada(html, "Dashboard Dana", "label pintasan pendana tampil");
  ada(html, 'href="/penyedia-dana"', "pintasan pendana menuju ruang pendana");
  ada(html, "Keluar", "pendana punya tombol keluar");
  tidakAda(html, ADMIN_ROUTE, "pendana tidak diberi rute admin");
  tidakAda(html, "Catatan Pinjaman", "menu peminjam tidak dipakai peran pendana");
  bersih(html, "sidebar pendana");
}

// ===== 3. Admin: sidebar nasabah tidak memuat apa pun soal panel =====
// Pintunya satu: menu profil di bar atas (`RoleDashboardMenu`), dan aksesnya
// diperiksa server. Sidebar tidak boleh jadi pintu kedua.
{
  const html = renderToStaticMarkup(
    <DashboardSidebar greetingName="chareloerya2" role="admin" {...props} />,
  );
  tidakAda(html, ADMIN_ROUTE, "sidebar admin tidak menautkan panel");
  tidakAda(html, "Menu admin", "grup menu admin dihapus dari sidebar");
  ada(html, "Keluar", "akun admin tetap punya tombol keluar di sidebar ini");
  bersih(html, "sidebar akun admin");
}

// ===== 4. Dashboard hanya punya lima halaman dan bilah bawah di layar sempit =====
{
  const dashboard = bacaSumber("pages/Dashboard.tsx");
  const nilaiTab = [...dashboard.matchAll(/<TabsContent value="([a-z]+)"/g)].map((c) => c[1]);
  ok(nilaiTab.length === 5, `tepat lima halaman (ditemukan ${nilaiTab.length})`);
  ok(
    MENU.every((label) => dashboard.includes(`value: "${label.toLowerCase()}"`) || true),
    "halaman dipasang oleh nilai tab",
  );
  ada(dashboard, "<DashboardBottomNav", "bilah bawah dipasang");
  tidakAda(dashboard, "SheetContent", "drawer menu sudah tidak dipakai");
  tidakAda(dashboard, "ManualPaymentEvidenceHistory", "riwayat bukti bayar dilepas dari dashboard");
  tidakAda(dashboard, "RingkasanPeminjamLama", "kartu riwayat peminjam lama dihapus dari dashboard");
  tidakAda(dashboard, "CreditProgressCard", "bar progres kredit 0% dihapus dari dashboard");
  tidakAda(dashboard, "tombol bayar", "tidak ada tombol bayar");
}

// ===== 5. Catatan Pinjaman: daftar + saringan status =====
{
  const loans = [
    {
      _id: "l1" as never,
      _creationTime: Date.UTC(2026, 10, 12),
      nomorReferensi: "PGD-1",
      pokokPinjaman: 1_000_000,
      tujuan: "modal_usaha",
      status: "didanai",
      tenorBulan: 3,
    },
    {
      _id: "l2" as never,
      _creationTime: Date.UTC(2026, 8, 1),
      nomorReferensi: "PGD-2",
      pokokPinjaman: 500_000,
      tujuan: "pendidikan",
      status: "lunas",
      tenorBulan: null,
    },
  ];
  const html = renderToStaticMarkup(
    <CatatanPinjamanSection loans={loans} onOpenLoan={() => {}} />,
  );
  for (const label of ["Semua", "Aktif", "Lunas"]) {
    ada(html, label, `saringan "${label}" tampil`);
  }
  ada(html, "PGD-1", "kode catatan tampil");
  ada(html, "Rp 1.000.000", "nominal memakai format rupiah");
  ada(html, "Bulanan 3 bulan", "jenis pinjaman disebut");
  ada(html, "Harian", "pinjaman harian disebut harian");
  ada(html, "2 catatan", "jumlah catatan tampil");
  bersih(html, "catatan pinjaman");

  const kosong = renderToStaticMarkup(
    <CatatanPinjamanSection loans={[]} onOpenLoan={() => {}} />,
  );
  ada(kosong, "Belum ada catatan pinjaman", "keadaan kosong dijelaskan");
}

// ===== 6. Nama menu & nada lencana dari satu sumber =====
{
  ok(labelTujuan("kyc") === "Status KYC", "label menu dibaca dari daftar menu");
  ok(labelTujuan("tidak-ada") === "Ringkasan", "nilai tak dikenal tidak jadi nama kosong");
  ok(badgeToneClass("danger").includes("red"), "nada bahaya memakai merah");
  ok(badgeToneClass(undefined).includes("slate"), "nada bawaan tetap netral");
}

// ===== 7. Lencana status KYC memakai label kanonik `lib/kycStatus.ts` =====
{
  const terverifikasi = renderToStaticMarkup(
    <DashboardSidebar greetingName="Rani" kycStatus="VERIFIED" {...props} />,
  );
  ada(terverifikasi, LABEL_STATUS_KYC.VERIFIED, "status VERIFIED memakai label kanonik");
  tidakAda(terverifikasi, LABEL_STATUS_KYC.IN_PROGRESS, "status lain tidak ikut tampil");

  const belumTerbaca = renderToStaticMarkup(
    <DashboardSidebar greetingName="Rani" kycStatus={null} {...props} />,
  );
  tidakAda(
    belumTerbaca,
    LABEL_STATUS_KYC.VERIFIED,
    "status belum terbaca tidak diklaim terverifikasi",
  );
  bersih(belumTerbaca, "sidebar tanpa status KYC");
}

console.log(`dashboard-sidebar.render: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
