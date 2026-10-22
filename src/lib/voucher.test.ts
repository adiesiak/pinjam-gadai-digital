/**
 * Uji mesin voucher konvensional.
 * Run: bun src/lib/voucher.test.ts
 *
 * Yang dijaga: kelayakan (aktif/kuota/masa berlaku/minimal pengajuan), boost
 * hanya menambah batas, potongan admin tidak pernah melebihi biaya admin, dan
 * plafon yang terpakai tetap sebesar pokok.
 */
import {
  batasUntukVoucher,
  boostTersedia,
  diskonBiayaAdmin,
  kelayakanVoucher,
  nilaiVoucherApresiasi,
  rincianVoucherPengajuan,
  sisaKuota,
  type VoucherRingkas,
} from "./voucher";

let lulus = 0;
let gagal = 0;

function ok(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}

function eq(hasil: unknown, acuan: unknown, label: string): void {
  ok(hasil === acuan, `${label} (dapat ${String(hasil)}, harus ${String(acuan)})`);
}

const SEKARANG = 1_800_000_000_000;

function voucher(ubah: Partial<VoucherRingkas> = {}): VoucherRingkas {
  return {
    _id: "v1",
    kode: "ADM-1",
    jenis: "diskon_admin",
    judul: "Bebas biaya admin",
    nilai: 20_000,
    minPokok: 100_000,
    batasPemakaian: 1,
    terpakai: 0,
    status: "aktif",
    berlakuSampai: SEKARANG + 30 * 86_400_000,
    ...ubah,
  };
}

// ===== Kelayakan =====
eq(sisaKuota(voucher()), 1, "kuota awal satu");
eq(sisaKuota(voucher({ batasPemakaian: 2, terpakai: 3 })), 0, "kuota tidak negatif");
ok(
  kelayakanVoucher(voucher(), { batasPengajuan: 500_000, sekarang: SEKARANG }).layak,
  "voucher aktif layak dipakai",
);

const kurangLimit = kelayakanVoucher(voucher({ minPokok: 1_000_000 }), {
  batasPengajuan: 500_000,
  sekarang: SEKARANG,
});
eq(kurangLimit.layak, false, "minimal di atas limit menolak voucher");
eq(
  kurangLimit.alasan,
  "Minimal pengajuan Rp 1.000.000 (Limit Anda saat ini Rp 500.000)",
  "alasan menyebut minimal dan limit",
);

ok(
  !kelayakanVoucher(voucher({ status: "terpakai" }), {
    batasPengajuan: 1_000_000,
    sekarang: SEKARANG,
  }).layak,
  "voucher terpakai tidak layak",
);
ok(
  !kelayakanVoucher(voucher({ berlakuSampai: SEKARANG - 1 }), {
    batasPengajuan: 1_000_000,
    sekarang: SEKARANG,
  }).layak,
  "voucher kedaluwarsa tidak layak",
);
ok(
  !kelayakanVoucher(voucher({ terpakai: 1 }), {
    batasPengajuan: 1_000_000,
    sekarang: SEKARANG,
  }).layak,
  "kuota habis tidak layak",
);

// ===== Boost limit =====
const boost = voucher({ jenis: "boost_plafon", nilai: 500_000, minPokok: 1_500_000 });
eq(
  batasUntukVoucher(voucher(), 1_000_000),
  1_000_000,
  "voucher diskon tidak menaikkan batas",
);
eq(
  batasUntukVoucher(boost, 1_000_000),
  1_500_000,
  "boost menaikkan batas sebesar nilainya",
);
ok(
  kelayakanVoucher(boost, {
    batasPengajuan: batasUntukVoucher(boost, 1_000_000),
    sekarang: SEKARANG,
  }).layak,
  "boost membuat minimal pengajuannya sendiri tercapai",
);
eq(
  boostTersedia([boost, voucher({ _id: "v2", jenis: "boost_plafon", nilai: 250_000 })], {
    tersedia: 1_000_000,
    sekarang: SEKARANG,
  }),
  750_000,
  "boost aktif dijumlahkan",
);
// Boost yang minimal pengajuannya belum tercapai walau boost-nya dihitung
// tidak menambah batas yang ditampilkan.
eq(
  boostTersedia([boost], { tersedia: 500_000, sekarang: SEKARANG }),
  0,
  "boost yang minimalnya belum tercapai tidak dihitung",
);
eq(
  boostTersedia([voucher({ jenis: "boost_plafon", status: "terpakai" })], {
    tersedia: 500_000,
    sekarang: SEKARANG,
  }),
  0,
  "boost terpakai tidak dihitung",
);

// ===== Potongan admin =====
eq(diskonBiayaAdmin(voucher({ nilai: 50_000 }), 20_000), 20_000, "potongan dibatasi biaya admin");
eq(diskonBiayaAdmin(voucher(), 20_000), 20_000, "potongan penuh bila di bawah biaya");
eq(diskonBiayaAdmin(null, 20_000), 0, "tanpa voucher tidak ada potongan");
eq(
  diskonBiayaAdmin(voucher({ jenis: "diskon_margin" }), 20_000),
  0,
  "voucher margin tidak memotong biaya admin",
);

// ===== Rincian pengajuan =====
const rincian = rincianVoucherPengajuan({
  pokok: 500_000,
  biayaAdmin: 10_000,
  biayaLain: 5_000,
  bunga: 150_000,
  voucher: voucher({ nilai: 10_000 }),
});
eq(rincian.diskonVoucher, 10_000, "diskon masuk rincian");
eq(rincian.biayaAdminSetelahDiskon, 0, "biaya admin setelah diskon nol");
eq(rincian.danaDiterima, 495_000, "dana diterima bertambah sebesar diskon");
eq(rincian.totalTagihan, 650_000, "total tagihan tidak berubah oleh diskon admin");
eq(rincian.plafonTerpakai, 500_000, "plafon terpakai tetap sebesar pokok");
eq(rincian.boostLimit, 0, "voucher diskon tidak menambah limit");

const rincianBoost = rincianVoucherPengajuan({
  pokok: 500_000,
  biayaAdmin: 10_000,
  biayaLain: 0,
  bunga: 150_000,
  voucher: voucher({ jenis: "boost_plafon", nilai: 500_000 }),
});
eq(rincianBoost.diskonVoucher, 0, "boost tidak memotong biaya");
eq(rincianBoost.boostLimit, 500_000, "boost dilaporkan sebagai limit ekstra");

// ===== Voucher apresiasi =====
eq(nilaiVoucherApresiasi(1_000_000), 10_000, "apresiasi 1% dari pokok");
eq(nilaiVoucherApresiasi(10_000_000), 25_000, "apresiasi dibatasi maksimum");
eq(nilaiVoucherApresiasi(100_000), 5_000, "apresiasi punya lantai");
eq(nilaiVoucherApresiasi(0), 0, "pokok tidak sah tidak menghasilkan voucher");

const jumlah = lulus + gagal;
console.log(`voucher.test: ${lulus}/${jumlah} lulus`);
if (gagal > 0) process.exit(1);
