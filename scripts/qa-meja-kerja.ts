/**
 * Harness SSR panel "Hari Ini" + lencana menu admin.
 *
 * Repo ini tidak punya uji komponen React (vitest hanya mencakup `src/convex`),
 * jadi render ke string adalah satu-satunya cara memeriksa perilaku UI admin
 * tanpa browser. Hanya merender tab yang aktif — tidak menyentuh Convex.
 *
 * Run: bun scripts/qa-meja-kerja.ts
 */
import { mock } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// `LiveLocationMap` menarik `leaflet`, yang menyentuh `window` saat modul
// dimuat. Panel itu tidak dirender di sini (hanya tab aktif), jadi cukup distub.
mock.module("leaflet", () => ({ default: {} }));

const { AdminTabs } = await import("@/pages/admin/admin-tabs");
const { MejaKerja } = await import("@/pages/admin/meja-kerja");

let lulus = 0;
let gagal = 0;
function cek(nama: string, syarat: boolean, info?: string) {
  if (syarat) {
    lulus += 1;
    console.log(`ok   ${nama}`);
  } else {
    gagal += 1;
    console.error(`FAIL ${nama}${info ? " :: " + info : ""}`);
  }
}
const teksDari = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

type Props = Parameters<typeof AdminTabs>[0];
type Loan = Props["overview"]["loans"][number];
type Pawn = Props["overview"]["pawns"][number];
type Kredit = Props["overview"]["kredit"][number];
type Stats = NonNullable<Props["stats"]>;
type Ledger = NonNullable<Props["ledger"]>;

const pinjaman = (i: number, status: Loan["status"]): Loan =>
  ({
    _id: `l${i}`,
    _creationTime: 1759600000000,
    nomorReferensi: `PGD-${i}`,
    pokokPinjaman: 1_000_000,
    persenBunga: null,
    tujuan: "kebutuhan_pribadi",
    status,
    namaLengkap: `Nasabah ${i}`,
    namaBank: "BCA",
    nomorRekening: "1",
    emailPeminjam: "a@b.c",
    userIdPeminjam: "u1",
  }) as unknown as Loan;
const gadai = (i: number, status: Pawn["status"]): Pawn =>
  ({
    _id: `g${i}`,
    _creationTime: 1759600000000,
    nomorReferensi: `GD-${i}`,
    deskripsiBarang: "Laptop",
    kategori: "Elektronik",
    alamatPenilaian: "Jl. 1",
    status,
    namaLengkap: `Nasabah ${i}`,
    namaBank: "BCA",
    nomorRekening: "1",
    emailPeminjam: "a@b.c",
    hargaPasar: null,
    kondisiFisik: null,
    kodeRakVault: null,
  }) as unknown as Pawn;
const kredit = (i: number, status: Kredit["status"]): Kredit =>
  ({ _id: `k${i}`, status }) as unknown as Kredit;

const stats0: Stats = {
  pinjamanBaru: 0,
  gadaiProses: 0,
  totalPinjaman: 0,
  totalGadai: 0,
  pinjamanDisetujui: 7,
  totalPinjamanBerjalan: 0,
  totalPinjamanDiajukan: 0,
  keuntunganAdminTercatat: 0,
  keuntunganAdminBelumTercatat: 0,
  pinjamanTerlambat: 2,
  nilaiTaksiranDisetujui: 0,
  totalGadaiBerjalan: 0,
  totalKreditBerjalan: 0,
  gpsMismatch: 1,
  pinjamanTanpaLokasi: 1,
  titikDicurigai: 1,
  peringatanLokasiAktif: 1,
};
const ledgerOk: Ledger = {
  totalDebit: 100,
  totalKredit: 100,
  entryCount: 2,
  seimbang: true,
  pendapatanPlatform: 5000,
};

// 2 perlu keputusan (diajukan + sedang_direview), 0 gadai, 0 kredit.
// Bobot menunggu grup "Pengajuan & tindakan" = 2; `alokasi` = 7 tapi "info"
// sehingga TIDAK boleh dijumlahkan (inti perbaikan R3).
const overview = {
  loans: [pinjaman(1, "diajukan"), pinjaman(2, "sedang_direview")],
  pawns: [] as Pawn[],
  kredit: [] as Kredit[],
};
const tabs = (o: Props["overview"], s: Props["stats"], l: Props["ledger"]) =>
  renderToStaticMarkup(
    createElement(AdminTabs, {
      overview: o,
      stats: s,
      ledger: l,
      onOpenLoan: () => {},
      onOpenPawn: () => {},
      onOpenSetup: () => {},
    }),
  );

// ===== A. Tab default + panel "Hari Ini" terpasang =====
const html = tabs(overview, stats0, ledgerOk);
const t = teksDari(html);
cek("A1 region berlabel Hari Ini", html.includes('aria-label="Hari Ini"'));
cek("A2 item Hari Ini ditandai aktif", html.includes('aria-current="page"'));
cek("A3 select default hari-ini", html.includes('value="hari-ini"'));
cek("A4 kartu Perlu keputusan", t.includes("Perlu keputusan"));
cek("A5 CTA menuju antrean", t.includes("Tinjau antrean"));
cek("A6 kartu tanggal acuan", t.includes("Lewat tanggal acuan"));
cek("A7 kartu perhatian lokasi", t.includes("Perhatian lokasi"));
cek("A8 kartu ledger", t.includes("Ledger internal"));
cek("A9 ledger seimbang", t.includes("Seimbang"));
cek("A10 pendapatan tercatat", t.includes("Rp 5.000"));
cek("A11 tanpa NaN", !t.includes("NaN"));
cek("A12 tanpa undefined", !t.includes("undefined"));

