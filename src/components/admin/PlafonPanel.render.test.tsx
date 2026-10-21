/**
 * Uji susunan AKSI panel Plafon Nasabah.
 *
 * Keluhan yang dijaga: tiap baris menampilkan enam tombol (Atur, Profil, Data
 * diri, sakelar tagihan, Masuk sebagai, hapus) dalam dua baris. Di layar 1366
 * deret itu mendorong kolom plafon sampai terpotong, dan tombol "Masuk sebagai"
 * sempat tampil dua kali — sekali dari `TombolMasukSebagai` dan sekali lagi di
 * baris aksi.
 *
 * Panel ini membaca Convex (`useQuery`/`useMutation`), jadi tidak bisa dirender
 * di luar aplikasi. Yang diperiksa di sini adalah sumbernya: satu pemicu Kelola
 * per baris/kartu, isi menu yang lengkap, dan dialog pratinjau yang hanya
 * dibuka dari menu (tanpa tombol pemicu sendiri).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const sumber = readFileSync(
  fileURLToPath(new URL("./PlafonPanel.tsx", import.meta.url)),
  "utf8",
);

/** Teks tanpa komentar, supaya penjelasan di docblock tidak dihitung sebagai kode. */
const kode = sumber
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

// Satu pemicu "Kelola" untuk tabel (>= md) dan satu untuk kartu (< md).
const jumlahPemicu = kode.split("<MenuKelolaNasabah").length - 1;
ok(jumlahPemicu === 2, "tiap tampilan baris memakai satu menu Kelola");
ok(
  kode.split("<DropdownMenuTrigger").length - 1 <= 2,
  "tidak ada pemicu menu lain di panel",
);

// Enam aksi lama tetap ada, tidak dikurangi.
const AKSI = [
  "Atur plafon dan bunga",
  "Profil nasabah",
  "Masuk sebagai",
  "Matikan tagihan",
  "Nyalakan tagihan",
  "Hapus akun",
];
const posisiMenu = kode.indexOf("<DropdownMenuContent");
ok(posisiMenu !== -1, "menu punya isi (DropdownMenuContent)");
for (const label of AKSI) {
  const posisi = kode.indexOf(label);
  ok(posisi > posisiMenu, `aksi "${label}" berada DI DALAM menu`);
}

// Tombol lama tidak boleh hidup lagi di luar menu.
ok(!kode.includes(">Atur</Button>"), "tombol Atur lama sudah tidak dirender");
ok(!kode.includes(">Data diri</Button>"), "tombol Data diri lama sudah tidak dirender");
ok(
  kode.split(">Masuk sebagai</Button>").length - 1 === 0,
  "tidak ada tombol Masuk sebagai berdiri sendiri",
);

// Dialog pratinjau dibuka dari menu: terlihat, tanpa tombol pemicu sendiri.
ok(kode.includes("terbuka") && kode.includes("tampilkanTombol={false}"), "dialog pratinjau dikendalikan menu");
ok(kode.includes("setMasukTarget({ userId: r.userId as Id<\"users\">, nama: r.nama })"), "menu membuka pratinjau akun baris itu");

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`PlafonPanel.render: ${passed} lulus`);
