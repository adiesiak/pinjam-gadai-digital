/**
 * PINDAI — Skema Bulanan: KREDIT & PINJAMAN DI LUAR 1 JT / 28 HARI.
 *
 * Formula kredit bulanan (tenor 1, 3, 6 bulan — dst) dengan
 * pembulatan integer rupiah HALF-UP. Dipakai untuk kredit barang maupun
 * pinjaman tunai yang tenornya bukan skema 1 juta / 28 hari.
 *
 * Aturan skema:
 *  - Uang muka (DP) 0% → pokok dibiayai = harga/pokok penuh.
 *  - Angsuran pokok per bulan = pokok ÷ tenor (bulan terakhir menyerap sisa).
 *  - Tenor 3, 6, 9, dan 12 bulan: biaya admin 2% (platform 0%) dari pokok,
 *    DIPOTONG DI MUKA dari dana yang diterima (tidak diamortisasi ke cicilan).
 *    Tenor 1 memakai biaya layanan 2%, juga dipotong di muka — jadi potongan
 *    di muka selalu 2% (dana diterima 98%), berapa pun tenor yang dipilih.
 *  - Bunga/margin (hak penyedia dana) — FLAT dari pokok penuh, sama besar setiap
 *    bulan (tidak menurun dari sisa pokok):
 *      tenor 1 bulan   → 30% / bulan (marjin total 30%)
 *      tenor 3 bulan   →  8% / bulan (marjin total 24%)
 *      tenor 6 bulan   → 12% / bulan (marjin total 72%)
 *      tenor 9 bulan   → 10% / bulan (marjin total 90%)
 *      tenor 12 bulan  →  8% / bulan (marjin total 96%)
 *    Kelima angka itu masing-masing bisa diatur admin di Pengaturan Sistem.
 *  - Cicilan = angsuran pokok + bunga bulan itu. Karena bunga flat, cicilan
 *    bulanan rata (bulan terakhir hanya menyerap pembulatan pokok).
 *  - SETIAP tenor bulanan resmi (1, 3, 6, 9, dan 12 bulan) dikenai biaya
 *    admin layanan 2% DARI NOMINAL CICILAN yang dibayar bersama cicilan
 *    setiap bulan (bukan dipotong di muka).
 *  - Dana diterima Peminjam = pokok − potongan di muka.
 *
 * Guardrail Rule 3: semua uang integer rupiah — pembagian pokok memakai
 * pola floor-split (bulan terakhir menyerap sisa) sehingga Σ jadwal TEPAT
 * sama dengan total kewajiban, tanpa floating-point error.
 */
import { isRupiah, percentOf, type Rupiah } from "./money";

/** Pilihan tenor bulanan resmi skema ini (bulan). */
export const TENOR_BULANAN_OPTIONS = [1, 3, 6, 9, 12] as const;

/**
 * Tenor default yang memakai biaya admin 2% (platform 0%) dari pokok
 * (dipotong di muka). Tenor di luar daftar ini memakai biaya layanan 2% —
 * besar potongannya sama, hanya nama komponennya yang berbeda.
 * Skema kredit barang menyeragamkan seluruh tenor resminya lewat opsi
 * `tenorBiayaAdminPlatform` pada hitungSimulasiBulanan.
 */
export const TENOR_BIAYA_ADMIN_PLATFORM_DEFAULT = [3, 6, 9, 12] as const;

/**
 * Tarif skema bulanan yang bisa diatur admin.
 *
 * Nama kolomnya sengaja sama dengan kolom di Pengaturan Sistem supaya
 * snapshot yang disimpan di pinjaman bisa dikirim balik apa adanya tanpa
 * penerjemahan nama — satu kesalahan ketik nama kolom berarti angka kontrak
 * berubah diam-diam.
 */
