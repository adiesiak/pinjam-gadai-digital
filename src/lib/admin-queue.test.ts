/**
 * Uji logika murni Meja Kerja Admin.
 * Run: bun src/lib/admin-queue.test.ts
 *
 * Berkas ini tidak menyentuh React, Convex, atau DOM — sama seperti uji lib
 * lain di repo ini, ia hanya memeriksa angka dan keputusan.
 */
import {
  GRUP_NAV,
  NILAI_MODUL_ADMIN,
  STATUS_MENUNGGU,
  grupDariModul,
  hitungCairEkspresMenunggu,
  hitungMenunggu,
  pakaiCairEkspres,
  urutkanAntreanEkspres,
  jumlahPerhatianLokasi,
  jumlahPerluKeputusan,
  modulDariParameter,
  ringkasGrup,
  saringModul,
  type ItemRingkas,
  type NilaiModulAdmin,
} from "./admin-queue";

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

// ===== ringkasGrup =====

// Tanpa apa-apa: tidak ada lencana sama sekali.
eq(ringkasGrup([]), null, "grup kosong → null");

// Lencana nol / null tidak dihitung sebagai pekerjaan.
eq(
  ringkasGrup([
    { badge: "0", hitung: "menunggu" },
    { badge: null, hitung: "tidak" },
  ]),
  null,
  "semua nol → null (bukan \"0\")",
);

// Lencana non-angka (mis. "OK") diabaikan, bukan jadi NaN.
eq(
  ringkasGrup([
    { badge: "OK", hitung: "tidak" },
    { badge: null, hitung: "tidak" },
  ]),
  null,
  "lencana \"OK\" diabaikan",
);

// Menjumlahkan yang benar-benar menunggu.
eq(
  ringkasGrup([
    { badge: "2", hitung: "menunggu" },
    { badge: "3", hitung: "menunggu" },
    { badge: "OK", hitung: "tidak" },
  ]),
  "5",
  "menjumlahkan semua yang menunggu",
);

// R3: lencana informasi TIDAK ikut dijumlahkan.
// Grup "Nasabah & penyedia dana" lama menampilkan "alokasi" = jumlah pinjaman
// yang sudah disetujui, sehingga grup tampak penuh pekerjaan padahal tidak.
eq(
  ringkasGrup([
    { badge: "7", hitung: "info" },
    { badge: "2", hitung: "menunggu" },
  ]),
  "2",
  "R3: lencana info tidak dijumlahkan",
);

// Hanya lencana info → tidak ada ringkasan angka.
eq(ringkasGrup([{ badge: "7", hitung: "info" }]), null, "hanya info → null");

// "!" selalu menang, walau ada angka menunggu.
eq(
  ringkasGrup([
    { badge: "9", hitung: "menunggu" },
    { badge: "!", hitung: "tidak" },
  ]),
  "!",
  "\"!\" menang atas angka",
);

// "!" juga menang bila hanya ada satu item yang bukan hitungan.
eq(
  ringkasGrup([{ badge: "!", hitung: "tidak" }]),
  "!",
  "\"!\" sendirian tetap tampil",
);

// Lencana "menunggu" yang bukan angka tidak menghasilkan NaN.
eq(
  ringkasGrup([{ badge: "segera", hitung: "menunggu" }]),
  null,
  "menunggu non-angka tidak jadi NaN",
);

// Nilai menunggu yang besarnya nol di antara yang lain.
eq(
  ringkasGrup([
    { badge: "0", hitung: "menunggu" },
    { badge: "4", hitung: "menunggu" },
  ]),
  "4",
  "nol di antara angka lain",
);

// ===== jumlahPerluKeputusan =====

const TANPA_BARIS = { loans: [], pawns: [], kredit: [] };
eq(jumlahPerluKeputusan(TANPA_BARIS), 0, "tanpa pengajuan → 0");

