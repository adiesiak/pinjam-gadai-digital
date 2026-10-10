/**
 * MESIN KEPUTUSAN OTOMATIS KYC — logika MURNI (tanpa React/Convex/DOM) supaya
 * bisa diuji sebagai skrip biasa: `bun src/lib/kycAutoApproval.test.ts`.
 *
 * Kenapa berkas ini ada: status KYC `VERIFIED` saat ini hanya bisa diberikan
 * petugas. Untuk mempercepat pemeriksaan yang memang bisa diperiksa mesin,
 * modul ini menjalankan SATU daftar pemeriksaan terstruktur atas data yang
 * SUDAH ada (isian, hasil pemeriksaan berkas server, hasil OCR, bukti OTP) lalu
 * memutuskan apakah KYC boleh naik status tanpa menunggu petugas.
 *
 * BATAS YANG TEGAS — ini yang membuat mesin ini jujur:
 * - Validasi format NIK hanya memeriksa BENTUK 16 angka; ia BUKAN bukti NIK
 *   resmi dan TIDAK dicek ke Dukcapil.
 * - OCR hanya MEMBACA teks dari gambar; ia BUKAN bukti keaslian KTP.
 * - Keberadaan berkas KTP (walau isinya sudah diperiksa server) BUKAN bukti
 *   bahwa KTP-nya asli.
 * - OTP WhatsApp hanya membuktikan kontrol atas nomor itu — bukan bahwa nomor
 *   itu milik orang yang namanya ada di KTP.
 * Karena itu `VERIFIED` di sini berarti "seluruh persyaratan yang DAPAT
 * diverifikasi sistem sudah terpenuhi", bukan "identitas pasti sah". Statusnya
 * sama dengan `VERIFIED` yang diberikan petugas, dan tetap hanya berarti
 * proses KYC berhasil — BUKAN persetujuan pinjaman, pendanaan, atau pencairan.
 *
 * Tiga hasil keputusan (memakai status yang sudah ada di `lib/kycStatus.ts`):
 * - `VERIFIED`          — semua pemeriksaan WAJIB `lulus`.
 * - `NEEDS_CORRECTION`  — ada pemeriksaan WAJIB yang `gagal` (bisa diperbaiki
 *                         nasabah: lengkapi data, unggah ulang berkas, verifikasi
 *                         WhatsApp, perbaiki ketidaksesuaian).
 * - `PENDING_REVIEW`    — tidak ada yang gagal, tetapi ada yang `tidak_pasti`
 *                         (mis. OCR belum ada / keyakinan rendah): tidak boleh
 *                         dipastikan mesin, jadi diserahkan ke petugas.
 *
 * Pemeriksaan yang `gagal` sengaja DIDAHULUKAN atas yang `tidak_pasti`: bila ada
 * yang jelas harus diperbaiki, nasabah diberi tahu hal itu lebih dulu daripada
 * menunggu peninjauan yang mungkin berujung permintaan perbaikan yang sama.
 *
 * Yang boleh DITERAPKAN sendiri oleh mesin hanya `VERIFIED` — lihat
 * `bolehTerapkanOtomatis()`. Dua hasil lainnya tetap dicatat lengkap sebagai
 * bahan peninjauan, tetapi status nasabah dibiarkan `PENDING_REVIEW` supaya
 * petugas yang memutuskan.
 */

import { DIMENSI_MIN, RASIO_MAKS, periksaUkuranGambar, type DimensiGambar } from "./kyc";
import {
  AMBANG_KEYAKINAN_TINGGI,
  bandingkanKtpDenganForm,
  CATATAN_NIK,
  periksaFormatNik,
  nilaiHasilOcr,
  type DataKtp,
} from "./kycOcr";
import { kekuranganKyc, type IsianKycRingkas, type StatusKyc } from "./kycStatus";

