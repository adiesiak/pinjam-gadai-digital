/** Run: bun src/lib/perpanjanganPinjaman.test.ts */
import {
  bungaPeriodeBerjalan,
  hitungRencanaPembayaran,
  opsiPerpanjangan,
  sisaPokokPinjaman,
} from "./perpanjanganPinjaman";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function ok(syarat: boolean, label: string): void {
  eq(syarat, true, label);
}
function gagal(fn: () => unknown, potongan: string, label: string): void {
  try {
    fn();
    failed += 1;
    console.error(`FAIL ${label}: seharusnya melempar`);
  } catch (error) {
    const pesan = error instanceof Error ? error.message : String(error);
    ok(pesan.includes(potongan), `${label} (pesan "${pesan}")`);
  }
}

const HARI = 86_400_000;
const DIDANAI = Date.UTC(2026, 0, 1);
const JATUH_TEMPO = DIDANAI + 28 * HARI;

const pinjaman = {
  pokokPinjaman: 1_000_000,
  didanaiPada: DIDANAI,
  tenorHari: 28,
  persenBunga: 30,
};

// ===== 1. Sisa pokok & bunga periode berjalan =====
eq(sisaPokokPinjaman(pinjaman), 1_000_000, "tanpa state perpanjangan memakai pokok awal");
eq(
  sisaPokokPinjaman({ ...pinjaman, remainingPrincipal: 750_000 }),
  750_000,
  "sisa pokok mengikuti state terbaru",
);
eq(bungaPeriodeBerjalan(pinjaman), 300_000, "bunga awal 30% dari pokok snapshot");
eq(
  bungaPeriodeBerjalan({ ...pinjaman, nextInterestAmount: 350_000 }),
  350_000,
  "bunga periode berjalan memakai angka tersimpan",
);

// ===== 2. Opsi tier perpanjangan =====
// Tarif final = tarif dasar matriks + `PENAMBAHAN_BUNGA_HARIAN_PERSEN` (2 poin),
// angka yang juga dijaga `tenorHarian.test.ts` dan didokumentasikan di
// `loan.ts` (tier 3: 28/30/31/32).
eq(
  opsiPerpanjangan(1_000_000).map((o) => `${o.hari}:${o.persenBunga}`).join(","),
  "7:28,14:30,21:31,28:32",
  "pokok Rp1 juta memakai tier 7/14/21/28 hari",
);
eq(
  opsiPerpanjangan(750_000).map((o) => `${o.hari}:${o.persenBunga}`).join(","),
  "7:30,14:34,21:36,28:37",
  "pokok Rp750 ribu memakai tier 7/14/21/28 hari",
);
eq(
  opsiPerpanjangan(400_000).map((o) => `${o.hari}:${o.persenBunga}`).join(","),
  "7:32,14:37,21:40,28:42",
  "pokok Rp400 ribu kembali ke tier 7 hari",
);
eq(opsiPerpanjangan(99_999).length, 0, "di bawah batas pokok tidak punya opsi");

// ===== 3. Bayar bunga saja =====
const bungaSaja = hitungRencanaPembayaran({
  loan: pinjaman,
  mode: "bunga_saja",
  extensionDays: 28,
  waktuTransaksi: JATUH_TEMPO,
});
eq(bungaSaja.totalDue, 305_000, "bayar bunga saja menagih bunga berjalan + biaya roll-over Rp5.000");
eq(bungaSaja.rolloverFee, 5_000, "biaya roll-over flat tercatat terpisah");
eq(bungaSaja.principalSesudah, 1_000_000, "pokok utuh setelah roll-over");
eq(bungaSaja.tierRate, 30, "tier baru dari nominal pokok utuh");
eq(bungaSaja.nextInterestAmount, 300_000, "bunga periode berikut 30% dari pokok");
eq(bungaSaja.nextDueDate, JATUH_TEMPO + 28 * HARI, "jatuh tempo diperpanjang 28 hari");
eq(bungaSaja.lateFee, 0, "tepat jatuh tempo tidak ada denda");

