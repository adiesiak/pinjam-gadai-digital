/**
 * Proposal pendanaan & kemitraan strategis PINDAI: dokumen PDF yang diunduh
 * dari halaman proposal di ruang pendana, tanpa menunggu admin.
 *
 * Kenapa dokumennya disusun dari fungsi murni: halaman, unduhan, dan uji harus
 * memakai angka yang sama. Semua nominal di sini dihitung oleh
 * `lib/imbalPendana` dan `lib/bagiHasil`, modul yang juga dipakai server saat
 * mencatat hak pendana. Tidak ada persentase yang disalin ke teks: siklus,
 * Imbal Hasil, dan porsi platform dibaca dari konstanta atau dari Pengaturan
 * Sistem yang berlaku saat tombol unduh ditekan.
 *
 * Bentuk dokumennya meniru lembar penawaran: satu sampul dengan tiga angka
 * kunci, lalu halaman isi yang mengikuti cara calon pendana membaca. Skema dan
 * angkanya lebih dulu, pasar dan risikonya setelah itu, dan kontak di halaman
 * terakhir. Bagian risiko dicetak terbuka sebelum kontak, karena dokumen yang
 * hanya menjual angka tidak layak dipakai sebagai bahan pertimbangan.
 */
import {
  PERSEN_IMBAL_PENDANA,
  TENOR_PENDANA_HARI,
  bagiHasilPendana,
} from "./imbalPendana";
import { hitungSimulasiBulanan } from "./bulanan";
import {
  GADAI_PRICING,
  bagiSewaModalGadai,
  quoteGadai,
} from "./gadai";
import { KREDIT_ASUMSI_AWAL, quoteKreditBarang } from "./kredit";
import { rencanaAkadSyariah } from "./syariah/akad";
import {
  PERSEN_PORSI_PLATFORM,
  bagiMargin,
  minimumPokokTenor,
} from "./kebijakanPinjaman";
import { formatRupiahAman } from "./money";
import { CS_WHATSAPP } from "./kontak";
import type { BarisPdf, DokumenPdf } from "./pdfSederhana";

/** Kop dan kaki dokumen, sama dengan laporan lain yang keluar dari PINDAI. */
const NAMA_LAYANAN = "PINJAM GADAI DIGITAL (PINDAI)";
const KAKI_DOKUMEN = "PINDAI - proposal pendanaan dan kemitraan strategis";

/**
 * Awal hari pembaruan isi proposal (tabel produk konvensional dan syariah).
 *
 * Berkas PDF yang dipasang admin sebelum tanggal ini tidak memuat tabel
 * terbaru. Halaman memakai dokumen yang disusun ulang sampai admin mengganti
 * berkasnya, supaya unduhan tidak diam-diam kembali ke versi lama. Naikkan
 * tanggal ini setiap isi proposal berubah.
 */
export const PROPOSAL_DIPERBARUI_PADA = Date.UTC(2026, 9, 26);

/** Nominal yang diuraikan baris demi baris sebagai contoh utama. */
export const NOMINAL_CONTOH_PROPOSAL = 10_000_000;

/**
 * Nominal simulasi, kelipatan Rp 5 juta dari Rp 5 juta sampai Rp 50 juta.
 * Rentangnya mengikuti tiket pendanaan yang dibahas di halaman, bukan batas
 * pinjaman peminjam.
 */
export const NOMINAL_SIMULASI_PROPOSAL = [
  5_000_000, 10_000_000, 15_000_000, 20_000_000, 25_000_000, 30_000_000,
  35_000_000, 40_000_000, 45_000_000, 50_000_000,
] as const;

/** Tenor pinjaman bulanan yang dijelaskan di proposal. */
export const TENOR_BULANAN_PROPOSAL = [1, 3, 6, 9, 12] as const;

/** Pokok contoh untuk tabel keuntungan pinjaman bulanan (rupiah). */
export const POKOK_CONTOH_BULANAN = 10_000_000;

/** Satu baris tabel keuntungan pinjaman bulanan untuk pendana. */
export type BarisKeuntunganBulanan = {
  tenor: number;
  /** Marjin pinjaman sepanjang tenor (dasar pembagian 47 : 13). */
  margin: number;
  /** Hak bersih pendana (47/60 marjin). */
  pendana: number;
  /** Porsi platform (13/60 marjin); biaya layanan & admin di luar ini. */
  platform: number;
  /** Hak pendana dibagi jumlah bulan, untuk membandingkan tenor. */
  perBulan: number;
};

/**
 * Keuntungan pendana untuk pinjaman bulanan 1/3/6/9/12 bulan.
 *
 * Angkanya dihitung mesin yang sama dengan server mencatat hak pendana
 * (`bagiHasilPendana` dengan `tenorBulan`), bukan tabel persen terpisah yang
 * bisa basi. Marjin tiap tenor berasal dari `lib/bulanan`; pembagian 47 : 13
 * diterapkan pada marjin penuh tenor itu.
 */
export function keuntunganBulananProposal(
  pokok: number = POKOK_CONTOH_BULANAN,
): BarisKeuntunganBulanan[] {
  return TENOR_BULANAN_PROPOSAL.map((tenor) => {
    const bagi = bagiHasilPendana(pokok, {
      pokokPinjaman: pokok,
      tenorBulan: tenor,
    });
    return {
      tenor,
      margin: bagi.imbal,
      pendana: bagi.keuntungan,
      platform: bagi.potonganAdmin,
      perBulan: Math.round(bagi.keuntungan / tenor),
    };
  });
}

/** Nominal simulasi pinjaman bulanan: Rp 1 juta sampai Rp 10 juta. */
export const NOMINAL_BULANAN_PROPOSAL = [
  1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000, 7_000_000,
  8_000_000, 9_000_000, 10_000_000,
] as const;

/** Satu baris simulasi bulanan: hak pendana untuk tiap tenor pada satu pokok. */
export type BarisSimulasiBulanan = {
  pokok: number;
  /** Hak pendana per tenor; `null` bila tenor belum tersedia untuk pokok itu. */
  pendana: Record<number, number | null>;
};

/**
 * Simulasi hak pendana pinjaman bulanan Rp 1 juta sampai Rp 10 juta.
 *
 * Sel dihitung mesin yang sama dengan kontrak (`bagiHasilPendana` dengan
 * `tenorBulan`). Tenor 3 bulan ke atas mensyaratkan pokok minimal
 * Rp 3.000.000, jadi sel untuk pokok di bawah itu dikosongkan (`null`) dan
 * dicetak sebagai tanda hubung, bukan angka yang tidak bisa dicapai nasabah.
 */