export interface TarifBulanan {
  /** Bunga flat tenor 1 bulan (% dari pokok penuh, per bulan). */
  persenBungaBulanan1: number;
  /** Bunga flat tenor 3–5 bulan (% dari pokok penuh, per bulan). */
  persenBungaBulanan3: number;
  /** Bunga flat tenor 6 bulan (% dari pokok penuh, per bulan). */
  persenBungaBulanan6: number;
  /** Bunga flat tenor 9 bulan (% dari pokok penuh, per bulan). */
  persenBungaBulanan9: number;
  /** Bunga flat tenor 12 bulan (% dari pokok penuh, per bulan). */
  persenBungaBulanan12: number;
  /** Biaya layanan yang dipotong di muka (% dari pokok), semua tenor bulanan. */
  persenBiayaLayananBulanan: number;
  /** Biaya admin yang dibayar bersama SETIAP cicilan (% dari nominal cicilan). */
  persenBiayaAdminCicilanBulanan: number;
}

/**
 * Lengkapi tarif sebagian dengan nilai bawaan, dan jepit tiap angka ke 0–100%.
 *
 * Dipakai untuk membaca snapshot pinjaman lama (kolomnya belum ada) maupun
 * masukan admin yang belum lengkap: pinjaman tidak boleh gagal dihitung hanya
 * karena satu kolom tarif kosong.
 */
export function tarifBulananAman(
  nilai?: Partial<TarifBulanan> | null,
): TarifBulanan {
  const jepit = (angka: number): number => Math.min(100, Math.max(0, angka));
  const ambil = (kunci: keyof TarifBulanan): number => {
    const angka = nilai?.[kunci];
    if (angka === undefined || !Number.isFinite(angka)) {
      return TARIF_BULANAN_DEFAULT[kunci];
    }
    return jepit(angka);
  };
  /**
   * Tenor 9 dan 12 bulan bisa punya tarif sendiri. Snapshot pinjaman yang
   * terbit SEBELUM kolom itu ada hanya menyimpan tarif tenor 6 bulan, jadi
   * tarif itulah yang dipakai saat kolom barunya kosong — kontrak yang sudah
   * berjalan tidak boleh berubah angka hanya karena kolom baru ditambahkan.
   */
  const ambilWarisan = (
    kunci: "persenBungaBulanan9" | "persenBungaBulanan12",
  ): number => {
    const angka = nilai?.[kunci];
    if (angka !== undefined && Number.isFinite(angka)) return jepit(angka);
    const bunga6 = nilai?.persenBungaBulanan6;
    if (bunga6 !== undefined && Number.isFinite(bunga6)) return jepit(bunga6);
    return TARIF_BULANAN_DEFAULT[kunci];
  };
  return {
    persenBungaBulanan1: ambil("persenBungaBulanan1"),
    persenBungaBulanan3: ambil("persenBungaBulanan3"),
    persenBungaBulanan6: ambil("persenBungaBulanan6"),
    persenBungaBulanan9: ambilWarisan("persenBungaBulanan9"),
    persenBungaBulanan12: ambilWarisan("persenBungaBulanan12"),
    persenBiayaLayananBulanan: ambil("persenBiayaLayananBulanan"),
    persenBiayaAdminCicilanBulanan: ambil("persenBiayaAdminCicilanBulanan"),
  };
}

/** Opsi biaya skema bulanan (dipakai skema kredit barang & bunga per nasabah). */
export interface OpsiBiayaBulanan {
  /** Tenor yang memakai biaya admin 2% (platform 0%) dipotong di muka. */
  tenorBiayaAdminPlatform?: readonly number[];
  /**
   * Override bunga per bulan (persen, flat dari pokok penuh) untuk nasabah
   * dengan bunga khusus admin. Kosong = pakai tarif tenor bawaan.
   */
  persenBungaPerBulan?: number;
  /**
   * Tarif bulanan yang berlaku (dari Pengaturan Sistem atau snapshot pinjaman).
   * Kosong = tarif bawaan. Angka yang tidak diisi memakai nilai bawaan.
   */
  tarif?: Partial<TarifBulanan> | null;
}