// ===== B. R3: lencana informasi tidak dijumlahkan =====
// Lencana grup ada di AccordionTrigger (selalu tampil); lencana item hanya
// terlihat lewat teks <option> karena seksi yang tertutup tidak dirender.
// Probe tepat pada lencana grup: ambil angka pertama setelah judul grup —
// `html.includes(">2<")` saja terlalu lemah karena kartu "Perlu keputusan"
// juga menampilkan 2.
const badgeGrup = (sumber: string, judul: string) =>
  new RegExp(`${judul}</span>[\\s\\S]*?>([\\d!OK]+)<`).exec(sumber)?.[1];
const badgePengajuan = badgeGrup(html, "Pengajuan &amp; tindakan");
cek("B1 grup Pengajuan = 2 (bukan 9)", badgePengajuan === "2", "dapat: " + badgePengajuan);
const badgePemantauan = badgeGrup(html, "Pemantauan");
cek("B4 grup Pemantauan = 6", badgePemantauan === "6", "dapat: " + badgePemantauan);
cek("B2 angka 9 (2+7) tidak pernah muncul", !html.includes(">9<") && !t.includes("· 9"));
cek(
  "B3 lencana informasi alokasi tetap tampil",
  t.includes("Pinjaman disetujui (internal) · 7"),
  "teks opsi tidak memuat · 7",
);
cek("B5 ledger seimbang berlabel OK", t.includes("Ledger internal · OK"));
cek("B6 tanpa tanda seru", !html.includes(">!<"));

// ===== C. R1: ledger belum termuat -> tanpa tanda seru merah =====
const tTanpaLedger = teksDari(tabs(overview, stats0, undefined));
cek("C1 ledger undefined tanpa tanda seru", !tTanpaLedger.includes("Ledger internal · !"));
cek(
  "C2 ledger undefined tanpa lencana sama sekali",
  tTanpaLedger.includes("Ledger internal") && !tTanpaLedger.includes("Ledger internal · "),
);
const tTidakSeimbang = teksDari(
  tabs(overview, stats0, { ...ledgerOk, seimbang: false, totalDebit: 100, totalKredit: 90 }),
);
cek("C3 ledger tidak seimbang -> tanda seru", tTidakSeimbang.includes("Ledger internal · !"));

// ===== D. Aturan angka: "belum siap" bukan 0 =====
const mMemuat = renderToStaticMarkup(
  createElement(MejaKerja, {
    overview,
    stats: undefined,
    ledger: undefined,
    onBukaModul: () => {},
  }),
);
const tmMemuat = teksDari(mMemuat);
const jumlahPisah = (tmMemuat.match(/—/g) ?? []).length;
cek("D1 tiga kartu menampilkan tanda pisah", jumlahPisah === 3, "jumlah: " + jumlahPisah);
cek("D2 tidak ada 0 palsu", !/\b0\b/.test(tmMemuat), "teks: " + tmMemuat);
cek("D3 tanpa NaN", !tmMemuat.includes("NaN"));

// ===== E. Siap & nol -> benar-benar "0" + catatan =====
const mNol = renderToStaticMarkup(
  createElement(MejaKerja, {
    overview: { loans: [], pawns: [], kredit: [] },
    stats: {
      ...stats0,
      pinjamanTerlambat: 0,
      gpsMismatch: 0,
      pinjamanTanpaLokasi: 0,
      titikDicurigai: 0,
      peringatanLokasiAktif: 0,
    },
    ledger: { ...ledgerOk, entryCount: 0, pendapatanPlatform: 0 },
    onBukaModul: () => {},
  }),
);
const tmNol = teksDari(mNol);
cek("E1 nol ditampilkan sebagai 0", /\b0\b/.test(tmNol));
cek("E2 catatan saat nol", tmNol.includes("Tidak ada yang perlu ditindak"));
cek("E3 ledger tanpa pendapatan menjelaskan entri", tmNol.includes("0 entri jurnal tercatat"));
cek("E4 tanpa tanda pisah", !tmNol.includes("—"));

// ===== F. Tiap produk membaca array-nya sendiri =====
// Menangkap bug kelas "lencana gadai dihitung dari overview.loans".
const htmlCampur = tabs(
  {
    loans: [pinjaman(1, "diajukan")],
    pawns: [gadai(1, "sedang_dinilai")],
    kredit: [kredit(1, "sedang_ditinjau")],
  },
  stats0,
  ledgerOk,
);
const tCampur = teksDari(htmlCampur);
cek("F1 lencana pinjaman = 1", tCampur.includes("Pinjaman · 1"));
cek("F2 lencana gadai = 1 (bukan nol)", tCampur.includes("Gadai · 1"));
cek("F3 lencana kredit = 1 (bukan nol)", tCampur.includes("Kredit Barang · 1"));
const badgeCampur = badgeGrup(htmlCampur, "Pengajuan &amp; tindakan");
cek("F4 grup Pengajuan = 3 (1+1+1)", badgeCampur === "3", "dapat: " + badgeCampur);
cek(
  "F5 lencana info 7 tampil tapi tidak dijumlahkan",
  badgeCampur === "3" && tCampur.includes("Pinjaman disetujui (internal) · 7"),
  "grup: " + badgeCampur,
);

console.log(`\nqa-meja-kerja: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
