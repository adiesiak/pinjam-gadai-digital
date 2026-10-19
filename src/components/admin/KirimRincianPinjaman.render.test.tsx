/**
 * Run: bun src/components/admin/KirimRincianPinjaman.render.test.tsx
 *
 * Uji render bagian "Dokumen rincian pinjaman" lewat react-dom/server (tanpa
 * DOM, tanpa jaringan). Yang dijaga: kanal yang belum bisa dipakai disebutkan
 * alasannya terlihat, tombolnya tidak menjadi kontrol mati, dan keadaan memuat
 * serta kabar hasil kiriman tidak pernah tampil sebagai teks kosong.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { BagianKirimRincian } from "./KirimRincianPinjaman";

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

const tanpaAksi = () => {};

function gambar(props: Partial<Parameters<typeof BagianKirimRincian>[0]>): string {
  return renderToStaticMarkup(
    <BagianKirimRincian
      kesiapan={{ email: "rani@pindai.test", whatsapp: "628123456789", bolehKirim: true }}
      sibuk={null}
      kabar={null}
      galat={null}
      onKirim={tanpaAksi}
      {...props}
    />,
  );
}

// Kesiapan kontak belum diketahui: jangan tampilkan tombol yang belum tentu bisa
// dipakai, cukup sebut apa yang sedang diperiksa.
const memuat = gambar({ kesiapan: undefined });
ada(memuat, "Memeriksa kontak peminjam", "keadaan memuat");
tidakAda(memuat, "Kirim Rincian", "keadaan memuat tanpa tombol");

// Bukan admin ber-TOTP: tombol kirim tidak pernah dirender.
const bukanAdmin = gambar({
  kesiapan: { email: "rani@pindai.test", whatsapp: null, bolehKirim: false },
});
ada(bukanAdmin, "memverifikasi TOTP", "penjelasan wewenang");
tidakAda(bukanAdmin, "Kirim Rincian", "tanpa tombol untuk non-admin");

// Kedua kontak siap: tiga tombol aktif tanpa kalimat alasan.
const siap = gambar({});
ada(siap, "Kirim Rincian (WA)", "tombol WhatsApp");
ada(siap, "Kirim Rincian (Email)", "tombol email");
ada(siap, "Simpan PDF", "tombol simpan PDF");
tidakAda(siap, 'disabled=""', "kontak lengkap berarti tombol aktif");
tidakAda(siap, "belum tercatat", "tanpa alasan kanal");

// Kontak hilang: tombolnya mati, dan alasannya terbaca admin.
const kosong = gambar({ kesiapan: { email: null, whatsapp: null, bolehKirim: true } });
// Simpan PDF tetap bisa ditekan: dokumennya masih bisa diserahkan sendiri.
ok(
  (kosong.match(/disabled=""/g) ?? []).length === 2,
  "tanpa kontak, dua tombol kirim terkunci dan simpan PDF tetap aktif",
);
ada(kosong, "Nomor WhatsApp dan email peminjam belum tercatat", "alasan kedua kanal");

const tanpaEmail = gambar({
  kesiapan: { email: "  ", whatsapp: "628123456789", bolehKirim: true },
});
ada(tanpaEmail, "Email peminjam belum tercatat", "alasan kanal email saja");

const tanpaNomor = gambar({
  kesiapan: { email: "rani@pindai.test", whatsapp: null, bolehKirim: true },
});
ada(tanpaNomor, "Nomor WhatsApp peminjam belum tercatat", "alasan kanal WhatsApp saja");

// Kabar hasil kiriman dan galat gateway ditampilkan apa adanya.
const denganKabar = gambar({ kabar: "Rincian dikirim ke WhatsApp 628123...6789 beserta berkas PDF." });
ada(denganKabar, 'role="status"', "kabar memakai status");
ada(denganKabar, "beserta berkas PDF", "isi kabar tampil");

const denganGalat = gambar({ galat: "Integrasi WhatsApp belum aktif, jadi rincian tidak dikirim." });
ada(denganGalat, 'role="alert"', "galat memakai alert");

const sedangKirim = gambar({ sibuk: "email" });
ok(
  (sedangKirim.match(/disabled=""/g) ?? []).length >= 3,
  "sedang bekerja berarti tombol terkunci",
);

// Aturan copy proyek: tanpa em dash di teks yang dihasilkan.
for (const [nama, html] of Object.entries({ memuat, bukanAdmin, siap, kosong, denganKabar })) {
  tidakAda(html, "\u2014", `${nama} tanpa em dash`);
}

console.log(`KirimRincianPinjaman: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
