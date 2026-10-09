/**
 * Uji aturan interaksi formulir PINDAI (murni, tanpa server).
 * Run: bun src/lib/formInteraksi.test.ts
 *
 * Yang dijaga di sini adalah hal-hal yang paling mudah berbohong ke pengguna:
 * persen unggahan (tidak boleh ada angka karangan saat totalnya tak diketahui),
 * deteksi perubahan isian (dasar peringatan "belum disimpan"), dan aturan
 * pemeriksaan asinkron (kapan boleh dijalankan, kapan hasilnya sudah basi).
 */
import {
  adaPerubahan,
  bolehValidasiAsinkron,
  hasilMasihBerlaku,
  JEDA_VALIDASI_MS,
  kalimatValidasi,
  LABEL_TAHAP,
  perluPeringatanTinggalkan,
  pesanUntukIsian,
  progresPersen,
  sibuk,
  type TahapForm,
} from "./formInteraksi";

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

// ===== tahap: sibuk hanya saat ada pekerjaan berjalan =====
const SEMUA_TAHAP: TahapForm[] = ["diam", "memvalidasi", "mengunggah", "mengirim", "sukses", "galat"];
eq(sibuk("diam"), false, "diam tidak sibuk");
eq(sibuk("memvalidasi"), true, "memvalidasi sibuk");
eq(sibuk("mengunggah"), true, "mengunggah sibuk");
eq(sibuk("mengirim"), true, "mengirim sibuk");
eq(sibuk("sukses"), false, "sukses tidak sibuk (pekerjaan sudah selesai)");
eq(sibuk("galat"), false, "galat tidak sibuk (isian harus bisa dicoba lagi)");
for (const tahap of SEMUA_TAHAP) {
  ok(LABEL_TAHAP[tahap].length > 0, `label tahap ${tahap} ada`);
}
ok(
  new Set(SEMUA_TAHAP.map((t) => LABEL_TAHAP[t])).size === SEMUA_TAHAP.length,
  "enam tahap punya label yang berbeda-beda",
);

// ===== progres unggahan: tidak pernah mengarang angka =====
eq(progresPersen(0, 1000), 0, "belum ada byte terkirim = 0%");
eq(progresPersen(250, 1000), 25, "seperempat terkirim");
eq(progresPersen(999, 1000), 100, "dibulatkan ke atas tapi tidak melewati 100");
eq(progresPersen(1000, 1000), 100, "selesai = 100%");
eq(progresPersen(1200, 1000), 100, "melebihi total dijepit di 100%");
eq(progresPersen(5, 0), null, "total 0 (tidak diketahui) → tanpa angka");
eq(progresPersen(5, -1), null, "total negatif → tanpa angka");
eq(progresPersen(Number.NaN, 100), null, "loaded NaN → tanpa angka");
eq(progresPersen(5, Number.NaN), null, "total NaN → tanpa angka");
eq(progresPersen(Number.POSITIVE_INFINITY, 100), null, "loaded tak hingga → tanpa angka");

// ===== deteksi perubahan isian (dasar peringatan belum disimpan) =====
const AWAL = { nama: "Rani", pokok: 1000, setuju: false };
eq(adaPerubahan(AWAL, { ...AWAL }), false, "isian identik bukan perubahan");
eq(adaPerubahan(AWAL, { ...AWAL, nama: "Rani " }), true, "spasi tambahan tetap perubahan");
eq(adaPerubahan(AWAL, { ...AWAL, pokok: "1000" }), false, "angka dan teks yang sama tidak dianggap berbeda");
eq(adaPerubahan(AWAL, { ...AWAL, setuju: true }), true, "centang berubah terdeteksi");
eq(adaPerubahan(AWAL, { nama: "Rani", pokok: 1000 }), true, "kunci yang hilang terdeteksi");
eq(adaPerubahan(AWAL, { ...AWAL, catatan: "baru" }), true, "kunci baru terdeteksi");
eq(adaPerubahan({ a: null }, { a: undefined }), false, "null dan undefined sama-sama kosong");
eq(adaPerubahan({ a: "" }, { a: 0 }), true, "kosong dan nol berbeda bagi pengguna");

// ===== peringatan meninggalkan halaman =====
eq(perluPeringatanTinggalkan(false, false), false, "tanpa perubahan tidak ada peringatan");
eq(perluPeringatanTinggalkan(true, false), true, "ada perubahan belum disimpan → peringatan");
eq(perluPeringatanTinggalkan(true, true), false, "sudah sukses → tanpa peringatan palsu");

// ===== galat per isian =====
const GALAT = { nik: "NIK harus 16 angka." } as Partial<Record<"nik" | "wa", string>>;
eq(pesanUntukIsian(GALAT, "nik"), "NIK harus 16 angka.", "pesan isian yang gagal dibaca");
eq(pesanUntukIsian(GALAT, "wa"), null, "isian tanpa galat tidak dapat pesan");

// ===== validasi asinkron: kapan berjalan & kapan hasilnya basi =====
eq(bolehValidasiAsinkron("", 4), false, "isian kosong tidak diperiksa ke server");
eq(bolehValidasiAsinkron("ab", 4), false, "terlalu pendek untuk bisa cocok");
eq(bolehValidasiAsinkron("abcd", 4), true, "cukup panjang untuk diperiksa");
eq(bolehValidasiAsinkron("  abcd  ", 4), true, "spasi tepi tidak dihitung");
eq(bolehValidasiAsinkron("a", 0), true, "batas minimum minimal satu karakter");
ok(JEDA_VALIDASI_MS > 0 && JEDA_VALIDASI_MS <= 800, "jeda validasi wajar untuk ketikan");

eq(hasilMasihBerlaku(3, 3), true, "hasil dari isian terbaru dipakai");
eq(hasilMasihBerlaku(2, 3), false, "jawaban lama yang datang terlambat diabaikan");
eq(hasilMasihBerlaku(4, 3), false, "jawaban dari masa depan juga tidak dipercaya");

// ===== kalimat tahap validasi: tidak pernah menyimpulkan 'aman' tanpa jawaban =====
eq(kalimatValidasi("diam"), null, "belum ada pemeriksaan: tanpa kalimat");
eq(kalimatValidasi("memvalidasi"), "Memeriksa…", "sedang memeriksa");
eq(kalimatValidasi("galat"), "Pemeriksaan gagal. Coba lagi.", "galat punya kalimat bawaan");
eq(kalimatValidasi("galat", { pesanGalat: "Server sibuk." }), "Server sibuk.", "pesan galat dari pemanggil dipakai");
eq(kalimatValidasi("sah"), null, "tahap sah tanpa pesan tidak mengarang kalimat");
eq(kalimatValidasi("sah", { pesanSah: "Tidak ada nasabah kembar." }), "Tidak ada nasabah kembar.", "pesan sah dari server dipakai");

console.log(`formInteraksi.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
