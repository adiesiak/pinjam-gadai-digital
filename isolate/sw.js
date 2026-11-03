/**
 * Service worker PINDAI.
 *
 * Dua tugas, dan hanya dua:
 *  1. Memenuhi syarat pemasangan aplikasi (Chrome versi lama menuntut service
 *     worker dengan penangan `fetch`).
 *  2. Menyajikan aset build yang namanya sudah ber-hash (`/assets/app-9f3c1a.js`,
 *     ikon, font) dari cache — cache-first, karena URL yang isinya berubah
 *     selalu berganti nama saat build. Ini yang membuat kunjungan kedua terasa
 *     instan tanpa risiko konten basi.
 *
 * YANG TIDAK PERNAH DISIMPAN:
 *  - HTML (`/`, `/biaya`, …): selalu dari jaringan. Bundel baru harus langsung
 *    terpakai setelah deploy; HTML yang di-cache akan menahan versi lama.
 *  - Respons Convex (`.convex.cloud`, `.convex.site`): saldo, status pinjaman,
 *    dan notifikasi tidak boleh tampil basi dalam bentuk apa pun.
 *  - Permintaan non-GET dan permintaan lintas asal di luar daftar aset lokal.
 */
const CACHE = "pindai-aset-v1";

/** Hanya aset statis ber-hash/ikon yang aman di-cache. */
function asetLokal(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/assets/") ||
      url.pathname.startsWith("/ocr/") ||
      /\.(?:png|svg|webp|ico|woff2?)$/.test(url.pathname))
  );
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["/logo.svg"])).catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Buang cache versi lama supaya aset yang sudah diganti tidak menumpuk.
      const nama = await caches.keys();
      await Promise.all(
        nama.filter((satu) => satu !== CACHE).map((satu) => caches.delete(satu)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const permintaan = event.request;
  if (permintaan.method !== "GET") return;

  let url;
  try {
    url = new URL(permintaan.url);
  } catch {
    return;
  }

  // Apa pun yang bukan aset lokal ber-hash diteruskan ke jaringan apa adanya.
  // Termasuk semua panggilan Convex: tidak ada respondWith, tidak ada cache.
  if (!asetLokal(url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const tersimpan = await cache.match(permintaan);
      if (tersimpan) return tersimpan;

      const respons = await fetch(permintaan);
      // Simpan hanya respons utuh dari server sendiri. `opaque` (lintas asal)
      // tidak bisa diperiksa statusnya, jadi tidak disimpan.
      if (respons.ok && respons.type === "basic") {
        cache.put(permintaan, respons.clone()).catch(() => undefined);
      }
      return respons;
    })(),
  );
});
