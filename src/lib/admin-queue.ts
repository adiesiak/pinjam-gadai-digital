/**
 * Logika murni Meja Kerja Admin — tanpa React, tanpa Convex, tanpa DOM.
 *
 * Semua yang dihitung di sini dulu hidup di dalam `admin-tabs.tsx` sebagai
 * ekspresi inline, sehingga tidak bisa diuji dan mudah salah (mis. lencana grup
 * yang mencampur "menunggu tindakan" dengan "jumlah informasi"). Berkas ini
 * memindahkannya ke fungsi bernama supaya bisa diuji sebagai skrip biasa
 * (`bun src/lib/admin-queue.test.ts`) dan dipakai bersama oleh panel
 * "Hari Ini" maupun navigasi.
 *
 * Aturan yang dijaga berkas ini:
 * - `NILAI_MODUL_ADMIN` adalah satu-satunya daftar nilai tab. Pemetaan panel di
 *   UI dibuat `Record<NilaiModulAdmin, ReactNode>`, sehingga modul tanpa panel
 *   menjadi galat kompilasi — bukan halaman kosong saat dipakai.
 * - Angka hanya berarti bila sumbernya benar-benar siap. "Belum termuat" bukan 0.
 */

/**
 * Seluruh nilai tab panel admin, urut sesuai peta di dokumen desain §4.
 * 16 modul lama + `hari-ini` + `aplikasi` = 18 (panel "Ledger internal" dihapus
 * dari panel admin; query ledger tetap dipakai halaman /qc).
 * `killswitch` ditambahkan agar pintu darurat punya tempat di sidebar
 * (Keamanan & audit) selain tombol di header — memakai mutation
 * `system.setKillSwitch` yang sudah ada, tanpa backend baru.
 * `pengembangan` adalah halaman dokumentasi internal: peta halaman, fitur, dan
 * logika bisnis yang hanya dibaca admin. Ia tidak menyimpan data apa pun.
 * Menambah modul di sini akan memaksa `panel` di `admin-tabs.tsx` menambahkan isinya.
 */
export const NILAI_MODUL_ADMIN = [
  "hari-ini",
  "pinjaman",
  "gadai",
  "kredit",
  "kyc",
  "alokasi",
  "undian",
  "rekonsiliasi",
  "dpd",
  "lelang",
  "plafon",
  "akses",
  "lokasi",
  "landing",
  "pendana",
  "pengumuman",
  "promo",
  "whatsapp",
  "config",
  "template",
  "aplikasi",
  "loglogin",
  "audit",
  "backup",
  "bi",
  "killswitch",
  "pengembangan",
] as const;

export type NilaiModulAdmin = (typeof NILAI_MODUL_ADMIN)[number];

/**
 * Satu tab bawah di layar kecil beserta modul-modul yang dipunyainya.
 * `modul` dibatasi `NilaiModulAdmin`, jadi nilai tab asing ditolak tipe;
 * kelengkapan tiap modul diuji di `admin-queue.test.ts`.
 */
export type GrupNav = {
  readonly id: string;
  readonly label: string;
  /** Modul milik grup ini, urut tampil (chip). */
  readonly modul: readonly NilaiModulAdmin[];
  /** Modul yang dipilih saat grup ini dibuka. Wajib salah satu dari `modul`. */
  readonly default: NilaiModulAdmin;
};

/* * Peta tab bawah → modul. Urutan dan isinya mengikuti dokumen desain §4.
 * `penagihan` tidak masuk GRUP_NAV sampai /admin benar-benar mendapat tabnya; saat itu
 * nilai "penagihan" sudah jadi anggota `NilaiModulAdmin` ke-7 di sini.
 */
export const GRUP_NAV: readonly GrupNav[] = [
  {
    id: "hari-ini",
    label: "Hari Ini",
    modul: ["hari-ini"],
    default: "hari-ini",
  },
  {
    id: "operasional",
    label: "Operasional",
    modul: [
      "pinjaman",
      "gadai",
      "kredit",
      "kyc",
      "alokasi",
      "undian",
      "rekonsiliasi",
      "plafon",
      "akses",
    ],
    default: "pinjaman",
  },
  {
    id: "pemantauan",
    label: "Pemantauan",
    modul: ["dpd", "lokasi", "lelang", "bi"],
    default: "dpd",
  },
  {
    id: "konten",
    label: "Konten",
    modul: [
      "template",
      "landing",
      "pendana",
      "pengumuman",
      "promo",
      "whatsapp",
      "aplikasi",
    ],
    default: "template",
  },
  {
    id: "sistem",
    label: "Sistem",
    modul: ["config", "backup", "pengembangan", "audit", "loglogin", "killswitch"],
    default: "config",
  },
];

