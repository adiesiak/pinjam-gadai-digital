/**
 * Ringkasan persetujuan risiko pendana — fungsi MURNI, tanpa I/O.
 *
 * Persetujuan disimpan di server (lihat `convex/persetujuanRisiko.ts`), satu
 * baris per VERSI teks yang disetujui. Berkas ini hanya menerjemahkan baris-baris
 * itu menjadi satu keadaan yang bisa dibaca UI: apakah versi yang berlaku sudah
 * disetujui, kapan, dan apa riwayatnya.
 */

/** Satu baris persetujuan yang sudah tersimpan di server. */
export type RiwayatPersetujuan = {
  versiTeks: number;
  peran: string;
  disetujuiPada: number;
};

/** Keadaan persetujuan risiko satu akun terhadap versi teks yang berlaku. */
export type StatusPersetujuan = {
  versiBerlaku: number;
  disetujuiPada: number | null;
  versiDisetujui: number | null;
  perluSetuju: boolean;
  riwayat: RiwayatPersetujuan[];
};

export const LABEL_PERLU_SETUJU =
  "Persetujuan risiko versi yang berlaku belum tercatat atas nama akun Anda. Membaca halaman ini saja belum menjadi persetujuan.";

export const LABEL_SUDAH_SETUJU =
  "Persetujuan risiko versi yang berlaku sudah tercatat atas nama akun Anda di server PINDAI.";

export function statusPersetujuan(input: {
  versiBerlaku: number;
  riwayat: readonly RiwayatPersetujuan[];
}): StatusPersetujuan {
  const riwayat = [...input.riwayat].sort((a, b) => b.disetujuiPada - a.disetujuiPada);
  const berlaku = riwayat.find((baris) => baris.versiTeks === input.versiBerlaku) ?? null;
  const versiDisetujui =
    riwayat.length === 0
      ? null
      : riwayat.reduce(
          (maks, baris) => (baris.versiTeks > maks ? baris.versiTeks : maks),
          riwayat[0].versiTeks,
        );

  return {
    versiBerlaku: input.versiBerlaku,
    disetujuiPada: berlaku === null ? null : berlaku.disetujuiPada,
    versiDisetujui,
    perluSetuju: berlaku === null,
    riwayat,
  };
}

export function labelPeranPersetujuan(peran: string): string {
  if (peran === "dana") return "Penyedia dana";
  if (peran === "pengamat") return "Sesi kode akses bersama";
  return peran;
}
