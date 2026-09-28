/**
 * Jembatan aplikasi native PINDAI.
 *
 * Web ini dirancang untuk dibungkus menjadi aplikasi Android/iOS (Capacitor).
 * Berkas ini adalah SATU-SATUNYA tempat aplikasi web "sadar" bahwa ia sedang
 * berjalan di dalam aplikasi native, dan sengaja tidak mengimpor paket apa pun:
 * Capability dideteksi dari global `window.Capacitor` yang disuntikkan runtime
 * native. Di browser biasa seluruh fungsi di sini menjadi no-op, sehingga
 * bundel web tetap utuh dan tidak bertambah berat.
 *
 * Yang didapat dari aplikasi native (dan tidak mungkin dari browser):
 *  - Pemantauan lokasi LATAR BELAKANG via foreground service (Android) /
 *    Background Modes (iOS), sehingga titik tetap mengalir walau layar terkunci.
 *  - ID perangkat stabil untuk pendaftaran (`api.lokasi.daftarkanPerangkat`),
 *    dasar kebijakan "wajib aplikasi" (`systemConfig.wajibAplikasiNative`).
 *
 * Rencana pembungkusan lengkap: `docs/aplikasi-native.md`.
 */

/** Lingkungan tempat bundel ini berjalan. */
export type LingkunganNative = "web" | "android" | "ios";

/** Titik GPS tunggal dalam bentuk netral (bukan milik plugin mana pun). */
export interface TitikLokasi {
  lat: number;
  lng: number;
  /** Akurasi dalam meter. */
  akurasi: number;
  /**
   * Perangkat melaporkan titik ini berasal dari mock location. Server menolak
   * titik seperti ini, jadi nilainya diteruskan apa adanya — lebih baik
   * nasabah melihat sebabnya daripada titiknya hilang tanpa penjelasan.
   */
  mock?: boolean;
}

/** Kontrak minimum plugin lokasi latar belakang Capacitor. */
interface PluginPelacakLatar {
  addWatcher: (
    opsi: Record<string, unknown>,
    balik: (posisi: PosisiPlugin | null, galat?: unknown) => void,
  ) => Promise<string>;
  removeWatcher: (opsi: { id: string }) => Promise<void>;
}

interface PosisiPlugin {
  latitude: number;
  longitude: number;
  accuracy: number;
  /**
   * Penanda mock location antar-plugin (namanya berbeda-beda):
   *  - `@capacitor-community/background-geolocation` meneruskan `mock`
   *    (`Location.isMock` Android / `isSimulatedBySoftware` iOS).
   *  - Plugin lama memakai `isFromMockProvider` (Android) atau `simulated`.
   */
  mock?: unknown;
  isFromMockProvider?: unknown;
  isMock?: unknown;
  simulated?: unknown;
}

interface KapasitorLike {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, unknown>;
}

const KUNCI_DEVICE = "pindai.deviceId";
const KUNCI_TOKEN_PERANGKAT = "pindai.tokenPerangkat";

/** Plugin yang didaftarkan manual lewat `pasangPluginLokasiLatar`. */
let pluginManual: PluginPelacakLatar | null = null;

/** Opsi watcher latar belakang — teks notifikasi wajib tampil di Android. */
export const PELACAKAN_LATAR_OPSI = {
  judulNotifikasi: "PINDAI memantau lokasi",
  pesanNotifikasi:
    "Lokasi aktif agar pengajuan, cicilan, dan pelunasan tetap dapat dilayani.",
  filterJarakMeter: 50,
} as const;

/** Objek `Capacitor` global, atau null bila berjalan di browser biasa. */
function kapasitor(root: unknown): KapasitorLike | null {
  if (typeof root !== "object" || root === null) return null;
  const kandidat = (root as { Capacitor?: unknown }).Capacitor;
  if (typeof kandidat !== "object" || kandidat === null) return null;
  return kandidat as KapasitorLike;
}

/** Plugin Capacitor berdasarkan nama, bila terpasang. */
function pluginKapasitor(root: unknown, nama: string): unknown {
  const kap = kapasitor(root);
  const plugins = kap?.Plugins;
  if (typeof plugins !== "object" || plugins === null) return null;
  return (plugins as Record<string, unknown>)[nama] ?? null;
}

