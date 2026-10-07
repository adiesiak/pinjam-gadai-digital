/** Run: bun src/lib/bagiHasil.test.ts */
import {
  BUNGA_PINJAMAN_DEFAULT_PERSEN,
  POTONGAN_ADMIN_DEFAULT_PERSEN,
  bagiHasilPinjaman,
  bagiImbalHasil,
  bagiHasilPinjamanDari,
} from "./bagiHasil";
import { hitungSimulasiBulanan } from "./bulanan";
import { quotePinjaman } from "./loan";
import { percentOf } from "./money";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  }
}
function throws(fn: () => unknown, label: string) {
  try {
    fn();
    failed += 1;
    console.error(`FAIL ${label}: expected to throw`);
  } catch {
    passed += 1;
  }
}

// Kebijakan bawaan 5%: bagiImbalHasil memotong bruto apa pun yang diberikan
// pemanggil. Sejak kebijakan baru, bruto itu adalah UANG YANG KEMBALI
// (pokok + Imbal Hasil), bukan hanya Imbal Hasil — lihat bagiHasilPinjaman.
eq(POTONGAN_ADMIN_DEFAULT_PERSEN, 5, "kebijakan bawaan 5%");
const besar = bagiImbalHasil(5_000_000, POTONGAN_ADMIN_DEFAULT_PERSEN);
eq(besar.potonganAdmin, 250_000, "5% dari Rp 5.000.000");
eq(besar.imbalBersih, 4_750_000, "bersih = bruto − potongan");

// Ibu jari: pembulatan potongan ke BAWAH, sisa selalu milik penyedia dana.
const ganjil = bagiImbalHasil(33_333, 5);
eq(ganjil.potonganAdmin, 1_666, "floor 5% dari Rp 33.333 (bukan 1.667)");
eq(ganjil.imbalBersih, 31_667, "sisa rupiah tidak masuk ke kas admin");

// Jumlah kecil: potongan nol, tidak ada rupiah yang hilang.
const kecil = bagiImbalHasil(19, 5);
eq(kecil.potonganAdmin, 0, "Rp 19 → potongan Rp 0 (floor)");
eq(kecil.imbalBersih, 19, "penyedia dana tetap menerima penuh");

// Potongan 0% (kebijakan dinonaktifkan) dan 100% (batas ekstrem).
eq(bagiImbalHasil(1_000_000, 0).potonganAdmin, 0, "0% tidak memotong");
eq(bagiImbalHasil(1_000_000, 0).imbalBersih, 1_000_000, "0% utuh untuk penyedia");
eq(bagiImbalHasil(1_000_000, 100).potonganAdmin, 1_000_000, "100% seluruhnya potongan");
eq(bagiImbalHasil(1_000_000, 100).imbalBersih, 0, "100% menyisakan nol");

// Persentase pecahan (mis. 2,5%) tetap bilangan bulat & tepat.
const setengah = bagiImbalHasil(1_000_000, 2.5);
eq(setengah.potonganAdmin, 25_000, "2,5% dari Rp 1.000.000");
eq(setengah.imbalBersih, 975_000, "bersih 2,5%");

// Invariant yang harus selalu benar: bruto = potongan + bersih.
for (const bruto of [0, 1, 999, 100_000, 1_234_567, 999_999_999]) {
  for (const persen of [0, 2.5, 3, 5, 12.75, 100]) {
    const h = bagiImbalHasil(bruto, persen);
    eq(
      h.potonganAdmin + h.imbalBersih,
      bruto,
      `tidak ada rupiah hilang (bruto ${bruto}, ${persen}%)`,
    );
  }
}

throws(() => bagiImbalHasil(-1, 5), "Imbal Hasil negatif ditolak");
throws(() => bagiImbalHasil(1.5, 5), "Imbal Hasil pecahan ditolak");
throws(() => bagiImbalHasil(1_000_000, -1), "persentase negatif ditolak");
throws(() => bagiImbalHasil(1_000_000, 101), "persentase >100 ditolak");

