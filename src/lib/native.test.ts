/**
 * Uji jembatan aplikasi native: deteksi lingkungan, ID perangkat, dan
 * pemantauan lokasi latar belakang. Semua diuji lewat `root` yang disuntik
 * (objek mirip `window`), jadi tidak butuh aplikasi native sungguhan.
 */
import {
  diAplikasiNative,
  idPerangkat,
  kodePlatform,
  lingkunganNative,
  mulaiPelacakanLatar,
  pasangPluginLokasiLatar,
  PELACAKAN_LATAR_OPSI,
  pluginLokasiLatar,
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

/** Penyimpanan lokal tiruan — cukup untuk `getItem`/`setItem`. */
function buatPenyimpanan(): { isi: Map<string, string>; api: unknown } {
  const isi = new Map<string, string>();
  return {
    isi,
    api: {
      getItem: (k: string) => isi.get(k) ?? null,
      setItem: (k: string, v: string) => void isi.set(k, v),
    },
  };
}

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

    terimaBalik[0].balik(null, undefined);
    eq("galat tanpa pesan diberi teks bawaan", galat.length, galatSebelum + 2);
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

console.log(`native tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
