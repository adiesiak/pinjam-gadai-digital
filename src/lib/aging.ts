/**
 * Aging portofolio & konsentrasi produk — murni, tanpa database.
 *
 * Dasar angka yang dipakai adalah POKOK TERCATAT pada baris pinjaman/gadai/
 * kredit, bukan saldo outstanding yang dihitung ulang. Aplikasi ini tidak
 * menyimpan sisa pokok pinjaman tunai per tanggal, jadi menyebutnya
 * "outstanding" akan melebihkan ketepatan yang sebenarnya tidak ada. Kolomnya
 * diberi nama `pokokTercatat` di seluruh modul.
 *
 * Bucket mengikuti hari keterlambatan (DPD) yang dihitung dari tanggal cair +
 * tenor — aturan yang sama dengan `lib/plafon` dan `lib/kepercayaanPeminjam`.
 */

const HARI_MS = 86_400_000;

export const BUCKET_AGING = ["lancar", "1-30", "31-60", "61-90", ">90"] as const;
export type BucketAging = (typeof BUCKET_AGING)[number];

export const LABEL_BUCKET_AGING: Record<BucketAging, string> = {
  lancar: "Belum jatuh tempo",
  "1-30": "1–30 hari",
  "31-60": "31–60 hari",
  "61-90": "61–90 hari",
  ">90": "Lebih dari 90 hari",
};

export type PinjamanUntukAging = {
  status: string;
  pokokPinjaman: number;
  didanaiPada?: number | null;
  tenorHari?: number | null;
  tenorBulan?: number | null;
};

/** Jatuh tempo pinjaman tunai; null bila data tenor/waktu cair tidak sah. */
export function jatuhTempoAging(p: PinjamanUntukAging): number | null {
  const didanai = p.didanaiPada ?? null;
  if (didanai === null || !Number.isSafeInteger(didanai) || didanai <= 0) return null;
  const tenorHari =
    p.tenorBulan !== null && p.tenorBulan !== undefined
      ? p.tenorBulan * 30
      : (p.tenorHari ?? null);
  if (tenorHari === null || !Number.isSafeInteger(tenorHari) || tenorHari <= 0) return null;
  return didanai + tenorHari * HARI_MS;
}

/** Hari keterlambatan (0 = belum lewat jatuh tempo). */
export function hariTerlambatAging(p: PinjamanUntukAging, sekarang: number): number {
  const jatuhTempo = jatuhTempoAging(p);
  if (jatuhTempo === null) return 0;
  return Math.max(0, Math.floor((sekarang - jatuhTempo) / HARI_MS));
}

export function bucketDariHari(hari: number): BucketAging {
  if (hari <= 0) return "lancar";
  if (hari <= 30) return "1-30";
  if (hari <= 60) return "31-60";
  if (hari <= 90) return "61-90";
  return ">90";
}

export type BarisAging = {
  bucket: BucketAging;
  jumlah: number;
  pokokTercatat: number;
};

export type HasilAging = {
  baris: BarisAging[];
  totalPokok: number;
  totalMenunggak: number;
  /** Bagian pokok yang sudah melewati jatuh tempo (0–1). */
  rasioMenunggak: number;
};

/**
 * Hitung aging dari pinjaman tunai yang masih `didanai`.
 *
 * Pinjaman tanpa tanggal cair/tenor yang sah tetap dihitung sebagai lancar —
 * bukan disembunyikan — karena pokoknya nyata, hanya umurnya yang tidak bisa
 * ditentukan dari data yang ada.
 */
