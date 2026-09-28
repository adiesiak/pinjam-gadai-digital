/**
 * Uji jembatan aplikasi native: deteksi lingkungan, ID perangkat, dan
 * pemantauan lokasi latar belakang. Semua diuji lewat `root` yang disuntik
 * (objek mirip `window`), jadi tidak butuh aplikasi native sungguhan.
 */
import {
  bukaSetelanAplikasi,
  diAplikasiNative,
  idPerangkat,
  kirimHeartbeatLatar,
  kodePlatform,
  lingkunganNative,
  mulaiPelacakanLatar,
  muatTokenPerangkat,
  pasangPluginLokasiLatar,
  PELACAKAN_LATAR_OPSI,
  pesanGalatLokasi,
  hentikanLayananLokasi,
  mulaiLayananLokasi,
  pluginLayananLokasi,
  pluginLokasiLatar,
  penyimpananAman,
  simpanTokenPerangkat,
  urlHeartbeatLokasi,
  versiAplikasi,
  type TitikLokasi,
} from "./native";

let passed = 0;
let failed = 0;

function eq(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`✗ ${label}: diharapkan ${String(expected)}, dapat ${String(actual)}`);
  }
}

function ok(label: string, kondisi: boolean): void {
  eq(label, kondisi, true);
}

/** Penyimpanan lokal tiruan — cukup untuk `getItem`/`setItem`/`removeItem`. */
function buatPenyimpanan(): { isi: Map<string, string>; api: unknown } {
  const isi = new Map<string, string>();
  return {
    isi,
    api: {
      getItem: (k: string) => isi.get(k) ?? null,
      setItem: (k: string, v: string) => void isi.set(k, v),
      removeItem: (k: string) => void isi.delete(k),
    },
  };
}

/** Penyimpanan aman tiruan bentuk objek ({ key } / { key, value }). */
function buatPluginAmanObjek(opts: { gagalGet?: boolean; gagalSet?: boolean } = {}): {
  isi: Map<string, string>;
  api: unknown;
} {
  const isi = new Map<string, string>();
  return {
    isi,
    api: {
      get: async (o: { key: string }) => {
        if (opts.gagalGet) throw new Error("keychain terkunci");
        return { value: isi.get(o.key) ?? null };
      },
      set: async (o: { key: string; value: string }) => {
        if (opts.gagalSet) throw new Error("penyimpanan aman menolak");
        isi.set(o.key, o.value);
      },
      remove: async (o: { key: string }) => {
        isi.delete(o.key);
      },
    },
  };
}

/** Penyimpanan aman tiruan bentuk posisi (get(key) / set(key, value)). */
function buatPluginAmanPosisi(): { isi: Map<string, string>; api: unknown } {
  const isi = new Map<string, string>();
  return {
    isi,
    api: {
      get: async (kunci: string) => isi.get(kunci) ?? null,
      set: async (kunci: string, nilai: string) => {
        isi.set(kunci, nilai);
      },
      remove: async (kunci: string) => {
        isi.delete(kunci);
      },
    },
  };
}

const KUNCI_TOKEN = "pindai.tokenPerangkat";

/** Root tiruan: browser biasa, aplikasi native, atau Capacitor web. */
function buatRoot(opts: {
  platform?: string;
  native?: boolean;
  plugins?: Record<string, unknown>;
  penyimpanan?: unknown;
  versiUuid?: boolean;
}): unknown {
  return {
    Capacitor:
      opts.platform === undefined
        ? undefined
        : {
            getPlatform: () => opts.platform,
            isNativePlatform: () => opts.native ?? true,
            Plugins: opts.plugins ?? {},
          },
    localStorage: opts.penyimpanan,
    crypto:
      opts.versiUuid === false
        ? {}
        : { randomUUID: (() => {
            let n = 0;
            return () => `uuid-${(n += 1)}-xxxxxxxx`;
          })() },
  };
}