/** Penyimpanan lokal (WebView native tetap punya localStorage). */
function penyimpanan(root: unknown): Storage | null {
  if (typeof root !== "object" || root === null) return null;
  const ls = (root as { localStorage?: unknown }).localStorage;
  if (typeof ls !== "object" || ls === null) return null;
  const kandidat = ls as Storage;
  if (typeof kandidat.getItem !== "function" || typeof kandidat.setItem !== "function") {
    return null;
  }
  return kandidat;
}

/**
 * Penyimpanan aman perangkat: Keychain (iOS) / EncryptedSharedPreferences
 * (Android) lewat plugin Capacitor.
 *
 * Token perangkat TIDAK disimpan di `localStorage`: nilai di sana bisa dibaca
 * skrip mana pun yang berjalan di WebView dan ikut tersalin ke cadangan
 * perangkat. `localStorage` hanya dipakai sebagai cadangan saat plugin belum
 * terpasang (mis. saat pengembangan di browser).
 */
interface PenyimpananAman {
  get: (kunci: string) => Promise<string | null>;
  set: (kunci: string, nilai: string) => Promise<void>;
  remove: (kunci: string) => Promise<void>;
}

interface PluginAmanObjek {
  get: (o: { key: string }) => Promise<{ value?: unknown } | null>;
  set: (o: { key: string; value: string }) => Promise<unknown>;
  remove: (o: { key: string }) => Promise<unknown>;
}

interface PluginAmanPosisi {
  get: (kunci: string) => Promise<unknown>;
  set: (kunci: string, nilai: string) => Promise<unknown>;
  remove: (kunci: string) => Promise<unknown>;
}

function pluginAmanObjek(root: unknown, nama: string): PluginAmanObjek | null {
  const plugin = pluginKapasitor(root, nama) as Partial<PluginAmanObjek> | null;
  if (plugin === null) return null;
  if (typeof plugin.get !== "function") return null;
  if (typeof plugin.set !== "function") return null;
  if (typeof plugin.remove !== "function") return null;
  return plugin as PluginAmanObjek;
}

function pluginAmanPosisi(root: unknown): PluginAmanPosisi | null {
  const plugin = pluginKapasitor(root, "SecureStorage") as Partial<PluginAmanPosisi> | null;
  if (plugin === null) return null;
  if (typeof plugin.get !== "function") return null;
  if (typeof plugin.set !== "function") return null;
  if (typeof plugin.remove !== "function") return null;
  return plugin as PluginAmanPosisi;
}

function hapusCadangan(root: unknown): void {
  const simpan = penyimpanan(root);
  if (simpan !== null && typeof simpan.removeItem === "function") {
    simpan.removeItem(KUNCI_TOKEN_PERANGKAT);
  }
}

/**
 * Penyimpanan aman dari plugin Capacitor, bila terpasang.
 *
 * Dua bentuk API yang lazim dinormalkan di sini:
 *  - bentuk objek `{ key }` / `{ key, value }` — `capacitor-secure-storage-plugin`
 *    (plugin `SecureStoragePlugin`) dan Capawesome Secure Preferences;
 *  - bentuk posisi `get(key)` / `set(key, value)` —
 *    `@aparajita/capacitor-secure-storage` (plugin `SecureStorage`).
 *
 * Tidak ada paket yang diimpor: plugin ditemukan lewat `Capacitor.Plugins`,
 * sehingga bundel web tetap ringan dan pilihan plugin ditentukan saat aplikasi
 * native dibangun.
 */
export function penyimpananAman(root: unknown = globalThis): PenyimpananAman | null {
  for (const nama of ["SecureStoragePlugin", "SecurePreferences"]) {
    const plugin = pluginAmanObjek(root, nama);
    if (plugin === null) continue;
    return {
      get: async (kunci) => {
        const hasil = await plugin.get({ key: kunci });
        const nilai = hasil?.value;
        return typeof nilai === "string" && nilai !== "" ? nilai : null;
      },
      set: async (kunci, nilai) => {
        await plugin.set({ key: kunci, value: nilai });
      },
      remove: async (kunci) => {
        await plugin.remove({ key: kunci });
      },
    };
  }

  const posisional = pluginAmanPosisi(root);
  if (posisional !== null) {
    return {
      get: async (kunci) => {
        const nilai = await posisional.get(kunci);
        return typeof nilai === "string" && nilai !== "" ? nilai : null;
      },
      set: async (kunci, nilai) => {
        await posisional.set(kunci, nilai);
      },
      remove: async (kunci) => {
        await posisional.remove(kunci);
      },
    };
  }
  return null;
}