/**
 * VERSI ATURAN KEPUTUSAN OTOMATIS — dicatat pada setiap keputusan supaya
 * pertanyaan "atas dasar aturan apa status ini berubah sendiri" bisa dijawab.
 *
 * Dipisah dari `VERSI_ATURAN_KYC` (aturan verifikasi berkas/isian) karena
 * keduanya bisa berubah sendiri-sendiri: ambang OCR atau daftar pemeriksaan
 * otomatis bisa berubah tanpa aturan unggah berkas berubah.
 *
 * Riwayat:
 * - `kyc-otomatis-2026-10` — versi pertama. Pemeriksaan: data identitas lengkap,
 *   format NIK, KTP terbaca, dokumen lolos validasi teknis, OCR tersedia &
 *   memenuhi ambang, OCR konsisten, WhatsApp terverifikasi, tanpa
 *   ketidaksesuaian material, dan tidak ada pemeriksaan wajib yang gagal/sisa.
 */
export const VERSI_ATURAN_AUTO_KYC = "kyc-otomatis-2026-10";

/** Ambang keyakinan OCR yang dituntut keputusan otomatis (dari `lib/kycOcr.ts`). */
export const AMBANG_KEYAKINAN_OCR_OTOMATIS = AMBANG_KEYAKINAN_TINGGI;

/** Hasil satu pemeriksaan. */
export type StatusPemeriksaan = "lulus" | "gagal" | "tidak_pasti";

/**
 * Dari mana fakta sebuah pemeriksaan berasal.
 * - `server` — dihitung server dari data yang benar-benar tersimpan.
 * - `klien`  — berasal dari perangkat nasabah (hasil OCR). OCR berjalan lokal,
 *   jadi hasilnya masuk kategori ini: dipakai, tetapi tidak boleh diperlakukan
 *   sebagai bukti sekuat fakta server.
 */
export type SumberPemeriksaan = "server" | "klien";

/** Id setiap pemeriksaan wajib — stabil & dicatat di riwayat keputusan. */
export type IdRuleKyc =
  | "data_identitas_lengkap"
  | "format_nik_valid"
  | "ktp_terbaca"
  | "dokumen_validasi_teknis"
  | "ocr_tersedia_threshold"
  | "ocr_konsisten"
  | "nomor_wa_terverifikasi"
  | "tanpa_ketidaksesuaian_material"
  | "pemeriksaan_wajib_selesai";

/** Hasil satu pemeriksaan beserta alasannya — apa adanya, tanpa menyembunyikan. */
export type HasilRuleKyc = {
  id: IdRuleKyc;
  judul: string;
  status: StatusPemeriksaan;
  sumber: SumberPemeriksaan;
  /** Kalimat siap tampil yang menjelaskan mengapa status ini. */
  pesan: string;
  /** Rincian terstruktur (mis. daftar isian yang kurang / field tidak cocok). */
  detail: string[];
};

/** Bukti teknis satu berkas menurut pemeriksaan SERVER (`berkasTerverifikasi`). */
export type TeknisBerkas = {
  /** Ada id berkas tersimpan di baris KYC. */
  ada: boolean;
  /** Isi berkas sudah diperiksa server (magic bytes) — bukan sekadar metadata. */
  terverifikasiServer: boolean;
  /** Dimensi dibaca server dari header berkas; null bila tidak tercatat. */
  lebar: number | null;
  tinggi: number | null;
};

/** Snapshot OCR KTP dari perangkat nasabah (sumber: klien). */
export type OcrKtp = {
  /** Keyakinan mesin OCR 0–100. */
  konfidensi: number;
  nik: string | null;
  nama: string | null;
  alamat: string | null;
} | null;

/**
 * Isian KYC untuk mesin ini: `IsianKycRingkas` (dipakai `kekuranganKyc`) PLUS
 * `alamat`, karena perbandingan OCR↔isian juga menyangkut alamat. `alamat`
 * memang tidak termasuk isian yang menentukan kelengkapan, jadi ia tidak ada di
 * `IsianKycRingkas` — tetapi tetap dibutuhkan untuk pemeriksaan konsistensi.
 */
export type IsianKycAuto = IsianKycRingkas & { alamat?: string | null };

