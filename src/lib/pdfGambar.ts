/**
 * Penulis PDF kecil untuk halaman yang sudah dirasterisasi menjadi JPEG.
 *
 * Proyek ini tidak memasang pustaka PDF, sedangkan kontrak sudah punya HTML
 * cetak sendiri. Daripada menulis ulang seluruh tata letak kontrak ke PDF,
 * halaman HTML ditangkap menjadi gambar lalu dibungkus sebagai PDF A4.
 * Hasilnya PDF nyata yang bisa diunduh, bukan sekadar membuka dialog cetak.
 *
 * Setiap halaman memakai satu gambar JPEG (`/DCTDecode`) selebar A4. Karena
 * gambarnya sudah dikompresi, penulis ini tidak perlu pustaka kompresi.
 */

const LEBAR_A4 = 595.28;
const TINGGI_A4 = 841.89;

function bytesTeks(teks: string): Uint8Array {
  const hasil = new Uint8Array(teks.length);
  for (let i = 0; i < teks.length; i += 1) hasil[i] = teks.charCodeAt(i) & 0xff;
  return hasil;
}

function gabung(...bagian: Uint8Array[]): Uint8Array {
  const total = bagian.reduce((n, b) => n + b.length, 0);
  const hasil = new Uint8Array(total);
  let posisi = 0;
  for (const b of bagian) {
    hasil.set(b, posisi);
    posisi += b.length;
  }
  return hasil;
}

/**
 * Susun PDF dari daftar JPEG (satu per halaman). Semua halaman dianggap
 * berukuran sama; pemanggil memotong kanvas sesuai rasio A4.
 */
export function pdfDariHalamanJpeg(
  halaman: Uint8Array[],
  lebarPiksel: number,
  tinggiPiksel: number,
): Uint8Array {
  if (halaman.length === 0) {
    throw new Error("Tidak ada halaman kontrak untuk disusun menjadi PDF.");
  }
  const objek: Array<Uint8Array | string> = [];
  const nomorHalaman = halaman.map((_, i) => 3 + i * 3);
  const kids = nomorHalaman.map((n) => `${n} 0 R`).join(" ");

  objek[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objek[2] = `<< /Type /Pages /Kids [${kids}] /Count ${halaman.length} >>`;

  halaman.forEach((jpeg, i) => {
    const nomor = 3 + i * 3;
    const nomorGambar = nomor + 1;
    const nomorIsi = nomor + 2;
    objek[nomor] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LEBAR_A4} ${TINGGI_A4}] ` +
      `/Resources << /XObject << /Im0 ${nomorGambar} 0 R >> >> ` +
      `/Contents ${nomorIsi} 0 R >>`;
    objek[nomorGambar] = gabung(
      bytesTeks(
        `<< /Type /XObject /Subtype /Image /Width ${lebarPiksel} /Height ${tinggiPiksel} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      ),
      jpeg,
      bytesTeks("\nendstream"),
    );
    const isi =
      `q\n${LEBAR_A4} 0 0 ${TINGGI_A4} 0 0 cm\n/Im0 Do\nQ\n`;
    objek[nomorIsi] =
      `<< /Length ${isi.length} >>\nstream\n${isi}endstream`;
  });

  const potongan: Uint8Array[] = [
    bytesTeks("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"),
  ];
  const offset: number[] = [];
  let posisi = potongan[0].length;
  for (let nomor = 1; nomor < objek.length; nomor += 1) {
    const isi = objek[nomor];
    if (isi === undefined) continue;
    offset[nomor] = posisi;
    const pembuka = bytesTeks(`${nomor} 0 obj\n`);
    const badan = typeof isi === "string" ? bytesTeks(isi) : isi;
    const penutup = bytesTeks("\nendobj\n");
    potongan.push(pembuka, badan, penutup);
    posisi += pembuka.length + badan.length + penutup.length;
  }

  const offsetXref = posisi;
  let xref = `xref\n0 ${objek.length}\n0000000000 65535 f \n`;
  for (let nomor = 1; nomor < objek.length; nomor += 1) {
    xref += `${String(offset[nomor] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  const trailer =
    `trailer\n<< /Size ${objek.length} /Root 1 0 R >>\n` +
    `startxref\n${offsetXref}\n%%EOF\n`;
  potongan.push(bytesTeks(xref), bytesTeks(trailer));
  return gabung(...potongan);
}

/** Ubah data URL JPEG menjadi byte mentah tanpa Buffer (aman di peramban). */
export function jpegDariDataUrl(dataUrl: string): Uint8Array {
  const koma = dataUrl.indexOf(",");
  if (koma < 0) throw new Error("Gambar halaman kontrak tidak valid.");
  const base64 = dataUrl.slice(koma + 1);
  const biner = atob(base64);
  const hasil = new Uint8Array(biner.length);
  for (let i = 0; i < biner.length; i += 1) hasil[i] = biner.charCodeAt(i);
  return hasil;
}
