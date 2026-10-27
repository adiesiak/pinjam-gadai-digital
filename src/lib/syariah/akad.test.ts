/** Run: bun src/lib/syariah/akad.test.ts */
import {
  AKUN_PLATFORM_UJRAH_SYARIAH,
  MAX_AKAD_SYARIAH,
  MIN_AKAD_SYARIAH,
  akunAkadSyariah,
  jurnalPelunasanSyariah,
  jurnalPembatalanSyariah,
  jurnalPenempatanSyariah,
  rencanaAkadSyariah,
  saldoJurnal,
  type RencanaAkadSyariah,
} from "./akad";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  }
}
function ok(syarat: boolean, label: string) {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function throws(fn: () => unknown, label: string) {
  try {
    fn();
    failed += 1;
    console.error(`FAIL ${label}: seharusnya melempar`);
  } catch {
    passed += 1;
  }
}

const DOMPET = "dana:WALLET:DANA-1";
const AKAD = akunAkadSyariah("AKAD-1");

// ===== 1. Murabahah: margin 15%, nisbah 47:13 =====
{
  const akad = rencanaAkadSyariah({
    jenis: "murabahah",
    pokok: 1_000_000,
    marginPersen: 15,
  });
  eq(akad.jenis, "murabahah", "jenis murabahah");
  eq(akad.hargaJual, 1_150_000, "harga jual = pokok + margin 15%");
  eq(akad.marginTotal, 150_000, "margin total 150.000");
  eq(Number(akad.persenPendana.toFixed(2)), 78.33, "porsi pendana 47/60 = 78,33%");
  eq(Number(akad.persenPlatform.toFixed(2)), 21.67, "porsi platform 13/60 = 21,67%");
  eq(akad.nisbahPendana, 117_500, "nisbah pendana 47/60 margin");
  eq(akad.nisbahPlatform, 32_500, "nisbah platform 13/60 margin");
  eq(akad.pendanaTerima, 1_117_500, "pendana menerima pokok + nisbah");
  eq(akad.totalKewajiban, 1_150_000, "total kewajiban = harga jual");
  eq(akad.tiketDoorprize, 1, "murabahah memberi tiket per Rp1 juta");
  eq(akad.tenorHari, 30, "tenor bawaan 30 hari");
  eq(
    akad.nisbahPendana + akad.nisbahPlatform,
    akad.marginTotal,
    "nisbah pendana + platform = margin",
  );
  eq(
    akad.pendanaTerima + akad.nisbahPlatform,
    akad.totalKewajiban,
    "pokok + nisbah pendana + ujrah platform = harga jual",
  );
}

// ===== 2. Rahn: ujrah 2% taksiran per 30 hari, 47:13 =====
{
  const akad = rencanaAkadSyariah({
    jenis: "rahn",
    pokok: 1_600_000,
    nilaiTaksiran: 2_000_000,
    tenorHari: 30,
  });
  eq(akad.ujrahPerSiklus, 40_000, "ujrah 2% dari taksiran per 30 hari");
  eq(akad.jumlahSiklus, 1, "satu siklus ujrah");
  eq(akad.nisbahPendana, 31_334, "nisbah pendana 47/60 ujrah");
  eq(akad.nisbahPlatform, 8_666, "nisbah platform 13/60 ujrah");
  eq(akad.pendanaTerima, 1_631_334, "pokok gadai + nisbah");
  eq(akad.totalKewajiban, 1_640_000, "pokok + ujrah total");
  eq(akad.tiketDoorprize, 1, "rahn memberi tiket per Rp1 juta");

  const dua = rencanaAkadSyariah({
    jenis: "rahn",
    pokok: 1_600_000,
    nilaiTaksiran: 2_000_000,
    tenorHari: 60,
  });
  eq(dua.ujrahPerSiklus, 40_000, "ujrah per siklus tetap");
  eq(dua.jumlahSiklus, 2, "dua blok 30 hari");
  eq(dua.marginTotal, 80_000, "ujrah total dua siklus");
  eq(dua.nisbahPendana, 62_667, "nisbah pendana dua siklus");
  eq(dua.nisbahPlatform, 17_333, "nisbah platform dua siklus");
}

// ===== 3. Qardh: margin nol dan tiket =====
{
  const akad = rencanaAkadSyariah({ jenis: "qardh", pokok: 2_500_000 });
  eq(akad.marginTotal, 0, "qardh tanpa margin");
  eq(akad.nisbahPendana, 0, "pendana tidak mengambil margin");
  eq(akad.nisbahPlatform, 0, "platform tidak mengambil bagian");
  eq(akad.pendanaTerima, 2_500_000, "pokok kembali utuh");
  eq(akad.totalKewajiban, 2_500_000, "peminjam membayar pokok saja");
  eq(akad.tiketDoorprize, 2, "dua tiket untuk Rp2,5 juta");
}

// ===== 4. Validasi =====
throws(
  () => rencanaAkadSyariah({ jenis: "qardh", pokok: MIN_AKAD_SYARIAH - 1 }),
  "pokok di bawah batas ditolak",
);
throws(
  () => rencanaAkadSyariah({ jenis: "qardh", pokok: MAX_AKAD_SYARIAH + 1 }),
  "pokok di atas batas ditolak",
);
throws(
  () => rencanaAkadSyariah({ jenis: "qardh", pokok: 100_000.5 }),
  "pokok bukan rupiah bulat ditolak",
);
throws(
  () =>
    rencanaAkadSyariah({
      jenis: "rahn",
      pokok: 2_000_000,
      nilaiTaksiran: 1_500_000,
    }),
  "pokok gadai di atas taksiran ditolak",
);
throws(
  () =>
    rencanaAkadSyariah({
      jenis: "rahn",
      pokok: 1_000_000,
      nilaiTaksiran: 1_500_000,
      tenorHari: 45,
    }),
  "tenor Rahn bukan kelipatan 30 ditolak",
);
throws(
  () =>
    rencanaAkadSyariah({
      jenis: "murabahah",
      pokok: 1_000_000,
      marginPersen: 14,
    }),
  "margin di bawah 15% ditolak",
);
throws(
  () =>
    rencanaAkadSyariah({
      jenis: "murabahah",
      pokok: 1_000_000,
      marginPersen: 21,
    }),
  "margin di atas 20% ditolak",
);
{
  const batasAtas = rencanaAkadSyariah({
    jenis: "murabahah",
    pokok: 1_000_000,
    marginPersen: 20,
  });
  eq(batasAtas.hargaJual, 1_200_000, "margin 20% masih diterima");
  eq(batasAtas.nisbahPendana, 156_667, "nisbah pendana 47/60 dari margin 20%");
  eq(batasAtas.nisbahPlatform, 43_333, "ujrah platform 13/60 dari margin 20%");
}

// Porsi bagi hasil FIXED 47 : 13; tidak ada opsi persen dari pemanggil.
{
  const akad = rencanaAkadSyariah({
    jenis: "murabahah",
    pokok: 1_000_000,
    marginPersen: 15,
  });
  eq(akad.nisbahPendana, 117_500, "nisbah pendana tetap 47/60 margin");
  eq(akad.nisbahPlatform, 32_500, "nisbah platform tetap 13/60 margin");
  eq(
    akad.nisbahPendana + akad.nisbahPlatform,
    akad.marginTotal,
    "seluruh margin terbagi tanpa sisa",
  );
}
throws(
  () => rencanaAkadSyariah({ jenis: "qardh", pokok: 1_000_000, tenorHari: 0 }),
  "tenor nol ditolak",
);

// ===== 5. Jurnal: seimbang dan mengarah ke akun yang benar =====
{
  const penempatan = jurnalPenempatanSyariah({
    akadId: "AKAD-1",
    akunDompet: DOMPET,
    pokok: 1_000_000,
    referensi: "SYR-1",
  });
  const saldo = saldoJurnal(penempatan);
  ok(saldo.seimbang, "jurnal penempatan seimbang");
  eq(saldo.debit, 1_000_000, "debit penempatan = pokok");
  ok(
    penempatan.lines.some(
      (l) => l.akun === AKAD && l.arah === "debit" && l.jumlah === 1_000_000,
    ),
    "piutang akad didebit sebesar pokok",
  );
  ok(
    penempatan.lines.some(
      (l) => l.akun === DOMPET && l.arah === "kredit" && l.jumlah === 1_000_000,
    ),
    "dompet pendana dikredit sebesar pokok",
  );
}

function periksaPelunasan(akad: RencanaAkadSyariah, label: string) {
  const jurnal = jurnalPelunasanSyariah({
    akadId: "AKAD-1",
    akunDompet: DOMPET,
    rencana: akad,
    referensi: "SYR-1",
  });
  eq(jurnal.length, 2, `${label}: dua jurnal`);
  for (const j of jurnal) ok(saldoJurnal(j).seimbang, `${label}: ${j.jenis} seimbang`);

  const [terima, bagi] = jurnal;
  ok(
    terima.lines.some(
      (l) =>
        l.akun === "platform:CASH" &&
        l.arah === "debit" &&
        l.jumlah === akad.totalKewajiban,
    ),
    `${label}: kas menerima total kewajiban`,
  );
  ok(
    terima.lines.some(
      (l) =>
        l.akun === AKAD && l.arah === "kredit" && l.jumlah === akad.totalKewajiban,
    ),
    `${label}: piutang akad ditutup`,
  );
  ok(
    bagi.lines.some(
      (l) =>
        l.akun === DOMPET &&
        l.arah === "debit" &&
        l.jumlah === akad.pendanaTerima,
    ),
    `${label}: dompet pendana didebit sebesar haknya`,
  );
  const platform = bagi.lines.find(
    (l) => l.akun === AKUN_PLATFORM_UJRAH_SYARIAH,
  );
  if (akad.nisbahPlatform > 0) {
    ok(
      platform?.arah === "debit" && platform.jumlah === akad.nisbahPlatform,
      `${label}: ujrah platform dicatat terpisah`,
    );
  } else {
    eq(platform, undefined, `${label}: tanpa ujrah, akun platform tidak disentuh`);
  }
}

periksaPelunasan(
  rencanaAkadSyariah({
    jenis: "murabahah",
    pokok: 1_000_000,
    marginPersen: 15,
  }),
  "murabahah",
);
periksaPelunasan(
  rencanaAkadSyariah({
    jenis: "rahn",
    pokok: 1_000_000,
    nilaiTaksiran: 1_500_000,
    tenorHari: 60,
  }),
  "rahn",
);
periksaPelunasan(
  rencanaAkadSyariah({ jenis: "qardh", pokok: 2_500_000 }),
  "qardh",
);

{
  const batal = jurnalPembatalanSyariah({
    akadId: "AKAD-1",
    akunDompet: DOMPET,
    pokok: 1_000_000,
    referensi: "SYR-1",
  });
  ok(saldoJurnal(batal).seimbang, "jurnal pembatalan seimbang");
  ok(
    batal.lines.some(
      (l) => l.akun === DOMPET && l.arah === "debit" && l.jumlah === 1_000_000,
    ),
    "pembatalan mengembalikan pokok ke dompet",
  );
}

console.log(`syariah akad: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
