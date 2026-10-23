/**
 * DOKUMEN PDF RINCIAN PINJAMAN.
 *
 * Bentuk dokumennya disusun di sini, sedangkan byte PDF-nya ditulis
 * `lib/pdfSederhana` — penulis PDF yang sama dengan laporan pendana. Rincian
 * ini dipakai lampiran email dan WhatsApp, jadi isinya hanya datang dari
 * `DokumenRincianPinjaman` supaya kedua kanal tidak pernah berbeda angka.
 *
 * Tata letak mengikuti dokumen resmi: banner navy, dua kartu informasi, tabel
 * dana diterima dan kewajiban pengembalian, callout total, lalu peringatan
 * keamanan. Semua label diambil dari data, bukan ditulis ulang.
 */
import { formatTanggalWIB } from "./waktu";
import {
  susunPdfResmi,
  type BarisTabelResmi,
  type BlokResmiPdf,
  type KartuResmi,
} from "./pdfSederhana";
import type {
  BarisRincian,
  DokumenRincianPinjaman,
  KelompokRincian,
} from "./rincianPinjaman";

const PESAN_KEAMANAN =
  "PINDAI tidak pernah meminta kode OTP, PIN, atau kata sandi lewat WhatsApp maupun email.";

/** Kelompok dengan judul tertentu; dokumen lama bisa tidak memilikinya. */
function kelompok(dok: DokumenRincianPinjaman, judul: string): KelompokRincian | undefined {
  return dok.kelompok.find((k) => k.judul === judul);
}

function barisDenganLabel(
  k: KelompokRincian | undefined,
  label: string,
): BarisRincian | undefined {
  return k?.baris.find((b) => b.label === label);
}

function kartu(
  judul: string,
  baris: Array<{ label: string; nilai: string; nada?: "tautan" | "potongan" | "bersih" | "total" }>,
): KartuResmi {
  return { judul, baris };
}

function barisTabel(baris: readonly BarisRincian[]): BarisTabelResmi[] {
  return baris.map((b) => ({
    sel: [b.label, b.nilai],
    ...(b.nada === undefined ? {} : { nada: b.nada }),
    ...(b.tegas === true ? { tebal: true } : {}),
  }));
}