// ===== Deteksi lingkungan =====
eq("root kosong → web", lingkunganNative({}), "web");
eq("Capacitor web → web", lingkunganNative(buatRoot({ platform: "web", native: false })), "web");
eq("android → android", lingkunganNative(buatRoot({ platform: "android" })), "android");
eq("ios → ios", lingkunganNative(buatRoot({ platform: "ios" })), "ios");
eq(
  "platform tidak dikenal → web",
  lingkunganNative(buatRoot({ platform: "electron" })),
  "web",
);
eq("kodePlatform sejalan dengan deteksi", kodePlatform(buatRoot({ platform: "android" })), "android");
ok("diAplikasiNative true di android", diAplikasiNative(buatRoot({ platform: "android" })));
ok("diAplikasiNative false di browser", !diAplikasiNative(buatRoot({ platform: "web", native: false })));

// ===== ID perangkat =====
eq("browser tidak punya ID perangkat", idPerangkat(buatRoot({ penyimpanan: buatPenyimpanan().api })), null);
{
  const store = buatPenyimpanan();
  const root = buatRoot({ platform: "android", penyimpanan: store.api });
  const pertama = idPerangkat(root);
  const kedua = idPerangkat(root);
  ok("ID perangkat native terisi", typeof pertama === "string" && pertama.length >= 6);
  eq("ID perangkat stabil antar panggilan", pertama, kedua);
  eq("ID perangkat tersimpan di localStorage", store.isi.get("pindai.deviceId"), pertama);
}
{
  const store = buatPenyimpanan();
  store.isi.set("pindai.deviceId", "device-lama-123");
  eq(
    "ID perangkat memakai nilai tersimpan",
    idPerangkat(buatRoot({ platform: "ios", penyimpanan: store.api })),
    "device-lama-123",
  );
}
{
  // Tanpa crypto.randomUUID → tetap menghasilkan ID yang cukup panjang.
  const store = buatPenyimpanan();
  const id = idPerangkat(
    buatRoot({ platform: "android", penyimpanan: store.api, versiUuid: false }),
  );
  ok("ID perangkat tetap dibuat tanpa crypto.randomUUID", (id ?? "").length >= 6);
}
eq(
  "ID perangkat native tetap ada tanpa localStorage",
  typeof idPerangkat(buatRoot({ platform: "android" })) === "string",
  true,
);

// ===== Versi aplikasi =====
eq("versi tanpa plugin App → null", await versiAplikasi(buatRoot({ platform: "android" })), null);
{
  const root = buatRoot({
    platform: "android",
    plugins: { App: { getInfo: async () => ({ version: "1.4.0", build: "42" }) } },
  });
  eq("versi + build digabung", await versiAplikasi(root), "1.4.0 (42)");
}
{
  const root = buatRoot({
    platform: "ios",
    plugins: { App: { getInfo: async () => ({ version: "2.0.0" }) } },
  });
  eq("versi tanpa build", await versiAplikasi(root), "2.0.0");
}
{
  const root = buatRoot({
    platform: "android",
    plugins: {
      App: {
        getInfo: async () => {
          throw new Error("plugin mati");
        },
      },
    },
  });
  eq("getInfo gagal → null, bukan melempar", await versiAplikasi(root), null);
}

// ===== Deteksi plugin lokasi latar =====
eq("browser tanpa plugin → null", pluginLokasiLatar(buatRoot({ platform: "web", native: false })), null);
eq(
  "plugin tanpa addWatcher diabaikan",
  pluginLokasiLatar(buatRoot({ platform: "android", plugins: { BackgroundGeolocation: {} } })),
  null,
);
eq(
  "plugin tanpa removeWatcher diabaikan",
  pluginLokasiLatar(
    buatRoot({ platform: "android", plugins: { BackgroundGeolocation: { addWatcher: () => {} } } }),
  ),
  null,
);
{
  const plugin = { addWatcher: async () => "w1", removeWatcher: async () => {} };
  ok(
    "plugin valid terdeteksi",
    pluginLokasiLatar(
      buatRoot({ platform: "android", plugins: { BackgroundGeolocation: plugin } }),
    ) === plugin,
  );
}
{
  const plugin = { addWatcher: async () => "w1", removeWatcher: async () => {} };
  ok(
    "nama plugin alternatif juga diterima",
    pluginLokasiLatar(
      buatRoot({ platform: "ios", plugins: { BackgroundGeolocationPlugin: plugin } }),
    ) === plugin,
  );
}

