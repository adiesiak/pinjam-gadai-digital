import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  NAMA_FOLDER_DRIVE_BAWAAN,
  TABEL_BACKUP_DRIVE,
  kesiapanBackupDrive,
} from "../lib/backupDrive";
import {
  dekripsiBackupDrive,
  enkripsiBackupDrive,
  kunciBackupDariEnv,
} from "./backupDriveCrypto";

const KUNCI = randomBytes(32).toString("base64");

describe("kontrak backup Google Drive", () => {
  it("mencakup tabel KYC dan pinjaman tanpa duplikat", () => {
    expect(TABEL_BACKUP_DRIVE).toContain("kycProfil");
    expect(TABEL_BACKUP_DRIVE).toContain("loans");
    expect(TABEL_BACKUP_DRIVE).toContain("angsuran");
    expect(new Set(TABEL_BACKUP_DRIVE).size).toBe(TABEL_BACKUP_DRIVE.length);
  });

  it("melaporkan variabel yang belum diisi tanpa membocorkan nilai", () => {
    const kurang = kesiapanBackupDrive({});
    expect(kurang.siap).toBe(false);
    expect(kurang.folder).toBe(NAMA_FOLDER_DRIVE_BAWAAN);
    expect(kurang.alasan).toContain("GOOGLE_DRIVE_CLIENT_ID");
    expect(kurang.alasan).toContain("BACKUP_DRIVE_ENCRYPTION_KEY");
    expect(kurang.alasan).not.toContain("rahasia");
  });

  it("siap saat kredensial dan kunci sudah diisi", () => {
    const hasil = kesiapanBackupDrive({
      GOOGLE_DRIVE_CLIENT_ID: "client",
      GOOGLE_DRIVE_CLIENT_SECRET: "secret",
      GOOGLE_DRIVE_REFRESH_TOKEN: "refresh",
      BACKUP_DRIVE_ENCRYPTION_KEY: KUNCI,
    });
    expect(hasil.siap).toBe(true);
    expect(hasil.alasan).toBeNull();
  });
});

describe("enkripsi backup Google Drive", () => {
  it("bolak-balik mempertahankan isi biner", () => {
    const asli = randomBytes(2048);
    const paket = enkripsiBackupDrive(asli, kunciBackupDariEnv(KUNCI));
    const hasil = dekripsiBackupDrive(paket, kunciBackupDariEnv(KUNCI));
    expect(hasil.equals(asli)).toBe(true);
    expect(paket.equals(asli)).toBe(false);
  });

  it("menolak kunci yang salah tanpa mengembalikan isi", () => {
    const paket = enkripsiBackupDrive(
      Buffer.from("rahasia kyc"),
      kunciBackupDariEnv(KUNCI),
    );
    expect(() => dekripsiBackupDrive(paket, randomBytes(32))).toThrow(
      /kunci salah|tidak bisa dibuka/i,
    );
  });

  it("menolak berkas yang bukan format backup", () => {
    expect(() =>
      dekripsiBackupDrive(
        Buffer.from("bukan backup"),
        kunciBackupDariEnv(KUNCI),
      ),
    ).toThrow(/bukan backup/i);
  });

  it("menolak kunci yang bukan 32 byte", () => {
    expect(() =>
      kunciBackupDariEnv(Buffer.from("pendek").toString("base64")),
    ).toThrow(/32 byte/i);
  });
});
