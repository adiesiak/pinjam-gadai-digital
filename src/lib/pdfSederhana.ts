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
export type GayaBarisPdf = "judul" | "subjudul" | "seksi" | "tebal" | "biasa" | "kecil";

/** Satu isi dokumen: teks bergaya, baris kosong, atau garis pemisah. */
export type BarisPdf =
  | { teks: string; gaya?: GayaBarisPdf }
  | { kosong: true }
  | { garis: true };

export type DokumenPdf = {
  /** Teks tetap di kaki setiap halaman (mis. nama layanan + nomor halaman). */
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

const LEBAR_TEKS = LEBAR_HALAMAN - MARGIN_SISI * 2;

type UkuranBaris = { ukuran: number; leading: number; font: "F1" | "F2"; jarakBawah: number };

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
export function bungkusTeks(teks: string, ukuran: number): string[] {
  const lebarMaks = LEBAR_TEKS;
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
    const maksKarakter = Math.max(8, Math.floor(lebarMaks / (ukuran * PERKIRAAN_LEBAR_KARAKTER)));
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
  jenis: "teks" | "kosong" | "garis";
  teks: string;
  gaya: GayaBarisPdf;
  tinggi: number;
  jarakBawah: number;
};

/** Susun daftar baris siap gambar: gaya diubah menjadi ukuran dan tinggi nyata. */
export function siapkanBaris(baris: BarisPdf[]): BarisSiap[] {
  const hasil: BarisSiap[] = [];
  for (const entri of baris) {
    if ("kosong" in entri) {
      hasil.push({ jenis: "kosong", teks: "", gaya: "kecil", tinggi: 9, jarakBawah: 0 });
      continue;
    }
    if ("garis" in entri) {
      hasil.push({ jenis: "garis", teks: "", gaya: "kecil", tinggi: 8, jarakBawah: 6 });
      continue;
    }
    const gaya = entri.gaya ?? "biasa";
    const ukuran = UKURAN[gaya];
    for (const potongan of bungkusTeks(entri.teks, ukuran.ukuran)) {
      hasil.push({
        jenis: "teks",
        teks: potongan,
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
export function bagiHalaman(baris: BarisSiap[]): BarisSiap[][] {
  const halaman: BarisSiap[][] = [];
  let kini: BarisSiap[] = [];
  let y = TINGGI_HALAMAN - MARGIN_ATAS;
  const batas = BATAS_BAWAH + TINGGI_KAKI;

  for (const entri of baris) {
    if (kini.length > 0 && y - entri.tinggi < batas) {
      halaman.push(kini);
      kini = [];
      y = TINGGI_HALAMAN - MARGIN_ATAS;
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
function operasiTeks(teks: string, gaya: GayaBarisPdf, x: number, y: number): string {
  const { ukuran, font } = UKURAN[gaya];
  return `BT /${font} ${angka(ukuran)} Tf 1 0 0 1 ${angka(x)} ${angka(y)} Tm (${escapePdf(teks)}) Tj ET`;
}

function operasiGaris(y: number): string {
  return `0.6 w ${angka(MARGIN_SISI)} ${angka(y)} m ${angka(LEBAR_HALAMAN - MARGIN_SISI)} ${angka(y)} l S`;
}

/** Isi satu halaman: baris isi + kaki halaman. */
function isiHalaman(
  baris: BarisSiap[],
  dokumen: { kaki?: string },
  nomorHalaman: number,
  jumlahHalaman: number,
): string {
  const operasi: string[] = [];
  let y = TINGGI_HALAMAN - MARGIN_ATAS;
  for (const entri of baris) {
    if (entri.jenis === "teks") {
      operasi.push(operasiTeks(entri.teks, entri.gaya, MARGIN_SISI, y - UKURAN[entri.gaya].ukuran));
    } else if (entri.jenis === "garis") {
      operasi.push(operasiGaris(y));
    }
    y -= entri.tinggi + entri.jarakBawah;
  }

  const kaki = [dokumen.kaki?.trim(), `Halaman ${nomorHalaman} dari ${jumlahHalaman}`]
    .filter((bagian): bagian is string => bagian !== undefined && bagian !== "")
    .join("  -  ");
  operasi.push(operasiTeks(kaki, "kecil", MARGIN_SISI, KAKI_BASELINE));
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
  const halaman = bagiHalaman(baris);

  // Penomoran objek: 1 katalog, 2 daftar halaman, 3-4 font, lalu 2 objek per
  // halaman (objek halaman + aliran isinya).
  const NOMOR_FONT = [{ nomor: 3, nama: "F1", base: "Helvetica" }, { nomor: 4, nama: "F2", base: "Helvetica-Bold" }];
  const objek: string[] = [];
  objek.push("<< /Type /Catalog /Pages 2 0 R >>");
  const nomorHalamanObjek = halaman.map((_, i) => 5 + i * 2);
  objek.push(
    `<< /Type /Pages /Kids [${nomorHalamanObjek.map((n) => `${n} 0 R`).join(" ")}] /Count ${halaman.length} >>`,
  );
  for (const font of NOMOR_FONT) {
    objek.push(
      `<< /Type /Font /Subtype /Type1 /BaseFont /${font.base} /Encoding /WinAnsiEncoding >>`,
    );
  }
  halaman.forEach((isi, i) => {
    const nomorIsi = 6 + i * 2;
    objek.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${angka(LEBAR_HALAMAN)} ${angka(TINGGI_HALAMAN)}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${nomorIsi} 0 R >>`,
    );
    const aliran = isiHalaman(isi, dokumen, i + 1, halaman.length);
    objek.push(`<< /Length ${aliran.length} >>\nstream\n${aliran}endstream`);
  });

  let berkas = "%PDF-1.4\n";
  const offset: number[] = [];
  objek.forEach((isi, i) => {
    offset.push(berkas.length);
    berkas += `${i + 1} 0 obj\n${isi}\nendobj\n`;
  });
  const offsetXref = berkas.length;
  berkas += `xref\n0 ${objek.length + 1}\n0000000000 65535 f \n`;
  for (const posisi of offset) berkas += `${String(posisi).padStart(10, "0")} 00000 n \n`;
  berkas += `trailer\n<< /Size ${objek.length + 1} /Root 1 0 R >>\nstartxref\n${offsetXref}\n%%EOF\n`;

  const byte = new Uint8Array(berkas.length);
  for (let i = 0; i < berkas.length; i += 1) byte[i] = berkas.charCodeAt(i) & 0xff;
  return byte;
}

/** Teks berkas PDF sebagai Latin-1, untuk pembacaan dan pengujian. */
export function teksPdf(byte: Uint8Array): string {
  let hasil = "";
  for (const nilai of byte) hasil += String.fromCharCode(nilai);
  return hasil;
}