export const BULANAN_PRICING = {
  /** Uang muka 0% — seluruh harga/pokok dibiayai. */
  dpPersen: 0,
  /**
   * Biaya layanan untuk tenor selain 3 dan 6 bulan (dipotong di muka).
   * Besarnya sama dengan total biaya tenor admin+platform (2%) supaya potongan
   * di muka seragam 2%, hanya nama komponennya yang berbeda.
   */
  biayaLayananPersen: 2,
  /** Total biaya tenor yang memakai admin + platform = 2% + 0% = 2%. */
  biayaTenor3_6Persen: 2,
  /**
   * Biaya admin layanan yang dibayar bersama SETIAP cicilan (% dari nominal
   * cicilan pokok + bunga). Berlaku pada semua tenor resmi (1, 3, 6, 9, 12).
   */
  biayaAdminCicilanPersen: 2,
  /** Biaya admin (% pokok) pada tenor yang memakai admin + platform di muka. */
  biayaAdminPersen: 2,
  /**
   * Biaya platform (% pokok) dihapus — potongan di muka kini hanya biaya
   * admin 2%. Konstanta tetap ada agar mesin fee punya satu jalur perhitungan
   * (nol rupiah) dan rincian biaya platform di kontrak/UI tetap konsisten.
   */
  biayaPlatformPersen: 0,
  /** Bunga tenor 1 bulan (%/bulan, flat dari pokok penuh). */
  bungaTenor1PersenPerBulan: 30,
  /**
   * Bunga tenor 3–5 bulan (%/bulan, flat dari pokok penuh). 8% × 3 bulan =
   * marjin total 24%. Angka ini sengaja tidak lebih tinggi dari tenor 6/9/12
   * agar tarif bawaan tidak menghukum tenor menengah yang lebih panjang.
   */
  bungaTenor3_5PersenPerBulan: 8,
  /**
   * Bunga tenor 6 bulan (%/bulan, flat dari pokok penuh). 12% × 6 bulan =
   * marjin total 72%, sesuai kebijakan tenor di `lib/kebijakanPinjaman`.
   */
  bungaMin6PersenPerBulan: 12,
  /** Bunga tenor 9 bulan (%/bulan) — dipangkas supaya tenor panjang tetap masuk. */
  bungaTenor9PersenPerBulan: 10,
  /** Bunga tenor 12 bulan (%/bulan) — marjin total 96%. */
  bungaTenor12PersenPerBulan: 8,
  /**
   * Batas profit total terhadap pokok untuk tenor resmi: bunga tenor terpanjang
   * (96% pada 12 bulan) + potongan di muka 2% + biaya admin cicilan. Batas ini
   * penjaga salah konfigurasi admin, bukan angka yang dijanjikan ke nasabah.
   */
  maxProfitTotalPersen: 230,
} as const;

/**
 * Tarif tenor 3 bulan pada konfigurasi bawaan lama (sebelum penyesuaian).
 *
 * Disimpan sebagai penanda migrasi saja: konfigurasi baru memakai 8%/bulan.
 */
export const PERSEN_BUNGA_BULANAN3_LAMA = 20;

/** Tarif bulanan bawaan — sama dengan angka yang berlaku sebelum bisa diatur. */
export const TARIF_BULANAN_DEFAULT: TarifBulanan = {
  persenBungaBulanan1: BULANAN_PRICING.bungaTenor1PersenPerBulan,
  persenBungaBulanan3: BULANAN_PRICING.bungaTenor3_5PersenPerBulan,
  persenBungaBulanan6: BULANAN_PRICING.bungaMin6PersenPerBulan,
  persenBungaBulanan9: BULANAN_PRICING.bungaTenor9PersenPerBulan,
  persenBungaBulanan12: BULANAN_PRICING.bungaTenor12PersenPerBulan,
  persenBiayaLayananBulanan: BULANAN_PRICING.biayaLayananPersen,
  persenBiayaAdminCicilanBulanan: BULANAN_PRICING.biayaAdminCicilanPersen,
};

/**
 * Apakah konfigurasi masih memakai profil tarif bawaan lama yang perlu
 * dimigrasikan.
 *
 * Hanya profil yang SELURUH tarifnya sama dengan bawaan lama yang dianggap
 * warisan. Tarif yang sudah disesuaikan admin — termasuk bila hanya tenor 3
 * bulan yang diubah — tidak boleh ditimpa diam-diam oleh pemulihan bawaan.
 */
