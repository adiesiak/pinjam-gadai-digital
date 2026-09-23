/**
 * STOP-UP! — Utility Web Serial ESC/POS Thermal Printer
 *
 * Menyusun perintah ESC/POS menjadi byte siap kirim ke printer thermal USB
 * lewat Web Serial API. Struktur byte dipisah dari I/O supaya bisa diuji
 * tanpa perangkat keras.
 */

export const ESC = 0x1b;
export const GS = 0x1d;
export const LF = 0x0a;

export type ESCPOSRata = "kiri" | "tengah" | "kanan";

const RATA_BYTE: Record<ESCPOSRata, number> = { kiri: 0, tengah: 1, kanan: 2 };

/* ============================ PERINTAH DASAR ============================ */

/** ESC @ — reset printer. */
export function init(): Uint8Array {
  return new Uint8Array([ESC, 0x40]);
}

/** ESC a n — perataan teks. */
export function align(rata: ESCPOSRata): Uint8Array {
  return new Uint8Array([ESC, 0x61, RATA_BYTE[rata]]);
}

/** ESC E n — tebal (dipakai untuk KODE VOUCHER / REDEEM KEY). */
export function bold(aktif: boolean): Uint8Array {
  return new Uint8Array([ESC, 0x45, aktif ? 1 : 0]);
}

/** GS ! n — ukuran karakter (0 normal, 0x11 = 2x lebar & tinggi). */
export function size(ganda: boolean): Uint8Array {
  return new Uint8Array([GS, 0x21, ganda ? 0x11 : 0x00]);
}

/** ESC d n — majukan kertas n baris. */
export function feed(baris = 1): Uint8Array {
  return new Uint8Array([ESC, 0x64, Math.max(0, Math.min(255, baris))]);
}

/** GS V 66 n — potong kertas (mode partial cut dengan feed). */
export function cut(): Uint8Array {
  return new Uint8Array([GS, 0x56, 0x42, 0x00]);
}

/** ESC p m t1 t2 — bunyi buzzer (memberi tahu pelanggan struk siap). */
export function buzzer(): Uint8Array {
  return new Uint8Array([ESC, 0x70, 0x00, 0x3c, 0x78]);
}

/** ESC t n — pilih code page (0x00 = CP437). */
export function codePage(page = 0): Uint8Array {
  return new Uint8Array([ESC, 0x74, page]);
}

/* ============================ TEKS & UTIL ============================ */

/** Encode teks ke ASCII terkendali (karakter non-latin ditandai "?"). */
export function textBytes(teks: string): Uint8Array {
  const bersih = teks.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const out = new Uint8Array(bersih.length + 1);
  for (let i = 0; i < bersih.length; i += 1) {
    const kode = bersih.charCodeAt(i);
    out[i] = kode >= 32 && kode < 256 ? kode : 0x3f;
  }
  out[bersih.length] = LF;
  return out;
}

/** Baris teks + baris baru. */
export function line(teks = ""): Uint8Array {
  return textBytes(teks);
}

/** Rapikan teks kiri-kanan selebar printer (default 32 kolom untuk 58mm). */
export function duaKolom(kiri: string, kanan: string, lebar = 32): string {
  const maksKiri = Math.max(0, lebar - kanan.length - 1);
  const kiriPotong = kiri.length > maksKiri ? `${kiri.slice(0, Math.max(0, maksKiri - 1))}…` : kiri;
  const spasi = Math.max(1, lebar - kiriPotong.length - kanan.length);
  return `${kiriPotong}${" ".repeat(spasi)}${kanan}`;
}

/** Garis pemisah. */
export function garis(lebar = 32): string {
  return "-".repeat(lebar);
}

export function concat(...bagian: Uint8Array[]): Uint8Array {
  const total = bagian.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of bagian) {
    out.set(b, offset);
    offset += b.length;
  }
  return out;
}

/* ============================== STRUK ============================== */

export type ItemStruk = {
  nama: string;
  tujuan: string;
  harga: number;
};

export type DataStruk = {
  namaMerchant: string;
  alamat: string;
  terminal: string;
  invoiceId: string;
  waktu: string;
  item: ItemStruk;
  total: number;
  metode: string;
  status: string;
  snRef?: string | null;
  voucherCode?: string | null;
  namaPelangganMasked?: string | null;
  footer?: string;
  /** Struk pending (supplier belum selesai) — diberi tanda khusus. */
  pending?: boolean;
};

