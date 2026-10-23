/**
 * Penulis PDF kecil tanpa dependensi untuk laporan yang dikirim ke WhatsApp.
 *
 * Kenapa ditulis sendiri: proyek ini tidak memasang pustaka PDF apa pun, dan
 * aksi Convex (runtime default, bukan Node) tidak punya sistem berkas untuk
 * pustaka seperti PDFKit. Berkas ini hanya menyusun byte: satu jenis halaman
 * (A4), dua font baku PDF (Helvetica + Helvetica-Bold, sudah ada di setiap
 * pembaca PDF tanpa ditanam), dan dua jalur tata letak:
 *
 * - `susunPdf` untuk laporan lama berbasis daftar baris (proposal dan laporan
 *   pendana). Bentuknya dipertahankan supaya berkas yang sudah beredar tidak
 *   berubah.
 * - `susunPdfResmi` untuk dokumen resmi baru: banner navy, dua kartu informasi,
 *   tabel angka rata kanan dengan nada potongan/bersih, callout total, dan
 *   kotak peringatan. Blok diukur dulu, lalu dipenggal per halaman.
 *
 * Perataan kanan memakai perkiraan lebar Helvetica (lihat
 * `PERKIRAAN_LEBAR_KARAKTER`), bukan tabel metrik huruf penuh. Untuk nominal
 * rupiah selisihnya kecil dan tidak menggeser angka keluar kolom.
 *
 * Semua masukan dinormalkan ke Latin-1 (WinAnsi). Karakter yang tidak ada di
 * sana diganti, jadi laporan tidak pernah menampilkan kotak kosong di WhatsApp.
 */

/** Gaya satu baris laporan. Tingkat gaya inilah yang menjadi hierarki dokumen. */
export type GayaBarisPdf =
  | "judul"
  | "subjudul"
  | "seksi"
  | "tebal"
  | "biasa"
  | "kecil";

/**
 * Satu isi dokumen: teks bergaya, baris angka dua kolom, baris kosong, atau
 * garis pemisah.
 *
 * `label`/`nilai` dipakai untuk angka ringkasan: label di kiri, nilainya rata
 * kanan pada garis yang sama. Tanpa bentuk ini semua angka harus ditulis
 * "Label: nilai" dan kolomnya tidak pernah lurus — dokumen keuangan yang
 * kolomnya bergoyang lebih sulit diperiksa daripada yang kolomnya sejajar.
 */
export type BarisPdf =
  | { teks: string; gaya?: GayaBarisPdf }
  | { label: string; nilai: string; tebal?: boolean; kecil?: boolean }
  /** Tiga kolom sejajar dalam satu baris: nominal, nilai tengah, nilai kanan. */
  | {
      kolom: { kiri: string; tengah: string; kanan: string };
      tebal?: boolean;
      kecil?: boolean;
    }
  /**
   * Tabel banyak kolom dengan lebar tetap.
   *
   * Dipakai simulasi pendanaan yang menuntut enam angka sejajar (pokok, Imbal
   * Hasil, uang kembali, biaya, diterima, keuntungan). Tanpa bentuk ini angka
   * harus dipecah menjadi dua tabel, dan pembaca kehilangan hubungan satu baris.
   * Sel ditulis satu baris; pemanggil bertanggung jawab memakai label pendek.
   */
  | {
      tabel: {
        kepala: string[];
        baris: string[][];
        /** Bobot lebar kolom relatif; default sama rata. */
        bobot?: number[];
      };
    }
  /** Pita angka penting: bidang kertas berkotak kuningan dengan satu angka besar. */
  | { pita: { label: string; nilai: string; catatan?: string } }
  /** Jarak vertikal dalam titik, untuk mengatur napas antar bagian. */
  | { jarak: number }
  /** Paksa isi berikutnya mulai di halaman baru. */
  | { halamanBaru: true }
  | { kosong: true }
  | { garis: true };

/**
 * Sampul dokumen penawaran.
 *
 * Laporan internal cukup memakai kop di setiap halaman, tetapi dokumen yang
 * diserahkan ke pihak luar perlu satu halaman pembuka: judul, tiga angka kunci,
 * daftar isi, dan catatan bahwa dokumen ini bukan perjanjian. Sampul tidak ikut
 * dinomori, sehingga nomor halaman di dalam dokumen mulai dari 1 pada halaman
 * isi pertama.
 */
export type SampulPdf = {
  judul: string;
  subjudul: string;
  /** Satu baris kecil di bawah subjudul: tanggal terbit dan penerbit. */
  meta: string;
  /** Tiga angka kunci yang dicetak besar di kotak. */
  fakta: { nilai: string; label: string }[];
  /** Penjelasan singkat di bawah kotak angka. */
  catatan: string;
  /** Daftar isi dokumen, satu baris per bagian. */
  isi: string[];
  /** Kalimat penutup di bagian bawah sampul, di atas catatan kaki. */
  penutup?: string;
  /** Catatan kaki sampul (mis. bukan perjanjian). */
  kaki: string;
};

/**
 * Kop surat yang dicetak di puncak SETIAP halaman.
 *
 * Dokumen keuangan yang keluar dari aplikasi harus terbaca sebagai terbitan
 * PINDAI bahkan setelah halaman pertamanya terpisah: logo, nama layanan, dan
 * garis kop diulang di setiap halaman, seperti surat perjanjian.
 */
export type KopPdf = {
  /** Nama layanan pada baris pertama kop. */
  nama: string;
  /** Satu baris keterangan di bawah nama. */
  keterangan?: string;
  /** Teks kecil rata kanan: jenis dokumen dan tanggal terbit. */
  referensi?: string;
};

export type DokumenPdf = {
  /** Kop surat; bila ada, isi halaman pertama turun memberinya ruang. */
  kop?: KopPdf;
  /**
   * Sampul halaman pertama. Bila ada, halaman isi memakai kop ringkas (satu
   * baris) dan penomoran dimulai dari halaman isi pertama.
   */
  sampul?: SampulPdf;
  /** Teks tetap di kaki setiap halaman (mis. nama layanan). */
  kaki?: string;
  baris: BarisPdf[];
};

/** A4 dalam satuan titik PDF (1 titik = 1/72 inci). */
const LEBAR_HALAMAN = 595.28;
const TINGGI_HALAMAN = 841.89;
const MARGIN_SISI = 48;
const MARGIN_ATAS = 56;
/** Garis dasar terendah untuk isi; di bawah ini hanya kaki halaman. */
const BATAS_BAWAH = 64;
const TINGGI_KAKI = 12;
/** Garis dasar kaki halaman dari tepi bawah kertas. */
const KAKI_BASELINE = 40;
/**
 * Ruang yang dipakai kop surat di puncak halaman.
 *
 * Isi mulai di bawah garis kop, bukan menimpanya. Angka ini juga dipakai saat
 * membagi halaman, supaya baris terakhir tidak jatuh ke area kop di halaman
 * berikutnya.
 */
const TINGGI_KOP = 54;

/**
 * Ruang kop ringkas pada dokumen bersampul: satu baris identitas dan garis
 * rambut, tanpa lambang besar. Isi jadi punya lebih banyak ruang, dan sampul
 * tetap menjadi satu-satunya halaman yang berat.
 */
const TINGGI_KOP_RINGKAS = 34;

/** Warna dokumen: tinta hijau PINDAI, kuningan, dan abu-abu teks pendukung. */
const WARNA = {
  tinta: "0.059 0.239 0.227",
  emas: "0.725 0.608 0.384",
  badan: "0.09 0.11 0.10",
  redup: "0.39 0.45 0.42",
} as const;

/** Warna per gaya baris. Judul dan seksi memakai tinta; catatan memakai abu. */
const WARNA_GAYA: Record<GayaBarisPdf, string> = {
  judul: WARNA.tinta,
  subjudul: WARNA.tinta,
  seksi: WARNA.tinta,
  tebal: WARNA.badan,
  biasa: WARNA.badan,
  kecil: WARNA.redup,
};

const LEBAR_TEKS = LEBAR_HALAMAN - MARGIN_SISI * 2;