/** Seluruh fakta yang dibutuhkan mesin — tidak ada yang dikarang di dalamnya. */
export type MasukanKeputusanKyc = {
  /** Isian KYC (bentuk yang sama dipakai `kekuranganKyc`, plus alamat). */
  isian: IsianKycAuto;
  /** Persetujuan pemrosesan data sudah tercatat di server. */
  persetujuanAktif: boolean;
  /** Nomor WhatsApp sudah diverifikasi OTP dan masih cocok dengan nomor tersimpan. */
  nomorWaTerverifikasi: boolean;
  /** Bukti teknis per slot berkas (dari pemeriksaan server, bukan klaim klien). */
  teknis: { ktp: TeknisBerkas; selfie: TeknisBerkas; bukti: TeknisBerkas };
  /** Hasil OCR KTP yang disimpan (best-effort, dari klien), atau null. */
  ocr: OcrKtp;
};

/** Keputusan akhir mesin — lengkap dengan jejak pemeriksaannya. */
export type KeputusanKyc = {
  /** Status yang dituju mesin (subset status KYC yang sudah ada). */
  target: Extract<StatusKyc, "VERIFIED" | "PENDING_REVIEW" | "NEEDS_CORRECTION">;
  /** Kode alasan terstruktur (dipakai `ubahStatus`/riwayat). */
  alasan: string;
  /** Ringkasan manusiawi untuk nasabah & petugas. */
  ringkasan: string;
  versiAturan: string;
  /** Hasil SEMUA pemeriksaan, termasuk pemeriksaan agregat terakhir. */
  aturan: HasilRuleKyc[];
  /**
   * Sidik jari MASUKAN + versi + target — dipakai memastikan proses IDEMPOTEN:
   * pemeriksaan ulang atas data yang sama persis tidak menulis keputusan/jejak
   * baru. Sengaja TIDAK memuat data pribadi (hanya id pemeriksaan + status).
   */
  sidikJari: string;
};

/** Judul tiap pemeriksaan — satu tempat, dipakai mesin & tampilan. */
export const JUDUL_RULE_KYC: Record<IdRuleKyc, string> = {
  data_identitas_lengkap: "Data identitas lengkap & persetujuan tercatat",
  format_nik_valid: "Format NIK valid (bentuk 16 angka)",
  ktp_terbaca: "Foto KTP terbaca",
  dokumen_validasi_teknis: "Dokumen lolos validasi teknis",
  ocr_tersedia_threshold: "Hasil OCR tersedia & memenuhi ambang keyakinan",
  ocr_konsisten: "Data OCR konsisten dengan data yang diinput",
  nomor_wa_terverifikasi: "Nomor WhatsApp sudah terverifikasi",
  tanpa_ketidaksesuaian_material: "Tidak ada ketidaksesuaian material",
  pemeriksaan_wajib_selesai: "Tidak ada pemeriksaan wajib yang gagal / sisa",
};

/** Pemeriksaan WAJIB — semuanya harus `lulus` sebelum `VERIFIED`. */
export const RULE_WAJIB_KYC: readonly IdRuleKyc[] = [
  "data_identitas_lengkap",
  "format_nik_valid",
  "ktp_terbaca",
  "dokumen_validasi_teknis",
  "ocr_tersedia_threshold",
  "ocr_konsisten",
  "nomor_wa_terverifikasi",
  "tanpa_ketidaksesuaian_material",
];

const JUDUL = JUDUL_RULE_KYC;

function rule(
  id: IdRuleKyc,
  status: StatusPemeriksaan,
  sumber: SumberPemeriksaan,
  pesan: string,
  detail: string[] = [],
): HasilRuleKyc {
  return { id, judul: JUDUL[id], status, sumber, pesan, detail };
}

/** Dimensi dari bukti teknis, atau null bila tidak tercatat. */
function dimensi(t: TeknisBerkas): DimensiGambar | null {
  if (t.lebar === null || t.tinggi === null) return null;
  return { lebar: t.lebar, tinggi: t.tinggi };
}