export function hitungAging(
  pinjaman: readonly PinjamanUntukAging[],
  sekarang: number,
): HasilAging {
  const peta = new Map<BucketAging, { jumlah: number; pokok: number }>(
    BUCKET_AGING.map((b) => [b, { jumlah: 0, pokok: 0 }]),
  );
  let totalPokok = 0;
  let totalMenunggak = 0;

  for (const p of pinjaman) {
    if (p.status !== "didanai") continue;
    if (!Number.isSafeInteger(p.pokokPinjaman) || p.pokokPinjaman <= 0) continue;
    const bucket = bucketDariHari(hariTerlambatAging(p, sekarang));
    const sel = peta.get(bucket);
    if (sel === undefined) continue;
    sel.jumlah += 1;
    sel.pokok += p.pokokPinjaman;
    totalPokok += p.pokokPinjaman;
    if (bucket !== "lancar") totalMenunggak += p.pokokPinjaman;
  }

  return {
    baris: BUCKET_AGING.map((bucket) => ({
      bucket,
      jumlah: peta.get(bucket)?.jumlah ?? 0,
      pokokTercatat: peta.get(bucket)?.pokok ?? 0,
    })),
    totalPokok,
    totalMenunggak,
    rasioMenunggak: totalPokok === 0 ? 0 : totalMenunggak / totalPokok,
  };
}

export type BarisProduk = { produk: string; pokok: number };
export type KonsentrasiProduk = {
  produk: string;
  pokokTercatat: number;
  porsi: number;
  jumlah: number;
};

/**
 * Konsentrasi pokok per produk, urut terbesar. `porsi` adalah bagian terhadap
 * total seluruh produk (0–1), bukan terhadap portofolio outstanding.
 */
export function konsentrasiProduk(baris: readonly BarisProduk[]): KonsentrasiProduk[] {
  const peta = new Map<string, { pokok: number; jumlah: number }>();
  let total = 0;
  for (const b of baris) {
    if (!Number.isSafeInteger(b.pokok) || b.pokok <= 0) continue;
    const sel = peta.get(b.produk) ?? { pokok: 0, jumlah: 0 };
    sel.pokok += b.pokok;
    sel.jumlah += 1;
    peta.set(b.produk, sel);
    total += b.pokok;
  }
  return [...peta.entries()]
    .map(([produk, { pokok, jumlah }]) => ({
      produk,
      pokokTercatat: pokok,
      jumlah,
      porsi: total === 0 ? 0 : pokok / total,
    }))
    .sort((a, b) => b.pokokTercatat - a.pokokTercatat);
}

function selCsv(nilai: string | number): string {
  const teks = String(nilai);
  return /[",\n;]/.test(teks) ? `"${teks.replace(/"/g, '""')}"` : teks;
}

/**
 * CSV siap unduh. Angka rupiah ditulis sebagai bilangan bulat tanpa pemisah
 * ribuan supaya bisa langsung diolah spreadsheet; label bucket memakai teks
 * yang sama dengan layar.
 */
export function csvAging(aging: HasilAging, konsentrasi: readonly KonsentrasiProduk[]): string {
  const garis: string[] = [];
  garis.push(["Laporan", "Aging portofolio PINDAI"].map(selCsv).join(","));
  garis.push(["Dihasilkan", new Date().toISOString()].map(selCsv).join(","));
  garis.push("");
  garis.push(["Bucket", "Jumlah pinjaman", "Pokok tercatat (Rp)"].map(selCsv).join(","));
  for (const b of aging.baris) {
    garis.push(
      [LABEL_BUCKET_AGING[b.bucket], b.jumlah, Math.round(b.pokokTercatat)].map(selCsv).join(","),
    );
  }
  garis.push(
    ["Total", aging.baris.reduce((n, b) => n + b.jumlah, 0), Math.round(aging.totalPokok)]
      .map(selCsv)
      .join(","),
  );
  garis.push("");
  garis.push(["Produk", "Jumlah baris", "Pokok tercatat (Rp)", "Porsi"].map(selCsv).join(","));
  for (const k of konsentrasi) {
    garis.push(
      [k.produk, k.jumlah, Math.round(k.pokokTercatat), `${(k.porsi * 100).toFixed(1)}%`]
        .map(selCsv)
        .join(","),
    );
  }
  return `${garis.join("\n")}\n`;
}
