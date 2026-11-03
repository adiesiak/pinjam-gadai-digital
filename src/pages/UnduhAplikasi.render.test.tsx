/**
 * Uji halaman unduh aplikasi (`/aplikasi`).
 * Run: bun src/pages/UnduhAplikasi.render.test.tsx
 *
 * Yang dijaga:
 *  1. Tautan unduhan memakai versi dan tautan dari `public/version.json`, dan
 *     berkas APK-nya memang ada.
 *  2. Tiga keadaan halaman (memuat, siap, gagal) tidak menampilkan
 *     "undefined"/"NaN"; keadaan gagal tetap memberi tautan APK cadangan.
 *  3. Halaman tidak menautkan toko aplikasi yang belum punya listing.
 *  4. Data versi ditolak bila kode, nama, atau tautannya tidak masuk akal.
 */
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import QRCode from "qrcode";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import {
  NAMA_BERKAS_UNDUHAN,
  TAUTAN_UNDUH_CADANGAN,
  bacaInfoUnduhan,
  muatInfoUnduhan,
  statusVersi,
  ukuranTerbaca,
} from "@/lib/unduhAplikasi";
import { UnduhAplikasiView } from "@/pages/UnduhAplikasi";
import {
  URL_HALAMAN_UNDUH,
  tautanWhatsappAplikasi,
} from "@/lib/tautanAplikasi";

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
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}

const akar = fileURLToPath(new URL("../../", import.meta.url));

const berkasVersi = JSON.parse(
  readFileSync(`${akar}public/version.json`, "utf8"),
) as unknown;
const info = bacaInfoUnduhan(berkasVersi);
ok(info !== null, "version.json yang terpasang bisa dibaca");
if (info === null) {
  throw new Error("version.json tidak bisa dibaca, uji tidak bisa dilanjutkan");
}

ok(info.versiKode > 0, "kode versi positif");
ok(/^\d+\.\d+(\.\d+)?$/.test(info.versiNama), "nama versi berbentuk angka bertitik");
ok(info.tautan === TAUTAN_UNDUH_CADANGAN, "version.json menunjuk APK bawaan");
ok(
  statSync(`${akar}public/pindai.apk`).size > 10_000,
  "berkas APK di public/ ada dan berukuran wajar",
);

ok(
  URL_HALAMAN_UNDUH === "https://pindai.biz.id/aplikasi",
  "alamat bagikan memakai domain resmi",
);
ok(
  decodeURIComponent(tautanWhatsappAplikasi().split("text=")[1] ?? "").includes(
    URL_HALAMAN_UNDUH,
  ),
  "pesan WhatsApp memuat alamat halaman unduh",
);

{
  const qr = readFileSync(`${akar}public/qr-aplikasi.svg`, "utf8");
  ok(qr.startsWith("<svg"), "berkas QR berupa SVG");
  ok(qr.includes('fill="#ffffff"'), "QR punya bidang putih untuk quiet zone");
  ok(qr.includes('stroke="#0f3d3a"'), "QR memakai warna lambang");

  const qrHarapan = await QRCode.toString(URL_HALAMAN_UNDUH, {
    type: "svg",
    width: 240,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#0f3d3a", light: "#ffffff" },
  });
  ok(
    qr === qrHarapan,
    "QR di public/ dihasilkan dari alamat halaman unduh resmi",
  );
}

// ===== 1. Keadaan siap ======================================================
{
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/aplikasi"]}>
      <UnduhAplikasiView
        status="siap"
        info={{
          ...info,
          ukuranByte: statSync(`${akar}public/pindai.apk`).size,
        }}
        terpasang={info.versiKode}
        onMuatUlang={() => undefined}
      />
    </MemoryRouter>,
  );

  ada(html, "Unduh PINDAI untuk Android", "judul halaman tampil");
  ada(
    html,
    `src="/icon-192.png?v=${info.versiNama}"`,
    "kartu memakai ikon lambang dengan cache-busting",
  );
  ada(html, 'src="/qr-aplikasi.svg"', "QR halaman unduh tampil");
  ada(html, "Bagikan lewat WhatsApp", "tombol bagikan tersedia");
  ada(html, "wa.me/?text=", "tautan bagikan menuju WhatsApp");
  ada(html, URL_HALAMAN_UNDUH, "alamat halaman unduh ditampilkan");
  ok((html.match(/<h1/g) ?? []).length === 1, "hanya satu h1");
  ada(html, `Unduh APK ${info.versiNama}`, "tombol menyebut versi dari version.json");
  ada(html, `href="${info.tautan}"`, "tombol menuju tautan dari version.json");
  ada(html, `download="${NAMA_BERKAS_UNDUHAN}"`, "tautan memakai nama berkas yang jelas");
  ada(html, `kode ${info.versiKode}`, "kode versi ditampilkan");
  const ukuran = ukuranTerbaca(statSync(`${akar}public/pindai.apk`).size);
  ok(ukuran !== null, "ukuran berkas bisa diformat");
  if (ukuran !== null) ada(html, ukuran, "ukuran berkas tampil");
  ada(html, "Android 6.0 ke atas", "syarat Android ditulis");
  ada(html, "Unduh berkasnya", "langkah pertama tampil");
  ada(html, "Izinkan pemasangan", "langkah kedua tampil");
  ada(html, "Buka dan masuk", "langkah ketiga tampil");
  ada(html, "Bagaimana aplikasi tahu ada versi baru?", "pertanyaan pembaruan tampil");
  ada(html, "Apakah PINDAI ada di Play Store?", "pertanyaan toko aplikasi tampil");
  ada(html, 'aria-current="page"', "menu Aplikasi ditandai sebagai halaman aktif");
  ada(html, "Aplikasi yang Anda pakai sudah versi", "status versi terpasang tampil");
  ok(!html.includes("—"), "tidak ada em dash di teks halaman");
  ok(
    !html.includes("play.google") &&
      !html.includes("apps.apple") &&
      !html.includes("market://"),
    "tidak ada tautan toko aplikasi",
  );
  bersih(html, "keadaan siap");
}