/**
 * Susun `DataKtp` seperlunya dari snapshot OCR. Hanya field pembanding (nik,
 * nama, alamat) yang diisi; sisanya null karena memang tidak dibaca mesin untuk
 * keputusan ini.
 */
function dataKtpDariOcr(ocr: NonNullable<OcrKtp>): DataKtp {
  return {
    nik: ocr.nik,
    nama: ocr.nama,
    tempatLahir: null,
    tanggalLahir: null,
    jenisKelamin: null,
    alamat: ocr.alamat,
    rtRw: null,
    kelurahan: null,
    kecamatan: null,
    agama: null,
    statusPerkawinan: null,
    pekerjaan: null,
    kewarganegaraan: null,
    berlakuHingga: null,
  };
}

/* ==========================================================================
 * Pemeriksaan satu per satu
 * ========================================================================== */

/** 1. Semua isian wajib ada + persetujuan pemrosesan data tercatat. */
function periksaDataIdentitas(m: MasukanKeputusanKyc): HasilRuleKyc {
  const kurang = kekuranganKyc(m.isian);
  const detail = [...kurang];
  if (!m.persetujuanAktif) detail.push("Persetujuan pemrosesan data belum tercatat");
  if (detail.length === 0) {
    return rule("data_identitas_lengkap", "lulus", "server", "Seluruh isian wajib sudah lengkap.");
  }
  return rule(
    "data_identitas_lengkap",
    "gagal",
    "server",
    `Masih ada ${detail.length} hal yang belum lengkap: ${detail.join(", ")}.`,
    detail,
  );
}

/** 2. Format NIK — BENTUK saja (16 angka + komponen tanggal wajar). */
function periksaFormatNikRule(m: MasukanKeputusanKyc): HasilRuleKyc {
  const hasil = periksaFormatNik(m.isian.nik ?? null);
  if (!hasil.ada) {
    return rule("format_nik_valid", "gagal", "server", `NIK belum diisi. ${CATATAN_NIK}`, [
      "NIK kosong",
    ]);
  }
  if (hasil.ok) {
    return rule(
      "format_nik_valid",
      "lulus",
      "server",
      `NIK berbentuk 16 angka dengan komponen tanggal yang wajar. ${CATATAN_NIK}`,
    );
  }
  const detail: string[] = [];
  if (hasil.huruf) detail.push("NIK memuat karakter selain angka");
  if (!hasil.panjang16) detail.push("NIK bukan 16 angka");
  if (!hasil.tanggalWajar) detail.push("Komponen tanggal lahir pada NIK tidak wajar");
  return rule(
    "format_nik_valid",
    "gagal",
    "server",
    `Format NIK tidak valid: ${detail.join("; ")}. ${CATATAN_NIK}`,
    detail,
  );
}

/**
 * Periksa satu slot berkas: ada, diperiksa server, dan dimensinya masuk akal.
 * Mengembalikan daftar masalah "keras" (bisa diperbaiki) dan penanda apakah ada
 * bagian yang tidak bisa dipastikan (dimensi tidak tercatat).
 */
function periksaSlotBerkas(
  label: string,
  ada: boolean,
  teknis: TeknisBerkas,
): { keras: string[]; tidakPasti: string[] } {
  if (!ada) return { keras: [`${label} belum diunggah`], tidakPasti: [] };
  if (!teknis.terverifikasiServer) {
    return { keras: [`${label} belum lolos pemeriksaan server (isi berkas)`], tidakPasti: [] };
  }
  if (dimensi(teknis) === null) {
    return { keras: [], tidakPasti: [`Dimensi ${label} tidak tercatat untuk diperiksa`] };
  }
  const pesan = periksaUkuranGambar(label, dimensi(teknis));
  if (pesan !== null) return { keras: [pesan], tidakPasti: [] };
  return { keras: [], tidakPasti: [] };
}

