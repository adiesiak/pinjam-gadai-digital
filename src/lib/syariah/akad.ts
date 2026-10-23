/**
 * Perencanaan akad syariah: satu tempat yang mengubah permintaan akad menjadi
 * angka yang dicatat dan jurnal yang ditulis.
 *
 * Mengapa dipisah dari Convex: seluruh rumus margin/ujrah dan bentuk jurnal di
 * sini MURNI, sehingga bisa diuji tanpa basis data, dan mutation di
 * `convex/syariahAkad.ts` tidak punya salinan rumus kedua yang bisa menyimpang.
 *
 * Aturan produk yang dijaga:
 *  - Murabahah: margin 15-20% dari harga pokok, dibagi 85% pendana / 15% platform.
 *  - Rahn: ujrah 2% dari nilai taksiran per 30 hari, dibagi 85:15.
 *  - Qardh: margin 0%, pokok kembali 100%.
 *  - Tiket doorprize: satu per kelipatan Rp1 juta penempatan, untuk SEMUA akad —
 *    aturannya sama dengan penempatan konvensional (`lib/doorprize`).
 * Semua angka rupiah bulat.
 */
import { tiketPendana } from "../doorprize";
import type { Rupiah } from "../money";
import { bagiHasilQardh } from "./qardh";
import {
  bagiHasilMurabahah,
  hargaJualMurabahah,
  MARGIN_MURABAHAH_MAX_PERSEN,
  MARGIN_MURABAHAH_MIN_PERSEN,
} from "./murabahah";
import { pastikanRupiah } from "./nisbah";
import { bagiHasilRahn, SIKLUS_UJRAH_RAHN_HARI } from "./rahn";

export type JenisAkadSyariah = "murabahah" | "rahn" | "qardh";

/** Batas nominal satu akad, sama dengan rentang penempatan dana. */
export const MIN_AKAD_SYARIAH = 100_000;
export const MAX_AKAD_SYARIAH = 500_000_000;

/**
 * Akun pendapatan platform dari ujrah/margin syariah.
 *
 * Dipisah dari `PLATFORM_SPREAD_MARGIN` (selisih bunga konvensional) supaya
 * laporan margin tidak mencampur dua sumber pendapatan yang aturannya berbeda.
 */
export const AKUN_PLATFORM_UJRAH_SYARIAH = "PLATFORM_UJRAH_SYARIAH";

/** Nama akun ledger piutang satu akad syariah. */
export function akunAkadSyariah(id: string): string {
  return `syariah:AKAD:${id}`;
}

export type RencanaAkadSyariah = {
  jenis: JenisAkadSyariah;
  pokok: Rupiah;
  tenorHari: number;
  /** Total yang dibayar peminjam: harga jual / pokok + ujrah / pokok. */
  totalKewajiban: Rupiah;
  /** Pokok + bagian pendana dari margin/ujrah. */
  pendanaTerima: Rupiah;
  /** Bagian pendana dari margin/ujrah saja (bukan termasuk pokok). */
  nisbahPendana: Rupiah;
  nisbahPlatform: Rupiah;
  tiketDoorprize: number;
  /** Rincian Murabahah. */
  hargaJual: Rupiah | null;
  marginTotal: Rupiah;
  /** Rincian Rahn. */
  nilaiTaksiran: Rupiah | null;
  ujrahPerSiklus: Rupiah | null;
  jumlahSiklus: number | null;
};

export type PermintaanAkadSyariah =
  | {
      jenis: "murabahah";
      pokok: number;
      marginPersen: number;
      tenorHari?: number;
    }
  | {
      jenis: "rahn";
      pokok: number;
      nilaiTaksiran: number;
      tenorHari?: number;
    }
  | { jenis: "qardh"; pokok: number; tenorHari?: number };

/** Tenor bawaan bila pemanggil tidak menyebutkannya. */
export const TENOR_AKAD_BAWAAN_HARI = 30;

function validasiNominal(pokok: number): void {
  pastikanRupiah(pokok, "Pokok akad");
  if (pokok < MIN_AKAD_SYARIAH || pokok > MAX_AKAD_SYARIAH) {
    throw new Error(
      `Pokok akad harus antara Rp${MIN_AKAD_SYARIAH.toLocaleString("id-ID")} dan Rp${MAX_AKAD_SYARIAH.toLocaleString("id-ID")}: ${pokok}`,
    );
  }
}

