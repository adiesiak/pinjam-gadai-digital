/**
 * Promo bunga pinjaman harian — aturan murni, dipakai server, panel admin, dan
 * formulir pengajuan.
 *
 * Modelnya satu kalimat: **bunga promo menggantikan bunga normal** untuk tenor
 * yang dipilih selama rentang tanggal kampanye. Jadi promo 15% pada tenor 7
 * hari berarti bunga pinjaman itu 15% dari pokok (bukan 30% dikurangi 15%).
 * Pemilihan itu disengaja: admin menulis angka yang benar-benar dibaca nasabah,
 * tanpa perlu menghitung ulang potongan.
 *
 * Yang TIDAK diatur di sini: bunga normal per tier (lib/loan.ts) dan tarif
 * bulanan. Promo hanya berlaku untuk skema harian; skema bulanan punya tarif
 * tenor sendiri di Pengaturan Parameter Bisnis.
 *
 * Murni: tanpa React, Convex, atau jam perangkat. `sekarang` selalu dikirim
 * pemanggil supaya kelayakan bisa diuji.
 */
import { TENOR_OPTIONS, type Tenor } from "./loan";
import { formatPeriodePromo } from "./promoPinjaman";

/** Satu promo seperti yang dibaca panel admin dan formulir. */
export type PromoBungaRingkas = {
  _id: string;
  nama: string;
  /** Bunga promo dalam persen dari pokok (mis. 15 → 15%). */
  persenBunga: number;
  /** Tenor harian yang mendapat bunga promo ini. */
  tenor: readonly number[];
  mulai: number;
  selesai: number;
  aktif: boolean;
};

export const BATAS_PROMO_BUNGA = {
  nama: 60,
  /**
   * Bunga terendah yang mungkin dipotong promo adalah 26% (tier pokok ≥Rp1
   * juta, tenor 7 hari). Angka promo di atas 25% karena itu tidak akan pernah
   * benar-benar memotong — ia hanya menampilkan janji yang tidak berlaku.
   */
  persenMaks: 25,
} as const;

export type StatusPromoBunga = "nonaktif" | "dijadwalkan" | "berjalan" | "berakhir";

export const LABEL_STATUS_PROMO_BUNGA: Record<StatusPromoBunga, string> = {
  nonaktif: "Nonaktif",
  dijadwalkan: "Dijadwalkan",
  berjalan: "Berjalan",
  berakhir: "Berakhir",
};

export const KELAS_STATUS_PROMO_BUNGA: Record<StatusPromoBunga, string> = {
  berjalan: "border-emerald-700/30 bg-emerald-700/10 text-emerald-800",
  dijadwalkan: "border-sky-700/30 bg-sky-700/10 text-sky-800",
  berakhir: "border-slate-300 bg-slate-100 text-slate-600",
  nonaktif: "border-amber-700/30 bg-amber-700/10 text-amber-800",
};

/** Status yang dibaca admin. `nonaktif` menang atas tanggal. */
export function statusPromoBunga(
  promo: Pick<PromoBungaRingkas, "aktif" | "mulai" | "selesai">,
  sekarang: number,
): StatusPromoBunga {
  if (!promo.aktif) return "nonaktif";
  if (sekarang < promo.mulai) return "dijadwalkan";
  if (sekarang > promo.selesai) return "berakhir";
  return "berjalan";
}

/**
 * Apakah promo berlaku untuk satu tenor sekarang.
 *
 * Tanggal dibandingkan inklusif: rentang `1–31 Oktober` masih berlaku pada
 * 31 Oktober pukul 23.59 WIB, karena `selesai` disimpan sebagai akhir hari.
 */
export function promoBerlakuUntuk(
  promo: Pick<PromoBungaRingkas, "aktif" | "mulai" | "selesai" | "tenor">,
  opsi: { tenor: number; sekarang: number },
): boolean {
  return (
    promo.aktif &&
    promo.tenor.includes(opsi.tenor) &&
    promo.mulai <= opsi.sekarang &&
    opsi.sekarang <= promo.selesai
  );
}

export function tenorPromoValid(nilai: readonly number[]): boolean {
  return (
    nilai.length > 0 &&
    nilai.every((tenor) => (TENOR_OPTIONS as readonly number[]).includes(tenor)) &&
    new Set(nilai).size === nilai.length
  );
}

/**
 * Promo yang dipakai bila beberapa promo berlaku untuk tenor yang sama.
 *
 * Yang dipilih adalah bunga TERENDAH — janji paling ringan menang, dan hasilnya
 * deterministik tanpa bergantung urutan penyimpanan. Bila bunganya sama, promo
 * dengan masa berlaku lebih panjang yang dipakai, supaya pilihan tidak berubah
 * hanya karena dua kampanye tumpang tindih.
 */
export function pilihPromoBunga(
  promos: readonly PromoBungaRingkas[],
  opsi: { tenor: number; sekarang: number },
): PromoBungaRingkas | null {
  let terbaik: PromoBungaRingkas | null = null;
  for (const promo of promos) {
    if (!promoBerlakuUntuk(promo, opsi)) continue;
    if (
      terbaik === null ||
      promo.persenBunga < terbaik.persenBunga ||
      (promo.persenBunga === terbaik.persenBunga &&
        promo.selesai - promo.mulai > terbaik.selesai - terbaik.mulai)
    ) {
      terbaik = promo;
    }
  }
  return terbaik;
}

