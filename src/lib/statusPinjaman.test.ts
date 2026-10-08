/** Run: bun src/lib/statusPinjaman.test.ts */
import {
  diTahapTinjauan,
  keStatusTersimpan,
  labelStatusPinjaman,
  LABEL_STATUS_PINJAMAN,
  nominalDisetujui,
  nominalTerkunci,
  pesanPerubahanStatus,
  statusKanonik,
  STATUS_PINJAMAN,
  TEMPLATE_STATUS_DEFAULT,
  validasiUbahStatus,
  type StatusPinjaman,
} from "./statusPinjaman";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
function ok(hasil: { ok: boolean }, label: string) {
  eq(hasil.ok, true, label);
}
function gagal(hasil: { ok: boolean; alasan?: string }, pola: RegExp, label: string) {
  eq(hasil.ok, false, `${label} (ditolak)`);
  const alasan = (hasil as { alasan?: string }).alasan ?? "";
  eq(pola.test(alasan), true, `${label} (alasan cocok)`);
}

// ===== validasiUbahStatus =====

// Alur normal.
ok(validasiUbahStatus("diajukan", "sedang_direview"), "diajukan → review");
ok(validasiUbahStatus("sedang_direview", "disetujui"), "review → disetujui");
ok(validasiUbahStatus("disetujui", "didanai"), "disetujui → didanai");
ok(validasiUbahStatus("didanai", "lunas"), "didanai → lunas");

// Melompat tahap tetap boleh — admin tidak dipaksa mengikuti urutan.
ok(validasiUbahStatus("diajukan", "disetujui"), "lompat diajukan → disetujui");
ok(validasiUbahStatus("didanai", "ditolak"), "tarik didanai → ditolak");

// Sejak status digabung menjadi empat, "Ditinjau" adalah tahap kerja biasa:
// mengembalikan pinjaman ke tahap tinjauan DIPERBOLEHKAN (mis. pengajuan
// dibuka ulang), baik lewat ejaan kanonik maupun ejaan tersimpan lamanya.
ok(validasiUbahStatus("sedang_direview", "diajukan"), "kembali ke tinjauan (ejaan lama)");
ok(validasiUbahStatus("diajukan", "ditinjau"), "kembali ke tinjauan (kanonik)");
ok(validasiUbahStatus("disetujui", "ditinjau"), "kanonik ditinjau dari tahap persetujuan");
// Menargetkan tahap yang ejaan tersimpannya sama tetap ditolak — "ditinjau"
// tersimpan sebagai `sedang_direview`.
gagal(
  validasiUbahStatus("sedang_direview", "ditinjau"),
  /sudah berstatus/i,
  "ditinjau pada baris yang sudah di tahap tinjauan",
);

// ===== Pemetaan status kanonik ↔ tersimpan =====

// Empat status yang dipakai aplikasi.
eq(STATUS_PINJAMAN.length, 4, "tepat empat status pinjaman");
eq(
  STATUS_PINJAMAN.join(","),
  "ditinjau,didanai,ditolak,lunas",
  "empat status: ditinjau, disalurkan (didanai), ditolak, lunas",
);
// Tiga ejaan lama adalah satu tahap: "Ditinjau".
for (const s of ["diajukan", "sedang_direview", "disetujui"]) {
  eq(statusKanonik(s), "ditinjau", `${s} → ditinjau`);
  eq(diTahapTinjauan(s), true, `${s} ada di tahap tinjauan`);
  eq(labelStatusPinjaman(s), "Ditinjau", `${s} berlabel Ditinjau`);
}
eq(statusKanonik("didanai"), "didanai", "didanai tetap didanai");
eq(labelStatusPinjaman("didanai"), "Disalurkan", "didanai berlabel Disalurkan");
eq(labelStatusPinjaman("lunas"), "Lunas", "lunas berlabel Lunas");
// "ditinjau" (kanonik) tersimpan sebagai ejaan lama yang sama artinya.
eq(keStatusTersimpan("ditinjau"), "sedang_direview", "ditinjau → sedang_direview");
eq(keStatusTersimpan("didanai"), "didanai", "didanai tetap didanai");
eq(keStatusTersimpan("lunas"), "lunas", "lunas tetap lunas");
// Ejaan di luar daftar tidak pernah dianggap tahap tinjauan.
eq(statusKanonik("entah"), null, "ejaan asing tidak dikenali");
eq(diTahapTinjauan("entah"), false, "ejaan asing bukan tinjauan");