// Pinjaman: `diajukan` DAN `sedang_direview` sama-sama menunggu keputusan.
eq(
  jumlahPerluKeputusan({
    loans: [
      { status: "diajukan" },
      { status: "sedang_direview" },
      { status: "disetujui" },
      { status: "didanai" },
      { status: "lunas" },
      { status: "ditolak" },
    ],
    pawns: [],
    kredit: [],
  }),
  2,
  "pinjaman: diajukan + sedang_direview",
);

// Gadai: `diajukan` + `sedang_dinilai`.
eq(
  jumlahPerluKeputusan({
    loans: [],
    pawns: [
      { status: "diajukan" },
      { status: "sedang_dinilai" },
      { status: "disetujui" },
      { status: "aktif" },
      { status: "menunggu_pelepasan" },
      { status: "lunas_dilepas" },
      { status: "ditolak" },
    ],
    kredit: [],
  }),
  2,
  "gadai: diajukan + sedang_dinilai",
);

// Kredit: `diajukan` + `sedang_ditinjau`.
eq(
  jumlahPerluKeputusan({
    loans: [],
    pawns: [],
    kredit: [
      { status: "diajukan" },
      { status: "sedang_ditinjau" },
      { status: "disetujui" },
      { status: "didanai" },
      { status: "lunas" },
      { status: "ditolak" },
    ],
  }),
  2,
  "kredit: diajukan + sedang_ditinjau",
);

// Total gabungan tiga produk.
eq(
  jumlahPerluKeputusan({
    loans: [{ status: "diajukan" }, { status: "sedang_direview" }],
    pawns: [{ status: "diajukan" }],
    kredit: [{ status: "sedang_ditinjau" }, { status: "sedang_ditinjau" }],
  }),
  5,
  "gabungan tiga produk",
);

// Status milik produk lain tidak ikut terhitung (tidak ada silang produk).
eq(
  jumlahPerluKeputusan({
    loans: [{ status: "sedang_dinilai" }, { status: "sedang_ditinjau" }],
    pawns: [{ status: "sedang_direview" }],
    kredit: [{ status: "sedang_dinilai" }],
  }),
  0,
  "status produk lain tidak terhitung",
);

// Status asing diabaikan, bukan bikin galat.
eq(
  jumlahPerluKeputusan({
    loans: [{ status: "entah" }, { status: "" }],
    pawns: [],
    kredit: [],
  }),
  0,
  "status asing diabaikan",
);

// ===== hitungMenunggu & STATUS_MENUNGGU (sumber kebenaran bersama) =====

// Ketiga produk punya daftarnya sendiri, dan semuanya menyertakan `diajukan`.
eq(
  Object.keys(STATUS_MENUNGGU).sort().join(","),
  "gadai,kredit,pinjaman",
  "STATUS_MENUNGGU memuat tiga produk",
);
for (const produk of Object.keys(STATUS_MENUNGGU)) {
  eq(
    STATUS_MENUNGGU[produk as "pinjaman"].includes("diajukan"),
    true,
    `STATUS_MENUNGGU.${produk} memuat diajukan`,
  );
}

// Nilai persisnya dipatok: lencana tab dan kartu "Hari Ini" wajib sepakat.
eq(
  STATUS_MENUNGGU.pinjaman.join(","),
  "diajukan,sedang_direview",
  "status menunggu pinjaman",
);
eq(
  STATUS_MENUNGGU.gadai.join(","),
  "diajukan,sedang_dinilai",
  "status menunggu gadai",
);
eq(
  STATUS_MENUNGGU.kredit.join(","),
  "diajukan,sedang_ditinjau",
  "status menunggu kredit",
);

// hitungMenunggu per produk — termasuk `sedang_direview` yang dulu hilang dari
// lencana tab "Pinjaman".
const PINJAMAN_UJI = [
  { status: "diajukan" },
  { status: "sedang_direview" },
  { status: "disetujui" },
  { status: "lunas" },
];
eq(hitungMenunggu(PINJAMAN_UJI, "pinjaman"), 2, "hitungMenunggu pinjaman");
eq(hitungMenunggu([], "kredit"), 0, "hitungMenunggu tanpa baris");

