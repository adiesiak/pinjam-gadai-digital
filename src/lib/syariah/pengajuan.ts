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
import {
  nomorTujuanValid,
  rapikanNomorTujuan,
  type JenisBarangKatalog,
} from "./katalog";
import { MARGIN_MURABAHAH_MAX_PERSEN } from "./murabahah";

/** Tenor yang boleh diajukan — Rahn membutuhkan kelipatan 30 hari. */
export const TENOR_AKAD_OPTIONS = [30, 60, 90] as const;

export type TenorAkad = (typeof TENOR_AKAD_OPTIONS)[number];

/**
 * Margin Murabahah bawaan untuk SEMUA produk — barang fisik maupun pulsa/PPOB.
 *
 * Dipakai saat pengajuan dikirim dan menjadi angka awal di panel admin. Nilainya
 * batas atas rentang: petugas hanya bisa menurunkannya, jadi harga yang dilihat
 * peminjam tidak pernah lebih murah daripada harga akadnya.
 */
export const MARGIN_MURABAHAH_BAWAAN = MARGIN_MURABAHAH_MAX_PERSEN;

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
    return rencanaAkadSyariah(
      {
        jenis: "murabahah",
        pokok: permintaan.pokok,
        marginPersen: permintaan.marginPersen ?? MARGIN_MURABAHAH_BAWAAN,
        tenorHari: permintaan.tenorHari,
      },
    );
  }

  if (permintaan.jenis === "rahn") {
    if (
      permintaan.nilaiTaksiran === undefined ||
      !Number.isSafeInteger(permintaan.nilaiTaksiran) ||
      permintaan.nilaiTaksiran <= 0
    ) {
      throw new Error("Nilai taksiran barang jaminan wajib diisi.");
    }
    return rencanaAkadSyariah(
      {
        jenis: "rahn",
        pokok: permintaan.pokok,
        nilaiTaksiran: permintaan.nilaiTaksiran,
        tenorHari: permintaan.tenorHari,
      },
    );
  }

  return rencanaAkadSyariah(
    {
      jenis: "qardh",
      pokok: permintaan.pokok,
      tenorHari: permintaan.tenorHari,
    },
  );
}

/** Barang katalog yang dipilih peminjam — cukup untuk menyusun pengajuan. */
export type BarangPengajuanSyariah = {
  kode: string;
  nama: string;
  jenisBarang: JenisBarangKatalog;
  harga: number;
};

/** Argumen `syariahPengajuan.ajukan` yang disusun formulir. */
export type PermintaanAjukanSyariah = PermintaanPengajuanSyariah & {
  tujuan: string;
  namaBarang?: string;
  katalogId?: string;
  nomorTujuan?: string;
};

/**
 * Susun satu pengajuan dari isian formulir.
 *
 * Satu tempat untuk aturan "barang katalog mengunci harga dan nama": bila
 * peminjam memilih barang, nominal akad adalah harga katalog dan nama yang
 * dikirim adalah nama katalog — bukan yang mungkin masih tertinggal di kolom
 * manual. Nomor tujuan hanya ikut untuk produk digital, dan hanya angkanya.
 *
 * Melempar pesan Indonesia bila nomor tujuan digital tidak memenuhi syarat,
 * supaya formulir berhenti sebelum memanggil server.
 */
export function susunPermintaanAjukanSyariah({
  jenis,
  pokok,
  tenorHari,
  tujuan,
  namaBarang,
  nilaiTaksiran,
  katalog = null,
  nomorTujuan = "",
}: {
  jenis: JenisAkadSyariah;
  pokok: number;
  tenorHari: number;
  tujuan: string;
  namaBarang?: string;
  nilaiTaksiran?: number;
  katalog?: BarangPengajuanSyariah | null;
  nomorTujuan?: string;
}): PermintaanAjukanSyariah {
  const tujuanRapi = tujuan.trim();
  const namaRapi = namaBarang?.trim() ?? "";

  if (jenis === "murabahah" && katalog !== null) {
    const nomor = rapikanNomorTujuan(nomorTujuan);
    if (katalog.jenisBarang === "digital" && !nomorTujuanValid(nomor)) {
      throw new Error("Nomor tujuan pulsa/PPOB wajib diisi 6-20 angka.");
    }
    return {
      jenis,
      pokok: katalog.harga,
      tenorHari,
      tujuan: tujuanRapi,
      namaBarang: katalog.nama,
      katalogId: katalog.kode,
      ...(katalog.jenisBarang === "digital" ? { nomorTujuan: nomor } : {}),
    };
  }

  return {
    jenis,
    pokok,
    tenorHari,
    tujuan: tujuanRapi,
    ...(namaRapi === "" ? {} : { namaBarang: namaRapi }),
    ...(jenis === "rahn" && nilaiTaksiran !== undefined
      ? { nilaiTaksiran }
      : {}),
  };
}

/** Kalimat batas atas pengajuan, dipakai formulir dan pesan server. */
export function kalimatBatasSyariah(tersedia: number): string {
  return `Sisa plafon yang dapat diajukan untuk akad syariah ${formatRupiah(tersedia)}.`;
}