type UkuranBaris = {
  ukuran: number;
  leading: number;
  font: "F1" | "F2";
  jarakBawah: number;
};

/**
 * Ukuran huruf per gaya. Angkanya dipilih dari peran tiap baris: judul memimpin
 * halaman, seksi memisahkan kelompok angka, dan sisanya harus nyaman dibaca
 * saat dicetak atau dijepret dari layar ponsel.
 */
const UKURAN: Record<GayaBarisPdf, UkuranBaris> = {
  judul: { ukuran: 17, leading: 22, font: "F2", jarakBawah: 10 },
  subjudul: { ukuran: 12.5, leading: 18, font: "F2", jarakBawah: 6 },
  seksi: { ukuran: 10.5, leading: 16, font: "F2", jarakBawah: 4 },
  tebal: { ukuran: 10.5, leading: 15, font: "F2", jarakBawah: 2 },
  biasa: { ukuran: 10.5, leading: 15, font: "F1", jarakBawah: 2 },
  kecil: { ukuran: 8.5, leading: 12, font: "F1", jarakBawah: 2 },
};

/**
 * Perkiraan lebar rata-rata satu karakter dibandingkan ukuran huruf.
 *
 * Helvetica rata-rata sekitar 0.5 em. Nilai di sini sengaja lebih BESAR supaya
 * perkiraan panjang baris cenderung melebih-lebihkan: baris dipotong lebih
 * awal, dan teks tidak pernah melewati margin kanan. Tebakan ini hanya untuk
 * membungkus baris, bukan untuk mengukur tata letak.
 */
const PERKIRAAN_LEBAR_KARAKTER = 0.55;

/**
 * Karakter di luar Latin-1 yang tetap punya padanan wajar. Sisanya menjadi "?"
 * supaya laporan tidak pernah menampilkan karakter rusak.
 */
const PADANAN: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2026": "...",
  "\u00b7": "-",
  "\u00d7": "x",
  "\u2022": "*",
  "\u00a0": " ",
};

/** Normalkan teks ke Latin-1: padanan dulu, sisanya diganti tanda tanya. */
export function keLatin1(teks: string): string {
  let hasil = "";
  for (const karakter of teks) {
    const padanan = PADANAN[karakter];
    if (padanan !== undefined) {
      hasil += padanan;
      continue;
    }
    hasil += karakter.codePointAt(0)! <= 0xff ? karakter : "?";
  }
  return hasil;
}

/** Escape wajib di dalam literal string PDF. */
function escapePdf(teks: string): string {
  return keLatin1(teks)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n\t]/g, " ");
}

/** Perkiraan lebar teks pada satu ukuran huruf (lihat PERKIRAAN_LEBAR_KARAKTER). */
function perkiraanLebar(teks: string, ukuran: number): number {
  return keLatin1(teks).length * ukuran * PERKIRAAN_LEBAR_KARAKTER;
}

/**
 * Bungkus satu baris teks menjadi beberapa baris yang muat di lebar teks.
 *
 * Pemotongan dilakukan pada spasi terdekat sebelum batas. Kata yang sendirian
 * sudah lebih panjang dari satu baris (mis. nomor referensi panjang) dipotong
 * paksa supaya tidak ada teks yang keluar halaman.
 */
export function bungkusTeks(
  teks: string,
  ukuran: number,
  lebarMaks: number = LEBAR_TEKS,
): string[] {
  const kata = teks.split(/\s+/).filter((k) => k !== "");
  if (kata.length === 0) return [""];

  const hasil: string[] = [];
  let baris = "";
  for (const bagian of kata) {
    const calon = baris === "" ? bagian : `${baris} ${bagian}`;
    if (perkiraanLebar(calon, ukuran) <= lebarMaks) {
      baris = calon;
      continue;
    }
    if (baris !== "") hasil.push(baris);
    baris = "";
    // Kata yang lebih panjang dari satu baris: potong paksa per potongan.
    let sisa = bagian;
    const maksKarakter = Math.max(
      8,
      Math.floor(lebarMaks / (ukuran * PERKIRAAN_LEBAR_KARAKTER)),
    );
    while (keLatin1(sisa).length > maksKarakter) {
      hasil.push(sisa.slice(0, maksKarakter));
      sisa = sisa.slice(maksKarakter);
    }
    baris = sisa;
  }
  if (baris !== "") hasil.push(baris);
  return hasil.length > 0 ? hasil : [""];
}

/**
 * DOKUMEN RESMI — tata letak A4 bergaya laporan modern.
 *
 * Ditambahkan sebagai jalur terpisah dari `susunPdf` supaya laporan pendana dan
 * proposal yang sudah beredar tidak berubah bentuk. Primitifnya sengaja kecil
 * dan bertipe: banner navy, dua kartu informasi, tabel angka rata kanan dengan
 * nada (potongan/bersih), callout total, dan kotak peringatan. Pemanggil hanya
 * menyusun blok; pengukuran, pemenggalan halaman, dan nomor halaman diurus di
 * sini.
 */
export type NadaTeksResmi = "normal" | "potongan" | "bersih" | "total" | "tautan";

export type BarisKartuResmi = {
  label: string;
  nilai: string;
  nada?: NadaTeksResmi;
};

export type KartuResmi = {
  judul: string;
  baris: BarisKartuResmi[];
};

export type BarisTabelResmi = {
  sel: string[];
  nada?: NadaTeksResmi;
  tebal?: boolean;
};

export type BlokResmiPdf =
  | {
      jenis: "banner";
      merek: string;
      subjudul: string;
      nomor: string;
      tanggal: string;
    }
  /** Dua kartu informasi berdampingan; tinggi mengikuti kartu terpanjang. */
  | { jenis: "kartu"; kiri: KartuResmi; kanan: KartuResmi }
  | { jenis: "judul"; nomor?: string; teks: string }
  | {
      jenis: "tabel";
      kepala: string[];
      baris: BarisTabelResmi[];
      /** Bobot lebar kolom relatif; default sama rata. */
      bobot?: number[];
      /** Indeks kolom yang angkanya rata kanan. */
      rataKanan?: number[];
    }
  | { jenis: "paragraf"; teks: string; kecil?: boolean }
  | { jenis: "poin"; teks: string[] }
  | { jenis: "callout"; label: string; nilai: string; catatan?: string }
  | { jenis: "peringatan"; judul: string; teks: string }
  | { jenis: "jarak"; tinggi: number }
  | { jenis: "halamanBaru" };

export type DokumenResmiPdf = {
  /** Nomor dokumen yang diulang pada header halaman lanjutan. */
  nomor: string;
  /** Judul ringkas untuk header halaman lanjutan. */
  judul: string;
  /** Teks kaki di setiap halaman. */
  kaki: string;
  blok: BlokResmiPdf[];
};

type BarisSiap = {
  jenis:
    | "teks"
    | "rincian"
    | "kolom"
    | "tabel"
    | "pita"
    | "jarak"
    | "putus"
    | "kosong"
    | "garis";
  teks: string;
  /** Nilai rata kanan; kosong untuk baris teks biasa. */
  nilai: string;
  /** Kolom tengah untuk baris `kolom`. */
  tengah: string;
  /** Catatan kecil di bawah nilai pada `pita`. */
  catatan: string;
  /** Sel tabel; hanya dipakai baris `tabel`. */
  sel?: string[];
  /** Bobot lebar kolom tabel; default sama rata. */
  bobot?: number[];
  gaya: GayaBarisPdf;
  tinggi: number;
  jarakBawah: number;
};

