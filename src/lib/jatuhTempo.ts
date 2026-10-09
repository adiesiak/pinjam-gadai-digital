/**
 * Tampilan jatuh tempo untuk tabel kerja admin & penyedia dana.
 *
 * Tujuan satu-satunya: tanggal jatuh tempo harus begitu mencolok sehingga
 * admin tidak perlu menghitung sendiri. Karena itu modul ini tidak hanya
 * mengembalikan tanggal, tetapi juga:
 *  - kalimat hitung hari ("Sisa 12 hari", "Jatuh tempo hari ini",
 *    "Terlambat 3 hari", "Belum didanai", "Sudah lunas"),
 *  - nada warna (`nada`) supaya UI bisa menyorot tanpa menebak, dan
 *  - `mencolok` — true saat admin memang harus segera bertindak
 *    (jatuh tempo ≤ 3 hari atau sudah lewat).
 *
 * Angka hari TIDAK dihitung ulang di sini dari nol: untuk pinjaman berstatus
 * `didanai` perhitungannya memakai `pelunasanPinjaman` (lib/loan) — sumber
 * kebenaran yang sama dengan dashboard peminjam, penagihan, dan denda — supaya
 * tabel ini tidak pernah berbeda angka dengan halaman lain. Perhitungan lokal
 * hanya dipakai sebagai jaring pengaman bila data warisan tidak bisa dihitung.
 */
import { BULAN_MS, DEFAULT_TENOR_HARI, pelunasanPinjaman } from "./loan";

const DAY_MS = 86_400_000;

/** Selisih hari yang membuat satu jatuh tempo disorot sebagai "segera". */
export const AMBANG_SEGERA_HARI = 3;

/**
 * Kalimat hitung hari saat kewajiban jatuh tempo persis hari ini. Diekspor
 * sebagai konstanta (bukan literal yang disalin) supaya mesin pengingat jatuh
 * tempo bisa mengenali keadaan "hari ini" tanpa menebak dari angka.
 */
export const HITUNG_HARI_INI = "Jatuh tempo hari ini";

/** Nada warna untuk UI — dipetakan ke kelas Tailwind oleh komponennya. */
export type NadaJatuhTempo =
  /** Belum ada pendanaan: tidak ada tanggal yang bisa diperiksa. */
  | "belum_didanai"
  /** Sudah lunas: tanggal tetap ditampilkan sebagai catatan. */
  | "lunas"
  /** Masih jauh: tampil tenang, cukup tebal. */
  | "netral"
  /** ≤ 3 hari atau hari ini: harus diingat. */
  | "segera"
  /** Sudah lewat jatuh tempo. */
  | "terlambat";

export type TampilanJatuhTempo = {
  /** Ada tanggal jatuh tempo yang sah. */
  ada: boolean;
  /** Batas akhir pelunasan (epoch ms), null bila belum didanai. */
  tanggal: number | null;
  /** Tanggal ringkas bahasa Indonesia, mis. "12 Sep 2026" atau "—". */
  teks: string;
  /** Kalimat hitung hari yang selalu bisa dibaca apa adanya. */
  hitung: string;
  nada: NadaJatuhTempo;
  /** Admin perlu segera melihat/menindak lanjuti baris ini. */
  mencolok: boolean;
  /** Label untuk pembaca layar — satu kalimat utuh, bukan potongan. */
  aksesibilitas: string;
};

/** Bentuk baris yang dibutuhkan — sengaja longgar agar data warisan tetap jalan. */
export type BarisJatuhTempo = {
  status: string;
  pokokPinjaman: number;
  didanaiPada?: number | null;
  tenorHari?: number | null;
  tenorBulan?: number | null;
  persenBunga?: number | null;
};