export function tarifBulananBawaanLama(
  nilai?: Partial<TarifBulanan> | null,
): boolean {
  const tarif = tarifBulananAman(nilai);
  return (
    tarif.persenBungaBulanan3 === PERSEN_BUNGA_BULANAN3_LAMA &&
    tarif.persenBungaBulanan1 === TARIF_BULANAN_DEFAULT.persenBungaBulanan1 &&
    tarif.persenBungaBulanan6 === TARIF_BULANAN_DEFAULT.persenBungaBulanan6 &&
    tarif.persenBungaBulanan9 === TARIF_BULANAN_DEFAULT.persenBungaBulanan9 &&
    tarif.persenBungaBulanan12 === TARIF_BULANAN_DEFAULT.persenBungaBulanan12 &&
    tarif.persenBiayaLayananBulanan ===
      TARIF_BULANAN_DEFAULT.persenBiayaLayananBulanan &&
    tarif.persenBiayaAdminCicilanBulanan ===
      TARIF_BULANAN_DEFAULT.persenBiayaAdminCicilanBulanan
  );
}

/** Batas pokok/harga untuk skema bulanan (di luar skema 1 jt/28 hari). */
export const BULANAN_LIMITS = {
  minPokok: 100_000,
  maxPokok: 500_000_000,
} as const;

/**
 * Tarif bunga per bulan (% dari pokok penuh) sesuai tenor.
 *
 * `tarif` kosong memakai angka bawaan; server selalu mengirim tarif dari
 * Pengaturan Sistem (atau snapshot pinjaman) supaya halaman, kontrak, dan
 * mesin harga tidak pernah berbeda pendapat.
 */
export function persenBungaPerBulan(
  tenorBulan: number,
  tarif: Partial<TarifBulanan> | null | undefined = TARIF_BULANAN_DEFAULT,
): number {
  if (!Number.isSafeInteger(tenorBulan) || tenorBulan <= 0) {
    throw new Error("Tenor harus bilangan bulan positif.");
  }
  const angka = tarifBulananAman(tarif);
  if (tenorBulan >= 12) return angka.persenBungaBulanan12;
  if (tenorBulan >= 9) return angka.persenBungaBulanan9;
  if (tenorBulan >= 6) return angka.persenBungaBulanan6;
  if (tenorBulan >= 3) return angka.persenBungaBulanan3;
  return angka.persenBungaBulanan1;
}

/**
 * Metode bunga menurut tenor. Seluruh tenor resmi (1, 3, dan 6 bulan) memakai
 * bunga FLAT dari pokok penuh — mengikuti tarif tenor yang berlaku — sehingga
 * cicilan rata dan bukan menurun dari sisa pokok.
 *
 * Fungsi ini tetap ada sebagai satu titik kebijakan: bila suatu saat ada tenor
 * yang kembali memakai bunga menurun dari sisa pokok, cukup ubah nilai balik
 * di sini (mesin jadwal sudah menangani kedua metode).
 */
export function metodeBungaBulanan(tenorBulan: number): "menurun" | "flat" {
  if (!Number.isSafeInteger(tenorBulan) || tenorBulan <= 0) {
    throw new Error("Tenor harus bilangan bulan positif.");
  }
  return "flat";
}

/**
 * Apakah tenor dikenai biaya admin cicilan 2% dari nominal cicilan.
 *
 * Berlaku untuk SETIAP pembayaran bulanan pada tenor resmi (1, 3, 6, 9, dan
 * 12 bulan). Kontrak kredit barang warisan 12/24 bulan dihitung jalur
 * terpisah di `lib/kredit`, jadi tidak terpengaruh fungsi ini.
 */
export function tenorDenganBiayaAdminCicilan(tenorBulan: number): boolean {
  if (!Number.isSafeInteger(tenorBulan) || tenorBulan <= 0) {
    throw new Error("Tenor harus bilangan bulan positif.");
  }
  return (TENOR_BULANAN_OPTIONS as readonly number[]).includes(tenorBulan);
}

