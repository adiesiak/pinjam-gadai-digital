/**
 * Promo pinjaman harian — aturan murni, dipakai server, panel admin, dan
 * formulir pengajuan.
 *
 * Tiga jenis kampanye, satu mekanisme pemilihan:
 *  - `bunga_pengganti` menetapkan bunga final, mis. 15% pada tenor 7 hari;
 *  - `potongan_bunga` memotong poin dari bunga normal, mis. 30% − 5 poin = 25%;
 *  - `bebas_admin` meniadakan biaya admin di muka, tanpa mengubah bunga.
 *
 * Satu pengajuan memakai satu kampanye terbaik. Untuk kampanye bunga, yang
 * menang adalah bunga final terendah; kampanye bebas admin menang bila tidak ada
 * kampanye bunga yang lebih ringan. Dengan begitu empat penawaran tetap bisa
 * dijalankan tanpa menumpuk subsidi yang tidak terlihat.
 *
 * Tenor kampanye mengikuti tenor harian yang sah, 7–50 hari. Selain empat tenor
 * standar (7/14/21/28), hari lain dipilih nasabah lewat tanggal jatuh tempo —
 * mis. 10 hari — dan promo dicocokkan persis dengan tenor itu.
 *
 * Yang TIDAK diatur di sini: bunga normal per tier (lib/loan.ts) dan tarif
 * bulanan. Promo hanya berlaku untuk skema harian; skema bulanan punya tarif
 * tenor sendiri di Pengaturan Parameter Bisnis.
 *
 * Murni: tanpa React, Convex, atau jam perangkat. `sekarang` selalu dikirim
 * pemanggil supaya kelayakan bisa diuji.
 */
import { TENOR_HARIAN_MAKS, TENOR_OPTIONS } from "./loan";
import { formatRupiah } from "./money";
import { formatPeriodePromo } from "./promoPinjaman";

/** Jenis kampanye. Baris lama tanpa `jenis` dibaca sebagai bunga pengganti. */
export type JenisPromoBunga = "bunga_pengganti" | "potongan_bunga" | "bebas_admin";

export const JENIS_PROMO_BUNGA: readonly {
  value: JenisPromoBunga;
  label: string;
  keterangan: string;
}[] = [
  {
    value: "bunga_pengganti",
    label: "Bunga pengganti",
    keterangan: "Bunga final yang menggantikan tarif tenor, mis. 15%.",
  },
  {
    value: "potongan_bunga",
    label: "Potongan bunga",
    keterangan: "Memotong poin dari bunga normal, mis. 5 poin.",
  },
  {
    value: "bebas_admin",
    label: "Bebas biaya admin",
    keterangan: "Biaya admin di muka menjadi Rp0; bunga tidak berubah.",
  },
] as const;

export const JENIS_PROMO_BUNGA_DEFAULT: JenisPromoBunga = "bunga_pengganti";

/** Satu promo seperti yang dibaca panel admin dan formulir. */
export type PromoBungaRingkas = {
  _id: string;
  nama: string;
  /** Jenis kampanye; kosong pada data lama = bunga pengganti. */
  jenis?: JenisPromoBunga;
  /**
   * Bunga final untuk `bunga_pengganti`. Untuk jenis lain nilainya 0 dan tidak
   * dipakai — `potongan_bunga` memakai `potonganPersen`, `bebas_admin` tidak
   * mengubah bunga.
   */
  persenBunga: number;
  /** Poin yang dipotong dari bunga normal untuk `potongan_bunga`. */
  potonganPersen?: number;
  /** Tenor harian 7–50 yang mendapat promo ini. */
  tenor: readonly number[];
  mulai: number;
  selesai: number;
  aktif: boolean;
  /**
   * Boleh digabung voucher potongan bunga. Kosong = boleh, supaya kampanye
   * lama tidak berubah perilaku saat aturan ini ditambahkan.
   */
  bolehVoucher?: boolean;
  /** Pagu subsidi kampanye dalam rupiah; kosong/0 = tanpa pagu. */
  paguSubsidi?: number;
};

