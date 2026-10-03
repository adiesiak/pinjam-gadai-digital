/** Run: bun src/lib/transferPendana.test.ts */
import {
  LABEL_TRANSFER,
  rekapTransferPendana,
  ringkasTransfer,
  type PinjamanTransfer,
  type TransferBaris,
} from "./transferPendana";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function baris(nilai: Partial<TransferBaris> = {}): TransferBaris {
  return {
    jumlah: 100_000,
    status: "dicatat",
    dicatatPada: 1_000,
    ...nilai,
  };
}

function pinjaman(nilai: Partial<PinjamanTransfer> = {}): PinjamanTransfer {
  return {
    status: "lunas",
    keuntunganPendana: 200_000,
    adaPendana: true,
    transfer: ringkasTransfer([]),
    ...nilai,
  };
}

// ===== ringkasTransfer =====

eq(ringkasTransfer([]).status, "belum_dicatat", "tanpa baris = belum dicatat");
eq(ringkasTransfer([]).jumlah, 0, "tanpa baris nominal nol");
eq(ringkasTransfer([]).jumlahCatatan, 0, "tanpa baris tidak ada catatan");

const satu = ringkasTransfer([baris()]);
eq(satu.status, "dicatat", "satu baris dicatat");
eq(satu.jumlah, 100_000, "nominal terpakai");
eq(satu.jumlahCatatan, 1, "satu catatan berlaku");
eq(satu.adaPembatalan, false, "belum ada pembatalan");

// Baris terbaru yang menentukan: catatan lama yang sudah dibatalkan tidak
// menghapus status baris terbaru.
const catatLaluBatal = ringkasTransfer([
  baris({ dicatatPada: 1_000 }),
  baris({ status: "dibatalkan", dicatatPada: 2_000, alasanBatal: "salah nominal" }),
]);
eq(catatLaluBatal.status, "dibatalkan", "baris terbaru dibatalkan menang");
eq(catatLaluBatal.jumlah, 0, "dibatalkan tidak menyisakan nominal");
eq(catatLaluBatal.alasanBatal, "salah nominal", "alasan batal terbaca");
eq(catatLaluBatal.adaPembatalan, true, "ada pembatalan tercatat");
eq(catatLaluBatal.jumlahCatatan, 1, "satu catatan berlaku sebelum batal");

// Urutan masukan tidak boleh memengaruhi hasil — yang menentukan waktu.
const urutanTerbalik = ringkasTransfer([
  baris({ status: "dibatalkan", dicatatPada: 2_000 }),
  baris({ dicatatPada: 1_000 }),
]);
eq(urutanTerbalik.status, "dibatalkan", "urutan masukan tidak memengaruhi status");

// Catatan baru setelah pembatalan kembali berlaku.
const batalLaluCatatUlang = ringkasTransfer([
  baris({ dicatatPada: 1_000 }),
  baris({ status: "dibatalkan", dicatatPada: 2_000 }),
  baris({ jumlah: 250_000, dicatatPada: 3_000, referensi: "TRX-9" }),
]);
eq(batalLaluCatatUlang.status, "dicatat", "catat ulang mengembalikan status");
eq(batalLaluCatatUlang.jumlah, 250_000, "nominal catatan terbaru");
eq(batalLaluCatatUlang.referensi, "TRX-9", "referensi catatan terbaru");
eq(batalLaluCatatUlang.alasanBatal, null, "berlaku berarti tanpa alasan batal");
eq(batalLaluCatatUlang.adaPembatalan, true, "riwayat pembatalan tetap terlihat");

// ===== rekapTransferPendana =====

const kosong = rekapTransferPendana([]);
eq(kosong.jumlahLunas, 0, "rekap kosong: nol lunas");
eq(kosong.keuntunganBelumDicatat, 0, "rekap kosong: nol kewajiban");
eq(kosong.adaBerjalan, false, "rekap kosong: tanpa pinjaman berjalan");

// Hanya pinjaman lunas yang menjadi kewajiban transfer; pinjaman berjalan
// belum jatuh tempo walau keuntungannya sudah bisa dihitung.
const campuran = rekapTransferPendana([
  pinjaman({ keuntunganPendana: 200_000 }),
  pinjaman({ status: "didanai", keuntunganPendana: 150_000 }),
  pinjaman({
    keuntunganPendana: 300_000,
    transfer: ringkasTransfer([baris({ jumlah: 300_000 })]),
  }),
]);
eq(campuran.jumlahLunas, 2, "dua pinjaman lunas");
eq(campuran.jumlahTercatat, 1, "satu sudah dicatat");
eq(campuran.jumlahBelumDicatat, 1, "satu belum dicatat");
eq(campuran.keuntunganLunas, 500_000, "kewajiban hanya dari lunas");
eq(campuran.keuntunganTercatat, 300_000, "tercatat dijumlahkan");
eq(campuran.keuntunganBelumDicatat, 200_000, "selisih jadi belum dicatat");
eq(campuran.adaBerjalan, true, "pinjaman berjalan terdeteksi");

// Pinjaman tanpa pendana tidak pernah jadi kewajiban — tidak ada penerimanya.
const tanpaPendana = rekapTransferPendana([
  pinjaman({ adaPendana: false, keuntunganPendana: 999_999 }),
  pinjaman({ keuntunganPendana: 100_000 }),
]);
eq(tanpaPendana.jumlahLunas, 1, "pinjaman tanpa pendana dilewati");
eq(tanpaPendana.keuntunganLunas, 100_000, "tanpa pendana tidak dihitung");

// Catatan yang dibatalkan tidak dianggap sudah ditransfer.
const dibatalkan = rekapTransferPendana([
  pinjaman({
    transfer: ringkasTransfer([
      baris(),
      baris({ status: "dibatalkan", dicatatPada: 5_000 }),
    ]),
  }),
]);
eq(dibatalkan.jumlahTercatat, 0, "catatan dibatalkan bukan tercatat");
eq(dibatalkan.jumlahBelumDicatat, 1, "kembali jadi belum dicatat");
eq(dibatalkan.keuntunganBelumDicatat, 200_000, "nominal kembali jadi kewajiban");

// ===== label =====

eq(LABEL_TRANSFER.belum_dicatat, "belum dicatat", "label belum dicatat");
eq(LABEL_TRANSFER.dicatat, "sudah dicatat", "label sudah dicatat");
eq(LABEL_TRANSFER.dibatalkan, "catatan dibatalkan", "label dibatalkan");

console.log(`transferPendana.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