export function simulasiBulananProposal(): BarisSimulasiBulanan[] {
  return NOMINAL_BULANAN_PROPOSAL.map((pokok) => {
    const pendana: Record<number, number | null> = {};
    for (const tenor of TENOR_BULANAN_PROPOSAL) {
      pendana[tenor] =
        pokok < minimumPokokTenor(tenor)
          ? null
          : bagiHasilPendana(pokok, { pokokPinjaman: pokok, tenorBulan: tenor })
              .keuntungan;
    }
    return { pokok, pendana };
  });
}

/** Pokok contoh tabel produk konvensional; sama dengan tabel syariah. */
export const POKOK_CONTOH_KONVENSIONAL = 10_000_000;

/** Nominal simulasi produk konvensional: Rp 1 juta sampai Rp 10 juta. */
export const NOMINAL_KONVENSIONAL_PROPOSAL = [
  1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000, 7_000_000,
  8_000_000, 9_000_000, 10_000_000,
] as const;

/** Uang muka contoh kredit barang, dalam persen dari harga barang. */
export const DP_CONTOH_KREDIT_PERSEN = KREDIT_ASUMSI_AWAL.dpPersen;

/** Tenor contoh kredit barang, dalam bulan. */
export const TENOR_CONTOH_KREDIT_BULAN = 3;

/** Satu produk konvensional dan pembagian marjinnya. */
export type BarisProdukKonvensional = {
  produk: string;
  /** Dasar marjin yang dipakai produk itu. */
  dasar: string;
  /** Marjin total yang dibayar peminjam. */
  margin: number;
  /** Porsi pendana (47/60 marjin). */
  pendana: number;
  /** Porsi platform (13/60 marjin). */
  platform: number;
  /** Pokok + porsi pendana. */
  diterima: number;
};

/**
 * Harga barang yang menyisakan pokok dibiayai sebesar `pokok` setelah DP.
 * Dipakai agar tabel kredit bisa memakai pokok yang sama dengan produk lain.
 */
function hargaBarangDariPokok(pokok: number, dpPersen: number): number {
  if (!Number.isSafeInteger(pokok) || pokok <= 0) {
    throw new Error(`Pokok kredit harus rupiah bulat positif: ${pokok}`);
  }
  if (!Number.isFinite(dpPersen) || dpPersen <= 0 || dpPersen >= 100) {
    throw new Error(`DP kredit harus di antara 0-100 persen: ${dpPersen}`);
  }
  return Math.round((pokok * 100) / (100 - dpPersen));
}

/**
 * Pembagian marjin satu kredit barang yang seluruh pokoknya didanai pendana.
 * DP dihitung dari harga barang, sedangkan dasar pembagian hanya pokok yang
 * benar-benar dibiayai; biaya admin 2% tetap pos terpisah milik platform.
 */
function kreditKonvensional(pokok: number): {
  margin: number;
  pendana: number;
  platform: number;
  marginPerBulan: number;
} {
  const quote = quoteKreditBarang({
    hargaBarang: hargaBarangDariPokok(pokok, DP_CONTOH_KREDIT_PERSEN),
    dpPersen: DP_CONTOH_KREDIT_PERSEN,
    tenorBulan: TENOR_CONTOH_KREDIT_BULAN,
    marginPersenPerBulan: KREDIT_ASUMSI_AWAL.marginPersenPerBulan,
    porsiDanaPersen: 100,
  });
  // Nominal contoh dipilih supaya DP bulat dan pokok yang didanai tetap persis
  // sebesar baris tabel; selisih sekecil apa pun berarti harga barangnya salah.
  if (quote.pokokDibiayai !== pokok) {
    throw new Error(
      `Pokok kredit tidak sesuai: ${quote.pokokDibiayai} vs ${pokok}`,
    );
  }
  const bagi = bagiMargin(quote.marginTotal);
  return {
    margin: quote.marginTotal,
    pendana: bagi.pendana,
    platform: bagi.platform,
    marginPerBulan:
      Math.round((quote.marginPerBulan / quote.pokokDibiayai) * 10000) / 100,
  };
}

/**
 * Pembagian tiga produk konvensional pada pokok contoh Rp 10.000.000.
 *
 * Harian memakai skema acuan 30% flat; gadai memakai batas atas sewa modal
 * 10% per 30 hari; kredit barang memakai tenor 3 bulan dengan DP 20%. Angka
 * marjin dibaca dari mesin produk masing-masing (bukan persen yang ditulis di
 * sini), lalu dibagi 47 : 13 dengan fungsi kebijakan yang sama dengan server.
 */
export function pembagianKonvensionalProposal(): BarisProdukKonvensional[] {
  const harian = bagiHasilPendana(POKOK_CONTOH_KONVENSIONAL);
  const gadaiQuote = quoteGadai(
    POKOK_CONTOH_KONVENSIONAL,
    GADAI_PRICING.sewaModalMaxPercent,
  );
  const gadai = bagiSewaModalGadai(gadaiQuote.sewaModalPeriode);
  const kredit = kreditKonvensional(POKOK_CONTOH_KONVENSIONAL);
  return [
    {
      produk: "Pinjaman harian",
      dasar: `Bunga ${formatPersen(PERSEN_IMBAL_PENDANA)} / siklus`,
      margin: harian.imbal,
      pendana: harian.keuntungan,
      platform: harian.potonganAdmin,
      diterima: harian.diterima,
    },
    {
      produk: "Gadai",
      dasar: `Sewa ${formatPersen(GADAI_PRICING.sewaModalMaxPercent)} / 30 hari`,
      margin: gadaiQuote.sewaModalPeriode,
      pendana: gadai.pendana,
      platform: gadai.platform,
      diterima: POKOK_CONTOH_KONVENSIONAL + gadai.pendana,
    },
    {
      produk: "Kredit barang",
      dasar: `Bunga ${formatPersen(kredit.marginPerBulan)}/bln, ${TENOR_CONTOH_KREDIT_BULAN} bln`,
      margin: kredit.margin,
      pendana: kredit.pendana,
      platform: kredit.platform,
      diterima: POKOK_CONTOH_KONVENSIONAL + kredit.pendana,
    },
  ];
}

/** Satu baris simulasi konvensional: hak pendana tiap produk pada satu pokok. */
export type BarisSimulasiKonvensional = {
  pokok: number;
  harian: number;
  gadai: number;
  kredit: number;
};

/**
 * Simulasi hak pendana produk konvensional Rp 1 juta sampai Rp 10 juta.
 *
 * Kolom harian memakai satu siklus acuan 30 hari, gadai memakai sewa 10% satu
 * periode, dan kredit memakai tenor 3 bulan dengan DP 20% dari harga barang.
 * Sel kredit adalah hak pendana atas pokok yang dibiayai, bukan atas harga
 * barang; DP dibayar konsumen langsung ke merchant.
 */