/** 3. KTP terbaca (ada + diperiksa server + dimensi wajar). */
function periksaKtpTerbaca(m: MasukanKeputusanKyc): HasilRuleKyc {
  const ada = m.isian.ktpId !== null && m.isian.ktpId !== undefined;
  const { keras, tidakPasti } = periksaSlotBerkas("Foto KTP", ada, m.teknis.ktp);
  if (keras.length > 0) {
    return rule("ktp_terbaca", "gagal", "server", `Foto KTP belum bisa dipakai: ${keras.join("; ")}.`, keras);
  }
  if (tidakPasti.length > 0) {
    return rule("ktp_terbaca", "tidak_pasti", "server", tidakPasti.join("; ") + ".", tidakPasti);
  }
  return rule(
    "ktp_terbaca",
    "lulus",
    "server",
    `Foto KTP terbaca (minimal ${DIMENSI_MIN.lebar}×${DIMENSI_MIN.tinggi} piksel, rasio wajar). Ini penilaian keterbacaan, bukan keaslian.`,
  );
}

/** 4. Selfie + bukti penghasilan lolos validasi teknis. */
function periksaDokumenTeknis(m: MasukanKeputusanKyc): HasilRuleKyc {
  const slots: Array<[string, boolean, TeknisBerkas]> = [
    ["Selfie dengan KTP", m.isian.selfieKtpId !== null && m.isian.selfieKtpId !== undefined, m.teknis.selfie],
    [
      "Bukti penghasilan",
      m.isian.buktiPenghasilanId !== null && m.isian.buktiPenghasilanId !== undefined,
      m.teknis.bukti,
    ],
  ];
  const keras: string[] = [];
  const tidakPasti: string[] = [];
  for (const [label, ada, teknis] of slots) {
    const hasil = periksaSlotBerkas(label, ada, teknis);
    keras.push(...hasil.keras);
    tidakPasti.push(...hasil.tidakPasti);
  }
  if (keras.length > 0) {
    return rule(
      "dokumen_validasi_teknis",
      "gagal",
      "server",
      `Dokumen belum lolos validasi teknis: ${keras.join("; ")}.`,
      keras,
    );
  }
  if (tidakPasti.length > 0) {
    return rule(
      "dokumen_validasi_teknis",
      "tidak_pasti",
      "server",
      tidakPasti.join("; ") + ".",
      tidakPasti,
    );
  }
  return rule(
    "dokumen_validasi_teknis",
    "lulus",
    "server",
    "Selfie dengan KTP dan bukti penghasilan lolos validasi teknis server (jenis gambar + dimensi).",
  );
}

/** 5. OCR tersedia & keyakinannya memenuhi ambang. */
function periksaOcrTersedia(m: MasukanKeputusanKyc): HasilRuleKyc {
  if (m.ocr === null) {
    return rule(
      "ocr_tersedia_threshold",
      "tidak_pasti",
      "klien",
      "Hasil OCR KTP belum tersedia, jadi keterbacaan teks KTP tidak bisa dipastikan mesin.",
      ["OCR belum dijalankan / belum tersimpan"],
    );
  }
  if (!Number.isFinite(m.ocr.konfidensi) || m.ocr.konfidensi < AMBANG_KEYAKINAN_OCR_OTOMATIS) {
    return rule(
      "ocr_tersedia_threshold",
      "tidak_pasti",
      "klien",
      `Keyakinan OCR ${Math.round(m.ocr.konfidensi)} di bawah ambang ${AMBANG_KEYAKINAN_OCR_OTOMATIS}, jadi hasilnya belum bisa dipastikan.`,
      [`Keyakinan OCR < ${AMBANG_KEYAKINAN_OCR_OTOMATIS}`],
    );
  }
  const nilai = nilaiHasilOcr(dataKtpDariOcr(m.ocr), m.ocr.konfidensi);
  if (nilai.perluFotoUlang || m.ocr.nik === null || m.ocr.nama === null) {
    const detail = [...nilai.alasan];
    if (m.ocr.nik === null) detail.push("NIK tidak terbaca dari gambar");
    if (m.ocr.nama === null) detail.push("Nama tidak terbaca dari gambar");
    return rule(
      "ocr_tersedia_threshold",
      "tidak_pasti",
      "klien",
      "Hasil OCR belum cukup lengkap untuk dipastikan mesin (lihat rincian).",
      detail,
    );
  }
  return rule(
    "ocr_tersedia_threshold",
    "lulus",
    "klien",
    `Hasil OCR tersedia dengan keyakinan ${Math.round(m.ocr.konfidensi)} (≥ ${AMBANG_KEYAKINAN_OCR_OTOMATIS}) dan memuat NIK serta nama.`,
  );
}

