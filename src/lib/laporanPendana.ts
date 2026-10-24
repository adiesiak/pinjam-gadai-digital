/**
 * Isi laporan pendana: tiga dokumen PDF yang keluar dari ruang penyedia dana.
 *
 * Fungsi di berkas ini MURNI (tanpa Convex, React, maupun jaringan) supaya
 * kalimat dan angkanya bisa diuji sebagai skrip biasa, dan supaya tidak ada
 * salinan aturan kedua di dalam aksi pengiriman.
 *
 * Tiga laporan, tiga pertanyaan:
 *  1. `laporanPelunasan` menjawab "pinjaman saya yang mana yang baru lunas, dan
 *     berapa yang dibukukan" untuk SATU pinjaman, dikirim otomatis saat admin
 *     menandai lunas.
 *  2. `laporanPortofolio` menjawab "bagaimana posisi seluruh pendanaan saya"
 *     untuk SEMUA pinjaman atas nama pendana itu, dikirim saat ia memintanya.
 *  3. `laporanRekapPendana` menjawab "bagaimana posisi semua pendana" untuk
 *     Super Admin: satu berkas berisi angka seluruh pendana, bisa diunduh atau
 *     dikirim ke WhatsApp.
 *
 * Istilahnya sengaja sama persis dengan ruang penyedia dana (Dana tersalurkan,
 * Keuntungan dibukukan, Keuntungan perkiraan, Biaya platform). Laporan ini
 * salinan angka yang sudah dibaca pendana di layar, jadi memakai kata lain akan
 * memaksa pembaca mencocokkan dua istilah untuk satu angka yang sama.
 *
 * Nama peminjam SELALU disamarkan di laporan yang dibaca pendana. Penyamaran
 * dilakukan di sini, bukan di pemanggil, supaya jalur unduhan, lampiran
 * WhatsApp, dan pesan teks tidak pernah memakai aturan yang berbeda.
 */
import { formatRupiahAman } from "./money";
import { tanggalRingkas } from "./jatuhTempo";
import { samarkanNama } from "./nama";
import type {
  BarisTabelResmi,
  BlokResmiPdf,
  DokumenResmiPdf,
} from "./pdfSederhana";
import type { SumberPendana, TotalPendana } from "./tabelPendana";

/**
 * Batas jumlah baris pinjaman yang dicetak per bagian.
 *
 * Bukan batas teknis: gateway WhatsApp membatasi ukuran lampiran (di bawah
 * 4 MB), sedangkan laporan ini jauh lebih kecil. Batasnya untuk keterbacaan dan
 * untuk menjaga laporan tetap bisa dibaca di layar ponsel. Sisa barisnya
 * disebutkan jumlahnya, bukan dihilangkan diam-diam.
 */
export const BATAS_PINJAMAN_LAPORAN = 25;

/** Data satu pinjaman yang baru dicatat lunas. */
export type DataPelunasanPendana = {
  namaPendana: string;
  nomorReferensi: string;
  namaPeminjam: string;
  pokokPinjaman: number;
  /** Total kewajiban peminjam (pokok + bunga). */
  totalLunas: number;
  /** Biaya platform (layanan) atas pinjaman ini. */
  potonganAdmin: number;
  /** Keuntungan pendana yang dibukukan dari pinjaman ini. */
  keuntunganPendana: number;
  didanaiPada: number | null;
  lunasPada: number;
  /** Apakah admin sudah mencatat transfer keuntungannya. */
  transferDicatat: boolean;
  dicetakPada: number;
};

/** Satu baris pinjaman di laporan portofolio. */
export type BarisPortofolioPendana = {
  nomorReferensi: string;
  namaPeminjam: string;
  pokokPinjaman: number;
  keuntunganPendana: number;
  /** Tanggal acuan baris ini: pelunasan untuk lunas, pendanaan untuk berjalan. */
  tanggal: number | null;
  /**
   * Jatuh tempo pinjaman — PROYEKSI tanggal return, bukan janji pembayaran.
   * Null bila tenor tidak terbaca; laporan mengatakannya, tidak mengarang.
   */
  tanggalReturn: number | null;
};

