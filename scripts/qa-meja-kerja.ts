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
import { BellRing, ClipboardList, Landmark, MapPin, Package, ShieldCheck } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { GrupNavData, ItemNav } from "@/components/admin/admin-nav";

// `LiveLocationMap` menarik `leaflet`, yang menyentuh `window` saat modul
// dimuat. Panel itu tidak dirender di sini (hanya tab aktif), jadi cukup distub.
mock.module("leaflet", () => ({ default: {} }));

// Tab "Hari Ini" memuat `RingkasanAnalitik`, satu-satunya panel di jalur ini yang
// membaca server lewat `useQuery` (tanpa provider di render statis, hook itu
// melempar galat). Harness ini memang tidak menyentuh Convex, jadi hook-nya
// distub dengan nilai "data belum tiba" — persis keadaan di peramban sebelum
// langganan pertama mengirim data. Yang diuji tetap teks & lencana tab, bukan
// angka analitik (itu diuji `RingkasanAnalitik.render.test.tsx` dari sisi murni).
//
// Stubnya harus SELENGKAP nama yang diimpor pohon impor, bukan hanya yang
// dirender di sini: Bun menautkan nama ekspor saat modul dimuat, jadi satu nama
// yang kurang membuat seluruh skrip ini gagal dengan SyntaxError sebelum satu
// pemeriksaan pun berjalan. Nama seperti `ConvexProviderWithAuth` dan
// `useConvexAuth` dipakai modul lain di dalam pohon (mis.
// `@convex-dev/auth/react`, yang mengimpornya saat dimuat, dan `hooks/use-auth`).
const lewatkan = ({ children }: { children?: unknown }) => children;
mock.module("convex/react", () => ({
  useQuery: () => undefined,
  useQueries: () => ({ results: [] }),
  useMutation: () => async () => undefined,
  useAction: () => async () => undefined,
  useConvex: () => ({}),
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: false, isRefreshing: false }),
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: () => undefined }),
  useSubscription: () => undefined,
  useConvexConnectionState: () => ({ isWebSocketConnected: false }),
  useQuery_experimental: () => undefined,
  usePaginatedQuery_experimental: () => ({
    results: [],
    status: "Exhausted",
    loadMore: () => undefined,
  }),
  convexQueryOptions: (query: unknown) => ({ query }),
  ConvexReactClient: class {
    constructor() {}
  },
  ConvexProvider: lewatkan,
  ConvexProviderWithAuth: lewatkan,
  Authenticated: lewatkan,
  Unauthenticated: lewatkan,
  AuthLoading: lewatkan,
  AuthRefreshing: lewatkan,
}));

const { AdminTabs } = await import("@/pages/admin/admin-tabs");
const { MejaKerja } = await import("@/pages/admin/meja-kerja");
const { AdminNav, IsiCariMenu } = await import("@/components/admin/admin-nav");
const { NILAI_MODUL_ADMIN } = await import("@/lib/admin-queue");

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

/**
 * Lencana yang menempel pada satu MODUL di sidebar (tombol `id="tab-..."`).
 *
 * Sejak sidebar memakai seksi (bukan accordion berjudul), lencana dipasang pada
 * modulnya, bukan pada ringkasan grup. Jadi yang dibaca di sini pun lencana
 * modul: angka yang tidak bisa ditelusuri ke pekerjaannya tidak dipakai lagi.
 */
const badgeModul = (sumber: string, modul: string): string | undefined => {
  const mulai = sumber.indexOf(`id="tab-${modul}"`);
  if (mulai === -1) return undefined;
  const akhir = sumber.indexOf("</button>", mulai);
  if (akhir === -1) return undefined;
  return />([\d!OK]+)</.exec(sumber.slice(mulai, akhir))?.[1];
};

/**
 * Angka besar satu kartu "Perlu tindakan", dibaca dari markup kartunya.
 *
 * Dipakai untuk menguji dua hal sekaligus: kartu yang sumbernya belum siap
 * menampilkan tanda pisah (bukan 0), dan kartu yang sumbernya siap menampilkan
 * angka yang benar.
 */