// `diajukan` SENGAJA ada di ketiga produk — setiap tabel punya baris diajukan
// sendiri. Jadi fungsi ini tidak memisahkan produk; pemanggil wajib mengoper
// array produk yang benar (`overview.pawns` untuk gadai, dst.).
eq(hitungMenunggu([{ status: "diajukan" }], "gadai"), 1, "diajukan dihitung di produk mana pun");

// Status yang khas satu produk tidak bocor ke produk lain.
eq(hitungMenunggu([{ status: "sedang_direview" }], "gadai"), 0, "sedang_direview bukan milik gadai");
eq(hitungMenunggu([{ status: "sedang_direview" }], "kredit"), 0, "sedang_direview bukan milik kredit");
eq(hitungMenunggu([{ status: "sedang_dinilai" }], "pinjaman"), 0, "sedang_dinilai bukan milik pinjaman");
eq(hitungMenunggu([{ status: "sedang_ditinjau" }], "gadai"), 0, "sedang_ditinjau bukan milik gadai");

// Konsistensi: total = jumlah tiap produk. Inilah yang menjamin angka di
// sidebar dan angka di panel "Hari Ini" tidak bisa berbeda.
const OVERVIEW_UJI = {
  loans: PINJAMAN_UJI,
  pawns: [{ status: "diajukan" }, { status: "aktif" }],
  kredit: [{ status: "sedang_ditinjau" }, { status: "lunas" }],
};
eq(
  hitungMenunggu(OVERVIEW_UJI.loans, "pinjaman") +
    hitungMenunggu(OVERVIEW_UJI.pawns, "gadai") +
    hitungMenunggu(OVERVIEW_UJI.kredit, "kredit"),
  jumlahPerluKeputusan(OVERVIEW_UJI),
  "total hitungMenunggu = jumlahPerluKeputusan",
);
eq(jumlahPerluKeputusan(OVERVIEW_UJI), 4, "total menunggu dari tiga produk");

// ===== jumlahPerhatianLokasi =====

eq(
  jumlahPerhatianLokasi({
    gpsMismatch: 0,
    titikDicurigai: 0,
    peringatanLokasiAktif: 0,
    pinjamanTanpaLokasi: 0,
  }),
  0,
  "lokasi: semua nol → 0",
);

eq(
  jumlahPerhatianLokasi({
    gpsMismatch: 3,
    titikDicurigai: 4,
    peringatanLokasiAktif: 5,
    pinjamanTanpaLokasi: 6,
  }),
  18,
  "lokasi: menjumlah keempat sumber",
);

// ===== saringModul =====

type MenuUji = {
  value: string;
  label: string;
  hint: string;
  grup?: string;
  ikon: string;
};

const MENU_UJI: MenuUji[] = [
  {
    value: "pinjaman",
    label: "Pinjaman",
    hint: "Tinjau dan putuskan pengajuan pinjaman tunai.",
    grup: "Antrean",
    ikon: "clipboard",
  },
  {
    value: "gadai",
    label: "Gadai",
    hint: "Nilai barang jaminan.",
    grup: "Antrean",
    ikon: "package",
  },
  {
    value: "loglogin",
    label: "Keamanan Login",
    hint: "Riwayat login dan status verifikasi TOTP.",
    grup: "Sistem",
    ikon: "shield",
  },
];

// Kueri kosong → seluruh daftar, sebagai array baru (sheet belum diketik).
const semua = saringModul(MENU_UJI, "");
eq(semua.length, MENU_UJI.length, "kueri kosong → semua modul");
eq(semua !== MENU_UJI, true, "kueri kosong mengembalikan array baru");

