/**
 * Dekripsi satu berkas backup PINDAI dari Google Drive.
 *
 * Pakai:
 *   BACKUP_DRIVE_ENCRYPTION_KEY=... bun scripts/dekripsi-backup-drive.ts \
 *     manifest-20261104T013000Z.json.enc manifest.json
 *
 * Kunci harus kunci yang sama dengan yang dipasang di deployment Convex.
 * Skrip ini lokal: tidak menghubungi Google Drive dan tidak mengunggah apa pun.
 */
import { readFile, writeFile } from "node:fs/promises";

import {
  dekripsiBackupDrive,
  kunciBackupDariEnv,
} from "../src/convex/backupDriveCrypto";

async function main() {
  const [masukan, keluaran] = process.argv.slice(2);
  if (!masukan || !keluaran) {
    console.error(
      "Pemakaian: bun scripts/dekripsi-backup-drive.ts <berkas.enc> <keluaran>",
    );
    process.exit(2);
  }

  const kunci = kunciBackupDariEnv(process.env.BACKUP_DRIVE_ENCRYPTION_KEY);
  const paket = await readFile(masukan);
  const isi = dekripsiBackupDrive(paket, kunci);

  if (masukan.endsWith(".json.enc")) {
    try {
      const json = JSON.parse(isi.toString("utf8")) as unknown;
      await writeFile(keluaran, `${JSON.stringify(json, null, 2)}\n`, "utf8");
      console.log(`Manifest didekripsi ke ${keluaran}`);
      return;
    } catch {
      // Bukan JSON yang valid: tulis apa adanya supaya isi tidak hilang.
    }
  }

  await writeFile(keluaran, isi);
  console.log(`Berkas didekripsi ke ${keluaran}`);
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Dekripsi backup gagal.",
  );
  process.exit(1);
});
