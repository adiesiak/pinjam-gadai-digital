/**
 * Uji kebijakan pinjaman: porsi 47:13, marjin tenor, minimum pokok, dan syarat
 * dokumen.
 * Run: bun src/lib/kebijakanPinjaman.test.ts
 */
import {
  PERSEN_PORSI_PLATFORM,
  PERSEN_PORSI_PENDANA,
  PORSI_MARGIN,
  bagiMargin,
  bagiMarginBagian,
  marjinTotalTenor,
  minimumPokokTenor,
  periksaMinimumPokok,
  syaratUnderwriting,
} from "./kebijakanPinjaman";

let lulus = 0;
let gagal = 0;
function cek(nama: string, syarat: boolean) {
  if (syarat) {
    lulus += 1;
  } else {
    gagal += 1;
    console.error(`FAIL ${nama}`);
  }
}
const sama = (nama: string, nyata: unknown, harap: unknown) =>
  cek(`${nama} (${String(nyata)} = ${String(harap)})`, nyata === harap);
function melempar(fn: () => unknown, nama: string) {
  try {
    fn();
    gagal += 1;
    console.error(`FAIL ${nama}: seharusnya melempar`);
  } catch {
    lulus += 1;
  }
}

// ── Porsi ────────────────────────────────────────────────────────────────────
sama("pembilang pendana", PORSI_MARGIN.pendanaPembilang, 47);
sama("pembilang platform", PORSI_MARGIN.platformPembilang, 13);
sama("penyebut", PORSI_MARGIN.penyebut, 60);
cek(
  "persen pendana 78,333",
  Math.abs(PERSEN_PORSI_PENDANA - 78.3333333333) < 1e-9,
);
cek(
  "persen platform 21,667",
  Math.abs(PERSEN_PORSI_PLATFORM - 21.6666666667) < 1e-9,
);

const satuBulan = bagiMargin(300_000);
sama("marjin 30%: pendana", satuBulan.pendana, 235_000);
sama("marjin 30%: platform", satuBulan.platform, 65_000);

const tigaBulan = bagiMargin(600_000);
sama("marjin 60%: pendana", tigaBulan.pendana, 470_000);
sama("marjin 60%: platform", tigaBulan.platform, 130_000);

const enamBulan = bagiMargin(720_000);
sama("marjin 72%: pendana", enamBulan.pendana, 564_000);
sama("marjin 72%: platform", enamBulan.platform, 156_000);

// Pembulatan: platform dibulatkan ke bawah, sisa rupiah menjadi milik pendana.
// Karena itu batas yang benar adalah platform <= 13/60 dan pendana >= 47/60,
// bukan sebaliknya — pendana sengaja menerima sisa pecahan.
for (const margin of [0, 1, 7, 99, 100, 333_333, 1_000_001]) {
  const bagi = bagiMargin(margin);
  cek(
    `tanpa rupiah hilang (${margin})`,
    bagi.pendana + bagi.platform === margin,
  );
  cek(
    `platform tidak melebihi porsi (${margin})`,
    bagi.platform <= (margin * 13) / 60,
  );
  cek(
    `pendana tidak kurang dari porsi (${margin})`,
    bagi.pendana >= (margin * 47) / 60,
  );
  cek(`bagian bulat (${margin})`, Number.isSafeInteger(bagi.pendana));
}
sama("margin 0", bagiMargin(0).pendana + bagiMargin(0).platform, 0);
melempar(() => bagiMargin(-1), "margin negatif ditolak");
melempar(() => bagiMargin(1.5), "margin pecahan ditolak");

// ── Porsi bagian alokasi ────────────────────────────────────────────────────
const sebagian = bagiMarginBagian(600_000, 500_000, 1_000_000);
sama("bagian setengah: pendana", sebagian.pendana, 235_000);
sama("bagian setengah: platform", sebagian.platform, 65_000);

let totalPendana = 0;
for (const bagian of [1, 2, 3]) {
  totalPendana += bagiMarginBagian(600_000, bagian, 6).pendana;
}
cek("jumlah bagian tidak melebihi marjin", totalPendana <= 600_000);
melempar(
  () => bagiMarginBagian(600_000, 2_000_000, 1_000_000),
  "bagian lebih besar dari pokok ditolak",
);

// ── Marjin tenor ────────────────────────────────────────────────────────────
sama("marjin total tenor 1", marjinTotalTenor(1), 30);
sama("marjin total tenor 3", marjinTotalTenor(3), 24);
sama("marjin total tenor 6", marjinTotalTenor(6), 72);

// ── Minimum pokok ───────────────────────────────────────────────────────────
sama("tanpa minimum tenor 1", minimumPokokTenor(1), 0);
sama("minimum tenor 3", minimumPokokTenor(3), 3_000_000);
sama("minimum tenor 6", minimumPokokTenor(6), 3_000_000);
sama("tenor 1 lolos", periksaMinimumPokok(100_000, 1), null);
sama("tenor 3 di bawah minimum", typeof periksaMinimumPokok(2_999_999, 3), "string");
sama("tenor 3 tepat minimum", periksaMinimumPokok(3_000_000, 3), null);
sama("tenor 6 di atas minimum", periksaMinimumPokok(5_000_000, 6), null);

// ── Syarat dokumen ──────────────────────────────────────────────────────────
const tenorSatu = syaratUnderwriting({ tenorBulan: 1, pokok: 1_000_000 });
sama("1 bulan wajib KK", tenorSatu.kartuKeluarga, true);
sama("1 bulan tanpa domisili", tenorSatu.buktiDomisili, false);
sama("1 bulan tanpa penitipan ATM", tenorSatu.penitipanAtm, false);

const tenorTiga = syaratUnderwriting({ tenorBulan: 3, pokok: 1_000_000 });
sama("3 bulan wajib domisili", tenorTiga.buktiDomisili, true);
sama("3 bulan wajib penghasilan", tenorTiga.buktiPenghasilan, true);
sama("3 bulan wajib penitipan ATM", tenorTiga.penitipanAtm, true);

const nominalBesar = syaratUnderwriting({ tenorBulan: 1, pokok: 3_000_000 });
sama("pokok 3 juta wajib domisili", nominalBesar.buktiDomisili, true);
sama("pokok 3 juta wajib penitipan ATM", nominalBesar.penitipanAtm, true);

const harian = syaratUnderwriting({ tenorBulan: null, pokok: 500_000 });
sama("harian kecil tanpa ATM", harian.penitipanAtm, false);
cek("ringkas selalu menyebut KK", harian.ringkas.some((s) => s.includes("Kartu Keluarga")));
cek(
  "ringkas tenor panjang menyebut ATM tanpa PIN",
  tenorTiga.ringkas.some((s) => s.includes("ATM") && s.includes("tanpa PIN")),
);

console.log(`kebijakanPinjaman: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
