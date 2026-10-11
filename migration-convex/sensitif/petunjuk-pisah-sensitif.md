# Petunjuk Memisah Payload Sensitif

## Tujuan

Mencegah data sensitif ikut terpindahkan dalam bentuk yang tidak terkendali saat migrasi.

## Cara umum

1. Dari setiap dokumen yang terexport, pisahkan field sensitif.
2. Simpan payload sensitif dalam file/folder terpisah yang diberi proteksi akses.
3. Simpan mapping antara ID dokumen dan payload sensitif dalam file yang sama-sama terproteksi.
4. Pada sistem tujuan, pasang ulang payload sensitif hanya untuk user/entitas yang memang memerlukannya.

## Contoh pemisahan

- File operasional: `users.jsonl`, `loans.jsonl`, dll.
- File sensitif: `users_sensitif.jsonl`, `loans_sensitif.jsonl`, dll.
- Mapping ID sensitif: `mapping_sensitif.json` (terproteksi).

## Catatan

- Jangan campur data sensitif ke dalam file biasa tanpa alasan yang jelas.
- Jika sistem tujuan tidak memerlukan data sensitif, jangan pindahkan.
- Jika sistem tujuan memerlukan data sensitif, pastikan sistem tersebut punya mekanisme perlindungan yang sesuai.
