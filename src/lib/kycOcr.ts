/**
 * LOGIKA OCR KTP — MURNI (tanpa React/DOM/Convex/tesseract).
 *
 * Modul ini hanya mengolah TEKS hasil OCR menjadi data lapangan, memeriksa
 * formatnya, membandingkannya dengan isian formulir, dan menilai apakah hasilnya
 * cukup untuk dipakai — semuanya bisa diuji sebagai skrip biasa:
 * `bun src/lib/kycOcr.test.ts`.
 *
 * Batas yang tegas (dijaga juga oleh UI):
 * - OCR hanya MEMBACA TEKS. Ia tidak membuktikan keaslian KTP dan tidak
 *   memverifikasi data ke Dukcapil.
 * - `periksaFormatNik()` hanya memeriksa BENTUK 16 digit — bukan bukti NIK resmi.
 * - Hasil OCR TIDAK PERNAH menaikkan status KYC menjadi VERIFIED; keputusan
 *   tetap di tangan petugas.
 *
 * Modul ini tidak menulis log apa pun: teks KTP adalah data pribadi, jadi tidak
 * boleh dicatat ke log biasa (`console.log`) atau disimpan di mana pun.
 */

/** Data lapangan yang bisa dibaca dari teks KTP. */
export type DataKtp = {
  nik: string | null;
  nama: string | null;
  tempatLahir: string | null;
  /** Tanggal lahir ternormalisasi `YYYY-MM-DD`, atau null bila tidak terbaca. */
  tanggalLahir: string | null;
  jenisKelamin: KelaminKtp | null;
  alamat: string | null;
  rtRw: string | null;
  kelurahan: string | null;
  kecamatan: string | null;
  agama: string | null;
  statusPerkawinan: string | null;
  pekerjaan: string | null;
  kewarganegaraan: string | null;
  berlakuHingga: string | null;
};

export type KelaminKtp = "LAKI-LAKI" | "PEREMPUAN";

/** Label Indonesia untuk tiap field — dipakai saat menampilkan hasil ekstraksi. */
export const LABEL_KTP: Record<keyof DataKtp, string> = {
  nik: "NIK",
  nama: "Nama",
  tempatLahir: "Tempat lahir",
  tanggalLahir: "Tanggal lahir",
  jenisKelamin: "Jenis kelamin",
  alamat: "Alamat",
  rtRw: "RT/RW",
  kelurahan: "Kelurahan/Desa",
  kecamatan: "Kecamatan",
  agama: "Agama",
  statusPerkawinan: "Status perkawinan",
  pekerjaan: "Pekerjaan",
  kewarganegaraan: "Kewarganegaraan",
  berlakuHingga: "Berlaku hingga",
};

/** Field yang dibandingkan dengan isian formulir (yang memang ada di form KYC). */
export type FieldPembanding = "nik" | "nama" | "alamat";

/** Satu ketidaksesuaian antara hasil OCR dan isian formulir. */
export type Ketidaksesuaian = {
  field: FieldPembanding;
  label: string;
  ocr: string;
  form: string;
};

/* ==========================================================================
 * Normalisasi & pengambilan nilai
 * ========================================================================== */

/**
 * Normalkan teks mentah OCR: samakan bentuk Unicode, seragamkan akhir baris,
 * buang tanda kutip yang mengganggu, rapikan spasi, buang karakter sampah di
 * awal baris, dan jadikan HURUF BESAR.
 *
 * Huruf besar dipilih karena KTP dicetak kapital dan semua label dicari dalam
 * bentuk kapital — dengan begitu label seperti "Nama" tetap cocok tanpa perlu
 * flag regex case-insensitive di setiap pola. Nilai pun ikut kapital, sesuai
 * cetakan KTP.
 */
export function normalkanTeksKtp(teks: string): string {
  return teks
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[|¦]/g, "I")
    .replace(/[“”„‟]/g, '"')
    .toUpperCase()
    .split("\n")
    .map((baris) => baris.replace(/^[^A-Z0-9]+/, "").replace(/[ \t]+/g, " ").trim())
    .filter((baris) => baris !== "")
    .join("\n")
    .trim();
}

/** Heuristik: baris ini terlihat seperti LABEL KTP baru (mis. "AGAMA :"). */
function terlihatLabel(baris: string): boolean {
  return /^[A-Z][A-Z/ .]{1,24}\s*:/.test(baris);
}

