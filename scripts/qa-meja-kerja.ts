/**
 * Harness SSR panel admin: panel "Hari Ini", lencana menu, dan navigasi
 * layar kecil (bilah bawah + strip chip + sheet "Cari menu").
 *
 * Repo ini tidak punya uji komponen React (vitest hanya mencakup `src/convex`),
 * jadi render ke string adalah satu-satunya cara memeriksa perilaku UI admin
 * tanpa browser. Hanya merender tab yang aktif — tidak menyentuh Convex.
 *
 * Run: bun scripts/qa-meja-kerja.ts
 */
import { mock } from "bun:test";
import { ClipboardList, Landmark, Package, ShieldCheck } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { GrupNavData, ItemNav } from "@/components/admin/admin-nav";

// `LiveLocationMap` menarik `leaflet`, yang menyentuh `window` saat modul
// dimuat. Panel itu tidak dirender di sini (hanya tab aktif), jadi cukup distub.
mock.module("leaflet", () => ({ default: {} }));

const { AdminTabs } = await import("@/pages/admin/admin-tabs");
const { MejaKerja } = await import("@/pages/admin/meja-kerja");
const { AdminNav, IsiCariMenu } = await import("@/components/admin/admin-nav");

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
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Isolasi hanya isi bilah bawah, agar lencana tidak tertukar dengan sidebar. */
const bilahDari = (sumber: string) =>
  (sumber.split('aria-label="Menu operasi"')[1] ?? "").split("</nav>")[0];

/** Lencana yang menempel pada satu tab bilah bawah (label + `<span>` lencana). */
const lencanaTab = (sumber: string, label: string) =>
  new RegExp(`${label}<span[^>]*>([\\d!]+)<`).exec(sumber)?.[1];

/** Lencana yang menempel pada judul grup sidebar (AccordionTrigger). */
const badgeGrup = (sumber: string, judul: string) =>
  new RegExp(`${judul}</span>[\\s\\S]*?>([\\d!OK]+)<`).exec(sumber)?.[1];

type Props = Parameters<typeof AdminTabs>[0];
type Loan = Props["overview"]["loans"][number];
type Pawn = Props["overview"]["pawns"][number];
type Kredit = Props["overview"]["kredit"][number];
type Stats = NonNullable<Props["stats"]>;

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
// 2 perlu keputusan (diajukan + sedang_direview), 0 gadai, 0 kredit.
// `alokasi` berisi 7 tetapi berbobot "info" sehingga TIDAK dijumlahkan (R3).
const overview = {
  loans: [pinjaman(1, "diajukan"), pinjaman(2, "sedang_direview")],
  pawns: [] as Pawn[],
  kredit: [] as Kredit[],
};
const tabs = (o: Props["overview"], s: Props["stats"]) =>
  renderToStaticMarkup(
    createElement(AdminTabs, {
      overview: o,
      stats: s,
      onOpenLoan: () => {},
      onOpenPawn: () => {},
      onOpenSetup: () => {},
    }),
  );

// ===== A. Tab default + panel "Hari Ini" terpasang =====
const html = tabs(overview, stats0);
const t = teksDari(html);
cek("A1 region berlabel Hari Ini", html.includes('aria-label="Hari Ini"'));
cek("A2 tab Hari Ini ditandai aktif", html.includes('aria-current="page"'));
cek("A3 bilah bawah terpasang (pengganti select)", html.includes('aria-label="Menu operasi"'));
cek("A4 kartu Perlu keputusan", t.includes("Perlu keputusan"));
cek("A5 CTA menuju antrean", t.includes("Tinjau antrean"));
cek("A6 kartu tanggal acuan", t.includes("Lewat tanggal acuan"));
cek("A7 kartu perhatian lokasi", t.includes("Perhatian lokasi"));
// Panel "Ledger internal" sudah dihapus dari menu admin — panel Hari Ini tidak
// boleh lagi memuat kartu/labelnya.
cek("A8 tanpa kartu ledger", !t.includes("Ledger internal"));
cek("A11 tanpa NaN", !t.includes("NaN"));
cek("A12 tanpa undefined", !t.includes("undefined"));

// ===== B. R3: lencana informasi tidak dijumlahkan =====
// Lencana gabungan grup kini terlihat di bilah bawah pada tab yang tidak aktif,
// jadi R3 diuji tepat pada angka tab memakai menu asli.
const bilah = bilahDari(html);
cek(
  "B1 tab Antrean = 4 (bukan 11)",
  lencanaTab(bilah, "Antrean") === "4",
  "dapat: " + lencanaTab(bilah, "Antrean"),
);
cek("B2 angka 11 (4+7) tidak muncul", !bilah.includes(">11<"));
cek(
  "B3 tab Nasabah = 4 (perhatian lokasi)",
  lencanaTab(bilah, "Nasabah") === "4",
  "dapat: " + lencanaTab(bilah, "Nasabah"),
);
cek(
  "B4 tab Sistem tanpa lencana (hanya OK)",
  lencanaTab(bilah, "Sistem") === undefined,
  "dapat: " + lencanaTab(bilah, "Sistem"),
);
cek("B5 tab aktif tidak berlencana", lencanaTab(bilah, "Hari Ini") === undefined);
cek("B6 ledger seimbang -> tanpa tanda seru", !bilah.includes(">!<"));