// ===== Pesan galat plugin =====
eq("galat string dipakai apa adanya", pesanGalatLokasi("GPS mati"), "GPS mati");
eq("string kosong diabaikan", pesanGalatLokasi("").length > 0, true);
eq(
  "objek memakai message",
  pesanGalatLokasi({ code: "NOT_AUTHORIZED", message: "izin ditolak" }),
  "izin ditolak",
);
eq("objek tanpa message memakai code", pesanGalatLokasi({ code: "NOT_AUTHORIZED" }), "NOT_AUTHORIZED");
eq("objek kosong diberi teks bawaan", pesanGalatLokasi({}).length > 0, true);
eq("null diberi teks bawaan", pesanGalatLokasi(null).length > 0, true);

// ===== Pemantauan latar belakang =====
const titik: TitikLokasi[] = [];
const galat: string[] = [];

eq(
  "browser → null (pemanggil fallback ke navigator.geolocation)",
  await mulaiPelacakanLatar(
    (t) => titik.push(t),
    (g) => galat.push(g),
    buatRoot({ platform: "web", native: false }),
  ),
  null,
);

{
  // Plugin tiruan yang memanggil balik: satu titik sah, lalu dua galat.
  const opsiDiterima: Record<string, unknown>[] = [];
  const terimaBalik: { balik: (p: unknown, g?: unknown) => void }[] = [];
  const dihapus: string[] = [];
  const plugin = {
    addWatcher: async (opsi: Record<string, unknown>, cb: (p: unknown, g?: unknown) => void) => {
      opsiDiterima.push(opsi);
      terimaBalik.push({ balik: cb });
      return "w1";
    },
    removeWatcher: async ({ id }: { id: string }) => {
      dihapus.push(id);
    },
  };
  const hasil = await mulaiPelacakanLatar(
    (t) => titik.push(t),
    (g) => galat.push(g),
    buatRoot({ platform: "android", plugins: { BackgroundGeolocation: plugin } }),
  );

  if (hasil === null) {
    failed += 1;
    console.error("✗ pemantauan latar belakang seharusnya mengembalikan handle watcher");
  } else {
    passed += 1;
    eq("watcherId diteruskan", hasil.watcherId, "w1");
    eq("jumlah addWatcher", opsiDiterima.length, 1);
    eq(
      "notifikasi latar belakang diisi (wajib di Android)",
      opsiDiterima[0].backgroundMessage,
      PELACAKAN_LATAR_OPSI.pesanNotifikasi,
    );
    eq(
      "judul notifikasi diisi",
      opsiDiterima[0].backgroundTitle,
      PELACAKAN_LATAR_OPSI.judulNotifikasi,
    );
    eq("izin diminta ke sistem", opsiDiterima[0].requestPermissions, true);
    eq("titik basi tidak dipakai", opsiDiterima[0].stale, false);
    eq(
      "filter jarak diterapkan",
      opsiDiterima[0].distanceFilter,
      PELACAKAN_LATAR_OPSI.filterJarakMeter,
    );

    const sebelum = titik.length;
    terimaBalik[0].balik({ latitude: -6.2, longitude: 106.816666, accuracy: 12.5 });
    eq("titik dari plugin diteruskan", titik.length, sebelum + 1);
    eq("lintang diteruskan", titik[titik.length - 1].lat, -6.2);
    eq("akurasi diteruskan", titik[titik.length - 1].akurasi, 12.5);

    const galatSebelum = galat.length;
    terimaBalik[0].balik(null, "izin lokasi ditolak");
    eq("galat string diteruskan", galat[galat.length - 1], "izin lokasi ditolak");
    eq("titik tidak ditambah saat galat", titik.length, sebelum + 1);

    // Plugin mengirim objek { code, message }, bukan string — kode izin harus
    // ikut terbaca agar UI bisa membedakan "izin ditolak" dari "GPS mati".
    terimaBalik[0].balik(null, { code: "NOT_AUTHORIZED", message: "izin belum diberikan" });
    eq("galat objek memakai message", galat[galat.length - 1], "izin belum diberikan");
    terimaBalik[0].balik(null, { code: "NOT_AUTHORIZED" });
    eq("galat objek tanpa message memakai code", galat[galat.length - 1], "NOT_AUTHORIZED");

    terimaBalik[0].balik(null, undefined);
    eq("galat tanpa pesan diberi teks bawaan", galat.length, galatSebelum + 4);
    ok("teks galat bawaan tidak kosong", (galat[galat.length - 1] ?? "").length > 0);

    await hasil.hentikan();
    eq("hentikan memanggil removeWatcher dengan id benar", dihapus[0], "w1");
  }
}

