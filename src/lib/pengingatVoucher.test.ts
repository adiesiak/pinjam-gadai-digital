/**
 * Uji teks pengingat voucher H-3.
 * Run: bun src/lib/pengingatVoucher.test.ts
 *
 * Yang dijaga: kalimatnya menyebut kode, tanggal berakhir, dan sisa hari yang
 * benar — termasuk voucher yang tinggal beberapa jam, yang tidak boleh disebut
 * "0 hari lagi" karena pengingatnya jadi terdengar seperti sudah hangus.
 */
import { pesanPengingatVoucher, sisaHariVoucher } from "./pengingatVoucher";
import { formatTanggalWIB } from "./waktu";

let lulus = 0;
let gagal = 0;

function ok(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}

const SEKARANG = Date.UTC(2026, 9, 27, 3, 0); // 27 Oktober 2026, 10.00 WIB
const HARI = 86_400_000;

// ===== Sisa hari =====
ok(sisaHariVoucher(SEKARANG + 3 * HARI, SEKARANG) === 3, "tiga hari penuh = 3");
ok(sisaHariVoucher(SEKARANG + 2 * HARI + 1000, SEKARANG) === 2, "kelebihan jam tidak menambah hari");
ok(sisaHariVoucher(SEKARANG + 2 * 60 * 60 * 1000, SEKARANG) === 1, "sisa jam tidak pernah 0 hari");
ok(sisaHariVoucher(SEKARANG - HARI, SEKARANG) === 1, "sudah lewat tetap minimal 1");

// ===== Isi pesan =====
const pesan = pesanPengingatVoucher({
  nama: "Rani",
  judul: "Potongan biaya admin",
  kode: "VCR-ABC123",
  berlakuSampai: SEKARANG + 2 * HARI,
  sekarang: SEKARANG,
});

ok(pesan.includes("Halo Rani"), "menyapa nama pemilik");
ok(pesan.includes("Potongan biaya admin"), "menyebut judul voucher");
ok(pesan.includes("VCR-ABC123"), "menyebut kode voucher");
ok(pesan.includes(formatTanggalWIB(SEKARANG + 2 * HARI)), "menyebut tanggal berakhir WIB");
ok(pesan.includes("2 hari lagi"), "menyebut sisa hari");
ok(pesan.includes("sebelum hangus"), "menjelaskan akibatnya, bukan hanya tanggal");
ok(!pesan.includes("{"), "tidak ada placeholder yang lolos ke nasabah");

if (gagal > 0) {
  console.error(`\n${gagal} gagal, ${lulus} lulus`);
  process.exit(1);
}
console.log(`pengingatVoucher: ${lulus} lulus`);
