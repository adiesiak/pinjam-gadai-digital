# Backup & latihan pemulihan

Dokumen ini mengatur cara menjaga arsip data produksi PINDAI dan cara membuktikan
bahwa arsip itu benar-benar bisa dipulihkan. Ditulis untuk operator yang memegang
akses deployment Convex — bukan untuk nasabah.

## Pembagian tanggung jawab

| Lapisan | Siapa | Isi |
| --- | --- | --- |
| Backup otomatis platform | Operator (dashboard Convex) | Salinan penuh database + berkas storage, dijadwalkan harian, disimpan platform |
| Backup KYC & pinjaman ke Google Drive | Kode (`convex/backupDrive.ts`) + admin | Manifest tabel KYC/pinjaman dan dokumen identitas, terenkripsi AES-256-GCM, dijadwalkan harian |
| Ekspor arsip manual | Admin (tab **Ekspor**) | Snapshot JSON (seluruh tabel + daftar dokumen) dan CSV ledger — tercatat di audit trail |
| Pemantauan kesegaran | Kode (`convex/monitoring.ts`) | Pemeriksa sistem tiap 6 jam menandai bila catatan backup terakhir lebih tua dari 7 hari |
| Uji pemulihan | Operator + admin | Latihan kuartalan ke deployment uji, hasilnya dicatat |

Kode aplikasi **tidak** bisa menjadwalkan backup platform. Selain ekspor manual,
kode menjadwalkan salinan KYC & pinjaman ke Google Drive (bagian 2), mencatat
setiap backup ke audit trail, dan memberi tahu saat arsip mulai terlantar.
Penjadwalan backup platform tetap ada di dashboard Convex.

## 1. Menjadwalkan backup otomatis

1. Buka dashboard Convex, pilih deployment **produksi** proyek PINDAI.
2. Masuk ke **Settings → Backups**, aktifkan jadwal harian.
3. Simpan bukti konfigurasi (tangkapan layar + tanggal) di catatan operasi, bukan
   di repositori.
4. Ulangi untuk deployment uji bila dipakai untuk latihan pemulihan.

Retensi yang dipakai: **harian 30 hari, bulanan 12 bulan**. Perpanjang bila ada
kewajiban lain dari `docs/audit-privasi.md`.

## 2. Backup KYC & pinjaman ke Google Drive

Fitur ini membuat salinan tambahan di luar Convex. Isinya sengaja dibatasi pada
data yang dibutuhkan untuk memulihkan identitas dan pinjaman:

- tabel `users`, `nasabahProfil`, `kycProfil`, riwayat/keputusan KYC, dan metadata
  pemeriksaan berkas;
- pinjaman tunai, angsuran, gadai, kredit barang, pengajuan/akad syariah, kontrak
  digital, pembayaran, pendanaan, dan transfer pendana;
- dokumen KTP/selfie/bukti penghasilan, foto barang gadai, kontrak bertanda
  tangan manual, serta bukti pembayaran manual yang tersimpan di Convex storage.

Setiap berkas dienkripsi **AES-256-GCM** sebelum diunggah. Drive hanya menyimpan
nama berkas netral dan blob terenkripsi. Manifest harian juga terenkripsi; yang
tidak dienkripsi hanyalah `ringkasan-*.json` berisi jumlah baris/dokumen, tanpa
data pribadi.

### 2.1. Menyiapkan kredensial Google

1. Di Google Cloud Console, aktifkan **Google Drive API** dan buat **OAuth client
   ID** bertipe **Desktop app**. Tambahkan
   `https://developers.google.com/oauthplayground` sebagai **Authorized redirect
   URI**.
2. Buka [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/),
   buka ikon gerigi, centang **Use your own OAuth credentials**, lalu isi client ID
   dan client secret tadi.
3. Masukkan scope `https://www.googleapis.com/auth/drive.file`, authorize dengan
   akun Google pemilik folder backup, lalu tukar authorization code menjadi token.
   Salin **refresh token**-nya.
4. Isi empat variabel di **Keys/API keys** deployment Convex:
   - `GOOGLE_DRIVE_CLIENT_ID`
   - `GOOGLE_DRIVE_CLIENT_SECRET`
   - `GOOGLE_DRIVE_REFRESH_TOKEN`
   - `BACKUP_DRIVE_ENCRYPTION_KEY`
5. Opsional: `GOOGLE_DRIVE_FOLDER_NAME` untuk mengganti nama folder bawaan
   `PINDAI Backup`.

> Aplikasi OAuth yang masih berstatus **Testing** memberi refresh token yang
> kedaluwarsa setelah 7 hari. Pindahkan aplikasi ke **In production** (atau
> otorisasi ulang secara berkala) supaya backup tidak berhenti diam-diam.