/** Susun daftar baris siap gambar: gaya diubah menjadi ukuran dan tinggi nyata. */
export function siapkanBaris(baris: BarisPdf[]): BarisSiap[] {
  const hasil: BarisSiap[] = [];
  for (const entri of baris) {
    if ("kosong" in entri) {
      hasil.push({
        jenis: "kosong",
        teks: "",
        nilai: "",
        tengah: "",
        catatan: "",
        gaya: "kecil",
        tinggi: 9,
        jarakBawah: 0,
      });
      continue;
    }
    if ("garis" in entri) {
      hasil.push({
        jenis: "garis",
        teks: "",
        nilai: "",
        tengah: "",
        catatan: "",
        gaya: "kecil",
        tinggi: 8,
        jarakBawah: 6,
      });
      continue;
    }
    if ("jarak" in entri) {
      hasil.push({
        jenis: "jarak",
        teks: "",
        nilai: "",
        tengah: "",
        catatan: "",
        gaya: "kecil",
        tinggi: Math.max(0, entri.jarak),
        jarakBawah: 0,
      });
      continue;
    }
    if ("halamanBaru" in entri) {
      hasil.push({
        jenis: "putus",
        teks: "",
        nilai: "",
        tengah: "",
        catatan: "",
        gaya: "kecil",
        tinggi: 0,
        jarakBawah: 0,
      });
      continue;
    }
    if ("pita" in entri) {
      const adaCatatan =
        entri.pita.catatan !== undefined && entri.pita.catatan.trim() !== "";
      hasil.push({
        jenis: "pita",
        teks: entri.pita.label,
        nilai: entri.pita.nilai,
        tengah: "",
        catatan: entri.pita.catatan ?? "",
        gaya: "tebal",
        tinggi: adaCatatan ? 42 : 30,
        jarakBawah: 8,
      });
      continue;
    }
    if ("kolom" in entri) {
      const gaya: GayaBarisPdf =
        entri.tebal === true
          ? "tebal"
          : entri.kecil === true
            ? "kecil"
            : "biasa";
      hasil.push({
        jenis: "kolom",
        teks: entri.kolom.kiri,
        nilai: entri.kolom.kanan,
        tengah: entri.kolom.tengah,
        catatan: "",
        gaya,
        tinggi: UKURAN[gaya].leading,
        jarakBawah: 3,
      });
      continue;
    }
    if ("tabel" in entri) {
      const { kepala, baris, bobot } = entri.tabel;
      hasil.push({
        jenis: "tabel",
        teks: "",
        nilai: "",
        tengah: "",
        catatan: "",
        sel: kepala,
        bobot,
        gaya: "tebal",
        tinggi: 14,
        jarakBawah: 3,
      });
      for (const isi of baris) {
        hasil.push({
          jenis: "tabel",
          teks: "",
          nilai: "",
          tengah: "",
          catatan: "",
          sel: isi,
          bobot,
          gaya: "kecil",
          tinggi: 12.5,
          jarakBawah: 1.5,
        });
      }
      continue;
    }
    if ("label" in entri) {
      const dasar: GayaBarisPdf = entri.kecil === true ? "kecil" : "biasa";
      const gaya: GayaBarisPdf = entri.tebal === true ? "tebal" : dasar;
      const ukuran = UKURAN[gaya];
      // Ruang untuk nilai di kanan disisihkan lebih dulu, baru label dibungkus:
      // label panjang turun ke baris berikutnya, tidak pernah menabrak angkanya.
      const ruangNilai =
        entri.nilai === ""
          ? 0
          : perkiraanLebar(entri.nilai, ukuran.ukuran) + 16;
      const potongan = bungkusTeks(
        entri.label,
        ukuran.ukuran,
        Math.max(96, LEBAR_TEKS - ruangNilai),
      );
      potongan.forEach((bagian, i) => {
        hasil.push({
          jenis: "rincian",
          teks: bagian,
          nilai: i === potongan.length - 1 ? entri.nilai : "",
          tengah: "",
          catatan: "",
          gaya,
          tinggi: ukuran.leading,
          jarakBawah: ukuran.jarakBawah,
        });
      });
      continue;
    }
    const gaya = entri.gaya ?? "biasa";
    const ukuran = UKURAN[gaya];
    for (const potongan of bungkusTeks(entri.teks, ukuran.ukuran)) {
      hasil.push({
        jenis: "teks",
        teks: potongan,
        nilai: "",
        tengah: "",
        catatan: "",
        gaya,
        tinggi: ukuran.leading,
        jarakBawah: ukuran.jarakBawah,
      });
    }
  }
  return hasil;
}

/**
 * Bagi baris siap gambar menjadi halaman.
 *
 * Dipisah dari penggambaran supaya jumlah halaman diketahui SEBELUM isi ditulis:
 * kaki halaman menyebut "halaman N dari M", dan angka M itu hanya ada setelah
 * pembagian selesai.
 */
export function bagiHalaman(baris: BarisSiap[], tinggiKop = 0): BarisSiap[][] {
  const halaman: BarisSiap[][] = [];
  let kini: BarisSiap[] = [];
  const atasIsi = TINGGI_HALAMAN - MARGIN_ATAS - tinggiKop;
  let y = atasIsi;
  const batas = BATAS_BAWAH + TINGGI_KAKI;

  for (const entri of baris) {
    if (entri.jenis === "putus") {
      if (kini.length > 0) {
        halaman.push(kini);
        kini = [];
      }
      y = atasIsi;
      continue;
    }
    if (kini.length > 0 && y - entri.tinggi < batas) {
      halaman.push(kini);
      kini = [];
      y = atasIsi;
    }
    kini.push(entri);
    y -= entri.tinggi + entri.jarakBawah;
  }
  if (kini.length > 0 || halaman.length === 0) halaman.push(kini);
  return halaman;
}

function angka(nilai: number): string {
  return (Math.round(nilai * 100) / 100).toString();
}

/** Satu baris teks pada posisi tetap: `Tm` menempatkan titik awal teks. */
function operasiTeksMentah(
  teks: string,
  ukuran: number,
  font: "F1" | "F2",
  x: number,
  y: number,
  warna: string,
): string {
  return `${warna} rg BT /${font} ${angka(ukuran)} Tf 1 0 0 1 ${angka(x)} ${angka(y)} Tm (${escapePdf(teks)}) Tj ET`;
}

function operasiTeks(
  teks: string,
  gaya: GayaBarisPdf,
  x: number,
  y: number,
): string {
  const { ukuran, font } = UKURAN[gaya];
  return operasiTeksMentah(teks, ukuran, font, x, y, WARNA_GAYA[gaya]);
}

/** Lingkaran sebagai empat kurva Bézier — PDF tidak punya perintah lingkaran. */
function lingkaran(cx: number, cy: number, r: number, mode: "f" | "S"): string {
  const k = 0.5523 * r;
  return [
    `${angka(cx + r)} ${angka(cy)} m`,
    `${angka(cx + r)} ${angka(cy + k)} ${angka(cx + k)} ${angka(cy + r)} ${angka(cx)} ${angka(cy + r)} c`,
    `${angka(cx - k)} ${angka(cy + r)} ${angka(cx - r)} ${angka(cy + k)} ${angka(cx - r)} ${angka(cy)} c`,
    `${angka(cx - r)} ${angka(cy - k)} ${angka(cx - k)} ${angka(cy - r)} ${angka(cx)} ${angka(cy - r)} c`,
    `${angka(cx + k)} ${angka(cy - r)} ${angka(cx + r)} ${angka(cy - k)} ${angka(cx + r)} ${angka(cy)} c`,
    mode,
  ].join(" ");
}

/**
 * Lambang PINDAI dalam vektor: brankas bertinta dengan dial kuningan.
 *
 * Digambar langsung, bukan ditanam sebagai gambar: PDF hanya punya fon baku di
 * sini, dan lambang 30pt tetap tajam saat dicetak maupun diperbesar di layar.
 */
