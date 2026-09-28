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
}

interface KapasitorLike {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, unknown>;
}

const KUNCI_DEVICE = "pindai.deviceId";

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
  return typeof (ls as Storage).getItem === "function" ? (ls as Storage) : null;
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
          onGalat(
            typeof galat === "string" ? galat : "Sinyal GPS tidak tersedia dari aplikasi.",
          );
          return;
        }
        onTitik({
          lat: posisi.latitude,
          lng: posisi.longitude,
          akurasi: posisi.accuracy,
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