const rupiah = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

/** Versi teks polos — dipakai juga untuk bukti WhatsApp saat kertas habis. */
export function formatStrukTeks(data: DataStruk): string {
  const L = 32;
  const baris: string[] = [];
  baris.push(data.namaMerchant.toUpperCase());
  baris.push(data.alamat);
  baris.push(garis(L));
  baris.push(duaKolom("Invoice", data.invoiceId, L));
  baris.push(duaKolom("Terminal", data.terminal, L));
  baris.push(duaKolom("Waktu", data.waktu, L));
  baris.push(garis(L));
  baris.push(data.item.nama);
  baris.push(duaKolom("Tujuan", data.item.tujuan, L));
  if (data.namaPelangganMasked) {
    baris.push(duaKolom("Nama", data.namaPelangganMasked, L));
  }
  baris.push(duaKolom("Harga", rupiah(data.item.harga), L));
  baris.push(garis(L));
  baris.push(duaKolom("TOTAL", rupiah(data.total), L));
  baris.push(duaKolom("Metode", data.metode, L));
  baris.push(duaKolom("Status", data.pending ? "PENDING" : data.status, L));
  if (data.snRef) baris.push(duaKolom("SN", data.snRef, L));
  if (data.voucherCode) {
    baris.push(garis(L));
    baris.push("KODE VOUCHER");
    baris.push(data.voucherCode);
  }
  baris.push(garis(L));
  if (data.pending) {
    baris.push("STRUK SEMENTARA");
    baris.push("Produk sedang diproses supplier.");
    baris.push("Bukti final dikirim via WhatsApp.");
    baris.push(garis(L));
  }
  baris.push(data.footer ?? "Terima kasih! Simpan struk ini.");
  baris.push("STOP-UP! - Stop Sejenak, Top-Up Cepat!");
  return baris.join("\n");
}

/** Byte lengkap siap kirim ke printer: init → isi → cut. */
export function buildStrukBytes(data: DataStruk): Uint8Array {
  const L = 32;
  const bagian: Uint8Array[] = [
    init(),
    codePage(0),
    align("tengah"),
    bold(true),
    size(true),
    line(data.namaMerchant.toUpperCase()),
    size(false),
    line(data.alamat),
    bold(false),
    align("kiri"),
    line(garis(L)),
    line(duaKolom("Invoice", data.invoiceId, L)),
    line(duaKolom("Terminal", data.terminal, L)),
    line(duaKolom("Waktu", data.waktu, L)),
    line(garis(L)),
    line(data.item.nama),
    line(duaKolom("Tujuan", data.item.tujuan, L)),
  ];

  if (data.namaPelangganMasked) {
    bagian.push(line(duaKolom("Nama", data.namaPelangganMasked, L)));
  }
  bagian.push(line(duaKolom("Harga", rupiah(data.item.harga), L)));
  bagian.push(line(garis(L)));
  bagian.push(bold(true), line(duaKolom("TOTAL", rupiah(data.total), L)), bold(false));
  bagian.push(line(duaKolom("Metode", data.metode, L)));
  bagian.push(line(duaKolom("Status", data.pending ? "PENDING" : data.status, L)));
  if (data.snRef) bagian.push(line(duaKolom("SN", data.snRef, L)));

  if (data.voucherCode) {
    bagian.push(line(garis(L)));
    bagian.push(align("tengah"), line("KODE VOUCHER"));
    // Tebal + 2x ukuran: kode voucher harus paling mudah dibaca.
    bagian.push(bold(true), size(true), line(data.voucherCode), size(false), bold(false));
    bagian.push(align("kiri"));
  }

  bagian.push(line(garis(L)));
  if (data.pending) {
    bagian.push(align("tengah"));
    bagian.push(line("STRUK SEMENTARA"));
    bagian.push(line("Produk sedang diproses supplier."));
    bagian.push(line("Bukti final dikirim via WhatsApp."));
    bagian.push(align("kiri"), line(garis(L)));
  }
  bagian.push(align("tengah"), line(data.footer ?? "Terima kasih!"));
  bagian.push(line("STOP-UP! - Stop Sejenak, Top-Up Cepat!"));
  bagian.push(feed(3), cut());

  return concat(...bagian);
}