const angkaKartu = (sumber: string, label: string): string | undefined => {
  const i = sumber.indexOf(label);
  if (i === -1) return undefined;
  // Sengaja "<p " (dengan spasi): "<p" juga cocok dengan `"<path"` milik ikon SVG,
  // sehingga pembacaannya akan mulai dari tengah ikon, bukan dari angka kartunya.
  const p = sumber.indexOf("<p ", i + label.length);
  if (p === -1) return undefined;
  const akhir = sumber.indexOf("</p>", p);
  if (akhir === -1) return undefined;
  return sumber.slice(sumber.indexOf(">", p) + 1, akhir);
};

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
cek("A1 region panel Ringkasan terpasang", html.includes('aria-label="Ringkasan"'));
cek(
  "A1b deret kartu berlabel untuk pembaca layar",
  html.includes('aria-label="Perlu tindakan"'),
);
cek("A2 tab Hari Ini ditandai aktif", html.includes('aria-current="page"'));
cek("A3 bilah bawah terpasang (pengganti select)", html.includes('aria-label="Menu operasi"'));
cek("A4 kartu pengajuan menunggu keputusan", t.includes("Pengajuan menunggu keputusan"));
cek("A5 CTA menuju antrean", t.includes("Tinjau antrean"));
cek("A6 kartu lewat jatuh tempo", t.includes("Lewat jatuh tempo"));
cek("A7 kartu perhatian lokasi", t.includes("Perhatian lokasi"));
// Verifikasi identitas punya antrean sendiri di panel ini; angkanya datang dari
// prop `kycMenunggu` (diisi `pages/Admin.tsx` dari antrean KYC yang sama dengan
// modulnya), jadi admin tidak perlu membuka modul untuk tahu ada yang menunggu.
cek("A9 kartu KYC menunggu verifikasi", t.includes("KYC menunggu verifikasi"));
cek("A10 CTA membuka verifikasi KYC", t.includes("Buka verifikasi KYC"));
// Panel "Ledger internal" sudah dihapus dari menu admin — panel Hari Ini tidak
// boleh lagi memuat kartu/labelnya.
cek("A8 tanpa kartu ledger", !t.includes("Ledger internal"));
cek("A11 tanpa NaN", !t.includes("NaN"));
cek("A12 tanpa undefined", !t.includes("undefined"));

// ===== B. R3: lencana informasi tidak dijumlahkan =====
// Lencana gabungan grup kini terlihat di bilah bawah pada tab yang tidak aktif,
// jadi R3 diuji tepat pada angka tab memakai menu asli. Nama tab mengikuti lima
// kategori yang diminta (Hari Ini · Operasional · Pemantauan · Konten · Sistem).
const bilah = bilahDari(html);
cek(
  "B1 tab Operasional = 2 (bukan 11)",
  lencanaTab(bilah, "Operasional") === "2",
  "dapat: " + lencanaTab(bilah, "Operasional"),
);
cek("B2 angka 11 (2+2+7) tidak muncul", !bilah.includes(">11<"));
// Lencana "perhatian lokasi" dihapus dari navigasi: empat sebab digabung jadi
// satu angka tidak terbaca sebagai antrean kerja, dan cacahannya pindah ke kartu
// "Perhatian lokasi" di panel Ringkasan yang menyebut sebabnya satu per satu.
// Jadi tab Pemantauan hanya membawa keterlambatan.
cek(
  "B3 tab Pemantauan = 2 (keterlambatan saja)",
  lencanaTab(bilah, "Pemantauan") === "2",
  "dapat: " + lencanaTab(bilah, "Pemantauan"),
);
cek(
  "B4 tab Sistem tanpa lencana (hanya OK)",
  lencanaTab(bilah, "Sistem") === undefined,
  "dapat: " + lencanaTab(bilah, "Sistem"),
);
cek("B5 tab aktif tidak berlencana", lencanaTab(bilah, "Hari Ini") === undefined);
cek("B6 ledger seimbang -> tanpa tanda seru", !bilah.includes(">!<"));