/**
 * Muat token perangkat: penyimpanan aman lebih dulu, lalu migrasi satu kali
 * dari `localStorage` (cara penyimpanan versi lama) dan bersihkan sisa lama itu.
 */
export async function muatTokenPerangkat(root: unknown = globalThis): Promise<string | null> {
  const cadangan = penyimpanan(root)?.getItem(KUNCI_TOKEN_PERANGKAT) ?? null;
  const aman = penyimpananAman(root);
  if (aman === null) return cadangan === "" ? null : cadangan;
  try {
    const tersimpan = await aman.get(KUNCI_TOKEN_PERANGKAT);
    if (tersimpan !== null) {
      if (cadangan !== null) hapusCadangan(root);
      return tersimpan;
    }
    if (cadangan !== null && cadangan !== "") {
      await aman.set(KUNCI_TOKEN_PERANGKAT, cadangan);
      hapusCadangan(root);
      return cadangan;
    }
    return null;
  } catch {
    // Keychain terkunci atau kunci enkripsi Android sudah tidak berlaku:
    // jangan sampai kredensial hilang — pakai cadangan apa adanya.
    return cadangan === "" ? null : cadangan;
  }
}

/**
 * Simpan token perangkat (penyimpanan aman bila ada, `localStorage` bila tidak).
 *
 * Bila penyimpanan aman menolak (mis. layar perangkat terkunci), token sengaja
 * TIDAK ditulis ke `localStorage`: cadangan tak terenkripsi justru menghapus
 * manfaat penyimpanan aman, dan token bisa didaftarkan ulang bila hilang.
 */
export async function simpanTokenPerangkat(
  token: string | null,
  root: unknown = globalThis,
): Promise<void> {
  const nilai = token === null || token === "" ? null : token;
  const aman = penyimpananAman(root);
  if (aman === null) {
    const simpan = penyimpanan(root);
    if (simpan === null) return;
    try {
      if (nilai === null) hapusCadangan(root);
      else simpan.setItem(KUNCI_TOKEN_PERANGKAT, nilai);
    } catch {
      // Kuota localStorage habis (mode privat). Konteks pemanggil tidak boleh
      // gagal hanya karena pencadangan token tidak berhasil.
    }
    return;
  }
  try {
    if (nilai === null) await aman.remove(KUNCI_TOKEN_PERANGKAT);
    else await aman.set(KUNCI_TOKEN_PERANGKAT, nilai);
  } catch {
    return;
  }
  hapusCadangan(root);
}

/**
 * URL endpoint heartbeat HTTP.
 *
 * HTTP action Convex hidup di domain `.convex.site`, sedangkan klien WebSocket
 * memakai `.convex.cloud`. Karena itu URL diturunkan bila domain situs tidak
 * disediakan lewat env.
 */
export function urlHeartbeatLokasi(
  urlConvex: string | undefined,
  urlSitus?: string | undefined,
): string | null {
  const dasar = (urlSitus && urlSitus !== "" ? urlSitus : urlConvex ?? "").trim();
  if (dasar === "") return null;
  const situs = dasar.replace(/\/+$/, "").replace(/\.convex\.cloud$/, ".convex.site");
  return `${situs}/lokasi/heartbeat`;
}

/** Lingkungan saat ini: `web` di browser, `android`/`ios` di dalam aplikasi. */
export function lingkunganNative(root: unknown = globalThis): LingkunganNative {
  const kap = kapasitor(root);
  if (kap === null) return "web";
  if (typeof kap.isNativePlatform === "function" && !kap.isNativePlatform()) return "web";
  const platform = typeof kap.getPlatform === "function" ? kap.getPlatform() : "";
  if (platform === "android") return "android";
  if (platform === "ios") return "ios";
  return "web";
}

/** True bila halaman dibuka dari aplikasi native terpasang. */
export function diAplikasiNative(root: unknown = globalThis): boolean {
  return lingkunganNative(root) !== "web";
}

/** String platform yang dikirim ke server (`sumber` memakai "web"/"aplikasi"). */
export function kodePlatform(root: unknown = globalThis): string {
  return lingkunganNative(root);
}

/**
 * ID perangkat stabil untuk `daftarkanPerangkat`.
 * Hanya ada di aplikasi native — di browser mengembalikan null, karena
 * identitas perangkat web tidak bisa dipercaya (selalu bisa dihapus).
 */
