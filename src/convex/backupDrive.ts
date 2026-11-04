"use node";

/**
 * Backup harian KYC & pinjaman ke Google Drive.
 *
 * Alur:
 *   1. Baca halaman tabel yang termasuk kontrak `TABEL_BACKUP_DRIVE`.
 *   2. Kumpulkan tautan dokumen KYC/foto jaminan dari storage Convex.
 *   3. Unduh dokumen yang belum ada di folder Drive, enkripsi, lalu unggah.
 *   4. Unggah manifest JSON terenkripsi + ringkasan tanpa PII.
 *   5. Catat hasil ke audit trail (aksi `backup`, atau `backup_drive_gagal`).
 *
 * Dokumen yang sudah pernah diunggah dilewati berdasarkan `pindaiStorageId` di
 * appProperties Drive. Jadi backup harian tidak menyalin ulang semua foto.
 *
 * Kredensial hanya dibaca dari environment Node; tidak pernah dikirim ke
 * browser atau ditulis ke database.
 */
import { Buffer } from "node:buffer";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";
import {
  enkripsiBackupDrive,
  kunciBackupDariEnv,
} from "./backupDriveCrypto";
import {
  kesiapanBackupDrive,
  TABEL_BACKUP_DRIVE,
  type TabelBackupDrive,
} from "../lib/backupDrive";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const BATAS_UNDUH_BYTE = 20_000_000;
const UKURAN_POTONGAN = 8 * 1024 * 1024;

type HalamanTabel = { baris: unknown[]; kursor: string | null };

type DokumenSumber = {
  storageId: string;
  jenis: string;
  pemilik: string;
  url: string | null;
  contentType: string | null;
  ukuran: number | null;
};

type HalamanDokumen = { dokumen: DokumenSumber[]; kursor: string | null };

type BerkasDrive = { id: string; name?: string };

type BerkasDriveAda = { id: string; name: string; appProperties?: Record<string, string> };

type EnvGoogle = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  folderName: string;
};

function envGoogle(): EnvGoogle {
  return {
    clientId: (process.env.GOOGLE_DRIVE_CLIENT_ID ?? "").trim(),
    clientSecret: (process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "").trim(),
    refreshToken: (process.env.GOOGLE_DRIVE_REFRESH_TOKEN ?? "").trim(),
    folderName:
      (process.env.GOOGLE_DRIVE_FOLDER_NAME ?? "").trim() || "PINDAI Backup",
  };
}

function pesanAman(error: unknown): string {
  const mentah = error instanceof Error ? error.message : String(error);
  return mentah
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[token]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function bacaPesanApi(teks: string): string {
  try {
    const json = JSON.parse(teks) as {
      error?: { message?: unknown } | string;
      error_description?: unknown;
    };
    if (typeof json.error === "object" && json.error !== null) {
      if (typeof json.error.message === "string") return json.error.message;
    }
    if (typeof json.error === "string") return json.error;
    if (typeof json.error_description === "string") return json.error_description;
  } catch {
    // Bukan JSON — pakai teks mentah yang sudah dipotong di bawah.
  }
  return teks;
}

async function mintaToken(env: EnvGoogle): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      refresh_token: env.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const teks = await res.text();
  if (!res.ok) {
    throw new Error(
      `Google menolak refresh token (${res.status}): ${bacaPesanApi(teks).slice(0, 200)}`,
    );
  }
  let json: { access_token?: unknown };
  try {
    json = JSON.parse(teks) as { access_token?: unknown };
  } catch {
    throw new Error("Balasan token Google tidak bisa dibaca.");
  }
  if (typeof json.access_token !== "string" || json.access_token === "") {
    throw new Error("Google tidak mengembalikan access token.");
  }
  return json.access_token;
}

async function driveJson<T>(
  token: string,
  url: URL,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const teks = await res.text();
  if (!res.ok) {
    throw new Error(
      `Google Drive menolak permintaan (${res.status}): ${bacaPesanApi(teks).slice(0, 200)}`,
    );
  }
  try {
    return JSON.parse(teks) as T;
  } catch {
    throw new Error("Balasan Google Drive tidak bisa dibaca.");
  }
}

function escapeQueryDrive(nilai: string): string {
  return nilai.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function cariFolder(
  token: string,
  nama: string,
  indukId: string | null,
): Promise<BerkasDrive | null> {
  const url = new URL(`${DRIVE_API}/files`);
  const induk = indukId ?? "root";
  url.searchParams.set(
    "q",
    [
      `name = '${escapeQueryDrive(nama)}'`,
      `mimeType = '${FOLDER_MIME}'`,
      `'${induk}' in parents`,
      "trashed = false",
    ].join(" and "),
  );
  url.searchParams.set("fields", "files(id,name)");
  url.searchParams.set("pageSize", "10");
  url.searchParams.set("spaces", "drive");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  const hasil = await driveJson<{ files?: BerkasDrive[] }>(token, url);
  return hasil.files?.[0] ?? null;
}

async function buatFolder(
  token: string,
  nama: string,
  indukId: string | null,
): Promise<BerkasDrive> {
  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("supportsAllDrives", "true");
  const body: Record<string, unknown> = { name: nama, mimeType: FOLDER_MIME };
  if (indukId !== null) body.parents = [indukId];
  return await driveJson<BerkasDrive>(token, url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body),
  });
}