/** Satu baris jadwal cicilan bulanan. */
export interface CicilanBulananRow {
  /** Bulan ke-n (1..tenorBulan). */
  bulan: number;
  /** Angsuran pokok bulan ini. */
  pokok: Rupiah;
  /** Bunga/margin bulan ini (hak penyedia dana). */
  bunga: Rupiah;
  /** Porsi biaya admin pada baris ini — selalu nol (biaya dipotong di muka). */
  biayaAdmin: Rupiah;
  /** Porsi biaya platform pada baris ini — selalu nol (biaya dipotong di muka). */
  biayaPlatform: Rupiah;
  /** Porsi biaya tenor pada baris ini — selalu nol (biaya dipotong di muka). */
  biayaLayanan: Rupiah;
  /**
   * Biaya admin layanan 2% dari nominal cicilan bulan ini — dibayar bersama
   * setiap cicilan pada tenor resmi (1, 3, 6 bulan); nol pada tenor warisan.
   */
  biayaAdminCicilan: Rupiah;
  /** Total yang dibayar bulan ini = pokok + bunga + biaya admin cicilan. */
  total: Rupiah;
  /** Sisa pokok setelah cicilan bulan ini. */
  sisaPokok: Rupiah;
}

export interface SimulasiBulanan {
  /** Pokok pinjaman / harga barang (DP 0% → pokok dibiayai = nilai ini). */
  pokok: Rupiah;
  /** Uang muka — selalu 0 pada skema ini. */
  dp: Rupiah;
  /** Pokok dibiayai = pokok − DP. */
  pokokDibiayai: Rupiah;
  /** Tenor dalam bulan. */
  tenorBulan: number;
  /** Tarif bulanan lengkap yang dipakai hitungan ini (untuk snapshot/tampilan). */
  tarif: TarifBulanan;
  /** Tarif bunga per bulan (% dari sisa pokok atau pokok penuh) sesuai tenor. */
  persenBungaPerBulan: number;
  /** Metode bunga: menurun dari sisa pokok, atau flat dari pokok penuh. */
  metodeBunga: "menurun" | "flat";
  /** Total biaya admin (2% pada tenor 3/6; nol pada tenor 1) — dipotong di muka. */
  biayaAdminTotal: Rupiah;
  /** Total biaya platform (selalu 0 — dihapus) — dipotong di muka. */
  biayaPlatformTotal: Rupiah;
  /** Total biaya tenor: admin + platform (3/6) atau layanan (tenor lain). */
  biayaLayananTotal: Rupiah;
  /** Biaya yang dipotong di muka dari dana yang diterima = biayaLayananTotal. */
  potonganDiMuka: Rupiah;
  /** Dana yang diterima Peminjam = pokok − potonganDiMuka. */
  danaDiterima: Rupiah;
  /** Porsi biaya tenor per bulan — nol: biaya dipotong di muka, bukan diangsur. */
  biayaLayananPerBulan: Rupiah;
  /** Porsi biaya admin per bulan — nol: biaya dipotong di muka. */
  biayaAdminPerBulan: Rupiah;
  /** Porsi biaya platform per bulan — nol: biaya dipotong di muka. */
  biayaPlatformPerBulan: Rupiah;
  /** Bunga setiap bulan — tetap sama karena bunga flat dari pokok penuh. */
  bungaPerBulan: Rupiah;
  /** Total bayar bulan pertama = cicilan (pokok + bunga) + biaya admin 2%. */
  cicilanPerBulan: Rupiah;
  /** Total bayar bulan terakhir (termasuk sisa pembulatan pokok). */
  cicilanTerakhir: Rupiah;
  /** Bunga/margin total selama tenor (hak penyedia dana). */
  bungaTotal: Rupiah;
  /** Total cicilan yang dibayar Peminjam = Σ cicilan = pokok + bunga. */
  totalPengembalian: Rupiah;
  /** Total biaya admin cicilan 2% selama tenor (semua tenor resmi; nol pada tenor warisan). */
  biayaAdminCicilanTotal: Rupiah;
  /** Biaya admin cicilan pada bulan pertama. */
  biayaAdminCicilanPerBulan: Rupiah;
  /** Total biaya Peminjam = potongan di muka + bunga + biaya admin cicilan. */
  totalKeuntunganBersih: Rupiah;
  /** Biaya total sebagai persen pokok (1 desimal, gaya Indonesia). */
  persentaseProfitTotal: number;
  /** Jadwal cicilan per bulan — Σ pokok = pokokDibiayai, Σ total = totalPengembalian. */
  jadwal: CicilanBulananRow[];
}