// ===== 1b. Panduan per perangkat ===========================================
const infoSiap = {
  ...info,
  ukuranByte: statSync(`${akar}public/pindai.apk`).size,
};

for (const [perangkat, teks] of [
  ["android", "Perangkat ini Android"],
  ["ios", "iPhone dan iPad tidak bisa memasang APK"],
  ["desktop", "Anda membuka halaman ini di komputer"],
] as const) {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/aplikasi"]}>
      <UnduhAplikasiView
        status="siap"
        info={infoSiap}
        perangkat={perangkat}
        onMuatUlang={() => undefined}
      />
    </MemoryRouter>,
  );
  ada(html, teks, `panduan untuk ${perangkat} tampil`);
  bersih(html, `panduan ${perangkat}`);
}

{
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/aplikasi"]}>
      <UnduhAplikasiView
        status="siap"
        info={infoSiap}
        perangkat="ios"
        onMuatUlang={() => undefined}
      />
    </MemoryRouter>,
  );
  ada(html, "Tambah ke Layar Utama", "langkah pasang web iPhone tampil");
  ada(html, 'href="#bagikan"', "tombol iPhone menuju panduan pemasangan");
  ok(
    !html.includes(`Unduh APK ${info.versiNama}`),
    "iPhone tidak ditawari berkas APK",
  );
}

{
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/aplikasi"]}>
      <UnduhAplikasiView
        status="siap"
        info={infoSiap}
        perangkat="android"
        onMuatUlang={() => undefined}
      />
    </MemoryRouter>,
  );
  ada(html, `Unduh APK ${info.versiNama}`, "Android tetap mendapat tombol APK");
  ada(html, "instal dari sumber", "Android diberi tahu izin pemasangan");
}

// ===== 2. Keadaan memuat ====================================================
{
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/aplikasi"]}>
      <UnduhAplikasiView status="memuat" terpasang={null} onMuatUlang={() => undefined} />
    </MemoryRouter>,
  );
  ada(html, 'aria-busy="true"', "keadaan memuat diumumkan");
  ada(html, "Sebentar, halaman sedang mengambil berkas versi.", "keadaan memuat menjelaskan prosesnya");
  ok(!html.includes("Unduh APK "), "tidak ada tombol unduh dengan versi karangan");
  bersih(html, "keadaan memuat");
}

// ===== 3. Keadaan gagal =====================================================
{
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/aplikasi"]}>
      <UnduhAplikasiView
        status="gagal"
        alasan="Berkas versi menjawab HTTP 404."
        terpasang={null}
        onMuatUlang={() => undefined}
      />
    </MemoryRouter>,
  );
  ada(html, 'role="alert"', "kegagalan diumumkan");
  ada(html, "Berkas versi menjawab HTTP 404.", "alasan kegagalan tampil apa adanya");
  ada(html, "Coba lagi", "tombol coba lagi tersedia");
  ada(html, `href="${TAUTAN_UNDUH_CADANGAN}"`, "tautan APK cadangan tetap tersedia");
  ada(html, `download="${NAMA_BERKAS_UNDUHAN}"`, "tautan cadangan memakai nama berkas");
  bersih(html, "keadaan gagal");
}

// ===== 4. Aturan data =======================================================
ok(ukuranTerbaca(null) === null, "ukuran kosong tidak ditampilkan");
ok(ukuranTerbaca(0) === null, "ukuran nol ditolak");
ok(ukuranTerbaca(Number.NaN) === null, "ukuran NaN ditolak");
ok(ukuranTerbaca(512) === "512 B", "ukuran byte kecil");
ok(ukuranTerbaca(25_381) === "25 KB", "ukuran kilobyte dibulatkan");
ok(ukuranTerbaca(1_572_864) === "1.5 MB", "ukuran megabyte satu desimal");

