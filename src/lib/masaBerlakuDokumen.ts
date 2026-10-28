/**
 * Masa berlaku dokumen underwriting PINDAI.
 *
 * Kenapa dokumen perlu umur: syarat pinjaman menyebut "slip gaji 3 bulan
 * terakhir" dan "bukti domisili", tetapi tanpa batas waktu dokumen yang
 * diunggah setahun lalu tetap lolos di pengajuan berikutnya. KTP, selfie, KK,
 * bukti domisili, dan bukti penghasilan karena itu punya jendela berlaku
 * masing-masing, dihitung dari waktu berkas benar-benar masuk ke penyimpanan
 * (bukan dari tanggal yang diketik klien).
 *
 * Aturannya satu tempat supaya form, server, dan pesan galat tidak pernah
 * berbeda pendapat:
 *  - KTP: 10 tahun. KTP berlaku seumur hidup, tetapi foto untuk verifikasi
 *    perlu diperbarui ketika kondisi kartunya sudah terlalu lama.
 *  - Selfie dengan KTP: 1 tahun — wajah dan kartu harus masih mewakili keadaan
 *    sekarang.
 *  - Kartu Keluarga: 1 tahun, karena susunan anggota keluarga bisa berubah.
 *  - Bukti domisili: 90 hari, mengikuti tagihan listrik/air yang biasanya
 *    diterbitkan bulanan.
 *  - Bukti penghasilan: 90 hari, sesuai syarat "slip gaji 3 bulan terakhir".
 *
 * Yang TIDAK dilakukan berkas ini: menilai keaslian dokumen. Ia hanya menjawab
 * "dokumen ini masih dalam jendela berlaku atau tidak".
 */
import { formatTanggalWIB } from "./waktu";

const MS_HARI = 86_400_000;

export type JenisDokumen =
  | "ktp"
  | "selfie"
  | "kartuKeluarga"
  | "buktiDomisili"
  | "buktiPenghasilan";

type AturanDokumen = {
  /** Label yang tampil di formulir dan pesan galat. */
  label: string;
  /** Jendela berlaku dalam hari. */
  hari: number;
};

export const ATURAN_MASA_BERLAKU: Readonly<Record<JenisDokumen, AturanDokumen>> = {
  ktp: { label: "Foto KTP", hari: 3_650 },
  selfie: { label: "Selfie dengan KTP", hari: 365 },
  kartuKeluarga: { label: "Kartu Keluarga", hari: 365 },
  buktiDomisili: { label: "Bukti domisili", hari: 90 },
  buktiPenghasilan: { label: "Slip gaji / bukti penghasilan", hari: 90 },
};

/** Label satu jenis dokumen, untuk pesan dan daftar periksa. */
export function labelDokumen(jenis: JenisDokumen): string {
  return ATURAN_MASA_BERLAKU[jenis].label;
}

/**
 * Waktu kedaluwarsa satu dokumen.
 *
 * Melempar untuk waktu unggah yang tidak masuk akal: dokumen tanpa asal waktu
 * yang jelas tidak boleh dianggap berlaku selamanya.
 */
export function kedaluwarsaPada(jenis: JenisDokumen, diunggahPada: number): number {
  if (!Number.isFinite(diunggahPada) || diunggahPada <= 0) {
    throw new Error(`Waktu unggah dokumen ${labelDokumen(jenis)} tidak valid.`);
  }
  return diunggahPada + ATURAN_MASA_BERLAKU[jenis].hari * MS_HARI;
}

export type StatusMasaBerlaku = {
  /** Waktu dokumen berhenti berlaku (epoch ms). */
  berlakuSampai: number;
  /** Hari tersisa; 0 atau negatif berarti sudah lewat. */
  sisaHari: number;
  kedaluwarsa: boolean;
};

/** Status satu dokumen pada waktu tertentu. */
export function statusMasaBerlaku(
  jenis: JenisDokumen,
  diunggahPada: number,
  sekarang: number = Date.now(),
): StatusMasaBerlaku {
  const berlakuSampai = kedaluwarsaPada(jenis, diunggahPada);
  const sisaHari = Math.ceil((berlakuSampai - sekarang) / MS_HARI);
  return { berlakuSampai, sisaHari, kedaluwarsa: sisaHari <= 0 };
}

export type DokumenKedaluwarsa = {
  jenis: JenisDokumen;
  label: string;
  berlakuSampai: number;
  /** Berapa hari sudah lewat; minimal 1. */
  lewatHari: number;
};

/**
 * Saring dokumen yang sudah lewat masa berlaku.
 *
 * `diunggahPada` null dilewati: berkas yang tidak ada bukan "kedaluwarsa",
 * melainkan belum diunggah, dan itu diperiksa di tempat lain.
 */
export function dokumenKedaluwarsa(
  daftar: ReadonlyArray<{ jenis: JenisDokumen; diunggahPada: number | null }>,
  sekarang: number = Date.now(),
): DokumenKedaluwarsa[] {
  const hasil: DokumenKedaluwarsa[] = [];
  for (const item of daftar) {
    if (item.diunggahPada === null) continue;
    const status = statusMasaBerlaku(item.jenis, item.diunggahPada, sekarang);
    if (!status.kedaluwarsa) continue;
    hasil.push({
      jenis: item.jenis,
      label: labelDokumen(item.jenis),
      berlakuSampai: status.berlakuSampai,
      lewatHari: Math.max(1, -status.sisaHari),
    });
  }
  return hasil;
}

/**
 * Kalimat siap tampil untuk dokumen yang sudah lewat masa berlaku, atau `null`
 * bila semuanya masih berlaku. Dipakai FORM dan SERVER supaya pesannya sama.
 */
export function pesanMasaBerlaku(
  daftar: ReadonlyArray<DokumenKedaluwarsa>,
): string | null {
  if (daftar.length === 0) return null;
  const rincian = daftar
    .map((d) => `${d.label} (berlaku sampai ${formatTanggalWIB(d.berlakuSampai)})`)
    .join(", ");
  return `Dokumen berikut sudah lewat masa berlaku: ${rincian}. Unggah ulang di halaman Verifikasi KYC sebelum mengajukan pinjaman baru.`;
}