function validasiTenor(tenor: number, kelipatan30: boolean): void {
  if (!Number.isSafeInteger(tenor) || tenor <= 0 || tenor > 360) {
    throw new Error(`Tenor akad harus jumlah hari bulat 1-360: ${tenor}`);
  }
  if (kelipatan30 && tenor % SIKLUS_UJRAH_RAHN_HARI !== 0) {
    throw new Error(
      `Tenor Rahn harus kelipatan ${SIKLUS_UJRAH_RAHN_HARI} hari: ${tenor}`,
    );
  }
}

/**
 * Hitung satu akad syariah. Melempar pesan Indonesia bila nominal, tenor, atau
 * nilai taksiran tidak memenuhi aturan produk.
 */
export function rencanaAkadSyariah(
  permintaan: PermintaanAkadSyariah,
): RencanaAkadSyariah {
  validasiNominal(permintaan.pokok);
  const tenorHari = permintaan.tenorHari ?? TENOR_AKAD_BAWAAN_HARI;
  validasiTenor(tenorHari, permintaan.jenis === "rahn");

  if (permintaan.jenis === "murabahah") {
    const marginPersen = permintaan.marginPersen;
    if (
      !Number.isFinite(marginPersen) ||
      marginPersen < MARGIN_MURABAHAH_MIN_PERSEN ||
      marginPersen > MARGIN_MURABAHAH_MAX_PERSEN
    ) {
      throw new Error(
        `Margin Murabahah harus ${MARGIN_MURABAHAH_MIN_PERSEN}-${MARGIN_MURABAHAH_MAX_PERSEN} persen: ${marginPersen}`,
      );
    }
    const hargaJual = hargaJualMurabahah(permintaan.pokok, marginPersen);
    const bagi = bagiHasilMurabahah({
      hargaPokok: permintaan.pokok,
      hargaJual,
    });
    return {
      jenis: "murabahah",
      pokok: bagi.hargaPokok,
      tenorHari,
      totalKewajiban: bagi.hargaJual,
      pendanaTerima: bagi.pendanaTerima,
      nisbahPendana: bagi.nisbahPendana,
      nisbahPlatform: bagi.nisbahPlatform,
      tiketDoorprize: tiketPendana(bagi.hargaPokok),
      hargaJual: bagi.hargaJual,
      marginTotal: bagi.marginTotal,
      nilaiTaksiran: null,
      ujrahPerSiklus: null,
      jumlahSiklus: null,
    };
  }

  if (permintaan.jenis === "rahn") {
    const bagi = bagiHasilRahn({
      nilaiTaksiran: permintaan.nilaiTaksiran,
      pokokGadai: permintaan.pokok,
      tenorHari,
    });
    return {
      jenis: "rahn",
      pokok: bagi.pokokGadai,
      tenorHari,
      totalKewajiban: bagi.totalKewajiban,
      pendanaTerima: bagi.pendanaTerima,
      nisbahPendana: bagi.nisbahPendana,
      nisbahPlatform: bagi.nisbahPlatform,
      tiketDoorprize: tiketPendana(bagi.pokokGadai),
      hargaJual: null,
      marginTotal: bagi.ujrahTotal,
      nilaiTaksiran: bagi.nilaiTaksiran,
      ujrahPerSiklus: bagi.ujrahPerSiklus,
      jumlahSiklus: bagi.jumlahSiklus,
    };
  }

  const bagi = bagiHasilQardh(permintaan.pokok);
  return {
    jenis: "qardh",
    pokok: bagi.pokok,
    tenorHari,
    totalKewajiban: bagi.pokok,
    pendanaTerima: bagi.pendanaTerima,
    nisbahPendana: 0,
    nisbahPlatform: 0,
    tiketDoorprize: bagi.tiketDoorprize,
    hargaJual: null,
    marginTotal: 0,
    nilaiTaksiran: null,
    ujrahPerSiklus: null,
    jumlahSiklus: null,
  };
}

export type BarisJurnal = {
  akun: string;
  arah: "debit" | "kredit";
  jumlah: Rupiah;
};

export type JurnalAkad = {
  jenis: "disbursement" | "repayment" | "payout" | "platform_fee";
  keterangan: string;
  lines: BarisJurnal[];
};

