/**
 * Indeks kepercayaan peminjam — sinyal internal PINDAI untuk peninjau.
 *
 * PENTING (jujur sejak awal, juga ditulis di UI): angka ini BUKAN skor kredit
 * dan bukan hasil pengecekan lembaga penilai/BI. Ia hanya ringkasan tertutup
 * dari catatan yang sudah ada di aplikasi ini — riwayat pinjaman tunai peminjam
 * (lunas tepat waktu, terlambat, menunggak), kelengkapan data diri tersimpan,
 * dan terbitnya kode pseudonim peminjam. Tidak ada data pihak ketiga.
 *
 * Karena itu ia dipakai sebagai PETUNJUK, bukan izin otomatis: keputusan
 * pemberian dana tetap milik admin/penyedia dana. Skor selalu disertai daftar
 * `alasan` supaya peninjau bisa memeriksa dasar angkanya, dan tidak pernah
 * mengklaim jaminan apa pun.
 *
 * Perhitungan di sini murni dan deterministik (tanpa jam perangkat): waktu
 * "sekarang" selalu dikirim pemanggil, sehingga hasilnya bisa diuji.
 */
import { DEFAULT_TENOR_HARI } from "./loan";

const DAY_MS = 86_400_000;

export type TingkatKepercayaan = "baru" | "berkembang" | "kuat" | "perlu_perhatian";

/** Riwayat satu peminjam — angka masukan yang sudah dihitung, bukan opini. */
export type RiwayatPeminjam = {
  /** Total pengajuan pinjaman tunai yang tercatat (semua status). */
  jumlahPinjaman: number;
  /** Pinjaman yang sudah lunas penuh. */
  jumlahLunas: number;
  /** Bagian dari `jumlahLunas` yang dibayar paling lambat saat jatuh tempo. */
  jumlahTepatWaktu: number;
  /** Bagian dari `jumlahLunas` yang dibayar setelah lewat jatuh tempo. */
  jumlahTerlambat: number;
  /** Pinjaman yang sudah didanai dan masih berjalan. */
  jumlahBerjalan: number;
  /** Bagian dari `jumlahBerjalan` yang sudah melewati jatuh tempo. */
  jumlahMenunggak: number;
  /** Pengajuan yang ditolak (riwayat keputusan, bukan pelanggaran). */
  jumlahDitolak: number;
  /** Data diri (KTP, alamat, pekerjaan, rekening) sudah tersimpan di PINDAI. */
  dataDiriLengkap: boolean;
  /** Kode pseudonim peminjam sudah terbit (satu identitas stabil antar-ruang). */
  punyaKodePeminjam: boolean;
};

/** Ringkasan siap tampil — label, skor, dan dasar penilaiannya. */
export type RingkasKepercayaan = {
  /** 0–100. Bukan skor kredit; lihat catatan modul. */
  skor: number;
  tingkat: TingkatKepercayaan;
  label: string;
  /** Angka pendukung satu baris, mis. "2 tepat waktu · 0 terlambat". */
  ringkas: string;
  /** Dasar penilaian, ditampilkan kepada peninjau. */
  alasan: string[];
};

/** Bobot penilaian — eksplisit supaya mudah diaudit dan diuji. */
export const BOBOT_KEPERCAYAAN = {
  dasar: 55,
  tepatWaktu: 14,
  maksTepatWaktu: 42,
  dataDiri: 6,
  kodePeminjam: 4,
  terlambat: -18,
  maksTerlambat: -36,
  menunggak: -25,
  ditolak: -12,
  maksDitolak: -24,
} as const;

/** Ambang skor untuk tingkat "perlu perhatian" walau tanpa keterlambatan. */
export const SKOR_PERLU_PERHATIAN = 45;

/** Ambang skor + jumlah pelunasan tepat waktu untuk tingkat "kuat". */
export const SKOR_KUAT = 78;
export const TEPAT_WAKTU_MINIMUM_KUAT = 2;

const LABEL_TINGKAT: Record<TingkatKepercayaan, string> = {
  baru: "Nasabah baru",
  berkembang: "Riwayat baik",
  kuat: "Terpercaya",
  perlu_perhatian: "Perlu perhatian",
};

