/**
 * ANALITIK ADMIN & PERINGATAN RISIKO — logika MURNI (tanpa React, Convex, DOM)
 * supaya bisa diuji sebagai skrip biasa: `bun src/lib/analitikAdmin.test.ts`.
 *
 * Kenapa berkas ini ada: grafik dan daftar risiko adalah tempat paling mudah
 * untuk "mengarang angka" — membulatkan hari, menghitung persen dari total yang
 * salah, atau menampilkan segmen kosong sebagai nol yang terlihat seperti data.
 * Semua perhitungan itu dikumpulkan di sini, diuji, lalu dipakai apa adanya oleh
 * komponen grafik.
 *
 * Batas yang dijaga:
 * - **Nol berarti nol.** Rangkaian 30 hari SELALU berisi tepat 30 titik (hari
 *   tanpa peristiwa = 0), sehingga garis grafik tidak melompati hari kosong dan
 *   sumbu X-nya jujur. Titiknya dihitung per hari kalender lokal server.
 * - **Label datang dari satu tempat.** Nama segmen donut dan nama peringatan
 *   ada di sini, bukan ditulis ulang di JSX.
 * - **Peringatan hanya muncul bila metriknya benar-benar > 0.** Tidak ada baris
 *   peringatan untuk keadaan yang tidak terjadi, dan `nilai` selalu angka
 *   mentahnya (bukan kalimat) supaya bisa ditelusuri.
 * - **Tingkat risiko dipisah dari tampilan.** Urutan tampil = tingkat dulu
 *   (tinggi sebelum sedang), lalu nilai terbesar — bukan urutan kebetulan dari
 *   objek JavaScript.
 */

/** Jumlah hari pada grafik tren. */
export const HARI_TREN = 30;

/**
 * Ambang penghasilan bulanan yang dianggap aman (rupiah). Pengajuan di bawah
 * angka ini ditandai sebagai risiko kemampuan-bayar.
 *
 * Sengaja konstanta produk yang EKSPLISIT, bukan angka ajaib di dalam query:
 * nilai ini dipakai bersama oleh server (menghitung kasusnya) dan UI (menulis
 * kalimatnya), jadi mengubahnya cukup di satu tempat dan tetap terbaca di uji.
 */
export const AMBANG_PENGHASILAN_RISIKO = 1_500_000;

/** Satu milidetik hari — dipakai membulatkan waktu ke awal hari. */
export const MS_HARI = 24 * 60 * 60 * 1000;

/** Jenis peristiwa keuangan yang digambar pada grafik tren. */
export type TipePeristiwaTren = "pencairan" | "pelunasan";

/**
 * Satu peristiwa uang dengan waktu & nominalnya. Dibuat di server dari
 * `didanaiPada` (pencairan) dan `lunasPada` (pelunasan) — bukan ditebak dari
 * status, karena status tidak menyimpan kapan peristiwanya terjadi.
 */
export type PeristiwaTren = {
  tipe: TipePeristiwaTren;
  waktu: number;
  /** Rupiah bulat. */
  jumlah: number;
};

/** Satu titik (satu hari) pada grafik tren. */
export type TitikTren = {
  /** Awal hari, epoch ms — kunci pengelompokan. */
  tanggal: number;
  /** Label sumbu X, mis. "12 Okt". */
  label: string;
  /** Total pencairan hari itu (rupiah bulat). */
  pencairan: number;
  /** Total pelunasan hari itu (rupiah bulat). */
  pelunasan: number;
};