/**
 * Lantai bunga saat promo dan voucher potongan bertumpuk.
 *
 * Promo menggantikan tarif normal, lalu voucher memotong lagi dalam poin
 * persen. Tanpa lantai, dua subsidi bisa menumpuk sampai bunga mendekati nol —
 * biaya yang tidak pernah terlihat di satu layar mana pun. Angka ini juga yang
 * membuat kombinasi "promo 15% + voucher 10 poin" tepat menyentuh batas.
 */
export const LANTAI_BUNGA_PROMO_PERSEN = 5;

export const BATAS_PROMO_BUNGA = {
  nama: 60,
  /** Pagu subsidi terkecil yang masuk akal untuk satu kampanye (rupiah). */
  paguMin: 10_000,
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
    nilai.every(
      (tenor) =>
        Number.isInteger(tenor) &&
        tenor >= TENOR_OPTIONS[0] &&
        tenor <= TENOR_HARIAN_MAKS,
    ) &&
    new Set(nilai).size === nilai.length
  );
}

/** Jenis kampanye dengan fallback aman untuk baris lama. */
export function jenisPromoBunga(
  promo: Pick<PromoBungaRingkas, "jenis">,
): JenisPromoBunga {
  return promo.jenis ?? JENIS_PROMO_BUNGA_DEFAULT;
}

/**
 * Promo yang dipakai bila beberapa promo berlaku untuk tenor yang sama.
 *
 * Yang dipilih adalah bunga final TERENDAH pada `persenNormal` — janji paling
 * ringan menang, dan hasilnya deterministik tanpa bergantung urutan penyimpanan.
 * Kampanye `bebas_admin` tidak mengubah bunga, jadi ia hanya menang bila tidak
 * ada kampanye bunga yang lebih ringan. Bila bunganya sama, promo dengan masa
 * berlaku lebih panjang yang dipakai, lalu bebas admin sebagai penentu terakhir
 * karena manfaatnya tetap nyata walau tarifnya sama.
 */
