/**
 * Service worker PINDAI — hanya untuk syarat pemasangan aplikasi.
 *
 * Sengaja TIDAK menyimpan apa pun: tidak ada cache, tidak ada data transaksi
 * yang dibekukan, dan tidak ada respondWith() sehingga setiap permintaan tetap
 * dilayani jaringan seperti biasa. Tujuannya satu: Chrome versi lama mensyaratkan
 * service worker dengan penangan `fetch` sebelum menawarkan pemasangan.
 *
 * Kalau nanti aplikasi butuh mode offline, cache harus dirancang terpisah —
 * jangan menambah penyimpanan di sini tanpa aturan kedaluwarsa, karena data
 * pinjaman dan status tidak boleh tampil basi.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Tanpa respondWith: permintaan diteruskan ke jaringan.
});
