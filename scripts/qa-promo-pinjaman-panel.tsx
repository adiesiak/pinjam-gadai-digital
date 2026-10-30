/**
 * Uji render daftar promo di panel admin, tanpa deployment Convex.
 * Run: bun scripts/qa-promo-pinjaman-panel.tsx
 *
 * Yang dijaga: keadaan memuat, keadaan kosong yang menyebut langkah berikutnya,
 * status kampanye dari server, dan tempat tampil yang terbaca sebagai label.
 */
import { mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

type Baris = {
  _id: string;
  badge: string;
  judul: string;
  deskripsi: string;
  mulai: number;
  selesai: number;
  penempatan: string[];
  aktif: boolean;
  status: "berjalan" | "dijadwalkan" | "berakhir" | "nonaktif";
  berjalan: boolean;
  diperbaruiPada: number;
  diperbaruiOleh: string;
};

let baris: Baris[] | undefined;
const mutasi = async () => ({ id: "x" });

// Query PERTAMA milik panel ini; query berikutnya berasal dari panel promo
// bunga yang ikut dirender. Satu nilai untuk semua query membuat query kedua
// menerima array promo lalu pecah saat membaca bidangnya.
let panggilanQuery = 0;
const convexReact = await import("convex/react");
mock.module("convex/react", () => ({
  ...convexReact,
  useQuery: () => (panggilanQuery++ === 0 ? baris : undefined),
  useMutation: () => mutasi,
}));

function renderPanel() {
  panggilanQuery = 0;
  return renderToStaticMarkup(<PromoPinjamanPanel />);
}

const { PromoPinjamanPanel } = await import("@/components/admin/PromoPinjamanPanel");

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function ada(html: string, teks: string, label: string): void {
  ok(html.includes(teks), `${label} (memuat "${teks}")`);
}
function tidakAda(html: string, teks: string, label: string): void {
  ok(!html.includes(teks), `${label} (tanpa "${teks}")`);
}

// ===== Memuat =====
baris = undefined;
const memuat = renderPanel();
ada(memuat, "Memuat promo", "keadaan memuat disebut");

// ===== Kosong =====
baris = [];
const kosong = renderPanel();
ada(kosong, "Belum ada promo.", "keadaan kosong menyebut keadaannya");
ada(kosong, "Buat promo pertama", "keadaan kosong memberi satu tindakan");
ada(
  kosong,
  "Kampanye teks hanya mengganti kalimat",
  "panel menyatakan promo tidak mengubah angka pinjaman",
);
tidakAda(kosong, "undefined", "keadaan kosong tanpa undefined");

// ===== Berisi =====
const sekarang = Date.UTC(2026, 9, 21, 3, 0, 0);
baris = [
  {
    _id: "promo-1",
    badge: "Promo Oktober",
    judul: "Tenor pilihan lebih panjang",
    deskripsi: "Ajukan pinjaman tenor 28 hari lewat formulir pengajuan.",
    mulai: sekarang - 86_400_000,
    selesai: sekarang + 86_400_000,
    penempatan: ["dashboard", "pengajuan"],
    aktif: true,
    status: "berjalan",
    berjalan: true,
    diperbaruiPada: sekarang,
    diperbaruiOleh: "admin@pindai.test",
  },
  {
    _id: "promo-2",
    badge: "",
    judul: "Kampanye beranda",
    deskripsi: "Teks kampanye untuk pengunjung beranda.",
    mulai: sekarang - 86_400_000,
    selesai: sekarang + 86_400_000,
    penempatan: ["beranda", "promo"],
    aktif: false,
    status: "nonaktif",
    berjalan: false,
    diperbaruiPada: sekarang,
    diperbaruiOleh: "admin@pindai.test",
  },
];
const isi = renderPanel();
ada(isi, "Tenor pilihan lebih panjang", "judul kampanye tampil");
ada(isi, "Berjalan", "status berjalan dari server");
ada(isi, "Nonaktif", "status nonaktif dari server");
ada(isi, "Dashboard nasabah · Form pengajuan", "tempat tampil dibaca sebagai label");
ada(isi, "Beranda publik · Halaman /promo", "urutan tempat mengikuti data");
ada(isi, "Sunting", "kampanye bisa disunting");
ada(isi, "Hapus", "kampanye bisa dihapus");
ada(isi, "admin@pindai.test", "pembaru terakhir terbaca");
tidakAda(isi, "undefined", "daftar tanpa undefined");
tidakAda(isi, "NaN", "daftar tanpa NaN");

console.log(`PromoPinjamanPanel.render: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