Scope `drive.file` hanya memberi akses ke berkas/folder yang dibuat aplikasi.
Folder `PINDAI Backup` dan subfolder `Dokumen` dibuat otomatis pada backup pertama.
Jangan memindahkan folder keluar dari My Drive; jika folder hilang, backup
berikutnya membuat folder baru dan mengunggah ulang dokumen yang belum ada.

### 2.2. Membuat kunci enkripsi

Buat 32 byte acak, lalu simpan base64-nya di password manager — **jangan** di
Google Drive, repositori, atau catatan tiket:

```bash
openssl rand -base64 32
```

Pasang hasilnya sebagai `BACKUP_DRIVE_ENCRYPTION_KEY`. Tanpa kunci ini backup
lama tidak bisa dibuka. Kehilangan kunci berarti kehilangan isi arsip, jadi buat
salinan kunci di tempat aman yang terpisah dari akun Google.

### 2.3. Jadwal dan pemicu manual

- Cron `backup-google-drive` berjalan **setiap hari pukul 01.30 WIB**.
- Admin juga bisa menekan **Backup sekarang ke Google Drive** di tab **Ekspor**.
- Dokumen yang sudah pernah diunggah dilewati berdasarkan id storage di
  `appProperties` Drive; hanya dokumen baru yang diunggah.
- Manifest baru dibuat setiap hari. Berkas lama **tidak** dihapus otomatis;
  retensi/pembersihan dilakukan manual oleh operator.
- Manifest adalah snapshot: penghapusan akun di aplikasi tidak menghapus data
  dari manifest lama. Saat permintaan hapus diproses, operator juga harus
  menghapus manifest yang memuat data tersebut (atau menunggu masa retensi) dan
  mencatat tindakannya. Jangan menganggap backup Drive ikut terhapus otomatis.

Status kesiapan, backup terakhir, dan kegagalan terakhir tampil di kartu Google
Drive pada tab **Ekspor**. Setiap hasil dicatat di audit trail dengan aksi
`backup` (berhasil) atau `backup_drive_gagal` (gagal).

### 2.4. Membuka arsip terenkripsi

Unduh manifest/berkas dari Drive, lalu dekripsi secara lokal:

```bash
BACKUP_DRIVE_ENCRYPTION_KEY=... bun scripts/dekripsi-backup-drive.ts \
  manifest-20261104T013000Z.json.enc manifest.json
```

Nama berkas dokumen tidak memuat nama peminjam. Cocokkan `storageId` dan
`driveFileId` di manifest dengan berkas di folder `Dokumen`. Jangan mendekripsi
ke folder yang tersinkron ke cloud atau dibagikan.

## 3. Ekspor arsip manual (admin)

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
platform (bagian 4).

> Berkas snapshot memuat data pribadi: NIK, nomor WhatsApp, rekening, dan tautan
> dokumen KTP. Simpan di penyimpanan terenkripsi milik operator, jangan di
> repositori, grup chat, atau folder bersama.

## 4. Latihan pemulihan (setiap kuartal)

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
   - dua dokumen KYC contoh bisa dibuka dari storage;
   - dua dokumen dari backup Google Drive bisa didekripsi dan dibuka dengan kunci
     yang disimpan operator.
5. **Verifikasi alur.** Masuk sebagai nasabah contoh, buka dashboard, pastikan
   tagihan dan riwayat pembayaran tampil wajar. Jangan menjalankan mutation uang
   di deployment uji kecuali memang menguji alur itu.
6. **Catat hasil.** Tulis tanggal latihan, durasi tiap langkah, dan temuan di
   catatan operasi. Bila ada langkah yang gagal, perbaiki prosedurnya sekarang —
   bukan saat insiden.

Hentikan deployment uji setelah latihan supaya tidak ada data pribadi yang
terbengkalai di lingkungan yang tidak dipantau.

## 5. Memantau kesegaran arsip

- Panel **Kesehatan sistem** menampilkan peringatan *Backup data belum tercatat*
  bila catatan backup terakhir tidak ada atau lebih tua dari **7 hari**.
- Peringatan *Backup Google Drive gagal* muncul bila kegagalan Drive terbaru
  lebih baru daripada backup sukses terakhir.
- Pemeriksa berjalan otomatis tiap 6 jam (`pemeriksaan-sistem` di
  `convex/crons.ts`), jadi peringatan muncul tanpa perlu membuka panel.
- Peringatan ini **tidak** menghalangi transaksi. Ia hanya memberi tahu bahwa
  arsip sedang terlantar.

## 6. Saat insiden nyata

1. Hentikan penulisan yang berisiko (kill switch pengajuan, hentikan pencatatan
   transfer) — jangan menghapus data.
2. Tentukan titik pulih: waktu kejadian terakhir yang diketahui benar.
3. Pulihkan ke deployment **baru**, verifikasi angka seperti langkah 4.4, baru
   arahkan aplikasi ke deployment itu.
4. Simpan arsip sebelum insiden apa adanya untuk pemeriksaan.
5. Tulis kronologi di audit trail internal dan dokumen insiden.
