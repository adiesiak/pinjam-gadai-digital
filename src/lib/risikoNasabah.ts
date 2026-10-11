/**
 * Profil risiko NASABAH — penilaian deterministik dari riwayat pinjaman.
 *
 * Sengaja PURE dan tanpa database: pemanggil (server) menyediakan ringkasan
 * riwayat + konteks identitas, lalu fungsi ini mengubahnya menjadi komponen
 * berbobot, skor 0–100, dan GRADE A–E yang bisa dijelaskan. Alasannya:
 * keputusan kredit tidak boleh bergantung pada kotak hitam yang tidak dapat
 * diaudit. Setiap angka di sini punya sebab yang tertulis di `faktor`, dan
 * skor HANYA alat bantu tampilan — TIDAK ada keputusan pinjaman yang diambil
 * otomatis dari sini.
 *
 * MODEL BOBOT (total 100) — vektor tetap 25/25/15/10/10/5/10 sesuai
 * spesifikasi produk, masing-masing dipetakan ke satu sinyal yang benar-benar
 * tersedia di catatan PINDAI:
 *
 *   25  Riwayat pelunasan tepat waktu   (tepat waktu / lunas)
 *   25  Keterlambatan & tunggakan       (1 − terlambat / basis)
 *   15  Riwayat keputusan pengajuan     (1 − ditolak / total)
 *   10  Kelengkapan data diri           (profil tersimpan lengkap)
 *   10  Verifikasi identitas (KYC)      (master kycProfil VERIFIED)
 *    5  Keaktifan riwayat               (jumlah pelunasan, sampai cap 3)
 *   10  Beban kewajiban berjalan        (1 − pinjaman berjalan / basis)
 *
 * Tiap komponen memberi `nilai` 0–1 dan `kontribusi` = nilai × bobot, supaya
 * peninjau bisa menjumlahkan sendiri dan melihat dari mana skor berasal.
 * Komponen yang datanya TIDAK dikirim pemanggil dianggap netral (0,5) — skor
 * tidak pernah menjatuhkan nasabah hanya karena sinyal tidak tersedia.
 *
 * GRADE A–E (A = paling baik). Ambangnya sengaja selaras dengan
 * `AMBANG_RISIKO` lama supaya kategori UI tidak berubah arti:
 *   A ≥ 85 · B 75–84 · C 45–74 · D 25–44 · E < 25
 *   RENDAH = A|B (≥75) · SEDANG = C (45–74) · TINGGI = D|E (<45)
 */

/** Riwayat minimal yang dibutuhkan untuk menilai satu nasabah. */
export type ButirRisiko = {
  status: string;
  /** Hari terlambat saat ini (0 = tidak terlambat); dihitung pemanggil. */
  hariTerlambat?: number;
  /** Pelunasan tepat waktu (bukan hanya lunas). */
  tepatWaktu?: boolean;
};

/**
 * Sinyal di luar riwayat pinjaman. Semuanya OPSIONAL: `undefined` berarti
 * "tidak diketahui" dan diperlakukan netral, bukan sebagai nilai buruk.
 */
export type KonteksRisiko = {
  /** Data diri (KTP, alamat, pekerjaan, rekening) sudah tersimpan. */
  dataDiriLengkap?: boolean;
  /** Master `kycProfil` berstatus VERIFIED. */
  kycTerverifikasi?: boolean;
};

export type KategoriRisiko = "BARU" | "RENDAH" | "SEDANG" | "TINGGI";

/** Grade risiko A–E; A paling baik. Dipakai untuk tampilan & override admin. */
export type GradeRisiko = "A" | "B" | "C" | "D" | "E";

export const GRADE_RISIKO = ["A", "B", "C", "D", "E"] as const;

export const LABEL_GRADE_RISIKO: Record<GradeRisiko, string> = {
  A: "A — Sangat rendah",
  B: "B — Rendah",
  C: "C — Sedang",
  D: "D — Tinggi",
  E: "E — Sangat tinggi",
};

/** Satu komponen penilaian — selalu bisa dijumlah ulang oleh peninjau. */
export type KomponenRisiko = {
  kunci: keyof typeof BOBOT_RISIKO;
  label: string;
  bobot: number;
  /** 0–1; 1 = paling baik. */
  nilai: number;
  /** nilai × bobot, sudah dibulatkan 1 desimal. */
  kontribusi: number;
  catatan: string;
};

export type ProfilRisiko = {
  kategori: KategoriRisiko;
  grade: GradeRisiko;
  /** false bila belum ada riwayat sama sekali (skor netral, bukan penilaian). */
  dinilai: boolean;
  /** 0–100; makin tinggi makin baik. */
  skor: number;
  faktor: string[];
  komponen: KomponenRisiko[];
  jumlah: {
    total: number;
    lunas: number;
    aktif: number;
    ditolak: number;
    terlambat: number;
    tepatWaktu: number;
  };
};

