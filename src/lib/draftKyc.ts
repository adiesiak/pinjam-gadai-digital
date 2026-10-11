/**
 * DRAFT KYC DI LOCALSTORAGE — logika MURNI (tanpa React, Convex, DOM) supaya
 * bisa diuji sebagai skrip biasa: `bun src/lib/draftKyc.test.ts`.
 *
 * Kenapa berkas ini ada: pengajuan KYC diisi di ponsel, dan ponsel bisa
 * mematikan tab (RAM penuh atau pengalihan ke aplikasi kamera) sebelum pengguna
 * sempat menekan simpan. Menyimpan setiap ketikan ke `localStorage` membuat
 * isian itu pulih utuh. Tapi draft lokal adalah data PALING TIDAK PERCAYA di
 * modul ini — ia bisa basi, milik akun lain, atau sudah disunting di perangkat
 * lain. Karena itu aturannya dikumpulkan di sini dan dipegang satu tempat:
 *
 * - Draft hanya berlaku untuk SATU pengguna: `userId` ikut disimpan di payload
 *   dan harus cocok saat dibaca, sehingga draft tidak pernah bocor ke akun lain
 *   yang memakai browser yang sama.
 * - Payload ber-versi (`VERSI_DRAFT_KYC`). Bentuk lama yang tidak dikenali
 *   diabaikan, bukan ditebak-tebak.
 * - Hanya kolom yang boleh diketik pengguna yang disimpan
 *   (`KUNCI_DRAFT_KYC`). NIK/WhatsApp/rekening memang sensitif, tapi draft ini
 *   tidak menambah paparan: nilainya SUDAH ada di layar yang sama dan di server
 *   setelah disimpan. Yang penting: draft tidak pernah masuk URL, log, atau
 *   notifikasi.
 * - Server SELALU menang. Saat memulihkan, nilai yang sudah tersimpan di server
 *   tidak ditimpa draft; draft hanya mengisi kolom yang masih kosong. Tanpa
 *   aturan ini, draft basi bisa menurunkan data yang sudah benar.
 * - Kode OTP dan berkas (blob) TIDAK pernah masuk draft — kode OTP kredensial
 *   berumur pendek, dan berkas tidak bisa disimpan sebagai teks.
 */

/** Versi bentuk payload draft. Naikkan bila bentuknya berubah. */
export const VERSI_DRAFT_KYC = 1;

/**
 * Kolom isian yang boleh dipulihkan dari draft. Sengaja teks biasa
 * (nama/NIK/WA/alamat/pekerjaan/penghasilan/bank/rekening/catatan) — persis
 * kolom yang diketik pengguna di seluruh 7 tahap.
 */
export const KUNCI_DRAFT_KYC = [
  "namaLengkap",
  "nik",
  "nomorWhatsApp",
  "alamat",
  "pekerjaan",
  "sumberPenghasilan",
  "penghasilan",
  "namaBank",
  "nomorRekening",
  "catatanPeminjam",
] as const;

export type KunciDraftKyc = (typeof KUNCI_DRAFT_KYC)[number];

/** Isian draft: hanya kolom yang dikenal, semuanya opsional & berupa teks. */
export type IsianDraftKyc = Partial<Record<KunciDraftKyc, string>>;

/** Bentuk payload yang benar-benar ditulis ke `localStorage`. */
export type PayloadDraftKyc = {
  versi: number;
  userId: string;
  diperbaruiPada: number;
  isian: IsianDraftKyc;
};

/**
 * Kunci penyimpanan per pengguna — persis format yang diminta produk:
 * `pindai_kyc_draft_{userId}`. Kunci kosong (tanpa userId) tidak pernah dibuat,
 * supaya draft tidak pernah tersimpan pada slot bersama.
 */
export function kunciPenyimpananDraft(userId: string): string {
  return `pindai_kyc_draft_${userId}`;
}

/**
 * Ambil hanya kolom yang dikenal dan bernilai teks. Dipakai baik saat menulis
 * maupun saat membaca, supaya field asing (mis. dari payload yang dirusak)
 * tidak pernah ikut masuk ke formulir.
 */
export function bersihkanIsian(mentah: unknown): IsianDraftKyc {
  if (mentah === null || typeof mentah !== "object") return {};
  const sumber = mentah as Record<string, unknown>;
  const bersih: IsianDraftKyc = {};
  for (const kunci of KUNCI_DRAFT_KYC) {
    const nilai = sumber[kunci];
    if (typeof nilai === "string") bersih[kunci] = nilai;
  }
  return bersih;
}

