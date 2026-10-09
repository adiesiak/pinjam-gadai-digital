/** Run: bun src/lib/jatuhTempo.test.ts */
import { BULAN_MS, DEFAULT_TENOR_HARI, pelunasanPinjaman } from "./loan";
import {
  AMBANG_SEGERA_HARI,
  batasPelunasan,
  ringkasJatuhTempo,
  tanggalRingkas,
  type BarisJatuhTempo,
} from "./jatuhTempo";

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

const HARI = 86_400_000;
const DIDANAI = Date.UTC(2026, 0, 10); // 10 Jan 2026
const NOW = DIDANAI + 10 * HARI; // 20 Jan 2026

function baris(patch: Partial<BarisJatuhTempo> = {}): BarisJatuhTempo {
  return {
    status: "didanai",
    pokokPinjaman: 2_000_000,
    didanaiPada: DIDANAI,
    tenorHari: 30,
    tenorBulan: null,
    persenBunga: null,
    ...patch,
  };
}

// ===== 1. Batas pelunasan =====
eq(batasPelunasan(baris()), DIDANAI + 30 * HARI, "tenor harian: 30 hari sejak pendanaan");
eq(
  batasPelunasan(baris({ tenorBulan: 3, tenorHari: null })),
  DIDANAI + 3 * BULAN_MS,
  "skema bulanan memakai 30 hari per bulan",
);
eq(batasPelunasan(baris({ didanaiPada: null })), null, "belum didanai → tidak ada jatuh tempo");
eq(batasPelunasan(baris({ didanaiPada: 0 })), null, "tanggal pendanaan 0 dianggap tidak sah");
eq(
  batasPelunasan(baris({ tenorHari: null })),
  DIDANAI + DEFAULT_TENOR_HARI * HARI,
  "data warisan tanpa tenor memakai default 30 hari",
);
eq(
  batasPelunasan(baris({ tenorHari: null, tenorBulan: null })),
  DIDANAI + DEFAULT_TENOR_HARI * HARI,
  "tenor kosong dua-duanya tetap memakai default",
);

// ===== 2. Nada & kalimat hitung hari =====
const netral = ringkasJatuhTempo(baris(), NOW);
eq(netral.nada, "netral", "sisa 20 hari → nada netral");
eq(netral.hitung, "Sisa 20 hari", "kalimat sisa hari");
eq(netral.mencolok, false, "jauh dari jatuh tempo tidak mencolok");
eq(netral.teks, tanggalRingkas(DIDANAI + 30 * HARI), "teks tanggal memakai format id-ID");
ok(netral.aksesibilitas.includes("Sisa 20 hari") || netral.aksesibilitas.includes("sisa 20 hari"), "label aksesibilitas memuat hitungan hari");

const batas = ringkasJatuhTempo(baris(), DIDANAI + (30 - AMBANG_SEGERA_HARI) * HARI);
eq(batas.nada, "segera", `sisa ${AMBANG_SEGERA_HARI} hari → segera`);
eq(batas.mencolok, true, "sisa 3 hari mencolok");

const besok = ringkasJatuhTempo(baris(), DIDANAI + 29 * HARI);
eq(besok.hitung, "Sisa 1 hari", "sisa 1 hari terbaca jelas");
eq(besok.nada, "segera", "sisa 1 hari → segera");

const hariIni = ringkasJatuhTempo(baris(), DIDANAI + 30 * HARI);
eq(hariIni.hitung, "Jatuh tempo hari ini", "tepat di hari jatuh tempo");
eq(hariIni.nada, "segera", "hari jatuh tempo → segera");
eq(hariIni.mencolok, true, "hari jatuh tempo mencolok");

const lewat = ringkasJatuhTempo(baris(), DIDANAI + 33 * HARI);
eq(lewat.nada, "terlambat", "lewat 3 hari → nada terlambat");
eq(lewat.hitung, "Terlambat 3 hari", "kalimat keterlambatan");
eq(lewat.mencolok, true, "keterlambatan mencolok");