/** Angka ringkasan portofolio satu pendana (sumber: ruang penyedia dana). */
export type DataPortofolioPendana = {
  namaPendana: string;
  dicetakPada: number;
  totalDisalurkan: number;
  saldoBerjalan: number;
  keuntunganDibukukan: number;
  keuntunganPerkiraan: number;
  totalKeuntungan: number;
  /** Biaya platform (layanan) atas pinjaman berjalan + lunas. */
  potonganAdmin: number;
  jumlahBerjalan: number;
  jumlahLunas: number;
  pinjamanBerjalan: BarisPortofolioPendana[];
  pinjamanLunas: BarisPortofolioPendana[];
  /** Pinjaman lunas yang catatan transfer keuntungannya belum dibuat admin. */
  transferBelumDicatat: number;
};

/**
 * Data rekap seluruh pendana.
 *
 * `total` datang dari fungsi yang sama dengan baris total tabel di ruang
 * pendana (`totalPendana`), jadi jumlah di PDF tidak mungkin berbeda dari
 * jumlah yang bisa dibaca admin di layar.
 */
export type DataRekapPendana = {
  dicetakPada: number;
  baris: SumberPendana[];
  total: TotalPendana;
};

/**
 * Kaki halaman semua laporan berkop.
 *
 * Berisi identitas penerbit, bukan nomor halaman: nomor halaman dicetak
 * terpisah di kanan oleh penulis PDF, dan menyebutnya dua kali hanya membuat
 * baris kaki penuh.
 */
const KAKI_LAPORAN = "PINDAI - dokumen dibuat otomatis oleh sistem";

function rupiah(nilai: number): string {
  return formatRupiahAman(nilai);
}

function tanggal(ms: number | null): string {
  return ms === null ? "belum tercatat" : tanggalRingkas(ms);
}

