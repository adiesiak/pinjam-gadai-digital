"use node";

/**
 * Enkripsi berkas backup Google Drive.
 *
 * KYC dan data pinjaman tetap data pribadi walau sudah keluar dari Convex.
 * Karena itu setiap berkas dienkripsi AES-256-GCM sebelum diunggah; Drive hanya
 * melihat nama berkas netral dan blob terenkripsi. Kunci TIDAK pernah dikirim ke
 * Drive atau ke browser.
 *
 * Format biner:
 *   "PDBK1" + 3 byte nol (8 byte) | IV 12 byte | tag 16 byte | ciphertext
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const MAGIC = Buffer.from("PDBK1\u0000\u0000\u0000", "binary");
const PANJANG_IV = 12;
const PANJANG_TAG = 16;
const PANJANG_KUNCI = 32;

/** Baca kunci base64 32 byte dari environment, dengan pesan yang aman. */
export function kunciBackupDariEnv(nilai: string | undefined): Buffer {
  const teks = (nilai ?? "").trim();
  if (teks === "") {
    throw new Error("BACKUP_DRIVE_ENCRYPTION_KEY belum diisi.");
  }
  const kunci = Buffer.from(teks, "base64");
  if (kunci.length !== PANJANG_KUNCI) {
    throw new Error(
      "BACKUP_DRIVE_ENCRYPTION_KEY harus base64 dari tepat 32 byte acak.",
    );
  }
  return kunci;
}

export function enkripsiBackupDrive(
  isi: Uint8Array,
  kunci: Buffer,
): Buffer {
  const iv = randomBytes(PANJANG_IV);
  const cipher = createCipheriv("aes-256-gcm", kunci, iv);
  const ciphertext = Buffer.concat([cipher.update(isi), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

export function dekripsiBackupDrive(
  paket: Uint8Array,
  kunci: Buffer,
): Buffer {
  const data = Buffer.from(paket);
  const minimum = MAGIC.length + PANJANG_IV + PANJANG_TAG;
  if (data.length < minimum || !data.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Berkas bukan backup PINDAI yang valid.");
  }
  const iv = data.subarray(MAGIC.length, MAGIC.length + PANJANG_IV);
  const tag = data.subarray(
    MAGIC.length + PANJANG_IV,
    MAGIC.length + PANJANG_IV + PANJANG_TAG,
  );
  const ciphertext = data.subarray(MAGIC.length + PANJANG_IV + PANJANG_TAG);
  try {
    const decipher = createDecipheriv("aes-256-gcm", kunci, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error(
      "Backup tidak bisa dibuka: kunci salah atau berkas sudah diubah.",
    );
  }
}
