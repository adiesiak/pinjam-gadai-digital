/**
 * Template pesan WhatsApp PINDAI — MURNI, satu sumber untuk tombol admin dan
 * uji. Tidak ada Convex, DOM, atau `Date.now()` di sini.
 *
 * Aturan yang dijaga:
 *  - **Tidak ada tagihan palsu.** Angka yang masuk ke pesan selalu berasal dari
 *    ledger internal (pokok + bunga + denda yang dihitung `lib/loan`), dan
 *    pesannya menyebut sumbernya sebagai catatan aplikasi — bukan surat tagihan.
 *  - **Tautan selalu lewat `urlCekStatus`**, supaya admin tidak pernah menempel
 *    tautan buatan tangan yang mengarah ke domain lain (phishing).
 *  - **Placeholder tidak pernah tersisa.** Nilai yang tidak diketahui ditulis
 *    apa adanya sebagai kata ("tanggal belum tercatat"), bukan dibiarkan jadi
 *    `[Tanggal]` di tangan peminjam.
 */
import { namaPanggilan } from "./tautanStatus";

/** Bentuk data minimum yang dibutuhkan ketiga template. */
export type DataPesanTagihan = {
  /** Nama lengkap peminjam seperti tersimpan di ledger. */
  namaPeminjam: string;
  /** Nomor referensi pinjaman, mis. `PNJ-2026-0012`. */
  nomorReferensi: string;
  /** Tanggal jatuh tempo sudah diformat (mis. "12 Sep 2026") bila ada. */
  tanggalTeks?: string | null;
  /** Total kewajiban (pokok + bunga + denda) dalam rupiah bulat. */
  totalKewajiban?: number | null;
  /** Tautan halaman status/verifikasi milik pinjaman ini. */
  tautan: string;
};

/**
 * Nama yang dipakai menyapa. Pesan admin memakai nama panggilan pertama agar
 * terasa seperti pesan petugas, bukan surat massal — dan agar nama warisan
 * yang sangat panjang tidak memenuhi satu baris pesan.
 */
export function sapaan(namaPeminjam: string): string {
  return namaPanggilan(namaPeminjam);
}

/** Teks angka rupiah yang aman dipakai di pesan WA (tanpa `Rp` ganda). */
export function teksRupiah(nilai: number | null | undefined): string {
  if (nilai === null || nilai === undefined || !Number.isFinite(nilai)) return "belum tercatat";
  return `Rp ${Math.round(nilai).toLocaleString("id-ID")}`;
}

/**
 * Template 1 — INFO TAGIHAN & CEK STATUS (tautan pelacakan).
 *
 * Inilah pesan yang dikirim admin dari baris tabel: ringkasan status pinjaman
 * PLUS tautan resmi ke halaman kwitansi/verifikasi. Sengaja tetap menyebut
 * "ringkasan status" dan "tautan resmi" supaya peminjam tahu persis apa yang
 * akan ia buka — halaman itu memang menampilkan keduanya.
 */
export function pesanInfoTagihan(data: DataPesanTagihan): string {
  return (
    `Halo ${sapaan(data.namaPeminjam)}, berikut adalah ringkasan status pinjaman aktif ` +
    `Anda di PINDAI ${data.nomorReferensi}. Silakan periksa rincian tagihan dan ` +
    `konfirmasi kwitansi digital Anda melalui tautan resmi berikut: ${data.tautan}. ` +
    `Terima kasih.`
  );
}

/** Template 2 — PENGINGAT H-3 (masih ada waktu, nada menenangkan). */
export function pesanPengingatH3(data: DataPesanTagihan): string {
  return (
    `Halo ${sapaan(data.namaPeminjam)}, pengingat dari PINDAI bahwa pinjaman Anda ` +
    `${data.nomorReferensi} akan jatuh tempo dalam 3 hari (tanggal ` +
    `${data.tanggalTeks ?? "belum tercatat"}). Total kewajiban sebesar ` +
    `${teksRupiah(data.totalKewajiban)}. Mohon lakukan pembayaran tepat waktu.`
  );
}

/** Template 3 — PENGINGAT H-1 (urgensi tinggi, tanpa mengancam). */
export function pesanPengingatH1(data: DataPesanTagihan): string {
  return (
    `PERHATIAN: Tagihan pinjaman PINDAI ${data.nomorReferensi} atas nama ` +
    `${data.namaPeminjam} jatuh tempo BESOK (${data.tanggalTeks ?? "belum tercatat"}). ` +
    `Hindari denda keterlambatan harian. Silakan lakukan transfer ke rekening/metode ` +
    `tercatat dan konfirmasikan.`
  );
}

/**
 * Pilih template otomatis dari sisa hari: H-3 dipakai saat tepat 3 hari lagi,
 * H-1 saat tersisa 1 hari, dan INFO TAGIHAN untuk keadaan lain (termasuk
 * keterlambatan — pesan yang menagih tetap memakai nada pengingat, bukan
 * ancaman).
 */
export function templateSesuaiSisaHari(
  sisaHari: number,
  data: DataPesanTagihan,
): { jenis: "h3" | "h1" | "info"; pesan: string } {
  if (sisaHari === 3) return { jenis: "h3", pesan: pesanPengingatH3(data) };
  if (sisaHari === 1) return { jenis: "h1", pesan: pesanPengingatH1(data) };
  return { jenis: "info", pesan: pesanInfoTagihan(data) };
}

/**
 * URL halaman status untuk sebuah token.
 *
 * `asal` adalah asal halaman saat ini (`window.location.origin`). Bila kosong
 * atau tidak berupa http(s), fungsi mengembalikan null — admin lalu diberi tahu
 * bahwa tautan belum bisa dibuat, bukan dikirimi tautan relatif yang tidak bisa
 * dibuka peminjam.
 */
export function urlCekStatus(asal: string, token: string): string | null {
  const dasar = asal.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s]+$/i.test(dasar)) return null;
  const bersih = token.trim().toLowerCase();
  if (bersih === "") return null;
  return `${dasar}/cek-status/${bersih}`;
}

/**
 * URL chat WhatsApp (wa.me) untuk satu nomor + pesan.
 *
 * Nomor dinormalkan ke format internasional: `0…`/`+62…`/`62…` semuanya menjadi
 * `62…`. Nomor yang tidak bisa dibaca mengembalikan null supaya tombol admin
 * menampilkan alasan, bukan membuka WhatsApp dengan nomor kosong.
 */
export function urlWhatsapp(nomor: string, pesan: string): string | null {
  const angka = normalkanNomorWa(nomor);
  if (angka === null) return null;
  return `https://wa.me/${angka}?text=${encodeURIComponent(pesan)}`;
}

/** Nomor WA → digit `62…`, atau null bila tidak masuk akal. */
export function normalkanNomorWa(nomor: string | null | undefined): string | null {
  if (typeof nomor !== "string") return null;
  const digit = nomor.replace(/[^\d]/g, "");
  if (digit === "") return null;
  let angka = digit;
  if (angka.startsWith("0")) angka = `62${angka.slice(1)}`;
  else if (angka.startsWith("620")) angka = `62${angka.slice(3)}`;
  else if (!angka.startsWith("62")) angka = `62${angka}`;
  // Nomor Indonesia yang sah memiliki 9–15 digit setelah kode negara.
  return /^62\d{9,13}$/.test(angka) ? angka : null;
}