export function buatPdfRincian(dok: DokumenRincianPinjaman): Uint8Array {
  const pengajuan = kelompok(dok, "Pengajuan");
  const dana = kelompok(dok, "Dana yang Anda terima");
  const bayar = kelompok(dok, "Yang Anda bayar");
  const status = kelompok(dok, "Status hari ini");

  const keperluan = barisDenganLabel(pengajuan, "Keperluan")?.nilai ?? "Tidak dicatat";
  const rekening = barisDenganLabel(dana, "Rekening tujuan")?.nilai ?? "Belum dicatat";

  const total = bayar?.baris.find((b) => b.tegas === true) ??
    bayar?.baris[bayar.baris.length - 1];
  const catatanBayar = barisDenganLabel(bayar, "Cara bayar")?.nilai;
  const catatanTotal =
    catatanBayar !== undefined
      ? `${catatanBayar}${dok.jatuhTempoTeks === null ? "" : ` (${dok.jatuhTempoTeks})`}.`
      : dok.jadwal !== null
        ? `Dibayar dalam ${dok.tenorTeks} melalui cicilan bulanan sesuai jadwal.`
        : dok.jatuhTempoTeks === null
          ? `Dibayar dalam ${dok.tenorTeks} sesuai jadwal.`
          : `Jatuh tempo ${dok.jatuhTempoTeks}.`;

  const blok: BlokResmiPdf[] = [
    {
      jenis: "banner",
      merek: "PINDAI",
      subjudul: "Rincian Pinjaman Digital",
      nomor: dok.nomorReferensi,
      tanggal: `Dokumen dibuat: ${formatTanggalWIB(dok.dibuatPada)}`,
    },
    {
      jenis: "kartu",
      kiri: kartu("Informasi Nasabah & Pengajuan", [
        { label: "Nama Nasabah", nilai: dok.namaPeminjam },
        { label: "Keperluan", nilai: keperluan },
        { label: "Tenor Pinjaman", nilai: `${dok.tenorTeks} (${dok.skemaTeks})` },
        { label: "Status Pinjaman", nilai: dok.statusLabel, nada: "tautan" },
      ]),
      kanan: kartu("Jadwal & Rekening Tujuan", [
        { label: "Tgl Pengajuan", nilai: dok.diajukanTeks },
        { label: "Tgl Pencairan", nilai: dok.dicairkanTeks ?? "Belum dicairkan" },
        { label: "Jatuh Tempo", nilai: dok.jatuhTempoTeks ?? "Belum ditentukan" },
        { label: "Rekening Tujuan", nilai: rekening },
      ]),
    },
  ];

  if (dana !== undefined) {
    blok.push(
      { jenis: "judul", nomor: "1", teks: "Rincian Dana Yang Diterima" },
      {
        jenis: "tabel",
        kepala: ["DESKRIPSI KOMPONEN", "NOMINAL"],
        bobot: [8, 2],
        rataKanan: [1],
        baris: barisTabel(
          dana.baris.filter((b) => b.label !== "Rekening tujuan"),
        ),
      },
    );
  }

  if (bayar !== undefined) {
    blok.push(
      { jenis: "judul", nomor: "2", teks: "Rincian Kewajiban Pengembalian" },
      {
        jenis: "tabel",
        kepala: ["DESKRIPSI KOMPONEN", "NOMINAL"],
        bobot: [8, 2],
        rataKanan: [1],
        baris: barisTabel(
          bayar.baris.filter(
            (b) => b.tegas !== true && b.label !== "Cara bayar",
          ),
        ),
      },
      {
        jenis: "callout",
        label: total?.label ?? "Total Kewajiban",
        nilai: total?.nilai ?? "Belum dihitung",
        catatan: `Metode bayar: ${catatanTotal}`,
      },
    );
  } else if (dok.totalKewajiban !== null) {
    blok.push({
      jenis: "callout",
      label: "Total Kewajiban Saat Jatuh Tempo",
      nilai: `Rp ${dok.totalKewajiban.toLocaleString("id-ID")}`,
      catatan:
        dok.jatuhTempoTeks === null
          ? "Nominal mengikuti catatan internal PINDAI."
          : `Jatuh tempo ${dok.jatuhTempoTeks}.`,
    });
  }

  blok.push({
    jenis: "peringatan",
    judul: "Himbauan Keamanan Transaksi",
    teks: PESAN_KEAMANAN,
  });

  if (status !== undefined) {
    blok.push(
      { jenis: "judul", teks: "Status Hari Ini" },
      {
        jenis: "tabel",
        kepala: ["KETERANGAN", "NILAI"],
        bobot: [6, 4],
        rataKanan: [1],
        baris: barisTabel(status.baris),
      },
    );
  }

  if (dok.jadwal !== null) {
    const rataKanan = dok.jadwal.kolom
      .map((_, i) => i)
      .filter((i) => i > 0);
    blok.push(
      { jenis: "judul", teks: dok.jadwal.judul },
      {
        jenis: "tabel",
        kepala: dok.jadwal.kolom,
        bobot: dok.jadwal.kolom.map((_, i) => (i === 0 ? 1.2 : 1)),
        rataKanan,
        baris: dok.jadwal.baris.map((baris) => ({ sel: baris })),
      },
    );
  }

  const catatanLain = dok.catatan.filter((c) => c !== PESAN_KEAMANAN);
  if (catatanLain.length > 0) {
    blok.push(
      { jenis: "jarak", tinggi: 4 },
      { jenis: "judul", teks: "Catatan" },
      { jenis: "poin", teks: catatanLain },
    );
  }

  return susunPdfResmi({
    nomor: dok.nomorReferensi,
    judul: "RINCIAN PINJAMAN",
    kaki: "PINDAI — Laporan Rincian Pinjaman Resmi",
    blok,
  });
}