async function pastikanFolder(
  token: string,
  nama: string,
  indukId: string | null,
): Promise<BerkasDrive> {
  const ada = await cariFolder(token, nama, indukId);
  if (ada !== null) return ada;
  return await buatFolder(token, nama, indukId);
}

async function daftarDokumenDrive(
  token: string,
  folderId: string,
): Promise<Map<string, BerkasDriveAda>> {
  const peta = new Map<string, BerkasDriveAda>();
  let halamanBerikut: string | undefined;
  do {
    const url = new URL(`${DRIVE_API}/files`);
    url.searchParams.set("q", `'${folderId}' in parents and trashed = false`);
    url.searchParams.set("fields", "nextPageToken,files(id,name,appProperties)");
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("spaces", "drive");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    if (halamanBerikut) url.searchParams.set("pageToken", halamanBerikut);
    const hasil = await driveJson<{
      files?: BerkasDriveAda[];
      nextPageToken?: string;
    }>(token, url);
    for (const berkas of hasil.files ?? []) {
      const storageId = berkas.appProperties?.pindaiStorageId;
      if (storageId && !peta.has(storageId)) peta.set(storageId, berkas);
    }
    halamanBerikut = hasil.nextPageToken;
  } while (halamanBerikut);
  return peta;
}

async function unggahBerkas(
  token: string,
  opsi: {
    nama: string;
    mimeType: string;
    data: Buffer;
    indukId: string;
    appProperties?: Record<string, string>;
  },
): Promise<BerkasDrive> {
  if (opsi.data.length === 0) {
    throw new Error(`Berkas ${opsi.nama} kosong; tidak diunggah.`);
  }
  const sesi = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id,name,size&supportsAllDrives=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": opsi.mimeType,
        "X-Upload-Content-Length": String(opsi.data.length),
      },
      body: JSON.stringify({
        name: opsi.nama,
        mimeType: opsi.mimeType,
        parents: [opsi.indukId],
        ...(opsi.appProperties ? { appProperties: opsi.appProperties } : {}),
      }),
    },
  );
  if (!sesi.ok) {
    const teks = await sesi.text();
    throw new Error(
      `Google Drive menolak unggahan (${sesi.status}): ${bacaPesanApi(teks).slice(0, 200)}`,
    );
  }
  const lokasi = sesi.headers.get("location");
  if (!lokasi) throw new Error("Google Drive tidak memberi alamat unggahan.");

  let hasil: BerkasDrive | null = null;
  for (let mulai = 0; mulai < opsi.data.length; mulai += UKURAN_POTONGAN) {
    const akhir = Math.min(mulai + UKURAN_POTONGAN, opsi.data.length) - 1;
    const res = await fetch(lokasi, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": opsi.mimeType,
        "Content-Length": String(akhir - mulai + 1),
        "Content-Range": `bytes ${mulai}-${akhir}/${opsi.data.length}`,
      },
      body: new Uint8Array(opsi.data.subarray(mulai, akhir + 1)),
    });
    // 308 = potongan diterima, unggahan belum selesai.
    if (res.status === 308) continue;
    const teks = await res.text();
    if (!res.ok) {
      throw new Error(
        `Google Drive gagal menyimpan ${opsi.nama} (${res.status}): ${bacaPesanApi(teks).slice(0, 200)}`,
      );
    }
    try {
      hasil = JSON.parse(teks) as BerkasDrive;
    } catch {
      throw new Error(`Balasan unggahan ${opsi.nama} tidak bisa dibaca.`);
    }
  }
  if (!hasil?.id) {
    throw new Error(`Google Drive tidak mengembalikan id untuk ${opsi.nama}.`);
  }
  return hasil;
}

function ekstensiDariMime(mime: string | null): string {
  const nilai = (mime ?? "").toLowerCase();
  if (nilai.includes("jpeg") || nilai.includes("jpg")) return ".jpg";
  if (nilai.includes("png")) return ".png";
  if (nilai.includes("webp")) return ".webp";
  if (nilai.includes("pdf")) return ".pdf";
  if (nilai.includes("heic")) return ".heic";
  return ".bin";
}