// Sidebar desktop tetap menguji perbaikan yang sama (grup, bukan tab).
cek(
  "B7 sidebar: grup Pengajuan = 2 (bukan 9)",
  badgeGrup(html, "Pengajuan &amp; tindakan") === "2",
  "dapat: " + badgeGrup(html, "Pengajuan &amp; tindakan"),
);
cek(
  "B8 sidebar: grup Pemantauan = 6",
  badgeGrup(html, "Pemantauan") === "6",
  "dapat: " + badgeGrup(html, "Pemantauan"),
);

// ===== C. Panel "Ledger internal" sudah tidak ada di menu admin =====
// Lencana OK/tanda seru untuk ledger ikut hilang; tab Sistem hanya bisa
// berlencana bila ada modul Sistem yang benar-benar menunggu tindakan.
cek("C1 tab Sistem tanpa lencana", lencanaTab(bilah, "Sistem") === undefined);
cek("C2 tanpa tanda seru palsu", !bilah.includes(">!<"));
cek("C3 item ledger hilang dari sidebar", !html.includes("Ledger internal"));

// ===== D. Aturan angka: "belum siap" bukan 0 =====
const mMemuat = renderToStaticMarkup(
  createElement(MejaKerja, {
    overview,
    stats: undefined,
    onBukaModul: () => {},
  }),
);
const tmMemuat = teksDari(mMemuat);
const jumlahPisah = (tmMemuat.match(/—/g) ?? []).length;
cek("D1 dua kartu menampilkan tanda pisah", jumlahPisah === 2, "jumlah: " + jumlahPisah);
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
    onBukaModul: () => {},
  }),
);
const tmNol = teksDari(mNol);
cek("E1 nol ditampilkan sebagai 0", /\b0\b/.test(tmNol));
cek("E2 catatan saat nol", tmNol.includes("Tidak ada yang perlu ditindak"));
cek("E3 tanpa tanda pisah", !tmNol.includes("—"));

// ===== F. Tiap produk membaca array-nya sendiri =====
// Panjang tiap array sengaja berbeda (1/2/3) supaya salah pasang array
// (mis. lencana gadai dihitung dari `overview.loans`) menghasilkan angka lain:
// antrean = pinjaman 1 + gadai 2 + kredit 3 + dpd 2 (stats0) = 8,
// salah pasang akan memberi 7 / 6 / 9, bukan 8.
const htmlCampur = tabs(
  {
    loans: [pinjaman(1, "diajukan")],
    pawns: [gadai(1, "sedang_dinilai"), gadai(2, "sedang_dinilai")],
    kredit: [
      kredit(1, "sedang_ditinjau"),
      kredit(2, "sedang_ditinjau"),
      kredit(3, "sedang_ditinjau"),
    ],
  },
  stats0,
);
const bilahCampur = bilahDari(htmlCampur);
cek(
  "F1 tab Antrean = 8 (1+2+3+2)",
  lencanaTab(bilahCampur, "Antrean") === "8",
  "dapat: " + lencanaTab(bilahCampur, "Antrean"),
);
cek(
  "F2 sidebar: grup Pengajuan = 6 (1+2+3)",
  badgeGrup(htmlCampur, "Pengajuan &amp; tindakan") === "6",
  "dapat: " + badgeGrup(htmlCampur, "Pengajuan &amp; tindakan"),
);

// ===== G. Bilah bawah + strip chip (AdminNav) =====
const itemMenu = (
  value: string,
  label: string,
  hint: string,
  badge: string | null,
  hitung: "menunggu" | "info" | "tidak",
  Icon: unknown,
): ItemNav => ({ value, label, hint, badge, hitung, Icon }) as unknown as ItemNav;

const menuUji: GrupNavData[] = [
  {
    judul: "Antrean",
    items: [
      itemMenu("pinjaman", "Pinjaman", "Tinjau pengajuan pinjaman tunai.", "2", "menunggu", ClipboardList),
      itemMenu("gadai", "Gadai", "Nilai barang jaminan.", "1", "menunggu", Package),
    ],
  },
  {
    judul: "Sistem & keamanan",
    items: [        itemMenu("audit", "Audit Trail", "Jejak seluruh tindakan admin.", "OK", "tidak", Landmark),
      itemMenu("loglogin", "Keamanan Login", "Riwayat login dan status TOTP.", null, "tidak", ShieldCheck),
    ],
  },
];