/** Tanggal ISO (YYYY-MM-DD) untuk nama berkas, dihitung dari UTC. */
function tanggalIso(ms: number): string {
  const d = new Date(ms);
  const bulan = String(d.getUTCMonth() + 1).padStart(2, "0");
  const hari = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${bulan}-${hari}`;
}

/** Ubah teks menjadi bagian nama berkas yang aman di semua sistem. */
function slug(teks: string): string {
  const bersih = teks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return bersih === "" ? "pinjaman" : bersih;
}

/** Nama berkas lampiran laporan pelunasan. */
export function namaBerkasPelunasan(nomorReferensi: string): string {
  return `PINDAI-Laporan-Pelunasan-${slug(nomorReferensi)}.pdf`;
}

/** Nama berkas lampiran laporan portofolio. */
export function namaBerkasPortofolio(dicetakPada: number): string {
  return `PINDAI-Laporan-Pendanaan-${tanggalIso(dicetakPada)}.pdf`;
}

/** Nama berkas rekap seluruh pendana. */
export function namaBerkasRekapPendana(dicetakPada: number): string {
  return `PINDAI-Rekap-Pendana-${tanggalIso(dicetakPada)}.pdf`;
}

/** Judul laporan pelunasan, dipakai di PDF dan di keterangan pesan. */
export function judulPelunasan(): string {
  return "Laporan pelunasan pinjaman";
}

/**
 * Susun laporan pelunasan satu pinjaman.
 *
 * Urutan bagiannya mengikuti pertanyaan pendana: berapa hasilnya, pinjaman mana
 * yang melunasinya, lalu apa langkah berikutnya. Status transfer disebut di
 * akhir karena itu bukan tanggung jawabnya, tetapi perlu ia ketahui.
 */
export function laporanPelunasan(data: DataPelunasanPendana): DokumenResmiPdf {
  const blok: BlokResmiPdf[] = [
    {
      jenis: "banner",
      merek: "PINDAI",
      subjudul: "Laporan Pelunasan Pendana",
      nomor: data.nomorReferensi,
      tanggal: `Dicetak ${tanggal(data.dicetakPada)}`,
    },
    {
      jenis: "kartu",
      kiri: {
        judul: "Pendana & Pinjaman",
        baris: [
          { label: "Nama Pendana", nilai: data.namaPendana },
          { label: "Peminjam", nilai: samarkanNama(data.namaPeminjam) },
          { label: "Nomor Referensi", nilai: data.nomorReferensi },
          { label: "Status", nilai: "Lunas", nada: "bersih" },
        ],
      },
      kanan: {
        judul: "Tanggal & Transfer",
        baris: [
          { label: "Dana Tersalurkan", nilai: tanggal(data.didanaiPada) },
          { label: "Tanggal Lunas", nilai: tanggal(data.lunasPada) },
          {
            label: "Transfer Keuntungan",
            nilai: data.transferDicatat ? "Sudah dicatat" : "Belum dicatat",
            ...(data.transferDicatat ? { nada: "bersih" as const } : { nada: "potongan" as const }),
          },
          { label: "Dicetak", nilai: tanggal(data.dicetakPada) },
        ],
      },
    },
    { jenis: "judul", nomor: "1", teks: "Hasil untuk Anda" },
    {
      jenis: "tabel",
      kepala: ["DESKRIPSI KOMPONEN", "NOMINAL"],
      bobot: [8, 2],
      rataKanan: [1],
      baris: [
        {
          sel: ["Keuntungan pendana (dibukukan)", rupiah(data.keuntunganPendana)],
          tebal: true,
          nada: "bersih",
        },
        { sel: ["Dana tersalurkan (pokok)", rupiah(data.pokokPinjaman)] },
        { sel: ["Total kewajiban peminjam", rupiah(data.totalLunas)] },
        { sel: ["Biaya platform (layanan)", rupiah(data.potonganAdmin)] },
      ],
    },
    {
      jenis: "callout",
      label: "Keuntungan yang dibukukan",
      nilai: rupiah(data.keuntunganPendana),
      catatan: data.transferDicatat
        ? "Catatan transfer keuntungan sudah dibuat admin."
        : "Catatan transfer keuntungan belum dibuat admin. Keuntungan di atas sudah dibukukan, tetapi pencairannya masih menunggu catatan transfer.",
    },
    { jenis: "judul", nomor: "2", teks: "Catatan" },
    {
      jenis: "poin",
      teks: [
        "Nama peminjam disamarkan. Angka di laporan ini dihitung dari pinjaman yang alokasinya atas nama akun penerima, sama dengan yang tampil di ruang penyedia dana.",
        "Laporan ini salinan catatan internal PINDAI, bukan bukti transfer bank.",
      ],
    },
  ];
  return {
    nomor: data.nomorReferensi,
    judul: "LAPORAN PELUNASAN",
    kaki: KAKI_LAPORAN,
    blok,
  };
}

/**
 * Baris tabel daftar pinjaman. Nama peminjam disamarkan di sini, bukan di
 * pemanggil, supaya semua kanal memakai penyamaran yang sama.
 */
function barisDaftarPinjaman(
  kumpulan: BarisPortofolioPendana[],
  jenis: "berjalan" | "lunas",
): { baris: BarisTabelResmi[]; sisa: number } {
  const tampil = kumpulan.slice(0, BATAS_PINJAMAN_LAPORAN);
  return {
    baris: tampil.map((p) => ({
      sel: [
        p.nomorReferensi,
        samarkanNama(p.namaPeminjam),
        rupiah(p.pokokPinjaman),
        rupiah(p.keuntunganPendana),
        tanggal(jenis === "berjalan" ? p.tanggalReturn : p.tanggal),
      ],
    })),
    sisa: kumpulan.length - tampil.length,
  };
}

/**
 * Susun laporan portofolio seluruh pendanaan satu pendana.
 *
 * Angka ringkasannya datang dari ruang penyedia dana, bukan dihitung ulang di
 * sini: laporan yang angkanya sedikit berbeda dari layar akan membuat pemiliknya
 * kehilangan kepercayaan pada kedua tempat sekaligus.
 */
export function laporanPortofolio(data: DataPortofolioPendana): DokumenResmiPdf {
  const berjalan = barisDaftarPinjaman(data.pinjamanBerjalan, "berjalan");
  const lunas = barisDaftarPinjaman(data.pinjamanLunas, "lunas");
  const blok: BlokResmiPdf[] = [
    {
      jenis: "banner",
      merek: "PINDAI",
      subjudul: "Laporan Kinerja Pendanaan",
      nomor: "LAPORAN PENDANAAN",
      tanggal: `Dicetak ${tanggal(data.dicetakPada)}`,
    },
    {
      jenis: "kartu",
      kiri: {
        judul: "Pendana",
        baris: [
          { label: "Nama Pendana", nilai: data.namaPendana },
          {
            label: "Jumlah Pinjaman",
            nilai: `${data.jumlahBerjalan} berjalan - ${data.jumlahLunas} lunas`,
          },
          { label: "Dicetak", nilai: tanggal(data.dicetakPada) },
        ],
      },
      kanan: {
        judul: "Ringkasan Dana",
        baris: [
          { label: "Dana Tersalurkan", nilai: rupiah(data.totalDisalurkan) },
          {
            label: "Masih Berjalan",
            nilai: `${rupiah(data.saldoBerjalan)} (${data.jumlahBerjalan} pinjaman)`,
          },
          {
            label: "Total Keuntungan",
            nilai: rupiah(data.totalKeuntungan),
            nada: "bersih",
          },
        ],
      },
    },
    { jenis: "judul", nomor: "1", teks: "Ringkasan Keuntungan" },
    {
      jenis: "tabel",
      kepala: ["DESKRIPSI KOMPONEN", "NOMINAL"],
      bobot: [8, 2],
      rataKanan: [1],
      baris: [
        { sel: ["Keuntungan dibukukan (lunas)", rupiah(data.keuntunganDibukukan)] },
        {
          sel: [
            "Keuntungan perkiraan (belum lunas)",
            rupiah(data.keuntunganPerkiraan),
          ],
        },
        {
          sel: ["Total keuntungan pendana", rupiah(data.totalKeuntungan)],
          tebal: true,
          nada: "bersih",
        },
        { sel: ["Biaya platform (layanan)", rupiah(data.potonganAdmin)] },
      ],
    },
    {
      jenis: "callout",
      label: "Total Keuntungan Pendana",
      nilai: rupiah(data.totalKeuntungan),
      catatan:
        "Keuntungan perkiraan dihitung dari pinjaman yang masih berjalan dan baru menjadi uang saat pinjaman itu lunas.",
    },
    { jenis: "judul", nomor: "2", teks: "Pinjaman Berjalan" },
  ];

  if (berjalan.baris.length === 0) {
    blok.push({
      jenis: "paragraf",
      teks: "Belum ada pinjaman pada bagian ini.",
    });
  } else {
    blok.push({
      jenis: "tabel",
      kepala: ["REFERENSI", "PEMINJAM", "POKOK", "PERKIRAAN", "JATUH TEMPO"],
      bobot: [2.1, 1.7, 1.4, 1.3, 1.5],
      rataKanan: [2, 3],
      baris: berjalan.baris,
    });
    if (berjalan.sisa > 0) {
      blok.push({
        jenis: "paragraf",
        kecil: true,
        teks: `Dan ${berjalan.sisa} pinjaman lain pada bagian ini. Daftar lengkapnya ada di ruang penyedia dana.`,
      });
    }
  }

  blok.push({ jenis: "judul", nomor: "3", teks: "Pinjaman Lunas" });
  if (lunas.baris.length === 0) {
    blok.push({
      jenis: "paragraf",
      teks: "Belum ada pinjaman pada bagian ini.",
    });
  } else {
    blok.push({
      jenis: "tabel",
      kepala: ["REFERENSI", "PEMINJAM", "POKOK", "DIBUKUKAN", "TANGGAL LUNAS"],
      bobot: [2.1, 1.7, 1.3, 1.3, 1.6],
      rataKanan: [2, 3],
      baris: lunas.baris,
    });
    if (lunas.sisa > 0) {
      blok.push({
        jenis: "paragraf",
        kecil: true,
        teks: `Dan ${lunas.sisa} pinjaman lain pada bagian ini. Daftar lengkapnya ada di ruang penyedia dana.`,
      });
    }
  }

  blok.push(
    { jenis: "judul", nomor: "4", teks: "Catatan" },
    {
      jenis: "poin",
      teks: [
        "Tanggal jatuh tempo adalah proyeksi return dari tenor pinjaman, bukan janji pembayaran. Pembayaran dapat lebih lambat bila peminjam menunggak.",
        data.transferBelumDicatat > 0
          ? `${data.transferBelumDicatat} pinjaman lunas sudah dibukukan, tetapi catatan transfer keuntungannya belum dibuat admin.`
          : "Seluruh keuntungan yang sudah dibukukan memiliki catatan transfer dari admin.",
        "Nama peminjam disamarkan. Daftar lengkap pinjaman dan statusnya ada di ruang penyedia dana.",
      ],
    },
  );

  return {
    nomor: "LAPORAN PENDANAAN",
    judul: "LAPORAN PENDANAAN",
    kaki: KAKI_LAPORAN,
    blok,
  };
}

/**
 * Susun rekap pinjaman seluruh pendana untuk Super Admin.
 *
 * Dokumen ini menjawab pertanyaan yang sama dengan tabel "Rekap Dana Pendana",
 * dalam bentuk yang bisa disimpan dan diteruskan. Tidak ada nama peminjam di
 * sini: rekap ini tentang posisi pendana, dan rincian pinjamannya sudah punya
 * dokumen sendiri di ruang masing-masing.
 */
export function laporanRekapPendana(data: DataRekapPendana): DokumenResmiPdf {
  const total = data.total;
  const blok: BlokResmiPdf[] = [
    {
      jenis: "banner",
      merek: "PINDAI",
      subjudul: "Rekap Pinjaman Semua Pendana",
      nomor: "KHUSUS SUPER ADMIN",
      tanggal: `Dicetak ${tanggal(data.dicetakPada)}`,
    },
    {
      jenis: "kartu",
      kiri: {
        judul: "Cakupan",
        baris: [
          { label: "Jumlah Pendana", nilai: String(total.jumlahPendana) },
          {
            label: "Jumlah Pinjaman",
            nilai: `${total.jumlahPinjaman} (${total.jumlahAktif} berjalan, ${total.jumlahLunas} lunas)`,
          },
          { label: "Dicetak", nilai: tanggal(data.dicetakPada) },
        ],
      },
      kanan: {
        judul: "Total Dana",
        baris: [
          { label: "Dana Tersalurkan", nilai: rupiah(total.totalDisalurkan) },
          { label: "Masih Berjalan", nilai: rupiah(total.saldoBerjalan) },
          {
            label: "Transfer Belum Dicatat",
            nilai: `${total.transferBelumDicatat} pinjaman - ${rupiah(total.keuntunganBelumDicatat)}`,
          },
        ],
      },
    },
    { jenis: "judul", nomor: "1", teks: "Total Seluruh Pendana" },
    {
      jenis: "tabel",
      kepala: ["DESKRIPSI KOMPONEN", "NOMINAL"],
      bobot: [8, 2],
      rataKanan: [1],
      baris: [
        {
          sel: ["Keuntungan dibukukan (lunas)", rupiah(total.keuntunganPendanaLunas)],
        },
        {
          sel: [
            "Keuntungan perkiraan (belum lunas)",
            rupiah(total.keuntunganPendanaBelumLunas),
          ],
        },
        {
          sel: ["Total keuntungan pendana", rupiah(total.keuntunganPendana)],
          tebal: true,
          nada: "bersih",
        },
        { sel: ["Biaya platform (layanan)", rupiah(total.keuntunganAdmin)] },
      ],
    },
    {
      jenis: "callout",
      label: "Total Keuntungan Pendana",
      nilai: rupiah(total.keuntunganPendana),
      catatan: `${total.jumlahPendana} pendana, ${total.jumlahPinjaman} pinjaman. Salinan rekap internal, bukan bukti transfer.`,
    },
    { jenis: "judul", nomor: "2", teks: "Rincian per Pendana" },
  ];

  if (data.baris.length === 0) {
    blok.push({ jenis: "paragraf", teks: "Belum ada pendana yang bisa direkap." });
  } else {
    blok.push({
      jenis: "tabel",
      kepala: [
        "PENDANA",
        "PINJAMAN",
        "TERSALURKAN",
        "BERJALAN",
        "DIBUKUKAN",
        "PERKIRAAN",
        "TOTAL",
      ],
      bobot: [2.3, 0.9, 1.5, 1.4, 1.4, 1.4, 1.4],
      rataKanan: [1, 2, 3, 4, 5, 6],
      baris: [
        ...data.baris.map((r) => ({
          sel: [
            r.nama,
            String(r.jumlahPinjaman),
            rupiah(r.totalDisalurkan),
            rupiah(r.saldoBerjalan),
            rupiah(r.keuntunganPendanaLunas),
            rupiah(r.keuntunganPendanaBelumLunas),
            rupiah(r.keuntunganPendana),
          ],
        })),
        {
          sel: [
            "TOTAL",
            String(total.jumlahPinjaman),
            rupiah(total.totalDisalurkan),
            rupiah(total.saldoBerjalan),
            rupiah(total.keuntunganPendanaLunas),
            rupiah(total.keuntunganPendanaBelumLunas),
            rupiah(total.keuntunganPendana),
          ],
          tebal: true,
          nada: "total" as const,
        },
      ],
    });
  }

  blok.push(
    { jenis: "judul", nomor: "3", teks: "Cara Membaca" },
    {
      jenis: "poin",
      teks: [
        "Model 1 pinjaman = 1 pendana. Setiap angka dihitung dari pinjaman yang tercatat atas nama pendana itu.",
        "Keuntungan perkiraan berasal dari pinjaman yang masih berjalan dan baru menjadi uang saat pinjaman lunas.",
        "Nama peminjam tidak dicantumkan di rekap ini. Rincian pinjaman per pendana ada di dokumen laporan pendana masing-masing.",
        "Biaya platform adalah bagian PINDAI, bukan bagian pendana; angkanya dicetak terpisah agar tidak tertukar dengan keuntungan pendana.",
      ],
    },
  );

  return {
    nomor: "REKAP PENDANA",
    judul: "REKAP PENDANA",
    kaki: KAKI_LAPORAN,
    blok,
  };
}

/**
 * Keterangan pesan WhatsApp yang menemani lampiran.
 *
 * Sengaja pendek dan menunjuk lampirannya: pesan panjang dengan angka yang sama
 * dengan PDF membuat dua versi angka beredar di percakapan, dan yang salah
 * dibaca adalah yang paling akhir terlihat.
 */
export function pesanPelunasan(data: DataPelunasanPendana): string {
  const transfer = data.transferDicatat
    ? "Catatan transfer keuntungannya sudah dibuat admin."
    : "Catatan transfer keuntungannya belum dibuat admin.";
  return (
    `Halo ${data.namaPendana}, pinjaman ${data.nomorReferensi} atas nama ${samarkanNama(data.namaPeminjam)} ` +
    `tercatat lunas pada ${tanggal(data.lunasPada)}. ` +
    `Keuntungan yang dibukukan untuk Anda ${rupiah(data.keuntunganPendana)}. ` +
    `${transfer} Rincian lengkapnya ada di lampiran PDF.`
  );
}

/**
 * Jatuh tempo terdekat dari pinjaman yang masih berjalan.
 *
 * Dipakai pesan WhatsApp supaya pendana tahu kapan return berikutnya
 * diperkirakan masuk tanpa membuka lampiran. Null bila tidak ada tanggal yang
 * terbaca — pesan tidak boleh mengarang tanggal.
 */
export function proyeksiReturnTerdekat(
  data: DataPortofolioPendana,
): number | null {
  const daftar = data.pinjamanBerjalan
    .map((p) => p.tanggalReturn)
    .filter((t): t is number => t !== null);
  return daftar.length === 0 ? null : Math.min(...daftar);
}

/** Keterangan pesan WhatsApp untuk laporan portofolio. */
export function pesanPortofolio(data: DataPortofolioPendana): string {
  const terdekat = proyeksiReturnTerdekat(data);
  const proyeksi =
    terdekat === null
      ? "Belum ada proyeksi tanggal return dari pinjaman berjalan. "
      : `Proyeksi return terdekat ${tanggal(terdekat)}. `;
  return (
    `Halo ${data.namaPendana}, ini salinan laporan kinerja pendanaan Anda per ${tanggal(data.dicetakPada)}. ` +
    `Dana tersalurkan ${rupiah(data.totalDisalurkan)}, keuntungan dibukukan ${rupiah(data.keuntunganDibukukan)}, ` +
    `perkiraan dari pinjaman berjalan ${rupiah(data.keuntunganPerkiraan)}. ` +
    proyeksi +
    "Angka lengkap per pinjaman ada di lampiran PDF."
  );
}

/** Keterangan pesan WhatsApp untuk rekap seluruh pendana. */
export function pesanRekapPendana(data: DataRekapPendana): string {
  const total = data.total;
  return (
    `Rekap pinjaman seluruh pendana per ${tanggal(data.dicetakPada)}: ` +
    `${total.jumlahPendana} pendana, ${total.jumlahPinjaman} pinjaman. ` +
    `Dana tersalurkan ${rupiah(total.totalDisalurkan)}, keuntungan dibukukan ${rupiah(total.keuntunganPendanaLunas)}, ` +
    `perkiraan ${rupiah(total.keuntunganPendanaBelumLunas)}. ` +
    `Rincian per pendana ada di lampiran PDF.`
  );
}
