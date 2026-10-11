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
function baris(status: LoanRow["status"], index: number): LoanRow {
  return {
    _id: `loans-${index}` as unknown as Id<"loans">,
    _creationTime: Date.UTC(2026, 0, 1 + index),
    nomorReferensi: `PGD-TEST-${index}`,
    pokokPinjaman: 1_000_000,
    persenBunga: null,
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

console.log(`queue-views.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