export function pilihPromoBunga(
  promos: readonly PromoBungaRingkas[],
  opsi: { tenor: number; sekarang: number; persenNormal?: number },
): PromoBungaRingkas | null {
  const normal = Math.max(0, opsi.persenNormal ?? 30);
  const prioritas = (promo: PromoBungaRingkas): number =>
    jenisPromoBunga(promo) === "bebas_admin" ? 1 : 0;
  let terbaik: PromoBungaRingkas | null = null;
  for (const promo of promos) {
    if (!promoBerlakuUntuk(promo, opsi)) continue;
    if (terbaik === null) {
      terbaik = promo;
      continue;
    }
    const bunga = bungaSetelahPromo(normal, promo);
    const bungaTerbaik = bungaSetelahPromo(normal, terbaik);
    if (
      bunga < bungaTerbaik ||
      (bunga === bungaTerbaik &&
        promo.selesai - promo.mulai > terbaik.selesai - terbaik.mulai) ||
      (bunga === bungaTerbaik &&
        promo.selesai - promo.mulai === terbaik.selesai - terbaik.mulai &&
        prioritas(promo) > prioritas(terbaik))
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
 *
 * `potongan_bunga` memotong poin dari tarif normal; `bebas_admin` tidak pernah
 * mengubah bunga. Keduanya dijepit di nol supaya tidak ada bunga negatif.
 */
export function bungaSetelahPromo(
  persenNormal: number,
  promo: Pick<PromoBungaRingkas, "jenis" | "persenBunga" | "potonganPersen"> | null,
): number {
  const normal = Math.max(0, persenNormal);
  if (promo === null) return normal;
  switch (jenisPromoBunga(promo)) {
    case "potongan_bunga":
      return Math.max(0, Math.round((normal - Math.max(0, promo.potonganPersen ?? 0)) * 100) / 100);
    case "bebas_admin":
      return normal;
    case "bunga_pengganti":
      return Math.min(normal, Math.max(0, promo.persenBunga));
  }
}

/** Selisih poin persen yang benar-benar dipotong; 0 bila tidak memotong. */
export function potonganPoinPersen(
  persenNormal: number,
  promo: Pick<PromoBungaRingkas, "jenis" | "persenBunga" | "potonganPersen"> | null,
): number {
  return Math.max(0, Math.round((persenNormal - bungaSetelahPromo(persenNormal, promo)) * 100) / 100);
}

/** Kalimat ringkas untuk lencana di panel dan formulir. */
export function ringkasPromoBunga(
  promo: Pick<
    PromoBungaRingkas,
    "jenis" | "persenBunga" | "potonganPersen" | "tenor" | "mulai" | "selesai"
  >,
  persenNormal: number,
): string {
  const tenor = [...promo.tenor].sort((a, b) => a - b).join("/");
  const periode = `${tenor} hari · ${formatPeriodePromo(promo.mulai, promo.selesai)}`;
  switch (jenisPromoBunga(promo)) {
    case "potongan_bunga":
      return `Potongan ${promo.potonganPersen ?? 0} poin (bunga ${bungaSetelahPromo(
        persenNormal,
        promo,
      )}% dari normal ${persenNormal}%) · tenor ${periode}`;
    case "bebas_admin":
      return `Bebas biaya admin (bunga tetap ${persenNormal}%) · tenor ${periode}`;
    case "bunga_pengganti":
      return `${promo.persenBunga}% (normal ${persenNormal}%) · tenor ${periode}`;
  }
}

/**
 * Hasil penerapan voucher potongan bunga di atas bunga promo.
 *
 * Ditulis sebagai fungsi murni supaya formulir dan server memakai aturan yang
 * sama persis, dan supaya penolakan bisa diuji tanpa basis data.
 */
export type HasilTumpukBunga =
  | { ok: true; persen: number }
  | { ok: false; pesan: string };

/**
 * Terapkan poin voucher pada bunga yang sudah dipotong promo.
 *
 * Tiga aturan, berurutan:
 *  1. Kampanye yang menolak tumpukan menolak voucher potongan bunga — nasabah
 *     diminta memilih salah satu, bukan diberi hasil yang tidak ia mengerti.
 *  2. Hasil di bawah lantai `LANTAI_BUNGA_PROMO_PERSEN` ditolak, bukan
 *     dipotong diam-diam: voucher yang nilainya termakan tidak boleh tampak
 *     "terpakai penuh".
 *  3. Tanpa promo, voucher tetap boleh dipakai sampai batas yang diatur admin
 *     saat menerbitkannya (lantai ini hanya penjaga tumpukan).
 */
export function terapkanVoucherBunga(args: {
  persenSetelahPromo: number;
  poinVoucher: number;
  promo: { nama: string; bolehVoucher?: boolean } | null;
}): HasilTumpukBunga {
  const poin = Math.max(0, args.poinVoucher);
  if (poin === 0) return { ok: true, persen: args.persenSetelahPromo };

  if (args.promo !== null && args.promo.bolehVoucher === false) {
    return {
      ok: false,
      pesan: `Promo ${args.promo.nama} tidak dapat digabung dengan voucher potongan bunga. Pilih salah satu, lalu ajukan ulang.`,
    };
  }

  const hasil = Math.round((args.persenSetelahPromo - poin) * 100) / 100;
  if (args.promo !== null && hasil < LANTAI_BUNGA_PROMO_PERSEN) {
    return {
      ok: false,
      pesan: `Voucher ${poin}% membuat bunga menjadi ${hasil}%, di bawah batas minimum ${LANTAI_BUNGA_PROMO_PERSEN}% saat promo berlaku. Pilih voucher lain atau ajukan tanpa voucher.`,
    };
  }
  return { ok: true, persen: Math.max(0, hasil) };
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
  /** Kosong = bunga pengganti, agar pemanggil lama tetap sah. */
  jenis?: JenisPromoBunga;
  persenBunga: number;
  /** Poin potongan untuk `potongan_bunga`. */
  potonganPersen?: number;
  tenor: readonly number[];
  mulai: number;
  selesai: number;
  /** Kosong/0 = tanpa pagu. */
  paguSubsidi?: number;
}): string[] {
  const pesan: string[] = [];
  const nama = isi.nama.trim();
  if (nama.length < 3) pesan.push("Nama promo minimal 3 karakter.");
  else if (nama.length > BATAS_PROMO_BUNGA.nama) {
    pesan.push(`Nama promo maksimal ${BATAS_PROMO_BUNGA.nama} karakter.`);
  }

  const jenis = isi.jenis ?? JENIS_PROMO_BUNGA_DEFAULT;
  const angkaBerlaku =
    jenis === "potongan_bunga" ? isi.potonganPersen : isi.persenBunga;
  if (jenis !== "bebas_admin") {
    if (
      angkaBerlaku === undefined ||
      !Number.isSafeInteger(angkaBerlaku) ||
      angkaBerlaku <= 0 ||
      angkaBerlaku > BATAS_PROMO_BUNGA.persenMaks
    ) {
      pesan.push(
        jenis === "potongan_bunga"
          ? `Potongan bunga harus angka bulat 1–${BATAS_PROMO_BUNGA.persenMaks} poin.`
          : `Bunga promo harus angka bulat 1–${BATAS_PROMO_BUNGA.persenMaks}% agar benar-benar di bawah bunga normal.`,
      );
    }
  }

  if (!tenorPromoValid(isi.tenor)) {
    pesan.push(
      `Pilih minimal satu tenor ${TENOR_OPTIONS[0]}–${TENOR_HARIAN_MAKS} hari.`,
    );
  }

  if (isi.paguSubsidi !== undefined && isi.paguSubsidi !== 0) {
    if (
      !Number.isSafeInteger(isi.paguSubsidi) ||
      isi.paguSubsidi < BATAS_PROMO_BUNGA.paguMin
    ) {
      pesan.push(
        `Pagu subsidi minimal ${formatRupiah(BATAS_PROMO_BUNGA.paguMin)} atau kosongkan bila tanpa pagu.`,
      );
    }
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
  tenor: number;
  /** Tarif normal tiap tier pokok (lihat MATRIKS_HARIAN). */
  normal: { tier1: number; tier2: number; tier3: number };
  /** Bunga efektif setelah promo, per tier. Bebas admin = tarif normal. */
  promo: { tier1: number; tier2: number; tier3: number };
  /** Potongan poin terbesar yang terjadi pada tenor ini. */
  potonganTerbesar: number;
};

export type KonfigurasiPromoBunga = Pick<
  PromoBungaRingkas,
  "jenis" | "persenBunga" | "potonganPersen"
>;

/**
 * Pratinjau per tenor. Menerima angka lama (bunga pengganti) atau konfigurasi
 * lengkap supaya panel bisa menampilkan hasil potongan dan bebas admin tanpa
 * menduplikasi rumus.
 */
export function pratinjauPromoBunga(
  tenor: readonly number[],
  promo: number | KonfigurasiPromoBunga,
  normalPerTenor: (tenor: number) => { tier1: number; tier2: number; tier3: number },
): BarisPratinjauPromo[] {
  const konfigurasi: KonfigurasiPromoBunga =
    typeof promo === "number"
      ? { jenis: "bunga_pengganti", persenBunga: promo }
      : promo;
  return [...tenor]
    .filter(
      (nilai) =>
        Number.isInteger(nilai) &&
        nilai >= TENOR_OPTIONS[0] &&
        nilai <= TENOR_HARIAN_MAKS,
    )
    .sort((a, b) => a - b)
    .map((nilaiTenor) => {
      const normal = normalPerTenor(nilaiTenor);
      const promoPerTier = {
        tier1: bungaSetelahPromo(normal.tier1, konfigurasi),
        tier2: bungaSetelahPromo(normal.tier2, konfigurasi),
        tier3: bungaSetelahPromo(normal.tier3, konfigurasi),
      };
      const potongan = [
        potonganPoinPersen(normal.tier1, konfigurasi),
        potonganPoinPersen(normal.tier2, konfigurasi),
        potonganPoinPersen(normal.tier3, konfigurasi),
      ];
      return {
        tenor: nilaiTenor,
        normal,
        promo: promoPerTier,
        potonganTerbesar: Math.max(...potongan),
      };
    });
}