/** Satu pinjaman mentah — bentuk minimal yang dibutuhkan riwayat. */
export type PinjamanRiwayat = {
  status: string;
  didanaiPada?: number | null;
  lunasPada?: number | null;
  tenorHari?: number | null;
  tenorBulan?: number | null;
};

/**
 * Batas akhir pelunasan satu pinjaman, atau null bila belum didanai/data tenor
 * tidak masuk akal. Aturannya sama dengan lib/loan & lib/plafon: skema bulanan
 * dihitung 30 hari per bulan.
 */
export function jatuhTempoPinjaman(pinjaman: PinjamanRiwayat): number | null {
  const didanai = pinjaman.didanaiPada ?? null;
  if (didanai === null || !Number.isSafeInteger(didanai) || didanai <= 0) return null;
  const tenorHari =
    pinjaman.tenorBulan !== null && pinjaman.tenorBulan !== undefined
      ? pinjaman.tenorBulan * 30
      : (pinjaman.tenorHari ?? DEFAULT_TENOR_HARI);
  if (!Number.isSafeInteger(tenorHari) || tenorHari <= 0) return null;
  return didanai + tenorHari * DAY_MS;
}

/** Status "ditinjau" dalam semua ejaan warisannya (diajukan/sedang_direview/disetujui). */
const STATUS_DITINJAU = new Set(["diajukan", "sedang_direview", "disetujui", "ditinjau"]);

/**
 * Susun riwayat seorang peminjam dari daftar pinjamannya.
 *
 * `daftar` berisi pinjaman yang sudah dibaca pemanggil (di ruang penyedia dana:
 * maksimal `BATAS_BARIS` pinjaman terbaru), jadi riwayat ini adalah ringkasan
 * atas catatan yang benar-benar tersedia di halaman itu — bukan klaim total
 * sepanjang masa.
 */
export function riwayatDariPinjaman(
  daftar: readonly PinjamanRiwayat[],
  opsi: { sekarang: number; dataDiriLengkap: boolean; punyaKodePeminjam: boolean },
): RiwayatPeminjam {
  let jumlahLunas = 0;
  let jumlahTepatWaktu = 0;
  let jumlahTerlambat = 0;
  let jumlahBerjalan = 0;
  let jumlahMenunggak = 0;
  let jumlahDitolak = 0;

  for (const pinjaman of daftar) {
    if (pinjaman.status === "lunas") {
      jumlahLunas += 1;
      const jatuhTempo = jatuhTempoPinjaman(pinjaman);
      const lunasPada = pinjaman.lunasPada ?? null;
      if (jatuhTempo === null || lunasPada === null || !Number.isSafeInteger(lunasPada)) {
        // Tanpa tanggal jatuh tempo yang sah, pelunasan TIDAK dihitung sebagai
        // tepat waktu — bukan pula dihitung terlambat, karena buktinya tidak ada.
        continue;
      }
      if (lunasPada <= jatuhTempo) jumlahTepatWaktu += 1;
      else jumlahTerlambat += 1;
    } else if (pinjaman.status === "didanai") {
      jumlahBerjalan += 1;
      const jatuhTempo = jatuhTempoPinjaman(pinjaman);
      if (jatuhTempo !== null && opsi.sekarang > jatuhTempo) jumlahMenunggak += 1;
    } else if (pinjaman.status === "ditolak") {
      jumlahDitolak += 1;
    } else if (!STATUS_DITINJAU.has(pinjaman.status)) {
      // Ejaan status tak dikenal diperlakukan sebagai masih ditinjau; tidak
      // menambah maupun mengurangi penilaian (fail-safe untuk data warisan).
      continue;
    }
  }

  return {
    jumlahPinjaman: daftar.length,
    jumlahLunas,
    jumlahTepatWaktu,
    jumlahTerlambat,
    jumlahBerjalan,
    jumlahMenunggak,
    jumlahDitolak,
    dataDiriLengkap: opsi.dataDiriLengkap,
    punyaKodePeminjam: opsi.punyaKodePeminjam,
  };
}

function jepit(nilai: number, min: number, maks: number): number {
  return Math.min(maks, Math.max(min, nilai));
}

