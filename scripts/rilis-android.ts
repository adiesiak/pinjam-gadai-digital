/**
 * Rilis APK PINDAI dalam satu perintah.
 * Run: bun scripts/rilis-android.ts [kode] [nama]
 *
 * Tanpa argumen, versi berikutnya dihitung dari `android/build.sh`:
 * kode naik satu dan angka terakhir nama versi naik satu (1.3.1 -> 1.3.2).
 *
 * Yang dikerjakan, berurutan:
 *  1. samakan versi di build.sh, AndroidManifest.xml, MainActivity.java, README;
 *  2. perbarui query cache ikon di manifest, index.html, dan halaman /aplikasi;
 *  3. bangun APK (aapt2 -> d8 -> apksigner);
 *  4. periksa versi di APK, tanda tangan, resource adaptive icon, uji ikon,
 *     uji halaman, dan TypeScript.
 *
 * Skrip berhenti pada kegagalan pertama. Semua pergantian teks dihitung lebih
 * dulu, baru ditulis, supaya berkas tidak tertinggal setengah berubah.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const AKAR = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SDK = process.env.ANDROID_SDK ?? "/opt/android-sdk";
const JAVA_HOME = process.env.JAVA_HOME ?? "/usr/lib/jvm/java-17-openjdk-amd64";
const BT = resolve(SDK, "build-tools/34.0.0");

type Perubahan = { berkas: string; isi: string };

function baca(berkas: string): string {
  return readFileSync(resolve(AKAR, berkas), "utf8");
}

/** Ganti pola dan catat hasilnya; gagal bila pola tidak ditemukan. */
function ganti(
  daftar: Perubahan[],
  berkas: string,
  pola: RegExp,
  pengganti: string,
): void {
  const sebelumnya = daftar.findIndex((p) => p.berkas === berkas);
  // Beberapa pola bisa berada di berkas yang sama (mis. build.sh dan README),
  // jadi pergantian berikutnya harus membaca hasil yang belum ditulis.
  const lama = sebelumnya === -1 ? baca(berkas) : daftar[sebelumnya].isi;
  const baru = lama.replace(pola, pengganti);
  if (baru === lama) {
    throw new Error(`Pola tidak ditemukan di ${berkas}: ${pola}`);
  }
  if (sebelumnya === -1) daftar.push({ berkas, isi: baru });
  else daftar[sebelumnya].isi = baru;
}

function bacaVersiSekarang(): { kode: number; nama: string } {
  const build = baca("android/build.sh");
  const kode = /VERSI_KODE=(\d+)/.exec(build)?.[1];
  const nama = /VERSI_NAMA=([\d.]+)/.exec(build)?.[1];
  if (kode === undefined || nama === undefined) {
    throw new Error("VERSI_KODE / VERSI_NAMA tidak ditemukan di android/build.sh");
  }
  return { kode: Number(kode), nama };
}

function versiBerikutnya(nama: string): string {
  const bagian = nama.split(".").map((n) => Number(n));
  if (bagian.some((n) => !Number.isInteger(n))) {
    throw new Error(`Nama versi tidak bisa dinaikkan otomatis: ${nama}`);
  }
  if (bagian.length < 3) bagian.push(1);
  else bagian[bagian.length - 1] += 1;
  return bagian.join(".");
}

function jalankan(perintah: string, arg: string[], label: string): void {
  const hasil = spawnSync(perintah, arg, {
    cwd: AKAR,
    stdio: "inherit",
    env: { ...process.env, JAVA_HOME, ANDROID_SDK: SDK },
  });
  if (hasil.status !== 0) {
    throw new Error(`${label} gagal (exit ${hasil.status ?? "tidak dikenal"})`);
  }
}

function argumen(): { kode: number; nama: string } {
  const mentah = process.argv.slice(2);
  if (mentah.includes("-h") || mentah.includes("--help")) {
    console.log(
      [
        "Pakai: bun scripts/rilis-android.ts [kode] [nama]",
        "Tanpa argumen, kode dan nama dinaikkan otomatis dari android/build.sh.",
        "Contoh: bun scripts/rilis-android.ts 6 1.4.0",
      ].join("\n"),
    );
    process.exit(0);
  }

  const sekarang = bacaVersiSekarang();
  const kode = mentah[0] === undefined ? sekarang.kode + 1 : Number(mentah[0]);
  const nama = mentah[1] ?? versiBerikutnya(sekarang.nama);

  if (!Number.isInteger(kode) || kode < 1 || kode > 1_000_000) {
    throw new Error("Kode versi harus bilangan bulat 1 sampai 1.000.000.");
  }
  if (kode <= sekarang.kode) {
    throw new Error(
      `Kode versi harus lebih besar dari versi terbit (${sekarang.kode}).`,
    );
  }
  if (!/^\d+\.\d+(\.\d+)?$/.test(nama)) {
    throw new Error("Nama versi harus berbentuk 1.2 atau 1.2.3.");
  }
  return { kode, nama };
}

