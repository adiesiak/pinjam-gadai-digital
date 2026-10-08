/** Run: bun src/lib/jenisPengajuan.test.ts */
import {
  JENIS_PENGAJUAN,
  JENIS_PENGAJUAN_AWAL,
  jenisPengajuanAktif,
  jenisPengajuanDari,
  jenisPengajuanUntukTab,
} from "./jenisPengajuan";

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    passed += 1;
  } else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// Daftar jenis: tiga baris, urut pinjaman → gadai → kredit, id unik.
eq(JENIS_PENGAJUAN.length, 3, "ada tiga jenis pengajuan");
eq(
  JENIS_PENGAJUAN.map((j) => j.id).join(","),
  "pinjaman,gadai,kredit",
  "urutan dropdown pinjaman → gadai → kredit",
);
eq(
  new Set(JENIS_PENGAJUAN.map((j) => j.id)).size,
  JENIS_PENGAJUAN.length,
  "id jenis unik",
);

// Tiap baris punya label, judul, keterangan, dan teks CTA yang terisi.
for (const jenis of JENIS_PENGAJUAN) {
  eq(jenis.label.trim().length > 0, true, `label ${jenis.id} terisi`);
  eq(jenis.judul.trim().length > 0, true, `judul ${jenis.id} terisi`);
  eq(jenis.hint.trim().length > 0, true, `keterangan ${jenis.id} terisi`);
  eq(jenis.label !== jenis.judul, true, `label dan judul ${jenis.id} berbeda`);
  eq(jenis.cta.startsWith("Buat pengajuan "), true, `CTA ${jenis.id} diawali "Buat pengajuan "`);
}
eq(
  new Set(JENIS_PENGAJUAN.map((j) => j.cta)).size,
  JENIS_PENGAJUAN.length,
  "teks CTA tiap jenis berbeda",
);
// CTA harus menamai produknya supaya pemakai tahu formulir apa yang terbuka.
eq(JENIS_PENGAJUAN[0].cta.includes("pinjaman"), true, "CTA pinjaman menyebut pinjaman");
eq(JENIS_PENGAJUAN[1].cta.includes("gadai"), true, "CTA gadai menyebut gadai");
eq(JENIS_PENGAJUAN[2].cta.includes("kredit barang"), true, "CTA kredit menyebut kredit barang");

// Jenis bawaan harus salah satu jenis yang ada, dan sama dengan baris pertama
// yang dipakai pemilih sebagai fallback.
eq(
  JENIS_PENGAJUAN.some((j) => j.id === JENIS_PENGAJUAN_AWAL),
  true,
  "jenis bawaan ada di daftar",
);
eq(JENIS_PENGAJUAN_AWAL, JENIS_PENGAJUAN[0].id, "jenis bawaan = jenis pertama");

// Nilai dropdown → jenis, hanya untuk nilai yang dikenal.
for (const jenis of JENIS_PENGAJUAN) {
  eq(jenisPengajuanDari(jenis.id), jenis.id, `jenisPengajuanDari("${jenis.id}") sah`);
}
eq(jenisPengajuanDari(""), null, "nilai kosong ditolak");
eq(jenisPengajuanDari("entah"), null, "nilai tak dikenal ditolak");
eq(jenisPengajuanDari("PINJAMAN"), null, "nilai beda huruf besar ditolak");
eq(jenisPengajuanDari(" gadai "), null, "nilai berspasi ditolak");

// Pemilih tidak pernah menampilkan keadaan kosong: nilai tak dikenal jatuh ke
// jenis pertama.
eq(jenisPengajuanAktif("gadai").id, "gadai", "jenis aktif mengikuti nilai");
eq(jenisPengajuanAktif("").id, JENIS_PENGAJUAN_AWAL, "nilai kosong jatuh ke jenis pertama");
eq(jenisPengajuanAktif("entah").id, JENIS_PENGAJUAN_AWAL, "nilai tak dikenal jatuh ke jenis pertama");
eq(
  jenisPengajuanAktif("entah").label,
  JENIS_PENGAJUAN[0].label,
  "label fallback = label jenis pertama",
);

// Tab dashboard → jenis pengajuan yang dibuka CTA "Buat pengajuan baru".
eq(jenisPengajuanUntukTab("pinjaman"), "pinjaman", "tab pinjaman → pinjaman");
eq(jenisPengajuanUntukTab("jadwal"), "pinjaman", "tab jadwal angsuran → pinjaman");
eq(jenisPengajuanUntukTab("gadai"), "gadai", "tab gadai → gadai");
eq(jenisPengajuanUntukTab("kredit"), null, "tab kredit sudah dihapus → jenis bawaan");
eq(jenisPengajuanUntukTab("kontrak"), null, "tab kontrak tidak memilih jenis");
eq(jenisPengajuanUntukTab("riwayat"), null, "tab riwayat tidak memilih jenis");
eq(jenisPengajuanUntukTab("form"), null, "tab form itu sendiri tidak memilih jenis");
eq(jenisPengajuanUntukTab(""), null, "tab kosong tidak memilih jenis");
eq(jenisPengajuanUntukTab("entah"), null, "tab tak dikenal tidak memilih jenis");
// Tiap hasil pemetaan harus jenis yang benar-benar ada di daftar.
for (const tab of ["pinjaman", "jadwal", "gadai"]) {
  const jenis = jenisPengajuanUntukTab(tab);
  eq(
    jenis !== null && JENIS_PENGAJUAN.some((j) => j.id === jenis),
    true,
    `jenis untuk tab ${tab} ada di daftar`,
  );
}

console.log(`jenisPengajuan.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