function operasiLogo(x: number, atas: number): string {
  const lebar = 30;
  const tinggi = 28;
  const y = atas - tinggi;
  const cx = x + lebar / 2;
  const cy = y + tinggi / 2 + 0.5;
  return [
    "q",
    `${WARNA.tinta} rg ${WARNA.emas} RG 0.9 w`,
    `${angka(x)} ${angka(y)} ${lebar} ${tinggi} re B`,
    "0.96 0.95 0.91 rg",
    `${angka(x + 3)} ${angka(y + 3)} ${lebar - 6} ${tinggi - 6} re f`,
    // Dua kuping kuningan di sisi kiri: ciri lambang PINDAI, dan satu-satunya
    // bagian yang membedakannya dari kotak berbingkai biasa saat dicetak kecil.
    `${WARNA.emas} rg`,
    `${angka(x - 2)} ${angka(y + 7)} 2.6 4.4 re f`,
    `${angka(x - 2)} ${angka(y + 17)} 2.6 4.4 re f`,
    `${WARNA.tinta} rg`,
    lingkaran(cx, cy, 8.2, "f"),
    `${WARNA.emas} RG 1 w`,
    lingkaran(cx, cy, 6.2, "S"),
    `${WARNA.emas} rg`,
    lingkaran(cx, cy, 1.7, "f"),
    "0.96 0.95 0.91 RG 0.9 w",
    `${angka(cx)} ${angka(cy)} m ${angka(cx + 4.6)} ${angka(cy - 3.2)} l S`,
    `${angka(cx)} ${angka(cy)} m ${angka(cx - 4.6)} ${angka(cy + 3.2)} l S`,
    `${angka(cx)} ${angka(cy)} m ${angka(cx + 4.6)} ${angka(cy + 3.2)} l S`,
    `${angka(cx)} ${angka(cy)} m ${angka(cx - 4.6)} ${angka(cy - 3.2)} l S`,
    "Q",
  ].join("\n");
}

/** Kop surat: lambang, nama layanan, keterangan, rujukan, lalu garis ganda. */
function operasiKop(kop: KopPdf): string {
  const atas = TINGGI_HALAMAN - MARGIN_ATAS;
  const teksX = MARGIN_SISI + 40;
  const operasi = [operasiLogo(MARGIN_SISI, atas)];

  operasi.push(
    operasiTeksMentah(kop.nama, 12, "F2", teksX, atas - 10, WARNA.tinta),
  );
  if (kop.keterangan !== undefined && kop.keterangan.trim() !== "") {
    operasi.push(
      operasiTeksMentah(kop.keterangan, 8, "F1", teksX, atas - 23, WARNA.redup),
    );
  }
  if (kop.referensi !== undefined && kop.referensi.trim() !== "") {
    const referensi = kop.referensi;
    operasi.push(
      operasiTeksMentah(
        referensi,
        8,
        "F2",
        LEBAR_HALAMAN - MARGIN_SISI - perkiraanLebar(referensi, 8),
        atas - 10,
        WARNA.emas,
      ),
    );
  }

  const ujung = LEBAR_HALAMAN - MARGIN_SISI;
  operasi.push(
    `${WARNA.emas} RG 1 w ${angka(MARGIN_SISI)} ${angka(atas - 38)} m ${angka(ujung)} ${angka(atas - 38)} l S`,
    `${WARNA.tinta} RG 0.4 w ${angka(MARGIN_SISI)} ${angka(atas - 40.4)} m ${angka(ujung)} ${angka(atas - 40.4)} l S`,
  );
  return operasi.join("\n");
}

/** Garis pemisah bagian: rambut kuningan, bukan garis hitam penuh. */
function operasiGaris(y: number): string {
  return `${WARNA.emas} RG 0.7 w ${angka(MARGIN_SISI)} ${angka(y)} m ${angka(LEBAR_HALAMAN - MARGIN_SISI)} ${angka(y)} l S`;
}

/**
 * Kop ringkas untuk dokumen bersampul: satu baris identitas, garis rambut,
 * lalu isi. Lambang besar hanya dipakai di sampul supaya halaman isi terasa
 * sebagai kelanjutan dokumen, bukan laporan baru yang diulang.
 */
function operasiKopRingkas(kop: KopPdf): string {
  const atas = TINGGI_HALAMAN - MARGIN_ATAS;
  const ujung = LEBAR_HALAMAN - MARGIN_SISI;
  const operasi = [
    operasiTeksMentah(kop.nama, 7.5, "F2", MARGIN_SISI, atas - 10, WARNA.tinta),
  ];
  if (kop.referensi !== undefined && kop.referensi.trim() !== "") {
    operasi.push(
      operasiTeksMentah(
        kop.referensi,
        7.5,
        "F2",
        ujung - perkiraanLebar(kop.referensi, 7.5),
        atas - 10,
        WARNA.emas,
      ),
    );
  }
  operasi.push(
    `${WARNA.emas} RG 0.9 w ${angka(MARGIN_SISI)} ${angka(atas - 20)} m ${angka(ujung)} ${angka(atas - 20)} l S`,
  );
  return operasi.join("\n");
}

/**
 * Isi satu halaman: kop (bila ada), baris isi, lalu kaki halaman.
 *
 * Dokumen berkop mendapat kaki terbagi dua: keterangan di kiri, nomor halaman
 * di kanan. Dokumen lama tanpa kop tetap memakai satu baris kaki yang sama
 * seperti sebelumnya, supaya berkas yang sudah beredar tidak berubah bentuk.
 */
function isiHalaman(
  baris: BarisSiap[],
  dokumen: { kop?: KopPdf; sampul?: SampulPdf; kaki?: string },
  nomorHalaman: number,
  jumlahHalaman: number,
): string {
  const ringkas = dokumen.sampul !== undefined;
  const operasi: string[] = [];
  if (dokumen.kop !== undefined) {
    operasi.push(
      ringkas ? operasiKopRingkas(dokumen.kop) : operasiKop(dokumen.kop),
    );
  }

  const tinggiKop =
    dokumen.kop === undefined ? 0 : ringkas ? TINGGI_KOP_RINGKAS : TINGGI_KOP;
  let y = TINGGI_HALAMAN - MARGIN_ATAS - tinggiKop;
  for (const entri of baris) {
    if (entri.jenis === "teks" || entri.jenis === "rincian") {
      const ukuran = UKURAN[entri.gaya].ukuran;
      operasi.push(
        operasiTeks(entri.teks, entri.gaya, MARGIN_SISI, y - ukuran),
      );
      if (entri.jenis === "rincian" && entri.nilai !== "") {
        operasi.push(
          operasiTeks(
            entri.nilai,
            entri.gaya,
            LEBAR_HALAMAN - MARGIN_SISI - perkiraanLebar(entri.nilai, ukuran),
            y - ukuran,
          ),
        );
      }
    } else if (entri.jenis === "kolom") {
      const ukuran = UKURAN[entri.gaya].ukuran;
      const garisDasar = y - ukuran;
      operasi.push(
        operasiTeks(entri.teks, entri.gaya, MARGIN_SISI, garisDasar),
      );
      if (entri.tengah !== "") {
        operasi.push(
          operasiTeks(
            entri.tengah,
            entri.gaya,
            MARGIN_SISI + LEBAR_TEKS * 0.34,
            garisDasar,
          ),
        );
      }
      if (entri.nilai !== "") {
        operasi.push(
          operasiTeks(
            entri.nilai,
            entri.gaya,
            LEBAR_HALAMAN - MARGIN_SISI - perkiraanLebar(entri.nilai, ukuran),
            garisDasar,
          ),
        );
      }
    } else if (entri.jenis === "tabel") {
      // Satu ukuran huruf untuk seluruh tabel supaya enam kolom tetap muat.
      // Kepala kolom memakai F2; isinya F1, jadi angka tidak ikut menebal.
      const ukuran = 7.8;
      const garisDasar = y - ukuran;
      const sel = entri.sel ?? [];
      const bobot = entri.bobot ?? sel.map(() => 1);
      const jumlahBobot = bobot.reduce((jumlah, nilai) => jumlah + nilai, 0);
      const tebal = entri.gaya === "tebal";
      let x = MARGIN_SISI;
      sel.forEach((isi, i) => {
        if (isi !== "") {
          operasi.push(
            operasiTeksMentah(
              isi,
              ukuran,
              tebal ? "F2" : "F1",
              x,
              garisDasar,
              tebal ? WARNA.tinta : WARNA.badan,
            ),
          );
        }
        x +=
          (LEBAR_TEKS * (bobot[i] ?? 1)) /
          (jumlahBobot === 0 ? 1 : jumlahBobot);
      });
    } else if (entri.jenis === "pita") {
      const bawah = y - entri.tinggi;
      const ujung = LEBAR_HALAMAN - MARGIN_SISI;
      operasi.push(
        `0.985 0.972 0.94 rg ${angka(MARGIN_SISI)} ${angka(bawah)} ${angka(LEBAR_TEKS)} ${angka(entri.tinggi)} re f`,
        `${WARNA.emas} RG 0.8 w ${angka(MARGIN_SISI)} ${angka(bawah)} ${angka(LEBAR_TEKS)} ${angka(entri.tinggi)} re S`,
        operasiTeksMentah(
          entri.teks,
          8.5,
          "F2",
          MARGIN_SISI + 12,
          y - 17,
          WARNA.tinta,
        ),
        operasiTeksMentah(
          entri.nilai,
          14,
          "F2",
          ujung - 12 - perkiraanLebar(entri.nilai, 14),
          y - 19,
          WARNA.tinta,
        ),
      );
      if (entri.catatan !== "") {
        operasi.push(
          operasiTeksMentah(
            entri.catatan,
            7.5,
            "F1",
            MARGIN_SISI + 12,
            y - 33,
            WARNA.redup,
          ),
        );
      }
    } else if (entri.jenis === "garis") {
      operasi.push(operasiGaris(y));
    }
    y -= entri.tinggi + entri.jarakBawah;
  }

  if (dokumen.kop !== undefined) {
    operasi.push(
      `0.7 w 0.82 0.87 0.84 RG ${angka(MARGIN_SISI)} 58 m ${angka(LEBAR_HALAMAN - MARGIN_SISI)} 58 l S`,
    );
    // Tanpa teks kaki khusus, cukup nama layanannya saja — bukan nama lengkap
    // dari kop, yang akan tercetak dua kali pada halaman yang sama.
    const kiri =
      dokumen.kaki !== undefined && dokumen.kaki.trim() !== ""
        ? dokumen.kaki.trim()
        : "PINDAI";
    operasi.push(
      operasiTeksMentah(kiri, 8, "F1", MARGIN_SISI, KAKI_BASELINE, WARNA.redup),
    );
    const kanan = `Halaman ${nomorHalaman} dari ${jumlahHalaman}`;
    operasi.push(
      operasiTeksMentah(
        kanan,
        8,
        "F1",
        LEBAR_HALAMAN - MARGIN_SISI - perkiraanLebar(kanan, 8),
        KAKI_BASELINE,
        WARNA.redup,
      ),
    );
  } else {
    const kaki = [
      dokumen.kaki?.trim(),
      `Halaman ${nomorHalaman} dari ${jumlahHalaman}`,
    ]
      .filter(
        (bagian): bagian is string => bagian !== undefined && bagian !== "",
      )
      .join("  -  ");
    operasi.push(operasiTeks(kaki, "kecil", MARGIN_SISI, KAKI_BASELINE));
  }
  return `${operasi.join("\n")}\n`;
}