export function simulasiKonvensionalProposal(): BarisSimulasiKonvensional[] {
  return NOMINAL_KONVENSIONAL_PROPOSAL.map((pokok) => {
    const gadai = bagiSewaModalGadai(
      quoteGadai(pokok, GADAI_PRICING.sewaModalMaxPercent).sewaModalPeriode,
    );
    return {
      pokok,
      harian: bagiHasilPendana(pokok).keuntungan,
      gadai: gadai.pendana,
      kredit: kreditKonvensional(pokok).pendana,
    };
  });
}

/** Bunga pinjaman bulanan per tenor, dalam persen. */
export type TarifTenorBulanan = {
  tenor: number;
  /** Bunga per bulan yang dipakai mesin kontrak (mis. 20 untuk tenor 3 bulan). */
  perBulan: number;
  /** Marjin total sepanjang tenor (mis. 60 untuk tenor 3 bulan). */
  total: number;
};

/**
 * Bunga tiap tenor bulanan, dibaca dari mesin simulasi yang sama dengan
 * kontrak. `perBulan` berasal dari `hitungSimulasiBulanan` (tarif yang benar
 * benar dipakai menghitung cicilan), sedangkan `total` dihitung dari marjin
 * penuh tenor pada pokok contoh supaya tidak ada persen yang ditulis dua kali.
 */
export function tarifBulananProposal(): TarifTenorBulanan[] {
  return TENOR_BULANAN_PROPOSAL.map((tenor) => {
    const simulasi = hitungSimulasiBulanan(POKOK_CONTOH_BULANAN, tenor);
    const margin = bagiHasilPendana(POKOK_CONTOH_BULANAN, {
      pokokPinjaman: POKOK_CONTOH_BULANAN,
      tenorBulan: tenor,
    }).imbal;
    return {
      tenor,
      perBulan: simulasi.persenBungaPerBulan,
      total: Math.round((margin / POKOK_CONTOH_BULANAN) * 10000) / 100,
    };
  });
}

/** Pokok contoh untuk tabel pembagian akad syariah. */
export const POKOK_CONTOH_SYARIAH = 10_000_000;

/** Nominal simulasi akad syariah: Rp 1 juta sampai Rp 10 juta. */
export const NOMINAL_SYARIAH_PROPOSAL = [
  1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000, 7_000_000,
  8_000_000, 9_000_000, 10_000_000,
] as const;

/** Satu akad syariah dan pembagian margin/ujrahnya. */
export type BarisAkadSyariah = {
  akad: string;
  /** Dasar margin/ujrah yang dipakai akad itu. */
  dasar: string;
  /** Margin atau ujrah total. */
  margin: number;
  /** Porsi pendana (47/60). */
  pendana: number;
  /** Porsi platform (13/60). */
  platform: number;
  /** Pokok + porsi pendana. */
  diterima: number;
};

/**
 * Pembagian tiga akad syariah pada pokok contoh Rp 10.000.000.
 *
 * Angkanya dihitung `rencanaAkadSyariah`, fungsi yang juga dipakai server saat
 * mencatat akad, jadi tabel ini tidak bisa berbeda dari kontrak. Murabahah
 * memakai batas atas margin (20%) supaya pembaca melihat hasil maksimum;
 * Rahn memakai satu siklus 30 hari; Qardh memang tanpa margin.
 */
export function pembagianSyariahProposal(): BarisAkadSyariah[] {
  const murabahah = rencanaAkadSyariah({
    jenis: "murabahah",
    pokok: POKOK_CONTOH_SYARIAH,
    marginPersen: 20,
    tenorHari: 30,
  });
  const rahn = rencanaAkadSyariah({
    jenis: "rahn",
    pokok: POKOK_CONTOH_SYARIAH,
    nilaiTaksiran: POKOK_CONTOH_SYARIAH,
    tenorHari: 30,
  });
  const qardh = rencanaAkadSyariah({
    jenis: "qardh",
    pokok: POKOK_CONTOH_SYARIAH,
    tenorHari: 30,
  });
  return [
    {
      akad: "Murabahah",
      dasar: "Margin 15-20%",
      margin: murabahah.marginTotal,
      pendana: murabahah.nisbahPendana,
      platform: murabahah.nisbahPlatform,
      diterima: murabahah.pendanaTerima,
    },
    {
      akad: "Rahn",
      dasar: "Ujrah 2% / 30 hari",
      margin: rahn.marginTotal,
      pendana: rahn.nisbahPendana,
      platform: rahn.nisbahPlatform,
      diterima: rahn.pendanaTerima,
    },
    {
      akad: "Qardh",
      dasar: "Tanpa margin",
      margin: 0,
      pendana: 0,
      platform: 0,
      diterima: qardh.pendanaTerima,
    },
  ];
}

/** Satu baris simulasi syariah: hak pendana untuk tiap akad pada satu pokok. */
export type BarisSimulasiSyariah = {
  pokok: number;
  murabahah15: number;
  murabahah20: number;
  rahn: number;
  qardh: number;
};

/**
 * Simulasi hak pendana akad syariah Rp 1 juta sampai Rp 10 juta.
 *
 * Murabahah ditampilkan pada batas bawah dan batas atas margin (15% dan 20%),
 * Rahn memakai satu siklus ujrah 30 hari, dan Qardh tidak memberi margin.
 * Semua sel adalah porsi pendana 47/60 dari margin/ujrah, tanpa pokok.
 */
export function simulasiSyariahProposal(): BarisSimulasiSyariah[] {
  return NOMINAL_SYARIAH_PROPOSAL.map((pokok) => ({
    pokok,
    murabahah15: rencanaAkadSyariah({
      jenis: "murabahah",
      pokok,
      marginPersen: 15,
      tenorHari: 30,
    }).nisbahPendana,
    murabahah20: rencanaAkadSyariah({
      jenis: "murabahah",
      pokok,
      marginPersen: 20,
      tenorHari: 30,
    }).nisbahPendana,
    rahn: rencanaAkadSyariah({
      jenis: "rahn",
      pokok,
      nilaiTaksiran: pokok,
      tenorHari: 30,
    }).nisbahPendana,
    qardh: 0,
  }));
}

export type DataProposalPendana = {
  /** Field lama proposal; porsi platform selalu 13/60 marjin dan tidak dibaca dari sini. */
  persenPotonganAdmin: number;
  /** Waktu dokumen disusun (epoch ms); dipakai di sampul dan nama berkas. */
  dibuatPada: number;
};

function rupiah(nilai: number): string {
  return formatRupiahAman(nilai);
}

/**
 * Persen dengan koma desimal bahasa Indonesia (2,5%), dipakai halaman dan
 * dokumen supaya keduanya menulis tarif dengan cara yang sama.
 */
export function formatPersen(nilai: number): string {
  const teks = Number.isInteger(nilai)
    ? String(nilai)
    : nilai.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  return `${teks}%`;
}

