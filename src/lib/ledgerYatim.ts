/**
 * Deteksi "jurnal tanpa subjek" (yatim) pada ledger internal — logika murni,
 * tanpa React dan tanpa Convex, supaya bisa diuji sebagai skrip biasa
 * (`bun src/lib/ledgerYatim.test.ts`).
 *
 * Kenapa perlu: penghapusan data yang sudah berpindah dana sengaja TIDAK
 * menghapus jurnal ledger (append-only, Rule 5.1). Akibatnya akun
 * `pinjaman:<id>` / `gadai:<id>` / `kredit:<id>` bisa tetap ada padahal baris
 * subjeknya sudah tidak ada. Itu memang yang diinginkan — tetapi harus
 * TERLIHAT, bukan senyap. Berkas ini mengelompokkan entri jurnal per akun
 * subjek yang subjeknya hilang, beserta sisa perpindahan uangnya.
 */

/** Produk yang punya akun subjek di ledger. */
export type SubjekLedger = "pinjaman" | "gadai" | "kredit";

export const PREFIKS_SUBJEK: Record<SubjekLedger, string> = {
  pinjaman: "pinjaman:",
  gadai: "gadai:",
  kredit: "kredit:",
};

export const LABEL_SUBJEK: Record<SubjekLedger, string> = {
  pinjaman: "Pinjaman",
  gadai: "Gadai",
  kredit: "Kredit barang",
};

/**
 * Bentuk id dokumen Convex: 32 karakter alfanumerik (di produksi basis-32 huruf
 * kecil; harness uji memakai huruf besar). Diperiksa supaya akun cacat — mis.
 * akun lama bertulis tangan seperti `pinjaman:e` — tidak pernah dianggap
 * sebagai subjek yang hilang. Laporan "yatim" harus berarti "barisnya
 * benar-benar pernah ada dan sekarang tidak", bukan tebakan; karena itu akun
 * yang bentuknya tidak sah dilewati sepenuhnya, bukan dilaporkan.
 */
const POLA_ID = /^[0-9A-Za-z]{32}$/;

export type SubjekAkun = { jenis: SubjekLedger; id: string };

/** Baca `<jenis>:<id>` → subjek. `null` untuk akun non-subjek (dana:, platform:…). */
export function subjekAkun(akun: string): SubjekAkun | null {
  for (const jenis of ["pinjaman", "gadai", "kredit"] as const) {
    const prefiks = PREFIKS_SUBJEK[jenis];
    if (!akun.startsWith(prefiks)) continue;
    const id = akun.slice(prefiks.length);
    return POLA_ID.test(id) ? { jenis, id } : null;
  }
  return null;
}

/** Entri ledger yang dibutuhkan analisis ini. */
export type EntriJurnal = {
  akun: string;
  arah: "debit" | "kredit";
  jumlah: number;
  waktu: number;
  keterangan?: string;
  groupId?: string;
};

/** Satu akun subjek yang entri jurnalnya masih ada tetapi subjeknya tidak. */
export type KelompokYatim = {
  akun: string;
  jenis: SubjekLedger;
  id: string;
  jumlahEntri: number;
  totalDebit: number;
  totalKredit: number;
  /** Debit − kredit: sisa perpindahan uang yang menunjuk subjek yang tak ada. */
  saldo: number;
  waktuTerakhir: number;
  keteranganTerakhir: string;
  /** Grup jurnal terkait, urut waktu — untuk ditelusuri di tab Ledger. */
  grup: string[];
};

/**
 * Kelompokkan entri jurnal per akun subjek yang `adaSubjek(jenis, id)` = false.
 * Urut dari yang paling baru disentuh; seri dipecah nama akun. Entri non-subjek
 * dan akun dengan id tidak sah dilewati sepenuhnya.
 */
export function kelompokkanJurnalYatim(
  entri: readonly EntriJurnal[],
  adaSubjek: (jenis: SubjekLedger, id: string) => boolean,
): KelompokYatim[] {
  const perAkun = new Map<string, KelompokYatim>();
  const grupPerAkun = new Map<string, string[]>();

  for (const e of entri) {
    const subjek = subjekAkun(e.akun);
    if (subjek === null) continue;
    if (adaSubjek(subjek.jenis, subjek.id)) continue;

    let baris = perAkun.get(e.akun);
    if (baris === undefined) {
      baris = {
        akun: e.akun,
        jenis: subjek.jenis,
        id: subjek.id,
        jumlahEntri: 0,
        totalDebit: 0,
        totalKredit: 0,
        saldo: 0,
        waktuTerakhir: e.waktu,
        keteranganTerakhir: e.keterangan ?? "",
        grup: [],
      };
      perAkun.set(e.akun, baris);
      grupPerAkun.set(e.akun, []);
    }
    baris.jumlahEntri += 1;
    if (e.arah === "debit") baris.totalDebit += e.jumlah;
    else baris.totalKredit += e.jumlah;
    baris.saldo = baris.totalDebit - baris.totalKredit;
    if (e.waktu >= baris.waktuTerakhir) {
      baris.waktuTerakhir = e.waktu;
      baris.keteranganTerakhir = e.keterangan ?? baris.keteranganTerakhir;
    }
    if (e.groupId !== undefined) {
      const grup = grupPerAkun.get(e.akun);
      if (grup !== undefined && !grup.includes(e.groupId)) grup.push(e.groupId);
    }
  }

  for (const [akun, baris] of perAkun) {
    baris.grup = grupPerAkun.get(akun) ?? [];
  }

  return [...perAkun.values()].sort((a, b) =>
    b.waktuTerakhir === a.waktuTerakhir
      ? a.akun.localeCompare(b.akun)
      : b.waktuTerakhir - a.waktuTerakhir,
  );
}

/**
 * Jumlah akun, entri, dan nilai entri yang menunjuk subjek yang sudah hilang.
 * `nilai` menjumlahkan SELURUH entri (debit + kredit) — ukuran volume jurnal
 * yang menggantung, bukan saldo (saldo per akun dilaporkan di masing-masing
 * kelompok, karena arahnya bergantung sisi akun yang disentuh).
 */
export function ringkasJurnalYatim(kelompok: readonly KelompokYatim[]): {
  akun: number;
  entri: number;
  nilai: number;
} {
  let entri = 0;
  let nilai = 0;
  for (const k of kelompok) {
    entri += k.jumlahEntri;
    nilai += k.totalDebit + k.totalKredit;
  }
  return { akun: kelompok.length, entri, nilai };
}
