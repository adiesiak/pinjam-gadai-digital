/**
 * Profil risiko NASABAH — penilaian deterministik dari riwayat pinjaman.
 *
 * Sengaja PURE dan tanpa database: pemanggil (server) menyediakan ringkasan
 * riwayat, lalu fungsi ini mengubahnya menjadi kategori + skor yang bisa
 * dijelaskan. Alasannya: keputusan kredit tidak boleh bergantung pada kotak
 * hitam yang tidak dapat diaudit. Setiap angka di sini punya sebab yang
 * tertulis di `faktor`, dan skor HANYA alat bantu tampilan — TIDAK ada
 * keputusan pinjaman yang diambil otomatis dari sini.
 *
 * Menggantikan/melengkapi penilaian yang selama ini tersirat dari riwayat
 * pembayaran: pelunasan tepat waktu menaikkan skor, penolakan dan
 * keterlambatan menurunkannya.
 */

/** Riwayat minimal yang dibutuhkan untuk menilai satu nasabah. */
export type ButirRisiko = {
  status: string;
  /** Hari terlambat saat ini (0 = tidak terlambat); dihitung pemanggil. */
  hariTerlambat?: number;
  /** Pelunasan tepat waktu (bukan hanya lunas). */
  tepatWaktu?: boolean;
};

export type KategoriRisiko = "BARU" | "RENDAH" | "SEDANG" | "TINGGI";

export type ProfilRisiko = {
  kategori: KategoriRisiko;
  /** 0–100; makin tinggi makin baik. */
  skor: number;
  faktor: string[];
  jumlah: {
    total: number;
    lunas: number;
    aktif: number;
    ditolak: number;
    terlambat: number;
    tepatWaktu: number;
  };
};

/** Batas skor kategori — satu tempat agar UI dan tes tidak berbeda. */
export const AMBANG_RISIKO = { rendah: 75, sedang: 45 } as const;

/**
 * Hitung profil risiko dari riwayat pinjaman.
 * Skor mulai netral 50, lalu disesuaikan — tiap faktor dibatasi (cap) supaya
 * satu riwayat ekstrem tidak menenggelamkan sinyal lain.
 */
export function profilRisiko(butir: readonly ButirRisiko[]): ProfilRisiko {
  let lunas = 0;
  let aktif = 0;
  let ditolak = 0;
  let terlambat = 0;
  let tepatWaktu = 0;
  for (const b of butir) {
    if (b.status === "lunas") lunas += 1;
    if (b.status === "didanai") aktif += 1;
    if (b.status === "ditolak") ditolak += 1;
    if ((b.hariTerlambat ?? 0) > 0) terlambat += 1;
    if (b.tepatWaktu === true) tepatWaktu += 1;
  }
  const total = butir.length;

  const faktor: string[] = [];
  let skor = 50;

  if (total === 0) {
    return {
      kategori: "BARU",
      skor,
      faktor: ["Belum ada riwayat pinjaman — belum dapat dinilai."],
      jumlah: { total, lunas, aktif, ditolak, terlambat, tepatWaktu },
    };
  }

  if (lunas > 0) {
    const naik = Math.min(40, lunas * 15);
    skor += naik;
    faktor.push(`${lunas} pinjaman lunas (+${naik})`);
  }
  if (tepatWaktu > 0) {
    const naik = Math.min(25, tepatWaktu * 10);
    skor += naik;
    faktor.push(`${tepatWaktu} pelunasan tepat waktu (+${naik})`);
  }
  if (terlambat > 0) {
    const turun = Math.min(40, terlambat * 20);
    skor -= turun;
    faktor.push(`${terlambat} pinjaman aktif melewati tanggal acuan (−${turun})`);
  }
  if (ditolak > 0) {
    const turun = Math.min(30, ditolak * 15);
    skor -= turun;
    faktor.push(`${ditolak} pengajuan ditolak (−${turun})`);
  }
  if (aktif > 0 && terlambat === 0) {
    faktor.push(`${aktif} pinjaman berjalan tanpa keterlambatan`);
  }

  skor = Math.max(0, Math.min(100, Math.round(skor)));
  const kategori: KategoriRisiko =
    skor >= AMBANG_RISIKO.rendah ? "RENDAH" : skor >= AMBANG_RISIKO.sedang ? "SEDANG" : "TINGGI";

  return {
    kategori,
    skor,
    faktor,
    jumlah: { total, lunas, aktif, ditolak, terlambat, tepatWaktu },
  };
}