/**
 * Halaman sampul: lambang, judul besar, tiga angka kunci di kotak kertas, lalu
 * daftar isi. Halaman ini sengaja tidak memakai kop atau nomor halaman, supaya
 * dokumen terbaca sebagai satu penawaran, bukan bundel laporan.
 */
function isiSampul(sampul: SampulPdf, kop?: KopPdf): string {
  const atas = TINGGI_HALAMAN - MARGIN_ATAS;
  const ujung = LEBAR_HALAMAN - MARGIN_SISI;
  const nama = kop?.nama ?? "PINJAM GADAI DIGITAL (PINDAI)";
  const operasi: string[] = [
    operasiLogo(MARGIN_SISI, atas),
    operasiTeksMentah(nama, 11, "F2", MARGIN_SISI + 42, atas - 12, WARNA.tinta),
  ];
  if (kop?.keterangan !== undefined && kop.keterangan.trim() !== "") {
    operasi.push(
      operasiTeksMentah(
        kop.keterangan,
        7.5,
        "F1",
        MARGIN_SISI + 42,
        atas - 25,
        WARNA.redup,
      ),
    );
  }

  const labelJenis = "PROPOSAL PENDANAAN";
  operasi.push(
    operasiTeksMentah(
      labelJenis,
      8,
      "F2",
      ujung - perkiraanLebar(labelJenis, 8),
      atas - 12,
      WARNA.emas,
    ),
    operasiGaris(atas - 44),
    `${WARNA.tinta} RG 0.4 w ${angka(MARGIN_SISI)} ${angka(atas - 46)} m ${angka(ujung)} ${angka(atas - 46)} l S`,
  );

  let y = atas - 98;
  operasi.push(
    operasiTeksMentah(
      "UNTUK CALON PENDANA",
      8,
      "F2",
      MARGIN_SISI,
      y,
      WARNA.emas,
    ),
  );
  y -= 32;
  for (const potongan of bungkusTeks(sampul.judul, 27, LEBAR_TEKS - 10)) {
    operasi.push(
      operasiTeksMentah(potongan, 27, "F2", MARGIN_SISI, y, WARNA.tinta),
    );
    y -= 32;
  }
  y -= 2;
  for (const potongan of bungkusTeks(sampul.subjudul, 10.5, LEBAR_TEKS - 34)) {
    operasi.push(
      operasiTeksMentah(potongan, 10.5, "F1", MARGIN_SISI, y, WARNA.badan),
    );
    y -= 15;
  }
  y -= 10;
  operasi.push(
    operasiTeksMentah(sampul.meta, 8.5, "F1", MARGIN_SISI, y, WARNA.redup),
  );

  // Kotak tiga angka kunci. Satu-satunya bidang berwarna di sampul, jadi mata
  // berhenti di angka yang paling menentukan keputusan pembaca.
  const tinggiKotak = 104;
  const atasKotak = y - 30;
  const bawahKotak = atasKotak - tinggiKotak;
  operasi.push(
    `0.985 0.972 0.94 rg ${angka(MARGIN_SISI)} ${angka(bawahKotak)} ${angka(LEBAR_TEKS)} ${angka(tinggiKotak)} re f`,
    `${WARNA.emas} RG 0.9 w ${angka(MARGIN_SISI)} ${angka(bawahKotak)} ${angka(LEBAR_TEKS)} ${angka(tinggiKotak)} re S`,
  );
  const kolomLebar = LEBAR_TEKS / 3;
  sampul.fakta.slice(0, 3).forEach((fakta, i) => {
    const x = MARGIN_SISI + 18 + i * kolomLebar;
    operasi.push(
      operasiTeksMentah(fakta.nilai, 22, "F2", x, bawahKotak + 52, WARNA.tinta),
      operasiTeksMentah(
        fakta.label,
        7.5,
        "F1",
        x,
        bawahKotak + 33,
        WARNA.redup,
      ),
    );
    if (i > 0) {
      const xGaris = MARGIN_SISI + i * kolomLebar;
      operasi.push(
        `${WARNA.emas} RG 0.5 w ${angka(xGaris)} ${angka(bawahKotak + 16)} m ${angka(xGaris)} ${angka(atasKotak - 16)} l S`,
      );
    }
  });

  y = bawahKotak - 30;
  for (const potongan of bungkusTeks(sampul.catatan, 9, LEBAR_TEKS - 60)) {
    operasi.push(
      operasiTeksMentah(potongan, 9, "F1", MARGIN_SISI, y, WARNA.badan),
    );
    y -= 14;
  }

  y -= 26;
  operasi.push(
    operasiTeksMentah("ISI DOKUMEN", 8, "F2", MARGIN_SISI, y, WARNA.emas),
  );
  y -= 22;
  for (const butir of sampul.isi) {
    const potongan = bungkusTeks(butir, 9.5, LEBAR_TEKS - 22);
    operasi.push(
      `${WARNA.emas} rg ${angka(MARGIN_SISI)} ${angka(y + 3)} 2.2 2.2 re f`,
    );
    for (const bagian of potongan) {
      operasi.push(
        operasiTeksMentah(bagian, 9.5, "F1", MARGIN_SISI + 12, y, WARNA.badan),
      );
      y -= 13;
    }
    y -= 8;
  }

  // Kalimat penutup ditempatkan di ruang bawah sampul supaya halaman tidak
  // berakhir dengan kekosongan yang tidak disengaja.
  if (sampul.penutup !== undefined && sampul.penutup.trim() !== "") {
    operasi.push(operasiGaris(176));
    let barisPenutup = 154;
    for (const potongan of bungkusTeks(sampul.penutup, 12, LEBAR_TEKS - 40)) {
      operasi.push(
        operasiTeksMentah(
          potongan,
          12,
          "F2",
          MARGIN_SISI,
          barisPenutup,
          WARNA.tinta,
        ),
      );
      barisPenutup -= 18;
    }
  }

  // Kaki sampul: garis rambut, lalu catatan bahwa dokumen ini bukan perjanjian.
  operasi.push(operasiGaris(98));
  let kaki = 82;
  for (const potongan of bungkusTeks(sampul.kaki, 8.5, LEBAR_TEKS - 10)) {
    operasi.push(
      operasiTeksMentah(potongan, 8.5, "F1", MARGIN_SISI, kaki, WARNA.redup),
    );
    kaki -= 12;
  }

  return `${operasi.join("\n")}\n`;
}

