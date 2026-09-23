#!/usr/bin/env bun
/**
 * STOP-UP! / PINDAI — Runner uji otomatis.
 *
 * Menjalankan SEMUA berkas `*.test.ts` di `src/` satu per satu (konvensi proyek:
 * uji tanpa dependensi framework, dijalankan dengan `bun`).
 *
 * Pakai:
 *   bun test            # semua uji
 *   bun run test:stopup # khusus modul STOP-UP!
 *
 * Berkas uji wajib `process.exit(1)` saat ada yang gagal — runner ini percaya
 * exit code tersebut.
 */

const pola = new Bun.Glob("src/**/*.test.ts");
const berkas: string[] = [];

for await (const f of pola.scan({ cwd: process.cwd() })) {
  berkas.push(f);
}
berkas.sort();

if (berkas.length === 0) {
  console.error("Tidak ada berkas *.test.ts ditemukan.");
  process.exit(1);
}

let lulus = 0;
let gagal = 0;
const ringkas: Array<{ nama: string; hasil: string }> = [];

for (const file of berkas) {
  const proc = Bun.spawnSync(["bun", file], { stdout: "pipe", stderr: "pipe" });
  const out = new TextDecoder().decode(proc.stdout).trim();
  const err = new TextDecoder().decode(proc.stderr).trim();
  const barisTerakhir = out.split("\n").filter(Boolean).pop() ?? "(tanpa ringkasan)";

  if (proc.exitCode === 0) {
    lulus += 1;
    ringkas.push({ nama: file, hasil: barisTerakhir });
  } else {
    gagal += 1;
    ringkas.push({ nama: file, hasil: "GAGAL" });
    console.error(`\n✘ ${file}`);
    if (out) console.error(out);
    if (err) console.error(err);
  }
}

console.log("");
for (const r of ringkas) {
  console.log(`${r.hasil === "GAGAL" ? "✘" : "✔"} ${r.nama}`);
  console.log(`   ${r.hasil}`);
}

console.log(
  `\n${lulus}/${berkas.length} berkas uji lulus${gagal > 0 ? ` — ${gagal} berkas gagal` : ""}.`,
);

process.exit(gagal === 0 ? 0 : 1);
