/**
 * Uji sub-tab antrean pinjaman admin (tab Pinjaman di /admin).
 * Run: bun src/pages/admin/queue-views.render.test.tsx
 *
 * Menjaga satu aturan yang sempat bocor: **setiap status pinjaman harus punya
 * sub-tabnya sendiri**. Sebelum tab "Didanai" ada, pinjaman berstatus `didanai`
 * tidak cocok dengan sub-tab mana pun — 13 dari 25 baris hanya terlihat di
 * "Semua", dan angka sub-tab tidak pernah menjumlah ke total.
 *
 * Dua lapis pengujian:
 * 1. himpunan opsi sub-tab diuji terhadap seluruh status di `LOAN_STATUS_FLOW`
 *    (di luar markup, supaya kegagalan menjelaskan status mana yang hilang);
 * 2. markup hasil render diperiksa supaya tab itu benar-benar muncul di layar
 *    dengan hitungan yang benar — termasuk tombol "Didanai".
 */
import { renderToStaticMarkup } from "react-dom/server";

import type { Id } from "@/convex/_generated/dataModel";
import { LOAN_STATUS_FLOW } from "@/lib/loan";

import { LoanQueueSection, PawnQueueSection } from "./queue-views";
import { barisKredit } from "@/components/admin/barisKredit";
import type { KreditRowData } from "@/components/admin/KreditReviewDialog";
import {
  TabelAntrean,
  urutkanBarisAntrean,
  type BarisAntrean,
} from "@/components/admin/TabelAntrean";
import { CatatPengajuanManualButton } from "@/components/admin/CatatPengajuanManual";
import type { LoanRow } from "@/components/admin/admin-shared";
import { JENIS_MANUAL } from "@/lib/pengajuanManual";
import { SUB_TAB_PINJAMAN } from "@/lib/subTabAntrean";

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
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function ada(html: string, teks: string, label: string): void {
  ok(html.includes(teks), `${label} (memuat "${teks}")`);
}
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}

/** Satu baris pinjaman buatan; hanya field yang dibaca panel yang diisi. */
function baris(
  status: LoanRow["status"],
  index: number,
  cairEkspres: boolean | null = null,
): LoanRow {
  return {
    _id: `loans-${index}` as unknown as Id<"loans">,
    _creationTime: Date.UTC(2026, 0, 1 + index),
    nomorReferensi: `PGD-TEST-${index}`,
    pokokPinjaman: 1_000_000,
    persenBunga: null,
    cairEkspres,
    tujuan: "kebutuhan_pribadi",
    status,
    namaLengkap: `PEMINJAM ${status.toUpperCase()}`,
    namaBank: "BRI",
    nomorRekening: "1234567890",
    emailPeminjam: "uji@example.com",
    userIdPeminjam: `users-${index}` as unknown as Id<"users">,
    tenorHari: 30,
    tenorBulan: null,
    cicilanPerBulan: null,
    biayaLayananTotal: null,
    imbalHasilTotal: null,
    totalKewajiban: null,
    nik: null,
    nomorWhatsApp: null,
    penghasilanBulanan: null,
    sumberPenghasilan: null,
    dokKtpId: null,
    dokSelfieKtpId: null,
    dokSlipGajiId: null,
    lokasiAjukan: null,
    jatuhTempoPada: null,
    sisaHari: null,
    hariTerlambat: null,
    dendaTerlambat: null,
    totalKewajibanDenganPenalti: null,
  };
}

/** Satu baris untuk setiap status di alur pinjaman. */
const LOANS: LoanRow[] = LOAN_STATUS_FLOW.map((status, i) => baris(status, i));

/** Label → angka yang dirender sub-tab (`>Label<span …>angka</span>`). */
function hitungTab(html: string): Map<string, number> {
  const peta = new Map<string, number>();
  for (const cocok of html.matchAll(/>([^<]{1,40})<span[^>]*>(\d+)<\/span>/g)) {
    peta.set(cocok[1].trim(), Number(cocok[2]));
  }
  return peta;
}

