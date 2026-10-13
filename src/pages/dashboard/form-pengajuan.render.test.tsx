/**
 * Uji render halaman pengajuan Peminjam (tanpa DOM), fokus pada WAJAH dropdown:
 *
 * 1. Pemilih jenis pengajuan harus sudah memperlihatkan jenis yang aktif sejak
 *    paint pertama. Bug yang dijaga di sini nyata: Radix hanya mengisi trigger
 *    dari `<SelectItem>` yang sudah pernah dirender, jadi `<SelectValue />` tanpa
 *    children tampak kosong sampai menunya dibuka sekali.
 * 2. Menu dashboard (dropdown layar sempit) juga menyebut menu aktif — termasuk
 *    jumlah itemnya.
 * 3. CTA "Buat pengajuan baru" di tiap tab menyebut jenis yang akan dibuka
 *    (tab pinjaman → "Buat pengajuan pinjaman").
 * 4. Tab "Kredit Barang" yang dihapus tidak lagi muncul di daftar navigasi,
 *    sementara jenis pengajuan kreditnya tetap ada di dropdown form.
 * 5. Menu layanan tersusun LIMA PINTU dan tidak ada tujuan yang hilang: setiap
 *    `<TabsContent value="…">` di `Dashboard.tsx` wajib punya barisnya di menu,
 *    sehingga tab baru tidak bisa ditambahkan tanpa pintunya.
 *
 * Formulir pinjaman/gadai/kredit sengaja tidak dirender: ketiganya membaca Convex
 * (`useQuery`/`useMutation`), jadi di luar aplikasi mereka tidak punya klien.
 * Perubahan label pada dropdown tenor pinjaman diverifikasi lewat `tsc`/`eslint`
 * dan pembacaan kode, bukan di sini.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import { Tabs } from "@/components/ui/tabs";
import { JENIS_PENGAJUAN } from "@/lib/jenisPengajuan";

import { DashboardTabNav } from "./dashboard-tab-nav";
import { PemilihJenisPengajuan, TombolBuatPengajuan } from "./form-pengajuan-views";

let passed = 0;
let failed = 0;

function ok(label: string, syarat: boolean) {
  if (syarat) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`✗ ${label}`);
  }
}

/** Isi berkas sumber relatif terhadap `src/` (mis. "pages/Dashboard.tsx"). */
function bacaSumber(relatif: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relatif}`, import.meta.url)), "utf8");
}

/** Isi `<button aria-label="…">…</button>` — "wajah" sebuah dropdown. */
function wajahDropdown(html: string, ariaLabel: string): string {
  const mulai = html.indexOf(`aria-label="${ariaLabel}"`);
  if (mulai === -1) return "";
  const akhir = html.indexOf("</button>", mulai);
  return akhir === -1 ? "" : html.slice(mulai, akhir);
}

// --- Pemilih jenis pengajuan -------------------------------------------------

const JENIS: Array<[nilai: string, label: string]> = [
  ["pinjaman", "Pinjaman tunai"],
  ["gadai", "Gadai barang"],
  ["kredit", "Kredit barang"],
];

for (const [nilai, label] of JENIS) {
  const wajah = wajahDropdown(
    renderToStaticMarkup(<PemilihJenisPengajuan nilai={nilai} onUbah={() => {}} />),
    "Jenis pengajuan",
  );
  ok(`dropdown jenis (${nilai}) punya wajah`, wajah.length > 0);
  ok(`dropdown jenis (${nilai}) menyebut "${label}"`, wajah.includes(label));
}

// Wajah dropdown harus mengikuti jenis yang aktif, bukan selalu jenis pertama.
const wajahGadai = wajahDropdown(
  renderToStaticMarkup(<PemilihJenisPengajuan nilai="gadai" onUbah={() => {}} />),
  "Jenis pengajuan",
);
ok("dropdown jenis gadai tidak menyebut pinjaman", !wajahGadai.includes("Pinjaman tunai"));
ok("dropdown jenis gadai tidak menyebut kredit", !wajahGadai.includes("Kredit barang"));

// Nilai tak dikenal jatuh ke jenis pertama — tidak pernah keadaan kosong.
const wajahTakDikenal = wajahDropdown(
  renderToStaticMarkup(<PemilihJenisPengajuan nilai="entah" onUbah={() => {}} />),
  "Jenis pengajuan",
);
ok("nilai tak dikenal jatuh ke jenis pertama", wajahTakDikenal.includes("Pinjaman tunai"));
ok(
  "placeholder tidak tampil saat ada jenis aktif",
  !wajahTakDikenal.includes("Pilih jenis pengajuan"),
);

// Keterangan jenis aktif ikut tampil sebagai ringkasan di bawah dropdown.
ok(
  "ringkasan jenis aktif tampil",
  renderToStaticMarkup(<PemilihJenisPengajuan nilai="kredit" onUbah={() => {}} />).includes(
    "Pengajuan kredit barang",
  ),
);

// --- Menu dashboard (layar sempit) ------------------------------------------

function renderMenuDashboard(
  activeTab: string,
  badges?: Parameters<typeof DashboardTabNav>[0]["badges"],
) {
  return renderToStaticMarkup(
    <Tabs value={activeTab}>
      <DashboardTabNav
        activeTab={activeTab}
        onTabChange={() => {}}
        onBuatPengajuan={() => {}}
        badges={badges}
      />
    </Tabs>,
  );
}

/** Wajah dropdown menu dashboard pada layar sempit. */
function wajahMenuDashboard(
  activeTab: string,
  badges?: Parameters<typeof DashboardTabNav>[0]["badges"],
) {
  return wajahDropdown(renderMenuDashboard(activeTab, badges), "Menu dashboard Peminjam");
}

// Tab "Kredit Barang" sudah dihapus dari navigasi (catatan kreditnya kini
// menjadi bagian dari tab Form Pengajuan). Labelnya tidak boleh tertinggal di
// daftar tab, sedangkan jenis pengajuan kreditnya tetap ada.
const htmlMenuDashboard = renderMenuDashboard("form");
ok("tab Kredit Barang sudah hilang dari navigasi", !htmlMenuDashboard.includes("Kredit Barang"));
for (const label of [
  "Catatan Pinjaman",
  "Jadwal Angsuran",
  "Catatan Gadai",
  "Dokumen Perjanjian",
  "Form Pengajuan",
  "Riwayat Ledger",
]) {
  ok(`navigasi masih memuat tab "${label}"`, htmlMenuDashboard.includes(label));
}

const wajahMenuForm = wajahMenuDashboard("form");
ok("dropdown menu dashboard punya wajah", wajahMenuForm.length > 0);
ok("dropdown menu dashboard menyebut menu aktif", wajahMenuForm.includes("Form Pengajuan"));
ok("dropdown menu dashboard bukan menu lain", !wajahMenuForm.includes("Kredit Barang"));

const wajahMenuPinjaman = wajahMenuDashboard("pinjaman", {
  pinjaman: { count: 2, tone: "warning" },
});
ok(
  "dropdown menu dashboard menyebut jumlah item menu aktif",
  wajahMenuPinjaman.includes("Catatan Pinjaman · 2"),
);

// --- Kelas tab aktif yang dulu MATI karena aturan global ---------------------
// Aturan `[data-slot="tabs-trigger"][data-state="active"]` di `src/index.css`
// spesifisitasnya (0,3,0), lebih tinggi daripada utilitas
// `data-[state=active]:*` pemanggil (0,2,0). Dulu trigger di sini menulis
// `data-[state=active]:bg-transparent` untuk memberi ruang bagi pill yang
// meluncur — dan kelas itu tidak pernah menang: latar `--primary` tetap dicat,
// sehingga muncul blok hijau seketika di tab baru PLUS pill yang meluncur ke
// sana. Perbaikannya: trigger melepas diri dari aturan global dengan penanda
// `data-penanda-gerak`, dan `bg-transparent` yang sudah tidak berguna dibuang.
const jumlahTab = htmlMenuDashboard.split('role="tab"').length - 1;
ok("navigasi dashboard merender semua tabnya", jumlahTab === 9);
ok(
  "setiap tab melepas diri dari aturan tab-aktif global (data-penanda-gerak)",
  htmlMenuDashboard.split('data-penanda-gerak=""').length - 1 === jumlahTab,
);
ok(
  "tab aktif tetap mewarnai hurufnya sendiri di atas penanda",
  htmlMenuDashboard.split("data-[state=active]:text-primary-foreground").length - 1 === jumlahTab,
);
ok(
  "kelas latar transparan yang mati tidak dipakai lagi",
  !htmlMenuDashboard.includes("data-[state=active]:bg-transparent"),
);

// --- Lima pintu bergrup: tiap tujuan lama tetap punya barisnya ----------------
//
// Kriteria yang dijaga BUKAN "jumlah baris menu tetap sama", melainkan tiap
// halaman dashboard masih bisa dijangkau. Menyusun ulang menu jadi lima pintu
// mudah menghilangkan satu tujuan tanpa ada yang menyadarinya, jadi tiap tab
// dari `Dashboard.tsx` dicocokkan ke baris menu di sini.
const PINTU = [
  "Catatan Pinjaman",
  "Form Pengajuan",
  "Catatan Gadai",
  "Dokumen Perjanjian",
  "Data Diri & KYC",
];
// `renderToStaticMarkup` menulis "&" sebagai "&amp;", jadi teksnya dibaca dari
// salinan yang sudah dikembalikan ke bentuk aslinya — kalau tidak, label pintu
// yang memuat "&" selalu tampak hilang.
const teksMenuDashboard = htmlMenuDashboard.replace(/&amp;/g, "&");
for (const label of PINTU) {
  ok(`pintu "${label}" tampil di menu layanan`, teksMenuDashboard.includes(label));
}

// Bagian yang menggantung di bawah pintu: tetap ada, dengan huruf lebih kecil
// dan menjorok (`pl-9`) supaya terbaca sebagai bagian dari pintunya.
const BAGIAN = ["Jadwal Angsuran", "Riwayat Ledger", "Verifikasi KYC", "Bantuan"];
for (const label of BAGIAN) {
  ok(`bagian "${label}" tetap punya barisnya`, teksMenuDashboard.includes(label));
}
ok(
  "bagian pintu dibuat menjorok, bukan sejajar pintunya",
  (htmlMenuDashboard.match(/class="[^"]*pl-9[^"]*"/g) ?? []).length === BAGIAN.length,
);

// Setiap halaman dashboard wajib punya barisnya di menu.
const sumberDashboard = bacaSumber("pages/Dashboard.tsx");
const nilaiTabDashboard = [...sumberDashboard.matchAll(/<TabsContent value="([a-z]+)"/g)].map(
  (cocok) => cocok[1],
);
ok("tab dashboard terbaca dari sumbernya", nilaiTabDashboard.length === 9);
const sumberMenu = bacaSumber("pages/dashboard/dashboard-tab-nav.tsx");
for (const nilai of nilaiTabDashboard) {
  ok(`tujuan tab "${nilai}" masih ada di menu layanan`, sumberMenu.includes(`value: "${nilai}"`));
}

// Kartu menu layar sempit menyebut PINTU dari bagian yang sedang dibuka, dan
// saat pintunya sendiri yang terbuka ia memakai label kartu yang umum (tidak
// mengulang nama pintu tepat di atas nama barisnya).
ok(
  "kartu menu sempit menyebut pintu saat bagiannya yang terbuka",
  renderMenuDashboard("jadwal").includes("Catatan Pinjaman"),
);
ok(
  "kartu menu sempit memakai label umum saat pintunya sendiri yang terbuka",
  renderMenuDashboard("pinjaman").includes("Menu layanan"),
);

// --- CTA "Buat pengajuan baru" di tab lain ----------------------------------

for (const jenis of JENIS_PENGAJUAN) {
  const html = renderToStaticMarkup(
    <TombolBuatPengajuan jenis={jenis.id} onClick={() => {}} />,
  );
  ok(`CTA ${jenis.id} menyebut "${jenis.cta}"`, html.includes(jenis.cta));
  ok(`CTA ${jenis.id} memuat ikon kirim`, html.includes("lucide-send"));
}

// CTA tab Kredit Barang harus menamai jenis kredit barang, bukan jenis lain.
const htmlCtaKredit = renderToStaticMarkup(
  <TombolBuatPengajuan jenis="kredit" onClick={() => {}} />,
);
ok("CTA kredit barang tidak menyebut pinjaman", !htmlCtaKredit.includes("Buat pengajuan pinjaman"));
ok("CTA kredit barang tidak menyebut gadai", !htmlCtaKredit.includes("Buat pengajuan gadai"));

console.log(`form-pengajuan render tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