// Pinjaman lunas terkunci.
gagal(validasiUbahStatus("lunas", "didanai"), /lunas/i, "lunas terkunci");
gagal(validasiUbahStatus("lunas", "ditolak"), /lunas/i, "lunas tidak bisa ditolak");

// Status sama persis ditolak — mencegah pesan WhatsApp palsu & audit kosong.
gagal(validasiUbahStatus("disetujui", "disetujui"), /sudah berstatus/i, "status sama");

// Catatan TIDAK lagi wajib: pemilik produk meminta admin bisa memindahkan
// status tanpa mengisi alasan apa pun. Yang diperiksa hanya statusnya —
// jejak audit dan kabar WhatsApp tetap ditulis oleh jalur penyimpanannya.
ok(validasiUbahStatus("diajukan", "disetujui"), "perubahan tanpa catatan tetap sah");
ok(validasiUbahStatus("sedang_direview", "didanai"), "perubahan tanpa catatan (2) tetap sah");

// Status tak dikenal ditolak.
gagal(validasiUbahStatus("diajukan", "entah"), /tidak dikenali/i, "status asing");

// Setiap status punya label.
for (const s of Object.keys(LABEL_STATUS_PINJAMAN) as StatusPinjaman[]) {
  eq(typeof LABEL_STATUS_PINJAMAN[s] === "string" && LABEL_STATUS_PINJAMAN[s].length > 0, true, `label ${s}`);
}

// ===== nominalDisetujui =====

// Tanpa usulan admin: pakai nominal pengajuan.
eq(nominalDisetujui(1_000_000, null).ok, true, "tanpa usulan ok");
eq(
  (nominalDisetujui(1_000_000, null) as { nilai: number }).nilai,
  1_000_000,
  "tanpa usulan = nominal pengajuan",
);
eq(
  (nominalDisetujui(1_000_000, undefined) as { nilai: number }).nilai,
  1_000_000,
  "undefined = nominal pengajuan",
);

// ACC sebagian — kasus utama: diajukan 1 jt, disetujui 500 rb.
eq(
  (nominalDisetujui(1_000_000, 500_000) as { nilai: number }).nilai,
  500_000,
  "ACC sebagian 500rb",
);
// ACC penuh eksplisit.
eq(
  (nominalDisetujui(1_000_000, 1_000_000) as { nilai: number }).nilai,
  1_000_000,
  "ACC penuh eksplisit",
);
// Tidak boleh melebihi pengajuan.
gagal(nominalDisetujui(1_000_000, 1_500_000), /melebihi/i, "melebihi pengajuan");
// Harus rupiah bulat positif.
gagal(nominalDisetujui(1_000_000, 0), /bulat positif/i, "nol ditolak");
gagal(nominalDisetujui(1_000_000, -5), /bulat positif/i, "negatif ditolak");
gagal(nominalDisetujui(1_000_000, 500_000.5), /bulat positif/i, "pecahan ditolak");
// Nominal pengajuan yang tidak valid.
gagal(nominalDisetujui(0, 100_000), /tidak valid/i, "pengajuan nol");
gagal(nominalDisetujui(-1, 100_000), /tidak valid/i, "pengajuan negatif");

// ===== nominalTerkunci =====