// Sidebar desktop memakai aturan yang sama (R3), tetapi lencananya menempel pada
// MODUL — bukan ringkasan grup lagi — supaya tiap angka bisa ditelusuri ke
// pekerjaan yang ditanganinya.
cek(
  "B7 sidebar: modul menunggu berlencana (pinjaman 2)",
  badgeModul(html, "pinjaman") === "2",
  "dapat: " + badgeModul(html, "pinjaman"),
);
cek(
  "B7b lencana info (alokasi 7) tidak ikut dijumlahkan ke tab",
  badgeModul(html, "alokasi") === "7" && lencanaTab(bilah, "Operasional") === "2",
  "alokasi: " + badgeModul(html, "alokasi") + ", tab: " + lencanaTab(bilah, "Operasional"),
);
cek(
  "B8 sidebar: modul lokasi tanpa lencana gabungan",
  badgeModul(html, "lokasi") === undefined,
  "dapat: " + badgeModul(html, "lokasi"),
);
cek(
  "B8b angka lokasi tetap terbaca di kartu Ringkasan (4 = 1+1+1+1)",
  angkaKartu(html, "Perhatian lokasi") === "4",
  "dapat: " + angkaKartu(html, "Perhatian lokasi"),
);
// Lima kategori sidebar yang diminta harus benar-benar ada sebagai judul seksi,
// dan setiap modul tetap berada di dalam tepat satu seksi.
cek(
  "B9 lima kategori sidebar terpasang",
  ["Operasional", "Pemantauan", "Konten", "Sistem", "Keamanan &amp; audit"].every((judul) =>
    html.includes(`>${judul}</p>`),
  ),
);
// Isi tiap seksi dirender langsung (bukan accordion), jadi modulnya bisa
// diperiksa dari markup seksi tempat ia berada.
cek(
  "B10 modul pemeliharaan & keamanan terpasang di sidebar",
  ["config", "backup", "audit", "loglogin", "killswitch"].every((modul) =>
    html.includes(`id="tab-${modul}"`),
  ),
);
cek(
  "B10b modul pemeliharaan & kill switch terdaftar",
  ["config", "backup", "audit", "loglogin", "killswitch"].every((modul) =>
    (NILAI_MODUL_ADMIN as readonly string[]).includes(modul),
  ),
);

// ===== C. Panel "Ledger internal" sudah tidak ada di menu admin =====
// Lencana OK/tanda seru untuk ledger ikut hilang; tab Sistem hanya bisa
// berlencana bila ada modul Sistem yang benar-benar menunggu tindakan.
cek("C1 tab Sistem tanpa lencana", lencanaTab(bilah, "Sistem") === undefined);
cek("C2 tanpa tanda seru palsu", !bilah.includes(">!<"));
// Panel lama bernama persis "Ledger internal" sudah dihapus dari menu admin;
// modul penggantinya bernama "Ledger Internal & Kesehatan Sistem" (gabungan
// metrik BI + keseimbangan ledger) dan itu memang yang diinginkan.
cek(
  "C3 panel Ledger internal lama tidak kembali",
  !html.includes('aria-label="Ledger internal"'),
);

