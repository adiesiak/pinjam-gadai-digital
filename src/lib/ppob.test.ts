/**
 * Uji aturan PPOB publik.
 * Run: bun src/lib/ppob.test.ts
 *
 * Yang dijaga: harga jual tidak pernah di bawah modal, pembulatan selalu ke
 * atas ke ratusan rupiah, nomor 62/+62 masuk ke format 0, dan status provider
 * yang tidak dikenal tidak pernah dianggap sukses.
 */
import {
  buatKodePesanan,
  buatRefId,
  hargaJualDariModal,
  kategoriDariProvider,
  labaPesanan,
  maskNomor,
  nomorTujuanBersih,
  nomorTujuanValid,
  persenMarkupKategori,
  statusDariProvider,
} from "./ppob";

let lulus = 0;
let gagal = 0;
function cek(nama: string, syarat: boolean, info?: string) {
  if (syarat) {
    lulus += 1;
    console.log(`ok   ${nama}`);
  } else {
    gagal += 1;
    console.error(`FAIL ${nama}${info === undefined ? "" : ` — ${info}`}`);
  }
}
function sama(aktual: unknown, harapan: unknown, nama: string) {
  cek(
    `${nama} (${JSON.stringify(aktual)})`,
    JSON.stringify(aktual) === JSON.stringify(harapan),
  );
}
function tolak(nama: string, kerja: () => unknown) {
  try {
    kerja();
    cek(nama, false, "tidak melempar");
  } catch {
    cek(nama, true);
  }
}

// ===== Harga jual =====
sama(hargaJualDariModal(10_000, 5, 500), 10_500, "pulsa 10rb markup 5% = 10.500");
sama(hargaJualDariModal(9_850, 5, 500), 10_400, "9.850 + 500 dibulatkan ke 10.400");
sama(hargaJualDariModal(1_000, 0, 500), 1_500, "markup minimum menutup biaya");
sama(hargaJualDariModal(10_000, 20, 0), 12_000, "markup 20% tanpa minimum");
sama(hargaJualDariModal(100, 5, 0), 200, "pembulatan ke atas, bukan ke bawah");
sama(hargaJualDariModal(0, 5, 0), 0, "produk gratis tetap nol");
tolak("modal pecahan ditolak", () => hargaJualDariModal(10_000.5, 5, 500));
tolak("modal negatif ditolak", () => hargaJualDariModal(-1, 5, 500));

// ===== Laba =====
sama(labaPesanan(10_500, 10_000), 500, "laba pesanan");
sama(labaPesanan(9_000, 10_000), 0, "harga jual di bawah modal tidak menjadi rugi negatif");
tolak("laba dari nominal pecahan ditolak", () => labaPesanan(10_000.5, 10_000));

// ===== Kategori provider =====
sama(kategoriDariProvider("Pulsa"), "pulsa", "kategori pulsa");
sama(kategoriDariProvider("Paket Data"), "data", "kategori paket data");
sama(kategoriDariProvider("E-Money"), "ewallet", "kategori e-money");
sama(kategoriDariProvider("Games"), "game", "kategori game");
sama(kategoriDariProvider("PLN"), "token-listrik", "kategori PLN");
sama(kategoriDariProvider("TV"), null, "produk di luar lima kelompok dibuang");

