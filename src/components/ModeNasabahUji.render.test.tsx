/**
 * Run: bun src/components/ModeNasabahUji.render.test.tsx
 *
 * Uji render pemilih akun Mode Nasabah. Yang dijaga: admin yang sesinya belum
 * lolos TOTP mendapat penjelasan + jalan ke panel, bukan daftar kosong yang
 * membingungkan; keadaan memuat dan kosong dibedakan; dan tiap akun yang tampil
 * membawa cukup keterangan (KYC, data diri, riwayat pengajuan) untuk memutuskan
 * akun mana yang layak dipakai menguji fitur.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { ADMIN_ROUTE } from "@/lib/routes";

import { DaftarNasabahUji, type NasabahUji } from "./ModeNasabahUji";

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
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}

/** Aksi bawaan: tidak merender tombol apa pun. */
const tanpaAksi = () => null;

function render(props: Partial<ComponentProps<typeof DaftarNasabahUji>> = {}) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <DaftarNasabahUji
        siap
        memuat={false}
        kueri=""
        kueriCari=""
        hasil={[]}
        total={0}
        onKueri={tanpaAksi}
        aksi={tanpaAksi}
        {...props}
      />
    </MemoryRouter>,
  );
}

const rani: NasabahUji = {
  userId: "users_rani",
  nama: "RANI PUSPITA",
  email: "rani@pindai.test",
  kodePeminjam: "PMN-7K2QX9",
  kycStatus: "VERIFIED",
  punyaDataDiri: true,
  punyaPinjaman: true,
};

const budi: NasabahUji = {
  userId: "users_budi",
  nama: "BUDI SANTOSO",
  email: null,
  kodePeminjam: null,
  kycStatus: null,
  punyaDataDiri: false,
  punyaPinjaman: false,
};

// ===== 1. Belum lolos TOTP: daftar terkunci, jalan verifikasi tersedia =====
{
  const html = render({ siap: false });
  ada(html, "Verifikasi TOTP dulu", "keadaan belum-TOTP dijelaskan");
  ada(html, `href="${ADMIN_ROUTE}"`, "tautan ke panel admin tersedia");
  ada(html, "Daftar akun terkunci", "status pencarian menyebut kunci");
  ok(!html.includes("Masuk sebagai"), "tidak ada tombol masuk sebelum TOTP");
  bersih(html, "keadaan belum-TOTP");
}

// ===== 2. Memuat =====
{
  const html = render({ memuat: true });
  ada(html, "Mencari akun", "status memuat diumumkan");
  ok(!html.includes("Belum ada akun nasabah"), "keadaan kosong tidak tampil saat memuat");
  bersih(html, "keadaan memuat");
}

// ===== 3. Kosong tanpa pencarian =====
{
  const html = render();
  ada(html, "Belum ada akun nasabah", "keadaan kosong dijelaskan");
  ada(html, "mencatat pengajuan manual", "jalan membuat akun disebut");
  bersih(html, "keadaan kosong");
}

// ===== 4. Kosong karena pencarian =====
{
  const html = render({ kueri: "zzz", kueriCari: "zzz" });
  ada(html, "Tidak ada akun yang cocok", "pencarian tanpa hasil dijelaskan");
  ada(html, "zzz", "kata kunci yang dicari diulang");
  ada(html, "16 digit NIK", "saran pencarian berikutnya disebut");
  bersih(html, "pencarian kosong");
}

// ===== 5. Daftar terisi =====
{
  const html = render({
    kueri: "r",
    kueriCari: "r",
    hasil: [rani, budi],
    total: 7,
    aksi: (row) => <button type="button">Buka {row.nama}</button>,
  });
  ada(html, "RANI PUSPITA", "nama akun tampil");
  ada(html, "rani@pindai.test", "email tampil");
  ada(html, "PMN-7K2QX9", "kode nasabah tampil");
  ada(html, "KYC: Terverifikasi", "status KYC diterjemahkan");
  ada(html, "KYC: Belum dimulai", "akun tanpa KYC tetap jelas");
  ada(html, "Data diri terisi", "penanda data diri tampil");
  ada(html, "Data diri kosong", "penanda data diri kosong tampil");
  ada(html, "Pernah mengajukan", "riwayat pengajuan tampil");
  ada(html, "Tanpa email", "akun tanpa email tidak kosong melompong");
  ada(html, "Buka RANI PUSPITA", "aksi per baris dirender");
  ada(html, "7 akun cocok; 2 ditampilkan", "jumlah total dan halaman disebut");
  ada(html, "Buka BUDI SANTOSO", "aksi baris kedua ikut dirender");
  bersih(html, "daftar terisi");
}

// ===== 6. Pemasangan di /dashboard =====
{
  const dashboard = readFileSync(
    fileURLToPath(new URL("../pages/Dashboard.tsx", import.meta.url)),
    "utf8",
  );
  ok(dashboard.includes("<ModeNasabahUji />"), "admin diarahkan ke Mode Nasabah");
  ok(
    dashboard.includes('role === "admin" && adminPratinjauId === null'),
    "pintu hanya untuk admin tanpa target pratinjau",
  );
  ok(
    dashboard.includes('adminPratinjauId !== null || role === "admin"'),
    "query peminjam dilewati untuk admin",
  );
}

// ===== 7. Hitungan tanpa pencarian =====
{
  const html = render({ hasil: [rani], total: 1 });
  ada(html, "1 akun nasabah tersedia", "jumlah akun tanpa pencarian");
  bersih(html, "hitungan tanpa pencarian");
}

console.log(`\nModeNasabahUji.render: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
