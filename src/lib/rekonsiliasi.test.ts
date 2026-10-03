/** Run: bun src/lib/rekonsiliasi.test.ts */
import { bandingkanPendana, type MetrikPendana } from "./rekonsiliasi";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  }
}
function eqJson(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${b}, got ${a}`);
  }
}

function metrik(nilai: Partial<MetrikPendana> = {}): MetrikPendana {
  return {
    jumlahPinjaman: 0,
    totalDisalurkan: 0,
    saldoBerjalan: 0,
    totalBunga: 0,
    keuntunganPendana: 0,
    keuntunganAdmin: 0,
    ...nilai,
  };
}

const robert = metrik({
  jumlahPinjaman: 6,
  totalDisalurkan: 5_500_000,
  saldoBerjalan: 4_500_000,
  totalBunga: 1_650_000,
  keuntunganPendana: 1_292_500,
  keuntunganAdmin: 357_500,
});

// 1. Permukaan identik → semua cocok.
const cocok = bandingkanPendana(
  [{ nama: "Robert", email: "robert@pindai.test", metrik: robert }],
  [{ nama: "Robert", metrik: robert }],
);
eq(cocok.rows.length, 1, "satu pendana");
eq(cocok.rows[0]?.status, "cocok", "metrik sama → cocok");
eq(cocok.ringkasan.cocok, 1, "ringkasan cocok = 1");
eq(cocok.ringkasan.selisih, 0, "ringkasan selisih = 0");

// 2. Satu metrik berbeda → selisih, dan metrik itu yang ditandai.
const selisih = bandingkanPendana(
  [{ nama: "Robert", metrik: robert }],
  [
    {
      nama: "Robert",
      metrik: metrik({ ...robert, keuntunganPendana: 1_292_499 }),
    },
  ],
);
eq(selisih.rows[0]?.status, "selisih", "satu angka beda → selisih");
eqJson(selisih.rows[0]?.selisih, ["keuntunganPendana"], "metrik selisih ditandai");
eq(selisih.ringkasan.selisih, 1, "ringkasan selisih = 1");

// 3. Pinjaman berpendana tanpa akun → tanpa_akun (muncul di rekap saja).
const tanpaAkun = bandingkanPendana(
  [],
  [{ nama: "Khoirul Anwar", metrik: metrik({ jumlahPinjaman: 1, totalBunga: 300_000 }) }],
);
eq(tanpaAkun.rows[0]?.status, "tanpa_akun", "rekap tanpa akun panel");
eq(tanpaAkun.rows[0]?.panel, null, "sisi panel null");
eq(tanpaAkun.ringkasan.tanpaAkun, 1, "ringkasan tanpa akun = 1");

// 4. Akun dengan posisi tanpa baris rekap → tanpa_rekap.
const tanpaRekap = bandingkanPendana(
  [{ nama: "Asep Firman Hanafi", metrik: metrik({ jumlahPinjaman: 5 }) }],
  [],
);
eq(tanpaRekap.rows[0]?.status, "tanpa_rekap", "panel tanpa rekap");
eq(tanpaRekap.ringkasan.tanpaRekap, 1, "ringkasan tanpa rekap = 1");

// 5. Akun tanpa posisi dan tanpa pasangan rekap diabaikan (tidak jadi baris).
const diabaikan = bandingkanPendana(
  [{ nama: "Akun Kosong", metrik: metrik() }],
  [],
);
eq(diabaikan.rows.length, 0, "akun kosong tanpa rekap disembunyikan");
eq(diabaikan.ringkasan.jumlahPendana, 0, "ringkasan tidak menghitung akun kosong");

// 6. Pencocokan cadangan lewat email bila nama tampil berbeda (nama akun vs email).
const lewatEmail = bandingkanPendana(
  [{ nama: "Robert S.", email: "robert@pindai.test", metrik: robert }],
  [{ nama: "robert@pindai.test", metrik: robert }],
);
eq(lewatEmail.rows.length, 1, "cocok lewat email → satu baris");
eq(lewatEmail.rows[0]?.status, "cocok", "email menyatukan dua sumber");

// 7. Ringkasan gabungan + baris yang butuh perhatian diurutkan lebih dulu.
const gabungan = bandingkanPendana(
  [
    { nama: "Robert", metrik: robert },
    { nama: "Baru", metrik: metrik({ jumlahPinjaman: 2 }) },
  ],
  [
    { nama: "Robert", metrik: robert },
    { nama: "Tanpa Akun", metrik: metrik({ jumlahPinjaman: 1 }) },
  ],
);
eqJson(gabungan.ringkasan, {
  jumlahPendana: 3,
  cocok: 1,
  selisih: 0,
  tanpaRekap: 1,
  tanpaAkun: 1,
}, "ringkasan gabungan");
eq(gabungan.rows[2]?.status, "cocok", "baris cocok diletakkan paling bawah");
eq(gabungan.rows[0]?.status !== "cocok", true, "baris perhatian di atas");

console.log(`rekonsiliasi.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
