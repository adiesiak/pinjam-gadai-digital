/** Run: bun src/lib/qcKonsistensi.test.ts */
import {
  GRUP_QC,
  jalankanQc,
  type CekQc,
  type InputQc,
  type StatusCekQc,
} from "./qcKonsistensi";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
function ok(syarat: boolean, label: string): void {
  eq(syarat, true, label);
}

/**
 * Snapshot data yang SEHAT: satu pinjaman harian Rp1.000.000 @30% yang sudah
 * lunas, panel & ruang sepakat, kartu admin sama.
 * Tiap kasus uji menyalin fixture ini lalu merusak SATU sisi saja.
 *
 * Angkanya mengikuti kebijakan berjalan (lihat tabel di lib/bagiHasil.ts):
 * potongan platform = 5% dari total kembali Rp1.300.000 = Rp65.000, jadi
 * penyedia dana menerima Rp1.235.000 dan keuntungan bersihnya Rp235.000.
 * Pendapatan platform satu pinjaman = Rp20.000 (di muka) + Rp65.000 = Rp85.000.
 */
function sehat(): InputQc {
  return {
    ruang: {
      terpotong: { pinjaman: false },
      ringkasan: {
        totalBungaPinjaman: 300_000,
        totalKeuntunganAdmin: 65_000,
        totalKeuntunganPendana: 235_000,
        // Peminjam tunggal ini sudah lunas: seluruh keuntungan sudah dibukukan.
        totalKeuntunganPendanaLunas: 235_000,
        totalKeuntunganPendanaBelumLunas: 0,
        totalKeuntunganAdminLunas: 65_000,
        totalKeuntunganAdminBelumLunas: 0,
        totalTransferBelumDicatat: 1,
        nilaiTransferBelumDicatat: 235_000,
        persenBunga: 30,
        persenPotonganAdmin: 5,
      },
      rekapPendana: [
        {
          nama: "Budi",
          jumlahPinjaman: 1,
          totalDisalurkan: 1_000_000,
          saldoBerjalan: 0,
          totalBunga: 300_000,
          keuntunganPendana: 235_000,
          keuntunganPendanaLunas: 235_000,
          keuntunganPendanaBelumLunas: 0,
          keuntunganAdmin: 65_000,
          keuntunganAdminLunas: 65_000,
          keuntunganAdminBelumLunas: 0,
          transferBelumDicatat: 1,
          keuntunganBelumDicatat: 235_000,
        },
      ],
      pinjaman: [
        {
          nomorReferensi: "PGD-1",
          status: "lunas",
          pokokPinjaman: 1_000_000,
          tenorBulan: null,
          persenBunga: null,
          bunga: 300_000,
          totalLunas: 1_300_000,
          potonganAdmin: 65_000,
          keuntunganPendana: 235_000,
          keuntunganAdmin: 65_000,
        },
      ],
    },
    panel: {
      ringkasan: {
        persenBunga: 30,
        persenPotonganAdmin: 5,
        totalDisalurkan: 1_000_000,
        saldoBerjalan: 0,
        totalBunga: 300_000,
        keuntunganAdmin: 65_000,
        keuntunganPendana: 235_000,
        keuntunganBelumDicatat: 235_000,
      },
      rows: [
        {
          nama: "Budi",
          email: "budi@pindai.test",
          metrik: {
            jumlahPinjaman: 1,
            totalDisalurkan: 1_000_000,
            saldoBerjalan: 0,
            totalBunga: 300_000,
            keuntunganPendana: 235_000,
            keuntunganAdmin: 65_000,
          },
        },
      ],
    },
    stats: {
      keuntunganAdminTercatat: 65_000,
      keuntunganAdminBelumTercatat: 0,
      totalPinjaman: 1,
      pinjamanBaru: 0,
      totalPinjamanBerjalan: 0,
    },
  };
}

function salinan(): InputQc {
  return structuredClone(sehat());
}

function cekDari(hasil: ReturnType<typeof jalankanQc>, id: string): CekQc {
  const ditemukan = hasil.cek.find((c) => c.id === id);
  if (ditemukan === undefined) {
    failed += 1;
    console.error(`FAIL pemeriksaan "${id}" tidak ada dalam suite`);
    return { id, grup: "?", judul: "?", status: "gagal", detail: "hilang", nilai: [] };
  }
  return ditemukan;
}
function statusDari(hasil: ReturnType<typeof jalankanQc>, id: string): StatusCekQc {
  return cekDari(hasil, id).status;
}