/** Grup yang memuat sebuah modul; `undefined` bila modul tidak terdaftar. */
export function grupDariModul(value: NilaiModulAdmin): string | undefined {
  return GRUP_NAV.find((grup) => grup.modul.some((modul) => modul === value))?.id;
}

/**
 * Bobot sebuah lencana terhadap ringkasan grup:
 * - `menunggu` — benar-benar menunggu tindakan admin → dijumlahkan.
 * - `info`     — sekadar jumlah informasi (mis. pinjaman sudah disetujui,
 *                yang bukan pekerjaan tertunda) → **tidak** dijumlahkan.
 * - `tidak`    — tidak punya makna angka (mis. lencana "OK") → diabaikan.
 *
 * Sebelumnya `ringkasGrup` menjumlahkan semua lencana angka, sehingga grup
 * "Nasabah & penyedia dana" tampak penuh pekerjaan hanya karena menampilkan
 * jumlah pinjaman yang sudah disetujui.
 */
export type BobotGrup = "menunggu" | "info" | "tidak";

/** Bagian item menu yang dibutuhkan `ringkasGrup`. */
export type ItemRingkas = {
  badge: string | null;
  hitung: BobotGrup;
};

/**
 * Ringkasan satu grup menu saat tertutup: `"!"` bila ada yang perlu perhatian,
 * jumlah item yang benar-benar menunggu, atau `null` bila tidak ada apa-apa.
 *
 * `"!"` selalu menang supaya masalah (mis. ledger tidak seimbang) tidak
 * tertutup oleh angka jumlah.
 */
export function ringkasGrup(items: readonly ItemRingkas[]): string | null {
  if (items.some((item) => item.badge === "!")) return "!";
  const jumlah = items.reduce((total, item) => {
    if (item.hitung !== "menunggu") return total;
    const angka = Number(item.badge);
    return Number.isFinite(angka) ? total + angka : total;
  }, 0);
  return jumlah > 0 ? `${jumlah}` : null;
}

/** Bentuk minimal satu catatan pengajuan — cukup untuk penghitung status. */
export type BarisStatus = { readonly status: string };

/** Produk yang punya antrean pengajuan. */
export type ProdukAntrean = "pinjaman" | "gadai" | "kredit";

/**
 * Status yang berarti "belum diputuskan", per produk — satu sumber kebenaran.
 *
 * Lencana tab dan kartu "Hari Ini" sama-sama membaca daftar ini. Sebelumnya
 * lencana tab "Pinjaman" hanya menghitung `diajukan`, sehingga pekerjaan yang
 * sedang ditinjau hilang dari hitungan dan angka di sidebar berbeda dengan
 * angka di panel.
 */
export const STATUS_MENUNGGU: Record<ProdukAntrean, readonly string[]> = {
  pinjaman: ["diajukan", "sedang_direview"],
  gadai: ["diajukan", "sedang_dinilai"],
  kredit: ["diajukan", "sedang_ditinjau"],
};

function hitungStatus(baris: readonly BarisStatus[], status: readonly string[]): number {
  return baris.filter((satu) => status.includes(satu.status)).length;
}

/** Jumlah catatan satu produk yang menunggu keputusan admin. */
export function hitungMenunggu(
  baris: readonly BarisStatus[],
  produk: ProdukAntrean,
): number {
  return hitungStatus(baris, STATUS_MENUNGGU[produk]);
}

/** Baris yang membawa penanda "cair ekspres" dari `admin.adminOverview`. */
export type BarisEkspres = { readonly cairEkspres?: boolean | null };

/**
 * Peminjam mencentang "cair ekspres" pada pengajuan ini.
 *
 * `null`/kosong berarti data lama (dulu setiap pinjaman harian dikenai biaya
 * ekspres). Nilai itu sengaja TIDAK dianggap pilihan ekspres baru — tanpa
 * pembeda ini, seluruh antrean warisan akan ikut naik ke atas dan prioritas
 * ekspres kehilangan maknanya.
 */
export function pakaiCairEkspres(baris: BarisEkspres): boolean {
  return baris.cairEkspres === true;
}

/**
 * Jumlah pengajuan cair ekspres yang masih menunggu keputusan admin.
 *
 * Hanya status tahap tinjauan yang dihitung: pinjaman yang sudah berjalan atau
 * selesai bukan pekerjaan antrean, walau dulu memakai cair ekspres.
 */
