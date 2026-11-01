/**
 * PDF ringkas laporan efektivitas promo bunga — bahan rapat mingguan.
 *
 * Memakai mesin dokumen resmi yang sama dengan rincian pinjaman dan somasi:
 * banner navy, kartu ringkasan, tabel rata kanan, callout total. Angka datang
 * dari laporan server, tidak dihitung ulang di sini, sehingga PDF dan layar
 * tidak bisa berbeda.
 */
import { formatRupiahAman } from "./money";
import {
  susunPdfResmi,
  type BarisTabelResmi,
  type BlokResmiPdf,
} from "./pdfSederhana";
import type { StatusPromoBunga } from "./promoBunga";
import { formatTanggalWIB, tanggalWIB } from "./waktu";

export type BarisLaporanPromoPdf = {
  nama: string;
  status: StatusPromoBunga;
  jenis?: "bunga_pengganti" | "potongan_bunga" | "bebas_admin";
  persenBunga: number;
  potonganPersen?: number | null;
  tenor: readonly number[];
  mulai: number;
  selesai: number;
  pinjaman: number;
  pokok: number;
  subsidi: number;
};

export type DataLaporanPromoPdf = {
  baris: readonly BarisLaporanPromoPdf[];
  tren: readonly { mulai: number; pinjaman: number; subsidi: number }[];
  total: { promo: number; pinjaman: number; pokok: number; subsidi: number };
  /** Rentang saringan pengajuan; kosong berarti seluruh periode. */
  periode: { dari?: number; sampai?: number } | null;
  dibuatPada: number;
  dibatasi: boolean;
};

const LABEL_STATUS: Record<StatusPromoBunga, string> = {
  berjalan: "Berjalan",
  dijadwalkan: "Dijadwalkan",
  nonaktif: "Nonaktif",
  berakhir: "Berakhir",
};

/** Label status yang aman untuk data lama/asing. */
function labelStatus(status: StatusPromoBunga): string {
  return LABEL_STATUS[status] ?? status;
}

function labelManfaat(baris: BarisLaporanPromoPdf): string {
  if (baris.jenis === "bebas_admin") return "Bebas biaya admin";
  if (baris.jenis === "potongan_bunga") {
    return `Potongan ${baris.potonganPersen ?? 0} poin`;
  }
  return `${baris.persenBunga}%`;
}

function teksPeriode(periode: DataLaporanPromoPdf["periode"]): string {
  if (periode?.dari !== undefined && periode.sampai !== undefined) {
    return `${formatTanggalWIB(periode.dari)} – ${formatTanggalWIB(periode.sampai)}`;
  }
  if (periode?.dari !== undefined) return `Sejak ${formatTanggalWIB(periode.dari)}`;
  if (periode?.sampai !== undefined) return `Sampai ${formatTanggalWIB(periode.sampai)}`;
  return "Seluruh periode";
}

/** "19–25 Okt 2026" dari awal minggu. */
function labelMinggu(mulai: number): string {
  const akhir = mulai + 6 * 86_400_000;
  return `${formatTanggalWIB(mulai, { day: "numeric", month: "short" })}–${formatTanggalWIB(
    akhir,
    { day: "numeric", month: "short", year: "numeric" },
  )}`;
}

