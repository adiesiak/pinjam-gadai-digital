/**
 * Kebijakan lokasi PINDAI — lokasi WAJIB aktif bagi Peminjam, plus retensi
 * jejak lokasinya (lihat `LOKASI_RETENSI` di bawah).
 *
 * Cara kerja gerbang ini: perangkat mengirim titik GPS berkala ke server
 * (heartbeat). Setiap aksi finansial — pengajuan pinjaman/gadai/kredit,
 * bayar cicilan, pelunasan — hanya dilayani bila titik terakhir masih segar.
 * Jadi mematikan GPS = tidak bisa bertransaksi, bukan sekadar peringatan.
 *
 * Batas platform (penting untuk tim, jangan diklaim lebih dari ini):
 *  - Browser TIDAK bisa mencegah pengguna mematikan tombol GPS di HP; yang
 *    bisa adalah memblokir transaksi (server, di sini) + menyetop UI.
 *  - Pelacakan saat tab/aplikasi ditutup tidak mungkin di web. Itu butuh
 *    aplikasi native (foreground service Android / Background Modes iOS),
 *    karena itu ada kebijakan `wajibAplikasiNative`.
 *  - Mencegah pengguna mematikan GPS sepenuhnya hanya bisa lewat perangkat
 *    terkelola (Android device owner/MDM) — di luar jangkauan aplikasi biasa.
 */
import { jarakKm } from "./geo";

export const LOKASI_KEBIJAKAN = {
  /** Titik terakhir dianggap segar selama ini (menit) — admin bisa ubah. */
  maxUmurMenit: 10,
  /** Akurasi maksimum titik yang diterima (meter). */
  maxAkurasiMeter: 1500,
  /** Interval heartbeat perangkat (detik). */
  intervalDetik: 60,
  /** Kecepatan antar titik yang masih wajar (km/jam) — deteksi lokasi palsu. */
  kecepatanMaksKmJam: 200,
  /**
   * Jeda maksimum antar titik (detik) yang masih boleh dibandingkan
   * kecepatannya. Setelah jeda lebih panjang (perjalanan luar kota, ponsel
   * mati), kecepatan rata-rata tidak lagi bermakna: tanpa batas ini, nasabah
   * yang menempuh jarak jauh akan ditolak berjam-jam karena dianggap memakai
   * lokasi palsu.
   */
  jendelaKecepatanDetik: 1_800,
  /** Toleransi jarak titik yang dikirim bersama pengajuan vs titik server (km). */
  toleransiJarakKm: 5,
  /**
   * Akurasi di bawah ini mustahil datang dari sensor GPS konsumen — indikasi
   * kuat titik dibuat aplikasi lokasi palsu (mock location).
   */
  akurasiTerlaluSempurnaMeter: 1,
  /**
   * Koordinat baru dicurigai "dibekukan" bila akurasi yang diklaim kedua titik
   * ≤ ini (meter). Titik dengan akurasi buruk memang boleh berulang persis.
   */
  identikAkurasiMaksMeter: 100,
  /**
   * Berapa titik identik BERTURUT-TURUT sebelum dicatat sebagai kecurigaan.
   * GPS asli selalu bergeser beberapa meter; koordinat yang persis sama
   * berulang kali menandakan posisi dibekukan aplikasi pihak ketiga.
   */
  identikBerturutMaks: 5,
} as const;

/** Tanda kecurigaan lokasi palsu yang dicatat & ditampilkan ke tim review. */
export const TANDA_LOKASI_PALSU = {
  /** Perangkat sendiri melaporkan titik berasal dari mock location. */
  mockDilaporkan: "mock_dilaporkan",
  /** Akurasi terlalu sempurna untuk sensor GPS nyata. */
  akurasiTidakWajar: "akurasi_tidak_wajar",
  /** Koordinat persis sama berulang-ulang padahal akurasi diklaim bagus. */
  koordinatIdentik: "koordinat_identik",
} as const;

/** Daftar tanda yang mungkin dicatat pada satu titik. */
export type TandaLokasiPalsu =
  (typeof TANDA_LOKASI_PALSU)[keyof typeof TANDA_LOKASI_PALSU];