// ===== 4. Cicil pokok menurunkan tier =====
const cicil = hitungRencanaPembayaran({
  loan: pinjaman,
  mode: "cicil_pokok",
  principalPaid: 200_000,
  extensionDays: 28,
  waktuTransaksi: JATUH_TEMPO,
});
eq(cicil.totalDue, 500_000, "total hari ini = bunga + cicilan pokok");
eq(cicil.principalSesudah, 800_000, "sisa pokok berkurang");
eq(cicil.tierRate, 37, "tier mengikuti sisa pokok Rp800 ribu pada tenor 28 hari");
eq(cicil.nextInterestAmount, 296_000, "bunga baru = sisa pokok x tier baru");
eq(cicil.nextDueDate, JATUH_TEMPO + 28 * HARI, "cicil pokok juga memperpanjang tenor");

const cicilTierTurun = hitungRencanaPembayaran({
  loan: { ...pinjaman, pokokPinjaman: 500_000, persenBunga: undefined },
  mode: "cicil_pokok",
  principalPaid: 100_000,
  extensionDays: 7,
  waktuTransaksi: JATUH_TEMPO,
});
eq(cicilTierTurun.principalSesudah, 400_000, "sisa pokok Rp400 ribu");
eq(cicilTierTurun.tierRate, 32, "tier 7 hari untuk sisa pokok di bawah Rp500 ribu");
eq(cicilTierTurun.nextInterestAmount, 128_000, "bunga baru mengikuti tier yang lebih rendah");

// ===== 5. Denda & pelunasan total =====
const terlambat = hitungRencanaPembayaran({
  loan: pinjaman,
  mode: "bunga_saja",
  extensionDays: 28,
  waktuTransaksi: JATUH_TEMPO + 2 * HARI,
});
eq(terlambat.hariTerlambat, 2, "dua hari terlambat terhitung");
eq(terlambat.lateFee, 40_000, "denda 2% x 2 hari dari pokok");
eq(terlambat.totalDue, 345_000, "denda + biaya roll-over ikut ditagih bersama bunga");
eq(
  terlambat.nextDueDate,
  JATUH_TEMPO + 2 * HARI + 28 * HARI,
  "jatuh tempo baru dihitung dari tanggal transaksi bila sudah lewat",
);

const lunas = hitungRencanaPembayaran({
  loan: { ...pinjaman, remainingPrincipal: 800_000, nextInterestAmount: 320_000, nextDueDate: JATUH_TEMPO },
  mode: "pelunasan_total",
  waktuTransaksi: JATUH_TEMPO,
});
eq(lunas.totalDue, 1_120_000, "pelunasan total = sisa pokok + bunga berjalan");
eq(lunas.principalSesudah, 0, "pelunasan total menghabiskan pokok");
eq(lunas.nextDueDate, null, "tidak ada jatuh tempo berikutnya");
eq(lunas.extensionDays, 0, "pelunasan tidak memperpanjang tenor");

// ===== 6. Batas yang ditolak server =====
gagal(
  () =>
    hitungRencanaPembayaran({
      loan: pinjaman,
      mode: "bunga_saja",
      extensionDays: 30,
      waktuTransaksi: JATUH_TEMPO,
    }),
  "tenor perpanjangan yang tersedia",
  "tenor 30 hari ditolak untuk pokok Rp1 juta",
);
gagal(
  () =>
    hitungRencanaPembayaran({
      loan: pinjaman,
      mode: "cicil_pokok",
      principalPaid: 950_000,
      extensionDays: 28,
      waktuTransaksi: JATUH_TEMPO,
    }),
  "minimal Rp 100.000",
  "sisa pokok di bawah batas produk ditolak",
);
gagal(
  () =>
    hitungRencanaPembayaran({
      loan: pinjaman,
      mode: "cicil_pokok",
      principalPaid: 1_000_000,
      extensionDays: 28,
      waktuTransaksi: JATUH_TEMPO,
    }),
  "Gunakan pelunasan total",
  "cicilan pokok tidak boleh melunasi penuh",
);
gagal(
  () =>
    hitungRencanaPembayaran({
      loan: { ...pinjaman, tenorBulan: 3 },
      mode: "bunga_saja",
      extensionDays: 28,
      waktuTransaksi: JATUH_TEMPO,
    }),
  "hanya tersedia untuk pinjaman harian",
  "pinjaman bulanan ditolak",
);

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error(`${failed} tes perpanjangan pinjaman gagal`);
}
console.log(`perpanjanganPinjaman: ${passed} lulus`);
