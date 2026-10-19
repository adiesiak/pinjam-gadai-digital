/**
 * Kontak layanan pelanggan PINDAI.
 *
 * Nomor disimpan di SATU tempat. Tombol "Chat CS" di beberapa layar tidak boleh
 * menyalin nomornya sendiri-sendiri: satu nomor lama yang tertinggal berarti
 * nasabah menghubungi orang yang salah soal pinjamannya. Nomor ditulis dalam
 * format internasional (`62…`) sesuai yang diminta tautan `wa.me`.
 */
import { urlWhatsapp } from "./pengingatWhatsapp";

export const CS_WHATSAPP = "6285119574032";

/** Tautan chat CS dengan pesan yang sudah terisi. */
export function urlChatCs(pesan: string): string {
  // `urlWhatsapp` menormalkan nomor dan meng-encode pesan; nomor di atas sudah
  // sah, jadi cabang null hanya jaring pengaman bila nilainya kelak diubah.
  return urlWhatsapp(CS_WHATSAPP, pesan) ?? `https://wa.me/${CS_WHATSAPP}`;
}