/**
 * Ambil nilai setelah sebuah label. Nilai boleh berada di baris yang sama
 * (`NIK : 3271…`) atau, bila kosong, di baris berikutnya. Label dicari dengan
 * pola yang toleran terhadap jarak/spasi OCR.
 */
function ambilSetelahLabel(baris: string[], pola: RegExp): string | null {
  for (let i = 0; i < baris.length; i += 1) {
    const cocok = baris[i].match(pola);
    if (cocok === null) continue;
    const sisa = baris[i].slice(cocok[0].length).replace(/^[\s:.\-–]+/, "").trim();
    if (sisa !== "") return sisa;
    const berikut = baris[i + 1]?.trim() ?? "";
    if (berikut !== "" && !terlihatLabel(berikut)) return berikut;
  }
  return null;
}

/** Peta huruf → angka untuk memperbaiki NIK yang salah dibaca OCR. */
const PETA_HURUF_ANGKA: Record<string, string> = {
  O: "0",
  D: "0",
  Q: "0",
  I: "1",
  L: "1",
  Z: "2",
  S: "5",
  B: "8",
  G: "6",
};

/**
 * Perbaiki kandidat NIK: hanya huruf yang lazim tertukar dengan angka yang
 * diganti, sisanya (spasi/tanda) dibuang. Dipakai HANYA pada ruas nilai NIK,
 * bukan pada seluruh teks.
 */
export function perbaikiDigitNik(teks: string): string {
  return teks
    .toUpperCase()
    .replace(/[\s.-]/g, "")
    .split("")
    .map((huruf) => PETA_HURUF_ANGKA[huruf] ?? huruf)
    .filter((huruf) => /\d/.test(huruf))
    .join("");
}

/** Ambil NIK: dari label bila ada, lalu dari 16 digit (berspasi) di seluruh teks. */
function cariNik(teks: string, baris: string[]): string | null {
  const nilai = ambilSetelahLabel(baris, /\bNIK\b/);
  if (nilai !== null) {
    const langsung = nilai.match(/(?:\d[\s.-]?){15}\d/);
    if (langsung !== null) return langsung[0].replace(/\D/g, "");
    const diperbaiki = perbaikiDigitNik(nilai);
    if (diperbaiki.length >= 16) return diperbaiki.slice(0, 16);
  }
  const langsung = teks.match(/(?:\d[\s.-]?){15}\d/);
  return langsung === null ? null : langsung[0].replace(/\D/g, "");
}

/** Ubah "JAKARTA, 01-01-1990" → { tempatLahir: "JAKARTA", tanggalLahir: "1990-01-01" }. */
export function uraikanTempatTanggalLahir(nilai: string | null): {
  tempatLahir: string | null;
  tanggalLahir: string | null;
} {
  if (nilai === null || nilai.trim() === "") {
    return { tempatLahir: null, tanggalLahir: null };
  }
  const cocok = nilai.match(/(\d{1,2})[\s./-](\d{1,2})[\s./-](\d{4})/);
  if (cocok === null) {
    return { tempatLahir: nilai.replace(/[,\s]+$/, "").trim() || null, tanggalLahir: null };
  }
  const hari = Number(cocok[1]);
  const bulan = Number(cocok[2]);
  const tahun = Number(cocok[3]);
  const wajar = hari >= 1 && hari <= 31 && bulan >= 1 && bulan <= 12 && tahun >= 1900 && tahun <= 2999;
  const tempat = nilai.slice(0, cocok.index ?? 0).replace(/[,\s]+$/, "").trim();
  const duaDigit = (n: number) => String(n).padStart(2, "0");
  return {
    tempatLahir: tempat === "" ? null : tempat,
    tanggalLahir: wajar ? `${tahun}-${duaDigit(bulan)}-${duaDigit(hari)}` : null,
  };
}

/** Samakan jenis kelamin ke dua bentuk yang sah. */
export function normalkanKelamin(nilai: string | null): KelaminKtp | null {
  if (nilai === null) return null;
  const huruf = nilai.toUpperCase();
  if (huruf.includes("LAKI")) return "LAKI-LAKI";
  if (huruf.includes("PEREMPUAN") || huruf.includes("WANITA")) return "PEREMPUAN";
  return null;
}

/**
 * Uraikan teks OCR KTP menjadi data lapangan.
 *
 * Tidak ada nilai yang "dikarang": field yang tidak ditemukan bernilai null,
 * supaya pemanggil bisa meminta foto ulang alih-alih memakai tebakan.
 */
