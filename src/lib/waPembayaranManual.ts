/**
 * Draf pesan WhatsApp berisi rekening tujuan pembayaran — MURNI.
 *
 * Dipakai tombol admin di ruang pendana: admin menyalin rekening usaha dari
 * Pengaturan Sistem ke draf WhatsApp, menambah nominal bila perlu, lalu
 * mengirimnya sendiri. Tidak ada pengiriman otomatis dan tidak ada nomor yang
 * dikarang: nomor tujuan yang tidak sah ditolak pemanggil (`normalkanNomorWa`),
 * bukan diganti nomor lain.
 *
 * Aturan yang dijaga:
 *  - **Tanpa placeholder.** Nominal kosong atau catatan kosong dihilangkan
 *    seluruh barisnya, bukan dibiarkan sebagai `[nominal]` di tangan pendana.
 *  - **Rekening disebut apa adanya.** Nama bank, nomor, dan atas nama datang
 *    dari konfigurasi admin, bukan diketik ulang di komponen.
 */

export type DataPembayaranManual = {
  namaBank: string;
  nomorRekening: string;
  namaRekening: string;
  /** Nominal yang diminta; `null`/kosong = baris nominal tidak ditulis. */
  nominal?: number | null;
  /** Catatan bebas admin (mis. kode unik atau tenggat); kosong = dihilangkan. */
  catatan?: string | null;
};

/** Rupiah bulat yang boleh masuk pesan; selain itu dianggap "tidak diisi". */
function nominalSah(nominal: number | null | undefined): number | null {
  if (nominal === null || nominal === undefined) return null;
  if (!Number.isSafeInteger(nominal) || nominal <= 0) return null;
  return nominal;
}

/** Susun draf pesan pembayaran. Baris kosong memisahkan tiga bagian pesan. */
export function pesanPembayaranManual(data: DataPembayaranManual): string {
  const baris = [
    "Halo, berikut rekening tujuan pembayaran Anda di PINDAI:",
    "",
    `${data.namaBank} ${data.nomorRekening}`,
    `Atas nama: ${data.namaRekening}`,
  ];

  const nominal = nominalSah(data.nominal);
  if (nominal !== null) {
    baris.push(`Nominal: Rp ${nominal.toLocaleString("id-ID")}`);
  }

  const catatan = (data.catatan ?? "").trim();
  if (catatan !== "") {
    baris.push("", catatan);
  }

  baris.push(
    "",
    "Setelah transfer, mohon balas pesan ini dengan bukti transfer agar admin dapat mencocokkan mutasi. Terima kasih.",
  );

  return baris.join("\n");
}

/**
 * Ringkasan satu baris rekening untuk diletakkan di bawah tombol — admin perlu
 * membacanya sebelum menekan kirim, dan pendana membacanya di pesan.
 */
export function ringkasRekening(data: {
  namaBank: string;
  nomorRekening: string;
  namaRekening: string;
}): string {
  return `${data.namaBank} ${data.nomorRekening} · ${data.namaRekening}`;
}