{
  let pesanGalat: string | null = null;
  const plugin = {
    addWatcher: async () => {
      throw new Error("layanan latar belakang tidak tersedia");
    },
    removeWatcher: async () => {},
  };
  const hasil = await mulaiPelacakanLatar(
    () => {},
    (g) => {
      pesanGalat = g;
    },
    buatRoot({ platform: "ios", plugins: { BackgroundGeolocation: plugin } }),
  );
  eq("addWatcher gagal → null agar fallback jalan", hasil, null);
  eq("penyebab kegagalan dilaporkan", pesanGalat, "layanan latar belakang tidak tersedia");
}

// ===== Pendaftaran plugin manual (jaring pengaman versi Capacitor baru) =====
{
  const plugin = { addWatcher: async () => "w9", removeWatcher: async () => {} };
  pasangPluginLokasiLatar(plugin);
  ok(
    "plugin manual dikenali tanpa Capacitor.Plugins",
    pluginLokasiLatar(buatRoot({ platform: "android" })) === plugin,
  );
  ok(
    "plugin manual menang atas plugin global",
    pluginLokasiLatar(
      buatRoot({
        platform: "android",
        plugins: {
          BackgroundGeolocation: { addWatcher: async () => "lain", removeWatcher: async () => {} },
        },
      }),
    ) === plugin,
  );
  eq(
    "pemantauan jalan lewat plugin manual bahkan tanpa Capacitor global",
    (await mulaiPelacakanLatar(() => {}, () => {}, {}))?.watcherId,
    "w9",
  );
}
{
  pasangPluginLokasiLatar({ addWatcher: () => {} });
  eq(
    "plugin manual tanpa removeWatcher diabaikan",
    pluginLokasiLatar(buatRoot({ platform: "android" })),
    null,
  );
}
pasangPluginLokasiLatar(null);
eq("plugin manual bisa direset", pluginLokasiLatar(buatRoot({ platform: "android" })), null);