export function uraikanKtp(teks: string): DataKtp {
  const bersih = normalkanTeksKtp(teks);
  const baris = bersih.split("\n");
  const { tempatLahir, tanggalLahir } = uraikanTempatTanggalLahir(
    ambilSetelahLabel(baris, /\bTEMPAT\s*\/?\s*,?\s*TGL\.?\s*LAHIR\b/),
  );
  const nilai = (pola: RegExp, kosong = null): string | null => {
    const hasil = ambilSetelahLabel(baris, pola);
    return hasil === null ? kosong : hasil.trim() || kosong;
  };
  return {
    nik: cariNik(bersih, baris),
    nama: nilai(/\bNAMA\b/),
    tempatLahir,
    tanggalLahir,
    jenisKelamin: normalkanKelamin(nilai(/\bJENIS\s*KELAMIN\b/)),
    alamat: nilai(/\bALAMAT\b/),
    rtRw: nilai(/\bRT\s*\/?\s*RW\b/),
    kelurahan: nilai(/\bKEL(?:URAHAN)?\s*\/?\s*(?:DESA)?\b|\bDESA\b/),
    kecamatan: nilai(/\bKECAMATAN\b/),
    agama: nilai(/\bAGAMA\b/),
    statusPerkawinan: nilai(/\bSTATUS\s*PERKAWINAN\b/),
    pekerjaan: nilai(/\bPEKERJAAN\b/),
    kewarganegaraan: nilai(/\bKEWARGANEGARAAN\b/),
    berlakuHingga: nilai(/\bBERLAKU\s*HINGGA\b|\bMASA\s*BERLAKU\b/),
  };
}

/* ==========================================================================
 * Validasi format NIK (BENTUK saja — bukan keaslian)
 * ========================================================================== */

export type HasilPeriksaNik = {
  /** true bila bentuknya sah: 16 angka dan komponen tanggalnya wajar. */
  ok: boolean;
  /** true bila NIK ditemukan sama sekali. */
  ada: boolean;
  huruf: boolean;
  panjang16: boolean;
  tanggalWajar: boolean;
  /** Kalimat jujur yang menegaskan ini bukan bukti NIK resmi. */
  catatan: string;
};

export const CATATAN_NIK =
  "Pemeriksaan ini hanya bentuk 16 digit — bukan bukti NIK resmi dan tidak " +
  "diverifikasi ke Dukcapil.";

/**
 * Periksa BENTUK NIK: 16 angka, dan komponen tanggal (DDMMYY pada digit 7–12)
 * masuk akal (tanggal > 40 dikurangi 40 — penanda lahir perempuan). Ini sengaja
 * TIDAK menyatakan NIK "asli/sah" — pencocokan resmi hanya lewat sumber resmi.
 */
export function periksaFormatNik(nik: string | null): HasilPeriksaNik {
  if (nik === null || nik.trim() === "") {
    return {
      ok: false,
      ada: false,
      huruf: false,
      panjang16: false,
      tanggalWajar: false,
      catatan: CATATAN_NIK,
    };
  }
  const rapi = nik.trim();
  const huruf = /\D/.test(rapi);
  const panjang16 = rapi.length === 16;
  let tanggalWajar = false;
  if (!huruf && panjang16) {
    const dd = Number(rapi.slice(6, 8));
    const mm = Number(rapi.slice(8, 10));
    const hari = dd > 40 ? dd - 40 : dd;
    tanggalWajar = hari >= 1 && hari <= 31 && mm >= 1 && mm <= 12;
  }
  return {
    ok: !huruf && panjang16 && tanggalWajar,
    ada: true,
    huruf,
    panjang16,
    tanggalWajar,
    catatan: CATATAN_NIK,
  };
}

/** NIK bertopeng untuk ringkasan umum (mis. di layar yang tidak perlu angka penuh). */
export function nikBertopeng(nik: string | null): string {
  if (nik === null) return "—";
  if (nik.length <= 6) return "•".repeat(nik.length);
  return `${nik.slice(0, 4)}${"•".repeat(nik.length - 8)}${nik.slice(-4)}`;
}

/* ==========================================================================
 * Bandingkan dengan isian formulir
 * ========================================================================== */