/** Skor 0–100 dari riwayat — penjumlahan berbobot di atas, tanpa kejutan. */
export function skorKepercayaan(r: RiwayatPeminjam): number {
  const b = BOBOT_KEPERCAYAAN;
  let skor = b.dasar;
  skor += Math.min(b.maksTepatWaktu, r.jumlahTepatWaktu * b.tepatWaktu);
  // Penalti memakai `Math.max` karena nilainya negatif: yang dijepit adalah
  // BESAR penalti (jangan sampai lebih berat dari batas), bukan angkanya.
  // `Math.min` di sini akan langsung menarik skor ke batas penalti penuh.
  skor += Math.max(b.maksTerlambat, r.jumlahTerlambat * b.terlambat);
  skor += Math.max(b.maksDitolak, r.jumlahDitolak * b.ditolak);
  if (r.jumlahMenunggak > 0) skor += b.menunggak * Math.min(r.jumlahMenunggak, 2);
  if (r.dataDiriLengkap) skor += b.dataDiri;
  if (r.punyaKodePeminjam) skor += b.kodePeminjam;
  return jepit(Math.round(skor), 0, 100);
}

/** Tingkat kepercayaan — urutan pemeriksaan ini yang menentukan labelnya. */
export function tingkatKepercayaan(r: RiwayatPeminjam, skor: number): TingkatKepercayaan {
  if (r.jumlahMenunggak > 0 || skor < SKOR_PERLU_PERHATIAN) return "perlu_perhatian";
  if (r.jumlahLunas === 0) return "baru";
  if (skor >= SKOR_KUAT && r.jumlahTepatWaktu >= TEPAT_WAKTU_MINIMUM_KUAT) return "kuat";
  return "berkembang";
}

/** Susun alasan penilaian — selalu bisa dibaca peninjau, tanpa istilah kredit. */
export function alasanKepercayaan(r: RiwayatPeminjam): string[] {
  const alasan: string[] = [];
  if (r.jumlahTepatWaktu > 0) {
    alasan.push(`${r.jumlahTepatWaktu} pinjaman lunas tepat waktu`);
  }
  if (r.jumlahTerlambat > 0) {
    alasan.push(`${r.jumlahTerlambat} pelunasan melewati jatuh tempo`);
  }
  if (r.jumlahMenunggak > 0) {
    alasan.push(`${r.jumlahMenunggak} pinjaman berjalan sudah lewat jatuh tempo`);
  }
  if (r.jumlahLunas === 0 && r.jumlahBerjalan === 0) {
    alasan.push("Belum ada pinjaman yang berjalan atau lunas");
  }
  if (r.jumlahBerjalan > 0 && r.jumlahMenunggak === 0) {
    alasan.push(`${r.jumlahBerjalan} pinjaman berjalan, belum ada keterlambatan`);
  }
  if (r.jumlahDitolak > 0) {
    alasan.push(`${r.jumlahDitolak} pengajuan ditolak pada catatan PINDAI`);
  }
  alasan.push(r.dataDiriLengkap ? "Data diri tersimpan lengkap" : "Data diri belum lengkap");
  if (!r.punyaKodePeminjam) alasan.push("Kode peminjam belum terbit");
  return alasan;
}

/** Ringkasan angka pendukung satu baris. */
export function ringkasKepercayaan(r: RiwayatPeminjam): string {
  const bagian = [
    `${r.jumlahTepatWaktu} tepat waktu`,
    `${r.jumlahTerlambat} terlambat`,
  ];
  if (r.jumlahBerjalan > 0) bagian.push(`${r.jumlahBerjalan} berjalan`);
  if (r.jumlahPinjaman === 0) return "belum ada riwayat pinjaman";
  return bagian.join(" · ");
}

/** Hitung segalanya sekaligus — fungsi utama yang dipakai server dan UI. */
export function hitungKepercayaan(r: RiwayatPeminjam): RingkasKepercayaan {
  const skor = skorKepercayaan(r);
  const tingkat = tingkatKepercayaan(r, skor);
  return {
    skor,
    tingkat,
    label: LABEL_TINGKAT[tingkat],
    ringkas: ringkasKepercayaan(r),
    alasan: alasanKepercayaan(r),
  };
}