function namaBerkasDokumen(dokumen: DokumenSumber): string {
  return `pindai-${dokumen.jenis}-${dokumen.storageId}${ekstensiDariMime(dokumen.contentType)}.enc`;
}

async function ambilTabel(ctx: ActionCtx): Promise<{
  tabel: Record<string, unknown[]>;
  jumlah: Record<string, number>;
}> {
  const tabel: Record<string, unknown[]> = {};
  const jumlah: Record<string, number> = {};
  for (const namaTabel of TABEL_BACKUP_DRIVE) {
    const batas = batasHalaman(namaTabel);
    let kursor: string | null = null;
    const baris: unknown[] = [];
    do {
      const halaman = (await ctx.runQuery(
        internal.backupDriveData.halamanTabel,
        {
          tabel: namaTabel,
          ...(kursor ? { kursor } : {}),
          batas,
        },
      )) as HalamanTabel;
      baris.push(...halaman.baris);
      kursor = halaman.kursor;
    } while (kursor !== null);
    tabel[namaTabel] = baris;
    jumlah[namaTabel] = baris.length;
  }
  return { tabel, jumlah };
}

function batasHalaman(tabel: TabelBackupDrive): number {
  // Tanda tangan peminjam adalah data URL di baris pinjaman/KYC. Halaman kecil
  // menjaga hasil satu query tetap jauh di bawah batas Convex.
  if (tabel === "loans" || tabel === "kycProfil") return 20;
  if (tabel === "nasabahProfil" || tabel === "pawns") return 50;
  return 200;
}

async function ambilDokumen(ctx: ActionCtx): Promise<DokumenSumber[]> {
  const peta = new Map<string, DokumenSumber>();
  for (const sumber of [
    "kycProfil",
    "nasabahProfil",
    "loans",
    "pawns",
    "manualPaymentReceipts",
  ] as const) {
    let kursor: string | null = null;
    do {
      const halaman = (await ctx.runQuery(
        internal.backupDriveData.halamanDokumen,
        {
          sumber,
          ...(kursor ? { kursor } : {}),
          batas: 50,
        },
      )) as HalamanDokumen;
      for (const dokumen of halaman.dokumen) {
        if (!peta.has(dokumen.storageId)) peta.set(dokumen.storageId, dokumen);
      }
      kursor = halaman.kursor;
    } while (kursor !== null);
  }
  return [...peta.values()];
}

async function unduhDokumen(dokumen: DokumenSumber): Promise<Buffer> {
  if (dokumen.url === null) {
    throw new Error("Berkas tidak ditemukan di storage.");
  }
  const res = await fetch(dokumen.url);
  if (!res.ok) {
    throw new Error(`Gagal mengunduh ${dokumen.jenis} (${res.status}).`);
  }
  const isi = Buffer.from(await res.arrayBuffer());
  if (isi.length > BATAS_UNDUH_BYTE) {
    throw new Error(`Berkas ${dokumen.jenis} melebihi batas 20 MB.`);
  }
  return isi;
}