// ===== Bagi hasil pinjaman (model 1 pinjaman = 1 pendana) =====
// Contoh acuan kebijakan yang berlaku: pokok Rp1.000.000, bunga 30% → uang yang
// kembali Rp1.300.000. Potongan admin 5% diambil dari UANG YANG KEMBALI
// (Rp65.000), bukan dari Imbal Hasil saja (kalau Imbal Hasil, angkanya
// Rp15.000). Penyedia dana menerima Rp1.235.000 — pokoknya utuh, keuntungannya
// yang terpotong Rp65.000 dari Rp300.000.
// Angka-angka ini wajib sama dengan yang dibukukan ledger saat pelunasan
// (convex/loans.ts memakai bagiImbalHasil atas alokasi + Imbal Hasil bagian) —
// kalau salah satu sisi berubah sendiri, pengguna melihat janji yang tidak
// pernah dibayar.
eq(BUNGA_PINJAMAN_DEFAULT_PERSEN, 30, "bunga pinjaman bawaan 30%");
const acuan = bagiHasilPinjaman(1_000_000, 30, 5);
eq(acuan.bunga, 300_000, "bunga = 30% dari pokok");
eq(acuan.totalLunas, 1_300_000, "total lunas = pokok + bunga");
eq(acuan.potonganAdmin, 65_000, "potongan admin = 5% dari UANG YANG KEMBALI (Rp1.300.000)");
eq(
  acuan.potonganAdmin === Math.round(acuan.bunga * 0.05),
  false,
  "dasar potongan bukan Imbal Hasil (kalau Imbal Hasil, angkanya Rp15.000)",
);
eq(acuan.pendanaTerima, 1_235_000, "yang diterima penyedia dana = uang kembali − potongan");
eq(acuan.keuntunganPendana, 235_000, "keuntungan bersih penyedia dana");
eq(acuan.keuntunganAdmin, 65_000, "keuntungan admin = potongan");

// Pendana menerima pokok kembali utuh + keuntungan; admin tidak menyentuh pokok.
eq(
  acuan.pendanaTerima - acuan.keuntunganPendana,
  1_000_000,
  "pokok kembali utuh ke penyedia dana",
);

// Pokok tak rata: bunga memakai pembulatan HALF-UP yang sama dengan quoteLoan,
// sedangkan potongan admin tetap KE BAWAH agar sisa rupiah milik penyedia dana.
const ganjilPinjam = bagiHasilPinjaman(500_150, 30, 5);
eq(ganjilPinjam.bunga, 150_045, "30% dari Rp500.150 sama dengan yang ditagih Peminjam");
eq(ganjilPinjam.totalLunas, 650_195, "total lunas akurat");
eq(ganjilPinjam.potonganAdmin, 32_509, "floor 5% dari uang yang kembali Rp650.195 (bukan 32.510)");
eq(
  ganjilPinjam.potonganAdmin + ganjilPinjam.pendanaTerima,
  ganjilPinjam.totalLunas,
  "tidak ada rupiah hilang antara admin dan penyedia",
);

// Kebijakan dinonaktifkan & batas ekstrem.
eq(bagiHasilPinjaman(1_000_000, 30, 0).keuntunganAdmin, 0, "0% admin tidak memotong");
eq(
  bagiHasilPinjaman(1_000_000, 30, 0).keuntunganPendana,
  300_000,
  "0% admin menyisakan bunga penuh untuk penyedia",
);

// Invariant: potongan + pendanaTerima = totalLunas; keuntunganPendana = bunga − potongan.
for (const pokok of [0, 1, 500_150, 1_000_000, 2_000_000, 999_999_999]) {
  for (const persenBunga of [0, 7.5, 10, 30]) {
    for (const persenAdmin of [0, 2.5, 5]) {
      const h = bagiHasilPinjaman(pokok, persenBunga, persenAdmin);
      eq(
        h.potonganAdmin + h.pendanaTerima,
        h.totalLunas,
        `potongan + diterima = total (pokok ${pokok}, bunga ${persenBunga}%, admin ${persenAdmin}%)`,
      );
      eq(
        h.keuntunganPendana,
        h.bunga - h.potonganAdmin,
        `keuntungan pendana = bunga − potongan (pokok ${pokok})`,
      );
    }
  }
}

// Imbangan lintas-modul: angka yang dilihat admin/penyedia dana harus sama
// dengan angka yang benar-benar dibukukan ledger saat pelunasan. Ledger memakai
// quotePinjaman (kewajiban Peminjam) + bagiImbalHasil atas UANG YANG KEMBALI;
// panel memakai bagiHasilPinjaman. Invarian inilah yang dulu tidak ada,
// sehingga dashboard dan ledger bisa menunjuk angka berbeda tanpa ada tes yang
// gagal.
for (const pokok of [1, 999, 100_000, 333_333, 500_150, 1_000_000, 1_999_999, 7_777_777]) {
  for (const persenBunga of [0, 7.5, 10, 30]) {
    for (const persenAdmin of [0, 2.5, 5]) {
      const panel = bagiHasilPinjaman(pokok, persenBunga, persenAdmin);
      const tagihan = quotePinjaman({ pokokPinjaman: pokok, persenBunga });
      const ledger = bagiImbalHasil(
        tagihan.totalKewajibanPelunasan,
        persenAdmin,
      );
      eq(
        panel.bunga,
        tagihan.bunga,
        `bunga panel = bunga yang ditagih ke Peminjam (pokok ${pokok}, ${persenBunga}%)`,
      );
      eq(
        panel.totalLunas,
        tagihan.totalKewajibanPelunasan,
        `total kewajiban panel = kewajiban Peminjam (pokok ${pokok})`,
      );
      eq(
        panel.potonganAdmin,
        ledger.potonganAdmin,
        `potongan admin panel = yang dibukukan ledger (pokok ${pokok}, admin ${persenAdmin}%)`,
      );
      eq(
        panel.pendanaTerima,
        ledger.imbalBersih,
        `diterima penyedia dana panel = yang dibayarkan ledger (pokok ${pokok})`,
      );
      eq(
        panel.keuntunganPendana,
        panel.pendanaTerima - pokok,
        `keuntungan penyedia dana = diterima − pokok (pokok ${pokok})`,
      );
      eq(
        panel.potonganAdmin + panel.pendanaTerima,
        tagihan.totalKewajibanPelunasan,
        `potongan + diterima penyedia = kewajiban Peminjam (pokok ${pokok})`,
      );
    }
  }
}

