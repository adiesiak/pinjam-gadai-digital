/**
 * Uji voucher akad syariah.
 * Run: bun src/lib/syariah/voucher.test.ts
 *
 * Yang dijaga: potongan hanya menyentuh porsi platform (maks 15%), nisbah
 * pendana tidak berubah karena voucher, total kewajiban turun tepat sebesar
 * potongan, dan jenis voucher konvensional ditolak.
 */
import { bagiNisbah } from "./nisbah";
import { kalimatVoucherSyariah, rincianVoucherSyariah } from "./voucher";

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

// ===== Tanpa voucher =====
const polos = rincianVoucherSyariah({ pokok: 1_000_000, marginTotal: 200_000, voucher: null });
eq(polos.diskon, 0, "tanpa voucher tidak ada potongan");
eq(polos.totalKewajiban, 1_200_000, "total kewajiban = pokok + margin");
eq(polos.nisbahPendana, bagiNisbah(200_000).nisbahPendana, "nisbah pendana 85%");
eq(polos.nisbahPlatform, bagiNisbah(200_000).nisbahPlatform, "nisbah platform 15%");

// ===== Diskon margin =====
const margin = rincianVoucherSyariah({
  pokok: 1_000_000,
  marginTotal: 200_000,
  voucher: { jenis: "diskon_margin", nilai: 30_000 },
});
eq(margin.diskon, 30_000, "diskon margin berlaku penuh di bawah porsi platform");
eq(margin.batasPlatform, 30_000, "batas potongan = 15% margin");
eq(margin.marginSetelah, 170_000, "margin setelah potongan");
eq(margin.totalKewajiban, 1_170_000, "kewajiban turun sebesar potongan");
eq(margin.nisbahPendana, polos.nisbahPendana, "nisbah pendana tidak berkurang");
eq(margin.nisbahPlatform, 0, "platform menanggung seluruh potongan");
eq(margin.pendanaTerima, 1_170_000, "pokok + nisbah pendana utuh");
ok(
  margin.nisbahPendana + margin.nisbahPlatform + margin.diskon ===
    polos.nisbahPendana + polos.nisbahPlatform,
  "potongan + nisbah = porsi awal",
);

// ===== Potongan dibatasi porsi platform =====
const besar = rincianVoucherSyariah({
  pokok: 500_000,
  marginTotal: 100_000,
  voucher: { jenis: "diskon_margin", nilai: 500_000 },
});
eq(besar.diskon, 15_000, "potongan dibatasi 15% margin");
eq(besar.nisbahPlatform, 0, "platform tidak minus");
eq(besar.nisbahPendana, bagiNisbah(100_000).nisbahPendana, "pendana tetap 85%");
eq(besar.totalKewajiban, 585_000, "kewajiban hanya turun sebesar batas");

// ===== Diskon ujrah =====
const ujrah = rincianVoucherSyariah({
  pokok: 2_000_000,
  ujrahTotal: 100_000,
  voucher: { jenis: "diskon_ujrah", nilai: 10_000 },
});
eq(ujrah.dasar, 100_000, "dasar potongan = ujrah");
eq(ujrah.ujrahSetelah, 90_000, "ujrah setelah potongan");
eq(ujrah.totalKewajiban, 2_090_000, "kewajiban Rahn setelah potongan");
eq(ujrah.nisbahPendana, bagiNisbah(100_000).nisbahPendana, "nisbah pendana ujrah tetap");

// ===== Jenis yang salah ditolak =====
let pesan = "";
try {
  rincianVoucherSyariah({
    pokok: 1_000_000,
    marginTotal: 200_000,
    voucher: { jenis: "diskon_admin", nilai: 10_000 },
  });
} catch (err) {
  pesan = err instanceof Error ? err.message : "";
}
ok(pesan.includes("bukan voucher akad syariah"), "voucher biaya admin ditolak");

let pesanBoost = "";
try {
  rincianVoucherSyariah({
    pokok: 1_000_000,
    marginTotal: 200_000,
    voucher: { jenis: "boost_plafon", nilai: 500_000 },
  });
} catch (err) {
  pesanBoost = err instanceof Error ? err.message : "";
}
ok(pesanBoost.includes("bukan voucher akad syariah"), "boost limit bukan voucher syariah");

// ===== Kalimat layar =====
ok(
  kalimatVoucherSyariah(margin).includes("Rp 30.000"),
  "kalimat menyebut nominal potongan",
);
ok(
  kalimatVoucherSyariah(polos).includes("Pilih voucher"),
  "tanpa voucher meminta memilih",
);

const jumlah = lulus + gagal;
console.log(`syariah voucher.test: ${lulus}/${jumlah} lulus`);
if (gagal > 0) process.exit(1);