/* ==========================================================================
   DOKUMEN RESMI — ukuran dan warna
   ========================================================================== */

const R_MARGIN = 42;
const R_ATAS = 40;
const R_BAWAH = 46;
const R_LEBAR = LEBAR_HALAMAN - R_MARGIN * 2;
const R_BANNER = 74;
const R_JARAK_BANNER = 14;
const R_HEADER_LANJUT = 22;

const R = {
  navy: "0.059 0.090 0.165",
  navyLembut: "0.118 0.161 0.231",
  sky: "0.220 0.741 0.973",
  putih: "1 1 1",
  bannerRedup: "0.796 0.835 0.882",
  tinta: "0.059 0.090 0.165",
  teks: "0.204 0.255 0.337",
  teksLembut: "0.278 0.333 0.412",
  label: "0.392 0.455 0.545",
  redup: "0.580 0.639 0.722",
  garis: "0.886 0.910 0.941",
  kepala: "0.945 0.961 0.976",
  kartu: "0.973 0.980 0.988",
  merah: "0.863 0.149 0.149",
  hijau: "0.086 0.396 0.204",
  hijauMuda: "0.941 0.992 0.957",
  biru: "0.118 0.306 0.847",
  biruMuda: "0.937 0.965 1.000",
  biruTepi: "0.749 0.859 1.000",
  kuning: "0.573 0.251 0.055",
  kuningTeks: "0.471 0.208 0.059",
  kuningMuda: "1.000 0.984 0.925",
  kuningTepi: "0.992 0.902 0.529",
} as const;

/** Isi kotak: latar dan tepi tipis, dipakai kartu, tabel, dan callout. */
function kotakResmi(
  x: number,
  y: number,
  lebar: number,
  tinggi: number,
  isi: string,
  tepi?: string,
  tebalTepi = 0.8,
): string {
  const operasi = [`${isi} rg ${angka(x)} ${angka(y)} ${angka(lebar)} ${angka(tinggi)} re f`];
  if (tepi !== undefined) {
    operasi.push(
      `${tepi} RG ${tebalTepi} w ${angka(x)} ${angka(y)} ${angka(lebar)} ${angka(tinggi)} re S`,
    );
  }
  return operasi.join("\n");
}

function teksResmi(
  teks: string,
  ukuran: number,
  font: "F1" | "F2",
  x: number,
  y: number,
  warna: string,
): string {
  return operasiTeksMentah(teks, ukuran, font, x, y, warna);
}

function teksResmiKanan(
  teks: string,
  ukuran: number,
  font: "F1" | "F2",
  kanan: number,
  y: number,
  warna: string,
): string {
  return teksResmi(
    teks,
    ukuran,
    font,
    kanan - perkiraanLebar(teks, ukuran),
    y,
    warna,
  );
}

function warnaNada(nada: NadaTeksResmi | undefined): string {
  if (nada === "potongan") return R.merah;
  if (nada === "bersih" || nada === "total") return R.hijau;
  if (nada === "tautan") return R.biru;
  return R.teks;
}

/** Nominal potongan diberi tanda minus hanya bila memang ada potongannya. */
function nilaiTabelResmi(nilai: string, nada: NadaTeksResmi | undefined): string {
  if (nada !== "potongan") return nilai;
  if (! nilai.startsWith("Rp ") || nilai === "Rp 0") return nilai;
  return `-${nilai}`;
}

function garisResmi(y: number, warna = R.garis, tebal = 0.7): string {
  return `${warna} RG ${tebal} w ${angka(R_MARGIN)} ${angka(y)} m ${angka(LEBAR_HALAMAN - R_MARGIN)} ${angka(y)} l S`;
}

/** Tinggi dua kartu informasi; kartu terpanjang yang menentukan. */
function tinggiKartu(kartu: BlokResmiPdf & { jenis: "kartu" }): number {
  const baris = Math.max(kartu.kiri.baris.length, kartu.kanan.baris.length);
  return 34 + baris * 16;
}

function lebarTabelResmi(bobot: number[] | undefined, jumlah: number): number[] {
  const dasar = bobot ?? Array.from({ length: jumlah }, () => 1);
  const total = dasar.reduce((n, nilai) => n + nilai, 0) || 1;
  return dasar.map((nilai) => (R_LEBAR * nilai) / total);
}

/** Tinggi satu baris tabel, termasuk deskripsi yang turun dua baris. */
function tinggiBarisTabel(
  baris: BarisTabelResmi,
  lebar: number[],
  rataKanan: number[],
): number {
  let barisTeks = 1;
  baris.sel.forEach((sel, i) => {
    if (rataKanan.includes(i)) return;
    const potongan = bungkusTeks(sel, 8.2, Math.max(40, lebar[i] - 16)).length;
    barisTeks = Math.max(barisTeks, potongan);
  });
  return Math.max(20, barisTeks * 10 + 10);
}

function tinggiBlokResmi(blok: BlokResmiPdf): number {
  if (blok.jenis === "banner") return R_BANNER + R_JARAK_BANNER;
  if (blok.jenis === "kartu") return tinggiKartu(blok);
  if (blok.jenis === "judul") return 25;
  if (blok.jenis === "tabel") {
    const lebar = lebarTabelResmi(blok.bobot, blok.kepala.length);
    const rataKanan = blok.rataKanan ?? [];
    return (
      22 +
      blok.baris.reduce((n, baris) => n + tinggiBarisTabel(baris, lebar, rataKanan), 0) +
      4
    );
  }
  if (blok.jenis === "paragraf") {
    const ukuran = blok.kecil === true ? 7.8 : 8.6;
    return bungkusTeks(blok.teks, ukuran, R_LEBAR).length * 11.5 + 4;
  }
  if (blok.jenis === "poin") {
    const tinggi = blok.teks.reduce(
      (n, teks) => n + bungkusTeks(teks, 7.8, R_LEBAR - 12).length * 10.5 + 3,
      0,
    );
    return tinggi + 4;
  }
  if (blok.jenis === "callout") {
    const catatan =
      blok.catatan === undefined || blok.catatan.trim() === ""
        ? 0
        : bungkusTeks(blok.catatan, 7.8, R_LEBAR - 24).length * 10.5 + 3;
    return 48 + catatan;
  }
  if (blok.jenis === "peringatan") {
    return 30 + bungkusTeks(blok.teks, 8, R_LEBAR - 28).length * 10.5;
  }
  if (blok.jenis === "jarak") return blok.tinggi;
  return 0;
}

/* ==========================================================================
   DOKUMEN RESMI — penggambaran blok
   ========================================================================== */

function gambarBanner(blok: BlokResmiPdf & { jenis: "banner" }, y: number): string {
  const x = R_MARGIN;
  const kanan = LEBAR_HALAMAN - R_MARGIN;
  const bawah = y - R_BANNER;
  return [
    kotakResmi(x, bawah, R_LEBAR, R_BANNER, R.navy),
    teksResmi(blok.merek, 21, "F2", x + 18, y - 28, R.sky),
    teksResmi(blok.subjudul.toUpperCase(), 7.6, "F1", x + 19, y - 44, R.bannerRedup),
    teksResmiKanan(blok.nomor, 10.5, "F2", kanan - 18, y - 27, R.putih),
    teksResmiKanan(blok.tanggal, 7.8, "F1", kanan - 18, y - 43, R.bannerRedup),
    `${R.navyLembut} RG 0.6 w ${angka(kanan - 250)} ${angka(bawah + 14)} m ${angka(kanan - 250)} ${angka(y - 14)} l S`,
  ].join("\n");
}

