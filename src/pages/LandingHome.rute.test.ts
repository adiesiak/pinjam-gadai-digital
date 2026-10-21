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
  ada(
    sumber,
    "<PasangAplikasi />",
    "beranda memasang tombol pemasangan aplikasi",
  );
  // CTA sekunder pernah memanggil `window.location.assign("/biaya")`, yang
  // memuat ulang seluruh halaman dan tidak bisa dibuka di tab baru.
  tidakAda(sumber, "window.location.assign", "CTA hero memakai navigasi router");
  // Menu ponsel berbasis `<details>` tetap terbuka setelah tautan dipilih dan
  // tidak tertutup oleh Escape. Perilakunya kini satu komponen bersama.
  tidakAda(sumber, "<details className", "beranda tidak memakai <details>");
  ada(sumber, "<MenuInformasiPonsel", "beranda memakai menu ponsel bersama");
  // Doorprize triwulanan boleh diumumkan; skema imbal hasil pendana tidak.
  ada(sumber, "<DoorprizeRingkas", "beranda menjelaskan doorprize triwulanan");
  tidakAda(
    sumber,
    "<RuangPendanaRingkas",
    "beranda tidak membuka skema imbal hasil pendana ke publik",
  );
  // Angka kartu layanan tidak boleh ditulis di halaman.
  ada(sumber, "SOROTAN_LAYANAN", "kartu layanan memakai angka dari lib");
}

// Tiga halaman publik memakai menu ponsel yang sama; tidak boleh ada satu pun
// yang kembali ke `<details>`.
for (const berkas of ["./PublicInfoPage.tsx", "./UnduhAplikasi.tsx"]) {
  const sumber = readFileSync(
    fileURLToPath(new URL(berkas, import.meta.url)),
    "utf8",
  );
  ada(sumber, "<MenuInformasiPonsel", `${berkas} memakai menu ponsel bersama`);
  tidakAda(sumber, "<details className", `${berkas} tidak memakai <details>`);
}

// Komponen bersama: keadaan diumumkan, Escape menutup, dan klik di luar menutup.
{
  const komponen = readFileSync(
    fileURLToPath(new URL("../components/MenuInformasiPonsel.tsx", import.meta.url)),
    "utf8",
  );
  ada(komponen, "aria-expanded", "tombol menu mengumumkan keadaannya");
  ada(komponen, '"Escape"', "Escape menutup menu");
  ada(komponen, "pointerdown", "klik di luar menu ditangani");
  ada(komponen, "onClick={tutup}", "tautan menutup menu setelah dipilih");
}

// Shell aplikasi: sinkronisasi tema memakai `useLocation`, jadi ia harus
// dirender DI DALAM router. Sebelumnya ia dipasang di luar `<BrowserRouter>`
// dan hook itu melempar di setiap halaman — boundary teratas lalu menutupi
// seluruh aplikasi dengan halaman "kendala teknis".
{
  const shell = readFileSync(fileURLToPath(new URL("../main.tsx", import.meta.url)), "utf8");
  const buka = shell.indexOf("<BrowserRouter>");
  const tutup = shell.indexOf("</BrowserRouter>");
  const tema = shell.indexOf("<ThemeSync />");
  cek(
    "ThemeSync dirender di dalam BrowserRouter",
    buka !== -1 && tutup !== -1 && tema > buka && tema < tutup,
  );
}

console.log(`LandingHome.rute: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