// Kueri spasi saja sama dengan kosong.
eq(saringModul(MENU_UJI, "   ").length, MENU_UJI.length, "kueri spasi → semua");

// Cocok pada label, tanpa peduli huruf besar/kecil.
eq(saringModul(MENU_UJI, "GADAI")[0]?.value, "gadai", "cocok label huruf besar");
eq(saringModul(MENU_UJI, "gadai")[0]?.value, "gadai", "cocok label");

// Cocok sebagian di tengah kata.
eq(saringModul(MENU_UJI, "njama")[0]?.value, "pinjaman", "cocok sebagian label");

// Cocok pada nama grup.
// Catatan: `eq` memakai `===`, jadi bandingkan hasil map sebagai string.
eq(
  saringModul(MENU_UJI, "sistem")
    .map((m) => m.value)
    .join(","),
  "loglogin",
  "cocok nama grup",
);

// Cocok pada hint (bukan label).
eq(saringModul(MENU_UJI, "jaminan")[0]?.value, "gadai", "cocok hint");

// Kueri dipangkas di ujung.
eq(saringModul(MENU_UJI, "  totp  ")[0]?.value, "loglogin", "kueri dipangkas");

// Tidak ada yang cocok → array kosong, bukan galat.
eq(saringModul(MENU_UJI, "zzz").length, 0, "tanpa hasil → kosong");

// Field tambahan (ikon) tetap ikut — pemanggil tidak kehilangan tipe.
eq(saringModul(MENU_UJI, "gadai")[0]?.ikon, "package", "field tambahan ikut");

// Tidak mengubah daftar asal.
saringModul(MENU_UJI, "gadai");
eq(MENU_UJI.length, 3, "daftar asal tidak diubah");

// Item tanpa `grup` tetap bisa dicari (grup opsional).
eq(
  saringModul([{ value: "x", label: "Tanpa Grup", hint: "apa saja" }], "tanpa")[0]
    ?.value,
  "x",
  "item tanpa grup tetap bisa dicari",
);

// ===== Peta modul & grup (dokumen desain §4) =====

eq(
  NILAI_MODUL_ADMIN.length,
  28,
  "28 nilai modul yang ada (syariah + undian + rekonsiliasi + landing + pendana + promo + bi + killswitch + pengembangan)",
);
eq(
  new Set(NILAI_MODUL_ADMIN).size,
  NILAI_MODUL_ADMIN.length,
  "nilai modul unik",
);

// Bijection: setiap modul muncul tepat sekali di GRUP_NAV — tidak ada yang
// hilang dan tidak ada yang dobel. Inilah uji kelengkapan navigasi (T3).
const dariGrup = GRUP_NAV.flatMap((grup) => [...grup.modul]);
eq(dariGrup.length, NILAI_MODUL_ADMIN.length, "GRUP_NAV memuat semua modul sekali");
eq(new Set(dariGrup).size, dariGrup.length, "tidak ada modul dobel di GRUP_NAV");
for (const modul of NILAI_MODUL_ADMIN) {
  eq(dariGrup.includes(modul), true, `modul ${modul} ada di GRUP_NAV`);
}

// Lima tab bawah: Hari Ini · Operasional · Pemantauan · Konten · Sistem.
eq(
  GRUP_NAV.map((g) => g.id).join(","),
  "hari-ini,operasional,pemantauan,konten,sistem",
  "lima tab bawah berurutan",
);
eq(
  GRUP_NAV.map((g) => g.modul.length).join(","),
  "1,10,4,7,6",
  "jumlah modul tiap tab (1+10+4+7+6 = 28)",
);
eq(
  GRUP_NAV.reduce((total, g) => total + g.modul.length, 0),
  NILAI_MODUL_ADMIN.length,
  "GRUP_NAV memuat seluruh modul yang sudah ada (28)",
);

