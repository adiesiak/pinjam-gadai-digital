import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ledgerTotals } from "./ledger";
import { audit, catatanBackupTerakhir } from "./system";

/**
 * Pemantauan sistem yang benar-benar terukur.
 *
 * Tiga kelas masalah yang bisa dibuktikan dari data yang ada:
 *  1. cron berhenti — dibaca dari `cronDenyut` yang ditulis setiap job selesai;
 *  2. ledger tidak seimbang — total debit ≠ total kredit;
 *  3. gateway WhatsApp gagal — `waLogs` berstatus gagal dalam 24 jam.
 *
 * Tidak ada metrik latency/error-rate di sini karena aplikasi tidak mencatat
 * request terpusat; mengarang angka persentil akan menyesatkan operator.
 */

const JAM_MS = 60 * 60 * 1000;
const SEHARI_MS = 24 * JAM_MS;

/**
 * Jeda minimum sebelum masalah yang sama dilaporkan lagi.
 *
 * Kritis lebih cepat (6 jam) karena menyangkut keseimbangan uang atau
 * penjadwal yang mati. Peringatan 24 jam: cukup untuk ditindaklanjuti tanpa
 * membanjiri audit trail.
 */
const JEDA_LAPOR_KRITIS_MS = 6 * JAM_MS;
const JEDA_LAPOR_PERINGATAN_MS = SEHARI_MS;

/** Cron yang harus berdenyut beserta batas umur denyutnya. */
export const CRON_DIHARAPKAN = [
  { nama: "pengingat-jatuh-tempo-wa", label: "Pengingat WhatsApp (tiap jam)", maksJam: 3 },
  { nama: "daily-due-reminders", label: "Pengingat jatuh tempo harian", maksJam: 26 },
  { nama: "retensi-lokasi", label: "Retensi jejak lokasi", maksJam: 26 },
  { nama: "retensi-idempotensi", label: "Retensi kunci idempotensi", maksJam: 26 },
  { nama: "retensi-gerbang", label: "Retensi jejak gerbang kirim", maksJam: 26 },
] as const;

export type TingkatPeringatan = "peringatan" | "kritis";

export type PeringatanSistem = {
  kunci: string;
  tingkat: TingkatPeringatan;
  judul: string;
  pesan: string;
};

/** Tulis/segarkan denyut satu cron. Dipanggil di akhir job-nya. */
export async function catatDenyut(ctx: MutationCtx, nama: string): Promise<void> {
  const sekarang = Date.now();
  const baris = await ctx.db
    .query("cronDenyut")
    .withIndex("by_nama", (q) => q.eq("nama", nama))
    .first();
  if (baris === null) {
    await ctx.db.insert("cronDenyut", { nama, terakhirPada: sekarang, jumlah: 1 });
    return;
  }
  await ctx.db.patch(baris._id, {
    terakhirPada: sekarang,
    jumlah: baris.jumlah + 1,
  });
}

/**
 * Susun daftar peringatan. Dipakai query panel dan cron pemeriksa, sehingga
 * keduanya tidak mungkin berbeda pendapat soal apa yang sedang bermasalah.
 */