/**
 * Validasi pokok + tenor skema bulanan — melempar pesan Indonesia yang jelas.
 * Dipakai server untuk menolak pengajuan di luar rentang sebelum menghitung.
 */
export function assertSimulasiBulananValid(
  pokok: Rupiah,
  tenorBulan: number,
  opsi: OpsiBiayaBulanan = {},
): void {
  hitungSimulasiBulanan(pokok, tenorBulan, opsi);
}

/**
 * Ringkasan kredit/pinjaman bulanan — mesin yang sama dipakai kalkulator,
 * form pengajuan, dan backend (angka tidak pernah diinput klien).
 *
 * Identitas yang dijamin (diuji di bulanan.test.ts):
 *  - dp = 0 dan pokokDibiayai = pokok
 *  - Σ jadwal.pokok = pokokDibiayai
 *  - Tenor 3/6 mengenakan admin 2% (platform 0%), tenor lain biaya layanan 2%
 *  - Seluruh biaya dipotong di muka: danaDiterima = pokok − potonganDiMuka
 *  - Jadwal hanya berisi pokok + bunga (Σ jadwal.total = totalPengembalian)
 *  - seluruh tenor resmi memakai bunga flat dari pokok penuh (mengikuti tarif
 *    tenor) sehingga cicilan rata
 *  - setiap tenor resmi (1/3/6) menambahkan biaya admin cicilan 2% dari
 *    nominal cicilan setiap bulan (Σ = biayaAdminCicilanTotal)
 *  - cicilanPerBulan = total bayar bulan pertama; cicilanTerakhir = bulan terakhir
 *  - totalKeuntunganBersih = potonganDiMuka + bungaTotal + biayaAdminCicilanTotal
 */
