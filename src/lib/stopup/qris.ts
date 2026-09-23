/**
 * STOP-UP! — Generator Payload QRIS (EMVCo Merchant-Presented Mode)
 *
 * Layar terminal harus menampilkan QR yang benar-benar bisa dibaca aplikasi
 * bank/e-wallet. Fungsi di sini menyusun TLV (Tag-Length-Value) sesuai
 * spesifikasi EMVCo, lalu menutup payload dengan CRC-16/CCITT-FALSE di tag 63.
 *
 * Modul ini MURNI (tanpa dependensi) sehingga bisa dipakai di Convex, di
 * browser, dan diuji unit.
 */

/** CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, tanpa refleksi. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Satu elemen TLV: ID (2 digit) + panjang (2 digit) + nilai. */
export function tlv(id: string, value: string): string {
  const length = value.length.toString().padStart(2, "0");
  if (value.length > 99) throw new Error(`Nilai tag ${id} melebihi 99 karakter.`);
  return `${id}${length}${value}`;
}

export type QrisInput = {
  /** Merchant PAN / NMID penyedia QRIS. */
  merchantId: string;
  /** Nama merchant yang tampil di aplikasi pembayar. */
  merchantName: string;
  merchantCity?: string;
  /** Domain GUI issuer, mis. "ID.CO.QRIS.WWW". */
  gui?: string;
  /** Nominal tagihan — rupiah BULAT. */
  amount: number;
  /** Nomor invoice sebagai bill number (tag 62-01). */
  invoiceId: string;
  /** Label terminal (tag 62-07). */
  terminalLabel?: string;
};

/** Tag 63 harus dihitung setelah "6304" ditulis — itulah kenapa ditutup manual. */
export function buildQrisPayload(input: QrisInput): string {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("Nominal QRIS harus bilangan bulat rupiah > 0.");
  }

  const merchantAccount = [
    tlv("00", input.gui ?? "ID.CO.QRIS.WWW"),
    tlv("01", input.merchantId),
    tlv("02", input.merchantId),
    tlv("03", "UMI"),
  ].join("");

  const additional = [
    tlv("01", input.invoiceId.slice(0, 25)),
    tlv("05", input.invoiceId.slice(0, 25)),
    input.terminalLabel ? tlv("07", input.terminalLabel.slice(0, 25)) : "",
  ].join("");

  const tanpaCrc = [
    tlv("00", "01"),
    // 12 = QR dinamis sekali pakai (nominal ditentukan merchant).
    tlv("01", "12"),
    tlv("26", merchantAccount),
    tlv("52", "0000"),
    tlv("53", "360"),
    tlv("54", String(input.amount)),
    tlv("58", "ID"),
    tlv("59", (input.merchantName || "STOP-UP!").slice(0, 25).toUpperCase()),
    tlv("60", (input.merchantCity || "JAKARTA").slice(0, 15).toUpperCase()),
    tlv("62", additional),
  ].join("") + "6304";

  return `${tanpaCrc}${crc16(tanpaCrc)}`;
}

/** Validasi ringan payload hasil generator (dipakai unit test & guard server). */
export function validasiQrisPayload(payload: string): boolean {
  if (payload.length < 20) return false;
  if (!payload.endsWith(crc16(payload.slice(0, -4)))) return false;
  return payload.startsWith("000201");
}
