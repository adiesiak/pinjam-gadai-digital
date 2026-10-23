/**
 * Aturan pengajuan akad syariah — dipakai server, formulir peminjam, dan panel
 * admin. Satu sumber supaya tenor yang ditawarkan formulir sama dengan yang
 * diterima server, dan estimasi di layar memakai mesin yang sama dengan akad.
 *
 * Pengajuan BUKAN akad: yang disimpan di sini adalah permintaan beserta angka
 * rencananya. Margin Murabahah dan nilai taksiran Rahn masih bisa ditetapkan
 * ulang admin saat keputusan.
 */
import { formatRupiah } from "../money";
import {
  rencanaAkadSyariah,
  type JenisAkadSyariah,
  type RencanaAkadSyariah,
} from "./akad";

/** Tenor yang boleh diajukan — Rahn membutuhkan kelipatan 30 hari. */
export const TENOR_AKAD_OPTIONS = [30, 60, 90] as const;

export type TenorAkad = (typeof TENOR_AKAD_OPTIONS)[number];

/** Margin Murabahah yang dipakai sebagai estimasi sebelum admin menetapkan. */
export const MARGIN_MURABAHAH_BAWAAN = 15;

export type StatusPengajuanSyariah =
  | "diajukan"
  | "disetujui"
  | "ditolak"
  | "dibatalkan";

export const LABEL_JENIS_AKAD: Record<JenisAkadSyariah, string> = {
  murabahah: "Murabahah",
  rahn: "Rahn",
  qardh: "Qardh",
};

export const LABEL_STATUS_PENGAJUAN_SYARIAH: Record<
  StatusPengajuanSyariah,
  string
> = {
  diajukan: "Menunggu keputusan",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
  dibatalkan: "Dibatalkan",
};

export function apakahTenorAkad(nilai: number): nilai is TenorAkad {
  return (TENOR_AKAD_OPTIONS as readonly number[]).includes(nilai);
}

export type PermintaanPengajuanSyariah = {
  jenis: JenisAkadSyariah;
  pokok: number;
  tenorHari: number;
  /** Hanya Murabahah; kosong berarti memakai margin bawaan. */
  marginPersen?: number;
  /** Wajib Rahn; perkiraan peminjam atau taksiran final admin. */
  nilaiTaksiran?: number;
};

/**
 * Bangun rencana akad dari satu pengajuan.
 *
 * Melempar pesan Indonesia bila tenor di luar pilihan, nominal tidak sah, atau
 * Rahn tidak menyertakan taksiran. Pemanggil tidak boleh menulis angka akad
 * sendiri: seluruh margin, ujrah, dan nisbah berasal dari `rencanaAkadSyariah`.
 */
export function rencanaPengajuanSyariah(
  permintaan: PermintaanPengajuanSyariah,
): RencanaAkadSyariah {
  if (!apakahTenorAkad(permintaan.tenorHari)) {
    throw new Error(
      `Tenor akad harus ${TENOR_AKAD_OPTIONS.join(" / ")} hari.`,
    );
  }

  if (permintaan.jenis === "murabahah") {
    return rencanaAkadSyariah({
      jenis: "murabahah",
      pokok: permintaan.pokok,
      marginPersen: permintaan.marginPersen ?? MARGIN_MURABAHAH_BAWAAN,
      tenorHari: permintaan.tenorHari,
    });
  }

  if (permintaan.jenis === "rahn") {
    if (
      permintaan.nilaiTaksiran === undefined ||
      !Number.isSafeInteger(permintaan.nilaiTaksiran) ||
      permintaan.nilaiTaksiran <= 0
    ) {
      throw new Error("Nilai taksiran barang jaminan wajib diisi.");
    }
    return rencanaAkadSyariah({
      jenis: "rahn",
      pokok: permintaan.pokok,
      nilaiTaksiran: permintaan.nilaiTaksiran,
      tenorHari: permintaan.tenorHari,
    });
  }

  return rencanaAkadSyariah({
    jenis: "qardh",
    pokok: permintaan.pokok,
    tenorHari: permintaan.tenorHari,
  });
}

/** Kalimat batas atas pengajuan, dipakai formulir dan pesan server. */
export function kalimatBatasSyariah(tersedia: number): string {
  return `Sisa plafon yang dapat diajukan untuk akad syariah ${formatRupiah(tersedia)}.`;
}