// ===== Nomor tujuan =====
sama(nomorTujuanBersih("pulsa", "0812-3456-7890"), "081234567890", "pulsa dengan strip");
sama(nomorTujuanBersih("pulsa", "+62 812 3456 7890"), "081234567890", "pulsa +62");
sama(nomorTujuanBersih("pulsa", "6281234567890"), "081234567890", "pulsa 62");
sama(nomorTujuanBersih("pulsa", "81234567890"), "081234567890", "pulsa tanpa 0");
sama(nomorTujuanBersih("data", "081234567890"), "081234567890", "paket data");
sama(nomorTujuanBersih("ewallet", "081234567890"), "081234567890", "e-wallet");
sama(nomorTujuanBersih("token-listrik", "123456789012"), "123456789012", "meter PLN 12 angka");
sama(nomorTujuanBersih("game", "12345678 (1234)"), "12345678(1234)", "ID game + server");
tolak("nomor 07 ditolak", () => nomorTujuanBersih("pulsa", "0712345678"));
tolak("nomor terlalu pendek ditolak", () => nomorTujuanBersih("pulsa", "0812"));
tolak("meter PLN 10 angka ditolak", () => nomorTujuanBersih("token-listrik", "1234567890"));
tolak("nomor kosong ditolak", () => nomorTujuanBersih("pulsa", "  "));
cek("nomor valid mengembalikan true", nomorTujuanValid("pulsa", "081234567890"));
cek("nomor salah mengembalikan false", !nomorTujuanValid("pulsa", "123"));

// ===== Samaran =====
sama(maskNomor("081234567890"), "0812••••7890", "nomor disamarkan di tengah");
sama(maskNomor("12345"), "12••45", "nomor pendek tetap tersamar");

// ===== Kode pesanan & referensi =====
// 2026-10-28T18:00:00Z = 29 Oktober 2026 pukul 01.00 WIB.
const waktu = Date.UTC(2026, 9, 28, 18, 0, 0);
sama(
  buatKodePesanan(waktu, "7k3m9qxw2n4p"),
  "PPOB-261029-7K3M9QXW2N4P",
  "kode memakai tanggal WIB dan 12 karakter acak",
);
sama(buatRefId(waktu, "ab12cd34ef56").startsWith("PDB"), true, "ref diawali PDB");
sama(
  buatRefId(waktu, "ab12cd34ef56"),
  buatRefId(waktu, "ab12cd34ef56"),
  "ref stabil",
);
cek("ref hanya alfanumerik", /^[A-Z0-9]+$/.test(buatRefId(waktu, "ab12cd34ef56")));
tolak("kode acak terlalu pendek ditolak", () => buatKodePesanan(waktu, "ab"));
tolak("kode 6 karakter lama ditolak", () => buatKodePesanan(waktu, "7k3m9q"));
tolak("ref acak terlalu pendek ditolak", () => buatRefId(waktu, "ab12cd34"));

// ===== Status provider =====
sama(statusDariProvider("Sukses"), "sukses", "Sukses");
sama(statusDariProvider("Pending"), "diproses", "Pending");
sama(statusDariProvider("Gagal", "00"), "gagal", "Gagal menang atas rc 00");
sama(statusDariProvider("", "00"), "sukses", "rc 00 tanpa status");
sama(statusDariProvider("", "02"), "gagal", "rc 02");
sama(statusDariProvider("Entah"), "diproses", "status asing ditahan di proses");
sama(statusDariProvider("success"), "sukses", "server kustom memakai success");

// ===== Markup per kategori =====
sama(persenMarkupKategori(5, {}, "pulsa"), 5, "tanpa isian memakai markup global");
sama(persenMarkupKategori(5, { pulsa: 2 }, "pulsa"), 2, "pulsa memakai tarif khusus");
sama(persenMarkupKategori(5, { pulsa: 2 }, "game"), 5, "kategori lain tetap global");
sama(
  persenMarkupKategori(5, { tokenListrik: 7 }, "token-listrik"),
  7,
  "token listrik memetakan kolom tokenListrik",
);
sama(persenMarkupKategori(5, { game: -1 }, "game"), 5, "nilai negatif diabaikan");
sama(persenMarkupKategori(5, { data: Number.NaN }, "data"), 5, "NaN diabaikan");
sama(
  hargaJualDariModal(10_000, persenMarkupKategori(5, { pulsa: 2 }, "pulsa"), 0),
  10_200,
  "harga pulsa memakai markup kategori",
);
sama(
  hargaJualDariModal(10_000, persenMarkupKategori(5, {}, "game"), 0),
  10_500,
  "harga game tetap memakai markup global",
);

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