export async function susunPeringatan(
  ctx: QueryCtx | MutationCtx,
): Promise<{ peringatan: PeringatanSistem[]; denyut: Array<{ nama: string; terakhirPada: number }> }> {
  const sekarang = Date.now();
  const [ledger, waLogs, denyut] = await Promise.all([
    ledgerTotals(ctx),
    ctx.db.query("waLogs").take(5_000),
    ctx.db.query("cronDenyut").take(50),
  ]);

  const peringatan: PeringatanSistem[] = [];

  if (!ledger.seimbang) {
    peringatan.push({
      kunci: "ledger",
      tingkat: "kritis",
      judul: "Ledger tidak seimbang",
      pesan: `Total debit ${ledger.totalDebit.toLocaleString("id-ID")} ≠ kredit ${ledger.totalKredit.toLocaleString("id-ID")} pada ${ledger.entryCount} entri. Jangan mencatat transaksi baru sebelum diperiksa.`,
    });
  }

  const wa24 = waLogs.filter((w) => w.waktu >= sekarang - SEHARI_MS);
  const waGagal = wa24.filter((w) => w.status === "gagal");
  if (waGagal.length > 0) {
    peringatan.push({
      kunci: "wa-gagal",
      tingkat: waGagal.length >= 3 ? "kritis" : "peringatan",
      judul: "Pengiriman WhatsApp gagal",
      pesan: `${waGagal.length} dari ${wa24.length} percobaan gagal dalam 24 jam. Respons terakhir: ${
        (waGagal[0]?.respon ?? "tidak tercatat").slice(0, 160)
      }`,
    });
  }

  /**
   * Backup yang terlantar. Kode tidak bisa menjadwalkan backup platform, jadi
   * yang diperiksa adalah CATATAN backup terakhir: arsip yang tidak pernah
   * dibuat tidak terlihat sampai ada kejadian yang membutuhkan pemulihan.
   * Instalasi baru tanpa satu entri ledger pun tidak diberi alarm.
   */
  if (ledger.entryCount > 0) {
    const BATAS_BACKUP_HARI = 7;
    const backup = await catatanBackupTerakhir(ctx);
    const umurHari =
      backup === null ? null : (sekarang - backup.waktu) / SEHARI_MS;
    if (umurHari === null) {
      peringatan.push({
        kunci: "backup",
        tingkat: "peringatan",
        judul: "Backup data belum tercatat",
        pesan: `Belum ada backup data yang tercatat. Unduh snapshot dari tab Ekspor atau jadwalkan backup di platform, lalu catat hasilnya. Panduan: docs/operasional-backup.md.`,
      });
    } else if (umurHari > BATAS_BACKUP_HARI) {
      peringatan.push({
        kunci: "backup",
        tingkat: "peringatan",
        judul: "Backup data belum tercatat",
        pesan: `Backup terakhir tercatat ${Math.round(umurHari)} hari lalu (batas ${BATAS_BACKUP_HARI} hari). Periksa jadwal backup dan lakukan uji pemulihan berkala — panduan: docs/operasional-backup.md.`,
      });
    }

    // Kegagalan Drive tidak menulis aksi `backup`, jadi tanpa pemeriksaan ini
    // arsip yang gagal bisa terlihat "belum waktunya" sampai batas tujuh hari.
    const gagalDrive = await ctx.db
      .query("auditLog")
      .withIndex("by_aksi", (q) => q.eq("aksi", "backup_drive_gagal"))
      .order("desc")
      .first();
    if (
      gagalDrive !== null &&
      (backup === null || gagalDrive.waktu > backup.waktu)
    ) {
      peringatan.push({
        kunci: "backup-drive-gagal",
        tingkat: "peringatan",
        judul: "Backup Google Drive gagal",
        pesan: `Percobaan terakhir ${Math.round((sekarang - gagalDrive.waktu) / JAM_MS)} jam lalu gagal. Periksa kredensial OAuth, folder Drive, dan audit trail. Panduan: docs/operasional-backup.md.`,
      });
    }
  }

  const petaDenyut = new Map(denyut.map((d) => [d.nama, d.terakhirPada]));
  for (const cron of CRON_DIHARAPKAN) {
    const terakhir = petaDenyut.get(cron.nama);
    // Sistem yang belum pernah mencatat apa pun (instalasi baru) tidak diberi
    // alarm cron: tidak ada bukti penjadwal pernah berjalan, juga tidak ada
    // bukti ia berhenti.
    if (terakhir === undefined) {
      if (ledger.entryCount > 0) {
        peringatan.push({
          kunci: `cron:${cron.nama}`,
          tingkat: "peringatan",
          judul: `Cron belum pernah berdenyut: ${cron.label}`,
          pesan:
            "Belum ada catatan denyut untuk job ini. Periksa apakah penjadwal terpasang dan job selesai tanpa galat.",
        });
      }
      continue;
    }
    const umurJam = (sekarang - terakhir) / JAM_MS;
    if (umurJam > cron.maksJam) {
      peringatan.push({
        kunci: `cron:${cron.nama}`,
        tingkat: umurJam > cron.maksJam * 2 ? "kritis" : "peringatan",
        judul: `Cron terlambat: ${cron.label}`,
        pesan: `Denyut terakhir ${Math.round(umurJam)} jam lalu (batas ${cron.maksJam} jam). Job mungkin berhenti atau gagal sebelum mencatat denyut.`,
      });
    }
  }

  const urut: Record<TingkatPeringatan, number> = { kritis: 0, peringatan: 1 };
  peringatan.sort((a, b) => urut[a.tingkat] - urut[b.tingkat]);

  return {
    peringatan,
    denyut: denyut.map((d) => ({ nama: d.nama, terakhirPada: d.terakhirPada })),
  };
}

