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
import type { BarisPdf, DokumenPdf, KopPdf } from "./pdfSederhana";
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

/** Nama layanan pada kop. Satu tempat, dipakai semua laporan. */
const NAMA_LAYANAN = "PINJAM GADAI DIGITAL (PINDAI)";

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

/** Kop surat laporan: lambang dari penulis PDF, keterangan, dan rujukan. */
function kopLaporan(keterangan: string, referensi: string): KopPdf {
  return { nama: NAMA_LAYANAN, keterangan, referensi };
}

/** Nama berkas lampiran laporan pelunasan. */
export function namaBerkasPelunasan(nomorReferensi: string): string {
  return `laporan-pelunasan-${slug(nomorReferensi)}.pdf`;
}

/** Nama berkas lampiran laporan portofolio. */
export function namaBerkasPortofolio(dicetakPada: number): string {
  return `laporan-pendanaan-${tanggalIso(dicetakPada)}.pdf`;
}

/** Nama berkas rekap seluruh pendana. */
export function namaBerkasRekapPendana(dicetakPada: number): string {
  return `rekap-pendana-${tanggalIso(dicetakPada)}.pdf`;
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
export function laporanPelunasan(data: DataPelunasanPendana): DokumenPdf {
  const baris: BarisPdf[] = [
    { teks: judulPelunasan(), gaya: "judul" },
    { teks: `${data.nomorReferensi} - ${data.namaPendana}`, gaya: "subjudul" },
    { teks: `Dicetak ${tanggal(data.dicetakPada)} dari ruang penyedia dana`, gaya: "kecil" },
    { garis: true },
    { teks: "Hasil untuk Anda", gaya: "seksi" },
    {
      label: "Keuntungan pendana (dibukukan)",
      nilai: rupiah(data.keuntunganPendana),
      tebal: true,
    },
    { label: "Total kewajiban peminjam", nilai: rupiah(data.totalLunas) },
    { label: "Biaya platform (layanan)", nilai: rupiah(data.potonganAdmin) },
    { kosong: true },
    { teks: "Pinjaman", gaya: "seksi" },
    { label: "Nomor referensi", nilai: data.nomorReferensi },
    { label: "Peminjam", nilai: samarkanNama(data.namaPeminjam) },
    { label: "Dana tersalurkan (pokok)", nilai: rupiah(data.pokokPinjaman) },
    { label: "Tanggal dana tersalurkan", nilai: tanggal(data.didanaiPada) },
    { label: "Tanggal lunas", nilai: tanggal(data.lunasPada) },
    { kosong: true },
    {
      teks: data.transferDicatat
        ? "Catatan transfer keuntungan sudah dibuat admin."
        : "Catatan transfer keuntungan belum dibuat admin. Keuntungan di atas tercatat lunas, tetapi pencairannya masih menunggu catatan transfer.",
      gaya: "kecil",
    },
    {
      teks: "Nama peminjam disamarkan. Angka di laporan ini dihitung dari pinjaman yang alokasinya atas nama akun penerima, sama dengan yang tampil di ruang penyedia dana.",
      gaya: "kecil",
    },
  ];
  return {
    kop: kopLaporan(
      "Layanan gadai digital - laporan keuangan pendana",
      "LAPORAN PELUNASAN",
    ),
    kaki: KAKI_LAPORAN,
    baris,
  };
}

/**
 * Baris satu pinjaman pada bagian daftar (berjalan atau lunas).
 *
 * Satu pinjaman memakai dua baris: baris kecil berisi identitas dan pokok,
 * baris kedua berisi nama yang disamarkan dengan angkanya rata kanan. Bentuk
 * ini membuat kolom keuntungan sejajar antarbaris, dan nama peminjam tetap
 * terbaca sebagai identitas baris tanpa membocorkan nama lengkap.
 */
function barisDaftar(
  judul: string,
  nominal: string,
  kumpulan: BarisPortofolioPendana[],
): BarisPdf[] {
  const hasil: BarisPdf[] = [{ teks: judul, gaya: "seksi" }];
  if (kumpulan.length === 0) {
    hasil.push({ teks: "Belum ada pinjaman pada bagian ini.", gaya: "biasa" });
    return hasil;
  }
  for (const p of kumpulan.slice(0, BATAS_PINJAMAN_LAPORAN)) {
    hasil.push({
      teks:
        `${p.nomorReferensi} - ${tanggal(p.tanggal)} - pokok ${rupiah(p.pokokPinjaman)} - ` +
        `jatuh tempo ${tanggal(p.tanggalReturn)}`,
      gaya: "kecil",
    });
    hasil.push({
      label: samarkanNama(p.namaPeminjam),
      nilai: `${nominal} ${rupiah(p.keuntunganPendana)}`,
    });
  }
  if (kumpulan.length > BATAS_PINJAMAN_LAPORAN) {
    hasil.push({
      teks: `Dan ${kumpulan.length - BATAS_PINJAMAN_LAPORAN} pinjaman lain pada bagian ini. Daftar lengkapnya ada di ruang penyedia dana.`,
      gaya: "kecil",
    });
  }
  return hasil;
}

/**
 * Susun laporan portofolio seluruh pendanaan satu pendana.
 *
 * Angka ringkasannya datang dari ruang penyedia dana, bukan dihitung ulang di
 * sini: laporan yang angkanya sedikit berbeda dari layar akan membuat pemiliknya
 * kehilangan kepercayaan pada kedua tempat sekaligus.
 */
export function laporanPortofolio(data: DataPortofolioPendana): DokumenPdf {
  const baris: BarisPdf[] = [
    { teks: "Laporan kinerja pendanaan", gaya: "judul" },
    { teks: `Pendana: ${data.namaPendana}`, gaya: "subjudul" },
    { teks: `Dicetak ${tanggal(data.dicetakPada)} dari ruang penyedia dana`, gaya: "kecil" },
    { garis: true },
    { teks: "Ringkasan", gaya: "seksi" },
    { label: "Dana tersalurkan", nilai: rupiah(data.totalDisalurkan) },
    {
      label: "Masih berjalan",
      nilai: `${rupiah(data.saldoBerjalan)} (${data.jumlahBerjalan} pinjaman)`,
    },
    { label: "Keuntungan dibukukan (lunas)", nilai: rupiah(data.keuntunganDibukukan) },
    {
      label: "Keuntungan perkiraan (belum lunas)",
      nilai: rupiah(data.keuntunganPerkiraan),
    },
    {
      label: "Total keuntungan pendana",
      nilai: rupiah(data.totalKeuntungan),
      tebal: true,
    },
    { label: "Biaya platform (layanan)", nilai: rupiah(data.potonganAdmin) },
    {
      label: "Jumlah pinjaman",
      nilai: `${data.jumlahBerjalan} berjalan - ${data.jumlahLunas} lunas`,
    },
    { kosong: true },
    ...barisDaftar("Pinjaman berjalan", "perkiraan", data.pinjamanBerjalan),
    { kosong: true },
    ...barisDaftar("Pinjaman lunas", "dibukukan", data.pinjamanLunas),
    { kosong: true },
    {
      teks: "Keuntungan perkiraan dihitung dari pinjaman yang masih berjalan: angkanya baru menjadi uang saat pinjaman itu lunas.",
      gaya: "kecil",
    },
    {
      teks: "Tanggal jatuh tempo adalah proyeksi return dari tenor pinjaman, bukan janji pembayaran. Pembayaran dapat lebih lambat bila peminjam menunggak.",
      gaya: "kecil",
    },
    {
      teks:
        data.transferBelumDicatat > 0
          ? `${data.transferBelumDicatat} pinjaman lunas sudah dibukukan, tetapi catatan transfer keuntungannya belum dibuat admin.`
          : "Seluruh keuntungan yang sudah dibukukan memiliki catatan transfer dari admin.",
      gaya: "kecil",
    },
    {
      teks: "Nama peminjam disamarkan. Daftar lengkap pinjaman dan statusnya ada di ruang penyedia dana.",
      gaya: "kecil",
    },
  ];
  return {
    kop: kopLaporan(
      "Layanan gadai digital - laporan keuangan pendana",
      "LAPORAN PENDANAAN",
    ),
    kaki: KAKI_LAPORAN,
    baris,
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
export function laporanRekapPendana(data: DataRekapPendana): DokumenPdf {
  const total = data.total;
  const baris: BarisPdf[] = [
    { teks: "Rekap pinjaman semua pendana", gaya: "judul" },
    { teks: `Dicetak ${tanggal(data.dicetakPada)} dari ruang penyedia dana`, gaya: "kecil" },
    { garis: true },
    { teks: "Total seluruh pendana", gaya: "seksi" },
    { label: "Jumlah pendana", nilai: String(total.jumlahPendana) },
    {
      label: "Jumlah pinjaman",
      nilai: `${total.jumlahPinjaman} (${total.jumlahAktif} berjalan, ${total.jumlahLunas} lunas)`,
    },
    { label: "Dana tersalurkan", nilai: rupiah(total.totalDisalurkan), tebal: true },
    { label: "Masih berjalan", nilai: rupiah(total.saldoBerjalan) },
    {
      label: "Keuntungan dibukukan (lunas)",
      nilai: rupiah(total.keuntunganPendanaLunas),
    },
    {
      label: "Keuntungan perkiraan (belum lunas)",
      nilai: rupiah(total.keuntunganPendanaBelumLunas),
    },
    {
      label: "Total keuntungan pendana",
      nilai: rupiah(total.keuntunganPendana),
      tebal: true,
    },
    { label: "Biaya platform (layanan)", nilai: rupiah(total.keuntunganAdmin) },
    {
      label: "Transfer keuntungan belum dicatat",
      nilai: `${total.transferBelumDicatat} pinjaman - ${rupiah(total.keuntunganBelumDicatat)}`,
    },
    { kosong: true },
    { teks: "Rincian per pendana", gaya: "seksi" },
  ];

  data.baris.forEach((r, i) => {
    baris.push({ teks: `${i + 1}. ${r.nama}`, gaya: "tebal" });
    baris.push({
      teks: `${r.jumlahPinjaman} pinjaman - ${r.jumlahAktif} berjalan - ${r.jumlahLunas} lunas`,
      gaya: "kecil",
    });
    baris.push({ label: "Dana tersalurkan", nilai: rupiah(r.totalDisalurkan) });
    baris.push({ label: "Masih berjalan", nilai: rupiah(r.saldoBerjalan) });
    baris.push({
      label: "Keuntungan dibukukan (lunas)",
      nilai: rupiah(r.keuntunganPendanaLunas),
    });
    baris.push({
      label: "Keuntungan perkiraan (belum lunas)",
      nilai: rupiah(r.keuntunganPendanaBelumLunas),
    });
    baris.push({
      label: "Total keuntungan pendana",
      nilai: rupiah(r.keuntunganPendana),
      tebal: true,
    });
    baris.push({ label: "Biaya platform (layanan)", nilai: rupiah(r.keuntunganAdmin) });
    if (r.transferBelumDicatat > 0) {
      baris.push({
        teks: `${r.transferBelumDicatat} pinjaman lunas belum memiliki catatan transfer keuntungan.`,
        gaya: "kecil",
      });
    }
    baris.push({ kosong: true });
  });

  baris.push(
    { teks: "Cara membaca", gaya: "seksi" },
    {
      teks: "Model 1 pinjaman = 1 pendana. Setiap angka dihitung dari pinjaman yang tercatat atas nama pendana itu.",
      gaya: "kecil",
    },
    {
      teks: "Keuntungan perkiraan berasal dari pinjaman yang masih berjalan dan baru menjadi uang saat pinjaman lunas.",
      gaya: "kecil",
    },
    {
      teks: "Nama peminjam tidak dicantumkan di rekap ini. Rincian pinjaman per pendana ada di dokumen laporan pendana masing-masing.",
      gaya: "kecil",
    },
  );

  return {
    kop: kopLaporan("Rekap internal - seluruh pendana", "KHUSUS SUPER ADMIN"),
    kaki: KAKI_LAPORAN,
    baris,
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