// ===== D. Aturan angka: "belum siap" bukan 0 =====
const mMemuat = renderToStaticMarkup(
  createElement(MejaKerja, {
    overview,
    stats: undefined,
    onBukaModul: () => {},
  }),
);
const tmMemuat = teksDari(mMemuat);
// Tiga kartu yang sumbernya belum siap: KYC (`kycMenunggu` bawaan null),
// keterlambatan, dan lokasi (`stats` belum ada). Kartu pengajuan tetap berangka
// karena `overview` sudah tersedia — itu memang beda keadaan, bukan beda kartu.
const jumlahPisah = (tmMemuat.match(/—/g) ?? []).length;
cek("D1 tiga kartu menampilkan tanda pisah", jumlahPisah === 3, "jumlah: " + jumlahPisah);
cek(
  "D1b tanda pisah ada di kartu yang sumbernya belum siap",
  angkaKartu(mMemuat, "KYC menunggu verifikasi") === "—" &&
    angkaKartu(mMemuat, "Lewat jatuh tempo") === "—" &&
    angkaKartu(mMemuat, "Perhatian lokasi") === "—",
  [
    angkaKartu(mMemuat, "KYC menunggu verifikasi"),
    angkaKartu(mMemuat, "Lewat jatuh tempo"),
    angkaKartu(mMemuat, "Perhatian lokasi"),
  ].join(" / "),
);
cek(
  "D1c kartu yang sumbernya siap tetap berangka",
  angkaKartu(mMemuat, "Pengajuan menunggu keputusan") === "2",
  "dapat: " + angkaKartu(mMemuat, "Pengajuan menunggu keputusan"),
);
cek("D2 tidak ada 0 palsu", !/\b0\b/.test(tmMemuat), "teks: " + tmMemuat);
cek("D3 tanpa NaN", !tmMemuat.includes("NaN"));

// ===== E. Siap & nol -> benar-benar "0" + catatan =====
// Semua sumber diisi di sini — termasuk `kycMenunggu`, satu-satunya yang tidak
// punya nilai bawaan "siap" — supaya yang diuji benar-benar keadaan "data sudah
// tiba dan hasilnya nol", bukan keadaan "sebagian data belum tiba".
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
    kycMenunggu: 0,
    onBukaModul: () => {},
  }),
);
const tmNol = teksDari(mNol);
cek("E1 nol ditampilkan sebagai 0", /\b0\b/.test(tmNol));
cek("E2 catatan saat nol", tmNol.includes("Tidak ada yang perlu ditindak"));
cek("E3 tanpa tanda pisah", !tmNol.includes("—"));
cek(
  "E4 kartu KYC ikut menyatakan nol saat antreannya kosong",
  angkaKartu(mNol, "KYC menunggu verifikasi") === "0",
  "dapat: " + angkaKartu(mNol, "KYC menunggu verifikasi"),
);