/** Awal hari kalender dari sebuah waktu (waktu lokal server). */
export function awalHari(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Label pendek sumbu X, mis. "12 Okt". */
export function labelTanggalSingkat(ms: number): string {
  return new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

/**
 * Susun tepat `jumlahHari` titik harian yang berakhir pada hari `sekarang`,
 * dengan hari tanpa peristiwa bernilai 0. Peristiwa di luar rentang (lebih tua
 * atau dari masa depan) dibuang — bukan dijepit ke titik pertama/terakhir, yang
 * akan menggelembungkan angka hari ini.
 */
export function seriTren30Hari(
  peristiwa: readonly PeristiwaTren[],
  sekarang: number,
  jumlahHari: number = HARI_TREN,
): TitikTren[] {
  const hariAkhir = awalHari(sekarang);
  const hariAwal = hariAkhir - (jumlahHari - 1) * MS_HARI;
  const titik = new Map<number, TitikTren>();
  for (let i = 0; i < jumlahHari; i += 1) {
    const tanggal = hariAwal + i * MS_HARI;
    titik.set(tanggal, {
      tanggal,
      label: labelTanggalSingkat(tanggal),
      pencairan: 0,
      pelunasan: 0,
    });
  }
  for (const p of peristiwa) {
    if (!Number.isFinite(p.waktu) || !Number.isFinite(p.jumlah)) continue;
    const tanggal = awalHari(p.waktu);
    const slot = titik.get(tanggal);
    if (slot === undefined) continue;
    if (p.tipe === "pencairan") slot.pencairan += p.jumlah;
    else slot.pelunasan += p.jumlah;
  }
  return [...titik.values()];
}

/** Total kedua seri — dipakai ringkasan di atas grafik. */
export function totalTren(seri: readonly TitikTren[]): { pencairan: number; pelunasan: number } {
  let pencairan = 0;
  let pelunasan = 0;
  for (const t of seri) {
    pencairan += t.pencairan;
    pelunasan += t.pelunasan;
  }
  return { pencairan, pelunasan };
}

/* ==========================================================================
 * Geometri grafik (SVG) — dihitung di sini supaya bisa diuji
 * ==========================================================================
 *
 * Grafik digambar sebagai SVG biasa, bukan lewat pustaka grafik pihak ketiga.
 * Alasannya bukan selera: satu-satunya modul grafik di repo (`ui/chart.tsx`)
 * menarik `recharts`, dan membawa pustaka itu ke halaman ini berarti menambah
 * satu pohon dependensi baru pada aplikasi yang selama ini tidak pernah
 * memuatnya. Perhitungan koordinatnya tetap bisa salah, jadi ia dikumpulkan di
 * sini, murni, dan diuji: lebar/tinggi tetap (tanpa mengukur DOM), skala yang
 * sama untuk kedua seri (supaya tinggi garis bisa dibandingkan), dan pembagian
 * busur donut yang jumlahnya SELALU tepat satu lingkaran penuh.
 */

/** Satu titik pada kanvas grafik (koordinat SVG, origin kiri-atas). */
export type TitikGrafik = { x: number; y: number; nilai: number };

/**
 * Nilai tertinggi antar seri, dengan lantai 1 supaya pembagian tidak pernah
 * nol dan grafik kosong tidak menghasilkan koordinat `NaN`.
 */
export function maksimumSeri(...seri: ReadonlyArray<readonly number[]>): number {
  let maks = 0;
  for (const s of seri) for (const n of s) if (Number.isFinite(n) && n > maks) maks = n;
  return Math.max(1, maks);
}

/**
 * Ubah deret nilai menjadi koordinat pada kotak `lebar × tinggi`.
 * Nilai 0 diletakkan di dasar kotak; nilai maksimum menyentuh puncak. Deret satu
 * titik diletakkan di tengah lebar (bukan di kiri, yang akan terlihat seperti
 * garis menempel tepi).
 */
export function koordinatGaris(
  nilai: readonly number[],
  { lebar, tinggi, maks }: { lebar: number; tinggi: number; maks: number },
): TitikGrafik[] {
  const n = nilai.length;
  if (n === 0) return [];
  const langkah = n === 1 ? 0 : lebar / (n - 1);
  return nilai.map((v, i) => {
    const aman = Number.isFinite(v) && v > 0 ? v : 0;
    const x = n === 1 ? lebar / 2 : i * langkah;
    const y = tinggi - (aman / maks) * tinggi;
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, nilai: aman };
  });
}

/** Titik-titik untuk atribut `points` sebuah `<polyline>`. */
export function atributPoints(titik: readonly TitikGrafik[]): string {
  return titik.map((t) => `${t.x},${t.y}`).join(" ");
}

/* ==========================================================================
 * Komposisi status pinjaman (donut)
 * ========================================================================== */

/** Tiga kelompok yang diminta produk — plus label & nada warnanya. */
export type KunciKomposisi = "lancar" | "ditinjau" | "jatuhTempo";

export const LABEL_KOMPOSISI: Record<KunciKomposisi, string> = {
  lancar: "Lancar",
  ditinjau: "Ditinjau",
  jatuhTempo: "Jatuh Tempo",
};

/**
 * Warna segmen donut. Hijau untuk lancar, kuning untuk yang masih ditinjau,
 * merah untuk jatuh tempo — sama artinya dengan nada peringatan lain di modul
 * ini, jadi warna tidak pernah berarti lain di dua tempat.
 */
export const WARNA_KOMPOSISI: Record<KunciKomposisi, string> = {
  lancar: "#047857",
  ditinjau: "#f59e0b",
  jatuhTempo: "#b91c1c",
};

export type BagianKomposisi = {
  kunci: KunciKomposisi;
  label: string;
  nilai: number;
  warna: string;
};

/**
 * Bagian donut dari hitungan mentah. `jumlah` negatif atau bukan angka dianggap
 * 0 supaya donut tidak pernah digambar dengan nilai tak masuk akal.
 */
export function komposisiStatusPinjaman(jumlah: {
  lancar: number;
  ditinjau: number;
  jatuhTempo: number;
}): BagianKomposisi[] {
  const bersih = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
  return (Object.keys(LABEL_KOMPOSISI) as KunciKomposisi[]).map((kunci) => ({
    kunci,
    label: LABEL_KOMPOSISI[kunci],
    nilai: bersih(jumlah[kunci]),
    warna: WARNA_KOMPOSISI[kunci],
  }));
}

/** Total seluruh segmen — 0 berarti "belum ada pinjaman", bukan 100%. */
export function totalKomposisi(bagian: readonly BagianKomposisi[]): number {
  return bagian.reduce((n, b) => n + b.nilai, 0);
}

/**
 * Persentase satu segmen dari total, dibulatkan. `null` bila totalnya 0 —
 * pemanggil menampilkan "—" untuk itu, bukan "0%" yang menyesatkan.
 */
export function persenBagian(bagian: BagianKomposisi, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((bagian.nilai / total) * 100);
}

/* ==========================================================================
 * Peringatan risiko
 * ========================================================================== */

export type TingkatRisiko = "tinggi" | "sedang";

export type PeringatanRisiko = {
  /** Kunci stabil — dipakai sebagai `key` React dan untuk pengujian. */
  id: string;
  tingkat: TingkatRisiko;
  judul: string;
  detail: string;
  /** Nilai modul admin yang menangani masalah ini (`admin-tabs`). */
  modul: string;
  /** Angka mentah di balik peringatan ini. */
  nilai: number;
};

/**
 * Metrik risiko yang tersedia untuk admin. Semuanya HITUNGAN, bukan tebakan:
 * nilainya diambil dari agregat stats admin dan pengajuan yang sedang menunggu.
 */
export type MetrikRisiko = {
  /** Pinjaman aktif yang titik GPS-nya di luar radius. */
  gpsMismatch: number;
  /** Pinjaman aktif tanpa titik lokasi terbaru (lokasi dimatikan). */
  pinjamanTanpaLokasi: number;
  /** Titik lokasi yang ditandai mencurigakan. */
  titikDicurigai: number;
  /** Peringatan lokasi yang masih aktif. */
  peringatanLokasiAktif: number;
  /** Pinjaman yang sudah melewati jatuh tempo. */
  pinjamanTerlambat: number;
  /** Pengajuan (pinjaman/gadai/kredit) yang menunggu keputusan admin. */
  pengajuanMenunggu: number;
  /** Pengajuan yang pendapatannya di bawah ambang kewajaran PINDAI. */
  pendapatanDiBawahAmbang: number;
};

export const METRIK_RISIKO_KOSONG: MetrikRisiko = {
  gpsMismatch: 0,
  pinjamanTanpaLokasi: 0,
  titikDicurigai: 0,
  peringatanLokasiAktif: 0,
  pinjamanTerlambat: 0,
  pengajuanMenunggu: 0,
  pendapatanDiBawahAmbang: 0,
};

/** Urutan tingkat untuk pengurutan stabil (tinggi dulu). */
const BOBOT_TINGKAT: Record<TingkatRisiko, number> = { tinggi: 0, sedang: 1 };

/**
 * Bangun daftar peringatan dari metrik. Aturannya:
 * 1. Hanya metrik > 0 yang menghasilkan baris.
 * 2. Urut: tingkat tinggi dulu, lalu nilai terbesar, lalu `id` sebagai pemecah
 *    seri supaya urutannya tidak berubah-ubah antar-render.
 */
export function daftarPeringatanRisiko(m: MetrikRisiko): PeringatanRisiko[] {
  const kandidat: PeringatanRisiko[] = [
    {
      id: "gps_mismatch",
      tingkat: "tinggi",
      judul: "Lokasi di luar radius",
      detail:
        "Titik GPS pinjaman aktif berada di luar radius yang diizinkan. Tinjau foto dan lokasi sebelum melanjutkan penagihan.",
      modul: "lokasi",
      nilai: m.gpsMismatch,
    },
    {
      id: "titik_dicurigai",
      tingkat: "tinggi",
      judul: "Titik lokasi dicurigai",
      detail: "Ada titik lokasi yang ditandai mencurigakan oleh pemeriksaan sistem.",
      modul: "lokasi",
      nilai: m.titikDicurigai,
    },
    {
      id: "terlambat",
      tingkat: "tinggi",
      judul: "Melewati jatuh tempo",
      detail: "Pinjaman sudah melewati tanggal jatuh tempo dan belum dinyatakan lunas.",
      modul: "dpd",
      nilai: m.pinjamanTerlambat,
    },
    {
      id: "pendapatan_bawah_ambang",
      tingkat: "tinggi",
      judul: "Pendapatan di bawah ambang batas",
      detail:
        "Pengajuan baru dengan penghasilan di bawah ambang kewajaran PINDAI. Periksa kemampuan bayar sebelum menyetujui.",
      modul: "konvensional",
      nilai: m.pendapatanDiBawahAmbang,
    },
    {
      id: "tanpa_lokasi",
      tingkat: "sedang",
      judul: "Tanpa titik lokasi terbaru",
      detail: "Pinjaman aktif yang titik lokasinya kedaluwarsa — peminjam mematikan izin lokasi.",
      modul: "lokasi",
      nilai: m.pinjamanTanpaLokasi,
    },
    {
      id: "peringatan_lokasi",
      tingkat: "sedang",
      judul: "Peringatan lokasi aktif",
      detail: "Peringatan lokasi yang belum ditindaklanjuti.",
      modul: "lokasi",
      nilai: m.peringatanLokasiAktif,
    },
    {
      id: "menunggu_keputusan",
      tingkat: "sedang",
      judul: "Menunggu keputusan",
      detail: "Pengajuan yang masih menunggu keputusan admin hari ini.",
      modul: "konvensional",
      nilai: m.pengajuanMenunggu,
    },
  ];

  return kandidat
    .filter((p) => Number.isFinite(p.nilai) && p.nilai > 0)
    .sort((a, b) => {
      const bedaTingkat = BOBOT_TINGKAT[a.tingkat] - BOBOT_TINGKAT[b.tingkat];
      if (bedaTingkat !== 0) return bedaTingkat;
      if (b.nilai !== a.nilai) return b.nilai - a.nilai;
      return a.id.localeCompare(b.id);
    });
}

/** Satu busur donut siap pakai untuk elemen `<circle>` ber-`stroke-dasharray`. */
export type BusurDonut = {
  kunci: KunciKomposisi;
  label: string;
  warna: string;
  nilai: number;
  /** Panjang busur yang digambar (fraksi × keliling), dibulatkan. */
  panjang: number;
  /** `stroke-dasharray`: panjang busur lalu sisanya kosong. */
  dashArray: string;
  /** `stroke-dashoffset`: menggeser busur ke posisi akumulasinya. */
  dashOffset: number;
};

/**
 * Bagi keliling donut menjadi busur-busur sesuai komposisi.
 *
 * Jumlah panjang semua busur + celah TIDAK boleh melebihi keliling: sisa ruang
 * hanya dari pembulatan, dan segmen bernilai 0 dilewati sepenuhnya (bukan
 * digambar setipis rambut yang terlihat seperti data).
 */
export function busurDonut(
  bagian: readonly BagianKomposisi[],
  radius: number,
  celah = 2,
): BusurDonut[] {
  const total = totalKomposisi(bagian);
  const keliling = 2 * Math.PI * radius;
  if (total <= 0) return [];
  let akumulasi = 0;
  const hasil: BusurDonut[] = [];
  for (const b of bagian) {
    if (b.nilai <= 0) continue;
    const fraksi = b.nilai / total;
    const panjang = Math.max(0, fraksi * keliling - celah);
    hasil.push({
      kunci: b.kunci,
      label: b.label,
      warna: b.warna,
      nilai: b.nilai,
      panjang: Math.round(panjang * 100) / 100,
      dashArray: `${Math.round(panjang * 100) / 100} ${Math.round((keliling - panjang) * 100) / 100}`,
      dashOffset: Math.round(-akumulasi * 100) / 100,
    });
    akumulasi += fraksi * keliling;
  }
  return hasil;
}

/** Jumlah peringatan per tingkat — dipakai ringkasan widget. */
export function hitungTingkat(daftar: readonly PeringatanRisiko[]): Record<TingkatRisiko, number> {
  return daftar.reduce(
    (acc, p) => {
      acc[p.tingkat] += 1;
      return acc;
    },
    { tinggi: 0, sedang: 0 } as Record<TingkatRisiko, number>,
  );
}
