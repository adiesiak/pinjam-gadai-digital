/**
 * Uji deteksi jurnal tanpa subjek (yatim).
 * Run: bun src/lib/ledgerYatim.test.ts
 *
 * Skenario yang dipegang: pinjaman yang dihapus menyeluruh meninggalkan entri
 * `pinjaman:<id>` di ledger — itu memang disengaja (append-only), dan justru
 * karena itu harus terlihat di panel admin. Subjek yang MASIH ada tidak boleh
 * pernah muncul sebagai yatim.
 */
import {
  LABEL_SUBJEK,
  PREFIKS_SUBJEK,
  kelompokkanJurnalYatim,
  ringkasJurnalYatim,
  subjekAkun,
  type EntriJurnal,
} from "./ledgerYatim";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

const ID_A = "jd7f8k2m4n6p8r0t2v4x6z8b1d3f5h7j";
const ID_B = "jd7f8k2m4n6p8r0t2v4x6z8b1d3f5h7k";
const ID_C = "jd7f8k2m4n6p8r0t2v4x6z8b1d3f5h7m";

// ===== Pembacaan akun =====

eq(JSON.stringify(subjekAkun(`pinjaman:${ID_A}`)), JSON.stringify({ jenis: "pinjaman", id: ID_A }), "akun pinjaman dibaca");
eq(subjekAkun(`gadai:${ID_B}`)?.jenis, "gadai", "akun gadai dibaca");
eq(subjekAkun(`kredit:${ID_C}`)?.jenis, "kredit", "akun kredit dibaca");
eq(subjekAkun("dana:WALLET:" + ID_A), null, "akun dompet dana bukan subjek");
eq(subjekAkun("platform:FEE"), null, "akun platform bukan subjek");
eq(subjekAkun("pinjaman:"), null, "akun tanpa id diabaikan");
eq(subjekAkun("pinjaman:ABC"), null, "id tidak sah diabaikan (bukan laporan yatim palsu)");
eq(PREFIKS_SUBJEK.pinjaman, "pinjaman:", "prefiks pinjaman");
eq(LABEL_SUBJEK.kredit, "Kredit barang", "label kredit barang");

// ===== Pengelompokan =====

const entri: EntriJurnal[] = [
  // Pinjaman yang sudah dihapus: jurnalnya masih ada (dua entri, saldo nol).
  {
    akun: `pinjaman:${ID_A}`,
    arah: "kredit",
    jumlah: 20_000,
    waktu: 100,
    keterangan: "Biaya admin & platform PGD-1",
    groupId: "GRP-1",
  },
  {
    akun: `pinjaman:${ID_A}`,
    arah: "debit",
    jumlah: 1_300_000,
    waktu: 500,
    keterangan: "Pelunasan PGD-1",
    groupId: "GRP-2",
  },
  // Gadai yang masih ada: TIDAK boleh muncul.
  {
    akun: `gadai:${ID_B}`,
    arah: "debit",
    jumlah: 250_000,
    waktu: 900,
    keterangan: "Sewa modal GD-7",
    groupId: "GRP-3",
  },
  // Kredit yang sudah dihapus, hanya satu sisi (uang belum kembali).
  {
    akun: `kredit:${ID_C}`,
    arah: "debit",
    jumlah: 4_000_000,
    waktu: 700,
    keterangan: "Pencairan KRD-9",
    groupId: "GRP-4",
  },
  // Akun non-subjek selalu dilewati.
  {
    akun: "platform:FEE",
    arah: "kredit",
    jumlah: 20_000,
    waktu: 800,
    keterangan: "Biaya",
    groupId: "GRP-1",
  },
];

const kelompok = kelompokkanJurnalYatim(entri, (jenis, id) => jenis === "gadai" && id === ID_B);

eq(kelompok.length, 2, "dua akun yatim ditemukan");
eq(kelompok[0].akun, `kredit:${ID_C}`, "diurut dari yang paling baru disentuh (kredit 700)");
eq(kelompok[1].akun, `pinjaman:${ID_A}`, "pinjaman (500) di urutan kedua");
eq(kelompok[1].jumlahEntri, 2, "dua entri pada akun pinjaman");
eq(kelompok[1].totalDebit, 1_300_000, "total debit akun pinjaman");
eq(kelompok[1].totalKredit, 20_000, "total kredit akun pinjaman");
eq(kelompok[1].saldo, 1_280_000, "saldo = debit − kredit");
eq(kelompok[1].waktuTerakhir, 500, "waktu terakhir dari entri terbaru");
eq(kelompok[1].keteranganTerakhir, "Pelunasan PGD-1", "keterangan mengikuti entri terbaru");
eq(JSON.stringify(kelompok[1].grup), JSON.stringify(["GRP-1", "GRP-2"]), "grup terkait terdaftar sekali");
eq(kelompok[0].saldo, 4_000_000, "kredit yatim menyisakan saldo debit");
eq(kelompok[0].jenis, "kredit", "jenis kredit dikenali");

const ringkas = ringkasJurnalYatim(kelompok);
eq(ringkas.akun, 2, "ringkasan: dua akun");
eq(ringkas.entri, 3, "ringkasan: tiga entri");
// Nilai entri = jumlah seluruh entri (debit + kredit): 4.000.000 + 1.300.000 + 20.000.
eq(ringkas.nilai, 5_320_000, "ringkasan: nilai entri yatim");

// Semua subjek masih ada → tidak ada laporan.
eq(
  kelompokkanJurnalYatim(entri, () => true).length,
  0,
  "subjek yang masih ada tidak pernah dilaporkan",
);
eq(ringkasJurnalYatim([]).nilai, 0, "tanpa entri: nilai nol");

console.log(`\nledgerYatim: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