/** Bangun daftar ketidaksesuaian OCR↔isian (hanya bila OCR ada). */
function bedaOcrDenganIsian(m: MasukanKeputusanKyc): {
  ada: boolean;
  material: string[];
  lunak: string[];
} {
  if (m.ocr === null) return { ada: false, material: [], lunak: [] };
  const form = {
    namaLengkap: m.isian.namaLengkap ?? "",
    nik: m.isian.nik ?? "",
    alamat: m.isian.alamat ?? "",
  };
  const beda = bandingkanKtpDenganForm(dataKtpDariOcr(m.ocr), form);
  const material = beda
    .filter((b) => b.field === "nik" || b.field === "nama")
    .map((b) => `${b.label} tidak cocok (KTP: "${b.ocr}" vs isian: "${b.form}")`);
  const lunak = beda
    .filter((b) => b.field !== "nik" && b.field !== "nama")
    .map((b) => `${b.label} tidak cocok (KTP: "${b.ocr}" vs isian: "${b.form}")`);
  return { ada: true, material, lunak };
}

/** 6. Data OCR konsisten dengan data yang diinput. */
function periksaOcrKonsisten(m: MasukanKeputusanKyc): HasilRuleKyc {
  const { ada, material, lunak } = bedaOcrDenganIsian(m);
  if (!ada) {
    return rule(
      "ocr_konsisten",
      "tidak_pasti",
      "klien",
      "OCR belum tersedia, jadi kecocokan teks KTP dengan isian tidak bisa dibandingkan.",
      ["OCR belum tersedia"],
    );
  }
  if (material.length > 0) {
    return rule(
      "ocr_konsisten",
      "gagal",
      "klien",
      `Teks KTP berbeda dari isian pada data identitas inti: ${material.join("; ")}.`,
      material,
    );
  }
  if (lunak.length > 0) {
    return rule(
      "ocr_konsisten",
      "tidak_pasti",
      "klien",
      `Ada perbedaan yang tidak menyangkut identitas inti (${lunak.join("; ")}); perlu ditinjau.`,
      lunak,
    );
  }
  return rule(
    "ocr_konsisten",
    "lulus",
    "klien",
    "NIK, nama, dan alamat hasil OCR cocok dengan isian formulir.",
  );
}

/** 7. Nomor WhatsApp terverifikasi (hanya membuktikan kontrol atas nomor). */
function periksaNomorWa(m: MasukanKeputusanKyc): HasilRuleKyc {
  if ((m.isian.nomorWhatsApp ?? "").trim() === "") {
    return rule("nomor_wa_terverifikasi", "gagal", "server", "Nomor WhatsApp belum diisi.", [
      "Nomor WhatsApp kosong",
    ]);
  }
  if (!m.nomorWaTerverifikasi) {
    return rule(
      "nomor_wa_terverifikasi",
      "gagal",
      "server",
      "Nomor WhatsApp belum diverifikasi lewat kode OTP.",
      ["Verifikasi OTP nomor WhatsApp belum selesai atau sudah tidak berlaku"],
    );
  }
  return rule(
    "nomor_wa_terverifikasi",
    "lulus",
    "server",
    "Nomor WhatsApp sudah dibuktikan aktif lewat kode OTP. Ini membuktikan kontrol atas nomor itu, bukan kepemilikan identitas di KTP.",
  );
}

