/**
 * Data diri nasabah yang diisi/diperbarui ADMIN — logika MURNI, tanpa React,
 * tanpa Convex, tanpa DOM, supaya bisa diuji sebagai skrip biasa
 * (`bun src/lib/dataDiri.test.ts`).
 *
 * Kenapa berkas ini ada: panel admin perlu mengisi dan mengubah data diri
 * nasabah (termasuk foto KTP). Validasi dan normalisasi HARUS sama di form
 * (pesan yang terlihat admin) dan di server (yang benar-benar disimpan) —
 * kalau keduanya ditulis terpisah, mudah berbeda. `bacaDataDiri()` karena itu
 * menjadi satu-satunya tempat aturan itu hidup: form memakainya untuk
 * menampilkan galat, mutation memakainya untuk memutuskan apa yang ditulis.
 *
 * Aturan yang dijaga:
 * - Isian dinormalkan dulu (spasi/tanda hubung dibuang, digit diekstrak),
 *   supaya "62812 3456-7890" dan "6281234567890" tidak dianggap berbeda.
 * - Nama lengkap disimpan HURUF BESAR (`lib/nama.ts`) supaya sama dengan data
 *   pinjaman di ruang penyedia dana — satu orang tidak lagi tampil beda di dua
 *   layar hanya karena yang mengetiknya beda huruf besar/kecil.
 * - Bidang opsional yang kosong disimpan sebagai `null`, bukan string kosong,
 *   sehingga "belum diisi" tidak bisa tertukar dengan "diisi kosong".
 * - Semua angka uang rupiah bulat (Rule 3) dan tidak boleh negatif.
 */
import { namaHurufBesar } from "./nama";

/** Batas panjang & nilai untuk tiap bidang data diri. */
export const DATA_DIRI_BATAS = {
  namaMin: 3,
  namaMaks: 120,
  alamatMin: 5,
  alamatMaks: 300,
  pekerjaanMin: 3,
  pekerjaanMaks: 120,
  bankMin: 2,
  bankMaks: 60,
  /** Batas atas penghasilan bulanan agar tidak salah ketik ekstrem. */
  penghasilanMaks: 1_000_000_000,
  rekeningMin: 6,
  rekeningMaks: 30,
} as const;

/**
 * Isian mentah dari form (semua string). `penghasilan` menerima teks berpemisah
 * ribuan; angkanya diekstrak oleh `bacaDataDiri()`.
 */
export type DataDiriForm = {
  namaLengkap: string;
  nik: string;
  nomorWhatsApp: string;
  alamat: string;
  pekerjaan: string;
  penghasilan: string;
  namaBank: string;
  nomorRekening: string;
};

/** Nilai yang siap disimpan ke basis data (sudah dinormalkan). */
export type DataDiriTersimpan = {
  namaLengkap: string;
  nik: string;
  nomorWhatsApp: string;
  alamat: string | null;
  pekerjaan: string | null;
  penghasilanBulanan: number | null;
  namaBank: string | null;
  nomorRekening: string | null;
};

/** Isian kosong — titik awal form "isi data diri". */
export const DATA_DIRI_KOSONG: DataDiriForm = {
  namaLengkap: "",
  nik: "",
  nomorWhatsApp: "",
  alamat: "",
  pekerjaan: "",
  penghasilan: "",
  namaBank: "",
  nomorRekening: "",
};

/**
 * Ekstrak angka dari teks berpemisah (mis. "2.500.000" atau "2,5 jt" → 2500000
 * / 25). Kosong / tanpa digit → null.
 */
export function penghasilanDariTeks(teks: string): number | null {
  const digit = teks.replace(/\D/g, "");
  if (digit === "") return null;
  return Number(digit);
}

/** Ambil digit saja (untuk NIK / rekening / nomor WhatsApp). */
function digitSaja(teks: string): string {
  return teks.replace(/\D/g, "");
}

/** Potong spasi di ujung dan rapikan spasi ganda dalam nama/alamat. */
function rapikan(teks: string): string {
  return teks.trim().replace(/\s+/g, " ");
}