ok(bacaInfoUnduhan(null) === null, "isi kosong ditolak");
ok(bacaInfoUnduhan({}) === null, "objek tanpa versi ditolak");
ok(
  bacaInfoUnduhan({ versionCode: 0, versionName: "1.0", apkUrl: "/pindai.apk" }) === null,
  "kode versi nol ditolak",
);
ok(
  bacaInfoUnduhan({ versionCode: 4, versionName: "1.3", apkUrl: "/pindai.apk" }) !== null,
  "nama versi dua angka diterima",
);
ok(
  bacaInfoUnduhan({ versionCode: 4, versionName: "1.3.0.1", apkUrl: "/pindai.apk" }) === null,
  "nama versi empat angka ditolak",
);
ok(
  bacaInfoUnduhan({ versionCode: 4, versionName: "1.3.0", apkUrl: "//evil.example/pindai.apk" }) ===
    null,
  "tautan protokol-relatif ditolak",
);
ok(
  bacaInfoUnduhan({ versionCode: 4, versionName: "1.3.0", apkUrl: "pindai.apk" }) === null,
  "tautan tanpa garis miring awal ditolak",
);
ok(
  bacaInfoUnduhan({ versionCode: 4, versionName: "1.3.0", apkUrl: "/pindai apk" }) === null,
  "tautan berspasi ditolak",
);
ok(
  bacaInfoUnduhan({
    versionCode: 4,
    versionName: "1.3.0",
    apkUrl: "https://pindai.biz.id/pindai.apk",
  }) !== null,
  "tautan http(s) utuh diterima",
);

// ===== 5. Status versi terpasang ===========================================
ok(statusVersi(null, info).teks.includes("peramban"), "peramban tidak dianggap usang");
ok(statusVersi(info.versiKode, info).nada === "sukses", "versi sama dinyatakan terbaru");
ok(statusVersi(info.versiKode - 1, info).nada === "perhatian", "versi lama diberi perhatian");
ok(
  statusVersi(info.versiKode - 1, info).teks.includes("Pembaruan tersedia"),
  "versi lama menyebut pembaruan",
);
ok(statusVersi(0, info).nada === "perhatian", "APK tanpa penanda kode diberi perhatian");
ok(
  statusVersi(info.versiKode + 1, info).teks.includes("lebih baru"),
  "versi lebih baru dari server tidak disebut usang",
);

// ===== 6. Pemuat berkas ====================================================
{
  const panggilan: string[] = [];
  const palsu = (async (
    masukan: Parameters<typeof fetch>[0],
    inisial?: Parameters<typeof fetch>[1],
  ) => {
    const alamat = String(masukan);
    panggilan.push(`${inisial?.method ?? "GET"} ${alamat}`);
    if (alamat === "/version.json") {
      return new Response(JSON.stringify(berkasVersi), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (inisial?.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: { "content-length": "25381" },
      });
    }
    return new Response("tidak ditemukan", { status: 404 });
  }) as typeof fetch;

  const hasil = await muatInfoUnduhan(palsu);
  ok(hasil.ok, "version.json yang sah berhasil dimuat");
  if (hasil.ok) {
    ok(hasil.info.versiKode === info.versiKode, "kode versi diteruskan");
    ok(hasil.info.versiNama === info.versiNama, "nama versi diteruskan");
    ok(hasil.info.tautan === info.tautan, "tautan diteruskan");
    ok(hasil.info.ukuranByte === 25_381, "ukuran berkas dibaca dari HEAD");
  }
  ok(
    panggilan.some((p) => p === "HEAD /pindai.apk"),
    "ukuran diminta dengan HEAD, bukan mengunduh berkas",
  );
}

{
  const rusak = (async () =>
    new Response("tidak ada", { status: 404 })) as typeof fetch;
  const hasil = await muatInfoUnduhan(rusak);
  ok(!hasil.ok, "HTTP 404 membuat pemuatan gagal");
  if (!hasil.ok) ok(hasil.alasan.includes("HTTP 404"), "status HTTP disebut di alasan");
}

{
  const kepalaGagal = (async (
    masukan: Parameters<typeof fetch>[0],
    inisial?: Parameters<typeof fetch>[1],
  ) => {
    if (inisial?.method === "HEAD") return new Response(null, { status: 500 });
    return new Response(JSON.stringify(berkasVersi), { status: 200 });
  }) as typeof fetch;
  const hasil = await muatInfoUnduhan(kepalaGagal);
  ok(hasil.ok, "kegagalan HEAD tidak membatalkan halaman");
  if (hasil.ok) ok(hasil.info.ukuranByte === null, "ukuran dibiarkan kosong bila HEAD gagal");
}

// ===== 7. Rute terdaftar ====================================================
{
  const main = readFileSync(`${akar}src/main.tsx`, "utf8");
  ok(main.includes('path="/aplikasi"'), "rute /aplikasi terdaftar di main.tsx");
  ok(
    main.includes('import("./pages/UnduhAplikasi.tsx")'),
    "halaman unduh dimuat sebagai rute terpisah",
  );
}

console.log(`UnduhAplikasi.render: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