/**
 * Jurnal penempatan: dana pindah dari dompet pendana ke piutang akad.
 * Pengirim akun dompet diberikan pemanggil supaya modul ini tetap murni.
 */
export function jurnalPenempatanSyariah({
  akadId,
  akunDompet,
  pokok,
  referensi,
}: {
  akadId: string;
  akunDompet: string;
  pokok: Rupiah;
  referensi: string;
}): JurnalAkad {
  pastikanRupiah(pokok, "Pokok penempatan");
  if (pokok <= 0) throw new Error("Pokok penempatan harus lebih dari nol.");
  return {
    jenis: "disbursement",
    keterangan: `Penempatan dana akad syariah ${referensi}`,
    lines: [
      { akun: akunAkadSyariah(akadId), arah: "debit", jumlah: pokok },
      { akun: akunDompet, arah: "kredit", jumlah: pokok },
    ],
  };
}

/**
 * Jurnal saat akad selesai: peminjam membayar, lalu hasilnya dibagikan.
 *
 * Dua jurnal, bukan satu jurnal bercampur: penerimaan uang dari peminjam dan
 * pembagian hasil ke pendana/platform adalah dua peristiwa yang perlu terbaca
 * sendiri-sendiri di audit. Masing-masing tetap seimbang. Arah akunnya sama
 * dengan jalur pinjaman konvensional: uang masuk dompet = debit, dan akun akad
 * menjadi akun lawan yang dikredit.
 */
export function jurnalPelunasanSyariah({
  akadId,
  akunDompet,
  rencana,
  referensi,
}: {
  akadId: string;
  akunDompet: string;
  rencana: RencanaAkadSyariah;
  referensi: string;
}): JurnalAkad[] {
  const akad = akunAkadSyariah(akadId);
  return [
    {
      jenis: "repayment",
      keterangan: `Pelunasan akad syariah ${referensi} (${rencana.jenis})`,
      lines: [
        {
          akun: "platform:CASH",
          arah: "debit",
          jumlah: rencana.totalKewajiban,
        },
        { akun: akad, arah: "kredit", jumlah: rencana.totalKewajiban },
      ],
    },
    {
      jenis: "payout",
      keterangan:
        rencana.nisbahPlatform > 0
          ? `Pembagian hasil akad ${referensi}: pendana ${rencana.pendanaTerima}, ujrah platform ${rencana.nisbahPlatform}`
          : `Pengembalian pokok akad ${referensi} ke pendana`,
      lines: [
        { akun: akunDompet, arah: "debit", jumlah: rencana.pendanaTerima },
        ...(rencana.nisbahPlatform > 0
          ? [
              {
                akun: AKUN_PLATFORM_UJRAH_SYARIAH,
                arah: "debit" as const,
                jumlah: rencana.nisbahPlatform,
              },
            ]
          : []),
        { akun: akad, arah: "kredit", jumlah: rencana.totalKewajiban },
      ],
    },
  ];
}

/** Jurnal pembatalan: piutang akad dikembalikan utuh ke dompet pendana. */
export function jurnalPembatalanSyariah({
  akadId,
  akunDompet,
  pokok,
  referensi,
}: {
  akadId: string;
  akunDompet: string;
  pokok: Rupiah;
  referensi: string;
}): JurnalAkad {
  pastikanRupiah(pokok, "Pokok pembatalan");
  if (pokok <= 0) throw new Error("Pokok pembatalan harus lebih dari nol.");
  return {
    jenis: "payout",
    keterangan: `Pembatalan akad syariah ${referensi}`,
    lines: [
      { akun: akunDompet, arah: "debit", jumlah: pokok },
      { akun: akunAkadSyariah(akadId), arah: "kredit", jumlah: pokok },
    ],
  };
}

/** Total debit dan kredit satu jurnal — dipakai uji keseimbangan. */
export function saldoJurnal(jurnal: JurnalAkad): {
  debit: number;
  kredit: number;
  seimbang: boolean;
} {
  let debit = 0;
  let kredit = 0;
  for (const baris of jurnal.lines) {
    if (baris.arah === "debit") debit += baris.jumlah;
    else kredit += baris.jumlah;
  }
  return { debit, kredit, seimbang: debit === kredit };
}