export function idPerangkat(root: unknown = globalThis): string | null {
  if (!diAplikasiNative(root)) return null;
  const simpan = penyimpanan(root);
  const lama = simpan?.getItem(KUNCI_DEVICE) ?? null;
  if (lama !== null && lama.length >= 6) return lama;
  const baru = idAcak(root);
  simpan?.setItem(KUNCI_DEVICE, baru);
  return baru;
}

function idAcak(root: unknown): string {
  const c = (root as { crypto?: { randomUUID?: unknown } } | null)?.crypto;
  if (c && typeof c.randomUUID === "function") return (c.randomUUID as () => string)();
  const acak = () => Math.random().toString(36).slice(2, 10);
  return `dev-${acak()}${acak()}`;
}

/** Versi aplikasi dari plugin App Capacitor (null di web / bila gagal). */
export async function versiAplikasi(root: unknown = globalThis): Promise<string | null> {
  const plugin = pluginKapasitor(root, "App") as { getInfo?: () => Promise<unknown> } | null;
  if (plugin === null || typeof plugin.getInfo !== "function") return null;
  try {
    const info = (await plugin.getInfo()) as { version?: unknown; build?: unknown } | null;
    const versi = typeof info?.version === "string" ? info.version : "";
    if (versi === "") return null;
    const build = typeof info?.build === "string" ? info.build : "";
    return build === "" ? versi : `${versi} (${build})`;
  } catch {
    return null;
  }
}

/** Cek bentuk minimum plugin lokasi latar belakang. */
function pluginValid(plugin: unknown): boolean {
  if (typeof plugin !== "object" || plugin === null) return false;
  const kandidat = plugin as PluginPelacakLatar;
  return (
    typeof kandidat.addWatcher === "function" && typeof kandidat.removeWatcher === "function"
  );
}

/**
 * Daftarkan plugin lokasi latar belakang secara eksplisit.
 *
 * Jalur normal: Capacitor menyuntikkan `window.Capacitor.Plugins`, sehingga
 * jembatan ini menemukan plugin sendiri. Fungsi ini adalah jaring pengaman
 * untuk versi Capacitor yang tidak lagi mengekspos `Plugins` — di entry native
 * cukup panggil:
 *   `pasangPluginLokasiLatar(registerPlugin("BackgroundGeolocation"))`.
 */
export function pasangPluginLokasiLatar(plugin: unknown): void {
  pluginManual = pluginValid(plugin) ? (plugin as PluginPelacakLatar) : null;
}

/** Plugin lokasi latar belakang, bila aplikasi native sudah memasangnya. */
export function pluginLokasiLatar(root: unknown = globalThis): PluginPelacakLatar | null {
  if (pluginManual !== null) return pluginManual;
  for (const nama of ["BackgroundGeolocation", "BackgroundGeolocationPlugin"]) {
    const plugin = pluginKapasitor(root, nama);
    if (pluginValid(plugin)) return plugin as PluginPelacakLatar;
  }
  return null;
}

/** Pemantauan latar belakang yang sedang berjalan. */
export interface PelacakanLatar {
  watcherId: string;
  hentikan: () => Promise<void>;
}

/**
 * Pesan galat dari plugin lokasi.
 * Plugin mengirim objek `{ code, message }` (mis. `NOT_AUTHORIZED`), bukan
 * string. Kode izin HARUS ikut terbaca agar UI bisa membedakan "izin ditolak"
 * dari "GPS mati" — dua masalah dengan instruksi perbaikan yang berbeda.
 */
export function pesanGalatLokasi(galat: unknown): string {
  if (typeof galat === "string" && galat !== "") return galat;
  if (typeof galat === "object" && galat !== null) {
    const g = galat as { message?: unknown; code?: unknown };
    if (typeof g.message === "string" && g.message !== "") return g.message;
    if (typeof g.code === "string" && g.code !== "") return g.code;
  }
  return "Sinyal GPS tidak tersedia dari aplikasi.";
}

/** Hasil satu percobaan kirim titik lewat HTTP. */
export interface HasilHeartbeat {
  ok: boolean;
  /** Status HTTP, atau null bila permintaan tidak sampai. */
  status: number | null;
  /** Pesan siap tampil, atau null bila tidak ada. */
  pesan: string | null;
}

function pesanDariData(data: unknown): string | null {
  if (typeof data === "object" && data !== null) {
    const pesan = (data as { error?: unknown }).error;
    if (typeof pesan === "string" && pesan !== "") return pesan;
  }
  return null;
}

