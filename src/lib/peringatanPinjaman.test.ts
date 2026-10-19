/**
 * Uji kalimat peringatan keterlambatan.
 * Run: bun src/lib/peringatanPinjaman.test.ts
 *
 * Yang dijaga: angka denda mengikuti tarif yang diberikan (bukan angka tetap di
 * layar), ambang somasi sama dengan mesin somasi, dan tempat kerja tidak pernah
 * disebut sebagai sasaran penagihan.
 */
import { MIN_HARI_SOMASI } from "./suratSomasi";
import {
  konsekuensiKeterlambatan,
  peringatanKemampuanBayar,
  ringkasKonsekuensi,
} from "./peringatanPinjaman";

let lulus = 0;
let gagal = 0;
function cek(nama: string, syarat: boolean) {
  if (syarat) {
    lulus += 1;
    return;
  }
  gagal += 1;
  console.error(`FAIL ${nama}`);
}

const TARIF = { perHari: 0.5, maks: 10 };
const daftar = konsekuensiKeterlambatan(TARIF);
const semua = daftar.join(" ");
const ringkas = ringkasKonsekuensi(TARIF);

cek("denda harian memakai koma desimal", semua.includes("0,5% per hari"));
cek("batas denda ikut tarif", semua.includes("dibatasi 10% dari pokok"));
cek("menyebut masa tenggang", semua.includes("Tidak ada masa tenggang"));
cek(
  `ambang somasi sama dengan mesin somasi (hari ke-${MIN_HARI_SOMASI})`,
  daftar.some((item) => item.includes(`hari ke-${MIN_HARI_SOMASI} setelah jatuh tempo`)),
);
cek("somasi dikirim ke kontak peminjam", semua.includes("WhatsApp atau email"));
cek("tempat kerja dinyatakan tidak dihubungi", semua.includes("tempat kerja tidak dihubungi"));
cek("menawarkan restrukturisasi sebelum jatuh tempo", semua.includes("restrukturisasi"));

// Tarif lain harus benar-benar dipakai, bukan versi yang tertulis tetap.
const lain = konsekuensiKeterlambatan({ perHari: 1, maks: 20 }).join(" ");
cek("tarif 1%/20% terbaca", lain.includes("1% per hari") && lain.includes("dibatasi 20% dari pokok"));

cek("ringkasan memuat denda", ringkas.includes("0,5% per hari"));
cek("ringkasan memuat somasi", ringkas.includes(`somasi mulai hari ke-${MIN_HARI_SOMASI}`));
cek("ringkasan menegaskan bukan tempat kerja", ringkas.includes("bukan tempat kerja"));

// ===== Kemampuan bayar =====
const bayar = (penghasilanBulanan: number, kewajiban: number, hari: number) =>
  peringatanKemampuanBayar({ penghasilanBulanan, kewajiban, hari });

cek("cicilan 20% penghasilan tidak memicu peringatan", bayar(5_000_000, 1_000_000, 30) === null);
cek("tepat 30% masih dianggap aman", bayar(5_000_000, 1_500_000, 30) === null);
cek("cicilan 40% memicu peringatan", (bayar(5_000_000, 2_000_000, 30) ?? "").includes("40%"));
cek("penghasilan kosong tidak dihitung", bayar(0, 1_000_000, 30) === null);

// Pinjaman harian dipecah ke penghasilan selama tenor, bukan gaji sebulan penuh.
const harian = bayar(5_000_000, 1_200_000, 7) ?? "";
cek("utang 7 hari dibandingkan dengan penghasilan 7 hari", harian.includes("103%"));
cek("peringatan harian menyebut lama tenor", harian.includes("selama 7 hari"));
cek("peringatan bukan penolakan", harian.includes("bukan penolakan"));

console.log(`peringatanPinjaman: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