/** 8. Tidak ada ketidaksesuaian material (NIK/nama) antara OCR dan isian. */
function periksaTanpaMaterial(m: MasukanKeputusanKyc): HasilRuleKyc {
  const { ada, material } = bedaOcrDenganIsian(m);
  if (!ada) {
    return rule(
      "tanpa_ketidaksesuaian_material",
      "tidak_pasti",
      "klien",
      "OCR belum tersedia, jadi ketidaksesuaian material belum bisa disingkirkan.",
      ["OCR belum tersedia"],
    );
  }
  if (material.length > 0) {
    return rule(
      "tanpa_ketidaksesuaian_material",
      "gagal",
      "klien",
      `Ditemukan ketidaksesuaian material: ${material.join("; ")}.`,
      material,
    );
  }
  return rule(
    "tanpa_ketidaksesuaian_material",
    "lulus",
    "klien",
    "Tidak ada ketidaksesuaian material antara teks KTP dan isian.",
  );
}

/* ==========================================================================
 * Keputusan
 * ========================================================================== */

/** Id pemeriksaan + status saja (tanpa data pribadi) untuk sidik jari. */
function sidikJari(aturan: readonly HasilRuleKyc[], target: StatusKyc): string {
  const bagian = aturan.map((a) => `${a.id}=${a.status}`).join("|");
  return `${VERSI_ATURAN_AUTO_KYC}#${target}#${bagian}`;
}

/**
 * Jalankan seluruh pemeriksaan dan putuskan status yang dituju.
 *
 * Urutan pemeriksaan sesuai daftar produk. Pemeriksaan agregat terakhir
 * (`pemeriksaan_wajib_selesai`) merangkum apakah semua pemeriksaan wajib sudah
 * tuntas — ia `gagal` bila ada yang gagal, `tidak_pasti` bila ada yang tidak
 * pasti, dan `lulus` hanya bila semuanya lulus.
 */
export function putuskanKycOtomatis(m: MasukanKeputusanKyc): KeputusanKyc {
  const aturan: HasilRuleKyc[] = [
    periksaDataIdentitas(m),
    periksaFormatNikRule(m),
    periksaKtpTerbaca(m),
    periksaDokumenTeknis(m),
    periksaOcrTersedia(m),
    periksaOcrKonsisten(m),
    periksaNomorWa(m),
    periksaTanpaMaterial(m),
  ];

  const gagal = aturan.filter((r) => r.status === "gagal");
  const tidakPasti = aturan.filter((r) => r.status === "tidak_pasti");

  const statusAgregat: StatusPemeriksaan =
    gagal.length > 0 ? "gagal" : tidakPasti.length > 0 ? "tidak_pasti" : "lulus";
  const agregat: HasilRuleKyc =
    statusAgregat === "lulus"
      ? rule(
          "pemeriksaan_wajib_selesai",
          "lulus",
          "server",
          "Seluruh pemeriksaan wajib sudah tuntas dan lulus.",
        )
      : statusAgregat === "gagal"
        ? rule(
            "pemeriksaan_wajib_selesai",
            "gagal",
            "server",
            `Ada ${gagal.length} pemeriksaan wajib yang gagal: ${gagal.map((r) => r.judul).join(", ")}.`,
            gagal.map((r) => r.id),
          )
        : rule(
            "pemeriksaan_wajib_selesai",
            "tidak_pasti",
            "server",
            `Ada ${tidakPasti.length} pemeriksaan wajib yang belum bisa dipastikan: ${tidakPasti
              .map((r) => r.judul)
              .join(", ")}.`,
            tidakPasti.map((r) => r.id),
          );

  const semua: HasilRuleKyc[] = [...aturan, agregat];

  if (gagal.length > 0) {
    return {
      target: "NEEDS_CORRECTION",
      alasan: "otomatis_perlu_perbaikan",
      ringkasan:
        `Pemeriksaan otomatis menemukan ${gagal.length} hal yang perlu diperbaiki: ` +
        `${gagal.map((r) => r.judul).join(", ")}. Setelah diperbaiki, ajukan kembali untuk peninjauan.`,
      versiAturan: VERSI_ATURAN_AUTO_KYC,
      aturan: semua,
      sidikJari: sidikJari(semua, "NEEDS_CORRECTION"),
    };
  }

  if (tidakPasti.length > 0) {
    return {
      target: "PENDING_REVIEW",
      alasan: "otomatis_menunggu_peninjauan",
      ringkasan:
        `Pemeriksaan otomatis belum bisa memastikan ${tidakPasti.length} hal: ` +
        `${tidakPasti.map((r) => r.judul).join(", ")}. Pengajuan diteruskan untuk peninjauan petugas.`,
      versiAturan: VERSI_ATURAN_AUTO_KYC,
      aturan: semua,
      sidikJari: sidikJari(semua, "PENDING_REVIEW"),
    };
  }

  return {
    target: "VERIFIED",
    alasan: "otomatis_semua_pemeriksaan_lulus",
    ringkasan:
      "Seluruh persyaratan yang dapat diverifikasi sistem sudah terpenuhi. Status KYC " +
      "terverifikasi berarti proses KYC berhasil — bukan persetujuan pinjaman, pendanaan, atau pencairan.",
    versiAturan: VERSI_ATURAN_AUTO_KYC,
    aturan: semua,
    sidikJari: sidikJari(semua, "VERIFIED"),
  };
}