/** Bobot tetap 25/25/15/10/10/5/10 — jumlahnya 100 (dijaga oleh tes). */
export const BOBOT_RISIKO = {
  pelunasanTepatWaktu: 25,
  keterlambatan: 25,
  riwayatKeputusan: 15,
  kelengkapanDataDiri: 10,
  verifikasiIdentitas: 10,
  keaktifanRiwayat: 5,
  bebanKewajiban: 10,
} as const;

/** Batas skor kategori — satu tempat agar UI dan tes tidak berbeda. */
export const AMBANG_RISIKO = { rendah: 75, sedang: 45 } as const;

/** Ambang grade, dari terbaik ke terburuk — urutan diperiksa apa adanya. */
export const AMBANG_GRADE: readonly { grade: GradeRisiko; minimum: number }[] = [
  { grade: "A", minimum: 85 },
  { grade: "B", minimum: 75 },
  { grade: "C", minimum: 45 },
  { grade: "D", minimum: 25 },
  { grade: "E", minimum: 0 },
];

/** Grade dari skor 0–100 (A = paling baik). Deterministik, tanpa toleransi. */
export function gradeRisiko(skor: number): GradeRisiko {
  const aman = Number.isFinite(skor) ? Math.max(0, Math.min(100, skor)) : 0;
  for (const { grade, minimum } of AMBANG_GRADE) {
    if (aman >= minimum) return grade;
  }
  return "E";
}

/** Kategori dari grade — kata-kata UI lama tetap berlaku. */
export function kategoriDariGrade(grade: GradeRisiko): KategoriRisiko {
  if (grade === "A" || grade === "B") return "RENDAH";
  if (grade === "C") return "SEDANG";
  return "TINGGI";
}

const LABEL_KOMPONEN: Record<keyof typeof BOBOT_RISIKO, string> = {
  pelunasanTepatWaktu: "Riwayat pelunasan tepat waktu",
  keterlambatan: "Keterlambatan & tunggakan",
  riwayatKeputusan: "Riwayat keputusan pengajuan",
  kelengkapanDataDiri: "Kelengkapan data diri",
  verifikasiIdentitas: "Verifikasi identitas (KYC)",
  keaktifanRiwayat: "Keaktifan riwayat pelunasan",
  bebanKewajiban: "Beban kewajiban berjalan",
};

function jepit01(nilai: number): number {
  if (!Number.isFinite(nilai)) return 0.5;
  return Math.min(1, Math.max(0, nilai));
}

function komponen(
  kunci: keyof typeof BOBOT_RISIKO,
  nilai: number,
  catatan: string,
): KomponenRisiko {
  const aman = jepit01(nilai);
  const bobot = BOBOT_RISIKO[kunci];
  return {
    kunci,
    label: LABEL_KOMPONEN[kunci],
    bobot,
    nilai: Math.round(aman * 100) / 100,
    kontribusi: Math.round(aman * bobot * 10) / 10,
    catatan,
  };
}

/**
 * Hitung profil risiko dari riwayat pinjaman (+ konteks identitas bila ada).
 * Skor = jumlah kontribusi komponen, dibulatkan, dijepit 0–100. Karena semua
 * bobot positif dan totalnya 100, skor tidak pernah keluar rentang itu.
 */
