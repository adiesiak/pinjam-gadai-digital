/**
 * Pelacakan status transfer keuntungan penyedia dana — fungsi MURNI.
 *
 * PINDAI adalah produk pencatatan: ia tidak pernah memindahkan uang. Seluruh
 * mutation pembayaran tetap ditutup `paymentGuard`. Yang dilacak di sini adalah
 * catatan admin bahwa keuntungan pendana SUDAH ia transfer di luar sistem,
 * beserta referensi mutasinya — supaya tidak ada keuntungan yang tertagih dua
 * kali atau terlupakan.
 *
 * Karena itu seluruh istilah di sini berbunyi "dicatat", bukan "terbayar":
 * `belum_dicatat` berarti admin belum mencatat transfernya, BUKAN berarti uang
 * belum berpindah. Bukti perpindahan dana tetap ada di bank/e-wallet.
 *
 * Kapan sebuah pinjaman perlu dicatat transfernya: hak penyedia dana baru
 * menjadi miliknya setelah kewajiban Peminjam lunas (status `lunas`). Pinjaman
 * yang masih berjalan belum punya keuntungan untuk ditransfer.
 */

/** Satu baris catatan transfer — bentuk minimal yang dibutuhkan perhitungan. */
export type TransferBaris = {
  jumlah: number;
  status: string;
  /** Waktu pencatatan (epoch ms) — dipakai memilih baris terbaru. */
  dicatatPada: number;
  referensi?: string | null;
  metode?: string | null;
  catatan?: string | null;
  dicatatOlehLabel?: string | null;
  alasanBatal?: string | null;
};

export type StatusTransfer = "belum_dicatat" | "dicatat" | "dibatalkan";

/** Ringkasan catatan transfer untuk SATU pinjaman. */
export type RingkasTransfer = {
  status: StatusTransfer;
  /** Nominal yang tercatat pada baris terbaru (0 bila belum ada). */
  jumlah: number;
  referensi: string | null;
  metode: string | null;
  catatan: string | null;
  dicatatOlehLabel: string | null;
  dicatatPada: number | null;
  alasanBatal: string | null;
  /** Jumlah baris catatan yang masih berlaku (`dicatat`) — 0 atau 1. */
  jumlahCatatan: number;
  /** Ada catatan yang pernah dibatalkan pada pinjaman ini. */
  adaPembatalan: boolean;
};

export const TRANSFER_KOSONG: RingkasTransfer = {
  status: "belum_dicatat",
  jumlah: 0,
  referensi: null,
  metode: null,
  catatan: null,
  dicatatOlehLabel: null,
  dicatatPada: null,
  alasanBatal: null,
  jumlahCatatan: 0,
  adaPembatalan: false,
};

/**
 * Ringkas riwayat transfer satu pinjaman menjadi satu status.
 *
 * Baris TERBARU (berdasarkan `dicatatPada`) yang menentukan: bila baris terbaru
 * dibatalkan maka statusnya `dibatalkan`, walau sebelumnya pernah dicatat. Bila
 * belum ada baris sama sekali, statusnya `belum_dicatat`.
 */
export function ringkasTransfer(baris: readonly TransferBaris[]): RingkasTransfer {
  if (baris.length === 0) return TRANSFER_KOSONG;

  const terurut = [...baris].sort((a, b) => b.dicatatPada - a.dicatatPada);
  const terbaru = terurut[0];
  const adaPembatalan = baris.some((b) => b.status === "dibatalkan");
  const jumlahCatatan = baris.filter((b) => b.status === "dicatat").length;
  const berlaku = terbaru.status === "dicatat";

  return {
    status: berlaku ? "dicatat" : "dibatalkan",
    jumlah: berlaku ? terbaru.jumlah : 0,
    referensi: berlaku ? (terbaru.referensi ?? null) : null,
    metode: berlaku ? (terbaru.metode ?? null) : null,
    catatan: berlaku ? (terbaru.catatan ?? null) : null,
    dicatatOlehLabel: berlaku ? (terbaru.dicatatOlehLabel ?? null) : null,
    dicatatPada: berlaku ? terbaru.dicatatPada : null,
    alasanBatal: berlaku ? null : (terbaru.alasanBatal ?? null),
    jumlahCatatan,
    adaPembatalan,
  };
}