/** Nama isian data diri — dipakai sebagai kunci galat per isian. */
export type IsianDataDiri = keyof DataDiriForm;

/** Galat per isian, supaya pesannya bisa ditampilkan DI DEKAT isiannya. */
export type GalatDataDiri = Partial<Record<IsianDataDiri, string>>;

/**
 * Aturan validasi data diri, dipecah PER ISIAN dengan urutan tetap.
 *
 * Kenapa dipisah: form menampilkan pesan di bawah isian yang salah, sedangkan
 * server hanya butuh tahu boleh-tidaknya simpan. Dengan satu daftar aturan
 * berurut ini, `galatDataDiri()` memberi pesan per isian untuk form dan
 * `bacaDataDiri()` mengambil yang pertama untuk pesan tunggal — keduanya dari
 * aturan yang SAMA, jadi tidak mungkin berbeda.
 *
 * Urutan diperiksa tetap seperti semula (nama → NIK → WhatsApp → alamat →
 * pekerjaan → penghasilan → bank → rekening) supaya pesan pertama yang
 * dikembalikan `bacaDataDiri` tidak berubah.
 */
function aturanDataDiri(form: DataDiriForm): Array<[IsianDataDiri, string]> {
  const namaLengkap = namaHurufBesar(form.namaLengkap);
  const nik = digitSaja(form.nik);
  const nomorWhatsApp = digitSaja(form.nomorWhatsApp);
  const alamat = rapikan(form.alamat);
  const pekerjaan = rapikan(form.pekerjaan);
  const namaBank = rapikan(form.namaBank);
  const nomorRekening = digitSaja(form.nomorRekening);
  const penghasilanBulanan = penghasilanDariTeks(form.penghasilan);

  const galat: Array<[IsianDataDiri, string]> = [];

  if (namaLengkap.length < DATA_DIRI_BATAS.namaMin || namaLengkap.length > DATA_DIRI_BATAS.namaMaks) {
    galat.push([
      "namaLengkap",
      `Nama lengkap wajib ${DATA_DIRI_BATAS.namaMin}–${DATA_DIRI_BATAS.namaMaks} karakter.`,
    ]);
  }
  if (!/^\d{16}$/.test(nik)) {
    galat.push(["nik", "Nomor KTP (NIK) harus terdiri dari 16 angka."]);
  }
  // Nomor WhatsApp Indonesia: kode negara 62 + 8–13 digit (tanpa tanda +).
  if (!/^62\d{8,13}$/.test(nomorWhatsApp)) {
    galat.push([
      "nomorWhatsApp",
      "Nomor WhatsApp harus diawali 62 tanpa tanda +, contoh: 6281234567890.",
    ]);
  }
  if (alamat !== "" && (alamat.length < DATA_DIRI_BATAS.alamatMin || alamat.length > DATA_DIRI_BATAS.alamatMaks)) {
    galat.push([
      "alamat",
      `Alamat wajib ${DATA_DIRI_BATAS.alamatMin}–${DATA_DIRI_BATAS.alamatMaks} karakter bila diisi.`,
    ]);
  }
  if (pekerjaan !== "" && (pekerjaan.length < DATA_DIRI_BATAS.pekerjaanMin || pekerjaan.length > DATA_DIRI_BATAS.pekerjaanMaks)) {
    galat.push([
      "pekerjaan",
      `Pekerjaan wajib ${DATA_DIRI_BATAS.pekerjaanMin}–${DATA_DIRI_BATAS.pekerjaanMaks} karakter bila diisi.`,
    ]);
  }
  if (penghasilanBulanan !== null) {
    if (!Number.isSafeInteger(penghasilanBulanan) || penghasilanBulanan <= 0) {
      galat.push(["penghasilan", "Penghasilan per bulan harus angka rupiah bulat positif."]);
    } else if (penghasilanBulanan > DATA_DIRI_BATAS.penghasilanMaks) {
      galat.push([
        "penghasilan",
        "Penghasilan per bulan tidak boleh melebihi Rp 1.000.000.000.",
      ]);
    }
  }
  if (namaBank !== "" && (namaBank.length < DATA_DIRI_BATAS.bankMin || namaBank.length > DATA_DIRI_BATAS.bankMaks)) {
    galat.push([
      "namaBank",
      `Nama bank wajib ${DATA_DIRI_BATAS.bankMin}–${DATA_DIRI_BATAS.bankMaks} karakter bila diisi.`,
    ]);
  }
  if (
    nomorRekening !== "" &&
    (nomorRekening.length < DATA_DIRI_BATAS.rekeningMin || nomorRekening.length > DATA_DIRI_BATAS.rekeningMaks)
  ) {
    galat.push([
      "nomorRekening",
      `Nomor rekening wajib ${DATA_DIRI_BATAS.rekeningMin}–${DATA_DIRI_BATAS.rekeningMaks} angka bila diisi.`,
    ]);
  }

  return galat;
}

