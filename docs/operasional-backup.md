# Backup & latihan pemulihan

Dokumen ini mengatur cara menjaga arsip data produksi PINDAI dan cara membuktikan
bahwa arsip itu benar-benar bisa dipulihkan. Ditulis untuk operator yang memegang
akses deployment Convex — bukan untuk nasabah.

## Pembagian tanggung jawab

| Lapisan | Siapa | Isi |
| --- | --- | --- |
| Backup otomatis platform | Operator (dashboard Convex) | Salinan penuh database + berkas storage, dijadwalkan harian, disimpan platform |
| Ekspor arsip manual | Admin (tab **Ekspor**) | Snapshot JSON (seluruh tabel + daftar dokumen) dan CSV ledger — tercatat di audit trail |
| Pemantauan kesegaran | Kode (`convex/monitoring.ts`) | Pemeriksa sistem tiap 6 jam menandai bila catatan backup terakhir lebih tua dari 7 hari |
| Uji pemulihan | Operator + admin | Latihan kuartalan ke deployment uji, hasilnya dicatat |

Kode aplikasi **tidak** bisa menjadwalkan backup platform. Yang bisa dilakukan
kode: menyediakan ekspor manual, mencatat setiap unduhan ke audit trail, dan
memberi tahu saat arsip mulai terlantar. Penjadwalan penuh ada di dashboard.

## 1. Menjadwalkan backup otomatis

1. Buka dashboard Convex, pilih deployment **produksi** proyek PINDAI.
2. Masuk ke **Settings → Backups**, aktifkan jadwal harian.
3. Simpan bukti konfigurasi (tangkapan layar + tanggal) di catatan operasi, bukan
   di repositori.
4. Ulangi untuk deployment uji bila dipakai untuk latihan pemulihan.

Retensi yang dipakai: **harian 30 hari, bulanan 12 bulan**. Perpanjang bila ada
kewajiban lain dari `docs/audit-privasi.md`.

## 2. Ekspor arsip manual (admin)

Tab **Ekspor** di meja kerja admin menyediakan tiga unduhan:

- **Snapshot JSON** — seluruh baris tabel inti ditambah daftar dokumen storage
  beserta tautan unduhnya. Diambil saat tombol ditekan, bukan saat tab dibuka.
- **CSV ledger** — seluruh jurnal, dibaca halaman demi halaman lalu dirangkai jadi
  satu berkas. Tidak ada baris yang dipotong.
- **PDF audit log** — jejak audit terbaru untuk keperluan pemeriksaan.

Setiap unduhan dicatat di audit trail dengan aksi `backup`. Kartu **Backup
terakhir** menampilkan waktu, jenis, dan pelakunya.

Snapshot JSON adalah **arsip bacaan** untuk rekonsiliasi dan pemeriksaan, bukan
format yang bisa diimpor ulang otomatis. Sumber pemulihan resmi tetap ekspor
platform (bagian 3).

> Berkas snapshot memuat data pribadi: NIK, nomor WhatsApp, rekening, dan tautan
> dokumen KTP. Simpan di penyimpanan terenkripsi milik operator, jangan di
> repositori, grup chat, atau folder bersama.

## 3. Latihan pemulihan (setiap kuartal)

Tujuan: membuktikan arsip bisa dipulihkan **sebelum** ada insiden, dan mengukur
berapa lama prosesnya benar-benar berjalan.

Sasaran waktu: **RPO ≤ 24 jam** (backup harian), **RTO ≤ 4 jam** (waktu pulih
sampai aplikasi melayani lagi).

1. **Ambil arsip.** Dari mesin operator yang punya akses deployment produksi:
   ```
   npx convex export --path backup-produksi-YYYY-MM-DD.zip
   ```
2. **Siapkan deployment uji.** Buat deployment Convex terpisah (staging) untuk
   latihan. Jangan memakai deployment produksi sebagai target latihan.
3. **Pulihkan.** Impor arsip ke deployment uji:
   ```
   CONVEX_DEPLOY_KEY=<kunci-deployment-uji> npx convex import --replace backup-produksi-YYYY-MM-DD.zip
   ```
4. **Verifikasi angka.** Di deployment uji, buka meja kerja admin:
   - panel Kesehatan: ledger **seimbang** (debit = kredit), tidak ada peringatan
     ledger;
   - jumlah pinjaman, gadai, dan kredit barang sama dengan produksi pada tanggal
     arsip (bandingkan dengan angka di tab Ekspor produksi);
   - tiga pinjaman contoh dan tiga gadai contoh: status, pokok, dan tanggal
     lunasnya identik;
   - dua dokumen KYC contoh bisa dibuka dari storage.
5. **Verifikasi alur.** Masuk sebagai nasabah contoh, buka dashboard, pastikan
   tagihan dan riwayat pembayaran tampil wajar. Jangan menjalankan mutation uang
   di deployment uji kecuali memang menguji alur itu.
6. **Catat hasil.** Tulis tanggal latihan, durasi tiap langkah, dan temuan di
   catatan operasi. Bila ada langkah yang gagal, perbaiki prosedurnya sekarang —
   bukan saat insiden.

Hentikan deployment uji setelah latihan supaya tidak ada data pribadi yang
terbengkalai di lingkungan yang tidak dipantau.

## 4. Memantau kesegaran arsip

- Panel **Kesehatan sistem** menampilkan peringatan *Backup data belum tercatat*
  bila catatan backup terakhir tidak ada atau lebih tua dari **7 hari**.
- Pemeriksa berjalan otomatis tiap 6 jam (`pemeriksaan-sistem` di
  `convex/crons.ts`), jadi peringatan muncul tanpa perlu membuka panel.
- Peringatan ini **tidak** menghalangi transaksi. Ia hanya memberi tahu bahwa
  arsip sedang terlantar.

## 5. Saat insiden nyata

1. Hentikan penulisan yang berisiko (kill switch pengajuan, hentikan pencatatan
   transfer) — jangan menghapus data.
2. Tentukan titik pulih: waktu kejadian terakhir yang diketahui benar.
3. Pulihkan ke deployment **baru**, verifikasi angka seperti langkah 3.4, baru
   arahkan aplikasi ke deployment itu.
4. Simpan arsip sebelum insiden apa adanya untuk pemeriksaan.
5. Tulis kronologi di audit trail internal dan dokumen insiden.