/** Titik lokasi netral yang dipakai pemeriksa kecurangan. */
export interface TitikDiperiksa {
  lat: number;
  lng: number;
  akurasi: number;
  waktu: number;
  /** Perangkat melaporkan titik dari mock location (bila informasi tersedia). */
  mock?: boolean;
  /** Sudah berapa kali koordinat persis sama berturut-turut (termasuk ini). */
  identikBerturut?: number;
}

export interface HasilPeriksaLokasi {
  /** Titik ditolak — cirinya kuat dan deterministik. */
  palsu: boolean;
  /** Pesan siap tampil ke pengguna bila `palsu`. */
  alasan: string | null;
  /** Kecurigaan yang tetap dicatat walau titik diterima (untuk review admin). */
  tanda: TandaLokasiPalsu[];
  /** Jarak dari titik sebelumnya (km), null bila ini titik pertama. */
  jarakLompatKm: number | null;
  /** Hitungan koordinat identik berturut-turut untuk titik ini. */
  identikBerturut: number;
}

const PESAN_MOCK =
  "Lokasi perangkat terdeteksi berasal dari aplikasi lokasi palsu (mock location), " +
  "sehingga tidak dapat dipakai untuk transaksi. Matikan aplikasi tersebut, lalu matikan " +
  "pilihan \"Pilih aplikasi lokasi palsu\" di Setelan Pengembang, kemudian coba lagi.";

const PESAN_AKURASI_SEMPURNA =
  "Akurasi GPS yang dilaporkan tidak wajar (di bawah 1 meter) — presisi sebesar itu tidak " +
  "mungkin datang dari sensor GPS perangkat. Matikan aplikasi lokasi palsu lalu kirim ulang.";

const PESAN_LOMPATAN =
  "Lokasi terdeteksi melompat tidak wajar. Matikan aplikasi lokasi palsu, lalu kirim ulang dari perangkat asli.";

/**
 * Deteksi lokasi palsu — satu sumber aturan, dipakai jalur dashboard maupun
 * layanan native.
 *
 * Sifat pemeriksaannya sengaja dibedakan:
 *  - **Ditolak (`palsu: true`)**: ciri kuat & deterministik — perangkat mengaku
 *    mock location, akurasi di bawah kemampuan sensor, atau lompatan mustahil
 *    antar titik yang berdekatan waktu. Titik seperti ini tidak disimpan.
 *  - **Dicatat (`tanda`, titik tetap diterima)**: koordinat yang persis sama
 *    berkali-kali. Bisa saja perangkat diam di tempat atau memakai posisi
 *    terakhir yang di-cache, jadi menolaknya akan mengunci nasabah yang jujur;
 *    admin tetap perlu melihatnya untuk review.
 *
 * Batas jujur: `mock` datang dari perangkat, jadi klien yang menulis ulang
 * permintaannya bisa menyembunyikannya. Yang tidak bisa dielakkan klien adalah
 * heuristik waktu/akurasi/lompatan di atas, dan penutup penuh tetap butuh
 * attestation aplikasi (Play Integrity / App Attest) — lihat
 * `docs/aplikasi-native.md`.
 */
