/**
 * Uji kartu "APK yang terbit" di panel Aplikasi Android.
 * Run: bun src/components/admin/KartuApkTerbit.render.test.tsx
 *
 * Yang dijaga:
 *  1. Kabar baik hanya muncul saat kode versi terbit sama dengan yang
 *     diumumkan; selisih ke dua arah diperingatkan, bukan didiamkan.
 *  2. Berkas versi yang gagal dibaca tidak mengarang angka, dan tetap memberi
 *     tautan unduhan serta tombol baca ulang.
 *  3. Tidak ada em dash, "undefined", atau "NaN" pada teks yang dibaca admin.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import {
  KartuApkTerbit,
  type PropsKartuApkTerbit,
} from "@/components/admin/KartuApkTerbit";

let lulus = 0;
let gagal = 0;
function cek(nama: string, syarat: boolean, info?: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${nama}${info === undefined ? "" : ` — ${info}`}`);
  }
}

function render(ubah: Partial<PropsKartuApkTerbit> = {}): string {
  const dasar: PropsKartuApkTerbit = {
    status: "siap",
    info: { versiKode: 5, versiNama: "1.3.1", tautan: "/pindai.apk", ukuranByte: 2_411_724 },
    alasan: null,
    terumumkan: { versiKode: 5, versiNama: "1.3.1", wajibDiperbarui: false },
    versiMinimum: null,
    alamatUnduh: "https://pindai.biz.id/pindai.apk",
    onMuatUlang: () => {},
    bisaUmumkan: false,
    sedangUmumkan: false,
    galatUmumkan: null,
    onUmumkan: () => {},
  };
  return renderToStaticMarkup(
    <MemoryRouter>
      <KartuApkTerbit {...dasar} {...ubah} />
    </MemoryRouter>,
  );
}

// ===== 1. Versi terbit sama dengan yang diumumkan =====
const sama = render();
cek("1a menyebut versi terbit", sama.includes("1.3.1 (kode 5)"));
cek("1b menyebut ukuran berkas", sama.includes("2.3 MB"), sama.match(/pindai\.apk[^<]*/)?.[0]);
cek("1c kabar baik saat sama", sama.includes("Versi terbit sama dengan yang diumumkan"));
cek("1d tautan unduh absolut dipakai", sama.includes('href="https://pindai.biz.id/pindai.apk"'));
cek("1e menautkan halaman unduh", sama.includes('href="/aplikasi"'));
cek("1f tanpa peringatan selisih", !sama.includes("belum diumumkan"));
cek("1g tanpa tombol umumkan saat sudah sama", !sama.includes("Umumkan kode"));

// ===== 2. APK terbit lebih baru dari yang diumumkan =====
const tertinggal = render({
  terumumkan: { versiKode: 4, versiNama: "1.3.0", wajibDiperbarui: false },
  bisaUmumkan: true,
});
cek(
  "2a memperingatkan versi belum diumumkan",
  tertinggal.includes("APK kode 5 sudah terbit, tetapi yang diumumkan baru kode 4"),
);
cek("2b tanpa kabar baik", !tertinggal.includes("Versi terbit sama dengan yang diumumkan"));
cek("2c tombol umumkan tersedia", tertinggal.includes("Umumkan kode 5"));
cek(
  "2d batas pengumuman dijelaskan",
  tertinggal.includes("Pesan WhatsApp tetap dikirim terpisah"),
);

// ===== 2e. Pengumuman gagal =====
const gagalUmumkan = render({
  terumumkan: null,
  bisaUmumkan: true,
  galatUmumkan: "Versi 1.3.1 (kode 5) sudah diumumkan.",
});
cek("2e pesan galat tampil", gagalUmumkan.includes("sudah diumumkan"));

// ===== 3. Versi diumumkan lebih baru dari berkas =====
const mendahului = render({
  terumumkan: { versiKode: 6, versiNama: "1.4.0", wajibDiperbarui: true },
});
cek(
  "3a memperingatkan berkas tertinggal",
  mendahului.includes("lebih baru dari berkas yang disajikan (kode 5)"),
);

// ===== 4. Belum ada pengumuman =====
const belum = render({ terumumkan: null });
cek("4a menyebut belum diumumkan", belum.includes("Kode 5 belum diumumkan"));
cek("4b kolom diumumkan jujur", belum.includes("Belum ada"));

// ===== 5. Berkas versi gagal dibaca =====
const rusak = render({
  status: "gagal",
  info: null,
  alasan: "Berkas versi menjawab HTTP 404.",
  alamatUnduh: null,
});
cek("5a menampilkan alasan", rusak.includes("HTTP 404"));
cek("5b menawarkan baca ulang", rusak.includes("Coba baca lagi"));
cek("5c tetap menautkan berkas cadangan", rusak.includes('href="/pindai.apk"'));
cek("5d tidak mengarang versi terbit", rusak.includes("Belum terbaca"));
cek("5e tanpa lencana versi palsu", !rusak.includes("kode 5 · 1.3.1"));

// ===== 6. Batas wajib =====
const wajib = render({ versiMinimum: 5 });
cek("6a lencana batas wajib", wajib.includes("wajib minimal kode 5"));
cek("6b kolom wajib terisi", wajib.includes("Di bawah kode 5"));

// ===== 7. Kebersihan teks =====
for (const [nama, html] of [
  ["sama", sama],
  ["tertinggal", tertinggal],
  ["rusak", rusak],
] as const) {
  cek(`7 ${nama} tanpa em dash`, !html.includes("\u2014"));
  cek(`7 ${nama} tanpa undefined`, !html.includes("undefined"));
  cek(`7 ${nama} tanpa NaN`, !html.includes("NaN"));
}

console.log(`KartuApkTerbit.render: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
