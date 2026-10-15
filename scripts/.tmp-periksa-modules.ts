/**
 * Alat sementara: laporkan paket di node_modules yang berkas utamanya hilang.
 * Run: bun scripts/.tmp-periksa-modules.ts
 *
 * Beberapa berkas paket (mis. `globals.json`, `index.js` pada paket kecil) tidak
 * ikut tersalin di lingkungan ini, sehingga eslint/vite gagal memuat modulnya.
 * Skrip ini menemukannya sekaligus, bukan satu per satu saat galat muncul.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

type Temuan = { nama: string; versi: string; hilang: string[]; folder: string };

const akar = "node_modules";

function berkasEkspor(pkg: Record<string, unknown>): string[] {
  const hasil: string[] = [];
  const tambah = (nilai: unknown) => {
    if (typeof nilai === "string" && (nilai.startsWith("./") || !nilai.startsWith("http"))) {
      hasil.push(nilai.replace(/^\.\//, ""));
    } else if (nilai !== null && typeof nilai === "object") {
      for (const v of Object.values(nilai as Record<string, unknown>)) tambah(v);
    }
  };
  tambah(pkg.main);
  tambah(pkg.module);
  tambah(pkg.types);
  tambah(pkg.exports);
  tambah(pkg.bin);
  return [...new Set(hasil.filter((h) => !h.includes("*")))];
}

function periksa(folder: string, nama: string): Temuan | null {
  const file = join(folder, "package.json");
  if (!existsSync(file)) return null;
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
  const kandidat = berkasEkspor(pkg);
  const hilang = kandidat.filter((k) => !existsSync(join(folder, k)));
  if (hilang.length === 0) return null;
  return {
    nama: String(pkg.name ?? nama),
    versi: String(pkg.version ?? "?"),
    hilang,
    folder,
  };
}

const temuan: Temuan[] = [];
const paketKurang: string[] = [];

function jelajah(folder: string, kedalaman: number): void {
  if (kedalaman > 3) return;
  let isi: string[];
  try {
    isi = readdirSync(folder);
  } catch {
    return;
  }
  for (const nama of isi) {
    if (nama === ".bin") continue;
    const sub = join(folder, nama);
    let info;
    try {
      info = statSync(sub);
    } catch {
      continue;
    }
    if (!info.isDirectory()) continue;
    if (nama.startsWith("@")) {
      jelajah(sub, kedalaman);
      continue;
    }
    const t = periksa(sub, nama);
    if (t !== null) {
      temuan.push(t);
      paketKurang.push(`${t.nama}@${t.versi}`);
    }
    if (nama !== "node_modules") jelajah(sub, kedalaman + 1);
  }
}

jelajah(akar, 0);
for (const t of temuan) {
  console.log(`${t.nama}@${t.versi} — hilang: ${t.hilang.join(", ")} (${t.folder})`);
}
console.log(`\n${temuan.length} paket rusak`);
console.log([...new Set(paketKurang)].join(" "));