/**
 * KEBIJAKAN PENERAPAN — satu-satunya hasil yang boleh mengubah status sendiri.
 *
 * Kenapa HANYA `VERIFIED`: `NEEDS_CORRECTION` berarti "nasabah harus memperbaiki
 * dulu", dan di modul ini keputusan itu milik PETUGAS (lihat
 * `TRANSISI_SAH` di `lib/kycStatus.ts`). Dari `NEEDS_CORRECTION` pun hanya
 * NASABAH yang bisa mengirim ulang — petugas tidak bisa langsung memverifikasi.
 * Kalau mesin menerbitkan `NEEDS_CORRECTION` sendiri, pengajuan yang sudah masuk
 * antrean petugas langsung tertutup dari jalur verifikasi: mesin mengambil
 * keputusan yang bukan haknya SEKALIGUS menghalangi petugas memutuskan. Karena
 * itu hasil `NEEDS_CORRECTION`/`PENDING_REVIEW` tetap DICATAT (hasil tiap
 * pemeriksaan + alasan + versi aturan) sebagai bahan peninjauan, tetapi status
 * dibiarkan `PENDING_REVIEW`.
 *
 * Fungsi ini MURNI supaya kebijakan itu bisa diuji dan tidak tersebar di
 * mutation: `convex/kyc.ts` memanggilnya untuk memutuskan apakah keputusan
 * dijalankan atau hanya dicatat.
 */
export function bolehTerapkanOtomatis(target: StatusKyc): boolean {
  return target === "VERIFIED";
}

/** Ringkasan singkat aturan keputusan otomatis — dipakai dokumentasi/panel. */
export const CATATAN_AUTO_KYC =
  "Keputusan otomatis hanya menjalankan pemeriksaan yang bisa diperiksa mesin. " +
  "Format NIK bukan bukti NIK resmi, OCR bukan bukti keaslian KTP, unggahan KTP bukan bukti KTP asli, " +
  "dan OTP hanya membuktikan kontrol atas nomor WhatsApp. Tidak ada verifikasi Dukcapil di sini. " +
  "Mesin hanya menaikkan status menjadi VERIFIED bila seluruh pemeriksaan wajib lulus; " +
  "bila ada yang gagal atau belum bisa dipastikan, hasilnya hanya DICATAT sebagai bahan " +
  "peninjauan dan keputusan tetap di tangan petugas (status tetap PENDING_REVIEW).";

/** Batas rasio yang dipakai pemeriksaan dimensi (diekspor untuk dokumentasi/uji). */
export const RASIO_MAKS_BERKAS = RASIO_MAKS;