const nav = (aktif: string) =>
  renderToStaticMarkup(
    createElement(AdminNav, { menu: menuUji, activeTab: aktif, onPilih: () => {} }),
  );
const htmlNav = nav("pinjaman");
const bilahNav = bilahDari(htmlNav);

cek("G1 bilah bawah berlabel Menu operasi", htmlNav.includes('aria-label="Menu operasi"'));
for (const label of ["Hari Ini", "Antrean", "Nasabah", "Sistem"]) {
  cek(`G2 tab ${label} tersedia`, bilahNav.includes(label));
}
cek(
  "G3 tepat satu tab bertanda aktif",
  (bilahNav.match(/aria-current="page"/g) ?? []).length === 1,
  "jumlah: " + (bilahNav.match(/aria-current="page"/g) ?? []).length,
);
const jumlahIkon = (bilahNav.match(/<svg/g) ?? []).length;
cek("G4 empat ikon di bilah bawah", jumlahIkon === 4, "ikon: " + jumlahIkon);
// Nama ikon dipatok satu per satu: peta ikon yang bolong akan jatuh ke
// cadangan LayoutDashboard, sehingga tab lain ikut memakai ikon hari-ini.
for (const nama of ["layout-dashboard", "clipboard-list", "users", "settings2"]) {
  cek(`G4b ikon ${nama} terpasang`, bilahNav.includes(`lucide-${nama}`));
}
cek(
  "G4c tanpa ikon cadangan (layout-dashboard sekali)",
  (bilahNav.match(/layout-dashboard/g) ?? []).length === 1,
  "jumlah: " + (bilahNav.match(/layout-dashboard/g) ?? []).length,
);
cek(
  "G5 strip chip menampilkan modul grup aktif",
  htmlNav.includes("Pinjaman") && htmlNav.includes("Gadai"),
);
cek("G6 chip modul aktif ditandai aria-pressed", htmlNav.includes('aria-pressed="true"'));
cek("G7 chip membawa lencana", htmlNav.includes(">2<") && htmlNav.includes(">1<"));
cek("G8 ada pintu Cari…", htmlNav.includes("Cari…"));
cek(
  "G9 tab tidak aktif memakai ringkasGrup (Antrean = 3)",
  lencanaTab(bilahDari(nav("plafon")), "Antrean") === "3",
  "dapat: " + lencanaTab(bilahDari(nav("plafon")), "Antrean"),
);
// Saat grup Sistem aktif, chip modul memakai lencana yang sama dengan sidebar.
const htmlNavSistem = nav("audit");
cek(
  "G10 chip modul Sistem menampilkan OK",
  htmlNavSistem.includes("Audit Trail") && htmlNavSistem.includes(">OK<"),
);

// Strip dan bilah bawah harus `lg:hidden`, supaya navigasi layar kecil tidak
// dobel dengan sidebar desktop.
const jumlahLgHidden = (htmlNav.match(/lg:hidden/g) ?? []).length;
cek(
  "G11 strip + bilah bawah hanya untuk layar kecil",
  jumlahLgHidden === 2,
  "jumlah lg:hidden: " + jumlahLgHidden,
);
// Sheet baru dipasang saat dibuka (portal Radix), bukan selalu di DOM.
cek("G12 sheet tidak dirender saat tertutup", !htmlNav.includes("Cari menu"));

// ===== H. Sheet "Cari menu" (IsiCariMenu) =====
const htmlCari = renderToStaticMarkup(
  createElement(IsiCariMenu, { menu: menuUji, activeTab: "pinjaman", onPilih: () => {} }),
);
const tCari = teksDari(htmlCari);
cek("H1 input pencarian berlabel", htmlCari.includes('aria-label="Cari menu"'));
cek("H2 input ter-autofokus", /autofocus/i.test(htmlCari));
cek(
  "H3 semua modul tampil saat kueri kosong",
  ["Pinjaman", "Gadai", "Audit Trail", "Keamanan Login"].every((x) => tCari.includes(x)),
);
cek("H4 nama grup tampil di baris", tCari.includes("Sistem & keamanan"));
const barisCari = (htmlCari.match(/cmdk-item/g) ?? []).length;
cek("H5 semua baris hasil dirender", barisCari === 4, "baris: " + barisCari);
// Setiap baris harus berupa opsi yang bisa dipilih pembaca layar.
cek(
  "H6 tiap baris berperan option",
  (htmlCari.match(/role="option"/g) ?? []).length === 4,
  "jumlah: " + (htmlCari.match(/role="option"/g) ?? []).length,
);
cek("H7 lencana tampil di baris", htmlCari.includes(">2<") && htmlCari.includes(">OK<"));

// ===== I. Select 18 opsi benar-benar hilang dari panel admin =====
cek("I1 tanpa elemen select", !html.includes("<select"));
cek("I2 tanpa id admin-tab-select", !html.includes("admin-tab-select"));

console.log(`\nqa-meja-kerja: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