// ===== 1. Suite sehat: seluruh pemeriksaan lulus =====
{
  const hasil = jalankanQc(sehat());
  eq(hasil.ringkasan.total, 12, "suite memuat 12 pemeriksaan");
  eq(hasil.ringkasan.gagal, 0, "tidak ada gagalan pada data sehat");
  eq(hasil.ringkasan.awas, 0, "tidak ada peringatan pada data sehat");
  eq(hasil.ringkasan.lewat, 0, "tidak ada pemeriksaan terlewat pada data sehat");
  eq(hasil.ringkasan.lulus, 12, "semua pemeriksaan lulus");
  ok(hasil.lulusSemua, "suite sehat dinyatakan lulus");
  for (const c of hasil.cek) {
    eq(c.status, "lulus", `sehat → ${c.id}`);
    ok(c.detail.length > 0, `${c.id} punya detail`);
    ok(c.nilai.length > 0, `${c.id} punya angka pengamatan`);
    ok(GRUP_QC.includes(c.grup as (typeof GRUP_QC)[number]), `${c.id} dalam grup resmi`);
  }
  eq(new Set(hasil.cek.map((c) => c.id)).size, 12, "id pemeriksaan unik");
}

// ===== 2. Ruang: pembagian Imbal Hasil tidak kembali utuh → gagal =====
{
  const input = salinan();
  input.ruang.pinjaman[0].potonganAdmin = 20_000;
  const hasil = jalankanQc(input);
  eq(statusDari(hasil, "baris-identitas"), "gagal", "potongan + penyedia ≠ bunga → gagal");
  eq(statusDari(hasil, "baris-hitung-ulang"), "gagal", "angka baris ≠ hitung ulang → gagal");
}

// ===== 3. Ruang: masukan di luar rentang → peringatan, bukan kegagalan =====
{
  const input = salinan();
  input.ruang.pinjaman[0].pokokPinjaman = 1_000_000.5; // jatuh ke fallback nol
  const hasil = jalankanQc(input);
  eq(statusDari(hasil, "baris-hitung-ulang"), "awas", "hitung ulang melempar → awas");
  eq(statusDari(hasil, "baris-identitas"), "lulus", "identitas baris tetap utuh");
  ok(hasil.lulusSemua, "peringatan tidak menggagalkan suite");
}

// ===== 4. Ruang: total yang tampil ≠ jumlah baris/rekap → gagal =====
{
  const input = salinan();
  input.ruang.ringkasan.totalBungaPinjaman = 400_000;
  eq(statusDari(jalankanQc(input), "ringkasan-ruang"), "gagal", "ringkasan ≠ jumlah baris → gagal");
}

// ===== 5. Ruang: keuntungan belum lunas tercampur yang sudah lunas → gagal =====
{
  const input = salinan();
  // Totalnya tidak berubah, tetapi "belum lunas" dinaikkan tanpa menurunkan
  // "sudah lunas": uang yang belum masuk dihitung sebagai hak yang sudah cair.
  input.ruang.rekapPendana[0].keuntunganPendanaBelumLunas = 250_000;
  input.ruang.ringkasan.totalKeuntunganPendanaBelumLunas = 250_000;
  const hasil = jalankanQc(input);
  eq(
    statusDari(hasil, "pemisahan-lunas"),
    "gagal",
    "pecahan lunas + belum lunas ≠ total → gagal",
  );
  ok(
    cekDari(hasil, "pemisahan-lunas").detail.includes("Budi"),
    "pendana yang pecahannya salah disebut namanya",
  );
  // Total agregat lain tetap cocok: yang salah memang hanya pemisahannya.
  eq(statusDari(hasil, "ringkasan-ruang"), "lulus", "total lain tetap cocok");
}

// ===== 6. Ruang: identitas agregat admin + penyedia = Imbal Hasil =====
{
  const input = salinan();
  input.ruang.rekapPendana[0].keuntunganPendana = 300_000;
  input.ruang.rekapPendana[0].keuntunganPendanaLunas = 300_000;
  input.ruang.ringkasan.totalKeuntunganPendana = 300_000;
  input.ruang.ringkasan.totalKeuntunganPendanaLunas = 300_000;
  input.panel.rows[0].metrik.keuntunganPendana = 300_000;
  input.panel.ringkasan.keuntunganPendana = 300_000;
  const hasil = jalankanQc(input);
  eq(statusDari(hasil, "identitas-agregat"), "gagal", "65.000 + 300.000 ≠ 300.000 → gagal");
  eq(hasil.ringkasan.gagal, 1, "hanya identitas agregat yang gagal");
}

