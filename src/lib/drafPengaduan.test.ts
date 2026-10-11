/** Run: bun src/lib/drafPengaduan.test.ts — draf pengaduan (pure + storage palsu). */
import {
  bacaDrafPengaduan,
  drafBerisi,
  hapusDrafPengaduan,
  simpanDrafPengaduan,
} from "./drafPengaduan";

let passed = 0;
let failed = 0;
function eq(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`✗ ${label}: diharapkan ${JSON.stringify(expected)}, dapat ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, kondisi: boolean): void {
  eq(label, kondisi, true);
}

/** sessionStorage palsu — cukup untuk membuktikan perilaku modul. */
class StoragePalsu {
  private peta = new Map<string, string>();
  gagal = false;
  getItem(k: string): string | null {
    return this.peta.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (this.gagal) throw new Error("penyimpanan ditolak");
    this.peta.set(k, v);
  }
  removeItem(k: string): void {
    this.peta.delete(k);
  }
  get panjang(): number {
    return this.peta.size;
  }
}

const storage = new StoragePalsu();
(globalThis as unknown as { sessionStorage: StoragePalsu }).sessionStorage = storage;

const SEKARANG = 1_700_000_000_000;

// --- Dasar ----------------------------------------------------------------
eq("tanpa isi → dianggap kosong", drafBerisi("   "), false);
eq("ada isi → bukan kosong", drafBerisi(" nominal beda "), true);

eq("belum ada draf → null", bacaDrafPengaduan(SEKARANG), null);

simpanDrafPengaduan(
  { kategori: "salah_nominal", isi: "Nominal tagihan beda dari yang saya bayar.", loanId: "PGD-1" },
  SEKARANG,
);
const draf = bacaDrafPengaduan(SEKARANG + 1000);
ok("draf tersimpan dapat dibaca", draf !== null);
eq("kategori tersimpan", draf?.kategori, "salah_nominal");
eq("isian tersimpan apa adanya", draf?.isi, "Nominal tagihan beda dari yang saya bayar.");
eq("loanId tersimpan", draf?.loanId, "PGD-1");
eq("versi draf dicatat", draf?.versi, 1);
eq("jenis draf = pengaduan", draf?.jenis, "pengaduan");
eq("waktu simpan dicatat", draf?.disimpanPada, SEKARANG);

// --- Isi kosong tidak pernah ditulis --------------------------------------
storage.removeItem("pinjai.draf.pengaduan");
simpanDrafPengaduan({ kategori: "lainnya", isi: "   ", loanId: null }, SEKARANG);
eq("draf tanpa isi tidak disimpan", storage.panjang, 0);

// --- Umur draf ------------------------------------------------------------
simpanDrafPengaduan({ kategori: "lainnya", isi: "Tolong dicek.", loanId: null }, SEKARANG);
ok(
  "draf masih berlaku pada 1 jam",
  bacaDrafPengaduan(SEKARANG + 60 * 60 * 1000) !== null,
);
eq(
  "draf kedaluwarsa setelah 2 jam lebih",
  bacaDrafPengaduan(SEKARANG + 2 * 60 * 60 * 1000 + 1),
  null,
);
eq("jam perangkat mundur → draf tidak dipercaya", bacaDrafPengaduan(SEKARANG - 5000), null);

// --- Data rusak / versi asing dibuang, bukan ditebak ----------------------
storage.setItem("pinjai.draf.pengaduan", "{ bukan json");
eq("json rusak → null", bacaDrafPengaduan(SEKARANG), null);

storage.setItem(
  "pinjai.draf.pengaduan",
  JSON.stringify({
    versi: 99,
    jenis: "pengaduan",
    kategori: "lainnya",
    isi: "x",
    loanId: null,
    disimpanPada: SEKARANG,
  }),
);
eq("versi berbeda → null", bacaDrafPengaduan(SEKARANG), null);

storage.setItem(
  "pinjai.draf.pengaduan",
  JSON.stringify({
    versi: 1,
    jenis: "pengajuan_pinjaman",
    kategori: "lainnya",
    isi: "x",
    loanId: null,
    disimpanPada: SEKARANG,
  }),
);
eq("jenis draf berbeda → null", bacaDrafPengaduan(SEKARANG), null);

storage.setItem("pinjai.draf.pengaduan", JSON.stringify({ versi: 1, jenis: "pengaduan" }));
eq("bidang wajib hilang → null", bacaDrafPengaduan(SEKARANG), null);

// --- Hapus draf -----------------------------------------------------------
simpanDrafPengaduan({ kategori: "lainnya", isi: "Hapus saya.", loanId: null }, SEKARANG);
hapusDrafPengaduan();
eq("draf dihapus setelah terkirim", bacaDrafPengaduan(SEKARANG), null);

// --- Penyimpanan yang menolak TIDAK melempar ------------------------------
storage.gagal = true;
simpanDrafPengaduan({ kategori: "lainnya", isi: "Tidak bisa disimpan.", loanId: null }, SEKARANG);
eq("penyimpanan menolak → tidak melempar", bacaDrafPengaduan(SEKARANG), null);
storage.gagal = false;

console.log(`drafPengaduan tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