// ===== Token perangkat: penyimpanan aman (Keychain / EncryptedSharedPreferences) =====
eq("tanpa plugin → tidak ada penyimpanan aman", penyimpananAman(buatRoot({ platform: "android" })), null);
eq("plugin tanpa remove diabaikan", penyimpananAman(
  buatRoot({
    platform: "android",
    plugins: { SecureStoragePlugin: { get: async () => null, set: async () => undefined } },
  }),
), null);
{
  // Cadangan: plugin belum terpasang → localStorage (pengembangan di browser).
  const store = buatPenyimpanan();
  const root = buatRoot({ platform: "android", penyimpanan: store.api });
  eq("token kosong di awal", await muatTokenPerangkat(root), null);
  await simpanTokenPerangkat("token-cadangan-1", root);
  eq("tersimpan di localStorage", store.isi.get(KUNCI_TOKEN), "token-cadangan-1");
  eq("terbaca kembali", await muatTokenPerangkat(root), "token-cadangan-1");
  await simpanTokenPerangkat(null, root);
  eq("bisa dihapus", await muatTokenPerangkat(root), null);
}
{
  // Plugin terpasang: token masuk Keychain/EncryptedSharedPreferences.
  const store = buatPenyimpanan();
  const plugin = buatPluginAmanObjek();
  const root = buatRoot({
    platform: "ios",
    plugins: { SecureStoragePlugin: plugin.api },
    penyimpanan: store.api,
  });
  await simpanTokenPerangkat("token-aman-1", root);
  eq("tersimpan di penyimpanan aman", plugin.isi.get(KUNCI_TOKEN), "token-aman-1");
  eq("TIDAK disimpan di localStorage", store.isi.get(KUNCI_TOKEN), undefined);
  eq("terbaca dari penyimpanan aman", await muatTokenPerangkat(root), "token-aman-1");
  await simpanTokenPerangkat(null, root);
  eq("dihapus dari penyimpanan aman", plugin.isi.get(KUNCI_TOKEN), undefined);
}
{
  // Migrasi satu kali dari cara penyimpanan lama.
  const store = buatPenyimpanan();
  store.isi.set(KUNCI_TOKEN, "token-lama-9");
  const plugin = buatPluginAmanObjek();
  const root = buatRoot({
    platform: "android",
    plugins: { SecureStoragePlugin: plugin.api },
    penyimpanan: store.api,
  });
  eq("token lama tetap terbaca", await muatTokenPerangkat(root), "token-lama-9");
  eq("tersalin ke penyimpanan aman", plugin.isi.get(KUNCI_TOKEN), "token-lama-9");
  eq("salinan localStorage dibersihkan", store.isi.has(KUNCI_TOKEN), false);
}
{
  // Penyimpanan aman sudah berisi → salinan lama dibuang, bukan dipakai.
  const store = buatPenyimpanan();
  store.isi.set(KUNCI_TOKEN, "token-basi");
  const plugin = buatPluginAmanObjek();
  plugin.isi.set(KUNCI_TOKEN, "token-aman-baru");
  const root = buatRoot({
    platform: "android",
    plugins: { SecureStoragePlugin: plugin.api },
    penyimpanan: store.api,
  });
  eq("nilai penyimpanan aman menang", await muatTokenPerangkat(root), "token-aman-baru");
  eq("salinan lama dibuang", store.isi.has(KUNCI_TOKEN), false);
}
{
  // Bentuk API posisi (@aparajita/capacitor-secure-storage).
  const plugin = buatPluginAmanPosisi();
  const root = buatRoot({ platform: "ios", plugins: { SecureStorage: plugin.api } });
  await simpanTokenPerangkat("token-posisi", root);
  eq("bentuk posisi didukung", plugin.isi.get(KUNCI_TOKEN), "token-posisi");
  eq("terbaca lewat bentuk posisi", await muatTokenPerangkat(root), "token-posisi");
}
{
  // Keychain terkunci / kunci Android tidak berlaku → pakai cadangan.
  const store = buatPenyimpanan();
  store.isi.set(KUNCI_TOKEN, "token-cadangan-2");
  const plugin = buatPluginAmanObjek({ gagalGet: true });
  const root = buatRoot({
    platform: "ios",
    plugins: { SecureStoragePlugin: plugin.api },
    penyimpanan: store.api,
  });
  eq("gagal baca → cadangan dipakai", await muatTokenPerangkat(root), "token-cadangan-2");
}
{
  // Gagal tulis ke penyimpanan aman → jangan jatuh ke localStorage.
  const store = buatPenyimpanan();
  const plugin = buatPluginAmanObjek({ gagalSet: true });
  const root = buatRoot({
    platform: "ios",
    plugins: { SecureStoragePlugin: plugin.api },
    penyimpanan: store.api,
  });
  await simpanTokenPerangkat("token-rahasia", root);
  eq("tidak ditulis ke localStorage saat penyimpanan aman gagal", store.isi.has(KUNCI_TOKEN), false);
}
{
  // Tanpa penyimpanan apa pun: tidak melempar.
  await simpanTokenPerangkat("token", {});
  eq("tanpa penyimpanan → null", await muatTokenPerangkat({}), null);
}

// ===== URL endpoint heartbeat =====
eq(
  "URL cloud diturunkan ke domain .convex.site",
  urlHeartbeatLokasi("https://dapper-goshawk-437.convex.cloud"),
  "https://dapper-goshawk-437.convex.site/lokasi/heartbeat",
);
eq(
  "garis miring di akhir dibuang",
  urlHeartbeatLokasi("https://abc.convex.cloud/"),
  "https://abc.convex.site/lokasi/heartbeat",
);
eq(
  "domain situs eksplisit dipakai apa adanya",
  urlHeartbeatLokasi("https://abc.convex.cloud", "https://situs.pindai.id"),
  "https://situs.pindai.id/lokasi/heartbeat",
);
eq("tanpa URL → null", urlHeartbeatLokasi(undefined), null);
eq("URL kosong → null", urlHeartbeatLokasi("   "), null);

