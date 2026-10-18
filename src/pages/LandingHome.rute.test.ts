/**
 * Uji tujuan tombol akun beranda publik (sumber halaman).
 * Run: bun src/pages/LandingHome.rute.test.ts
 *
 * Beranda pernah menautkan `/admin`, jalur yang bukan rute nyata, sehingga
 * akun admin yang menekan tombol akun mendarat di halaman 404. Panel admin ada
 * di rute yang disamarkan (`ADMIN_ROUTE`). Berkas ini menjaga sumbernya; klik
 * per peran diuji lewat render di `scripts/qa-landing-rute.ts`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
const ada = (sumber: string, teks: string, nama: string) =>
  cek(`${nama} (memuat ${teks})`, sumber.includes(teks));
const tidakAda = (sumber: string, teks: string, nama: string) =>
  cek(`${nama} (tidak memuat ${teks})`, !sumber.includes(teks));

// Berkas halaman: jalur admin hanya datang dari `lib/routes`, dan satu variabel
// tujuan dipakai header sekaligus hero.
{
  const sumber = readFileSync(
    fileURLToPath(new URL("./LandingHome.tsx", import.meta.url)),
    "utf8",
  );
  ada(sumber, "ADMIN_ROUTE", "rute admin dibaca dari lib/routes");
  tidakAda(sumber, '"/admin"', "berkas tidak menyimpan jalur admin yang lama");
  ada(sumber, "accountHref", "tombol akun memakai satu variabel tujuan");
  ada(
    sumber,
    "<DemoPengajuan />",
    "beranda memasang demo alur pengajuan",
  );
}

console.log(`LandingHome.rute: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