function gambarKartu(blok: BlokResmiPdf & { jenis: "kartu" }, y: number): string {
  const tinggi = tinggiKartu(blok);
  const bawah = y - tinggi;
  const celah = 12;
  const lebar = (R_LEBAR - celah) / 2;
  const operasi: string[] = [];

  [blok.kiri, blok.kanan].forEach((kartu, indeks) => {
    const x = R_MARGIN + indeks * (lebar + celah);
    const kanan = x + lebar;
    operasi.push(kotakResmi(x, bawah, lebar, tinggi, R.kartu, R.garis));
    operasi.push(teksResmi(kartu.judul.toUpperCase(), 7.4, "F2", x + 12, y - 17, R.teksLembut));
    operasi.push(
      `${R.garis} RG 0.7 w ${angka(x + 12)} ${angka(y - 24)} m ${angka(kanan - 12)} ${angka(y - 24)} l S`,
    );
    kartu.baris.forEach((baris, i) => {
      const garisDasar = y - 39 - i * 16;
      operasi.push(teksResmi(baris.label, 8.1, "F1", x + 12, garisDasar, R.label));
      const ukuran = perkiraanLebar(baris.nilai, 8.1) > lebar - 28 ? 7.2 : 8.1;
      operasi.push(
        teksResmiKanan(
          baris.nilai,
          ukuran,
          "F2",
          kanan - 12,
          garisDasar,
          warnaNada(baris.nada),
        ),
      );
    });
  });
  return operasi.join("\n");
}

function gambarJudul(blok: BlokResmiPdf & { jenis: "judul" }, y: number): string {
  const teks = blok.nomor === undefined ? blok.teks : `${blok.nomor}. ${blok.teks}`;
  return teksResmi(teks, 10.5, "F2", R_MARGIN, y - 13, R.tinta);
}

function gambarTabel(blok: BlokResmiPdf & { jenis: "tabel" }, y: number): string {
  const jumlahKolom = blok.kepala.length;
  const lebar = lebarTabelResmi(blok.bobot, jumlahKolom);
  const rataKanan = blok.rataKanan ?? [];
  const operasi: string[] = [];
  const atas = y;
  const tinggiKepala = 22;

  operasi.push(kotakResmi(R_MARGIN, y - tinggiKepala, R_LEBAR, tinggiKepala, R.kepala, R.garis));
  let x = R_MARGIN;
  blok.kepala.forEach((judul, i) => {
    const posisi = rataKanan.includes(i) ? x + lebar[i] - 8 - perkiraanLebar(judul, 7.4) : x + 8;
    operasi.push(teksResmi(judul, 7.4, "F2", posisi, y - 14, R.teksLembut));
    x += lebar[i];
  });
  y -= tinggiKepala;

  for (const baris of blok.baris) {
    const tinggi = tinggiBarisTabel(baris, lebar, rataKanan);
    const nada = baris.nada;
    if (nada === "bersih" || nada === "total") {
      operasi.push(kotakResmi(R_MARGIN, y - tinggi, R_LEBAR, tinggi, R.hijauMuda));
    }
    operasi.push(garisResmi(y));
    let kiri = R_MARGIN;
    baris.sel.forEach((sel, i) => {
      const warna = baris.tebal === true ? R.tinta : warnaNada(nada);
      const font = baris.tebal === true || nada === "bersih" || nada === "total" ? "F2" : "F1";
      if (rataKanan.includes(i)) {
        const nilai = nilaiTabelResmi(sel, nada);
        operasi.push(
          teksResmiKanan(nilai, 8.2, font, kiri + lebar[i] - 8, y - tinggi + 7.5, warna),
        );
      } else {
        const potongan = bungkusTeks(sel, 8.2, Math.max(40, lebar[i] - 16));
        potongan.forEach((bagian, n) => {
          operasi.push(teksResmi(bagian, 8.2, font, kiri + 8, y - tinggi + 14 - n * 10, warna));
        });
      }
      kiri += lebar[i];
    });
    y -= tinggi;
  }
  operasi.push(garisResmi(y), garisResmi(atas));
  return operasi.join("\n");
}

function gambarCallout(blok: BlokResmiPdf & { jenis: "callout" }, y: number): string {
  const catatan =
    blok.catatan === undefined || blok.catatan.trim() === ""
      ? []
      : bungkusTeks(blok.catatan, 7.8, R_LEBAR - 24);
  const tinggi = 48 + catatan.length * 10.5;
  const bawah = y - tinggi;
  const operasi = [
    kotakResmi(R_MARGIN, bawah, R_LEBAR, tinggi, R.biruMuda, R.biruTepi),
    `${R.biru} rg ${angka(R_MARGIN)} ${angka(bawah)} 3 ${angka(tinggi)} re f`,
    teksResmi(blok.label, 8.8, "F2", R_MARGIN + 16, y - 18, R.biru),
    teksResmiKanan(blok.nilai, 19, "F2", LEBAR_HALAMAN - R_MARGIN - 16, y - 25, R.biru),
  ];
  catatan.forEach((baris, i) => {
    operasi.push(
      teksResmi(baris, 7.8, "F1", R_MARGIN + 16, y - 36 - i * 10.5, R.teksLembut),
    );
  });
  return operasi.join("\n");
}

function gambarPeringatan(blok: BlokResmiPdf & { jenis: "peringatan" }, y: number): string {
  const potongan = bungkusTeks(blok.teks, 8, R_LEBAR - 28);
  const tinggi = 30 + potongan.length * 10.5;
  const bawah = y - tinggi;
  const operasi = [
    kotakResmi(R_MARGIN, bawah, R_LEBAR, tinggi, R.kuningMuda, R.kuningTepi),
    `${R.kuningTepi} rg ${angka(R_MARGIN)} ${angka(bawah)} 3 ${angka(tinggi)} re f`,
    teksResmi(`! ${blok.judul}`, 8.6, "F2", R_MARGIN + 14, y - 16, R.kuning),
  ];
  potongan.forEach((baris, i) => {
    operasi.push(teksResmi(baris, 8, "F1", R_MARGIN + 14, y - 29 - i * 10.5, R.kuningTeks));
  });
  return operasi.join("\n");
}

function gambarBlokResmi(blok: BlokResmiPdf, y: number): string {
  if (blok.jenis === "banner") return gambarBanner(blok, y);
  if (blok.jenis === "kartu") return gambarKartu(blok, y);
  if (blok.jenis === "judul") return gambarJudul(blok, y);
  if (blok.jenis === "tabel") return gambarTabel(blok, y);
  if (blok.jenis === "callout") return gambarCallout(blok, y);
  if (blok.jenis === "peringatan") return gambarPeringatan(blok, y);
  if (blok.jenis === "paragraf") {
    const ukuran = blok.kecil === true ? 7.8 : 8.6;
    return bungkusTeks(blok.teks, ukuran, R_LEBAR)
      .map((baris, i) =>
        teksResmi(
          baris,
          ukuran,
          "F1",
          R_MARGIN,
          y - 9 - i * 11.5,
          blok.kecil === true ? R.label : R.teksLembut,
        ),
      )
      .join("\n");
  }
  if (blok.jenis === "poin") {
    const operasi: string[] = [];
    let barisY = y;
    for (const teks of blok.teks) {
      const potongan = bungkusTeks(teks, 7.8, R_LEBAR - 12);
      operasi.push(`${R.redup} rg ${angka(R_MARGIN)} ${angka(barisY - 6)} 2 2 re f`);
      potongan.forEach((bagian, i) => {
        operasi.push(teksResmi(bagian, 7.8, "F1", R_MARGIN + 10, barisY - 8 - i * 10.5, R.label));
      });
      barisY -= 10.5 * potongan.length + 3;
    }
    return operasi.join("\n");
  }
  return "";
}

