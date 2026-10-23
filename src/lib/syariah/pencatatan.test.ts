/** Run: bun src/lib/syariah/pencatatan.test.ts */
import { dataPencatatanDariPengajuan } from "./pencatatan";

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
    console.error(`FAIL ${label}: seharusnya melempar`);
  } catch {
    passed += 1;
  }
}

const disetujui = {
  jenis: "murabahah" as const,
  status: "disetujui" as const,
  peminjamNama: "Rina Wati",
  pokok: 875_000,
  tenorHari: 30,
  marginPersen: 18,
  katalogId: "el-dispenser-air",
  statusPenyerahan: "terkirim" as const,
};

// ===== 1. Angka pengajuan dipakai apa adanya =====
{
  const data = dataPencatatanDariPengajuan({
    pengajuan: disetujui,
    jenis: "murabahah",
    sudahAdaAkad: false,
  });
  eq(data.pokok, 875_000, "pokok mengikuti pengajuan");
  eq(data.tenorHari, 30, "tenor mengikuti pengajuan");
  eq(data.marginPersen, 18, "margin mengikuti keputusan admin");
  eq(data.peminjamNama, "Rina Wati", "nama peminjam dari pengajuan");
}

// ===== 2. Status pengajuan menentukan =====
throws(
  () =>
    dataPencatatanDariPengajuan({
      pengajuan: { ...disetujui, status: "diajukan" },
      jenis: "murabahah",
      sudahAdaAkad: false,
    }),
  "pengajuan yang belum diputuskan ditolak",
);
throws(
  () =>
    dataPencatatanDariPengajuan({
      pengajuan: { ...disetujui, status: "ditolak" },
      jenis: "murabahah",
      sudahAdaAkad: false,
    }),
  "pengajuan yang ditolak tidak bisa jadi akad",
);
throws(
  () =>
    dataPencatatanDariPengajuan({
      pengajuan: disetujui,
      jenis: "rahn",
      sudahAdaAkad: false,
    }),
  "jenis akad yang berbeda ditolak",
);
throws(
  () =>
    dataPencatatanDariPengajuan({
      pengajuan: disetujui,
      jenis: "murabahah",
      sudahAdaAkad: true,
    }),
  "akad ganda untuk satu pengajuan ditolak",
);

// ===== 3. Barang katalog harus sudah diserahkan =====
throws(
  () =>
    dataPencatatanDariPengajuan({
      pengajuan: { ...disetujui, statusPenyerahan: "belum" },
      jenis: "murabahah",
      sudahAdaAkad: false,
    }),
  "barang katalog yang belum terkirim ditolak",
);
throws(
  () =>
    dataPencatatanDariPengajuan({
      pengajuan: { ...disetujui, statusPenyerahan: undefined },
      jenis: "murabahah",
      sudahAdaAkad: false,
    }),
  "barang katalog tanpa status penyerahan ditolak",
);

// Barang yang ditulis sendiri tidak punya tanda penyerahan katalog.
{
  const data = dataPencatatanDariPengajuan({
    pengajuan: {
      jenis: "murabahah",
      status: "disetujui",
      peminjamNama: "Budi",
      pokok: 2_000_000,
      tenorHari: 60,
    },
    jenis: "murabahah",
    sudahAdaAkad: false,
  });
  eq(data.marginPersen, 15, "margin kosong memakai batas bawah 15%");
  eq(data.pokok, 2_000_000, "barang non-katalog tetap bisa dicatat");
}

// ===== 4. Rahn membawa taksiran; Qardh tidak membawa margin =====
{
  const data = dataPencatatanDariPengajuan({
    pengajuan: {
      jenis: "rahn",
      status: "disetujui",
      peminjamNama: "Sari",
      pokok: 1_500_000,
      tenorHari: 30,
      nilaiTaksiran: 2_400_000,
    },
    jenis: "rahn",
    sudahAdaAkad: false,
  });
  eq(data.nilaiTaksiran, 2_400_000, "taksiran pengajuan ikut ke akad");
  eq(data.marginPersen, undefined, "Rahn tidak membawa margin");
}
{
  const data = dataPencatatanDariPengajuan({
    pengajuan: {
      jenis: "qardh",
      status: "disetujui",
      peminjamNama: "Asep",
      pokok: 1_000_000,
      tenorHari: 30,
    },
    jenis: "qardh",
    sudahAdaAkad: false,
  });
  eq(data.marginPersen, undefined, "Qardh tanpa margin");
  eq(data.nilaiTaksiran, undefined, "Qardh tanpa taksiran");
  eq(data.pokok, 1_000_000, "Qardh memakai pokok pengajuan");
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`pencatatan akad syariah: ${passed} pemeriksaan lulus`);