export function periksaLokasiPalsu(
  titik: { lat: number; lng: number; akurasi: number; mock?: boolean },
  sebelumnya: TitikDiperiksa | null,
  now: number,
): HasilPeriksaLokasi {
  const hasil: HasilPeriksaLokasi = {
    palsu: false,
    alasan: null,
    tanda: [],
    jarakLompatKm: null,
    identikBerturut: 1,
  };

  // 1. Perangkat melaporkan sendiri titiknya dari mock location.
  if (titik.mock === true) {
    hasil.palsu = true;
    hasil.alasan = PESAN_MOCK;
    return hasil;
  }

  // 2. Akurasi di bawah kemampuan sensor GPS konsumen.
  if (titik.akurasi < LOKASI_KEBIJAKAN.akurasiTerlaluSempurnaMeter) {
    hasil.palsu = true;
    hasil.alasan = PESAN_AKURASI_SEMPURNA;
    return hasil;
  }

  if (sebelumnya === null) return hasil;

  const jedaDetik = (now - sebelumnya.waktu) / 1000;
  hasil.jarakLompatKm = jarakKm(sebelumnya, titik);

  // 3. Lompatan mustahil — HANYA bila dua titik berdekatan waktu. Setelah jeda
  //    panjang, kecepatan rata-rata tidak lagi bermakna (perjalanan luar kota,
  //    ponsel mati beberapa jam), sehingga tanpa batas jendela nasabah yang
  //    bergerak jauh akan ditolak berjam-jam.
  if (jedaDetik <= LOKASI_KEBIJAKAN.jendelaKecepatanDetik) {
    const kecepatan = kecepatanKmJam(sebelumnya, { lat: titik.lat, lng: titik.lng, waktu: now });
    if (kecepatan > LOKASI_KEBIJAKAN.kecepatanMaksKmJam) {
      hasil.palsu = true;
      hasil.alasan = PESAN_LOMPATAN;
      return hasil;
    }
  }

  // 4. Koordinat persis sama berulang-ulang dengan akurasi yang diklaim bagus.
  const identik = sebelumnya.lat === titik.lat && sebelumnya.lng === titik.lng;
  if (identik) {
    hasil.identikBerturut = (sebelumnya.identikBerturut ?? 1) + 1;
    const akurasiBagus =
      titik.akurasi <= LOKASI_KEBIJAKAN.identikAkurasiMaksMeter &&
      sebelumnya.akurasi <= LOKASI_KEBIJAKAN.identikAkurasiMaksMeter;
    if (akurasiBagus && hasil.identikBerturut >= LOKASI_KEBIJAKAN.identikBerturutMaks) {
      hasil.tanda.push(TANDA_LOKASI_PALSU.koordinatIdentik);
    }
  }

  return hasil;
}

/** Label manusiawi untuk tanda kecurigaan (dipakai panel admin). */
export function labelTandaLokasi(tanda: string): string {
  switch (tanda) {
    case TANDA_LOKASI_PALSU.mockDilaporkan:
      return "Perangkat melaporkan mock location";
    case TANDA_LOKASI_PALSU.akurasiTidakWajar:
      return "Akurasi GPS tidak wajar";
    case TANDA_LOKASI_PALSU.koordinatIdentik:
      return "Koordinat beku berulang";
    default:
      return tanda;
  }
}

/**
 * Jeda minimum antar peringatan lokasi dicurigai untuk satu nasabah (jam).
 *
 * Koordinat yang dibekukan akan ditandai di SETIAP heartbeat, jadi tanpa jeda
 * ini nasabah akan menerima puluhan pesan peringatan dalam sejam — dan
 * peringatan yang terlalu sering justru diabaikan.
 */
export const LOKASI_PERINGATAN_JEDA_JAM = 24;

/** Sudah boleh kirim peringatan lagi? (`peringatanTerakhir` epoch ms/null). */
export function bolehKirimPeringatanLokasi(
  peringatanTerakhir: number | null,
  sekarang: number,
  jedaJam: number = LOKASI_PERINGATAN_JEDA_JAM,
): boolean {
  if (peringatanTerakhir === null) return true;
  return sekarang - peringatanTerakhir >= jedaJam * 3_600_000;
}

/**
 * Apakah pesan galat dari server berarti lokasi perangkat palsu?
 *
 * Dipakai UI untuk menampilkan instruksi yang tepat (matikan aplikasi lokasi
 * palsu) alih-alih "nyalakan GPS" — dua masalah itu terlihat sama dari sisi
 * nasabah: titik lokasi tidak mengalir. Pola di sini HARUS sejalan dengan
 * pesan di `periksaLokasiPalsu`; keduanya ada di berkas yang sama supaya tidak
 * menyimpang tanpa terlihat.
 */
export function pesanLokasiPalsu(pesan: string): boolean {
  return /lokasi palsu|melompat tidak wajar|tidak wajar \(di bawah 1 meter\)/i.test(pesan);
}

/** Keadaan gerbang lokasi yang dipakai `LocationGate`. */
export type IzinLokasi = "memeriksa" | "siap" | "ditolak" | "mati" | "palsu";

/**
 * Keadaan gerbang setelah perangkat melaporkan galat lokasi.
 *
 * Galat "posisi tidak tersedia" dan "timeout" lazim muncul tepat saat aplikasi
 * kembali dari latar — membuka galeri untuk memilih berkas, kamera, atau
 * berpindah aplikasi. Menutup gerbang pada galat semacam itu melepas formulir
 * yang sedang diisi, jadi gerbang yang SUDAH siap dibiarkan siap (`null`).
 * Penolakan izin tetap berlaku kapan pun: izin yang dicabut bukan gangguan
 * sementara, dan titik lokasi tidak akan pernah datang lagi.
 */