export function hitungCairEkspresMenunggu(
  baris: readonly (BarisEkspres & BarisStatus)[],
): number {
  return baris.filter(
    (satu) =>
      pakaiCairEkspres(satu) && STATUS_MENUNGGU.pinjaman.includes(satu.status),
  ).length;
}

/**
 * Urutkan antrean: pengajuan cair ekspres di paling atas, lalu yang paling baru.
 *
 * Salinan baru dikembalikan (tidak mengubah masukan) supaya urutan data dari
 * server tetap utuh untuk pemakai lain. Pengajuan non-ekspres mempertahankan
 * urutan terbaru-dulu yang sudah dipakai panel.
 */
export function urutkanAntreanEkspres<
  T extends BarisEkspres & { readonly _creationTime: number },
>(baris: readonly T[]): T[] {
  return [...baris].sort(
    (a, b) =>
      Number(pakaiCairEkspres(b)) - Number(pakaiCairEkspres(a)) ||
      b._creationTime - a._creationTime,
  );
}

/**
 * Jumlah pengajuan yang menunggu keputusan admin di ketiga produk.
 *
 * Sengaja berbeda dari lencana tab "Pinjaman" yang lama, yang hanya menghitung
 * status `diajukan` dan mengabaikan `sedang_direview` — sehingga pekerjaan yang
 * sedang ditinjau tidak pernah muncul di ringkasan.
 */
export function jumlahPerluKeputusan({
  loans,
  pawns,
  kredit,
}: {
  loans: readonly BarisStatus[];
  pawns: readonly BarisStatus[];
  kredit: readonly BarisStatus[];
}): number {
  return (
    hitungMenunggu(loans, "pinjaman") +
    hitungMenunggu(pawns, "gadai") +
    hitungMenunggu(kredit, "kredit")
  );
}

/** Empat hitungan lokasi dari `admin.adminStats`. */
export type StatLokasi = {
  gpsMismatch: number;
  titikDicurigai: number;
  peringatanLokasiAktif: number;
  pinjamanTanpaLokasi: number;
};

/**
 * Jumlah peringatan lokasi yang perlu dilihat admin: koordinat tak cocok,
 * titik dicurigai, peringatan belum diakui, dan pinjaman tanpa titik perangkat.
 */
export function jumlahPerhatianLokasi(stats: StatLokasi): number {
  return (
    stats.gpsMismatch +
    stats.titikDicurigai +
    stats.peringatanLokasiAktif +
    stats.pinjamanTanpaLokasi
  );
}

/** Bagian item menu yang bisa dicari sheet "Cari menu". */
export type ModulCari = {
  value: string;
  label: string;
  hint: string;
  /**
   * Nama grup tempat modul berada. Opsional: bila diisi, nama grup ikut
   * dicari, sehingga "keamanan" menemukan "Keamanan Login".
   */
  grup?: string;
};

/**
 * Saring daftar modul untuk sheet "Cari menu": cocok pada label, nama grup,
 * atau `hint`, tanpa peduli huruf besar/kecil. Kueri kosong mengembalikan
 * seluruh daftar agar sheet tetap menampilkan semua modul sebelum diketik.
 *
 * Generik agar pemanggil boleh membawa field tambahan (mis. ikon) tanpa
 * kehilangan tipe.
 */
export function saringModul<T extends ModulCari>(
  daftar: readonly T[],
  kueri: string,
): T[] {
  const needle = kueri.trim().toLowerCase();
  if (needle === "") return [...daftar];
  return daftar.filter((modul) =>
    [modul.label, modul.grup ?? "", modul.hint].some((teks) =>
      teks.toLowerCase().includes(needle),
    ),
  );
}

/**
 * Modul yang dibuka dari parameter `?tab=` pada panel admin.
 *
 * Panel admin sengaja hidup di rute tersembunyi (lihat `ADMIN_ROUTE`), jadi
 * tautan langsung ke satu modul memakai parameter, bukan sub-path publik.
 * `doorprize` dipetakan ke `undian` supaya tautan yang mengikuti nama modul di
 * dokumen tetap membuka panel yang benar. Nilai kosong/asing jatuh ke meja
 * kerja, bukan halaman kosong.
 */
export function modulDariParameter(nilai: string | null): NilaiModulAdmin {
  if (nilai === null) return "hari-ini";
  const bersih = nilai.trim().toLowerCase();
  if (bersih === "doorprize") return "undian";
  const cocok = NILAI_MODUL_ADMIN.find((modul) => modul === bersih);
  return cocok ?? "hari-ini";
}
