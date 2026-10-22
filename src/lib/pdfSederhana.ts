/**
 * Penulis PDF kecil tanpa dependensi untuk laporan yang dikirim ke WhatsApp.
 *
 * Kenapa ditulis sendiri: proyek ini tidak memasang pustaka PDF apa pun, dan
 * aksi Convex (runtime default, bukan Node) tidak punya sistem berkas untuk
 * pustaka seperti PDFKit. Berkas ini hanya menyusun byte: satu jenis halaman
 * (A4), dua font baku PDF (Helvetica + Helvetica-Bold, sudah ada di setiap
 * pembaca PDF tanpa ditanam), dan tata letak baris-atas-bawah.
 *
 * Yang dibuang dengan sadar: kolom angka rata kanan. Perataan kanan butuh
 * lebar huruf sungguhan, dan tabel lebar Helvetica adalah ratusan angka yang
 * tidak bisa diketik dari ingatan tanpa salah. Karena itu laporan memakai
 * bentuk "Label: nilai" per baris, dan itu pilihan bentuk, bukan kekurangan.
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
  "\u2022": "-",
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

type BarisSiap = {
  jenis:
    | "teks"
    | "rincian"
    | "kolom"
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

/** Teks berkas PDF sebagai Latin-1, untuk pembacaan dan pengujian. */
export function teksPdf(byte: Uint8Array): string {
  let hasil = "";
  for (const nilai of byte) hasil += String.fromCharCode(nilai);
  return hasil;
}