function hasilDari(status: number, pesanServer: string | null): HasilHeartbeat {
  if (status >= 200 && status < 300) return { ok: true, status, pesan: null };
  if (status === 401) {
    return {
      ok: false,
      status,
      pesan: "Token perangkat tidak dikenal. Buka aplikasi PINDAI sekali lagi.",
    };
  }
  return { ok: false, status, pesan: pesanServer };
}

/**
 * Kirim satu titik lewat HTTP native (`CapacitorHttp`), bukan lewat WebView.
 *
 * Inilah yang membuat lokasi tetap mengalir saat aplikasi di latar belakang:
 * Android membatasi permintaan jaringan yang berasal dari WebView setelah
 * ±5 menit, sedangkan `CapacitorHttp` dikirim oleh lapisan native sehingga
 * tidak terkena pembatasan itu. Jalur ini juga tidak butuh sesi Convex Auth —
 * perangkat dikenali dari token perangkat.
 *
 * Pemanggil WAJIB punya fallback (mis. `lokasi.catatLokasi`) bila hasilnya
 * tidak `ok`, supaya titik lokasi tidak pernah hilang begitu saja.
 */
export async function kirimHeartbeatLatar(
  url: string,
  token: string,
  titik: TitikLokasi,
  opsi: { platform?: string; versiApp?: string | null } = {},
  root: unknown = globalThis,
): Promise<HasilHeartbeat> {
  const isi: Record<string, unknown> = {
    lat: titik.lat,
    lng: titik.lng,
    akurasi: titik.akurasi,
    platform: opsi.platform,
    versiApp: opsi.versiApp ?? undefined,
  };
  // Field hanya dikirim saat benar-benar mock: body tetap bersih untuk titik
  // normal, dan server tidak perlu menebak nilai `undefined`.
  if (titik.mock === true) isi.mock = true;
  const header = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const kapasitorHttp = pluginKapasitor(root, "CapacitorHttp") as {
    post?: (o: unknown) => Promise<{ status: number; data?: unknown }>;
  } | null;

  try {
    if (kapasitorHttp !== null && typeof kapasitorHttp.post === "function") {
      const res = await kapasitorHttp.post({
        url,
        headers: header,
        data: isi,
        connectTimeout: 15_000,
        readTimeout: 15_000,
      });
      return hasilDari(res.status, pesanDariData(res.data));
    }

    const fetchFn = (root as { fetch?: unknown } | null)?.fetch;
    if (typeof fetchFn !== "function") {
      return { ok: false, status: null, pesan: "Pengiriman HTTP tidak tersedia di perangkat ini." };
    }
    const res = await (fetchFn as typeof fetch)(url, {
      method: "POST",
      headers: header,
      body: JSON.stringify(isi),
    });
    let pesan: string | null = null;
    try {
      pesan = pesanDariData(await res.json());
    } catch {
      pesan = null;
    }
    return hasilDari(res.status, pesan);
  } catch (err) {
    return {
      ok: false,
      status: null,
      pesan: err instanceof Error ? err.message : "Gagal mengirim titik lokasi lewat HTTP.",
    };
  }
}

// ===== Layanan lokasi PINDAI (foreground service Android / Background Modes iOS) =====

/**
 * Kontrak plugin native PINDAI — sumbernya ada di `native/pindai-location/`.
 * Plugin ini yang memegang lokasi dan mengirim heartbeat SENDIRI, tanpa WebView.
 */
export interface LayananLokasi {
  mulai: (opsi: {
    url: string;
    token: string;
    intervalDetik?: number;
    jarakMeter?: number;
  }) => Promise<{ aktif?: unknown }>;
  hentikan: () => Promise<unknown>;
  status?: () => Promise<{ aktif?: unknown; jumlahTerkirim?: unknown; galatTerakhir?: unknown }>;
  bukaSetelan?: () => Promise<unknown>;
}

/** Plugin layanan lokasi PINDAI, bila ikut dibangun di aplikasi native. */
export function pluginLayananLokasi(root: unknown = globalThis): LayananLokasi | null {
  const plugin = pluginKapasitor(root, "PindaiLocation") as Partial<LayananLokasi> | null;
  if (plugin === null) return null;
  if (typeof plugin.mulai !== "function") return null;
  if (typeof plugin.hentikan !== "function") return null;
  return plugin as LayananLokasi;
}