function stempelWaktu(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export const jalankan = internalAction({
  args: { pemicu: v.optional(v.string()) },
  handler: async (ctx, { pemicu }) => {
    const kesiapan = kesiapanBackupDrive(process.env);
    if (!kesiapan.siap) {
      // Cron yang belum dikonfigurasi tidak menulis audit setiap hari. Panel
      // admin menunjukkan variabel mana yang kurang; trigger manual menolak
      // sebelum action ini dijadwalkan.
      return { ok: false as const, alasan: kesiapan.alasan };
    }

    try {
      const env = envGoogle();
      const kunci = kunciBackupDariEnv(process.env.BACKUP_DRIVE_ENCRYPTION_KEY);
      const token = await mintaToken(env);

      const { tabel, jumlah } = await ambilTabel(ctx);
      const dokumen = await ambilDokumen(ctx);

      const folder = await pastikanFolder(token, env.folderName, null);
      const namaFolder = folder.name ?? env.folderName;
      const folderDokumen = await pastikanFolder(token, "Dokumen", folder.id);
      const sudahAda = await daftarDokumenDrive(token, folderDokumen.id);

      const dokumenTersimpan: Array<Record<string, unknown>> = [];
      const dokumenGagal: Array<Record<string, unknown>> = [];

      for (let mulai = 0; mulai < dokumen.length; mulai += 3) {
        const potongan = dokumen.slice(mulai, mulai + 3);
        const hasil = await Promise.all(
          potongan.map(async (item) => {
            try {
              const ada = sudahAda.get(item.storageId);
              if (ada) {
                return {
                  sukses: true as const,
                  catatan: {
                    storageId: item.storageId,
                    jenis: item.jenis,
                    pemilik: item.pemilik,
                    namaBerkas: ada.name,
                    driveFileId: ada.id,
                    contentType: item.contentType,
                    ukuran: item.ukuran,
                  },
                };
              }
              const asli = await unduhDokumen(item);
              const terenkripsi = enkripsiBackupDrive(asli, kunci);
              const nama = namaBerkasDokumen(item);
              const berkas = await unggahBerkas(token, {
                nama,
                mimeType: "application/octet-stream",
                data: terenkripsi,
                indukId: folderDokumen.id,
                appProperties: {
                  pindaiStorageId: item.storageId,
                  pindaiJenis: item.jenis,
                  pindaiVersi: "1",
                },
              });
              return {
                sukses: true as const,
                catatan: {
                  storageId: item.storageId,
                  jenis: item.jenis,
                  pemilik: item.pemilik,
                  namaBerkas: nama,
                  driveFileId: berkas.id,
                  contentType: item.contentType,
                  ukuran: item.ukuran,
                },
              };
            } catch (error) {
              return {
                sukses: false as const,
                catatan: {
                  storageId: item.storageId,
                  jenis: item.jenis,
                  pemilik: item.pemilik,
                  alasan: pesanAman(error),
                },
              };
            }
          }),
        );
        for (const item of hasil) {
          if (item.sukses) dokumenTersimpan.push(item.catatan);
          else dokumenGagal.push(item.catatan);
        }
      }

      const sekarang = new Date();
      const stempel = stempelWaktu(sekarang);
      const status =
        dokumenGagal.length === 0 ? ("lengkap" as const) : ("sebagian" as const);
      const jumlahBaris = Object.values(jumlah).reduce(
        (total, nilai) => total + nilai,
        0,
      );
      const manifest = {
        format: "pindai-backup-drive",
        versi: 1,
        dibuatPada: sekarang.toISOString(),
        folder: namaFolder,
        enkripsi: {
          algoritma: "AES-256-GCM",
          pembungkus: "PDBK1",
          kunciEnv: "BACKUP_DRIVE_ENCRYPTION_KEY",
        },
        status,
        jumlahTabel: TABEL_BACKUP_DRIVE.length,
        jumlahBaris,
        jumlah: jumlah,
        tabel,
        dokumen: dokumenTersimpan,
        dokumenGagal,
      };
      const isiManifest = enkripsiBackupDrive(
        Buffer.from(JSON.stringify(manifest), "utf8"),
        kunci,
      );
      const namaManifest = `manifest-${stempel}.json.enc`;
      const berkasManifest = await unggahBerkas(token, {
        nama: namaManifest,
        mimeType: "application/octet-stream",
        data: isiManifest,
        indukId: folder.id,
        appProperties: { pindaiJenis: "manifest", pindaiVersi: "1" },
      });

      // Ringkasan TANPA data pribadi: membantu operator melihat backup berjalan
      // tanpa harus mendekripsi manifest. Kegagalan ringkasan tidak membatalkan
      // backup inti yang sudah tersimpan.
      let namaRingkasan: string | null = null;
      try {
        const ringkasan = {
          dibuatPada: sekarang.toISOString(),
          folder: namaFolder,
          status,
          jumlahTabel: TABEL_BACKUP_DRIVE.length,
          jumlahBaris,
          jumlahDokumen: dokumenTersimpan.length,
          jumlahDokumenGagal: dokumenGagal.length,
          manifest: namaManifest,
          catatan:
            "Data lengkap ada di manifest terenkripsi; berkas KYC juga terenkripsi.",
        };
        namaRingkasan = `ringkasan-${stempel}.json`;
        await unggahBerkas(token, {
          nama: namaRingkasan,
          mimeType: "application/json",
          data: Buffer.from(JSON.stringify(ringkasan, null, 2), "utf8"),
          indukId: folder.id,
          appProperties: { pindaiJenis: "ringkasan", pindaiVersi: "1" },
        });
      } catch {
        namaRingkasan = null;
      }

      await ctx.runMutation(internal.backupDriveData.selesaikan, {
        jumlahTabel: TABEL_BACKUP_DRIVE.length,
        jumlahBaris,
        jumlahDokumen: dokumenTersimpan.length,
        jumlahDokumenGagal: dokumenGagal.length,
        folder: namaFolder,
        manifest: namaManifest,
        status,
      });

      return {
        ok: true as const,
        status,
        folder: namaFolder,
        manifest: berkasManifest.name ?? namaManifest,
        ringkasan: namaRingkasan,
        jumlahBaris,
        jumlahDokumen: dokumenTersimpan.length,
        jumlahDokumenGagal: dokumenGagal.length,
      };
    } catch (error) {
      const pesan = pesanAman(error);
      await ctx.runMutation(internal.backupDriveData.gagalkan, {
        pesan,
        ...(pemicu ? { pemicu } : {}),
      });
      throw new Error(`Backup Google Drive gagal: ${pesan}`);
    }
  },
});