// Keterlambatan dihitung per HARI PENUH (sama dengan denda lib/loan): satu
// milidetik lewat belum dihitung satu hari, genap satu hari sudah.
const lewatSehari = ringkasJatuhTempo(baris(), DIDANAI + 31 * HARI);
eq(lewatSehari.hitung, "Terlambat 1 hari", "terlambat 1 hari penuh terdeteksi");
eq(
  ringkasJatuhTempo(baris(), DIDANAI + 30 * HARI + 1).hitung,
  "Jatuh tempo hari ini",
  "kurang dari sehari lewat belum dihitung terlambat",
);

// ===== 3. Status lain =====
const lunas = ringkasJatuhTempo(baris({ status: "lunas" }), DIDANAI + 40 * HARI);
eq(lunas.nada, "lunas", "status lunas punya nada sendiri");
eq(lunas.hitung, "Sudah lunas", "lunas tidak menghitung hari");
eq(lunas.mencolok, false, "lunas tidak mencolok walau tanggalnya lewat");
eq(lunas.tanggal, DIDANAI + 30 * HARI, "tanggal jatuh tempo tetap ditampilkan saat lunas");

const belum = ringkasJatuhTempo(baris({ status: "diajukan", didanaiPada: null }), NOW);
eq(belum.ada, false, "belum didanai tidak punya tanggal");
eq(belum.nada, "belum_didanai", "nada belum didanai");
eq(belum.hitung, "Belum didanai", "teks belum didanai");
eq(belum.teks, "—", "tanggal kosong ditulis —");
eq(belum.mencolok, false, "belum didanai tidak mencolok");

const ditolak = ringkasJatuhTempo(baris({ status: "ditolak", didanaiPada: null }), NOW);
eq(ditolak.nada, "belum_didanai", "pengajuan ditolak tanpa pendanaan tidak dianggap menunggak");

/** Bentuk masukan lib/loan dari baris uji (null → undefined, sesuai tanda tangannya). */
function keKanonik(b: BarisJatuhTempo) {
  return {
    pokokPinjaman: b.pokokPinjaman,
    status: b.status,
    tenorHari: b.tenorHari ?? undefined,
    tenorBulan: b.tenorBulan ?? undefined,
    didanaiPada: b.didanaiPada ?? undefined,
    persenBunga: b.persenBunga ?? undefined,
  };
}

// ===== 4. Satu angka dengan lib/loan (bukan hitungan kedua) =====
for (const tenorHari of [7, 30, 60, 90]) {
  const satuBaris = baris({ tenorHari, pokokPinjaman: 2_500_000 });
  for (const geser of [-5, 0, 1, 10]) {
    const now = DIDANAI + (tenorHari + geser) * HARI;
    const kanonik = pelunasanPinjaman(keKanonik(satuBaris), now);
    const tampil = ringkasJatuhTempo(satuBaris, now);
    eq(tampil.tanggal, kanonik?.jatuhTempoPada ?? null, `tanggal sama dengan lib/loan (tenor ${tenorHari}, geser ${geser})`);
    eq(
      tampil.hitung,
      (kanonik?.hariTerlambat ?? 0) > 0
        ? `Terlambat ${kanonik?.hariTerlambat} hari`
        : tampil.hitung,
      `keterlambatan sama dengan lib/loan (tenor ${tenorHari}, geser ${geser})`,
    );
  }
}

const bulanan = baris({ tenorBulan: 3, tenorHari: null, pokokPinjaman: 5_000_000 });
const kanonikBulanan = pelunasanPinjaman(keKanonik(bulanan), NOW);
eq(
  ringkasJatuhTempo(bulanan, NOW).tanggal,
  kanonikBulanan?.jatuhTempoPada ?? null,
  "skema bulanan sejalan dengan lib/loan",
);

// ===== 5. Data rusak tidak merobohkan tabel =====
const rusak = ringkasJatuhTempo(
  { status: "didanai", pokokPinjaman: 0, didanaiPada: Number.NaN, tenorHari: -3 },
  NOW,
);
eq(rusak.nada, "belum_didanai", "data rusak jatuh ke \"belum didanai\", bukan melempar");
const tenorNegatif = ringkasJatuhTempo(baris({ tenorHari: 0, tenorBulan: null }), NOW);
eq(tenorNegatif.ada, true, "tenor 0 memakai fallback default, tetap ada tanggal");

console.log(`\njatuhTempo: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