/** Bentuk pembanding: huruf besar, hanya alfanumerik (buang spasi/tanda). */
function normalBanding(teks: string | null): string {
  return (teks ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Kemiripan token (kata ≥3 huruf) antara dua teks alamat. 0–1. */
function kemiripanToken(a: string, b: string): number {
  const token = (t: string) =>
    new Set(
      (t ?? "")
        .toUpperCase()
        .replace(/[^A-Z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3),
    );
  const ta = token(a);
  const tb = token(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let sama = 0;
  for (const t of ta) if (tb.has(t)) sama += 1;
  return sama / Math.max(ta.size, tb.size);
}

/**
 * Bandingkan hasil OCR dengan isian formulir. Hanya field yang BERHASIL dibaca
 * OCR yang dilaporkan — field yang tidak terbaca tidak dianggap "beda" (itu
 * urusan `nilaiHasilOcr`, yang meminta foto ulang).
 */
export function bandingkanKtpDenganForm(
  ktp: DataKtp,
  form: { namaLengkap: string; nik: string; alamat: string },
): Ketidaksesuaian[] {
  const beda: Ketidaksesuaian[] = [];

  if (ktp.nik !== null && perbaikiDigitNik(form.nik) !== ktp.nik) {
    beda.push({ field: "nik", label: LABEL_KTP.nik, ocr: ktp.nik, form: form.nik });
  }
  if (
    ktp.nama !== null &&
    normalBanding(ktp.nama) !== "" &&
    normalBanding(form.namaLengkap) !== "" &&
    kemiripanToken(ktp.nama, form.namaLengkap) < 0.9 &&
    normalBanding(ktp.nama) !== normalBanding(form.namaLengkap)
  ) {
    beda.push({ field: "nama", label: LABEL_KTP.nama, ocr: ktp.nama, form: form.namaLengkap });
  }
  if (
    ktp.alamat !== null &&
    normalBanding(form.alamat) !== "" &&
    kemiripanToken(ktp.alamat, form.alamat) < 0.5
  ) {
    beda.push({ field: "alamat", label: LABEL_KTP.alamat, ocr: ktp.alamat, form: form.alamat });
  }
  return beda;
}

/**
 * Field yang dianggap MATERIAL bila teks KTP berbeda dari isian: NIK dan nama.
 *
 * Perbedaan alamat tetap dilaporkan, tetapi TIDAK material — alamat di KTP bisa
 * ditulis singkat/dipotong, dan itu bukan tanda identitas berbeda. Daftar ini
 * satu tempat supaya mesin keputusan otomatis dan panel petugas memakai ambang
 * yang SAMA; dua daftar berbeda berarti dua kesimpulan berbeda atas data yang
 * sama.
 */
export const FIELD_MATERIAL_KTP = ["nik", "nama"] as const;

export type FieldMaterialKtp = (typeof FIELD_MATERIAL_KTP)[number];

/** true bila `field` termasuk perbedaan material. */
export function fieldMaterialKtp(field: string): boolean {
  return (FIELD_MATERIAL_KTP as readonly string[]).includes(field);
}

/** Snapshot OCR KTP minimum yang dibutuhkan pembandingan (tanpa keyakinan). */
export type SnapshotOcrKtp = {
  nik: string | null;
  nama: string | null;
  alamat: string | null;
};

/**
 * Bandingkan snapshot OCR dengan isian, dipisah MATERIAL vs LUNAK.
 *
 * Hanya field yang BERHASIL dibaca mesin yang bisa berbeda (lihat
 * `bandingkanKtpDenganForm`). Dipakai bersama oleh mesin keputusan otomatis dan
 * panel petugas — supaya "ketidaksesuaian material" tidak berbeda arti di dua
 * layar yang membacanya.
 */
export function bandingkanOcrDenganIsian(
  ocr: SnapshotOcrKtp,
  isian: { namaLengkap: string; nik: string; alamat: string },
): { material: Ketidaksesuaian[]; lunak: Ketidaksesuaian[] } {
  const beda = bandingkanKtpDenganForm(
    {
      nik: ocr.nik,
      nama: ocr.nama,
      tempatLahir: null,
      tanggalLahir: null,
      jenisKelamin: null,
      alamat: ocr.alamat,
      rtRw: null,
      kelurahan: null,
      kecamatan: null,
      agama: null,
      statusPerkawinan: null,
      pekerjaan: null,
      kewarganegaraan: null,
      berlakuHingga: null,
    },
    isian,
  );
  return {
    material: beda.filter((b) => fieldMaterialKtp(b.field)),
    lunak: beda.filter((b) => !fieldMaterialKtp(b.field)),
  };
}

/* ==========================================================================
 * Tingkat keyakinan & keputusan tindakan
 * ========================================================================== */

export type TingkatKeyakinan = "tinggi" | "sedang" | "rendah";

/** Ambang keyakinan mesin OCR (0–100). Tesseract tidak menjamin kalibrasi. */
export const AMBANG_KEYAKINAN_TINGGI = 80;
export const AMBANG_KEYAKINAN_SEDANG = 60;

/** Ubah angka keyakinan mesin (0–100) menjadi tingkat yang bisa dibaca manusia. */
export function tingkatKeyakinan(konfidensi: number): TingkatKeyakinan {
  if (!Number.isFinite(konfidensi)) return "rendah";
  if (konfidensi >= AMBANG_KEYAKINAN_TINGGI) return "tinggi";
  if (konfidensi >= AMBANG_KEYAKINAN_SEDANG) return "sedang";
  return "rendah";
}

export function labelKeyakinan(tingkat: TingkatKeyakinan): string {
  if (tingkat === "tinggi") return "Keyakinan tinggi";
  if (tingkat === "sedang") return "Keyakinan sedang";
  return "Keyakinan rendah";
}

export type TindakanOcr = {
  /** Foto sebaiknya diulang (buram/tidak terbaca). */
  perluFotoUlang: boolean;
  /** Hasil belum cukup untuk dipercaya; sediakan alur pemeriksaan manual. */
  perluPeriksaManual: boolean;
  /** Alasan yang bisa ditampilkan ke pengguna. */
  alasan: string[];
};

/**
 * Putuskan apakah hasil OCR cukup dipakai. Tidak pernah menyatakan data "benar":
 * hanya menilai keterbacaan & kelengkapan. Foto yang jelas dengan keyakinan
 * tinggi pun tetap bisa salah baca — karena itu UI selalu menyediakan koreksi.
 */
export function nilaiHasilOcr(ktp: DataKtp, konfidensi: number): TindakanOcr {
  const tingkat = tingkatKeyakinan(konfidensi);
  const alasan: string[] = [];
  if (tingkat === "rendah") {
    alasan.push("Keyakinan OCR rendah — foto mungkin buram, miring, atau terlalu kecil.");
  }
  if (ktp.nik === null) alasan.push("NIK tidak terbaca dari gambar.");
  if (ktp.nama === null) alasan.push("Nama tidak terbaca dari gambar.");
  if (ktp.tanggalLahir === null) alasan.push("Tanggal lahir tidak terbaca dari gambar.");
  if (ktp.alamat === null) alasan.push("Alamat tidak terbaca dari gambar.");

  const perluPeriksaManual = tingkat !== "tinggi" || alasan.length > 0;
  const perluFotoUlang = tingkat === "rendah" || ktp.nik === null || ktp.nama === null;
  return { perluFotoUlang, perluPeriksaManual, alasan };
}

/* ==========================================================================
 * Ringkasan untuk ditampilkan
 * ========================================================================== */

export type BarisRingkasOcr = { field: keyof DataKtp; label: string; nilai: string };

/**
 * Susun baris hasil ekstraksi untuk ditampilkan agar nasabah dapat mengoreksi.
 * NIK ditampilkan UTUH di sini karena nasabah perlu memeriksanya sendiri; yang
 * bertopeng hanya dipakai di ringkasan tempat lain.
 */
export function ringkasOcrKtp(ktp: DataKtp): BarisRingkasOcr[] {
  const urutan: Array<keyof DataKtp> = [
    "nik",
    "nama",
    "tempatLahir",
    "tanggalLahir",
    "jenisKelamin",
    "alamat",
    "rtRw",
    "kelurahan",
    "kecamatan",
    "agama",
    "statusPerkawinan",
    "pekerjaan",
    "kewarganegaraan",
    "berlakuHingga",
  ];
  return urutan.map((field) => ({
    field,
    label: LABEL_KTP[field],
    nilai: ktp[field] ?? "—",
  }));
}

/** Peringatan tetap yang wajib tampil di setiap layar hasil OCR. */
export const CATATAN_OCR =
  "OCR hanya membaca teks dari gambar. Ia tidak membuktikan keaslian KTP dan " +
  "tidak memverifikasi data ke Dukcapil. Hasil OCR tidak membuat status " +
  "verifikasi menjadi VERIFIED — keputusan tetap pada petugas.";