// ===== Heartbeat HTTP native =====
const TITIK = { lat: -6.2, lng: 106.816666, akurasi: 12 };
const URL_HB = "https://abc.convex.site/lokasi/heartbeat";
{
  const dipanggil: Record<string, unknown>[] = [];
  const plugin = {
    post: async (o: Record<string, unknown>) => {
      dipanggil.push(o);
      return { status: 200, data: { ok: true, waktu: 1 } };
    },
  };
  const hasil = await kirimHeartbeatLatar(URL_HB, "tok-1", TITIK, { platform: "android", versiApp: "1.0.0" }, buatRoot({ platform: "android", plugins: { CapacitorHttp: plugin } }));
  eq("HTTP native sukses", hasil.ok, true);
  eq("status dilaporkan", hasil.status, 200);
  eq("URL endpoint dipakai", dipanggil[0].url, URL_HB);
  eq(
    "token dikirim sebagai Bearer",
    (dipanggil[0].headers as Record<string, string>).Authorization,
    "Bearer tok-1",
  );
  eq("koordinat dikirim", (dipanggil[0].data as Record<string, number>).lat, -6.2);
  eq(
    "platform & versi ikut dikirim",
    (dipanggil[0].data as Record<string, string>).versiApp,
    "1.0.0",
  );
}
{
  const plugin = {
    post: async () => ({ status: 401, data: { ok: false, error: "Token perangkat tidak dikenal." } }),
  };
  const hasil = await kirimHeartbeatLatar(URL_HB, "tok-lama", TITIK, {}, buatRoot({ platform: "android", plugins: { CapacitorHttp: plugin } }));
  eq("401 ditandai gagal (pemanggil akan fallback)", hasil.ok, false);
  eq("status 401 dipertahankan", hasil.status, 401);
  ok("pesan 401 menjelaskan token", (hasil.pesan ?? "").includes("Token perangkat"));
}
{
  const plugin = {
    post: async () => ({ status: 400, data: { error: "Titik lokasi berada di luar wilayah Indonesia" } }),
  };
  const hasil = await kirimHeartbeatLatar(URL_HB, "tok", TITIK, {}, buatRoot({ platform: "android", plugins: { CapacitorHttp: plugin } }));
  eq("pesan validasi server diteruskan", hasil.pesan, "Titik lokasi berada di luar wilayah Indonesia");
}
{
  // Tanpa CapacitorHttp (mis. aplikasi belum memasangnya) → jalur fetch.
  const dipanggil: string[] = [];
  const root = {
    fetch: async (url: string) => {
      dipanggil.push(url);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  };
  const hasil = await kirimHeartbeatLatar(URL_HB, "tok", TITIK, {}, root);
  eq("fallback fetch dipakai", hasil.ok, true);
  eq("fetch dipanggil sekali", dipanggil.length, 1);
}
{
  const hasil = await kirimHeartbeatLatar(URL_HB, "tok", TITIK, {}, {});
  eq("tanpa jalur HTTP → gagal, bukan melempar", hasil.ok, false);
  eq("status null tanpa pengiriman", hasil.status, null);
  ok("ada pesan untuk pengguna", (hasil.pesan ?? "").length > 0);
}
{
  const root = {
    fetch: async () => {
      throw new Error("jaringan putus");
    },
  };
  const hasil = await kirimHeartbeatLatar(URL_HB, "tok", TITIK, {}, root);
  eq("galat jaringan ditangkap", hasil.pesan, "jaringan putus");
}

// ===== Layanan lokasi PINDAI (foreground service) =====
eq("layanan tidak ada → null", pluginLayananLokasi(buatRoot({ platform: "android" })), null);
eq(
  "plugin tanpa hentikan diabaikan",
  pluginLayananLokasi(
    buatRoot({ platform: "android", plugins: { PindaiLocation: { mulai: async () => ({}) } } }),
  ),
  null,
);
{
  const plugin = { mulai: async () => ({ aktif: true }), hentikan: async () => undefined };
  ok(
    "plugin layanan terdeteksi",
    pluginLayananLokasi(buatRoot({ platform: "android", plugins: { PindaiLocation: plugin } })) ===
      plugin,
  );
}
{
  // Kredensial & interval harus diteruskan apa adanya ke lapisan native.
  const dipanggil: Record<string, unknown>[] = [];
  const plugin = {
    mulai: async (o: Record<string, unknown>) => {
      dipanggil.push(o);
      return { aktif: true };
    },
    hentikan: async () => undefined,
  };
  const hasil = await mulaiLayananLokasi(plugin, {
    url: "https://abc.convex.site/lokasi/heartbeat",
    token: "tok-aman",
    intervalDetik: 60,
    jarakMeter: 50,
  });
  eq("layanan menyala", hasil.aktif, true);
  eq("tanpa pesan galat", hasil.pesan, null);
  eq("URL diteruskan", dipanggil[0].url, "https://abc.convex.site/lokasi/heartbeat");
  eq("token diteruskan", dipanggil[0].token, "tok-aman");
  eq("interval diteruskan", dipanggil[0].intervalDetik, 60);
}
{
  // Izin "Selalu" belum ada (iOS) / foreground service ditolak (Android).
  const plugin = {
    mulai: async () => {
      throw new Error('Izin lokasi "Selalu" belum diberikan.');
    },
    hentikan: async () => undefined,
  };
  const hasil = await mulaiLayananLokasi(plugin, { url: "https://x", token: "tok" });
  eq("penolakan layanan bukan sukses", hasil.aktif, false);
  eq("sebab ditampilkan ke pengguna", hasil.pesan, 'Izin lokasi "Selalu" belum diberikan.');
}
{
  // Layanan menjawab tanpa galat tetapi tidak menyala.
  const plugin = {
    mulai: async () => ({ aktif: false }),
    hentikan: async () => undefined,
  };
  const hasil = await mulaiLayananLokasi(plugin, { url: "https://x", token: "tok" });
  eq("aktif false diteruskan", hasil.aktif, false);
  eq("tidak ada pesan palsu", hasil.pesan, null);
}
{
  let dihentikan = 0;
  const plugin = {
    mulai: async () => ({ aktif: true }),
    hentikan: async () => {
      dihentikan += 1;
    },
  };
  await hentikanLayananLokasi(plugin);
  eq("hentikan dipanggil", dihentikan, 1);
}
{
  // Layanan mungkin sudah berhenti sendiri — jangan sampai melempar.
  const plugin = {
    mulai: async () => ({ aktif: true }),
    hentikan: async () => {
      throw new Error("layanan sudah berhenti");
    },
  };
  let melempar = false;
  try {
    await hentikanLayananLokasi(plugin);
  } catch {
    melempar = true;
  }
  eq("galat hentikan ditelan", melempar, false);
}

// ===== Buka Setelan perangkat =====
{
  // Plugin versi lama / tanpa method ini → UI tidak menampilkan tombolnya.
  const plugin = { mulai: async () => ({ aktif: true }), hentikan: async () => undefined };
  eq("tanpa bukaSetelan → false", await bukaSetelanAplikasi(plugin), false);
}
{
  let dibuka = 0;
  const plugin = {
    mulai: async () => ({ aktif: true }),
    hentikan: async () => undefined,
    bukaSetelan: async () => {
      dibuka += 1;
    },
  };
  eq("bukaSetelan dipanggil", await bukaSetelanAplikasi(plugin), true);
  eq("jumlah panggilan", dibuka, 1);
}
{
  const plugin = {
    mulai: async () => ({ aktif: true }),
    hentikan: async () => undefined,
    bukaSetelan: async () => {
      throw new Error("Setelan tidak bisa dibuka");
    },
  };
  let melempar = false;
  try {
    eq("gagal buka Setelan → false", await bukaSetelanAplikasi(plugin), false);
  } catch {
    melempar = true;
  }
  eq("galat buka Setelan ditelan", melempar, false);
}

console.log(`native tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
