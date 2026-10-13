/**
 * Uji model TAHAPAN KYC (murni, tanpa server).
 * Run: bun src/lib/kycTahapan.test.ts
 *
 * Yang dijaga:
 *  - setiap kekurangan yang bisa dihasilkan server (`kekuranganKyc`) punya tahap
 *    yang menanganinya — daftar "yang masih kurang" tidak boleh punya label yatim;
 *  - urutan & pemisahan tahap sesuai ketentuan (identitas, KTP, selfie,
 *    WhatsApp, alamat, informasi pendukung) dan tahap opsional tidak menghalangi;
 *  - galat per tahap memakai aturan yang SAMA dengan form data diri/server;
 *  - progres & tahap yang disarankan mengantar ke tempat yang benar, termasuk
 *    saat petugas meminta perbaikan dokumen;
 *  - NIK/rekening bisa ditampilkan bertopeng (tidak ada NIK utuh di ringkasan);
 *  - petunjuk foto memuat pencahayaan, fokus, dan kelengkapan sisi dokumen.
 */
import { kekuranganKyc } from "./kycStatus";
import {
  galatTahapKyc,
  kekuranganKlien,
  kekuranganLokalTahap,
  LABEL_SLOT_BERKAS,
  maskDigit,
  maskNik,
  maskRekening,
  maskWhatsApp,
  PETUNJUK_KTP,
  PETUNJUK_SELFIE,
  petunjukTahap,
  progresKyc,
  statusTahapKyc,
  tahapDariKekurangan,
  tahapDisarankan,
  TAHAPAN_KYC,
  tahapKyc,
  type BerkasKyc,
  type IdTahapKyc,
  type IsianKycLengkap,
  type OpsiStatusTahap,
} from "./kycTahapan";
import { persetujuanAktif, VERSI_PERSETUJUAN_KYC } from "./persetujuanKyc";

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
function ok(syarat: boolean, label: string) {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const ISIAN_KOSONG: IsianKycLengkap = {
  namaLengkap: "",
  nik: "",
  nomorWhatsApp: "",
  alamat: "",
  pekerjaan: "",
  penghasilan: "",
  sumberPenghasilan: "",
  namaBank: "",
  nomorRekening: "",
  catatanPeminjam: "",
  namaKontakDarurat: "",
  nomorKontakDarurat: "",
  hubunganKontakDarurat: "",
};

const BERKAS_KOSONG: BerkasKyc = { ktp: null, selfie: null, bukti: null };

const ISIAN_LENGKAP: IsianKycLengkap = {
  namaLengkap: "Rani Puspita",
  nik: "3271012345678901",
  nomorWhatsApp: "6281234567890",
  alamat: "Jalan Merdeka No. 10, Bandung",
  pekerjaan: "Karyawan swasta",
  penghasilan: "5.000.000",
  sumberPenghasilan: "Gaji bulanan",
  namaBank: "BCA",
  nomorRekening: "1234567890",
  catatanPeminjam: "",
  namaKontakDarurat: "Siti Rahayu",
  nomorKontakDarurat: "6281299887766",
  hubunganKontakDarurat: "Keluarga",
};

const BERKAS_LENGKAP: BerkasKyc = {
  ktp: "storage_ktp",
  selfie: "storage_selfie",
  bukti: "storage_bukti",
};

const OPSI_SIAP: OpsiStatusTahap = {
  kekurangan: [],
  perluPerbaikan: false,
  persetujuanAktif: true,
};

// ===== 1. Pemisahan tahap sesuai ketentuan =====
eq(
  TAHAPAN_KYC.map((t) => t.id).join(","),
  "persetujuan,identitas,ktp,selfie,whatsapp,alamat,darurat,pendukung",
  "urutan tahap: persetujuan → identitas → KTP → selfie → WhatsApp → alamat → kontak darurat → pendukung",
);
eq(TAHAPAN_KYC.length, 8, "delapan tahap pengisian (kontak darurat ditambahkan ke tujuh tahap lama)");
ok(
  TAHAPAN_KYC.filter((t) => !t.wajib).map((t) => t.id).join(",") === "alamat,darurat",
  "hanya alamat dan kontak darurat yang opsional (boleh dilewati)",
);
// NIK hanya ada di tahap identitas, tidak ikut tercampur ke tahap lain.
ok(
  TAHAPAN_KYC.filter((t) => t.isian.includes("nik")).map((t) => t.id).join(",") === "identitas",
  "NIK hanya diminta di tahap identitas",
);
ok(
  TAHAPAN_KYC.filter((t) => t.isian.includes("nomorWhatsApp"))
    .map((t) => t.id)
    .join(",") === "whatsapp",
  "nomor WhatsApp punya tahapnya sendiri",
);
ok(
  TAHAPAN_KYC.filter((t) => t.isian.includes("alamat")).map((t) => t.id).join(",") === "alamat",
  "alamat punya tahapnya sendiri",
);

// ===== 2. Pemetaan kekurangan server → tahap (tanpa label yatim) =====
for (const label of kekuranganKyc({})) {
  ok(tahapDariKekurangan(label) !== null, `kekurangan server "${label}" punya tahap`);
}
eq(tahapDariKekurangan("NIK 16 angka"), "identitas", "kekurangan NIK → tahap identitas");
eq(tahapDariKekurangan("Foto KTP"), "ktp", "kekurangan foto KTP → tahap KTP");
eq(tahapDariKekurangan("Selfie dengan KTP"), "selfie", "kekurangan selfie → tahap selfie");
eq(tahapDariKekurangan("Bukti penghasilan"), "pendukung", "kekurangan bukti → tahap pendukung");
eq(tahapDariKekurangan("label asing"), null, "label asing tidak dipetakan ke tahap mana pun");

// ===== 3. Status per tahap saat masih kosong =====
eq(
  statusTahapKyc("persetujuan", ISIAN_KOSONG, BERKAS_KOSONG, {
    ...OPSI_SIAP,
    persetujuanAktif: false,
  }),
  "belum",
  "tahap persetujuan belum selesai sebelum disetujui",
);
eq(statusTahapKyc("identitas", ISIAN_KOSONG, BERKAS_KOSONG, OPSI_SIAP), "belum", "identitas belum diisi");
eq(statusTahapKyc("ktp", ISIAN_KOSONG, BERKAS_KOSONG, OPSI_SIAP), "belum", "foto KTP belum ada");
eq(statusTahapKyc("selfie", ISIAN_KOSONG, BERKAS_KOSONG, OPSI_SIAP), "belum", "selfie belum ada");
eq(
  statusTahapKyc("alamat", ISIAN_KOSONG, BERKAS_KOSONG, OPSI_SIAP),
  "belum",
  "alamat kosong tetap dilaporkan belum diisi (bukan pura-pura siap)",
);
{
  const progres = progresKyc(ISIAN_KOSONG, BERKAS_KOSONG, {
    ...OPSI_SIAP,
    persetujuanAktif: false,
  });
  eq(
    progres.selesai,
    2,
    "hanya dua tahap opsional (alamat & kontak darurat) yang tidak menghalangi saat semua kosong",
  );
  eq(progres.total, 8, "total tahap dilaporkan");
  eq(progres.persen, 25, "persen kesiapan dihitung dari tahap, bukan dikarang");
  eq(progres.tahapBerikutnya, "persetujuan", "lanjutkan proses mulai dari persetujuan");
}

// ===== 4. Status sebagian diisi =====
{
  const separuh: IsianKycLengkap = { ...ISIAN_LENGKAP, nomorWhatsApp: "" };
  eq(
    statusTahapKyc("whatsapp", separuh, BERKAS_KOSONG, OPSI_SIAP),
    "belum",
    "nomor WhatsApp kosong dilaporkan belum diisi",
  );
  eq(statusTahapKyc("identitas", separuh, BERKAS_KOSONG, OPSI_SIAP), "lengkap", "identitas siap");
  eq(
    statusTahapKyc("pendukung", ISIAN_LENGKAP, { ...BERKAS_LENGKAP, bukti: null }, OPSI_SIAP),
    "sebagian",
    "informasi pendukung terisi sebagian (bukti belum ada)",
  );
}

// ===== 5. Isian salah → perlu diperbaiki, dengan pesan dari aturan server =====
{
  const galat = galatTahapKyc("identitas", { ...ISIAN_KOSONG, nik: "123" });
  eq(galat.length, 2, "identitas kosong + NIK salah melaporkan dua hal");
  ok(
    galat.some((g) => /16 angka/.test(g.pesan)),
    "pesan NIK memakai aturan yang sama dengan form/server",
  );
  eq(
    statusTahapKyc("identitas", { ...ISIAN_LENGKAP, nik: "123" }, BERKAS_KOSONG, OPSI_SIAP),
    "perlu-diperbaiki",
    "NIK salah membuat tahap identitas perlu diperbaiki",
  );
  ok(
    galatTahapKyc("whatsapp", { ...ISIAN_LENGKAP, nomorWhatsApp: "0812" }).some((g) =>
      /62/.test(g.pesan),
    ),
    "nomor tanpa kode 62 diberi tahu aturannya",
  );
  // "abc" terbaca sebagai BELUM diisi oleh aturan yang sama dengan server
  // (digit diekstrak lebih dulu), jadi yang muncul adalah kekurangan — bukan
  // galat format yang mengarang aturan baru.
  ok(
    kekuranganKlien({ ...ISIAN_LENGKAP, penghasilan: "abc" }, BERKAS_LENGKAP, null).some((label) =>
      /Penghasilan/.test(label),
    ),
    "penghasilan bukan angka dilaporkan sebagai kekurangan",
  );
  eq(
    statusTahapKyc("pendukung", { ...ISIAN_LENGKAP, penghasilan: "abc" }, BERKAS_LENGKAP, OPSI_SIAP),
    "sebagian",
    "tahap pendukung belum siap saat penghasilan tidak terbaca",
  );
  ok(
    galatTahapKyc("pendukung", { ...ISIAN_LENGKAP, sumberPenghasilan: "" }).some((g) =>
      /Sumber penghasilan/.test(g.pesan),
    ),
    "sumber penghasilan wajib untuk mengajukan",
  );
  ok(
    kekuranganLokalTahap("ktp", ISIAN_LENGKAP, BERKAS_KOSONG).includes("Foto KTP"),
    "kekurangan lokal tahap KTP menyebut foto KTP",
  );
  // Galat tahap lain tidak ikut bocor ke tahap ini.
  const hanyaIdentitas = galatTahapKyc("identitas", { ...ISIAN_KOSONG, nik: "123" }).map(
    (g) => g.kunci,
  );
  ok(
    !hanyaIdentitas.includes("nomorWhatsApp") && !hanyaIdentitas.includes("bukti"),
    "galat tahap identitas tidak membocorkan isian tahap lain",
  );
}

// ===== 6. Alamat opsional: kosong tidak menghalangi, salah tetap ditandai =====
{
  const tanpaAlamat: IsianKycLengkap = { ...ISIAN_LENGKAP, alamat: "", pekerjaan: "" };
  const progres = progresKyc(tanpaAlamat, BERKAS_LENGKAP, OPSI_SIAP);
  eq(progres.selesai, 8, "alamat kosong tidak menghalangi kesiapan pengajuan");
  eq(progres.persen, 100, "semua tahap siap walau alamat dilewati");
  eq(
    statusTahapKyc("alamat", { ...ISIAN_LENGKAP, alamat: "Jl." }, BERKAS_LENGKAP, OPSI_SIAP),
    "perlu-diperbaiki",
    "alamat terlalu pendek tetap ditandai salah",
  );
}

// ===== 6b. Kontak darurat opsional: kosong aman, salah nilai tetap ditandai,
// dan tidak pernah menahan pengajuan =====
{
  const isianTanpaDarurat: IsianKycLengkap = {
    ...ISIAN_LENGKAP,
    namaKontakDarurat: "",
    nomorKontakDarurat: "",
    hubunganKontakDarurat: "",
  };
  eq(
    statusTahapKyc("darurat", isianTanpaDarurat, BERKAS_LENGKAP, OPSI_SIAP),
    "belum",
    "kontak darurat kosong dilaporkan belum diisi, bukan pura-pura siap",
  );
  eq(
    progresKyc(isianTanpaDarurat, BERKAS_LENGKAP, OPSI_SIAP).persen,
    100,
    "kontak darurat yang dikosongkan tidak menahan pengajuan",
  );
  eq(
    kekuranganKlien(isianTanpaDarurat, BERKAS_LENGKAP, 5_000_000).length,
    0,
    "kontak darurat tidak pernah masuk kekurangan wajib",
  );
  eq(
    statusTahapKyc(
      "darurat",
      { ...ISIAN_LENGKAP, nomorKontakDarurat: "0812" },
      BERKAS_LENGKAP,
      OPSI_SIAP,
    ),
    "perlu-diperbaiki",
    "nomor kontak darurat tanpa kode 62 ditandai salah",
  );
  ok(
    galatTahapKyc("darurat", { ...ISIAN_LENGKAP, nomorKontakDarurat: "0812" }).some((g) =>
      /62/.test(g.pesan),
    ),
    "pesan galat nomor kontak darurat menyebut aturan 62…",
  );
  ok(
    galatTahapKyc("darurat", { ...ISIAN_LENGKAP, namaKontakDarurat: "Al" }).some(
      (g) => g.kunci === "namaKontakDarurat",
    ),
    "nama kontak darurat yang terlalu pendek ditandai pada kolomnya sendiri",
  );
}

// ===== 7. Lengkap & konsisten dengan server =====
{
  const statuses = TAHAPAN_KYC.map((t) =>
    statusTahapKyc(t.id, ISIAN_LENGKAP, BERKAS_LENGKAP, OPSI_SIAP),
  );
  ok(
    statuses.every((s) => s === "lengkap"),
    `semua tahap siap saat isian & berkas lengkap (dapat: ${statuses.join(",")})`,
  );
  eq(
    kekuranganKlien(ISIAN_LENGKAP, BERKAS_LENGKAP, 5_000_000).length,
    0,
    "kekurangan versi klien kosong — sama dengan kelengkapan server",
  );
  const kurangKlien = kekuranganKlien(ISIAN_KOSONG, BERKAS_KOSONG, null);
  ok(
    kurangKlien.every((label) => tahapDariKekurangan(label) !== null),
    "setiap kekurangan versi klien bisa diantar ke tahapnya",
  );
}

// ===== 8. Petugas minta perbaikan → tahap dokumen ditandai & disarankan =====
{
  const opsi: OpsiStatusTahap = { ...OPSI_SIAP, perluPerbaikan: true };
  eq(
    statusTahapKyc("ktp", ISIAN_LENGKAP, BERKAS_LENGKAP, opsi),
    "perlu-diperbaiki",
    "foto KTP ditandai perlu diperbaiki saat petugas memintanya",
  );
  eq(
    statusTahapKyc("selfie", ISIAN_LENGKAP, BERKAS_LENGKAP, opsi),
    "perlu-diperbaiki",
    "selfie ikut ditandai",
  );
  eq(
    statusTahapKyc("identitas", ISIAN_LENGKAP, BERKAS_LENGKAP, opsi),
    "lengkap",
    "tahap identitas yang sudah benar tidak ikut ditandai",
  );
  eq(
    tahapDisarankan("NEEDS_CORRECTION", ISIAN_LENGKAP, BERKAS_LENGKAP, opsi),
    "ktp",
    "perbaikan dokumen mengantar langsung ke tahap KTP",
  );
  eq(
    tahapDisarankan("IN_PROGRESS", ISIAN_KOSONG, BERKAS_KOSONG, {
      ...OPSI_SIAP,
      persetujuanAktif: false,
    }),
    "persetujuan",
    "proses baru dimulai dari persetujuan",
  );
  eq(
    tahapDisarankan("IN_PROGRESS", { ...ISIAN_LENGKAP, nomorWhatsApp: "" }, BERKAS_LENGKAP, OPSI_SIAP),
    "whatsapp",
    "tahap yang belum selesai dipilih untuk dilanjutkan",
  );
}

// ===== 9. Berkas yang belum diunggah dilaporkan per slot =====
{
  const galat = galatTahapKyc("ktp", ISIAN_LENGKAP, BERKAS_KOSONG);
  eq(galat.length, 1, "satu berkas hilang melaporkan satu hal");
  eq(galat[0].kunci, "ktp", "galat menunjuk slot berkas KTP");
  ok(galat[0].pesan.includes(LABEL_SLOT_BERKAS.ktp), "pesan memakai label slot bersama");
  eq(
    galatTahapKyc("selfie", ISIAN_LENGKAP, BERKAS_KOSONG)[0].pesan,
    "Selfie dengan KTP belum diunggah.",
    "pesan selfie jelas",
  );
  eq(
    galatTahapKyc("pendukung", ISIAN_LENGKAP, BERKAS_KOSONG).filter((g) => g.kunci === "bukti")
      .length,
    1,
    "bukti penghasilan masuk ke tahap pendukung",
  );
}

// ===== 10. Topeng nilai sensitif =====
eq(maskNik("3271012345678901"), "••••••••••••8901", "NIK ditampilkan bertopeng");
eq(maskNik("3271012345678901").replace(/\D/g, ""), "8901", "hanya 4 digit terakhir yang tampak");
eq(maskRekening("1234567890").replace(/\D/g, ""), "7890", "rekening hanya menyisakan 4 digit terakhir");
eq(maskWhatsApp("6281234567890").replace(/\D/g, ""), "7890", "nomor WhatsApp bertopeng");
eq(maskDigit(""), "—", "nilai kosong tidak menampilkan titik yang membingungkan");
eq(maskDigit("12"), "••", "nilai lebih pendek dari topeng ditutup seluruhnya");
ok(!maskNik("3271012345678901").includes("327101"), "NIK utuh tidak pernah ditampilkan");

// ===== 11. Petunjuk foto: pencahayaan, fokus, seluruh sisi =====
{
  const teksKtp = PETUNJUK_KTP.map((p) => `${p.judul} ${p.isi}`).join(" ");
  ok(/cahaya/i.test(teksKtp), "petunjuk KTP menjelaskan pencahayaan");
  ok(/kilau/i.test(teksKtp), "petunjuk KTP memperingatkan kilau lampu");
  ok(/fokus/i.test(teksKtp), "petunjuk KTP menjelaskan fokus");
  ok(/terbaca/i.test(teksKtp), "petunjuk KTP menuntut teks terbaca");
  ok(/seluruh sisi|keempat sudut/i.test(teksKtp), "petunjuk KTP menuntut seluruh sisi dokumen");
  ok(/5 MB/.test(teksKtp), "petunjuk KTP menyebut batas ukuran");
  const teksSelfie = PETUNJUK_SELFIE.map((p) => `${p.judul} ${p.isi}`).join(" ");
  ok(/wajah/i.test(teksSelfie) && /KTP/i.test(teksSelfie), "petunjuk selfie menjelaskan wajah + KTP");
  ok(/cahaya/i.test(teksSelfie), "petunjuk selfie menjelaskan pencahayaan");
  eq(petunjukTahap("ktp"), PETUNJUK_KTP, "tahap KTP memakai petunjuk KTP");
  eq(petunjukTahap("selfie"), PETUNJUK_SELFIE, "tahap selfie memakai petunjuk selfie");
  eq(petunjukTahap("identitas").length, 0, "tahap non-dokumen tanpa petunjuk foto");
}

// ===== 12. Persetujuan: versi terikat teks yang dibaca =====
eq(persetujuanAktif(null), false, "tanpa persetujuan tercatat → belum aktif");
eq(persetujuanAktif(undefined), false, "persetujuan kosong → belum aktif");
eq(
  persetujuanAktif({ versi: VERSI_PERSETUJUAN_KYC, pada: 1 }),
  true,
  "persetujuan versi sekarang dianggap sah",
);
eq(
  persetujuanAktif({ versi: "versi-lama", pada: 1 }),
  false,
  "persetujuan versi lama tidak berlaku untuk teks baru",
);

// ===== 13. Tiap tahap punya judul & ringkasan yang bisa dibaca =====
for (const tahap of TAHAPAN_KYC) {
  ok(tahap.judul.trim().length > 0, `tahap ${tahap.id} punya judul`);
  ok(tahap.ringkas.trim().length > 0, `tahap ${tahap.id} punya ringkasan`);
  eq(tahapKyc(tahap.id as IdTahapKyc).id, tahap.id, `tahap ${tahap.id} bisa dicari kembali`);
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`kycTahapan: ${passed} lulus`);
