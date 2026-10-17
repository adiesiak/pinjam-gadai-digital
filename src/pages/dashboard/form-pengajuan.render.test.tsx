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

import { DashboardBottomNav, DashboardTabNav } from "./dashboard-tab-nav";
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
      <DashboardTabNav activeTab={activeTab} onTabChange={() => {}} badges={badges} />
    </Tabs>,
  );
}

// Menu dashboard kini DATAR: lima menu, satu menu satu halaman. Tidak ada lagi
// pintu bertingkat maupun pengalih menu di layar sempit (digantikan bilah
// bawah), jadi label halaman yang dihapus tidak boleh tertinggal.
const MENU_DASHBOARD = [
  "Ringkasan",
  "Ajukan Pinjaman",
  "Catatan Pinjaman",
  "Profil & Rekening",
  "Status KYC",
];
const htmlMenuDashboard = renderMenuDashboard("form");
const teksMenuDashboard = htmlMenuDashboard.replace(/&amp;/g, "&");
for (const label of MENU_DASHBOARD) {
  ok(`menu "${label}" punya barisnya`, teksMenuDashboard.includes(label));
}
ok("menu tanpa halaman tidak dirender", !teksMenuDashboard.includes("Bantuan"));
ok("tab Kredit Barang sudah hilang dari navigasi", !teksMenuDashboard.includes("Kredit Barang"));
ok(
  "hanya satu menu yang ditandai aktif",
  htmlMenuDashboard.split('aria-current="page"').length - 1 === 1,
);
ok("menu aktif memakai latar emerald-50", htmlMenuDashboard.includes("bg-emerald-50"));
ok(
  "lencana cacah item tampil di menu",
  renderMenuDashboard("pinjaman", { pinjaman: { count: 2 } }).includes(">2<"),
);

// Setiap halaman dashboard wajib punya barisnya di menu.
const sumberDashboard = bacaSumber("pages/Dashboard.tsx");
const nilaiTabDashboard = [...sumberDashboard.matchAll(/<TabsContent value="([a-z]+)"/g)].map(
  (cocok) => cocok[1],
);
ok("dashboard hanya punya lima halaman", nilaiTabDashboard.length === 5);
const sumberMenu = bacaSumber("pages/dashboard/dashboard-tab-nav.tsx");
for (const nilai of nilaiTabDashboard) {
  ok(`halaman "${nilai}" punya baris menunya`, sumberMenu.includes(`value: "${nilai}"`));
}

// Bilah bawah (layar sempit): lima tombol, nama pendek di layar + nama lengkap
// untuk pembaca layar, dan penanda menu aktif.
const htmlBilahBawah = renderToStaticMarkup(
  <DashboardBottomNav
    activeTab="pinjaman"
    onTabChange={() => {}}
    badges={{ pinjaman: { count: 2 } }}
  />,
);
ok("bilah bawah merender lima tombol", htmlBilahBawah.split("<button").length - 1 === 5);
ok("bilah bawah menandai menu aktif", htmlBilahBawah.includes('aria-current="page"'));
ok(
  "bilah bawah memakai nama lengkap sebagai label",
  htmlBilahBawah.includes('aria-label="Catatan Pinjaman"'),
);
ok("bilah bawah hanya tampil di layar sempit", htmlBilahBawah.includes("lg:hidden"));
ok("bilah bawah benar-benar dipasang di dashboard", sumberDashboard.includes("<DashboardBottomNav"));

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

// --- Lokasi hanya di pop-up konfirmasi kirim ------------------------------
// Titik GPS diambil ulang saat tombol Kirim ditekan, jadi angkanya harus dibaca
// pada saat persetujuan — bukan sebagai kartu di badan formulir yang bisa basi.
const sumberForm = bacaSumber("pages/dashboard/forms-views.tsx");
ok(
  "kartu lokasi tidak lagi di badan formulir",
  !sumberForm.includes("Lokasi Anda saat mengirim formulir (wajib)"),
);
const posisiDialogSetuju = sumberForm.indexOf("open={setujuOpen}");
const posisiBlokLokasi = sumberForm.indexOf("<BlokLokasiKirim");
ok(
  "blok lokasi tampil di pop-up persetujuan",
  posisiDialogSetuju !== -1 && posisiBlokLokasi > posisiDialogSetuju,
);
ok(
  "blok lokasi hanya dirender saat titik sudah ada",
  sumberForm.includes("{lokasi !== null && <BlokLokasiKirim lokasi={lokasi} />}"),
);

console.log(`form-pengajuan render tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