// ===== F. Tiap produk membaca array-nya sendiri =====
// Panjang tiap array sengaja berbeda (1/2/3) supaya salah pasang array
// (mis. lencana gadai dihitung dari `overview.loans`) menghasilkan angka lain:
// Operasional = pinjaman 1 + gadai 2 + kredit 3 = 6, dan Pemantauan hanya
// keterlambatan (2) karena lencana lokasi memang tidak dipasang.
// Salah pasang akan memberi angka lain (mis. 5 / 7 / 8), bukan 6.
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
  "F1 tab Operasional = 6 (1+2+3)",
  lencanaTab(bilahCampur, "Operasional") === "6",
  "dapat: " + lencanaTab(bilahCampur, "Operasional"),
);
cek(
  "F2 sidebar: tiap modul membaca array-nya sendiri (1 / 2 / 3)",
  badgeModul(htmlCampur, "pinjaman") === "1" &&
    badgeModul(htmlCampur, "gadai") === "2" &&
    badgeModul(htmlCampur, "kredit") === "3",
  [
    badgeModul(htmlCampur, "pinjaman"),
    badgeModul(htmlCampur, "gadai"),
    badgeModul(htmlCampur, "kredit"),
  ].join(" / "),
);
cek(
  "F3 tab Pemantauan tetap 2 (keterlambatan saja)",
  lencanaTab(bilahCampur, "Pemantauan") === "2",
  "dapat: " + lencanaTab(bilahCampur, "Pemantauan"),
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

// Nama grup & nilai modul mengikuti `GRUP_NAV` yang berlaku (lima kategori),
// karena bilah bawah meratakan modul lewat `grupDariModul` — grup yang tidak
// dikenal tidak akan pernah muncul sebagai tab. Lencana `lokasi` sengaja tetap
// ada di data uji ini (di menu asli tidak): yang diuji di sini adalah aturan
// `ringkasGrup` menjumlahkan lencana ber bobot "menunggu".
const menuUji: GrupNavData[] = [
  {
    judul: "Operasional",
    items: [
      itemMenu("pinjaman", "Pinjaman", "Tinjau pengajuan pinjaman tunai.", "2", "menunggu", ClipboardList),
      itemMenu("gadai", "Gadai", "Nilai barang jaminan.", "1", "menunggu", Package),
    ],
  },
  {
    judul: "Pemantauan",
    items: [
      itemMenu("dpd", "Jatuh Tempo", "Pinjaman yang melewati tanggal acuan.", "2", "menunggu", BellRing),
      itemMenu("lokasi", "Pemantauan lokasi", "Titik lokasi perangkat peminjam.", "1", "menunggu", MapPin),
    ],
  },
  {
    judul: "Keamanan & audit",
    items: [
      itemMenu("audit", "Audit Trail", "Jejak seluruh tindakan admin.", "OK", "tidak", Landmark),
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
for (const label of ["Hari Ini", "Operasional", "Pemantauan", "Konten", "Sistem"]) {
  cek(`G2 tab ${label} tersedia`, bilahNav.includes(label));
}
cek(
  "G3 tepat satu tab bertanda aktif",
  (bilahNav.match(/aria-current="page"/g) ?? []).length === 1,
  "jumlah: " + (bilahNav.match(/aria-current="page"/g) ?? []).length,
);
const jumlahIkon = (bilahNav.match(/<svg/g) ?? []).length;
cek("G4 lima ikon di bilah bawah", jumlahIkon === 5, "ikon: " + jumlahIkon);
// Tiap tab harus punya ikon BERBEDA: peta ikon yang bolong akan jatuh ke
// cadangan LayoutDashboard, sehingga dua tab memakai ikon yang sama. Nama kelas
// ikon tidak dipatok satu per satu karena lucide mengganti alias antar versi
// (mis. `LineChart` kini merender `lucide-chart-line`).
// Nama dinormalkan (huruf/angka saja) karena lucide menuliskan kelas alias DAN
// kelas kanonik untuk ikon yang sama (mis. `lucide-settings2` +
// `lucide-settings-2`), sehingga satu ikon bisa terhitung dua kali.
const ikonBilah = new Set(
  [...bilahNav.matchAll(/lucide-([a-z0-9-]+)/g)].map((m) => m[1].replace(/[^a-z0-9]/g, "")),
);
cek(
  "G4b tiap tab punya ikon berbeda (tanpa ikon cadangan ganda)",
  ikonBilah.size === 5,
  "ikon: " + [...ikonBilah].join(", "),
);
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
  "G9 tab tidak aktif memakai ringkasGrup (Pemantauan = 3)",
  lencanaTab(bilahDari(nav("plafon")), "Pemantauan") === "3",
  "dapat: " + lencanaTab(bilahDari(nav("plafon")), "Pemantauan"),
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
  ["Pinjaman", "Gadai", "Jatuh Tempo", "Pemantauan lokasi", "Audit Trail", "Keamanan Login"].every(
    (x) => tCari.includes(x),
  ),
);
cek("H4 nama grup tampil di baris", tCari.includes("Keamanan & audit"));
const barisCari = (htmlCari.match(/cmdk-item/g) ?? []).length;
cek("H5 semua baris hasil dirender", barisCari === 6, "baris: " + barisCari);
// Setiap baris harus berupa opsi yang bisa dipilih pembaca layar.
cek(
  "H6 tiap baris berperan option",
  (htmlCari.match(/role="option"/g) ?? []).length === 6,
  "jumlah: " + (htmlCari.match(/role="option"/g) ?? []).length,
);
cek("H7 lencana tampil di baris", htmlCari.includes(">2<") && htmlCari.includes(">OK<"));

// ===== I. Select 18 opsi benar-benar hilang dari panel admin =====
cek("I1 tanpa elemen select", !html.includes("<select"));
cek("I2 tanpa id admin-tab-select", !html.includes("admin-tab-select"));

console.log(`\nqa-meja-kerja: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
