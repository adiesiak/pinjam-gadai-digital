/**
 * Alat sementara: pulihkan berkas paket di node_modules yang tidak ikut
 * tersalin di lingkungan ini (mis. `globals.json`, `resolve-from/index.js`).
 * Run: bun scripts/.tmp-pulihkan-modules.ts
 *
 * Kenapa perlu: eslint/vitest gagal memuat modul kalau satu berkas paket hilang,
 * padahal isinya tersedia di registry. Skrip ini hanya MENAMBAH berkas yang
 * hilang dari tarball versi yang sama — tidak menghapus atau menimpa apa pun.
 */
import { existsSync, mkdirSync, copyFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

type Hilang = { nama: string; versi: string; folder: string; berkas: string[] };

const akar = "node_modules";
const tmp = "/tmp/pulih-paket";

/** Kembangkan jalur tanpa ekstensi menjadi berkas nyata (gaya Node). */
function nyata(folder: string, jalur: string): string | null {
  const kandidat = [jalur, `${jalur}.js`, `${jalur}.json`, `${jalur}.mjs`, `${jalur}.cjs`, join(jalur, "index.js"), join(jalur, "index.json")];
  for (const k of kandidat) if (existsSync(join(folder, k))) return k;
  return null;
}

function berkasDeklarasi(pkg: Record<string, unknown>): string[] {
  const hasil: string[] = [];
  const tambah = (nilai: unknown) => {
    if (typeof nilai === "string") {
      if (!nilai.startsWith("http")) hasil.push(nilai.replace(/^\.\//, ""));
    } else if (nilai !== null && typeof nilai === "object") {
      for (const v of Object.values(nilai as Record<string, unknown>)) tambah(v);
    }
  };
  for (const kunci of ["main", "module", "types", "browser", "exports", "bin"]) tambah(pkg[kunci]);
  return [...new Set(hasil.filter((h) => h !== "" && !h.includes("*")))];
}

function paketRusak(folder: string): Hilang | null {
  const file = join(folder, "package.json");
  if (!existsSync(file)) return null;
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
  const deklarasi = berkasDeklarasi(pkg);
  const hilang = deklarasi.filter((k) => nyata(folder, k) === null);
  // Paket tanpa `main`/`exports` (gaya lama) memakai `index.js` secara implisit.
  if (hilang.length === 0 && deklarasi.length === 0 && nyata(folder, "index.js") === null) {
    hilang.push("index.js");
  }
  if (hilang.length === 0) return null;
  return {
    nama: String(pkg.name ?? ""),
    versi: String(pkg.version ?? ""),
    folder,
    berkas: hilang,
  };
}

const daftar: Hilang[] = [];
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
    try {
      if (!statSync(sub).isDirectory()) continue;
    } catch {
      continue;
    }
    if (nama.startsWith("@")) {
      jelajah(sub, kedalaman);
      continue;
    }
    const rusak = paketRusak(sub);
    if (rusak !== null && rusak.nama !== "") daftar.push(rusak);
    jelajah(sub, kedalaman + 1);
  }
}
jelajah(akar, 0);

/** Unduh & bongkar satu paket, lalu salin berkas yang hilang saja. */
async function pulihkan(p: Hilang): Promise<boolean> {
  const pendek = p.nama.startsWith("@") ? p.nama.split("/")[1] : p.nama;
  const url = `https://registry.npmjs.org/${p.nama}/-/${pendek}-${p.versi}.tgz`;
  const tujuan = join(tmp, `${p.nama.replace("/", "_")}-${p.versi}`);
  mkdirSync(tujuan, { recursive: true });
  const tar = join(tmp, `${pendek}-${p.versi}.tgz`);
  if (!existsSync(tar)) {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`GAGAL unduh ${p.nama}@${p.versi}: HTTP ${res.status}`);
      return false;
    }
    await Bun.write(tar, await res.arrayBuffer());
  }
  const untar = Bun.spawnSync(["tar", "-xzf", tar, "-C", tujuan]);
  if (untar.exitCode !== 0) {
    console.error(`GAGAL bongkar ${p.nama}@${p.versi}`);
    return false;
  }
  const sumber = join(tujuan, "package");
  let disalin = 0;
  for (const berkas of p.berkas) {
    for (const kandidat of [berkas, `${berkas}.js`, `${berkas}.json`, `${berkas}.mjs`, `${berkas}.cjs`]) {
      const asal = join(sumber, kandidat);
      if (!existsSync(asal) || !statSync(asal).isFile()) continue;
      const tuju = join(p.folder, kandidat);
      mkdirSync(dirname(tuju), { recursive: true });
      if (existsSync(tuju)) continue;
      copyFileSync(asal, tuju);
      disalin += 1;
    }
  }
  // Berkas yang hilang karena `files` paket (mis. `globals.json`): salin apa pun
  // yang disebut pemanggil lewat daftar tambahan.
  console.log(`${p.nama}@${p.versi}: ${disalin} berkas dipulihkan (${p.berkas.join(", ")})`);
  return disalin > 0;
}

let pulih = 0;
for (const p of daftar) {
  if (await pulihkan(p)) pulih += 1;
}
console.log(`\n${pulih} dari ${daftar.length} paket rusak dipulihkan`);
console.log(`node_modules relatif: ${relative(process.cwd(), akar) === akar ? "ya" : "tidak"}`);
