/**
 * Uji mesin voucher konvensional.
 * Run: bun src/lib/voucher.test.ts
 *
 * Yang dijaga: kelayakan (aktif/kuota/masa berlaku/minimal pengajuan), boost
 * hanya menambah batas, potongan admin tidak pernah melebihi biaya admin, dan
 * plafon yang terpakai tetap sebesar pokok.
 */
import {
  akhirHariVoucher,
  batasUntukVoucher,
  boostTersedia,
  diskonBiayaAdmin,
  kelayakanVoucher,
  labelNilaiVoucher,
  nilaiVoucherApresiasi,
  periksaNilaiVoucher,
  periksaUbahVoucher,
  satuanVoucher,
  ringkasVoucherAdmin,
  rincianVoucherPengajuan,
  sisaHariVoucher,
  sisaKuota,
  statusTampilVoucher,
  tanggalInputVoucher,
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
  500_000,
  "boost terbesar dipakai, bukan dijumlahkan",
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

// ===== Pengaturan voucher oleh admin =====

// Status baca: masa berlaku lewat tidak mengubah baris di basis data, tetapi
// panel admin harus melihatnya sebagai kedaluwarsa — bukan aktif.
eq(
  statusTampilVoucher(
    { status: "aktif", berlakuSampai: SEKARANG + 86_400_000 },
    SEKARANG,
  ),
  "aktif",
  "aktif dengan masa berlaku tersisa",
);
eq(
  statusTampilVoucher(
    { status: "aktif", berlakuSampai: SEKARANG - 1 },
    SEKARANG,
  ),
  "kedaluwarsa",
  "aktif yang sudah lewat dibaca kedaluwarsa",
);
eq(
  statusTampilVoucher({ status: "terpakai", berlakuSampai: SEKARANG - 1 }, SEKARANG),
  "terpakai",
  "status simpan dipertahankan bila bukan aktif",
);

eq(sisaHariVoucher(SEKARANG + 10 * 86_400_000, SEKARANG), 10, "sisa 10 hari");
eq(sisaHariVoucher(SEKARANG - 5, SEKARANG), 0, "sisa hari tidak pernah negatif");

eq(sisaHariVoucher(Number.NaN, SEKARANG), 0, "nilai tidak sah → 0 hari");

// Ringkasan kepala panel: hanya voucher aktif menyumbang nilai dan hitungan
// "hampir berakhir", sedangkan kedaluwarsa dihitung terpisah.
const ringkas = ringkasVoucherAdmin(
  [
    { status: "aktif", jenis: "diskon_admin", berlakuSampai: SEKARANG + 3 * 86_400_000, nilai: 20_000 },
    { status: "aktif", jenis: "boost_plafon", berlakuSampai: SEKARANG + 30 * 86_400_000, nilai: 10_000 },
    { status: "aktif", jenis: "diskon_admin", berlakuSampai: SEKARANG - 86_400_000, nilai: 50_000 },
    { status: "terpakai", jenis: "diskon_admin", berlakuSampai: SEKARANG + 5 * 86_400_000, nilai: 15_000 },
    { status: "dicabut", jenis: "diskon_admin", berlakuSampai: SEKARANG + 5 * 86_400_000, nilai: 25_000 },
    // Poin bunga dan hari tenor tidak ikut dijumlahkan sebagai rupiah.
    { status: "aktif", jenis: "diskon_bunga", berlakuSampai: SEKARANG + 10 * 86_400_000, nilai: 5 },
    { status: "aktif", jenis: "tambah_tenor", berlakuSampai: SEKARANG + 10 * 86_400_000, nilai: 7 },
  ],
  SEKARANG,
);
eq(ringkas.total, 7, "total baris ringkasan");
eq(ringkas.aktif, 4, "empat voucher aktif");
eq(ringkas.kedaluwarsa, 1, "satu voucher kedaluwarsa");
eq(ringkas.terpakai, 1, "satu voucher habis");
eq(ringkas.dicabut, 1, "satu voucher dicabut");
eq(
  ringkas.nilaiAktif,
  30_000,
  "nilai aktif hanya rupiah dan hanya dari yang masih berlaku",
);
eq(ringkas.hampirBerakhir, 1, "hanya yang <= 7 hari dihitung hampir berakhir");

// Periksa suntingan admin — satu sumber untuk layar dan server.
eq(
  periksaUbahVoucher({
    judul: "Bebas biaya admin",
    batasPemakaian: 3,
    berlakuSampai: SEKARANG + 86_400_000,
    terpakai: 1,
    sekarang: SEKARANG,
  }),
  null,
  "isian sunting yang sah tidak menghasilkan galat",
);
ok(
  periksaUbahVoucher({ judul: "ab", terpakai: 0, sekarang: SEKARANG }) !== null,
  "judul terlalu pendek ditolak",
);
ok(
  periksaUbahVoucher({ batasPemakaian: 0, terpakai: 0, sekarang: SEKARANG }) !== null,
  "kuota 0 ditolak",
);
ok(
  periksaUbahVoucher({ batasPemakaian: 11, terpakai: 0, sekarang: SEKARANG }) !== null,
  "kuota di atas batas maksimum ditolak",
);
ok(
  periksaUbahVoucher({ batasPemakaian: 2, terpakai: 3, sekarang: SEKARANG }) !== null,
  "kuota tidak boleh turun di bawah pemakaian",
);
ok(
  periksaUbahVoucher({ berlakuSampai: SEKARANG, terpakai: 0, sekarang: SEKARANG }) !== null,
  "masa berlaku yang sudah lewat/pas ditolak",
);// Tanggal akhir hari WIB: voucher "31 Desember" berlaku sepanjang hari itu.
const akhirTahun = akhirHariVoucher("2026-12-31");
eq(
  akhirTahun === null ? null : new Date(akhirTahun).toISOString(),
  "2026-12-31T16:59:59.999Z",
  "akhir hari WIB = 16.59.59.999 UTC",
);
eq(
  akhirTahun === null ? null : tanggalInputVoucher(akhirTahun),
  "2026-12-31",
  "bolak-balik tanggal isian",
);
eq(akhirHariVoucher("31/12/2026"), null, "format tanggal lain ditolak");
eq(akhirHariVoucher("2026-02-31"), null, "tanggal mustahil ditolak");

// ===== Satuan & nilai jenis baru =====
eq(satuanVoucher("diskon_admin"), "rupiah", "potongan admin memakai rupiah");
eq(satuanVoucher("boost_plafon"), "rupiah", "boost memakai rupiah");
eq(satuanVoucher("diskon_bunga"), "persen", "potongan bunga memakai poin persen");
eq(satuanVoucher("tambah_tenor"), "hari", "tambah tenor memakai hari");

eq(
  labelNilaiVoucher("diskon_bunga", 5),
  "bunga −5%",
  "label poin bunga bukan rupiah",
);
eq(
  labelNilaiVoucher("tambah_tenor", 7),
  "tenor +7 hari",
  "label tambahan tenor dalam hari",
);
eq(
  labelNilaiVoucher("diskon_admin", 25_000),
  "potongan Rp 25.000",
  "label potongan admin tetap rupiah",
);

eq(periksaNilaiVoucher("diskon_bunga", 1), null, "satu poin bunga sah");
eq(periksaNilaiVoucher("diskon_bunga", 25), null, "25 poin bunga sah");
ok(
  periksaNilaiVoucher("diskon_bunga", 0) !== null,
  "nol poin bunga ditolak",
);
ok(
  periksaNilaiVoucher("diskon_bunga", 26) !== null,
  "di atas 25 poin bunga ditolak",
);
eq(periksaNilaiVoucher("tambah_tenor", 7), null, "tujuh hari tenor sah");
ok(
  periksaNilaiVoucher("tambah_tenor", 31) !== null,
  "tambahan tenor di atas 30 hari ditolak",
);
ok(
  periksaNilaiVoucher("tambah_tenor", 0) !== null,
  "tambahan tenor nol hari ditolak",
);
ok(
  periksaNilaiVoucher("diskon_admin", 0) !== null,
  "potongan rupiah nol ditolak",
);

const jumlah = lulus + gagal;
console.log(`voucher.test: ${lulus}/${jumlah} lulus`);
if (gagal > 0) process.exit(1);
