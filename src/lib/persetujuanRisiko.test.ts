/**
 * Uji derivasi status persetujuan risiko pendana.
 * Run: bun src/lib/persetujuanRisiko.test.ts
 *
 * Yang dijaga: `perluSetuju` ditentukan VERSI TEKS yang berlaku, bukan ada
 * tidaknya persetujuan lama. Menaikkan versi teks harus membuat pendana yang
 * sudah menyetujui versi lama kembali diminta menyetujui — tanpa menghapus
 * riwayat versi lamanya.
 */
import {
  LABEL_PERLU_SETUJU,
  LABEL_SUDAH_SETUJU,
  labelPeranPersetujuan,
  statusPersetujuan,
  type RiwayatPersetujuan,
} from "./persetujuanRisiko";

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

function baris(nilai: Partial<RiwayatPersetujuan> = {}): RiwayatPersetujuan {
  return { versiTeks: 1, peran: "dana", disetujuiPada: 1_000, ...nilai };
}

// ===== riwayat kosong =====
{
  const status = statusPersetujuan({ versiBerlaku: 1, riwayat: [] });
  eq(status.perluSetuju, true, "tanpa riwayat: perlu menyetujui");
  eq(status.versiDisetujui, null, "tanpa riwayat: belum ada versi disetujui");
  eq(status.disetujuiPada, null, "tanpa riwayat: tanpa waktu persetujuan");
  eq(status.riwayat.length, 0, "tanpa riwayat: daftar tetap kosong");
  eq(status.versiBerlaku, 1, "tanpa riwayat: versi berlaku tetap dibawa");
}

// ===== sudah menyetujui versi yang berlaku =====
{
  const status = statusPersetujuan({
    versiBerlaku: 1,
    riwayat: [baris({ disetujuiPada: 5_000 })],
  });
  eq(status.perluSetuju, false, "versi berlaku sudah disetujui");
  eq(status.versiDisetujui, 1, "versi disetujui terbaca");
  // Waktu yang ditampilkan adalah waktu persetujuan versi BERLAKU.
  eq(status.disetujuiPada, 5_000, "waktu persetujuan versi berlaku");
}

// ===== versi teks naik =====
{
  const status = statusPersetujuan({
    versiBerlaku: 2,
    riwayat: [baris({ versiTeks: 1, disetujuiPada: 5_000 })],
  });
  eq(status.perluSetuju, true, "versi lama tidak lagi cukup");
  eq(status.disetujuiPada, null, "tanpa waktu persetujuan untuk versi berlaku");
  eq(status.versiDisetujui, 1, "versi lama tetap terbaca sebagai riwayat");
  eq(status.riwayat.length, 1, "riwayat versi lama tidak dihapus");
}

// ===== versi terbesar yang menang walau waktunya lebih lama =====
{
  // Kasus nyata: versi 3 disetujui lebih dulu di satu perangkat, lalu versi 2
  // tercatat belakangan dari perangkat lain yang halamannya sudah usang.
  const status = statusPersetujuan({
    versiBerlaku: 3,
    riwayat: [
      baris({ versiTeks: 3, disetujuiPada: 1_000 }),
      baris({ versiTeks: 2, disetujuiPada: 9_000 }),
    ],
  });
  eq(status.versiDisetujui, 3, "versi terbesar yang menang, bukan yang terbaru");
  eq(status.perluSetuju, false, "versi berlaku sudah tercakup");
  eq(status.disetujuiPada, 1_000, "waktu diambil dari baris versi berlaku");
  // Riwayat tetap disusun dari yang terbaru menurut waktu.
  eq(status.riwayat.map((r) => r.versiTeks).join(","), "2,3", "riwayat terbaru lebih dulu");
}

// ===== masukan tidak dimutasi =====
{
  const riwayat = [
    baris({ disetujuiPada: 1_000 }),
    baris({ versiTeks: 2, disetujuiPada: 9_000 }),
  ];
  statusPersetujuan({ versiBerlaku: 2, riwayat });
  eq(
    riwayat.map((r) => r.versiTeks).join(","),
    "1,2",
    "daftar pemanggil tidak diubah fungsi",
  );
}

// ===== label =====
eq(labelPeranPersetujuan("dana"), "Penyedia dana", "label peran pendana");
eq(
  labelPeranPersetujuan("pengamat"),
  "Sesi kode akses bersama",
  "label peran sesi kode akses bersama",
);
eq(labelPeranPersetujuan("admin"), "admin", "peran lain dibiarkan apa adanya");
eq(/belum tercatat/i.test(LABEL_PERLU_SETUJU), true, "keadaan belum menyetujui jujur");
eq(
  /membaca halaman ini saja belum menjadi persetujuan/i.test(LABEL_PERLU_SETUJU),
  true,
  "membaca saja bukan persetujuan",
);
eq(/sudah tercatat/i.test(LABEL_SUDAH_SETUJU), true, "keadaan sudah menyetujui terbaca");

console.log(`persetujuanRisiko.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