eq(nominalTerkunci("didanai"), true, "didanai terkunci");
eq(nominalTerkunci("lunas"), true, "lunas terkunci");
eq(nominalTerkunci("disetujui"), false, "disetujui belum terkunci");
eq(nominalTerkunci("diajukan"), false, "diajukan belum terkunci");

// ===== pesanPerubahanStatus =====

const pesan = pesanPerubahanStatus(TEMPLATE_STATUS_DEFAULT, {
  nama: "Rani",
  nomorReferensi: "PGD-1",
  statusLama: "diajukan",
  statusBaru: "disetujui",
  alasan: "dokumen lengkap",
  pokokDiajukan: 1_000_000,
  pokokDisetujui: 500_000,
  totalKewajiban: 650_000,
});
eq(pesan.includes("Rani"), true, "pesan memuat nama");
eq(pesan.includes("PGD-1"), true, "pesan memuat referensi");
// Label yang dikirim adalah salah satu dari EMPAT status aplikasi — ejaan
// lama `disetujui` tampil sebagai "Ditinjau".
eq(pesan.includes("Ditinjau"), true, "pesan memuat status");
eq(/Disetujui internal|Target tercapai/.test(pesan), false, "tanpa label tahap lama");
eq(pesan.includes("dokumen lengkap"), true, "pesan memuat alasan");
eq(pesan.includes("Rp 1.000.000"), true, "pesan memuat nominal diajukan");
eq(pesan.includes("Rp 500.000"), true, "pesan memuat nominal disetujui");
eq(pesan.includes("Rp 650.000"), true, "pesan memuat total kewajiban");
// Persetujuan sebagian dijelaskan eksplisit.
eq(/disetujui sebagian/i.test(pesan), true, "pesan menjelaskan ACC sebagian");
// Tidak ada placeholder yang tersisa.
eq(/\{[a-z]+\}/.test(pesan), false, "tanpa placeholder tersisa");

// ACC penuh: tanpa kalimat "sebagian".
const penuh = pesanPerubahanStatus(TEMPLATE_STATUS_DEFAULT, {
  nama: "Rani",
  nomorReferensi: "PGD-2",
  statusLama: "sedang_direview",
  statusBaru: "disetujui",
  alasan: "lengkap",
  pokokDiajukan: 1_000_000,
  pokokDisetujui: 1_000_000,
  totalKewajiban: 1_300_000,
});
eq(/sebagian/i.test(penuh), false, "ACC penuh tanpa kalimat sebagian");

// Penolakan: kewajiban tidak diketahui → tanda pisah, bukan "NaN".
const tolak = pesanPerubahanStatus(TEMPLATE_STATUS_DEFAULT, {
  nama: "Rani",
  nomorReferensi: "PGD-3",
  statusLama: "diajukan",
  statusBaru: "ditolak",
  alasan: "penghasilan belum memadai",
  pokokDiajukan: 1_000_000,
  pokokDisetujui: 1_000_000,
  totalKewajiban: null,
});
eq(tolak.includes("Ditolak"), true, "pesan penolakan memuat status");
eq(tolak.includes("NaN"), false, "tidak ada NaN");
eq(tolak.includes("penghasilan belum memadai"), true, "alasan penolakan terkirim");
eq(/sebagian/i.test(tolak), false, "penolakan tanpa kalimat sebagian");

// Nominal warisan non-bulat tetap menghasilkan teks, bukan galat.
const warisan = pesanPerubahanStatus(TEMPLATE_STATUS_DEFAULT, {
  nama: "Rani",
  nomorReferensi: "PGD-4",
  statusLama: "diajukan",
  statusBaru: "disetujui",
  alasan: "koreksi",
  pokokDiajukan: 1_000_000.5,
  pokokDisetujui: 1_000_000.5,
  totalKewajiban: null,
});
eq(warisan.includes("NaN"), false, "warisan non-bulat tetap aman");

console.log(`statusPinjaman.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