// Modul default tiap grup harus salah satu anggotanya.
for (const grup of GRUP_NAV) {
  eq(
    grup.modul.includes(grup.default),
    true,
    `default grup ${grup.id} ada di anggotanya`,
  );
}

// grupDariModul bolak-balik untuk seluruh modul.
for (const grup of GRUP_NAV) {
  for (const modul of grup.modul) {
    eq(grupDariModul(modul), grup.id, `grupDariModul(${modul})`);
  }
}

// Modul tak terdaftar tidak ditemukan (nilai asing disuntik sengaja).
eq(
  grupDariModul("entah" as NilaiModulAdmin),
  undefined,
  "modul tak terdaftar → undefined",
);

// `ItemRingkas` yang dipakai UI harus lolos tanpa `as`.
const contohItem: ItemRingkas = { badge: "1", hitung: "menunggu" };
eq(ringkasGrup([contohItem]), "1", "ItemRingkas kompatibel");

// ===== Tautan langsung `?tab=` =====
eq(modulDariParameter(null), "hari-ini", "tanpa parameter → meja kerja");
eq(modulDariParameter("doorprize"), "undian", "alias doorprize → modul undian");
eq(modulDariParameter(" Doorprize "), "undian", "alias tidak peduli spasi/huruf besar");
eq(modulDariParameter("undian"), "undian", "nilai modul sah dibuka apa adanya");
eq(modulDariParameter("kyc"), "kyc", "modul lain tetap bisa ditautkan");
eq(modulDariParameter("entah"), "hari-ini", "nilai asing jatuh ke meja kerja");
eq(modulDariParameter(""), "hari-ini", "parameter kosong jatuh ke meja kerja");
for (const modul of NILAI_MODUL_ADMIN) {
  eq(modulDariParameter(modul), modul, `setiap modul bisa dibuka lewat ?tab=${modul}`);
}

// ===== Cair ekspres: penanda, hitungan, dan urutan antrean =====

// Hanya centang eksplisit yang dianggap memilih cair ekspres. Data lama
// (`null`) dulu selalu ekspres, tetapi bukan pilihan baru di antrean.
eq(pakaiCairEkspres({ cairEkspres: true }), true, "centang ekspres dikenali");
eq(pakaiCairEkspres({ cairEkspres: false }), false, "tanpa centang bukan ekspres");
eq(pakaiCairEkspres({ cairEkspres: null }), false, "data lama null bukan ekspres baru");
eq(pakaiCairEkspres({}), false, "kolom kosong bukan ekspres");

// Notifikasi hanya menghitung pengajuan yang masih menunggu keputusan.
eq(
  hitungCairEkspresMenunggu([
    { status: "diajukan", cairEkspres: true },
    { status: "sedang_direview", cairEkspres: true },
    { status: "didanai", cairEkspres: true },
    { status: "diajukan", cairEkspres: false },
    { status: "diajukan", cairEkspres: null },
  ]),
  2,
  "hitung ekspres hanya status tinjauan",
);

// Urutan: ekspres dulu (walau paling lama), sisanya tetap terbaru-dulu.
const antrean = [
  { nama: "baru-biasa", _creationTime: 300, cairEkspres: false },
  { nama: "lama-ekspres", _creationTime: 100, cairEkspres: true },
  { nama: "tengah-ekspres", _creationTime: 200, cairEkspres: true },
  { nama: "tua-biasa", _creationTime: 50, cairEkspres: null },
];
const urut = urutkanAntreanEkspres(antrean);
eq(
  urut.map((baris) => baris.nama).join(","),
  "tengah-ekspres,lama-ekspres,baru-biasa,tua-biasa",
  "ekspres di atas, lalu terbaru-dulu",
);
eq(
  antrean.map((baris) => baris.nama).join(","),
  "baru-biasa,lama-ekspres,tengah-ekspres,tua-biasa",
  "urutan masukan tidak diubah",
);

console.log(`admin-queue.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