function main(): void {
  const { kode, nama } = argumen();
  const sekarang = bacaVersiSekarang();

  if (!existsSync(`${BT}/aapt2`) || !existsSync(`${JAVA_HOME}/bin/java`)) {
    throw new Error(`Toolchain tidak lengkap. Cek JAVA_HOME (${JAVA_HOME}) dan ANDROID_SDK (${SDK}).`);
  }

  const perubahan: Perubahan[] = [];

  ganti(perubahan, "android/build.sh", /VERSI_KODE=\d+/, `VERSI_KODE=${kode}`);
  ganti(perubahan, "android/build.sh", /VERSI_NAMA=[\d.]+/, `VERSI_NAMA=${nama}`);
  ganti(
    perubahan,
    "android/AndroidManifest.xml",
    /android:versionCode="\d+"/,
    `android:versionCode="${kode}"`,
  );
  ganti(
    perubahan,
    "android/AndroidManifest.xml",
    /android:versionName="[\d.]+"/,
    `android:versionName="${nama}"`,
  );
  ganti(
    perubahan,
    "android/src/id/pindai/app/MainActivity.java",
    /VERSI_KODE = \d+/,
    `VERSI_KODE = ${kode}`,
  );

  // README menyebut versi terbit dan contoh version.json; samakan keduanya.
  ganti(
    perubahan,
    "android/README.md",
    /Versi yang terbit saat ini adalah [\d.]+ \(versionCode \d+\)\./,
    `Versi yang terbit saat ini adalah ${nama} (versionCode ${kode}).`,
  );
  ganti(
    perubahan,
    "android/README.md",
    /\{ "versionCode": \d+, "versionName": "[\d.]+", "apkUrl": "\/pindai.apk" \}/,
    `{ "versionCode": ${kode}, "versionName": "${nama}", "apkUrl": "/pindai.apk" }`,
  );
  ganti(
    perubahan,
    "android/README.md",
    /"PINDAI [\d.]+ tersedia"/,
    `"PINDAI ${nama} tersedia"`,
  );

  // Ikon berubah bersama rilis: ganti kunci cache di semua tempat.
  for (const berkas of [
    "public/manifest.webmanifest",
    "index.html",
    "src/pages/UnduhAplikasi.tsx",
  ]) {
    ganti(perubahan, berkas, /\?v=[\d.]+/g, `?v=${nama}`);
  }

  for (const { berkas, isi } of perubahan) {
    writeFileSync(resolve(AKAR, berkas), isi);
  }

  console.log(
    `\n→ versi ${sekarang.nama} (${sekarang.kode}) menjadi ${nama} (${kode})`,
  );
  console.log("→ membangun APK");
  jalankan("bash", ["android/build.sh"], "Build APK");

  const apk = resolve(AKAR, "public/pindai.apk");
  if (!existsSync(apk)) throw new Error("public/pindai.apk tidak dihasilkan.");

  const badging = execFileSync(`${BT}/aapt2`, ["dump", "badging", apk], {
    encoding: "utf8",
  });
  if (!badging.includes(`versionCode='${kode}'`) || !badging.includes(`versionName='${nama}'`)) {
    throw new Error("Versi di APK tidak sama dengan versi yang diminta.");
  }

  execFileSync(`${BT}/apksigner`, ["verify", apk], { stdio: "inherit" });

  const isiApk = execFileSync("unzip", ["-l", apk], { encoding: "utf8" });
  for (const berkas of [
    "res/mipmap-anydpi-v26/ic_launcher.xml",
    "res/drawable-nodpi-v4/ic_launcher_foreground.png",
    "res/drawable-nodpi-v4/ic_launcher_background.png",
  ]) {
    if (!isiApk.includes(berkas)) {
      throw new Error(`APK tidak memuat ${berkas}.`);
    }
  }

  for (const uji of [
    "src/lib/ikonAplikasi.test.ts",
    "src/components/landing/PasangAplikasi.render.test.tsx",
    "src/pages/UnduhAplikasi.render.test.tsx",
  ]) {
    jalankan("bun", [uji], `Uji ${uji}`);
  }
  jalankan("bun", ["tsc", "-b", "--noEmit"], "Typecheck");

  const ukuran = statSync(apk).size;
  console.log(`\n✓ PINDAI ${nama} (${kode}) siap: public/pindai.apk (${ukuran} B)`);
  console.log("  Berikutnya: tekan Publish di dashboard agar APK dan version.json baru tersaji.");
}

try {
  main();
} catch (error) {
  console.error(`\nFAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
