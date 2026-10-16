/**
 * Uji aturan tabel perbandingan pendana (fungsi murni).
 * Run: bun src/lib/tabelPendana.test.ts
 *
 * Yang dijaga: arah urut, pemecah seri yang stabil, masukan yang tidak diubah,
 * dan baris total yang benar-benar menjumlahkan kolomnya. Aturan ini menentukan
 * angka yang dibaca pendana, jadi diuji sebagai fungsi — bukan lewat markup yang
 * lebih mudah lolos secara kebetulan.
 */
import {
  KOLOM_PENDANA,
  KOLOM_URUT,
  URUTAN_AWAL,
  pangsaBerjalan,
  totalPendana,
  urutkanPendana,
  type UrutanPendana,
} from "./tabelPendana";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

/** Nilai unik per kolom, supaya kolom yang tertukar pasti ketahuan. */
type Pendana = {
  nama: string;
  jumlahPinjaman: number;
  jumlahAktif: number;
  jumlahLunas: number;
  totalDisalurkan: number;
  saldoBerjalan: number;
  keuntunganPendana: number;
  keuntunganPendanaLunas: number;
  keuntunganPendanaBelumLunas: number;
  keuntunganAdmin: number;
  keuntunganAdminLunas: number;
  keuntunganAdminBelumLunas: number;
  transferTercatat: number;
  transferBelumDicatat: number;
  keuntunganBelumDicatat: number;
};

const ROBERT: Pendana = {
  nama: "ROBERT",
  jumlahPinjaman: 8,
  jumlahAktif: 7,
  jumlahLunas: 1,
  totalDisalurkan: 7_000_000,
  saldoBerjalan: 6_000_000,
  keuntunganPendana: 1_645_000,
  keuntunganPendanaLunas: 235_000,
  keuntunganPendanaBelumLunas: 1_410_000,
  keuntunganAdmin: 455_000,
  keuntunganAdminLunas: 65_000,
  keuntunganAdminBelumLunas: 390_000,
  transferTercatat: 0,
  transferBelumDicatat: 1,
  keuntunganBelumDicatat: 235_000,
};

const SITI: Pendana = {
  nama: "SITI",
  jumlahPinjaman: 3,
  jumlahAktif: 3,
  jumlahLunas: 0,
  totalDisalurkan: 9_500_000,
  saldoBerjalan: 9_500_000,
  keuntunganPendana: 2_245_000,
  keuntunganPendanaLunas: 0,
  keuntunganPendanaBelumLunas: 2_245_000,
  keuntunganAdmin: 605_000,
  keuntunganAdminLunas: 0,
  keuntunganAdminBelumLunas: 605_000,
  transferTercatat: 0,
  transferBelumDicatat: 0,
  keuntunganBelumDicatat: 0,
};

const REKAP: readonly Pendana[] = [ROBERT, SITI];
const nama = (daftar: readonly Pendana[]) => JSON.stringify(daftar.map((r) => r.nama));

// ===== Kontrak kolom =====
eq(KOLOM_PENDANA.length, 7, "tujuh kolom angka yang bisa diurutkan");
eq(
  JSON.stringify(KOLOM_PENDANA.map((k) => k.label)),
  JSON.stringify([
    "Pendana",
    "Dana tersalurkan",
    "Masih berjalan",
    "Dibukukan (lunas)",
    "Perkiraan (belum lunas)",
    "Total keuntungan",
    "Biaya platform (layanan)",
  ]),
  "label kolom persis seperti kontrak halaman",
);
// Biaya 5% itu biaya layanan platform, bukan milik tim internal mana pun.
ok(
  KOLOM_PENDANA.every((k) => !k.label.toLowerCase().includes("admin")),
  "tidak ada label kolom yang menyebut admin",
);
eq(
  JSON.stringify(KOLOM_PENDANA.map((k) => k.kunci)),
  JSON.stringify(["nama", "tersalurkan", "berjalan", "dibukukan", "perkiraan", "total", "admin"]),
  "setiap kolom punya kunci urutnya sendiri",
);

// ===== Kolom yang punya tempat di tabel =====
// Pengurutnya sengaja hanya kolom yang bisa dicocokkan pembaca dengan angkanya
// sendiri. "Total keuntungan" adalah jumlah dari dua kolom lain, jadi ia tidak
// ditawarkan sebagai dasar urutan: urutan yang dasarnya harus dihitung sendiri
// oleh pembaca bukan urutan yang bisa dibaca.
eq(
  JSON.stringify(KOLOM_URUT),
  JSON.stringify([
    "nama",
    "tersalurkan",
    "berjalan",
    "dibukukan",
    "perkiraan",
    "admin",
  ]),
  "kolom yang ditawarkan sebagai dasar urutan",
);
ok(!KOLOM_URUT.includes("total"), "kolom jumlah tidak ditawarkan sebagai dasar urutan");
ok(
  KOLOM_URUT.includes(URUTAN_AWAL.kunci),
  "urutan bawaan selalu termasuk kolom yang bisa dipilih",
);
ok(
  KOLOM_URUT.every((k) => KOLOM_PENDANA.some((kolom) => kolom.kunci === k)),
  "setiap kolom yang diurutkan punya labelnya di kontrak kolom",
);