export function hitungSimulasiBulanan(
  pokok: Rupiah,
  tenorBulan: number,
  opsi: OpsiBiayaBulanan = {},
): SimulasiBulanan {
  if (!isRupiah(pokok) || pokok <= 0) {
    throw new Error("Pokok harus rupiah bulat positif (tanpa desimal).");
  }
  if (pokok < BULANAN_LIMITS.minPokok || pokok > BULANAN_LIMITS.maxPokok) {
    throw new Error(
      `Pokok harus antara ${BULANAN_LIMITS.minPokok} dan ${BULANAN_LIMITS.maxPokok} rupiah.`,
    );
  }
  if (!Number.isSafeInteger(tenorBulan) || tenorBulan <= 0) {
    throw new Error("Tenor harus bilangan bulan positif.");
  }

  const dp = 0;
  const pokokDibiayai = pokok - dp;
  const tarif = tarifBulananAman(opsi.tarif);
  const persen =
    opsi.persenBungaPerBulan !== undefined && Number.isFinite(opsi.persenBungaPerBulan)
      ? Math.min(100, Math.max(0, opsi.persenBungaPerBulan))
      : persenBungaPerBulan(tenorBulan, tarif);
  const metode = metodeBungaBulanan(tenorBulan);

  // Komponen biaya — semua HALF-UP per rupiah via percentOf (BigInt), dan
  // seluruhnya dipotong di muka (tidak pernah masuk ke cicilan). Sejak
  // kebijakan 2% di muka, `biayaPlatformTotal` selalu nol: potongan hanya
  // biaya admin (tenor admin+platform) atau biaya layanan (tenor lain).
  const pokokPerBulan = Math.floor(pokokDibiayai / tenorBulan);
  // Tenor flat: bunga selalu dihitung dari pokok penuh.
  const bungaPerBulan = percentOf(pokokDibiayai, persen);
  const bungaFlatPerBulan = metode === "flat" ? bungaPerBulan : 0;
  const tenorAdminPlatform = (
    opsi.tenorBiayaAdminPlatform ?? TENOR_BIAYA_ADMIN_PLATFORM_DEFAULT
  ).includes(tenorBulan);
  const biayaAdminTotal = tenorAdminPlatform
    ? percentOf(pokokDibiayai, tarif.persenBiayaLayananBulanan)
    : 0;
  const biayaPlatformTotal = tenorAdminPlatform
    ? percentOf(pokokDibiayai, BULANAN_PRICING.biayaPlatformPersen)
    : 0;
  const biayaLayananTotal = tenorAdminPlatform
    ? biayaAdminTotal + biayaPlatformTotal
    : percentOf(pokokDibiayai, tarif.persenBiayaLayananBulanan);
  const potonganDiMuka = biayaLayananTotal;
  const danaDiterima = pokokDibiayai - potonganDiMuka;

  // Setiap pembayaran bulanan tenor resmi dikenai biaya admin 2% dari
  // nominal cicilan (termasuk tenor 1 bulan).
  const tenorBiayaAdminCicilan = tenorDenganBiayaAdminCicilan(tenorBulan);

  // ===== Jadwal: pokok + bunga (+ biaya admin cicilan tiap pembayaran) =====
  const jadwal: CicilanBulananRow[] = [];
  let sisaPokok = pokokDibiayai;
  for (let bulan = 1; bulan <= tenorBulan; bulan += 1) {
    const terakhir = bulan === tenorBulan;
    const rowPokok = terakhir ? sisaPokok : pokokPerBulan;
    const rowBunga =
      bungaFlatPerBulan > 0 ? bungaFlatPerBulan : percentOf(sisaPokok, persen);
    // Biaya admin cicilan dihitung dari cicilan bulan itu (pokok + bunga).
    const rowBiayaAdminCicilan = tenorBiayaAdminCicilan
      ? percentOf(rowPokok + rowBunga, tarif.persenBiayaAdminCicilanBulanan)
      : 0;
    sisaPokok -= rowPokok;
    jadwal.push({
      bulan,
      pokok: rowPokok,
      bunga: rowBunga,
      biayaAdmin: 0,
      biayaPlatform: 0,
      biayaLayanan: 0,
      biayaAdminCicilan: rowBiayaAdminCicilan,
      total: rowPokok + rowBunga + rowBiayaAdminCicilan,
      sisaPokok,
    });
  }

  const cicilanPerBulan = jadwal[0].total;
  const cicilanTerakhir = jadwal[jadwal.length - 1].total;
  const totalPengembalian = jadwal.reduce((acc, r) => acc + r.total, 0);
  const bungaTotal = jadwal.reduce((acc, r) => acc + r.bunga, 0);
  const biayaAdminCicilanTotal = jadwal.reduce(
    (acc, r) => acc + r.biayaAdminCicilan,
    0,
  );
  const biayaAdminCicilanPerBulan = jadwal[0].biayaAdminCicilan;
  // Seluruh biaya peminjam = potongan di muka + bunga + biaya admin cicilan.
  const totalKeuntunganBersih =
    potonganDiMuka + bungaTotal + biayaAdminCicilanTotal;
  // Satu desimal (48.0 bukan 48) — mengikuti output formula referensi.
  const persentaseProfitTotal =
    Math.round((totalKeuntunganBersih / pokok) * 1000) / 10;

  return {
    pokok,
    dp,
    pokokDibiayai,
    tenorBulan,
    tarif,
    persenBungaPerBulan: persen,
    metodeBunga: metode,
    biayaAdminTotal,
    biayaPlatformTotal,
    biayaLayananTotal,
    potonganDiMuka,
    danaDiterima,
    biayaLayananPerBulan: 0,
    biayaAdminPerBulan: 0,
    biayaPlatformPerBulan: 0,
    bungaPerBulan,
    cicilanPerBulan,
    cicilanTerakhir,
    bungaTotal,
    totalPengembalian,
    biayaAdminCicilanTotal,
    biayaAdminCicilanPerBulan,
    totalKeuntunganBersih,
    persentaseProfitTotal,
    jadwal,
  };
}
