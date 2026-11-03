/**
 * Pemasangan tema sebelum paint pertama.
 *
 * Dipisah dari index.html supaya Content-Security-Policy dapat memakai
 * `script-src 'self'` tanpa pengecualian `'unsafe-inline'`. skrip sebaris di
 * HTML memaksa pengecualian itu, dan pengecualian itu juga membuka jalan bagi
 * skrip yang disuntikkan penyerang.
 *
 * Skrip ini sinkron dan berada di <head>, jadi nilainya sudah terbaca sebelum
 * elemen pertama digambar. React memperbaruinya bila admin mengganti template.
 */
(function () {
  try {
    var tema = localStorage.getItem("pindai-tema");
    var gaya = localStorage.getItem("pindai-gaya");
    var akar = document.documentElement;
    if (tema) akar.setAttribute("data-theme", tema);
    if (gaya) akar.setAttribute("data-gaya", gaya);
  } catch (_) {
    /* Penyimpanan diblokir (mode privat): cukup pakai nilai bawaan. */
  }
})();
