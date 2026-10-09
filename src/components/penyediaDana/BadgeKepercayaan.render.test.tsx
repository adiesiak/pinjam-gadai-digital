/**
 * Uji render penanda kerja tabel penyedia dana.
 * Run: bun src/components/penyediaDana/BadgeKepercayaan.render.test.tsx
 *
 * Yang dijaga:
 *  - tanggal jatuh tempo benar-benar dicetak TEBAL dan berwarna sesuai nada,
 *    beserta lencana hitung hari ("Sisa 12 hari" / "Terlambat 3 hari"),
 *  - kalimat aksesibilitas ikut tercetak (title + aria-label),
 *  - indeks kepercayaan menampilkan label, skor, dasar penilaian, dan
 *    pernyataan bahwa itu BUKAN skor kredit lembaga penilai,
 *  - tidak ada "undefined"/"NaN"/"[object Object]" di markup.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { ringkasJatuhTempo } from "@/lib/jatuhTempo";
import { hitungKepercayaan, riwayatDariPinjaman } from "@/lib/kepercayaanPeminjam";

import {
  BadgeKepercayaan,
  TampilanJatuhTempo,
  TampilanJatuhTempoRingkas,
} from "./BadgeKepercayaan";

/** Kelas warna yang HARUS muncul per nada — dipakai untuk menjaga kontras. */
const WARNA = {
  netral: "text-slate-900",
  segera: "text-amber-700",
  terlambat: "text-red-700",
} as const;

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
function ada(html: string, teks: string, label: string): void {
  ok(html.includes(teks), `${label} (memuat "${teks}")`);
}
function bersih(html: string, label: string): void {
  for (const rusak of ["undefined", "[object Object]", "NaN"]) {
    ok(!html.includes(rusak), `${label} tanpa "${rusak}"`);
  }
}

const HARI = 86_400_000;
const DIDANAI = Date.UTC(2026, 0, 10);
const baris = (status: string, tenorHari: number | null = 30) => ({
  status,
  pokokPinjaman: 2_000_000,
  didanaiPada: DIDANAI,
  tenorHari,
  tenorBulan: null as number | null,
  persenBunga: null as number | null,
});

// ===== 1. Tanggal jatuh tempo mencolok =====
const jauh = ringkasJatuhTempo(baris("didanai"), DIDANAI + 5 * HARI);
const htmlJauh = renderToStaticMarkup(<TampilanJatuhTempo tampilan={jauh} />);
ada(htmlJauh, jauh.teks, "tanggal jatuh tempo tampil apa adanya");
ada(htmlJauh, "font-bold", "tanggal dicetak tebal");
ada(htmlJauh, "Sisa 25 hari", "lencana hitung hari tampil");
ada(htmlJauh, WARNA.netral, "nada netral memakai warna tenang");
ok(!htmlJauh.includes(WARNA.terlambat), "nada netral bukan warna peringatan");
ada(htmlJauh, jauh.aksesibilitas, "kalimat aksesibilitas ikut tercetak");
ada(htmlJauh, "aria-label", "penanda dibaca pembaca layar");
bersih(htmlJauh, "tampilan netral");

const htmlTerlambat = renderToStaticMarkup(
  <TampilanJatuhTempo tampilan={ringkasJatuhTempo(baris("didanai"), DIDANAI + 33 * HARI)} />,
);
ada(htmlTerlambat, "Terlambat 3 hari", "keterlambatan terbaca jelas");
ada(htmlTerlambat, WARNA.terlambat, "keterlambatan memakai merah");
ada(htmlTerlambat, "border-red-200", "lencana keterlambatan memakai warna merah");
bersih(htmlTerlambat, "tampilan terlambat");

const htmlSegera = renderToStaticMarkup(
  <TampilanJatuhTempo tampilan={ringkasJatuhTempo(baris("didanai"), DIDANAI + 28 * HARI)} />,
);
ada(htmlSegera, "Sisa 2 hari", "jatuh tempo dekat terbaca");
ada(htmlSegera, WARNA.segera, "jatuh tempo dekat memakai kuning");
bersih(htmlSegera, "tampilan segera");

const htmlHariIni = renderToStaticMarkup(
  <TampilanJatuhTempo tampilan={ringkasJatuhTempo(baris("didanai"), DIDANAI + 30 * HARI)} />,
);
ada(htmlHariIni, "Jatuh tempo hari ini", "hari jatuh tempo disebut eksplisit");

const htmlLunas = renderToStaticMarkup(
  <TampilanJatuhTempo tampilan={ringkasJatuhTempo(baris("lunas"), DIDANAI + 40 * HARI)} />,
);
ada(htmlLunas, "Sudah lunas", "pinjaman lunas tidak dihitung hari");
ada(htmlLunas, "border-emerald-200", "lencana lunas memakai warna hijau");