export function buatPdfLaporanPromo(laporan: DataLaporanPromoPdf): Uint8Array {
  const nomor = `LPR-${tanggalWIB(laporan.dibuatPada).replace(/-/g, "")}`;
  const tanggal = formatTanggalWIB(laporan.dibuatPada);
  const rataRata =
    laporan.total.pinjaman > 0
      ? Math.round(laporan.total.subsidi / laporan.total.pinjaman)
      : 0;

  const barisTabel: BarisTabelResmi[] = laporan.baris.map((baris) => ({
    sel: [
      `${baris.nama} · ${labelStatus(baris.status)} · ${labelManfaat(baris)}`,
      baris.tenor.join("/"),
      String(baris.pinjaman),
      formatRupiahAman(baris.pokok),
      formatRupiahAman(baris.subsidi),
    ],
  }));

  const blok: BlokResmiPdf[] = [
    {
      jenis: "banner",
      merek: "PINDAI",
      subjudul: "Laporan Efektivitas Promo Pinjaman",
      nomor,
      tanggal: `Tanggal: ${tanggal}`,
    },
    {
      jenis: "kartu",
      kiri: {
        judul: "Ringkasan",
        baris: [
          { label: "Pinjaman memakai promo", nilai: String(laporan.total.pinjaman) },
          { label: "Total pokok", nilai: formatRupiahAman(laporan.total.pokok) },
          {
            label: "Subsidi promo",
            nilai: formatRupiahAman(laporan.total.subsidi),
            nada: "bersih",
          },
          {
            label: "Rata-rata per pinjaman",
            nilai: formatRupiahAman(rataRata),
          },
        ],
      },
      kanan: {
        judul: "Cakupan laporan",
        baris: [
          { label: "Periode pengajuan", nilai: teksPeriode(laporan.periode) },
          { label: "Kampanye", nilai: String(laporan.total.promo) },
          {
            label: "Minggu dengan pemakaian",
            nilai: String(laporan.tren.length),
          },
          { label: "Dibuat", nilai: tanggal },
        ],
      },
    },
    { jenis: "judul", nomor: "01", teks: "Pemakaian per kampanye" },
    ...(barisTabel.length === 0
      ? [
          {
            jenis: "paragraf" as const,
            teks: "Belum ada promo bunga yang dibuat pada cakupan ini.",
          },
        ]
      : [
          {
            jenis: "tabel" as const,
            kepala: ["PROMO", "TENOR", "PINJAMAN", "POKOK", "SUBSIDI"],
            bobot: [5, 2, 2, 3, 3],
            rataKanan: [2, 3, 4],
            baris: barisTabel,
          },
        ]),
    {
      jenis: "callout",
      label: "Total subsidi promo platform",
      nilai: formatRupiahAman(laporan.total.subsidi),
      catatan: `${laporan.total.pinjaman} pinjaman · rata-rata ${formatRupiahAman(rataRata)} per pinjaman.`,
    },
  ];

  // Tren hanya bila ada minggu dengan pemakaian; tabel enam minggu terakhir
  // menjaga laporan tetap satu halaman untuk rapat.
  const trenTampil = laporan.tren.slice(-6);
  if (trenTampil.length > 0) {
    blok.push(
      { jenis: "judul", nomor: "02", teks: "Tren mingguan" },
      {
        jenis: "tabel",
        kepala: ["MINGGU (WIB)", "PINJAMAN", "SUBSIDI"],
        bobot: [5, 2, 3],
        rataKanan: [1, 2],
        baris: trenTampil.map((baris) => ({
          sel: [labelMinggu(baris.mulai), String(baris.pinjaman), formatRupiahAman(baris.subsidi)],
        })),
      },
    );
  }

  const catatan = [
    "Subsidi promo = selisih bunga normal dengan bunga promo, ditambah biaya admin yang dibebaskan kampanye bebas admin.",
    "Voucher potongan bunga dan voucher akad syariah dihitung terpisah, bukan bagian dari subsidi promo.",
    "Minggu dimulai Senin pukul 00.00 WIB dan berakhir Minggu pukul 23.59 WIB.",
  ];
  if (laporan.dibatasi) {
    catatan.push(
      "Sebagian kampanye memakai lebih dari 500 pinjaman; angkanya dihitung dari 500 pinjaman terbaru kampanye tersebut.",
    );
  }

  blok.push(
    { jenis: "judul", nomor: "03", teks: "Catatan" },
    { jenis: "poin", teks: catatan },
    { jenis: "jarak", tinggi: 8 },
    {
      jenis: "peringatan",
      judul: "Dokumen internal",
      teks: "Laporan ini untuk evaluasi kampanye oleh pengelola. Bukan penawaran bunga dan bukan dokumen kontrak nasabah.",
    },
  );

  return susunPdfResmi({
    nomor,
    judul: "LAPORAN EFEKTIVITAS PROMO",
    kaki: "PINDAI — Laporan internal efektivitas promo pinjaman",
    blok,
  });
}