export function izinSetelahGalatLokasi(
  izinSekarang: IzinLokasi,
  ditolak: boolean,
): "ditolak" | "mati" | null {
  if (ditolak) return "ditolak";
  if (izinSekarang === "siap") return null;
  return "mati";
}

/**
 * Retensi jejak lokasi (`lokasiJejak`) — dijalankan cron harian di crons.ts.
 *
 * Titik lokasi adalah data pribadi: disimpan sesingkat mungkin (minimalisasi
 * UU PDP), tetapi titik yang masih menempel pada pinjaman berjalan ditahan
 * lebih lama karena berfungsi sebagai bukti audit bila terjadi sengketa.
 */
export const LOKASI_RETENSI = {
  /** Titik lokasi biasa disimpan selama ini (hari). */
  jejakHari: 90,
  /**
   * Titik yang terikat pinjaman BELUM selesai dipertahankan sampai batas ini
   * (hari). Skema bulanan terpanjang 6 bulan, jadi batas ini selalu menutupi
   * masa pinjaman berjalan.
   */
  buktiPinjamanHari: 400,
  /** Jumlah baris yang diperiksa per batch. */
  batchBaris: 200,
  /** Maksimum batch per jalannya cron (menjaga satu transaksi tetap ringan). */
  maksBatch: 5,
} as const;

const HARI_MS = 86_400_000;

/** Batas waktu (epoch ms): titik yang lebih tua dari ini sudah kedaluwarsa. */
export function batasRetensiMs(
  sekarang: number,
  hari: number = LOKASI_RETENSI.jejakHari,
): number {
  return sekarang - hari * HARI_MS;
}

/**
 * Titik lokasi boleh dihapus? Hanya titik yang lebih tua dari `jejakHari`,
 * kecuali titik milik pinjaman yang masih berjalan — itu ditahan sampai
 * `buktiPinjamanHari` supaya bukti audit tidak hilang saat masih diperlukan.
 */
export function titikBolehDihapus(
  titik: { waktu: number; pinjamanAktif: boolean },
  sekarang: number,
  jejakHari: number = LOKASI_RETENSI.jejakHari,
): boolean {
  const batas = batasRetensiMs(sekarang, jejakHari);
  // Belum kedaluwarsa — masih dipakai gerbang lokasi & pembacaan riwayat.
  if (titik.waktu >= batas) return false;
  if (titik.pinjamanAktif) {
    const batasBukti = batasRetensiMs(sekarang, LOKASI_RETENSI.buktiPinjamanHari);
    if (titik.waktu >= batasBukti) return false;
  }
  return true;
}

/** Bounding box Indonesia — titik di luar ini dianggap tidak sah. */
export const INDONESIA_BOUNDS = {
  latMin: -11.5,
  latMax: 6.5,
  lngMin: 94,
  lngMax: 141.5,
} as const;

/** Koordinat berada di wilayah Indonesia (termasuk laut teritorial). */
export function koordinatIndonesia(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= INDONESIA_BOUNDS.latMin &&
    lat <= INDONESIA_BOUNDS.latMax &&
    lng >= INDONESIA_BOUNDS.lngMin &&
    lng <= INDONESIA_BOUNDS.lngMax
  );
}

/**
 * Kecepatan rata-rata antar dua titik (km/jam). Dipakai server untuk menolak
 * lompatan mustahil — indikasi lokasi palsu atau perangkat di-root.
 */
export function kecepatanKmJam(
  a: { lat: number; lng: number; waktu: number },
  b: { lat: number; lng: number; waktu: number },
): number {
  const detik = Math.abs(b.waktu - a.waktu) / 1000;
  const km = jarakKm(a, b);
  if (detik < 1) return km > 1 ? Number.POSITIVE_INFINITY : 0;
  return (km / detik) * 3600;
}

/** Label umur titik lokasi untuk ditampilkan di UI. */
export function labelUmurLokasi(umurMenit: number): string {
  if (umurMenit <= 0) return "baru saja";
  if (umurMenit < 60) return `${umurMenit} menit lalu`;
  const jam = Math.floor(umurMenit / 60);
  return `${jam} jam lalu`;
}