// ===== 7. Kebijakan berbeda antara panel dan ruang → gagal =====
{
  const input = salinan();
  input.panel.ringkasan.persenPotonganAdmin = 7;
  eq(statusDari(jalankanQc(input), "kebijakan-bersama"), "gagal", "kebedaan kebijakan → gagal");
}

// ===== 8. Rekonsiliasi: selisih per pendana → gagal, total ditutup =====
{
  const input = salinan();
  input.panel.rows[0].metrik.totalBunga = 250_000;
  input.panel.ringkasan.totalBunga = 250_000;
  const hasil = jalankanQc(input);
  eq(statusDari(hasil, "rekonsiliasi-selisih"), "gagal", "selisih pendana → gagal");
  ok(cekDari(hasil, "rekonsiliasi-selisih").detail.includes("Budi"), "nama pendana bermasalah disebut");
  eq(statusDari(hasil, "total-panel-ruang"), "lewat", "total ditutup sampai pemetaan beres");
}

// ===== 9. Rekonsiliasi: pinjaman tanpa akun panel → peringatan =====
{
  const input = salinan();
  // Satu pinjaman berjalan milik pendana yang tidak punya akun panel — angka
  // di kedua permukaan tetap konsisten, hanya pasangannya yang hilang.
  input.ruang.pinjaman.push({
    nomorReferensi: "PGD-2",
    status: "didanai",
    pokokPinjaman: 500_000,
    tenorBulan: null,
    persenBunga: null,
    bunga: 150_000,
    totalLunas: 650_000,
    potonganAdmin: 32_500,
    keuntunganPendana: 117_500,
    keuntunganAdmin: 32_500,
  });
  input.ruang.rekapPendana.push({
    nama: "Citra",
    jumlahPinjaman: 1,
    totalDisalurkan: 500_000,
    saldoBerjalan: 500_000,
    totalBunga: 150_000,
    keuntunganPendana: 117_500,
    // Pinjaman Citra masih berjalan — seluruh keuntungannya "belum lunas".
    keuntunganPendanaLunas: 0,
    keuntunganPendanaBelumLunas: 117_500,
    keuntunganAdmin: 32_500,
    keuntunganAdminLunas: 0,
    keuntunganAdminBelumLunas: 32_500,
    transferBelumDicatat: 0,
    keuntunganBelumDicatat: 0,
  });
  input.ruang.ringkasan.totalBungaPinjaman = 450_000;
  input.ruang.ringkasan.totalKeuntunganAdmin = 97_500;
  input.ruang.ringkasan.totalKeuntunganPendana = 352_500;
  input.ruang.ringkasan.totalKeuntunganPendanaLunas = 235_000;
  input.ruang.ringkasan.totalKeuntunganPendanaBelumLunas = 117_500;
  input.ruang.ringkasan.totalKeuntunganAdminLunas = 65_000;
  input.ruang.ringkasan.totalKeuntunganAdminBelumLunas = 32_500;
  input.stats.keuntunganAdminBelumTercatat = 32_500;
  input.stats.totalPinjaman = 2;
  input.stats.totalPinjamanBerjalan = 500_000;
  const hasil = jalankanQc(input);
  eq(statusDari(hasil, "rekonsiliasi-pemetaan"), "awas", "tanpa pasangan → awas");
  eq(statusDari(hasil, "rekonsiliasi-selisih"), "lulus", "baris lain tetap cocok");
  ok(hasil.lulusSemua, "pemetaan tanpa pasangan tidak menggagalkan suite");
  eq(statusDari(hasil, "total-panel-ruang"), "lewat", "total ditutup selama pemetaan belum bersih");
}