// ===== 1. Setiap status punya tepat satu sub-tab =====
{
  const penyaring = SUB_TAB_PINJAMAN.filter((t) => t.id !== "semua");
  for (const status of LOAN_STATUS_FLOW) {
    const cocok = penyaring.filter((t) => t.cocok(baris(status, 0)));
    eq(cocok.length, 1, `status "${status}" masuk tepat satu sub-tab (dapat ${cocok
      .map((t) => t.label)
      .join(", ") || "tidak ada"})`);
  }
  // "Semua" adalah jalan keluar terakhir: tidak boleh ada status yang hanya
  // terlihat di sana karena sub-tabnya hilang.
  const semua = SUB_TAB_PINJAMAN.find((t) => t.id === "semua");
  ok(semua !== undefined && LOAN_STATUS_FLOW.every((s) => semua.cocok(baris(s, 0))), "\"Semua\" mencakup setiap status");
  // Rentang yang sudah selesai dipisah dari antrean keputusan.
  const belum = SUB_TAB_PINJAMAN.find((t) => t.id === "belum-didanai");
  ok(belum !== undefined && !belum.cocok(baris("didanai", 0)), "sub-tab tahap tinjauan tidak menelan pinjaman berjalan");
  ok(
    SUB_TAB_PINJAMAN.some((t) => t.id === "didanai" && t.cocok(baris("didanai", 0)) && !t.cocok(baris("lunas", 0))),
    "sub-tab \"Disalurkan\" hanya untuk pinjaman berjalan, bukan yang lunas",
  );
  // Ketiga ejaan tahap tinjauan duduk di SATU sub-tab: itulah penggabungan
  // enam status lama menjadi empat status aplikasi.
  ok(
    belum !== undefined &&
      (["diajukan", "sedang_direview", "disetujui"] as const).every((s) =>
        belum.cocok(baris(s, 0)),
      ),
    "satu sub-tab untuk seluruh ejaan tahap tinjauan",
  );
}

// ===== 2. Tab benar-benar dirender dengan hitungan yang benar =====
{
  const html = renderToStaticMarkup(<LoanQueueSection loans={LOANS} onOpen={() => {}} />);
  const tab = hitungTab(html);

  // Daftar memakai tabel data: tiap fakta punya kolomnya sendiri, bukan satu
  // kalimat panjang yang mencampur nama, referensi, nominal, dan keperluan.
  ada(html, 'data-slot="table"', "antrean memakai tabel data");
  ada(html, "ID Transaksi", "kolom ID transaksi tampil");
  ada(html, "Nominal Pokok", "kolom nominal pokok tampil");
  ada(html, "Keperluan &amp; tanggal", "kolom keperluan & tanggal terpisah");
  ada(html, "hover:bg-slate-50", "baris tabel menyala saat disorot");
  ada(html, 'aria-label="Proses pengajuan PGD-TEST-0"', "pengajuan baru punya tombol Proses");
  ada(
    html,
    'aria-label="Urutkan berdasarkan Nominal Pokok"',
    "kepala kolom nominal bisa diurutkan",
  );
  ada(html, 'aria-sort="none"', "keadaan urutan awal diumumkan ke pembaca layar");

  // Status yang ditampilkan punya sub-tabnya masing-masing (tanpa ejaan lama).
  ada(html, "Disalurkan", "tombol sub-tab \"Disalurkan\" tampil");
  ada(html, "Ditinjau", "tombol sub-tab \"Ditinjau\" tampil");
  eq(/Belum didanai/.test(html), false, "label tahap \"Belum didanai\" sudah tidak ada");
  eq(/>Didanai</.test(html), false, "label \"Didanai\" sudah tidak ada");
  ada(
    html,
    "Dana sudah ditandai tersalurkan dan pinjaman sedang berjalan",
    "hint sub-tab \"Disalurkan\" menjelaskan isinya",
  );

  eq(tab.get("Semua"), LOANS.length, "jumlah \"Semua\" = seluruh pinjaman");
  eq(tab.get("Disalurkan"), 1, "jumlah \"Disalurkan\" = pinjaman berjalan");
  eq(tab.get("Lunas"), 1, "jumlah \"Lunas\" = pinjaman lunas");
  eq(tab.get("Ditolak"), 1, "jumlah \"Ditolak\" = pengajuan ditolak");
  eq(tab.get("Dibatalkan"), 1, "jumlah \"Dibatalkan\" = pengajuan ditarik nasabah");
  eq(tab.get("Ditinjau"), 3, "jumlah \"Ditinjau\" = ejaan diajukan + review + disetujui");

  // Invarian yang dulu bocor: tab status harus menjumlah ke "Semua".
  const jumlahTab = ["Ditinjau", "Disalurkan", "Ditolak", "Dibatalkan", "Lunas"].reduce(
    (total, label) => total + (tab.get(label) ?? 0),
    0,
  );
  eq(jumlahTab, LOANS.length, "seluruh sub-tab status menjumlah ke \"Semua\"");

  bersih(html, "markup antrean pinjaman");
}