/** Denyut dari action (action tidak boleh menulis database langsung). */
export const catatDenyutInternal = internalMutation({
  args: { nama: v.string() },
  handler: async (ctx, { nama }) => {
    await catatDenyut(ctx, nama);
    return { ok: true as const };
  },
});

/**
 * Pemeriksa terjadwal.
 *
 * Menulis entri audit untuk masalah yang BELUM pernah dilaporkan dalam jendela
 * waktunya, lalu diam. Tidak menulis apa pun saat sehat — audit trail yang
 * penuh "semua baik" justru menyembunyikan kejadian.
 *
 * Dua jendela sengaja berbeda:
 *  - kritis (ledger tidak seimbang, cron mati jauh): 6 jam. Masalah uang atau
 *    penjadwal mati harus cepat terlihat.
 *  - peringatan (backup terlantar, backup Drive gagal, cron terlambat, WA
 *    gagal): 24 jam. Cukup sering untuk ditindaklanjuti, cukup jarang untuk
 *    tidak membanjiri audit trail.
 *
 * SEBELUMNYA hanya kritis yang dicatat. Akibatnya masalah yang "hanya"
 * peringatan tidak pernah meninggalkan jejak sama sekali — termasuk backup yang
 * tidak pernah dibuat. Keadaan itu terbukti: backup terakhir tercatat 48 hari
 * lalu dan tidak ada satu pun entri audit yang menandainya.
 */
export const periksaSistem = internalMutation({
  args: {},
  handler: async (ctx) => {
    const { peringatan } = await susunPeringatan(ctx);
    if (peringatan.length === 0) {
      return { ok: true as const, kritis: 0, dicatat: 0 };
    }

    const kritis = peringatan.filter((p) => p.tingkat === "kritis").length;
    const terakhir = await ctx.db
      .query("auditLog")
      .order("desc")
      .take(40);
    const sekarang = Date.now();

    const belumDilaporkan = peringatan.filter((p) => {
      const jeda =
        p.tingkat === "kritis" ? JEDA_LAPOR_KRITIS_MS : JEDA_LAPOR_PERINGATAN_MS;
      return !terakhir.some(
        (a) =>
          a.aksi === "peringatan_sistem" &&
          a.waktu >= sekarang - jeda &&
          (a.detail ?? "").includes(p.kunci),
      );
    });

    if (belumDilaporkan.length === 0) {
      return { ok: true as const, kritis, dicatat: 0 };
    }

    await audit(
      ctx,
      undefined,
      "monitoring",
      "peringatan_sistem",
      "sistem",
      belumDilaporkan
        .map((p) => `[${p.kunci}] ${p.judul}: ${p.pesan}`)
        .join(" | "),
    );
    return { ok: true as const, kritis, dicatat: belumDilaporkan.length };
  },
});