/** Tanggal ringkas "12 Sep 2026" (id-ID). */
export function tanggalRingkas(ms: number): string {
  return new Date(ms).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Batas akhir pelunasan dari tanggal pendanaan + tenor; null bila belum didanai.
 *
 * Tenor yang tidak terbaca (data warisan pra-tenor, atau angka rusak) memakai
 * default 30 hari — aturan yang sama dengan `pelunasanPinjaman` di lib/loan —
 * supaya admin tetap melihat tanggal perkiraan, bukan "belum didanai" padahal
 * pinjamannya sudah berjalan.
 */
export function batasPelunasan(baris: BarisJatuhTempo): number | null {
  const didanai = baris.didanaiPada ?? null;
  if (didanai === null || !Number.isSafeInteger(didanai) || didanai <= 0) return null;
  const tenorBulan = baris.tenorBulan ?? null;
  const bulanSah = tenorBulan !== null && Number.isSafeInteger(tenorBulan) && tenorBulan > 0;
  const hari = baris.tenorHari ?? null;
  const hariSah = hari !== null && Number.isSafeInteger(hari) && hari > 0;
  const ms = bulanSah
    ? tenorBulan * BULAN_MS
    : hariSah
      ? hari * DAY_MS
      : DEFAULT_TENOR_HARI * DAY_MS;
  return didanai + ms;
}

/** Jam menganggur: sisa hari & hari terlambat dihitung dari batas pelunasan. */
function sisaHariDari(jatuhTempoPada: number, sekarang: number) {
  const sisaMs = jatuhTempoPada - sekarang;
  return {
    sisaHari: Math.max(0, Math.ceil(sisaMs / DAY_MS)),
    hariTerlambat: Math.max(0, Math.floor(-sisaMs / DAY_MS)),
  };
}

/**
 * Tampilan jatuh tempo satu baris pinjaman.
 *
 * Status `lunas` tetap menampilkan tanggalnya (catatan kapan seharusnya jatuh
 * tempo) tetapi tanpa hitungan hari — kewajibannya sudah selesai. Status di
 * luar `lunas`/`didanai` yang belum pernah didanai ditampilkan "Belum didanai".
 */
export function ringkasJatuhTempo(
  baris: BarisJatuhTempo,
  sekarang: number,
): TampilanJatuhTempo {
  const jatuhTempoPada = batasPelunasan(baris);

  if (baris.status === "lunas") {
    const tanggal = jatuhTempoPada;
    return {
      ada: tanggal !== null,
      tanggal,
      teks: tanggal === null ? "—" : tanggalRingkas(tanggal),
      hitung: "Sudah lunas",
      nada: "lunas",
      mencolok: false,
      aksesibilitas:
        tanggal === null
          ? "Pinjaman sudah lunas, tanggal jatuh tempo tidak tercatat."
          : `Pinjaman sudah lunas. Jatuh tempo ${tanggalRingkas(tanggal)}.`,
    };
  }

  if (jatuhTempoPada === null) {
    return {
      ada: false,
      tanggal: null,
      teks: "—",
      hitung: "Belum didanai",
      nada: "belum_didanai",
      mencolok: false,
      aksesibilitas: "Belum didanai sehingga belum ada tanggal jatuh tempo.",
    };
  }

  // Sumber utama: perhitungan kanonik lib/loan. Dipakai hanya untuk status
  // `didanai` (status lain tidak punya derivasi pelunasan); kegagalan data
  // warisan jatuh ke hitungan lokal di bawah, bukan merobohkan tabel.
  let hari = sisaHariDari(jatuhTempoPada, sekarang);
  if (baris.status === "didanai") {
    try {
      const pelunasan = pelunasanPinjaman(
        {
          pokokPinjaman: baris.pokokPinjaman,
          status: baris.status,
          tenorHari: baris.tenorHari ?? undefined,
          tenorBulan: baris.tenorBulan ?? undefined,
          didanaiPada: baris.didanaiPada ?? undefined,
          persenBunga: baris.persenBunga ?? undefined,
        },
        sekarang,
      );
      if (pelunasan !== null) {
        hari = { sisaHari: pelunasan.sisaHari, hariTerlambat: pelunasan.hariTerlambat };
      }
    } catch {
      // Pakai hitungan lokal — tabel tetap tampil.
    }
  }

  const teks = tanggalRingkas(jatuhTempoPada);
  if (hari.hariTerlambat > 0) {
    return {
      ada: true,
      tanggal: jatuhTempoPada,
      teks,
      hitung: `Terlambat ${hari.hariTerlambat} hari`,
      nada: "terlambat",
      mencolok: true,
      aksesibilitas: `Jatuh tempo ${teks}, sudah terlambat ${hari.hariTerlambat} hari.`,
    };
  }
  if (hari.sisaHari === 0) {
    return {
      ada: true,
      tanggal: jatuhTempoPada,
      teks,
      hitung: HITUNG_HARI_INI,
      nada: "segera",
      mencolok: true,
      aksesibilitas: `Jatuh tempo ${teks} — hari ini.`,
    };
  }
  const segera = hari.sisaHari <= AMBANG_SEGERA_HARI;
  return {
    ada: true,
    tanggal: jatuhTempoPada,
    teks,
    hitung: `Sisa ${hari.sisaHari} hari`,
    nada: segera ? "segera" : "netral",
    mencolok: segera,
    aksesibilitas: `Jatuh tempo ${teks}, sisa ${hari.sisaHari} hari.`,
  };
}