const htmlBelum = renderToStaticMarkup(
  <TampilanJatuhTempo
    tampilan={ringkasJatuhTempo({ ...baris("diajukan", null), didanaiPada: null }, DIDANAI)}
  />,
);
ada(htmlBelum, "Belum didanai", "belum didanai ditulis apa adanya");
ada(htmlBelum, "—", "tanggal kosong memakai tanda pisah");
bersih(htmlBelum, "tampilan belum didanai");

// ===== 2. Perataan & versi ringkas =====
const htmlKanan = renderToStaticMarkup(<TampilanJatuhTempo tampilan={jauh} align="right" />);
ada(htmlKanan, "items-end", "align right meratakan ke kanan");

const htmlRingkas = renderToStaticMarkup(<TampilanJatuhTempoRingkas tampilan={jauh} />);
ada(htmlRingkas, jauh.teks, "versi ringkas tetap menampilkan tanggal");
ada(htmlRingkas, "Sisa 25 hari", "versi ringkas menampilkan hitung hari");
bersih(htmlRingkas, "versi ringkas");

// ===== 3. Indeks kepercayaan =====
const rajin = hitungKepercayaan(
  riwayatDariPinjaman(
    [1, 2, 3].map(() => ({
      status: "lunas",
      didanaiPada: DIDANAI,
      tenorHari: 30,
      lunasPada: DIDANAI + 10 * HARI,
    })),
    { sekarang: DIDANAI + 60 * HARI, dataDiriLengkap: true, punyaKodePeminjam: true },
  ),
);
eq(rajin.tingkat, "kuat", "tiga pelunasan tepat waktu → tingkat kuat");
const htmlKuat = renderToStaticMarkup(<BadgeKepercayaan kepercayaan={rajin} />);
ada(htmlKuat, rajin.label, "label tingkat tampil");
ada(htmlKuat, `${rajin.skor}/100`, "skor tampil sebagai angka");
ada(htmlKuat, "border-emerald-200", "tingkat kuat memakai warna hijau");
ada(htmlKuat, "3 pinjaman lunas tepat waktu", "dasar penilaian ada di tooltip");
ada(htmlKuat, "bukan skor kredit lembaga", "tooltip menegaskan ini bukan skor kredit");
ok(!htmlKuat.includes(rajin.ringkas), "tanpa tampilkanRingkas tidak ada baris angka");
bersih(htmlKuat, "badge kuat");

const htmlRingkasKeyakinan = renderToStaticMarkup(
  <BadgeKepercayaan kepercayaan={rajin} tampilkanRingkas />,
);
ada(htmlRingkasKeyakinan, rajin.ringkas, "baris angka pendukung tampil saat diminta");
ada(htmlRingkasKeyakinan, "3 tepat waktu", "ringkasan menyebut jumlah tepat waktu");

const baru = hitungKepercayaan(
  riwayatDariPinjaman([{ status: "diajukan" }], {
    sekarang: DIDANAI,
    dataDiriLengkap: false,
    punyaKodePeminjam: false,
  }),
);
const htmlBaru = renderToStaticMarkup(<BadgeKepercayaan kepercayaan={baru} tampilkanRingkas />);
ada(htmlBaru, "Nasabah baru", "peminjam tanpa riwayat tampil sebagai nasabah baru");
ada(htmlBaru, "border-slate-200", "tingkat baru memakai warna netral");
ok(!htmlBaru.includes("border-red-200"), "nasabah baru tidak diberi warna peringatan");
ada(htmlBaru, "Data diri belum lengkap", "kekurangan data diri terlihat");
bersih(htmlBaru, "badge baru");

const menunggak = hitungKepercayaan(
  riwayatDariPinjaman([{ status: "didanai", didanaiPada: DIDANAI, tenorHari: 30 }], {
    sekarang: DIDANAI + 40 * HARI,
    dataDiriLengkap: true,
    punyaKodePeminjam: true,
  }),
);
const htmlPerhatian = renderToStaticMarkup(<BadgeKepercayaan kepercayaan={menunggak} />);
ada(htmlPerhatian, "Perlu perhatian", "tunggakan tampil sebagai perlu perhatian");
ada(htmlPerhatian, "border-red-200", "perlu perhatian memakai warna merah");
ada(htmlPerhatian, "lewat jatuh tempo", "sebab penilaian disebut");
bersih(htmlPerhatian, "badge perlu perhatian");

// ===== 4. Tidak ada data identitas ikut tercetak =====
const seluruhHtml = [htmlKuat, htmlRingkasKeyakinan, htmlBaru, htmlPerhatian].join("\n");
for (const rahasia of ["3201234567890003", "1234567890", "628123456791"]) {
  ok(!seluruhHtml.includes(rahasia), `tidak memuat data identitas (${rahasia.slice(0, 4)}…)`);
}
ok(!/nik|rekening|whatsapp/i.test(seluruhHtml), "tidak menyebut kunci data identitas");

console.log(`\nBadgeKepercayaan.render: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