/**
 * Bunga yang benar-benar dipakai. Tidak pernah menaikkan bunga: promo yang
 * angkanya lebih tinggi dari tarif normal diabaikan mesin, walau lolos
 * penyimpanan (mis. matriks tenor berubah setelah promo dibuat).
 */
export function bungaSetelahPromo(
  persenNormal: number,
  promo: Pick<PromoBungaRingkas, "persenBunga"> | null,
): number {
  const normal = Math.max(0, persenNormal);
  if (promo === null) return normal;
  return Math.min(normal, Math.max(0, promo.persenBunga));
}

/** Selisih poin persen yang benar-benar dipotong; 0 bila tidak memotong. */
export function potonganPoinPersen(
  persenNormal: number,
  promo: Pick<PromoBungaRingkas, "persenBunga"> | null,
): number {
  return Math.max(0, Math.round((persenNormal - bungaSetelahPromo(persenNormal, promo)) * 100) / 100);
}

/** Kalimat ringkas untuk lencana: "15% (normal 30%) · tenor 7 hari · 23–31 Oktober 2026". */
export function ringkasPromoBunga(
  promo: Pick<PromoBungaRingkas, "persenBunga" | "tenor" | "mulai" | "selesai">,
  persenNormal: number,
): string {
  const tenor = [...promo.tenor].sort((a, b) => a - b).join("/");
  return `${promo.persenBunga}% (normal ${persenNormal}%) · tenor ${tenor} hari · ${formatPeriodePromo(
    promo.mulai,
    promo.selesai,
  )}`;
}

/**
 * Daftar pesan kesalahan; kosong berarti isian siap disimpan.
 *
 * `persenMaks` 25% menjaga promo selalu lebih rendah dari bunga terendah
 * (26%). Tanpa batas ini admin bisa menyimpan "promo 40%" yang tidak memotong
 * apa pun, dan nasabah melihat janji yang tidak pernah berlaku.
 */
export function periksaIsiPromoBunga(isi: {
  nama: string;
  persenBunga: number;
  tenor: readonly number[];
  mulai: number;
  selesai: number;
}): string[] {
  const pesan: string[] = [];
  const nama = isi.nama.trim();
  if (nama.length < 3) pesan.push("Nama promo minimal 3 karakter.");
  else if (nama.length > BATAS_PROMO_BUNGA.nama) {
    pesan.push(`Nama promo maksimal ${BATAS_PROMO_BUNGA.nama} karakter.`);
  }

  if (
    !Number.isSafeInteger(isi.persenBunga) ||
    isi.persenBunga <= 0 ||
    isi.persenBunga > BATAS_PROMO_BUNGA.persenMaks
  ) {
    pesan.push(
      `Bunga promo harus angka bulat 1–${BATAS_PROMO_BUNGA.persenMaks}% agar benar-benar di bawah bunga normal.`,
    );
  }

  if (!tenorPromoValid(isi.tenor)) {
    pesan.push(`Pilih minimal satu tenor dari ${TENOR_OPTIONS.join(" / ")} hari.`);
  }

  if (!Number.isFinite(isi.mulai) || !Number.isFinite(isi.selesai)) {
    pesan.push("Tanggal mulai dan selesai wajib diisi.");
  } else if (isi.selesai < isi.mulai) {
    pesan.push("Tanggal selesai tidak boleh sebelum tanggal mulai.");
  }

  return pesan;
}

/**
 * Pratinjau per tenor untuk panel admin: daftar tarif normal per tier dan
 * bunga setelah promo. Dipakai supaya admin melihat angka nyata, bukan hanya
 * persentase yang ia ketik.
 */
export type BarisPratinjauPromo = {
  tenor: Tenor;
  /** Tarif normal tiap tier pokok (lihat MATRIKS_HARIAN). */
  normal: { tier1: number; tier2: number; tier3: number };
  /** Bunga promo yang akan dipakai; sama untuk semua tier. */
  promo: number;
  /** Potongan poin terbesar yang terjadi pada tenor ini. */
  potonganTerbesar: number;
};

export function pratinjauPromoBunga(
  tenor: readonly number[],
  persenPromo: number,
  normalPerTenor: (tenor: Tenor) => { tier1: number; tier2: number; tier3: number },
): BarisPratinjauPromo[] {
  return [...tenor]
    .filter((nilai): nilai is Tenor => (TENOR_OPTIONS as readonly number[]).includes(nilai))
    .sort((a, b) => a - b)
    .map((nilaiTenor) => {
      const normal = normalPerTenor(nilaiTenor);
      const potongan = [
        potonganPoinPersen(normal.tier1, { persenBunga: persenPromo }),
        potonganPoinPersen(normal.tier2, { persenBunga: persenPromo }),
        potonganPoinPersen(normal.tier3, { persenBunga: persenPromo }),
      ];
      return {
        tenor: nilaiTenor,
        normal,
        promo: persenPromo,
        potonganTerbesar: Math.max(...potongan),
      };
    });
}