// ===== 3. Pencatatan pengajuan manual tersedia dari tab produknya =====
{
  // Tab Pinjaman: tombol tetap ada saat antrean kosong MAUPUN terisi — admin
  // harus bisa mencatat pengajuan yang diterima di luar aplikasi kapan pun.
  ada(
    renderToStaticMarkup(<LoanQueueSection loans={[]} onOpen={() => {}} />),
    "Catat pengajuan pinjaman",
    "CTA pencatatan manual tampil saat antrean pinjaman kosong",
  );
  const isi = renderToStaticMarkup(<LoanQueueSection loans={LOANS} onOpen={() => {}} />);
  ada(isi, "Catat pengajuan pinjaman", "CTA pencatatan manual tampil bersama antrean pinjaman");

  // Tab Gadai: panel gadai kosong tetap menampilkan CTA-nya.
  const gadai = renderToStaticMarkup(<PawnQueueSection pawns={[]} onOpen={() => {}} />);
  ada(gadai, "Catat pengajuan gadai", "CTA pencatatan manual tampil di tab gadai");
  bersih(gadai, "markup antrean gadai");

  // Ketiga produk memakai komponen yang sama; labelnya tidak boleh tertukar,
  // dan isi dialog baru dirender setelah tombolnya ditekan (bukan ikut tampil).
  for (const jenis of ["pinjaman", "gadai", "kredit"] as const) {
    const html = renderToStaticMarkup(<CatatPengajuanManualButton jenis={jenis} />);
    ada(html, JENIS_MANUAL[jenis].cta, `tombol manual ${jenis} memakai label jenisnya`);
    eq(
      html.includes(JENIS_MANUAL[jenis].deskripsi),
      false,
      `isi dialog ${jenis} belum dirender sebelum tombolnya ditekan`,
    );
    bersih(html, `markup tombol manual ${jenis}`);
  }
}

// ===== 4. Cair ekspres: lencana khusus + paling atas antrean =====
{
  // Pengajuan ekspres sengaja LEBIH LAMA daripada pengajuan biasa: urutan
  // terbaru-dulu saja akan menaruhnya di bawah, jadi tes ini membuktikan
  // prioritas ekspres benar-benar bekerja.
  const ekspres: LoanRow = {
    ...baris("diajukan", 90, true),
    namaLengkap: "PEMINJAM EKSPRES",
    _creationTime: Date.UTC(2026, 0, 1),
  };
  const biasaBaru: LoanRow = {
    ...baris("diajukan", 91, false),
    namaLengkap: "PEMINJAM BIASA BARU",
    _creationTime: Date.UTC(2026, 0, 20),
  };
  const html = renderToStaticMarkup(
    <LoanQueueSection loans={[biasaBaru, ekspres]} onOpen={() => {}} />,
  );
  ada(html, "Cair ekspres", "lencana cair ekspres tampil pada baris antrean");
  const posisiEkspres = html.indexOf("PEMINJAM EKSPRES");
  const posisiBiasa = html.indexOf("PEMINJAM BIASA BARU");
  ok(
    posisiEkspres >= 0 && posisiBiasa >= 0 && posisiEkspres < posisiBiasa,
    "pengajuan cair ekspres tampil paling atas antrean",
  );

  // Baris tanpa centang tidak boleh mendapat lencana ekspres.
  const tanpaEkspres = renderToStaticMarkup(
    <LoanQueueSection loans={[biasaBaru]} onOpen={() => {}} />,
  );
  ok(!tanpaEkspres.includes("Cair ekspres"), "tanpa cair ekspres tidak ada lencana");
  bersih(html, "markup antrean ekspres");
}

