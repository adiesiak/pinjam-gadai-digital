/**
 * Uji normalisasi teks beranda (tanpa React/Convex).
 * Run: bun src/lib/landing-cms.test.ts
 *
 * Yang dijaga: data lama atau kolom yang dikosongkan admin tidak pernah
 * menghasilkan judul kosong di halaman publik, dan batas panjang di formulir
 * sama dengan yang dipotong saat dibaca.
 */
import {
  BATAS_LANDING,
  JUMLAH_KARTU_LAYANAN,
  JUMLAH_PANDUAN,
  KONTEN_LANDING_DEFAULT,
  lengkapiKontenLanding,
} from "./landing-cms";

let lulus = 0;
let gagal = 0;
function cek(nama: string, syarat: boolean) {
  if (syarat) {
    lulus += 1;
    console.log(`ok   ${nama}`);
  } else {
    gagal += 1;
    console.error(`FAIL ${nama}`);
  }
}
const sama = (actual: unknown, expected: unknown, nama: string) =>
  cek(
    `${nama} (${JSON.stringify(actual)})`,
    JSON.stringify(actual) === JSON.stringify(expected),
  );

// Tanpa data tersimpan: hasilnya harus utuh dan identik dengan bawaan.
sama(lengkapiKontenLanding(undefined), KONTEN_LANDING_DEFAULT, "tanpa data → bawaan");
sama(lengkapiKontenLanding(null), KONTEN_LANDING_DEFAULT, "null → bawaan");
sama(lengkapiKontenLanding({}), KONTEN_LANDING_DEFAULT, "objek kosong → bawaan");

// Spasi tepi dibuang; field kosong jatuh ke bawaan, bukan string kosong.
{
  const hasil = lengkapiKontenLanding({
    heroJudul1: "  Judul baru  ",
    heroJudul2: "   ",
    footerDeskripsi: "",
  });
  sama(hasil.heroJudul1, "Judul baru", "spasi tepi dibuang");
  sama(hasil.heroJudul2, KONTEN_LANDING_DEFAULT.heroJudul2, "kosong → bawaan");
  sama(
    hasil.footerDeskripsi,
    KONTEN_LANDING_DEFAULT.footerDeskripsi,
    "string kosong → bawaan",
  );
}

// Panjang dipotong sesuai batas yang dipakai formulir.
{
  const hasil = lengkapiKontenLanding({
    heroMikro: "x".repeat(BATAS_LANDING.heroMikro + 25),
    layanan: [
      {
        judul: "j".repeat(BATAS_LANDING.kartuJudul + 10),
        ringkasan: "r".repeat(BATAS_LANDING.kartuRingkasan + 10),
        detail: "d".repeat(BATAS_LANDING.kartuDetail + 10),
      },
    ],
  });
  sama(hasil.heroMikro.length, BATAS_LANDING.heroMikro, "heroMikro dipotong");
  sama(
    hasil.layanan[0].judul.length,
    BATAS_LANDING.kartuJudul,
    "judul kartu dipotong",
  );
  sama(
    hasil.layanan[0].ringkasan.length,
    BATAS_LANDING.kartuRingkasan,
    "ringkasan kartu dipotong",
  );
  sama(
    hasil.layanan[0].detail.length,
    BATAS_LANDING.kartuDetail,
    "detail kartu dipotong",
  );
}

// Daftar selalu tiga baris: kurang dilengkapi bawaan, lebih dipotong.
{
  const hasil = lengkapiKontenLanding({
    layanan: [{ judul: "Hanya satu" }],
    panduan: [
      { judul: "A", isi: "a" },
      { judul: "B", isi: "b" },
      { judul: "C", isi: "c" },
      { judul: "D", isi: "d" },
    ],
  });
  sama(hasil.layanan.length, JUMLAH_KARTU_LAYANAN, "layanan selalu tiga");
  sama(hasil.layanan[0].judul, "Hanya satu", "kartu pertama dari data");
  sama(
    hasil.layanan[0].ringkasan,
    KONTEN_LANDING_DEFAULT.layanan[0].ringkasan,
    "field kartu kosong → bawaan",
  );
  sama(
    hasil.layanan[2].judul,
    KONTEN_LANDING_DEFAULT.layanan[2].judul,
    "kartu yang tidak dikirim → bawaan",
  );
  sama(hasil.panduan.length, JUMLAH_PANDUAN, "panduan selalu tiga");
  sama(hasil.panduan[2].judul, "C", "panduan ketiga dari data");
}

// Bawaan tidak boleh ikut berubah saat hasil dinormalisasi.
{
  const hasil = lengkapiKontenLanding({
    layanan: [{ judul: "Ubah" }],
  });
  hasil.layanan[0].judul = "Diubah pemanggil";
  cek(
    "objek bawaan tidak ikut bermutasi",
    KONTEN_LANDING_DEFAULT.layanan[0].judul !== "Diubah pemanggil",
  );
}

console.log(`landing-cms: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