/**
 * Galat per isian untuk ditampilkan di dekat isian yang bersangkutan.
 * Isian yang sah tidak muncul sebagai kunci, jadi pemanggil tinggal memeriksa
 * `galat.nik !== undefined` untuk isian itu saja.
 */
export function galatDataDiri(form: DataDiriForm): GalatDataDiri {
  const hasil: GalatDataDiri = {};
  for (const [isian, pesan] of aturanDataDiri(form)) {
    // Galat pertama per isian yang dipakai — isian tidak pernah menumpuk pesan.
    if (hasil[isian] === undefined) hasil[isian] = pesan;
  }
  return hasil;
}

/**
 * Validasi + normalisasi satu isian data diri.
 *
 * Mengembalikan `{ tersimpan, pesan }` dengan aturan: bila ada pelanggaran,
 * `tersimpan` = null dan `pesan` = kalimat pertama yang gagal (urut tertentu
 * supaya uji tidak bergantung urutan objek). Bila lolos, `tersimpan` berisi
 * nilai siap simpan dan `pesan` = null.
 */
export function bacaDataDiri(form: DataDiriForm): {
  tersimpan: DataDiriTersimpan | null;
  pesan: string | null;
} {
  const namaLengkap = namaHurufBesar(form.namaLengkap);
  const nik = digitSaja(form.nik);
  const nomorWhatsApp = digitSaja(form.nomorWhatsApp);
  const alamat = rapikan(form.alamat);
  const pekerjaan = rapikan(form.pekerjaan);
  const namaBank = rapikan(form.namaBank);
  const nomorRekening = digitSaja(form.nomorRekening);
  const penghasilanBulanan = penghasilanDariTeks(form.penghasilan);

  const pelanggaran = aturanDataDiri(form);
  if (pelanggaran.length > 0) {
    return { tersimpan: null, pesan: pelanggaran[0][1] };
  }

  return {
    tersimpan: {
      namaLengkap,
      nik,
      nomorWhatsApp,
      alamat: alamat === "" ? null : alamat,
      pekerjaan: pekerjaan === "" ? null : pekerjaan,
      penghasilanBulanan,
      namaBank: namaBank === "" ? null : namaBank,
      nomorRekening: nomorRekening === "" ? null : nomorRekening,
    },
    pesan: null,
  };
}

/** Susun form dari nilai tersimpan (untuk menyunting yang sudah ada). */
export function formDariTersimpan(nilai: {
  namaLengkap: string;
  nik: string;
  nomorWhatsApp: string;
  alamat?: string | null;
  pekerjaan?: string | null;
  penghasilanBulanan?: number | null;
  namaBank?: string | null;
  nomorRekening?: string | null;
}): DataDiriForm {
  return {
    namaLengkap: nilai.namaLengkap,
    nik: nilai.nik,
    nomorWhatsApp: nilai.nomorWhatsApp,
    alamat: nilai.alamat ?? "",
    pekerjaan: nilai.pekerjaan ?? "",
    penghasilan: nilai.penghasilanBulanan === null || nilai.penghasilanBulanan === undefined
      ? ""
      : new Intl.NumberFormat("id-ID").format(nilai.penghasilanBulanan),
    namaBank: nilai.namaBank ?? "",
    nomorRekening: nilai.nomorRekening ?? "",
  };
}