/** Tanggal panjang bahasa Indonesia pada zona waktu Jakarta. */
export function tanggalProposal(ms: number): string {
  return new Date(ms).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

/** Tanggal ISO untuk nama berkas, dihitung dari UTC seperti laporan lain. */
function tanggalIso(ms: number): string {
  const d = new Date(ms);
  const bulan = String(d.getUTCMonth() + 1).padStart(2, "0");
  const hari = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${bulan}-${hari}`;
}

/** Nama berkas unduhan, mis. `proposal-pendanaan-pindai-2026-10-22.pdf`. */
export function namaBerkasProposalPendana(dibuatPada: number): string {
  return `PINDAI-Proposal-Pendanaan-${tanggalIso(dibuatPada)}.pdf`;
}

/** Nomor WhatsApp layanan pelanggan dalam format yang enak dibaca. */
export function nomorLayananProposal(): string {
  const nasional = CS_WHATSAPP.startsWith("62")
    ? `0${CS_WHATSAPP.slice(2)}`
    : CS_WHATSAPP;
  const kelompok = nasional.match(/.{1,4}/g) ?? [nasional];
  return kelompok.join("-");
}

/**
 * Susun dokumen proposal.
 *
 * Sampul, lalu halaman isi lima bagian: ringkasan dan target 2027, potensi
 * pasar, skema dan simulasi, porsi platform dan risiko, lalu alur kemitraan
 * dan kontak. Pemisah halaman ditetapkan eksplisit di dua tempat supaya tabel
 * simulasi dan langkah kemitraan tidak terpotong di tengah.
 */
export function proposalPendanaanPindai(data: DataProposalPendana): DokumenPdf {
  // Porsi platform adalah kebijakan tetap 13/60 dari marjin, bukan angka
  // `persenPotonganAdmin` yang tersimpan di proposal lama. Field itu dibiarkan
  // di data agar dokumen lama tetap terbaca, tetapi tidak lagi menentukan
  // angka apa pun.
  const persen = formatPersen(PERSEN_PORSI_PLATFORM);
  const contoh = bagiHasilPendana(NOMINAL_CONTOH_PROPOSAL);
  const persenDiterima =
    Math.round((contoh.diterima / NOMINAL_CONTOH_PROPOSAL) * 10000) / 100;
  const persenKeuntungan =
    Math.round((contoh.keuntungan / NOMINAL_CONTOH_PROPOSAL) * 10000) / 100;
  const kolamBiaya = bagiHasilPendana(225_000_000).potonganAdmin;

  const bulanan = keuntunganBulananProposal();
  const tarif = new Map(tarifBulananProposal().map((t) => [t.tenor, t]));
  const simulasiBulanan = bulanan.map((b) => {
    const t = tarif.get(b.tenor);
    return [
      `${b.tenor} bulan`,
      t === undefined ? "-" : formatPersen(t.perBulan),
      rupiah(b.margin),
      rupiah(b.pendana),
      rupiah(b.platform),
      rupiah(b.perBulan),
    ];
  });

  const simulasiBulananNominal = simulasiBulananProposal().map((r) => [
    rupiah(r.pokok),
    ...TENOR_BULANAN_PROPOSAL.map((tenor) =>
      r.pendana[tenor] === null || r.pendana[tenor] === undefined
        ? "-"
        : rupiah(r.pendana[tenor] as number),
    ),
  ]);

  const konvensional = pembagianKonvensionalProposal().map((b) => [
    b.produk,
    b.dasar,
    rupiah(b.margin),
    rupiah(b.pendana),
    rupiah(b.platform),
    rupiah(b.diterima),
  ]);
  const simulasiKonvensional = simulasiKonvensionalProposal().map((b) => [
    rupiah(b.pokok),
    rupiah(b.harian),
    rupiah(b.gadai),
    rupiah(b.kredit),
  ]);

  const syariah = pembagianSyariahProposal().map((b) => [
    b.akad,
    b.dasar,
    rupiah(b.margin),
    rupiah(b.pendana),
    rupiah(b.platform),
    rupiah(b.diterima),
  ]);
  const simulasiSyariah = simulasiSyariahProposal().map((b) => [
    rupiah(b.pokok),
    rupiah(b.murabahah15),
    rupiah(b.murabahah20),
    rupiah(b.rahn),
    rupiah(b.qardh),
  ]);

  const simulasi = NOMINAL_SIMULASI_PROPOSAL.map((pokok) => {
    const bagi = bagiHasilPendana(pokok);
    return [
      rupiah(pokok),
      rupiah(bagi.imbal),
      rupiah(bagi.total),
      rupiah(bagi.potonganAdmin),
      rupiah(bagi.diterima),
      rupiah(bagi.keuntungan),
    ];
  });

  const baris: BarisPdf[] = [
    { teks: "Ringkasan eksekutif", gaya: "seksi" },
    { garis: true },
    {
      teks: "PINDAI adalah platform pendanaan digital yang mempertemukan pendana dengan nasabah di koridor industri megapolitan. Produknya mencakup pinjaman harian, pinjaman bulanan, pembiayaan syariah, gadai, dan kredit barang. Setiap alokasi menempel pada satu pinjaman dan satu pendana, dan marjin semua produk dibagi dengan aturan yang sama, 47 : 13. Pada gadai, pinjaman dijamin satu agunan fisik yang spesifik dan tercatat; pada produk lain, jaminannya mengikuti skema masing-masing. Dana tidak masuk ke kumpulan portofolio tanpa nama: pendana tahu pinjaman mana yang dibiayai.",
      gaya: "biasa",
    },
    {
      teks: "Nasabah PINDAI adalah karyawan pabrik aktif di Karawang, Cikarang, Bekasi, Bogor, Sukabumi, dan Jakarta. Tiket pinjaman Rp 500.000 sampai Rp 1.000.000 dengan siklus 30 hari. Mereka menerima gaji bulanan tetap, memiliki aset fisik yang bisa dinilai, dan membutuhkan dana untuk kebutuhan yang tidak menunggu jadwal gajian.",
      gaya: "biasa",
    },
    {
      teks: `Skema untuk pendana berjalan singkat: dana ditempatkan untuk satu siklus ${TENOR_PENDANA_HARI} hari, lalu pokok kembali bersama marjin ${PERSEN_IMBAL_PENDANA}% flat yang dihitung dari pokok pendanaan. Marjin itu dibagi 47 : 13, sehingga porsi platform ${persen} diambil dari marjin (bukan dari pokok) dan pendana menerima ${formatPersen(persenDiterima)} dari pokok dengan keuntungan bersih ${formatPersen(persenKeuntungan)} per siklus.`,
      gaya: "biasa",
    },
    {
      teks: "Target 2027 ditetapkan pada satu angka yang bisa diperiksa setiap bulan: 300 nasabah aktif per bulan, konsisten. Dengan tiket rata-rata Rp 750.000, target itu setara Rp 225.000.000 penyaluran per bulan atau sekitar Rp 2.700.000.000 per tahun.",
      gaya: "biasa",
    },

    { jarak: 8 },
    { label: "Nasabah aktif per bulan", nilai: "300" },
    { label: "Tiket rata-rata", nilai: "Rp 750.000" },
    { label: "Penyaluran per bulan", nilai: "Rp 225.000.000" },
    { label: "Penyaluran per tahun", nilai: "Rp 2.700.000.000" },
    {
      teks: "Rencana tahun berjalan menjaga kualitas verifikasi di Karawang dan Cikarang lebih dulu, menambah kapasitas penagihan lapangan, memperluas jangkauan ke Bekasi, Bogor, dan Sukabumi, lalu menutup tahun dengan volume 300 nasabah aktif per bulan. Rincian risiko dan batas jaminan ada di bagian empat.",
      gaya: "kecil",
    },

    { jarak: 12 },
    { teks: "Potensi pasar dan koridor industri", gaya: "seksi" },
    { garis: true },
    {
      teks: "Pasar PINDAI dihitung dari pekerja industri yang menerima gaji tetap dan membutuhkan dana mikro jangka pendek. Koridor Karawang sampai Jakarta memuat kawasan industri dengan konsentrasi pekerja tinggi, sehingga satu gerbang kawasan menjadi rute penagihan yang efisien dan satu perusahaan menjadi sumber nasabah berulang.",
      gaya: "biasa",
    },
    { jarak: 4 },
    { label: "TAM per tahun", nilai: "Rp 100 miliar sampai Rp 200 miliar" },
    {
      teks: "Kebutuhan pembiayaan mikro 6 sampai 8 juta angkatan kerja industri di koridor Karawang, Cikarang, Bekasi, Bogor, Sukabumi, dan Jakarta.",
      gaya: "kecil",
    },
    { label: "SAM per tahun", nilai: "Rp 10 miliar sampai Rp 20 miliar" },
    {
      teks: "Pekerja industri aktif di KIIC, EJIP, Jababeka, MM2100, Sentul, dan Sukabumi yang membutuhkan dana Rp 500.000 sampai Rp 1.000.000.",
      gaya: "kecil",
    },
    { label: "SOM 2027", nilai: "Rp 225 juta per bulan" },
    {
      teks: "Setara Rp 2,7 miliar per tahun, 13,5% sampai 27% dari SAM dan 1,35% sampai 2,7% dari TAM.",
      gaya: "kecil",
    },
    { jarak: 8 },
    { teks: "Koridor dan nasabah", gaya: "tebal" },
    {
      teks: "Kawasan KIIC dan sekitarnya menjadi pasar inti karena kantor pusat berada di Karawang. Cikarang menambah volume dari EJIP, Jababeka, dan MM2100. Bekasi, Bogor, Sukabumi, dan Jakarta memperluas jangkauan setelah kapasitas penagihan siap. Agunan yang diterima adalah barang bernilai likuid dan mudah dinilai, misalnya sepeda motor, emas, atau elektronik tertentu, dengan nilai jual kembali yang masih menutup pokok.",
      gaya: "biasa",
    },
    { teks: "Posisi PINDAI", gaya: "tebal" },
    {
      teks: "PINDAI memposisikan layanannya pada pinjaman Rp 500.000 sampai Rp 1.000.000 dengan siklus 30 hari. Posisi yang diambil adalah tiket kecil, jangka waktu pendek, agunan fisik tercatat, dan biaya yang ditulis sejak awal. Nilai jaminan tidak bergantung pada skor kredit, tetapi pada barang yang diperiksa dan disimpan sesuai prosedur internal.",
      gaya: "biasa",
    },
    { teks: "Risiko pasar", gaya: "tebal" },
    {
      teks: "Permintaan dana mikro mengikuti ritme penggajian dan musim pengeluaran, terutama menjelang hari raya dan tahun ajaran. Target 300 nasabah dihitung sebagai rata-rata tahunan, bukan janji kenaikan setiap bulan. Persaingan terbuka, tetapi jaringan verifikasi dan penagihan lapangan tidak dibangun dalam satu siklus.",
      gaya: "biasa",
    },

    { jarak: 10 },
    { teks: "Skema pendanaan", gaya: "seksi" },
    { garis: true },
    {
      teks: `Satu siklus acuan ${TENOR_PENDANA_HARI} hari. Semua angka dihitung dari pokok pendanaan, bukan dari bunga pinjaman peminjam. Perpanjangan tenor atau perubahan skema di sisi peminjam tidak mengubah hak pendana atas siklus yang sudah tercatat.`,
      gaya: "biasa",
    },
    { teks: "Berlaku untuk semua produk", gaya: "tebal" },
    {
      teks: "Aturan 47 : 13 dipakai untuk marjin pinjaman harian, pinjaman bulanan, pembiayaan syariah, gadai, dan kredit barang. Yang berbeda di tiap produk adalah cara marjin dihitung dari pokok dan tenor; bagian pendana tetap 78,33% dari marjin. Biaya layanan dan biaya admin platform berada di luar pembagian ini dan tidak memotong hak pendana.",
      gaya: "biasa",
    },

    { jarak: 8 },
    { teks: "Pembagian produk konvensional", gaya: "seksi" },
    { garis: true },
    {
      teks: `Tabel pertama memakai pokok ${rupiah(POKOK_CONTOH_KONVENSIONAL)} agar sebanding dengan tabel syariah. Pinjaman harian memakai skema acuan 30% flat; gadai memakai batas atas sewa modal 10% per 30 hari; kredit barang memakai tenor ${TENOR_CONTOH_KREDIT_BULAN} bulan dengan DP ${formatPersen(DP_CONTOH_KREDIT_PERSEN)} dari harga barang. Pinjaman bulanan dibahas pada tabel tenor tersendiri di bawah karena tarifnya berbeda per tenor.`,
      gaya: "biasa",
    },
    {
      tabel: {
        kepala: [
          "Produk",
          "Dasar marjin",
          "Marjin",
          "Pendana 47/60",
          "Platform 13/60",
          "Diterima pendana",
        ],
        baris: konvensional,
        bobot: [1.1, 1.5, 1, 1, 1, 1.15],
      },
    },
    {
      teks: `Diterima pendana adalah pokok ditambah hak pendana, karena pokok kembali utuh. Kredit barang memakai pokok ${rupiah(POKOK_CONTOH_KONVENSIONAL)} yang dibiayai setelah DP, bukan harga barang; biaya admin 2% tetap pos terpisah milik platform.`,
      gaya: "kecil",
    },
    { jarak: 8 },
    {
      teks: "Simulasi konvensional Rp 1 juta sampai Rp 10 juta (hak pendana)",
      gaya: "tebal",
    },
    {
      teks: `Sel berisi porsi pendana 47/60 dari marjin, tanpa pokok. Kolom harian memakai satu siklus acuan; tiket harian yang disalurkan Rp 500.000 sampai Rp 1.000.000, sedangkan tabel memakai nominal yang sama agar bisa dibandingkan. Kolom kredit adalah pokok yang dibiayai setelah DP ${formatPersen(DP_CONTOH_KREDIT_PERSEN)}.`,
      gaya: "kecil",
    },
    {
      tabel: {
        kepala: [
          "Pokok konvensional",
          "Harian",
          "Gadai 10%",
          "Kredit 3 bln",
        ],
        baris: simulasiKonvensional,
      },
    },

    { teks: "Pencatatan hak dan buktinya", gaya: "tebal" },
    {
      teks: "Hak pendana dicatat per pinjaman yang lunas; untuk gadai, dicatat setiap pembayaran gadai diterima. Catatan transfer dapat diunduh sebagai CSV dari ruang pendana, dan catatan yang salah dibatalkan dengan alasan sehingga jejaknya tetap tersimpan. Catatan itu adalah pembukuan PINDAI, bukan bukti mutasi bank: perpindahan uang tetap terjadi di rekening masing-masing.",
      gaya: "biasa",
    },
    {
      label: "Imbal Hasil",
      nilai: `${PERSEN_IMBAL_PENDANA}% x Pokok`,
    },
    {
      label: "Uang Kembali",
      nilai: "Pokok + Imbal Hasil (130%)",
    },
    {
      label: "Porsi platform",
      nilai: `${persen} x marjin`,
    },
    {
      label: "Diterima bersih",
      nilai: `${formatPersen(persenDiterima)} dari pokok`,
    },
    {
      label: "Keuntungan bersih",
      nilai: `${formatPersen(persenKeuntungan)} dari pokok`,
    },

    { jarak: 10 },
    { teks: "Keuntungan pinjaman bulanan 1/3/6/9/12", gaya: "seksi" },
    { garis: true },
    {
      teks: `Tabel ini memakai pokok ${rupiah(POKOK_CONTOH_BULANAN)}. Marjin tiap tenor berasal dari mesin yang sama dengan kontrak: 1 bulan 30%, 3 bulan 60%, 6 bulan 72%, 9 bulan 90%, dan 12 bulan 96%. Marjin penuh itu dibagi 47 : 13, jadi kolom pendana adalah hak bersih atas marjin, sedangkan biaya layanan dan biaya admin tetap pos terpisah milik platform.`,
      gaya: "biasa",
    },
    {
      tabel: {
        kepala: [
          "Tenor",
          "Bunga / bulan",
          "Marjin total tenor",
          "Hak pendana",
          "Porsi platform",
          "Setara per bulan",
        ],
        baris: simulasiBulanan,
      },
    },
    {
      teks: "Dana pada tenor bulanan terikat sampai tenor selesai: hak pendana baru dibayarkan setelah pinjaman lunas, bukan setiap bulan. Kolom setara per bulan hanya alat pembanding tenor, dan angka rupiahnya dibulatkan ke rupiah terdekat. Tenor lebih panjang tidak menaikkan hasil per bulan karena marjin per bulannya menurun (12%, 10%, dan 8% untuk tenor 6, 9, dan 12 bulan).",
      gaya: "kecil",
    },

    // Tabel sepuluh baris dimulai di halaman sendiri supaya barisnya tidak
    // terpotong di tengah dan kepala kolomnya tidak tertinggal di halaman lain.
    { halamanBaru: true },
    {
      teks: "Simulasi pinjaman bulanan Rp 1 juta sampai Rp 10 juta",
      gaya: "tebal",
    },
    {
      teks: `Setiap sel adalah hak bersih pendana (47/60 marjin) untuk tenor itu; pokok kembali utuh dan tidak termasuk di dalamnya. Bunga yang dipakai: ${tarifBulananProposal()
        .map(
          (t) =>
            `${t.tenor} bulan ${formatPersen(t.perBulan)} per bulan (${formatPersen(t.total)} total)`,
        )
        .join(
          ", ",
        )}. Tanda hubung berarti tenor tersebut belum tersedia untuk pokok itu: tenor 3 bulan ke atas mensyaratkan pokok minimal Rp 3.000.000.`,
      gaya: "kecil",
    },
    {
      tabel: {
        kepala: ["Pokok bulanan", "1 bln", "3 bln", "6 bln", "9 bln", "12 bln"],
        baris: simulasiBulananNominal,
      },
    },
    {
      teks: "Angka ini dihitung dari marjin tenor yang berlaku, bukan dari hasil satu bulan dikali jumlah bulan. Karena marjin per bulan menurun pada tenor panjang, hak pendana per bulan juga menurun walaupun totalnya naik.",
      gaya: "kecil",
    },

    // Dua tabel syariah dimulai di halaman sendiri supaya akad dan
    // simulasinya terbaca berurutan tanpa terpotong.
    { halamanBaru: true },
    { teks: "Pembagian produk syariah", gaya: "seksi" },
    { garis: true },
    {
      teks: `Akad syariah memakai aturan bagi hasil yang sama: margin murabahah atau ujrah rahn dibagi 47 : 13, pendana menerima 78,33% dan platform 21,67% sebagai ujrah pengelola. Tabel pertama memakai pokok ${rupiah(POKOK_CONTOH_SYARIAH)}; kolom diterima adalah pokok ditambah hak pendana, karena pokok kembali utuh.`,
      gaya: "biasa",
    },
    {
      tabel: {
        kepala: [
          "Akad",
          "Dasar margin/ujrah",
          "Margin/ujrah",
          "Pendana 47/60",
          "Platform 13/60",
          "Diterima pendana",
        ],
        baris: syariah,
      },
    },
    {
      teks: "Murabahah: margin disepakati 15-20% dari harga pokok untuk seluruh tenor. Rahn: ujrah pemeliharaan 2% dari nilai taksiran per 30 hari, dibayar per siklus. Qardh: pinjaman kebajikan tanpa margin, pokok kembali 100% dan tidak ada bagian yang dibagi.",
      gaya: "kecil",
    },
    { jarak: 8 },
    {
      teks: "Simulasi syariah Rp 1 juta sampai Rp 10 juta (hak pendana)",
      gaya: "tebal",
    },
    {
      teks: "Sel berisi porsi pendana 47/60 dari margin atau ujrah, tanpa pokok. Murabahah ditampilkan pada margin 15% dan 20%; Rahn satu siklus 30 hari dengan taksiran sama dengan pokok.",
      gaya: "kecil",
    },
    {
      tabel: {
        kepala: [
          "Pokok syariah",
          "Murabahah 15%",
          "Murabahah 20%",
          "Rahn 2%",
          "Qardh",
        ],
        baris: simulasiSyariah,
      },
    },
    {
      teks: "Biaya layanan dan biaya admin platform berada di luar pembagian ini dan tidak memotong hak pendana. Semua nominal rupiah bulat; sisa pembulatan selalu menjadi milik pendana.",
      gaya: "kecil",
    },

    { jarak: 10 },
    {
      teks: `Contoh pembagian ${rupiah(NOMINAL_CONTOH_PROPOSAL)}`,
      gaya: "seksi",
    },
    { garis: true },
    { label: "Pokok yang Anda danai", nilai: rupiah(NOMINAL_CONTOH_PROPOSAL) },
    {
      label: `Imbal Hasil (${PERSEN_IMBAL_PENDANA}%)`,
      nilai: rupiah(contoh.imbal),
    },
    { label: "Uang yang kembali", nilai: rupiah(contoh.total) },
    {
      label: `Porsi platform (layanan) ${persen}`,
      nilai: rupiah(contoh.potonganAdmin),
    },
    {
      pita: {
        label: "Diterima bersih",
        nilai: rupiah(contoh.diterima),
        catatan: `Keuntungan bersih ${rupiah(contoh.keuntungan)} setelah pokok kembali utuh.`,
      },
    },
    {
      teks: "Porsi platform diambil dari marjin pinjaman (bagian 47 : 13), bukan dari pokok. Pokok kembali utuh, sedangkan keuntungan bersih pendana adalah 78,33% dari marjin itu.",
      gaya: "kecil",
    },

    // Tabel enam kolom butuh halaman penuh supaya kepala kolom tidak terpisah
    // dari barisnya saat halaman berganti.
    { halamanBaru: true },
    {
      teks: "Simulasi Rp 5.000.000 sampai Rp 50.000.000",
      gaya: "seksi",
    },
    { garis: true },
    {
      tabel: {
        kepala: [
          "Pokok",
          "Imbal 30%",
          "Uang Kembali",
          `Porsi ${persen}`,
          "Diterima",
          "Keuntungan",
        ],
        baris: simulasi,
      },
    },
    { jarak: 6 },
    {
      teks: "Semua nominal rupiah bulat. Porsi platform dihitung 13/60 dari marjin dan dibulatkan ke bawah, sehingga sisa rupiah menjadi hak pendana dan tidak ada rupiah yang hilang atau diciptakan.",
      gaya: "kecil",
    },

    { jarak: 12 },
    { teks: "Putaran dana", gaya: "seksi" },
    { garis: true },
    {
      teks: `Keuntungan ${formatPersen(persenKeuntungan)} berlaku untuk satu siklus 30 hari, dan tidak ada janji bahwa dana berputar setiap bulan. Setelah siklus selesai, pendana memutuskan apakah dana ditempatkan lagi pada alokasi berikutnya atau ditarik. Waktu tunggu antar-alokasi dan keterlambatan pembayaran peminjam mengurangi hasil aktual, sehingga setiap siklus dinilai sendiri.`,
      gaya: "biasa",
    },
    { teks: "Pemetaan dana", gaya: "tebal" },
    {
      teks: "Setiap alokasi tercatat pada satu pinjaman dan tidak dipakai untuk pinjaman lain selama siklus berjalan. Identitas peminjam, nilai agunan, dan tanggal jatuh tempo tersimpan di sistem PINDAI. Dana tidak dapat ditarik sebelum pinjaman lunas.",
      gaya: "biasa",
    },

    { jarak: 10 },
    {
      teks: "Porsi platform dan mitigasi risiko",
      gaya: "seksi",
    },
    { garis: true },
    {
      teks: `Porsi platform ${persen} dihitung dari marjin pinjaman, sehingga biayanya sebanding dengan hasil yang dibayarkan tanpa memotong pokok. Pada skala 300 nasabah dengan tiket rata-rata Rp 750.000, porsi platform yang terkumpul sekitar ${rupiah(kolamBiaya)} per siklus. Angka itu membiayai penagihan lapangan, pengelolaan agunan, dan fasilitas pembayaran peminjam.`,
      gaya: "biasa",
    },
    { teks: "Penagihan lapangan.", gaya: "tebal" },
    {
      teks: "Petugas mendatangi peminjam sebelum jatuh tempo, di kawasan pabrik, rumah kos, atau kediaman. Kunjungan awal inilah yang menjaga siklus 30 hari tetap berjalan.",
      gaya: "biasa",
    },
    { teks: "Asuransi atau pengelolaan internal agunan.", gaya: "tebal" },
    {
      teks: "Agunan dinilai, dicatat, dan disimpan sesuai prosedur internal, termasuk pemeriksaan kondisi dan perlindungan atas risiko kerusakan atau kehilangan. Perlindungan itu berlaku untuk barang jaminan, bukan jaminan atas pengembalian dana pendana.",
      gaya: "biasa",
    },
    // Cakupan biaya ketiga pindah halaman bersama isinya supaya labelnya tidak
    // tertinggal sendirian di dasar halaman sebelumnya.
    { halamanBaru: true },
    { teks: "Fasilitas jaminan dan solusi bayar.", gaya: "tebal" },
    {
      teks: "Peminjam menerima bukti pencatatan agunan, pengingat, dan pilihan cara membayar yang dicatat admin. Jejak transaksi ini yang dipakai saat rekonsiliasi.",
      gaya: "biasa",
    },

    { jarak: 8 },
    { teks: "Langkah preventif", gaya: "seksi" },
    { garis: true },
    { teks: "1. Verifikasi sebelum pinjaman", gaya: "tebal" },
    {
      teks: "Penyaringan identitas, status kerja, dan agunan fisik bernilai likuid tinggi. Pinjaman yang tidak layak ditolak sebelum dana keluar.",
      gaya: "biasa",
    },
    { teks: "2. Pengingat", gaya: "tebal" },
    {
      teks: "Notifikasi aktif dikirim beberapa hari sebelum jatuh tempo untuk mencegah keterlambatan karena lupa.",
      gaya: "biasa",
    },
    { teks: "3. Somasi dan peringatan formal", gaya: "tebal" },
    {
      teks: "Teguran bertahap dengan jejak tertulis setelah batas waktu terlewati.",
      gaya: "biasa",
    },
    { teks: "4. Restrukturisasi", gaya: "tebal" },
    {
      teks: "Penyesuaian jadwal atau skema cicilan bagi peminjam kooperatif. Jadwal peminjam berubah, hak pendana atas siklus 30 hari tetap.",
      gaya: "biasa",
    },
    { teks: "5. Eksekusi agunan fisik", gaya: "tebal" },
    {
      teks: "Jalan terakhir: barang jaminan dieksekusi sesuai prosedur internal untuk mengamankan pokok pendana.",
      gaya: "biasa",
    },

    { jarak: 8 },
    { teks: "Batas jaminan", gaya: "seksi" },
    { garis: true },
    {
      teks: "PINDAI tidak menjamin pembayaran peminjam, tidak menanggung kerugian pokok pendana, dan tidak ada jaminan dari lembaga penjamin simpanan atau pihak ketiga. Eksekusi agunan membutuhkan waktu dan biaya, dan hasilnya bisa lebih rendah dari taksiran. Modal berisiko: bila peminjam gagal bayar, pokok dan Imbal Hasil tidak kembali.",
      gaya: "biasa",
    },
    {
      teks: "Pada portofolio 300 pinjaman, satu wanprestasi setara 0,33% dari nilai portofolio satu siklus. Perhitungan itu berlaku di tingkat portofolio, bukan jaminan per pinjaman.",
      gaya: "kecil",
    },
    { label: "Wanprestasi peminjam", nilai: "Pokok dan hasil tidak kembali" },
    {
      label: "Agunan tidak likuid",
      nilai: "Hasil eksekusi bisa di bawah taksiran",
    },
    { label: "Konsentrasi alokasi", nilai: "Satu pinjaman, satu pendana" },
    { label: "Waktu pencairan", nilai: "Menunggu pelunasan peminjam" },

    { jarak: 8 },
    { teks: "Alur kemitraan", gaya: "seksi" },
    { garis: true },
    {
      teks: "Pendaftaran lewat CS WhatsApp, bukan pendaftaran mandiri, karena rencana pendanaan dibahas lebih dulu: nominal, sumber dana, rekening pengembalian, dan penyebaran alokasi. Setelah akun dibuat, pendana masuk dengan verifikasi OTP email.",
      gaya: "biasa",
    },
    { teks: "1. Pendaftaran", gaya: "tebal" },
    {
      teks: `Hubungi CS WhatsApp ${nomorLayananProposal()} dan sampaikan rencana nominal. PINDAI memeriksa kelengkapan data dan membuatkan akun.`,
      gaya: "biasa",
    },
    { teks: "2. Penyetoran dana", gaya: "tebal" },
    {
      teks: "Dana disetor ke rekening usaha PINDAI di luar aplikasi. Aplikasi mencatat, tetapi tidak memindahkan uang secara otomatis.",
      gaya: "biasa",
    },
    { teks: "3. Alokasi", gaya: "tebal" },
    {
      teks: "Dana dialokasikan ke agunan fisik riil milik karyawan pabrik, dengan catatan identitas pinjaman dan agunan.",
      gaya: "biasa",
    },
    { teks: "4. Siklus 30 hari", gaya: "tebal" },
    {
      teks: "PINDAI mengirim pengingat, menagih di lapangan, dan mencatat pembayaran peminjam.",
      gaya: "biasa",
    },
    { teks: "5. Pengembalian", gaya: "tebal" },
    {
      teks: "Setelah pinjaman lunas (pada gadai, setelah pembayaran diterima), pokok dan keuntungan bersih ditransfer ke rekening pendana, lalu dicatat admin. Rekapnya bisa Anda unduh dari ruang pendana.",
      gaya: "biasa",
    },

    { jarak: 8 },
    { teks: "Jadwal satu siklus", gaya: "seksi" },
    { garis: true },
    { label: "Hari 0", nilai: "Pembahasan, verifikasi, dan akun" },
    { label: "Setelah persetujuan", nilai: "Penyetoran dana" },
    { label: "Setelah dana dicatat", nilai: "Alokasi ke satu pinjaman" },
    { label: "Menjelang jatuh tempo", nilai: "Pengingat aktif" },
    { label: "Hari 30", nilai: "Jatuh tempo dan pelunasan" },
    { label: "Setelah lunas", nilai: "Transfer hasil ke pendana" },
    {
      teks: "Urutan ini menggambarkan proses, bukan komitmen jam kerja tertentu. Waktu aktual mengikuti kesepakatan, kelengkapan dokumen, dan proses verifikasi.",
      gaya: "kecil",
    },

    { jarak: 8 },
    { teks: "Langkah berikutnya", gaya: "seksi" },
    { garis: true },
    {
      teks: "Pembahasan dimulai dari percakapan, bukan dari penyetoran. Sampaikan nominal yang ingin ditempatkan dan pertanyaan yang perlu dijawab lebih dulu, lalu PINDAI menjelaskan alokasi yang tersedia pada saat itu.",
      gaya: "biasa",
    },
    {
      pita: {
        label: "Layanan pelanggan PINDAI",
        nilai: nomorLayananProposal(),
        catatan: "WhatsApp hanya untuk percakapan awal dan verifikasi.",
      },
    },
    {
      teks: `Tautan chat: wa.me/${CS_WHATSAPP}. Balasan diberikan pada hari kerja.`,
      gaya: "kecil",
    },
  ];

  return {
    judul: "PROPOSAL PENDANAAN & KEMITRAAN STRATEGIS",
    kop: {
      nama: NAMA_LAYANAN,
      keterangan: "Layanan pendanaan - proposal kemitraan strategis",
      referensi: "PROPOSAL PENDANAAN",
    },
    sampul: {
      judul: "Proposal pendanaan & kemitraan strategis",
      subjudul:
        "Pendanaan mikro berbasis agunan fisik untuk karyawan pabrik di koridor Karawang, Cikarang, Bekasi, Bogor, Sukabumi, dan Jakarta.",
      meta: `Diterbitkan ${tanggalProposal(data.dibuatPada)} / PINDAI / Untuk calon pendana`,
      fakta: [
        { nilai: `${TENOR_PENDANA_HARI} hari`, label: "Siklus pendanaan" },
        {
          nilai: `${PERSEN_IMBAL_PENDANA}%`,
          label: "Imbal Hasil per siklus",
        },
        { nilai: "300", label: "Nasabah aktif per bulan" },
      ],
      catatan: `Imbal Hasil dihitung dari pokok yang Anda danai, bukan dari bunga pinjaman peminjam. Porsi platform ${persen} diambil dari marjin pinjaman.`,
      isi: [
        "Ringkasan eksekutif dan target 2027",
        "Potensi pasar: TAM, SAM, dan SOM",
        "Skema pendanaan, pembagian produk konvensional, simulasi Rp 5 juta sampai Rp 50 juta, keuntungan pinjaman bulanan 1/3/6/9/12, dan pembagian akad syariah",
        "Porsi platform, langkah preventif, dan risiko",
        "Alur kemitraan dan kontak layanan",
      ],
      penutup:
        "Pendanaan bukan tabungan. Baca bagian risiko sebelum menyetor, karena Imbal Hasil baru menjadi uang Anda setelah pinjaman lunas.",
      kaki: `Dokumen ini bukan perjanjian dan bukan jaminan hasil. Angka mengikuti kebijakan pada tanggal terbit dan dapat berubah untuk alokasi baru. Layanan pelanggan: WhatsApp ${nomorLayananProposal()}.`,
    },
    kaki: KAKI_DOKUMEN,
    baris,
  };
}