/** true bila draft masih punya isi yang berarti (bukan hanya spasi). */
export function adaIsiDraft(isian: IsianDraftKyc): boolean {
  return KUNCI_DRAFT_KYC.some((kunci) => (isian[kunci] ?? "").trim() !== "");
}

/**
 * Bentuk teks payload yang siap ditulis ke `localStorage`. Mengembalikan string,
 * bukan menulis sendiri, supaya pemanggil (hook) satu-satunya yang menyentuh
 * `window`.
 */
export function serialisasiDraft(
  userId: string,
  isian: IsianDraftKyc,
  diperbaruiPada: number,
): string {
  const payload: PayloadDraftKyc = {
    versi: VERSI_DRAFT_KYC,
    userId,
    diperbaruiPada,
    isian: bersihkanIsian(isian),
  };
  return JSON.stringify(payload);
}

/**
 * Baca payload draft. `null` untuk: teks kosong, JSON rusak, versi tak dikenal,
 * atau draft milik pengguna lain — semuanya diperlakukan sama (diabaikan).
 */
export function bacaDraftTersimpan(
  teks: string | null | undefined,
  userId: string,
): PayloadDraftKyc | null {
  if (typeof teks !== "string" || teks.trim() === "") return null;
  if (userId.trim() === "") return null;
  let mentah: unknown;
  try {
    mentah = JSON.parse(teks);
  } catch {
    return null;
  }
  if (mentah === null || typeof mentah !== "object") return null;
  const payload = mentah as Record<string, unknown>;
  if (payload.versi !== VERSI_DRAFT_KYC) return null;
  if (payload.userId !== userId) return null;
  const diperbaruiPada =
    typeof payload.diperbaruiPada === "number" && Number.isFinite(payload.diperbaruiPada)
      ? payload.diperbaruiPada
      : 0;
  const isian = bersihkanIsian(payload.isian);
  if (!adaIsiDraft(isian)) return null;
  return { versi: VERSI_DRAFT_KYC, userId, diperbaruiPada, isian };
}

/**
 * Gabungkan draft ke isian server: SERVER SELALU MENANG.
 *
 * Kolom yang sudah terisi di server tidak pernah ditimpa; draft hanya menambal
 * kolom yang masih kosong. Mengembalikan isian hasil gabungan plus daftar kolom
 * yang benar-benar dipulihkan — daftar itu dipakai UI untuk memberi tahu
 * pengguna apa yang dikembalikan, bukan untuk menyembunyikan asal datanya.
 */
export function pulihkanKeIsian(
  server: IsianDraftKyc,
  draft: IsianDraftKyc,
): { isian: IsianDraftKyc; dipulihkan: KunciDraftKyc[] } {
  const isian: IsianDraftKyc = { ...server };
  const dipulihkan: KunciDraftKyc[] = [];
  for (const kunci of KUNCI_DRAFT_KYC) {
    const nilaiServer = (server[kunci] ?? "").trim();
    const nilaiDraft = (draft[kunci] ?? "").trim();
    if (nilaiServer === "" && nilaiDraft !== "") {
      isian[kunci] = draft[kunci];
      dipulihkan.push(kunci);
    }
  }
  return { isian, dipulihkan };
}

/** Label ramah untuk kolom draft (dipakai kalimat pemulihan & pengujian). */
export const LABEL_KUNCI_DRAFT: Record<KunciDraftKyc, string> = {
  namaLengkap: "Nama lengkap",
  nik: "NIK",
  nomorWhatsApp: "Nomor WhatsApp",
  alamat: "Alamat",
  pekerjaan: "Pekerjaan",
  sumberPenghasilan: "Sumber penghasilan",
  penghasilan: "Penghasilan per bulan",
  namaBank: "Bank / e-wallet",
  nomorRekening: "Nomor rekening",
  catatanPeminjam: "Catatan",
};

/**
 * Kalimat pemulihan untuk pengguna. `null` bila tidak ada kolom yang
 * dipulihkan, sehingga UI tidak menampilkan notifikasi kosong.
 */
export function ringkasPemulihan(dipulihkan: KunciDraftKyc[]): string | null {
  if (dipulihkan.length === 0) return null;
  const label = dipulihkan.map((kunci) => LABEL_KUNCI_DRAFT[kunci]);
  return `Kami memulihkan ${label.length} isian yang belum tersimpan: ${label.join(", ")}.`;
}