/**
 * Nyalakan layanan lokasi + heartbeat native.
 *
 * Setelah ini menyala, titik lokasi TIDAK lagi dikirim dari WebView: layanan
 * inilah yang memegang GPS dan mem-POST ke `POST /lokasi/heartbeat`. Itulah
 * bedanya dengan jalur `CapacitorHttp` — layanan tetap berjalan walau WebView
 * di-pause Android.
 *
 * `{ aktif: false }` berarti pemanggil harus memakai jalur cadangan di dalam
 * aplikasi (plugin lokasi biasa + `lokasi.catatLokasi`).
 */
export async function mulaiLayananLokasi(
  plugin: LayananLokasi,
  opsi: { url: string; token: string; intervalDetik?: number; jarakMeter?: number },
): Promise<{ aktif: boolean; pesan: string | null }> {
  try {
    const hasil = await plugin.mulai(opsi);
    return { aktif: hasil?.aktif === true, pesan: null };
  } catch (err) {
    return {
      aktif: false,
      pesan: err instanceof Error ? err.message : "Layanan lokasi native gagal dinyalakan.",
    };
  }
}

/** Hentikan layanan lokasi native — mengabaikan galat bila sudah berhenti. */
export async function hentikanLayananLokasi(plugin: LayananLokasi): Promise<void> {
  try {
    await plugin.hentikan();
  } catch {
    // Layanan mungkin sudah berhenti sendiri (izin dicabut / proses dihentikan).
  }
}

/**
 * Buka halaman Setelan aplikasi (Android/iOS).
 *
 * Dibutuhkan karena ada kondisi di mana mengulang dari aplikasi TIDAK akan
 * pernah berhasil: di iOS, memilih "Izinkan Sekali" membuat Core Location
 * mengabaikan permintaan "Selalu" berikutnya, dan izinnya kembali menjadi
 * *Not Determined*. Satu-satunya jalan keluar adalah Setelan.
 */
export async function bukaSetelanAplikasi(plugin: LayananLokasi): Promise<boolean> {
  if (typeof plugin.bukaSetelan !== "function") return false;
  try {
    await plugin.bukaSetelan();
    return true;
  } catch {
    return false;
  }
}

/**
 * Apakah plugin melaporkan titik ini dari mock location?
 *
 * Nama fieldnya berbeda antar-plugin, jadi semuanya diperiksa — nilai yang
 * tidak dikenali dianggap `false` (bukan tuduhan palsu ke perangkat).
 */
export function lokasiDariMock(posisi: {
  mock?: unknown;
  isFromMockProvider?: unknown;
  isMock?: unknown;
  simulated?: unknown;
}): boolean {
  return (
    posisi.mock === true ||
    posisi.isFromMockProvider === true ||
    posisi.isMock === true ||
    posisi.simulated === true
  );
}

/**
 * Mulai pemantauan lokasi latar belakang di aplikasi native.
 * Mengembalikan null di browser ATAU bila plugin belum terpasang — pemanggil
 * harus punya fallback ke `navigator.geolocation`, bukan menganggap gagal total.
 */
export async function mulaiPelacakanLatar(
  onTitik: (titik: TitikLokasi) => void,
  onGalat: (pesan: string) => void,
  root: unknown = globalThis,
): Promise<PelacakanLatar | null> {
  const plugin = pluginLokasiLatar(root);
  if (plugin === null) return null;
  try {
    const watcherId = await plugin.addWatcher(
      {
        backgroundMessage: PELACAKAN_LATAR_OPSI.pesanNotifikasi,
        backgroundTitle: PELACAKAN_LATAR_OPSI.judulNotifikasi,
        requestPermissions: true,
        stale: false,
        distanceFilter: PELACAKAN_LATAR_OPSI.filterJarakMeter,
      },
      (posisi, galat) => {
        if (galat !== undefined || posisi === null) {
          onGalat(pesanGalatLokasi(galat));
          return;
        }
        onTitik({
          lat: posisi.latitude,
          lng: posisi.longitude,
          akurasi: posisi.accuracy,
          mock: lokasiDariMock(posisi),
        });
      },
    );
    return {
      watcherId,
      hentikan: async () => {
        await plugin.removeWatcher({ id: watcherId });
      },
    };
  } catch (err) {
    onGalat(
      err instanceof Error ? err.message : "Gagal memulai pemantauan lokasi latar belakang.",
    );
    return null;
  }
}