/** Pinjaman yang relevan untuk rekap transfer (bentuk minimal). */
export type PinjamanTransfer = {
  status: string;
  /** Keuntungan bersih penyedia dana atas pinjaman ini (rupiah bulat). */
  keuntunganPendana: number;
  /** Apakah pinjaman ini punya penyedia dana yang jelas. */
  adaPendana: boolean;
  transfer: RingkasTransfer;
};

/** Rekap transfer SATU penyedia dana. */
export type RekapTransferPendana = {
  /** Pinjaman lunas yang punya pendana — yang seharusnya sudah ditransfer. */
  jumlahLunas: number;
  jumlahTercatat: number;
  jumlahBelumDicatat: number;
  /** Total hak keuntungan atas pinjaman lunas (rupiah bulat). */
  keuntunganLunas: number;
  /** Bagian yang sudah dicatat ditransfer (rupiah bulat). */
  keuntunganTercatat: number;
  /** Bagian yang belum dicatat (rupiah bulat). */
  keuntunganBelumDicatat: number;
  /** Ada pinjaman yang masih berjalan — keuntungannya belum jatuh tempo. */
  adaBerjalan: boolean;
};

/**
 * Rekap status transfer untuk satu penyedia dana.
 *
 * Hanya pinjaman berstatus `lunas` yang dihitung sebagai kewajiban transfer —
 * keuntungan pinjaman yang masih berjalan belum menjadi hak pendana. Pinjaman
 * tanpa pendana tidak pernah dihitung karena tidak ada penerimanya.
 */
export function rekapTransferPendana(
  pinjaman: readonly PinjamanTransfer[],
): RekapTransferPendana {
  const lunas = pinjaman.filter((p) => p.status === "lunas" && p.adaPendana);
  const tercatat = lunas.filter((p) => p.transfer.status === "dicatat");

  const keuntunganLunas = lunas.reduce((total, p) => total + p.keuntunganPendana, 0);
  const keuntunganTercatat = tercatat.reduce(
    (total, p) => total + p.keuntunganPendana,
    0,
  );

  return {
    jumlahLunas: lunas.length,
    jumlahTercatat: tercatat.length,
    jumlahBelumDicatat: lunas.length - tercatat.length,
    keuntunganLunas,
    keuntunganTercatat,
    keuntunganBelumDicatat: keuntunganLunas - keuntunganTercatat,
    adaBerjalan: pinjaman.some((p) => p.status === "didanai" && p.adaPendana),
  };
}

/**
 * Aksi pencatatan keuntungan yang boleh ditawarkan untuk satu pinjaman.
 *
 * Pencatatan hanya masuk akal pada pinjaman lunas yang punya pendana: sebelum
 * lunas belum ada hak yang jatuh tempo, dan tanpa pendana tidak ada penerima.
 * Catatan yang masih berlaku ditawari pembatalan — bukan pencatatan ulang —
 * sedangkan catatan yang sudah dibatalkan boleh dicatat ulang.
 */
export type AksiKeuntungan = "catat" | "batalkan" | null;

export function aksiKeuntunganPinjaman(
  pinjaman: Pick<PinjamanTransfer, "status" | "adaPendana" | "transfer">,
): AksiKeuntungan {
  if (pinjaman.status !== "lunas" || !pinjaman.adaPendana) return null;
  return pinjaman.transfer.status === "dicatat" ? "batalkan" : "catat";
}

/** Label Indonesia untuk status transfer — dipakai UI dan ringkasan. */
export const LABEL_TRANSFER: Record<StatusTransfer, string> = {
  belum_dicatat: "belum dicatat",
  dicatat: "sudah dicatat",
  dibatalkan: "catatan dibatalkan",
};

/** Label metode pengiriman dana yang dipilih admin. */
export const LABEL_METODE_TRANSFER: Record<string, string> = {
  transfer_bank: "transfer bank",
  e_wallet: "e-wallet",
  tunai: "tunai",
};