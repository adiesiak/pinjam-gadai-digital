/**
 * Gerbang anggaran dashboard admin.
 * Run: bun scripts/qa-admin-anggaran.ts (setelah `bun run build` untuk cek chunk)
 *
 * Tiga hal yang dijaga, semuanya hasil audit arsitektur admin:
 *
 *  1. Pemindaian penuh pada query agregat admin tidak boleh bertambah. Audit
 *     menemukan 15 pemanggilan `.collect()` atas tabel besar di `admin.ts`
 *     (loans, pawns, kreditBarang, nasabahProfil), tersebar di beberapa query
 *     agregat termasuk adminOverview, adminStats, dan adminAnalitik. Semuanya
 *     utang teknis yang penurunannya dikerjakan bertahap; angka di bawah adalah
 *     pagar agar tidak ada pemindaian baru yang menyelinap masuk tanpa dibahas,
 *     dan angka itu hanya boleh turun.
 *
 *  2. Chunk Admin tidak boleh membengkak, dan pemecahannya tidak boleh dibatalkan.
 *     Layar yang bukan jalur harian dimuat sesuai permintaan lewat
 *     `lib/admin-panel-malas`, jadi ukuran `Admin-*.js` mencerminkan apa yang
 *     benar-benar diunduh setiap admin membuka Ringkasan. Kembalinya satu panel
 *     ke impor statis akan menaikkan angka itu sekaligus menghapus potongannya;
 *     dua pemeriksaan di bawah menangkap keduanya.
 *
 *  3. Satu bacaan untuk satu layar. `adminOverview` kini menghitung kartu angka
 *     dan grafik dari tabel yang sudah ia baca, jadi halaman admin tidak boleh
 *     kembali berlangganan `adminStats`/`adminAnalitik` sendiri.
 *
 * Skrip ini sengaja tidak membaca data produksi dan tidak butuh server.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

let lulus = 0;
let gagal = 0;
function cek(syarat: boolean, label: string): void {
  if (syarat) {
    lulus += 1;
    console.log(`ok   ${label}`);
  } else {
    gagal += 1;
    console.error(`GAGAL ${label}`);
  }
}

const AKAR = path.resolve(import.meta.dir, "..");

// ===== 1. Pagar pemindaian penuh pada agregat admin =====
const TABEL_BESAR = ["loans", "pawns", "kreditBarang", "nasabahProfil"] as const;
const sumberAdmin = readFileSync(path.join(AKAR, "src/convex/admin.ts"), "utf8");
const polaPindai = new RegExp(
  `ctx\\.db\\s*\\n?\\s*\\.query\\(\\s*"(${TABEL_BESAR.join("|")})"\\s*\\)\\s*\\n?\\s*\\.collect\\(\\)`,
  "g",
);
const pindaian = [...sumberAdmin.matchAll(polaPindai)].map((m) => m[1]);
// Baseline hasil audit 2026-10-26. Turunkan angka ini setiap kali satu query
// agregat dipindahkan ke ringkasan tersimpan; jangan pernah menaikkannya.
const BATAS_PINDAI = 15;


console.log(`Pemindaian penuh terdeteksi: ${pindaian.length} (${pindaian.join(", ")})`);
cek(
  pindaian.length <= BATAS_PINDAI,
  `pemindaian penuh pada tabel besar tidak bertambah (${pindaian.length} <= ${BATAS_PINDAI})`,
);

// Waktu acuan umur tunggu harus datang dari server, bukan jam perangkat admin.
cek(
  /dihitungPada:\s*sekarang/.test(sumberAdmin) &&
    /const sekarang = Date\.now\(\)/.test(sumberAdmin),
  "adminOverview mengirim waktu acuan server (dihitungPada)",
);

// ===== 3. Satu bacaan untuk satu layar =====
// Angka `collect()` di atas menghitung PERNYATAAN, bukan eksekusi: sejak
// `adminStats`/`adminAnalitik` berbagi perhitungan dengan `adminOverview`,
// pernyataan yang sama dieksekusi sekali per layar, bukan tiga kali. Yang
// menjaga itu tetap begitu adalah tiga kontrak di bawah.
const sumberAdminPage = readFileSync(path.join(AKAR, "src/pages/Admin.tsx"), "utf8");
const sumberTabs = readFileSync(
  path.join(AKAR, "src/pages/admin/admin-tabs.tsx"),
  "utf8",
);
const sumberRingkasan = readFileSync(
  path.join(AKAR, "src/components/admin/RingkasanAnalitik.tsx"),
  "utf8",
);

cek(
  !sumberAdminPage.includes("api.admin.adminStats") &&
    sumberAdminPage.includes("overview?.stats"),
  "halaman admin membaca kartu angka dari adminOverview, bukan langganan kedua",
);
cek(
  sumberTabs.includes("analitik={overview.analitik}") &&
    sumberRingkasan.includes('"skip"'),
  "grafik memakai agregat adminOverview dan melewati langganan sendiri",
);
cek(
  sumberAdmin.includes("return bangunStatsAdmin(ctx);") &&
    sumberAdmin.includes("return bangunAnalitikAdmin(ctx);"),
  "adminStats/adminAnalitik memakai perhitungan yang sama dengan overview",
);

// ===== 2. Anggaran ukuran chunk Admin =====
const folderAset = path.join(AKAR, "dist/assets");
// 2026-10-26: sebelum pemecahan 197 KB gzip (admin + 21 panel statis). Setelah
// 21 panel dipindah ke potongan sendiri: 112 KB. Pagarnya diletakkan 13 KB di
// atas hasil itu — cukup untuk pertumbuhan wajar, tidak cukup untuk menelan
// satu panel besar tanpa ketahuan.
const BATAS_GZIP_KB = 125;
// Jumlah minimum potongan panel yang harus tetap ada. 21 panel dimuat malas;
// angka 15 memberi ruang kalau dua-tiga panel kecil digabung bundler.
const MIN_POTONGAN_PANEL = 15;
if (!existsSync(folderAset)) {
  console.log("lewat: dist/assets belum ada, jalankan `bun run build` untuk mengukur chunk");
} else {
  const semuaAset = readdirSync(folderAset);
  const berkasAdmin = semuaAset.filter((f) => /^Admin-.*\.js$/.test(f));
  cek(berkasAdmin.length === 1, `tepat satu chunk Admin (${berkasAdmin.length})`);
  for (const berkas of berkasAdmin) {
    const isi = readFileSync(path.join(folderAset, berkas));
    const gzipKb = Math.round(zlib.gzipSync(isi).length / 1024);
    console.log(`${berkas}: ${Math.round(isi.length / 1024)} KB, ${gzipKb} KB gzip`);
    cek(gzipKb <= BATAS_GZIP_KB, `chunk Admin <= ${BATAS_GZIP_KB} KB gzip (${gzipKb} KB)`);
  }
  const potonganPanel = semuaAset.filter((f) =>
    /^(LandingCmsPanel|KontenPendanaPanel|AnnouncementCms|AplikasiAndroidPanel|AuditTrailPanel|BackupPanel|KalenderKasPanel|KillSwitchPanel|LiveLocationMap|LoginSecurityPanel|PanelBiKesehatan|PlafonPanel|PromoPinjamanPanel|SystemConfigPanel|UndianPanel|VerifikasiLokasiPanel|VoucherPanel|WebsiteTemplatePanel|WhatsAppPanel|AksesPenyediaDanaPanel|PagePengembangan)-.*\.js$/.test(
      f,
    ),
  );
  cek(
    potonganPanel.length >= MIN_POTONGAN_PANEL,
    `panel non-harian tetap terpecah (${potonganPanel.length} potongan >= ${MIN_POTONGAN_PANEL})`,
  );
}

console.log(`\nqa-admin-anggaran: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