export function profilRisiko(
  butir: readonly ButirRisiko[],
  konteks: KonteksRisiko = {},
): ProfilRisiko {
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
  const jumlah = { total, lunas, aktif, ditolak, terlambat, tepatWaktu };

  if (total === 0) {
    // Tanpa riwayat: skor netral 50, TIDAK diberi grade penilaian. Nasabah
    // baru tidak boleh dihukum karena memang belum punya catatan.
    return {
      kategori: "BARU",
      grade: gradeRisiko(50),
      dinilai: false,
      skor: 50,
      faktor: ["Belum ada riwayat pinjaman — belum dapat dinilai."],
      komponen: [],
      jumlah,
    };
  }

  const basis = lunas + aktif;
  const komponenList: KomponenRisiko[] = [];

  komponenList.push(
    komponen(
      "pelunasanTepatWaktu",
      lunas === 0 ? 0.5 : tepatWaktu / lunas,
      lunas === 0
        ? "Belum ada pelunasan — sinyal netral."
        : `${tepatWaktu} dari ${lunas} pelunasan tepat waktu.`,
    ),
  );

  komponenList.push(
    komponen(
      "keterlambatan",
      basis === 0 ? 0.5 : 1 - terlambat / basis,
      basis === 0
        ? "Belum ada pinjaman berjalan/lunas — sinyal netral."
        : `${terlambat} dari ${basis} pinjaman melewati tanggal acuan.`,
    ),
  );

  komponenList.push(
    komponen(
      "riwayatKeputusan",
      1 - ditolak / total,
      ditolak === 0
        ? "Tidak ada pengajuan ditolak pada catatan PINDAI."
        : `${ditolak} dari ${total} pengajuan ditolak.`,
    ),
  );

  komponenList.push(
    komponen(
      "kelengkapanDataDiri",
      konteks.dataDiriLengkap === undefined ? 0.5 : konteks.dataDiriLengkap ? 1 : 0,
      konteks.dataDiriLengkap === undefined
        ? "Kelengkapan data diri tidak dikirim — sinyal netral."
        : konteks.dataDiriLengkap
          ? "Data diri tersimpan lengkap."
          : "Data diri belum lengkap.",
    ),
  );

  komponenList.push(
    komponen(
      "verifikasiIdentitas",
      konteks.kycTerverifikasi === undefined ? 0.5 : konteks.kycTerverifikasi ? 1 : 0,
      konteks.kycTerverifikasi === undefined
        ? "Status KYC tidak dikirim — sinyal netral."
        : konteks.kycTerverifikasi
          ? "KYC master berstatus VERIFIED."
          : "KYC master belum TERVERIFIKASI.",
    ),
  );

  komponenList.push(
    komponen(
      "keaktifanRiwayat",
      lunas === 0 ? 0.5 : Math.min(1, lunas / 3),
      lunas === 0
        ? "Belum ada pelunasan sebagai bukti — sinyal netral."
        : `${lunas} pelunasan tercatat (penuh pada 3).`,
    ),
  );

  komponenList.push(
    komponen(
      "bebanKewajiban",
      basis === 0 ? 0.5 : 1 - Math.min(1, aktif / Math.max(3, basis)),
      basis === 0
        ? "Tidak ada kewajiban berjalan — sinyal netral."
        : `${aktif} pinjaman berjalan dari ${basis} catatan.`,
    ),
  );

  const skorMentah = komponenList.reduce((akumulasi, k) => akumulasi + k.kontribusi, 0);
  const skor = Math.max(0, Math.min(100, Math.round(skorMentah)));
  const grade = gradeRisiko(skor);
  const kategori = kategoriDariGrade(grade);

  const faktor: string[] = komponenList.map(
    (k) => `${k.label} ${Math.round(k.nilai * 100)}% × ${k.bobot} = ${k.kontribusi} — ${k.catatan}`,
  );
  if (aktif > 0 && terlambat === 0) {
    faktor.push(`${aktif} pinjaman berjalan tanpa keterlambatan.`);
  }

  return { kategori, grade, dinilai: true, skor, faktor, komponen: komponenList, jumlah };
}

// =====================================================================
// OVERRIDE RISIKO — keputusan admin, selalu beralasan & berjejak
// =====================================================================

export type HasilValidasiRisiko = { ok: true } | { ok: false; alasan: string };

/** Alasan override minimum — keputusan kredit wajib bisa ditinjau ulang. */
export const PANJANG_MIN_ALASAN_OVERRIDE = 20;
export const PANJANG_MAKS_ALASAN_OVERRIDE = 600;

/**
 * Validasi permintaan override grade. Skor TIDAK bisa ditimpa angka bebas —
 * hanya grade yang boleh dipilih petugas, dan alasannya wajib.
 */
export function validasiOverrideRisiko(grade: string, alasan: string): HasilValidasiRisiko {
  if (!(GRADE_RISIKO as readonly string[]).includes(grade)) {
    return {
      ok: false,
      alasan: `Grade "${grade}" tidak dikenali. Pilih salah satu: ${GRADE_RISIKO.join(", ")}.`,
    };
  }
  const bersih = alasan.trim();
  if (bersih.length < PANJANG_MIN_ALASAN_OVERRIDE) {
    return {
      ok: false,
      alasan: `Alasan override minimal ${PANJANG_MIN_ALASAN_OVERRIDE} karakter agar keputusan dapat ditinjau.`,
    };
  }
  if (bersih.length > PANJANG_MAKS_ALASAN_OVERRIDE) {
    return {
      ok: false,
      alasan: `Alasan override maksimal ${PANJANG_MAKS_ALASAN_OVERRIDE} karakter.`,
    };
  }
  return { ok: true };
}

/** Override terakhir yang berlaku (bentuk siap tampil). */
export type OverrideRisikoAktif = {
  gradeOverride: GradeRisiko;
  alasan: string;
  olehLabel: string;
  dibuatPada: number;
};

export type RingkasRisiko = {
  gradeSistem: GradeRisiko;
  gradeEfektif: GradeRisiko;
  ditimpa: boolean;
  override: OverrideRisikoAktif | null;
};

/**
 * Gabungkan grade hasil sistem dengan override admin. Override TERAKHIR yang
 * menang; sistem tetap menghitung grade-nya sendiri supaya selisih keputusan
 * selalu terlihat (dan tercatat di audit trail).
 */
export function ringkasRisiko(
  gradeSistem: GradeRisiko,
  override: OverrideRisikoAktif | null,
): RingkasRisiko {
  if (override === null) {
    return { gradeSistem, gradeEfektif: gradeSistem, ditimpa: false, override: null };
  }
  return {
    gradeSistem,
    gradeEfektif: override.gradeOverride,
    ditimpa: override.gradeOverride !== gradeSistem,
    override,
  };
}