// Skema BULANAN: Imbal Hasil penyedia dana = bunga SELAMA TENOR dari simulasi
// bulanan, bukan satu bulan bunga. Memakai satu bulan membuat nominal yang
// dicatat admin untuk penyedia dana (dan angka keuntungan di panel) berbeda
// dari yang dibukukan ledger saat pelunasan.
for (const [pokok, tenorBulan, persenBulan] of [
  [1_000_000, 1, 10],
  [2_000_000, 3, 10],
  [3_333_333, 3, 7.5],
  [5_000_000, 6, 8],
] as const) {
  const sim = hitungSimulasiBulanan(pokok, tenorBulan, {
    persenBungaPerBulan: persenBulan,
  });
  const panel = bagiHasilPinjamanDari(
    { pokokPinjaman: pokok, tenorBulan, persenBunga: persenBulan },
    5,
  );
  // Dasar potongan = pokok + Imbal Hasil tenor; biaya admin cicilan sudah milik
  // platform (dibukukan sebagai platform_fee), jadi tidak ikut dipotong.
  const dasar = sim.totalPengembalian - sim.biayaAdminCicilanTotal;
  const ledger = bagiImbalHasil(dasar, 5);
  eq(dasar, pokok + sim.bungaTotal, `dasar potongan bulanan = pokok + Imbal Hasil tenor (pokok ${pokok})`);
  eq(
    panel.bunga,
    sim.bungaTotal,
    `bunga bulanan = total Imbal Hasil tenor (pokok ${pokok}, ${tenorBulan} bln)`,
  );
  eq(
    panel.totalLunas,
    sim.totalPengembalian,
    `kewajiban bulanan = totalPengembalian simulasi (pokok ${pokok})`,
  );
  eq(
    panel.potonganAdmin,
    ledger.potonganAdmin,
    `potongan admin bulanan = yang dibukukan ledger (pokok ${pokok})`,
  );
  eq(
    panel.pendanaTerima,
    ledger.imbalBersih,
    `diterima penyedia bulanan = yang dibayarkan ledger (pokok ${pokok})`,
  );
  eq(
    panel.keuntunganPendana,
    ledger.imbalBersih - pokok,
    `keuntungan penyedia bulanan = yang dibayarkan ledger − pokok (pokok ${pokok})`,
  );
  eq(
    panel.potonganAdmin + panel.pendanaTerima,
    dasar,
    `potongan + diterima penyedia = uang yang kembali bagian dasar (pokok ${pokok})`,
  );
  eq(
    panel.pendanaTerima,
    pokok + sim.bungaTotal - panel.potonganAdmin,
    `diterima penyedia bulanan = pokok + Imbal Hasil tenor − potongan (pokok ${pokok})`,
  );
  eq(
    panel.pendanaTerima > pokok,
    true,
    `pokok bulanan kembali utuh dan penyedia masih untung (pokok ${pokok})`,
  );
  // Tanpa tenorBulan, skema harian tetap 30% flat dari pokok.
  eq(
    bagiHasilPinjamanDari({ pokokPinjaman: pokok, persenBunga: 30 }, 5).bunga,
    percentOf(pokok, 30),
    `tanpa tenorBulan tetap skema harian (pokok ${pokok})`,
  );
}

throws(() => bagiHasilPinjaman(-1, 30, 5), "pokok negatif ditolak");
throws(() => bagiHasilPinjaman(1.5, 30, 5), "pokok pecahan ditolak");
throws(() => bagiHasilPinjaman(1_000_000, -1, 5), "bunga negatif ditolak");
throws(() => bagiHasilPinjaman(1_000_000, 30, 101), "potongan admin >100 ditolak");

console.log(`bagiHasil.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