// ===== Pangsa dana yang masih berjalan =====
{
  ok(
    Math.abs(pangsaBerjalan(ROBERT) - 6 / 7) < 1e-9,
    "pangsa berjalan = saldo berjalan / dana tersalurkan",
  );
  eq(pangsaBerjalan(SITI), 1, "dana yang belum kembali sama sekali bernilai 1");
  eq(
    pangsaBerjalan({ ...SITI, totalDisalurkan: 0, saldoBerjalan: 0 }),
    0,
    "tanpa dana tersalurkan, pangsanya nol (bukan NaN)",
  );
  eq(
    pangsaBerjalan({ ...SITI, saldoBerjalan: 20_000_000 }),
    1,
    "pangsa dibatasi 1 supaya bilahnya tidak melebar keluar sel",
  );
  eq(
    pangsaBerjalan({ ...SITI, saldoBerjalan: -1 }),
    0,
    "pangsa tidak pernah negatif",
  );
}

// ===== Urutan =====
{
  eq(URUTAN_AWAL.kunci, "tersalurkan", "urutan bawaan memakai kolom dana tersalurkan");
  eq(URUTAN_AWAL.arah, "turun", "urutan bawaan dari yang terbesar");
  eq(nama(urutkanPendana(REKAP, URUTAN_AWAL)), nama([SITI, ROBERT]), "urutan bawaan diterapkan");

  const naik: UrutanPendana = { kunci: "tersalurkan", arah: "naik" };
  eq(nama(urutkanPendana(REKAP, naik)), nama([ROBERT, SITI]), "arah naik membalik urutannya");

  // Setiap kolom angka benar-benar bisa jadi dasar urutan.
  eq(
    nama(urutkanPendana(REKAP, { kunci: "perkiraan", arah: "turun" })),
    nama([SITI, ROBERT]),
    "kolom perkiraan bisa jadi dasar urutan",
  );
  eq(
    nama(urutkanPendana(REKAP, { kunci: "dibukukan", arah: "turun" })),
    nama([ROBERT, SITI]),
    "kolom dibukukan bisa jadi dasar urutan",
  );
  eq(
    nama(urutkanPendana(REKAP, { kunci: "admin", arah: "turun" })),
    nama([SITI, ROBERT]),
    "kolom potongan admin bisa jadi dasar urutan",
  );
  eq(
    nama(urutkanPendana(REKAP, { kunci: "berjalan", arah: "naik" })),
    nama([ROBERT, SITI]),
    "kolom masih berjalan bisa jadi dasar urutan",
  );

  // Nama: huruf besar/kecil tidak boleh mengubah urutannya.
  const huruf: Pendana[] = [
    { ...ROBERT, nama: "budi" },
    { ...ROBERT, nama: "Andi" },
    { ...ROBERT, nama: "Citra" },
  ];
  eq(
    nama(urutkanPendana(huruf, { kunci: "nama", arah: "naik" })),
    nama([huruf[1], huruf[0], huruf[2]]),
    "urut nama A→Z tanpa membedakan huruf besar/kecil",
  );

  // Pemecah seri: angka sama tetap punya urutan yang tetap (nama, naik).
  const kembar: Pendana[] = [
    { ...SITI, nama: "SITI" },
    { ...SITI, nama: "ANDI" },
  ];
  eq(
    nama(urutkanPendana(kembar, { kunci: "total", arah: "turun" })),
    nama([kembar[1], kembar[0]]),
    "angka seri dipecah nama, supaya urutannya stabil",
  );

  // Masukan tidak diubah: pemanggilnya adalah state halaman.
  const asli = [...REKAP];
  urutkanPendana(REKAP, { kunci: "nama", arah: "naik" });
  eq(JSON.stringify(REKAP), JSON.stringify(asli), "rekap aslinya tidak ikut terurut");

  // Daftar kosong dan satu baris tidak merobohkan apa pun.
  eq(nama(urutkanPendana([], URUTAN_AWAL)), "[]", "rekap kosong menghasilkan daftar kosong");
  eq(nama(urutkanPendana([ROBERT], URUTAN_AWAL)), nama([ROBERT]), "satu pendana tetap tampil");
}

// ===== Baris total =====
{
  const total = totalPendana(REKAP);
  eq(total.jumlahPendana, 2, "total menghitung jumlah pendana");
  eq(total.jumlahPinjaman, 11, "total menjumlahkan jumlah pinjaman");
  eq(total.jumlahAktif, 10, "total menjumlahkan pinjaman aktif");
  eq(total.jumlahLunas, 1, "total menjumlahkan pinjaman lunas");
  eq(total.totalDisalurkan, 16_500_000, "total menjumlahkan dana tersalurkan");
  eq(total.saldoBerjalan, 15_500_000, "total menjumlahkan saldo berjalan");
  eq(total.keuntunganPendanaLunas, 235_000, "total menjumlahkan keuntungan dibukukan");
  eq(total.keuntunganPendanaBelumLunas, 3_655_000, "total menjumlahkan keuntungan perkiraan");
  eq(total.keuntunganPendana, 3_890_000, "total menjumlahkan total keuntungan");
  eq(total.keuntunganAdmin, 1_060_000, "total menjumlahkan potongan admin");
  eq(total.transferBelumDicatat, 1, "total menghitung transfer yang belum dicatat");
  eq(total.keuntunganBelumDicatat, 235_000, "total menjumlahkan nilai transfer tertunda");

  // Invarian yang menjamin kolom "Total keuntungan" konsisten dengan pecahannya.
  eq(
    total.keuntunganPendanaLunas + total.keuntunganPendanaBelumLunas,
    total.keuntunganPendana,
    "kolom total keuntungan = dibukukan + perkiraan",
  );

  const kosong = totalPendana([]);
  eq(kosong.jumlahPendana, 0, "tanpa pendana, jumlahnya nol");
  ok(
    Object.values(kosong).every((v) => v === 0),
    "tanpa pendana, semua kolom nol (bukan NaN)",
  );
}

console.log(`tabelPendana.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