// ===== 5. Pengurutan kolom tabel antrean =====
{
  const dasar = [
    {
      id: "a",
      nama: "Budi",
      email: null,
      referensi: "PGD-2",
      nominal: 2_000_000,
      keperluan: "Kebutuhan pribadi",
      waktu: 2,
      statusTeks: "Lunas",
      status: null,
      aksi: null,
    },
    {
      id: "b",
      nama: "Ani",
      email: null,
      referensi: "PGD-1",
      nominal: null,
      keperluan: "Modal usaha",
      waktu: 1,
      statusTeks: "Ditinjau",
      status: null,
      aksi: null,
    },
    {
      id: "c",
      nama: "Cici",
      email: null,
      referensi: "PGD-3",
      nominal: 1_000_000,
      keperluan: "Pendidikan",
      waktu: 3,
      statusTeks: "Disalurkan",
      status: null,
      aksi: null,
    },
  ] satisfies BarisAntrean[];

  eq(
    urutkanBarisAntrean(dasar, "nama", "naik")
      .map((b) => b.nama)
      .join(","),
    "Ani,Budi,Cici",
    "urut nama menaik",
  );
  eq(
    urutkanBarisAntrean(dasar, "nominal", "naik")
      .map((b) => b.id)
      .join(","),
    "c,a,b",
    "urut nominal menaik dan baris tanpa nominal tetap di bawah",
  );
  eq(
    urutkanBarisAntrean(dasar, "nominal", "turun")
      .map((b) => b.id)
      .join(","),
    "a,c,b",
    "urut nominal menurun dan baris tanpa nominal tetap di bawah",
  );
  eq(
    urutkanBarisAntrean(dasar, "waktu", "turun")
      .map((b) => b.id)
      .join(","),
    "c,a,b",
    "urut tanggal terbaru lebih dulu",
  );
  eq(
    urutkanBarisAntrean(dasar, "status", "naik")
      .map((b) => b.id)
      .join(","),
    "c,b,a",
    "urut status memakai label yang dibaca admin",
  );
  eq(
    urutkanBarisAntrean(dasar, "referensi", "naik")
      .map((b) => b.referensi)
      .join(","),
    "PGD-1,PGD-2,PGD-3",
    "urut ID transaksi",
  );
}

// ===== 6. Antrean kredit memakai kolom & aksi yang sama =====
{
  const buatKredit = (
    id: string,
    referensi: string,
    nama: string,
    status: KreditRowData["status"],
  ) =>
    ({
      _id: id,
      _creationTime: Date.UTC(2026, 9, 23),
      nomorReferensi: referensi,
      namaLengkap: nama,
      emailPemohon: "kredit@example.com",
      namaBarang: "Kulkas dua pintu",
      merchant: "Toko Elektronik",
      kategori: "Elektronik",
      hargaBarang: 3_000_000,
      status,
    }) as unknown as KreditRowData;

  const diajukan = barisKredit(buatKredit("kredit-1", "KRD-1", "SITI", "diajukan"), () => {});
  const disetujui = barisKredit(
    buatKredit("kredit-2", "KRD-2", "ANDI", "disetujui"),
    () => {},
  );
  eq(diajukan.statusTeks, "Diajukan", "teks status kredit untuk pengurutan");
  eq(diajukan.nominal, 3_000_000, "nominal kredit = harga barang");

  const html = renderToStaticMarkup(
    <TabelAntrean
      keterangan="Antrean kredit barang"
      judulNominal="Harga Barang"
      judulKeperluan="Barang & merchant"
      baris={[diajukan, disetujui]}
    />,
  );
  ada(html, "Harga Barang", "kolom harga barang untuk kredit");
  ada(html, "Barang &amp; merchant", "kolom barang & merchant untuk kredit");
  ada(html, "Rp 3.000.000", "harga barang tampil");
  ada(html, "KRD-1", "ID transaksi kredit tampil");
  ada(html, 'aria-label="Proses pengajuan KRD-1"', "pengajuan kredit baru punya tombol Proses");
  ada(html, 'aria-label="Detail pengajuan KRD-2"', "kredit yang sudah diputuskan punya tombol Detail");
  ada(html, "Disetujui (status aplikasi)", "status kredit tampil utuh");
  bersih(html, "tabel antrean kredit");
}

console.log(`queue-views.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
