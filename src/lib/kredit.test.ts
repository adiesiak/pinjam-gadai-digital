/**
 * Tests Skema C Kredit Barang — dependency-free (konvensi gadai.test.ts).
 * Run: bun src/lib/kredit.test.ts
 */
import {
  bagiCicilanKePendana,
  hakImbalHasilPerAlokasi,
  KATALOG_CONTOH,
  KREDIT_ASUMSI_AWAL,
  KREDIT_BARANG_POKOK_MAKS,
  KREDIT_PRICING,
  KREDIT_TENOR_PENGAJUAN_OPTIONS,
  pokokKreditBarangDalamBatas,
  quoteKreditBarang,
} from "./kredit";

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    passed += 1;
  } else {
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

// ---- Quote dasar: 10jt, DP 20%, 12 bulan, Imbal Hasil 2,5%/bulan ----
const q = quoteKreditBarang({
  hargaBarang: 10_000_000,
  dpPersen: 20,
  tenorBulan: 12,
  marginPersenPerBulan: 2.5,
});
eq(q.dp, 2_000_000, "DP 20% dari 10jt = 2jt");
eq(q.pokokDibiayai, 8_000_000, "pokok dibiayai = 8jt");
eq(q.biayaLayanan, 240_000, "biaya layanan platform 3% dari pokok = 240rb");
eq(q.marginPerBulan, 200_000, "Imbal Hasil 2,5% dari 8jt = 200rb/bulan");
eq(q.marginTotal, 2_400_000, "total Imbal Hasil 12 bulan = 2,4jt");
eq(q.cicilanPerBulan, 866_666, "cicilan bulanan = 666.666 pokok + 200rb");
eq(q.cicilanTerakhir, 866_674, "cicilan terakhir menyerap pembulatan");
eq(q.totalDibayarKonsumen, 12_640_000, "total dibayar Konsumen = 2jt + 240rb + 8jt + 2,4jt");
eq(
  q.totalDibayarKonsumen,
  q.dp + q.biayaLayanan + q.pokokDibiayai + q.marginTotal,
  "identitas: total Konsumen = DP + biaya layanan + pokok + Imbal Hasil",
);
eq(q.porsiPendana, 8_000_000, "porsi pendanaan 100% = pokok");
eq(q.imbalHasilPerBulan, 200_000, "Imbal Hasil Pendana per bulan");
eq(q.imbalHasil, 2_400_000, "total Imbal Hasil Pendana");
eq(q.totalDiterima, 10_400_000, "porsi + Imbal Hasil saat lunas");
eq(q.persenImbalHasil, 30, "Imbal Hasil 30% dari porsi (12 bulan)");
eq(q.persenImbalHasilTahunan, 30, "setara 30% per tahun");

// ---- Identitas jadwal ----
eq(q.jadwal.length, 12, "jadwal 12 bulan");
eq(
  q.jadwal.reduce((acc, row) => acc + row.pokok, 0),
  q.pokokDibiayai,
  "Σ cicilan pokok = pokok dibiayai",
);
eq(
  q.jadwal.reduce((acc, row) => acc + row.margin, 0),
  q.marginTotal,
  "Σ Imbal Hasil = total Imbal Hasil",
);
eq(q.jadwal[q.jadwal.length - 1].sisaPokok, 0, "sisa pokok akhir = 0");
eq(q.dp + q.pokokDibiayai, q.hargaBarang, "DP + pokok dibiayai = harga barang");

// ---- Porsi pendanaan sebagian (Alokasi Dana bersama Pendana lain) ----
const sebagian = quoteKreditBarang({
  hargaBarang: 10_000_000,
  dpPersen: 20,
  tenorBulan: 12,
  marginPersenPerBulan: 2.5,
  porsiPendanaPersen: 50,
});
eq(sebagian.porsiPendana, 4_000_000, "porsi 50% = 4jt");
eq(sebagian.imbalHasilPerBulan, 100_000, "Imbal Hasil proporsional 50%");
eq(sebagian.imbalHasil, 1_200_000, "total Imbal Hasil 50% = 1,2jt");
eq(sebagian.totalDiterima, 5_200_000, "total diterima porsi 50%");
eq(sebagian.persenImbalHasil, 30, "persen Imbal Hasil tetap 30%");

// ---- Tenor 3 bulan: skema bulanan (DP 0%, bunga 25%/bln dari saldo pokok) ----
const pendek = quoteKreditBarang({
  hargaBarang: 10_000_000,
  dpPersen: 0,
  tenorBulan: 3,
  // Diabaikan skema bulanan — bunga mengikuti tenor (3–5 bln = 25%/bln).
  marginPersenPerBulan: KREDIT_PRICING.marginMinPersenPerBulan,
});
eq(pendek.dp, 0, "tenor 3 bulan: DP 0 (skema bulanan)");
eq(pendek.pokokDibiayai, 10_000_000, "tenor 3 bulan: pokok dibiayai = harga barang");
eq(pendek.marginPerBulan, 2_500_000, "Imbal Hasil 25% dari 10jt = 2,5jt");
eq(pendek.marginTotal, 5_000_001, "total Imbal Hasil saldo menurun selama 3 bulan");
eq(pendek.biayaAdmin, 200_000, "biaya admin 2% dari 10jt (dipotong di muka)");
eq(pendek.biayaPlatform, 300_000, "biaya platform 3% dari 10jt (dipotong di muka)");
eq(pendek.biayaLayanan, 500_000, "total biaya tenor 5% dari 10jt (dipotong di muka)");
eq(pendek.cicilanPerBulan, 5_833_333, "cicilan 3 bulan pertama = pokok + Imbal Hasil");
eq(pendek.persenImbalHasil, 50, "Imbal Hasil 50% dari pokok penuh (3 bulan)");
eq(pendek.persenImbalHasilTahunan, 200, "setara 200% per tahun (50% × 12/3)");
eq(
  pendek.jadwal.reduce((acc, row) => acc + row.pokok, 0),
  pendek.pokokDibiayai,
  "Σ pokok tenor 3 bulan tetap utuh",
);

// ---- Tenor 12 bulan pada Imbal Hasil minimum skema (DP + margin flat) ----
const flatMin = quoteKreditBarang({
  hargaBarang: 10_000_000,
  dpPersen: 20,
  tenorBulan: 12,
  marginPersenPerBulan: KREDIT_PRICING.marginMinPersenPerBulan,
});
eq(flatMin.marginPerBulan, 200_000, "flat: Imbal Hasil 2,5% dari 8jt = 200rb");
eq(flatMin.marginTotal, 2_400_000, "flat: total Imbal Hasil 12 bulan");
eq(flatMin.persenImbalHasil, 30, "flat: Imbal Hasil 30% dari porsi");
eq(flatMin.persenImbalHasilTahunan, 30, "flat: setara 30% per tahun");

// ---- Tenor panjang ----
const panjang = quoteKreditBarang({
  hargaBarang: 4_500_000,
  dpPersen: 20,
  tenorBulan: 24,
  marginPersenPerBulan: 2.5,
});
eq(panjang.dp, 900_000, "DP 20% dari 4,5jt");
eq(panjang.pokokDibiayai, 3_600_000, "pokok dibiayai 3,6jt");
eq(panjang.cicilanPerBulan, 240_000, "cicilan 24 bulan = 150rb + 90rb");
eq(panjang.persenImbalHasil, 60, "Imbal Hasil 60% untuk tenor 24 bulan");
eq(panjang.persenImbalHasilTahunan, 30, "setara 30% per tahun");

// ---- Validasi batas skema ----
throws(
  () =>
    quoteKreditBarang({
      hargaBarang: 10_000_000,
      dpPersen: KREDIT_PRICING.dpMinPersen - 1,
      tenorBulan: 12,
      marginPersenPerBulan: 2.5,
    }),
  "DP di bawah minimum ditolak",
);
throws(
  () =>
    quoteKreditBarang({
      hargaBarang: 10_000_000,
      dpPersen: KREDIT_PRICING.dpMaxPersen + 10,
      tenorBulan: 12,
      marginPersenPerBulan: 2.5,
    }),
  "DP di atas maksimum ditolak",
);
throws(
  () =>
    quoteKreditBarang({
      hargaBarang: 10_000_000,
      dpPersen: 20,
      tenorBulan: 5,
      marginPersenPerBulan: 2.5,
    }),
  "tenor di luar pilihan ditolak",
);
throws(
  () =>
    quoteKreditBarang({
      hargaBarang: 10_000_000,
      dpPersen: 20,
      tenorBulan: 12,
      marginPersenPerBulan: KREDIT_PRICING.marginMinPersenPerBulan - 0.5,
    }),
  "Imbal Hasil di bawah minimum ditolak",
);
throws(
  () =>
    quoteKreditBarang({
      hargaBarang: 10_000_000,
      dpPersen: 20,
      tenorBulan: 12,
      marginPersenPerBulan: KREDIT_PRICING.marginMaxPersenPerBulan + 0.5,
    }),
  "Imbal Hasil di atas maksimum ditolak",
);
throws(
  () =>
    quoteKreditBarang({
      hargaBarang: KREDIT_PRICING.minHargaBarang - 1,
      dpPersen: 20,
      tenorBulan: 12,
      marginPersenPerBulan: 2.5,
    }),
  "harga barang di bawah minimum ditolak",
);
throws(
  () =>
    quoteKreditBarang({
      hargaBarang: KREDIT_PRICING.maxHargaBarang + 1,
      dpPersen: 20,
      tenorBulan: 12,
      marginPersenPerBulan: 2.5,
    }),
  "harga barang di atas maksimum ditolak",
);
throws(
  () =>
    quoteKreditBarang({
      hargaBarang: 10_000_000,
      dpPersen: 20,
      tenorBulan: 12,
      marginPersenPerBulan: 2.5,
      porsiPendanaPersen: KREDIT_PRICING.minPorsiPendanaPersen - 5,
    }),
  "porsi pendanaan di bawah minimum ditolak",
);
throws(
  () =>
    quoteKreditBarang({
      hargaBarang: 10_000_000,
      dpPersen: 20,
      tenorBulan: 12,
      marginPersenPerBulan: 2.5,
      porsiPendanaPersen: 150,
    }),
  "porsi pendanaan di atas 100% ditolak",
);

// ---- Pembagian cicilan ke Pendana (bagiCicilanKePendana) ----
const satu = bagiCicilanKePendana(666_666, 200_000, 8_000_000, [8_000_000]);
eq(satu.length, 1, "satu Pendana → satu porsi");
eq(satu[0].pokok, 666_666, "pokok cicilan penuh ke Pendana tunggal");
eq(satu[0].margin, 200_000, "Imbal Hasil penuh ke Pendana tunggal");
eq(satu[0].total, 866_666, "penerimaan Pendana tunggal bulan ini");

const dua = bagiCicilanKePendana(666_666, 200_000, 8_000_000, [5_000_000, 3_000_000]);
eq(dua.reduce((a, x) => a + x.pokok, 0), 666_666, "Σ pokok cicilan terbagi utuh");
eq(dua.reduce((a, x) => a + x.margin, 0), 200_000, "Σ Imbal Hasil terbagi utuh");
eq(dua[0].pokok, 416_667, "porsi 5jt menyerap selisih pembulatan pokok");
eq(dua[1].pokok, 249_999, "porsi 3jt menerima pokok proporsional");
eq(dua[0].margin, 125_000, "Imbal Hasil proporsional 5/8");
eq(dua[1].margin, 75_000, "Imbal Hasil proporsional 3/8");
eq(dua[0].total + dua[1].total, 866_666, "total penerimaan = cicilan bulan ini");

const tiga = bagiCicilanKePendana(666_666, 200_000, 8_000_000, [2_000_000, 3_000_000, 3_000_000]);
eq(tiga.reduce((a, x) => a + x.total, 0), 866_666, "tiga Pendana: total tetap sama");
eq(tiga.every((x) => x.total > 0), true, "setiap Pendana menerima bagian");

// ---- Hak Imbal Hasil per alokasi: hak tersimpan = hak yang diterima ----
const alokasiSim = [4_500_000, 2_500_000, 1_000_000] as const;
const hakSim = hakImbalHasilPerAlokasi(q.marginTotal, q.pokokDibiayai, alokasiSim);
eq(hakSim.reduce((a, x) => a + x, 0), q.marginTotal, "Σ hak = total Imbal Hasil");
eq(
  hakSim[1],
  Math.floor((q.marginTotal * 2_500_000) / 8_000_000),
  "hak non-terbesar = floor proporsional",
);
eq(
  hakSim[2],
  Math.floor((q.marginTotal * 1_000_000) / 8_000_000),
  "hak porsi kecil = floor proporsional",
);
eq(hakSim[0], q.marginTotal - hakSim[1] - hakSim[2], "hak terbesar = sisa (dust)");

// ---- Simulasi 12 bulan: tiap Pendana menerima TEPAT porsi & haknya ----
const pokokPerPendana = [0, 0, 0];
const marginPerPendana = [0, 0, 0];
let pokokKembali = 0;
let marginKembali = 0;
for (const row of q.jadwal) {
  const porsi = bagiCicilanKePendana(row.pokok, row.margin, q.pokokDibiayai, alokasiSim, {
    pokokSebelumnya: pokokKembali,
    marginSebelumnya: marginKembali,
  });
  eq(
    porsi.reduce((a, x) => a + x.total, 0),
    row.total,
    `bulan ${row.bulan}: Σ pembagian = cicilan bulan itu`,
  );
  for (let i = 0; i < porsi.length; i += 1) {
    pokokPerPendana[i] += porsi[i].pokok;
    marginPerPendana[i] += porsi[i].margin;
  }
  pokokKembali += row.pokok;
  marginKembali += row.margin;
}
eq(pokokKembali, q.pokokDibiayai, "12 bulan mengembalikan seluruh pokok dibiayai");
eq(marginKembali, q.marginTotal, "12 bulan membayar seluruh Imbal Hasil");
eq(pokokPerPendana[0], 4_500_000, "Pendana 4,5jt kembali TEPAT 4,5jt");
eq(pokokPerPendana[1], 2_500_000, "Pendana 2,5jt kembali TEPAT 2,5jt");
eq(pokokPerPendana[2], 1_000_000, "Pendana 1jt kembali TEPAT 1jt");
eq(marginPerPendana[0], hakSim[0], "Imbal Hasil Pendana terbesar tepat haknya");
eq(marginPerPendana[1], hakSim[1], "Imbal Hasil Pendana 2,5jt tepat haknya");
eq(marginPerPendana[2], hakSim[2], "Imbal Hasil Pendana 1jt tepat haknya");

throws(
  () => bagiCicilanKePendana(100_000, 10_000, 8_000_000, []),
  "pembagian tanpa posisi Pendana ditolak",
);
throws(
  () => bagiCicilanKePendana(100_000, 10_000, 8_000_000, [5_000_000]),
  "pembagian saat pendanaan belum penuh ditolak",
);
throws(
  () => bagiCicilanKePendana(0, 10_000, 8_000_000, [8_000_000]),
  "pokok cicilan nol ditolak",
);
throws(
  () => bagiCicilanKePendana(100_000, -1, 8_000_000, [8_000_000]),
  "Imbal Hasil negatif ditolak",
);
throws(
  () => bagiCicilanKePendana(100_000, 10_000, 8_000_000, [4_000_000, 4_000_000, -1]),
  "alokasi tidak positif ditolak",
);
throws(
  () =>
    bagiCicilanKePendana(100_000, 10_000, 8_000_000, [8_000_000], {
      pokokSebelumnya: -1,
      marginSebelumnya: 0,
    }),
  "konteks kumulatif negatif ditolak",
);
throws(
  () => hakImbalHasilPerAlokasi(1_000_000, 8_000_000, [5_000_000]),
  "hak Imbal Hasil saat pendanaan belum penuh ditolak",
);

// ---- Batas pengajuan baru terpisah dari dukungan quote kontrak lama ----
eq(KREDIT_BARANG_POKOK_MAKS, 10_000_000, "batas pokok kredit barang Rp10 juta");
eq(KREDIT_TENOR_PENGAJUAN_OPTIONS.join(","), "1,3,6", "tenor pengajuan baru 1/3/6 bulan");
eq(pokokKreditBarangDalamBatas(10_000_000), true, "pokok tepat Rp10 juta diterima");
eq(pokokKreditBarangDalamBatas(10_000_001), false, "pokok di atas Rp10 juta ditolak");
eq(pokokKreditBarangDalamBatas(1.5), false, "pokok pecahan rupiah ditolak");

// ---- Katalog contoh harus dapat dihitung dengan asumsi awal ----
for (const barang of KATALOG_CONTOH) {
  const contoh = quoteKreditBarang({
    hargaBarang: barang.harga,
    dpPersen: KREDIT_ASUMSI_AWAL.dpPersen,
    tenorBulan: KREDIT_ASUMSI_AWAL.tenorBulan,
    marginPersenPerBulan: KREDIT_ASUMSI_AWAL.marginPersenPerBulan,
  });
  eq(contoh.imbalHasil > 0, true, `contoh ${barang.nama}: Imbal Hasil > 0`);
  eq(contoh.jadwal.length, KREDIT_ASUMSI_AWAL.tenorBulan, `contoh ${barang.nama}: jadwal tenor awal`);
}

console.log(`kredit tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