// ===== 10. Panel admin: kartu keuntungan ≠ jumlah potongan baris → gagal =====
{
  const input = salinan();
  input.stats.keuntunganAdminTercatat = 20_000;
  eq(statusDari(jalankanQc(input), "admin-vs-ruang"), "gagal", "kartu ≠ baris → gagal");

  const terpotong = salinan();
  terpotong.ruang.terpotong.pinjaman = true;
  const hasilTerpotong = jalankanQc(terpotong);
  eq(statusDari(hasilTerpotong, "admin-vs-ruang"), "lewat", "baris terpotong → lewat");
  eq(
    statusDari(hasilTerpotong, "admin-kartu-pinjaman"),
    "lewat",
    "baris terpotong → kartu pinjaman dilewati",
  );

  // Kartu pinjaman dashboard: cocok dengan baris, atau beda → gagal.
  const berjalan = salinan();
  berjalan.ruang.pinjaman[0].status = "didanai";
  berjalan.stats.totalPinjamanBerjalan = 1_000_000;
  eq(
    statusDari(jalankanQc(berjalan), "admin-kartu-pinjaman"),
    "lulus",
    "kartu pinjaman cocok dengan baris berjalan",
  );

  const salah = salinan();
  salah.stats.pinjamanBaru = 3;
  const hasilSalah = jalankanQc(salah);
  eq(statusDari(hasilSalah, "admin-kartu-pinjaman"), "gagal", "kartu ≠ baris → gagal");
  ok(hasilSalah.ringkasan.gagal >= 1, "kegagalan kartu terhitung dalam ringkasan");
}

// ===== 11. Baris `sedang_direview` ikut dihitung sebagai menunggu review =====
// `adminStats.pinjamanBaru` menghitung `diajukan` DAN `sedang_direview`
// (lib/admin-queue.ts). Pemeriksaan kartu wajib memakai himpunan yang sama;
// kalau hanya `diajukan` yang dihitung di sini, panel dan baris selalu tampak
// berbeda begitu ada pengajuan yang sedang ditinjau — kegagalan palsu di QC.
{
  const cocok = salinan();
  cocok.ruang.pinjaman.push({
    ...cocok.ruang.pinjaman[0],
    nomorReferensi: "PGD-2",
    status: "sedang_direview",
  });
  cocok.stats.totalPinjaman = 2;
  cocok.stats.pinjamanBaru = 1;
  eq(
    statusDari(jalankanQc(cocok), "admin-kartu-pinjaman"),
    "lulus",
    "pengajuan sedang_direview dihitung sebagai menunggu review",
  );

  const salah = salinan();
  salah.ruang.pinjaman.push({
    ...salah.ruang.pinjaman[0],
    nomorReferensi: "PGD-3",
    status: "sedang_direview",
  });
  salah.stats.totalPinjaman = 2;
  salah.stats.pinjamanBaru = 0;
  eq(
    statusDari(jalankanQc(salah), "admin-kartu-pinjaman"),
    "gagal",
    "pengajuan sedang_direview yang tak terhitung kartu tetap ditangkap",
  );
}

// ===== 12. Data kosong: tidak ada kegagalan, hanya pemeriksaan yang terlewat =====
{
  const input: InputQc = {
    ruang: {
      terpotong: { pinjaman: false },
      ringkasan: {
        totalBungaPinjaman: 0,
        totalKeuntunganAdmin: 0,
        totalKeuntunganPendana: 0,
        totalKeuntunganPendanaLunas: 0,
        totalKeuntunganPendanaBelumLunas: 0,
        totalKeuntunganAdminLunas: 0,
        totalKeuntunganAdminBelumLunas: 0,
        totalTransferBelumDicatat: 0,
        nilaiTransferBelumDicatat: 0,
        persenBunga: 30,
        persenPotonganAdmin: 5,
      },
      rekapPendana: [],
      pinjaman: [],
    },
    panel: {
      ringkasan: {
        persenBunga: 30,
        persenPotonganAdmin: 5,
        totalDisalurkan: 0,
        saldoBerjalan: 0,
        totalBunga: 0,
        keuntunganAdmin: 0,
        keuntunganPendana: 0,
        keuntunganBelumDicatat: 0,
      },
      rows: [],
    },
    stats: {
      keuntunganAdminTercatat: 0,
      keuntunganAdminBelumTercatat: 0,
      totalPinjaman: 0,
      pinjamanBaru: 0,
      totalPinjamanBerjalan: 0,
    },
  };
  const hasil = jalankanQc(input);
  eq(hasil.ringkasan.gagal, 0, "data kosong tidak menghasilkan kegagalan");
  eq(hasil.ringkasan.awas, 0, "data kosong tidak menghasilkan peringatan");
  ok(hasil.lulusSemua, "suite tetap lulus pada data kosong");
  ok(hasil.ringkasan.lewat > 0, "pemeriksaan tanpa data ditandai lewat");
}

console.log(`\nqcKonsistensi: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
