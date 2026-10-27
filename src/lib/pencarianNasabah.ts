/**
 * Membaca MAKSUD kueri pencarian nasabah di panel admin.
 *
 * Sebelum ini panel menyerahkan seluruh tabel ke server lalu menyaring di
 * memori: satu ketikan admin membaca SEMUA baris pengguna, data diri, pinjaman,
 * dan kredit barang. Pada data produksi itu menembus batas baca Convex dan meja
 * kerja mendadak gagal dimuat. Karena itu kueri yang sebenarnya identitas TEPAT
 * (NIK, kode peminjam, email, nomor WhatsApp) dikenali lebih dulu di sini agar
 * server dapat mengambilnya lewat indeks; hanya pencarian teks bebas yang perlu
 * memindai jendela baris terbaru.
 */

/** Bentuk kode peminjam yang diterbitkan `convex/peminjamCode.ts`. */
const KODE_PEMINJAM_POLA = /^PMN-[0-9A-F]{20}$/;

/** NIK satu-satunya bentuk angka 16 digit yang dicari sebagai identitas. */
const NIK_POLA = /^\d{16}$/;

/** Hanya angka, boleh berjarak/titik/hubung/plus seperti yang biasa diketik. */
const ANGKA_POLA = /^\+?[\d\s.-]+$/;

export type JenisKueriNasabah =
  | "nik"
  | "kodePeminjam"
  | "email"
  | "whatsapp"
  | "teks";

export type KueriNasabah = {
  jenis: JenisKueriNasabah;
  /** Nilai yang dicari; untuk "teks" berisi teks apa adanya. */
  nilai: string;
  /** Bentuk tersimpan (`62…`) bila `jenis === "whatsapp"`. */
  whatsapp?: string;
  /** Email huruf kecil — indeks email menyimpan nilai apa adanya. */
  emailKecil?: string;
  /** Angka mentah tanpa pemisah, untuk nomor asing yang tidak berawalan 62. */
  angka?: string;
};

/**
 * Nomor apa pun yang diketik diubah ke bentuk yang DISIMPAN (`62…`).
 *
 * `08…`, `8…`, `+62…`, dan `62…` menunjuk orang yang sama, sedangkan indeks
 * `by_nomorWhatsApp` hanya cocok pada satu bentuk. Nomor dengan kode negara
 * lain sengaja mengembalikan `null`: bentuk simpannya tidak bisa ditebak, jadi
 * pencariannya jatuh ke jalur teks.
 */
export function keNomorTersimpan(angka: string): string | null {
  let bersih = angka.replace(/\D/g, "");
  if (bersih.startsWith("62")) {
    // Sudah bentuk tersimpan.
  } else if (bersih.startsWith("0")) {
    bersih = `62${bersih.slice(1)}`;
  } else if (bersih.startsWith("8")) {
    bersih = `62${bersih}`;
  } else {
    return null;
  }
  // 62 + 8..13 digit: sama dengan aturan `normalisasiNomorWhatsApp`.
  return /^62\d{8,13}$/.test(bersih) ? bersih : null;
}

/**
 * Jenis pencarian dari satu ketikan admin.
 *
 * Urutan penting: kode peminjam diperiksa sebelum aturan angka (kode memuat
 * huruf), dan NIK sebelum nomor WhatsApp supaya NIK 16 digit tidak dicari
 * sebagai nomor telepon.
 */
export function bacaKueriNasabah(mentah: string): KueriNasabah {
  const teks = mentah.trim();
  if (teks === "") return { jenis: "teks", nilai: "" };

  const kode = teks.toUpperCase();
  if (KODE_PEMINJAM_POLA.test(kode)) {
    return { jenis: "kodePeminjam", nilai: kode };
  }

  if (ANGKA_POLA.test(teks)) {
    const angka = teks.replace(/[\s.\-+]/g, "");
    if (NIK_POLA.test(angka)) return { jenis: "nik", nilai: angka };
    if (angka.length >= 9 && angka.length <= 15) {
      const whatsapp = keNomorTersimpan(angka);
      if (whatsapp !== null) {
        return { jenis: "whatsapp", nilai: angka, whatsapp, angka };
      }
      return { jenis: "teks", nilai: teks };
    }
  }

  if (teks.includes("@")) {
    return { jenis: "email", nilai: teks, emailKecil: teks.toLowerCase() };
  }

  return { jenis: "teks", nilai: teks };
}

/**
 * Varian ketikan angka yang harus ikut dicoba saat mencocokkan teks.
 *
 * `0812…`, `812…`, dan `62812…` adalah nomor yang sama, sedangkan yang tersimpan
 * hanya bentuk `62…`. Tanpa varian ini, admin yang mengetik sebagian nomor
 * dengan awalan nol tidak menemukan nasabah yang jelas-jelas ada.
 */
export function varianKueriAngka(teks: string): string[] {
  const bersih = teks.replace(/[\s.\-+]/g, "");
  if (!/^\d+$/.test(bersih)) return [teks.toLowerCase()];
  const varian = new Set<string>([teks.toLowerCase(), bersih]);
  if (bersih.startsWith("0")) varian.add(`62${bersih.slice(1)}`);
  if (bersih.startsWith("62")) varian.add(`0${bersih.slice(2)}`);
  return [...varian];
}

/**
 * Penanda untuk panel: hasil pencarian teks hanya membaca jendela baris
 * terbaru. Bila jendela itu penuh, nasabah lama bisa tidak ikut tampil — panel
 * wajib menyarankan pencarian dengan identitas tepat, bukan diam-diam
 * menampilkan daftar yang terpotong.
 */
export function pesanHasilTerpotong(jenis: JenisKueriNasabah): string {
  if (jenis === "teks") {
    return "Hanya nasabah terbaru yang dipindai. Cari dengan NIK, kode peminjam, email, atau nomor WhatsApp untuk menemukan nasabah lama.";
  }
  return "Nasabah tidak ditemukan pada data terbaru. Periksa kembali NIK, kode peminjam, email, atau nomor WhatsApp-nya.";
}