/** Bagi blok menjadi halaman; banner hanya boleh membuka halaman pertama. */
function bagiHalamanResmi(blok: BlokResmiPdf[]): BlokResmiPdf[][] {
  const halaman: BlokResmiPdf[][] = [];
  let kini: BlokResmiPdf[] = [];
  let y = TINGGI_HALAMAN - R_ATAS;

  const batas = R_BAWAH + 12;
  for (let i = 0; i < blok.length; i += 1) {
    const entri = blok[i];
    if (entri.jenis === "halamanBaru") {
      if (kini.length > 0) {
        halaman.push(kini);
        kini = [];
      }
      y = TINGGI_HALAMAN - R_ATAS - R_HEADER_LANJUT;
      continue;
    }
    const tinggi = tinggiBlokResmi(entri);
    // Judul bagian tidak boleh tertinggal sendirian di dasar halaman. Saat
    // blok berikutnya tidak muat, judul ikut pindah ke halaman baru.
    const berikut = blok[i + 1];
    const tinggiJaga =
      entri.jenis === "judul" && berikut !== undefined && berikut.jenis !== "halamanBaru"
        ? tinggi + tinggiBlokResmi(berikut)
        : tinggi;
    if (kini.length > 0 && y - tinggiJaga < batas) {
      halaman.push(kini);
      kini = [];
      y = TINGGI_HALAMAN - R_ATAS - R_HEADER_LANJUT;
    }
    kini.push(entri);
    y -= tinggi;
    if (entri.jenis === "banner") {
      y = TINGGI_HALAMAN - R_ATAS - R_BANNER - R_JARAK_BANNER;
    }
  }
  if (kini.length > 0 || halaman.length === 0) halaman.push(kini);
  return halaman;
}

function isiHalamanResmi(
  blok: BlokResmiPdf[],
  dok: DokumenResmiPdf,
  nomorHalaman: number,
  jumlahHalaman: number,
): string {
  const operasi: string[] = [];
  let y = TINGGI_HALAMAN - R_ATAS;
  const adaBanner = blok[0]?.jenis === "banner";

  if (!adaBanner) {
    operasi.push(
      teksResmi(dok.judul, 7.6, "F2", R_MARGIN, y - 10, R.tinta),
      teksResmiKanan(dok.nomor, 7.6, "F1", LEBAR_HALAMAN - R_MARGIN, y - 10, R.redup),
      garisResmi(y - 18),
    );
    y -= R_HEADER_LANJUT;
  }

  for (const entri of blok) {
    const tinggi = tinggiBlokResmi(entri);
    if (entri.jenis !== "banner") {
      operasi.push(gambarBlokResmi(entri, y));
      y -= tinggi;
    } else {
      operasi.push(gambarBlokResmi(entri, y));
      y -= R_BANNER + R_JARAK_BANNER;
    }
  }

  // Kaki: garis rambut, disclaimer kiri, nomor halaman kanan.
  operasi.push(garisResmi(54, R.garis));
  const kaki =
    dok.kaki.length > 92 ? `${dok.kaki.slice(0, 90)}...` : dok.kaki;
  operasi.push(teksResmi(kaki, 7.2, "F1", R_MARGIN, 38, R.redup));
  const nomor = `Halaman ${nomorHalaman} dari ${jumlahHalaman}`;
  operasi.push(
    teksResmiKanan(nomor, 7.2, "F1", LEBAR_HALAMAN - R_MARGIN, 38, R.redup),
  );
  return `${operasi.join("\n")}\n`;
}

/**
 * Susun dokumen resmi A4 dengan banner, kartu, tabel, callout, dan peringatan.
 *
 * Berbeda dari `susunPdf` yang berbasis daftar baris, fungsi ini memakai blok
 * bertipe. Pemanggil tidak perlu menghitung tinggi atau memenggal halaman:
 * setiap blok diukur, halaman diberi header lanjutan, dan kaki menyebut nomor
 * halaman dari total yang benar-benar terbentuk.
 */
export function susunPdfResmi(dok: DokumenResmiPdf): Uint8Array {
  const halaman = bagiHalamanResmi(dok.blok);
  const aliran = halaman.map((blok, i) =>
    isiHalamanResmi(blok, dok, i + 1, halaman.length),
  );
  return susunBerkasPdf(aliran);
}

/** Buat berkas PDF dari aliran isi tiap halaman (objek + xref). */
function susunBerkasPdf(aliran: string[]): Uint8Array {
  // Penomoran objek: 1 katalog, 2 daftar halaman, 3-4 font, lalu 2 objek per
  // halaman (objek halaman + aliran isinya).
  const NOMOR_FONT = [
    { nomor: 3, nama: "F1", base: "Helvetica" },
    { nomor: 4, nama: "F2", base: "Helvetica-Bold" },
  ];
  const objek: string[] = [];
  objek.push("<< /Type /Catalog /Pages 2 0 R >>");
  const nomorHalamanObjek = aliran.map((_, i) => 5 + i * 2);
  objek.push(
    `<< /Type /Pages /Kids [${nomorHalamanObjek.map((n) => `${n} 0 R`).join(" ")}] /Count ${aliran.length} >>`,
  );
  for (const font of NOMOR_FONT) {
    objek.push(
      `<< /Type /Font /Subtype /Type1 /BaseFont /${font.base} /Encoding /WinAnsiEncoding >>`,
    );
  }
  aliran.forEach((isi, i) => {
    const nomorIsi = 6 + i * 2;
    objek.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${angka(LEBAR_HALAMAN)} ${angka(TINGGI_HALAMAN)}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${nomorIsi} 0 R >>`,
    );
    objek.push(`<< /Length ${isi.length} >>\nstream\n${isi}endstream`);
  });

  let berkas = "%PDF-1.4\n";
  const offset: number[] = [];
  objek.forEach((isi, i) => {
    offset.push(berkas.length);
    berkas += `${i + 1} 0 obj\n${isi}\nendobj\n`;
  });
  const offsetXref = berkas.length;
  berkas += `xref\n0 ${objek.length + 1}\n0000000000 65535 f \n`;
  for (const posisi of offset)
    berkas += `${String(posisi).padStart(10, "0")} 00000 n \n`;
  berkas += `trailer\n<< /Size ${objek.length + 1} /Root 1 0 R >>\nstartxref\n${offsetXref}\n%%EOF\n`;

  const byte = new Uint8Array(berkas.length);
  for (let i = 0; i < berkas.length; i += 1)
    byte[i] = berkas.charCodeAt(i) & 0xff;
  return byte;
}

/**
 * Susun berkas PDF lengkap dari daftar baris.
 *
 * Keluarannya `Uint8Array` supaya bisa langsung disimpan: di aksi Convex lewat
 * `ctx.storage.store(new Blob([byte], { type: "application/pdf" }))`, di uji
 * sebagai berkas biasa. Setiap byte berisi satu karakter Latin-1, jadi posisi
 * objek di tabel `xref` sama dengan panjang teks yang sudah ditulis.
 */
export function susunPdf(dokumen: DokumenPdf): Uint8Array {
  const baris = siapkanBaris(dokumen.baris);
  const tinggiKop =
    dokumen.kop === undefined
      ? 0
      : dokumen.sampul !== undefined
        ? TINGGI_KOP_RINGKAS
        : TINGGI_KOP;
  const halamanIsi = bagiHalaman(baris, tinggiKop);
  // Sampul tidak ikut nomor halaman: nomor 1 baru muncul di halaman isi pertama.
  const aliran: string[] = [];
  if (dokumen.sampul !== undefined) {
    aliran.push(isiSampul(dokumen.sampul, dokumen.kop));
  }
  halamanIsi.forEach((halaman, i) => {
    aliran.push(isiHalaman(halaman, dokumen, i + 1, halamanIsi.length));
  });

  return susunBerkasPdf(aliran);
}

/** Teks berkas PDF sebagai Latin-1, untuk pembacaan dan pengujian. */
export function teksPdf(byte: Uint8Array): string {
  let hasil = "";
  for (const nilai of byte) hasil += String.fromCharCode(nilai);
  return hasil;
}
