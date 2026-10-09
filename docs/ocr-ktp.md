# OCR KTP lokal (PINDAI)

Dokumen ini menjelaskan pilihan pustaka OCR, alasan menjalankannya di peramban,
serta batas tegasnya.

## Keputusan pustaka

| Kandidat | Lisensi | Bahasa Indonesia | Catatan |
| --- | --- | --- | --- |
| **tesseract.js 7** (dipakai) | Apache-2.0 | Ya (`ind.traineddata.gz`, ~1,1 MB) | WASM, jalan di peramban; worker + core + model bisa disajikan lokal |
| Ocrad.js | GPL-3.0 | Terbatas | Lisensi copyleft — dihindari |
| RapidOCR + ONNX Runtime Web | Apache-2.0 | Perlu model tambahan | Model ~15–30 MB, tidak lebih ringan untuk kasus ini |

`tesseract.js` dipilih karena lisensinya permisif (Apache-2.0), berjalan
sepenuhnya lokal (tanpa API OCR pihak ketiga), dan menyediakan angka keyakinan.

## Di mana OCR berjalan

OCR dijalankan **di peramban pengguna**, bukan di action Convex:

- Foto KTP tidak pernah meninggalkan perangkat → memenuhi syarat "jangan simpan
  hasil OCR atau gambar di log biasa"; tidak ada yang menyeberang jaringan.
- Worker WASM + model biner sulit dibundel andal di dalam action Convex
  (`use node`), yang membatasi worker thread dan berkas biner.

Aset disajikan dari origin aplikasi sendiri, tanpa CDN:

- worker (`tesseract.js/dist/worker.min.js`) dan core
  (`tesseract.js-core/tesseract-core-lstm.wasm.js`, wasm tertanam di dalamnya)
  dibundel Vite lewat `?url`;
- model bahasa Indonesia ada di `public/ocr/ind.traineddata.gz` (`langPath`).

Mesin dimuat secara malas (`import()`) hanya saat pengguna menekan "Pindai teks
KTP", lalu worker dihentikan lagi setelah selesai (memori worker signifikan).

## Kebutuhan sumber daya (perkiraan)

Model LSTM baseline (tanpa SIMD) dipilih demi kompatibilitas. OCR satu foto
ponsel 1–3 MP memerlukan waktu dalam hitungan detik (lebih lama di ponsel
lambat) dan memori worker ratusan MB; karena itu worker dibuat sekali per
pemanggilan dan ditutup setelahnya.

## Batas yang tegas

- **OCR hanya membaca teks.** Ia tidak membuktikan keaslian KTP dan tidak
  memverifikasi data ke Dukcapil.
- `periksaFormatNik()` hanya memeriksa BENTUK 16 digit (termasuk kewajaran
  komponen tanggal) — bukan bukti NIK resmi.
- Hasil OCR **tidak pernah** menaikkan status KYC menjadi `VERIFIED`. Ia hanya
  mengisi draf formulir yang tetap harus disimpan dan ditinjau petugas.
- Hasil yang buram, tidak lengkap, atau tidak meyakinkan meminta foto ulang
  atau pemeriksaan manual (lihat `nilaiHasilOcr`).

## Uji

`bun src/lib/kycOcr.test.ts` menguji penguraian teks dan aturan keputusan untuk
lima situasi: gambar jelas, buram, terpotong, rotasi (miring & terbalik), dan
hasil ekstraksi yang salah (huruf mirip angka + ketidaksesuaian formulir).
