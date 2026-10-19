# Surat somasi

Somasi adalah surat peringatan terakhir sebelum pinjaman masuk tahap penanganan
khusus. Surat dibuat dari data pinjaman yang sudah tercatat, bukan diketik ulang
oleh admin, dan hanya bisa diterbitkan lewat panel Penagihan.

## Kapan surat tersedia

Semua syarat berikut harus terpenuhi:

- pinjaman berstatus `didanai` dan belum lunas;
- sudah lewat 3 hari dari tanggal jatuh tempo (tenor + 3 hari), supaya ada ruang
  untuk pengingat dan penagihan biasa;
- tidak ada janji pembayaran berstatus `aktif` pada pinjaman itu;
- tidak ada pengaduan nasabah yang masih `baru` atau `ditinjau`.

Kalau salah satu syarat tidak terpenuhi, panel menampilkan alasannya dan tombol
unduh/kirim tidak muncul. Alasannya juga dikembalikan server, jadi klien lama
tidak bisa memaksa menerbitkan surat.

## Isi dan angka

Nominal surat disusun dari aturan yang sama dengan tagihan berjalan:

- pokok pinjaman;
- bunga dan biaya tercatat;
- denda keterlambatan 2% dari pokok per hari, dibatasi 100% dari pokok, atas
  seluruh hari keterlambatan;
- total kewajiban.

Nomor surat berformat `SOMASI/<nomor referensi>/<YYYYMMDD>` menurut kalender
WIB.

## Snapshot

Unduhan pertama menyimpan salinan surat di `somasiTerbit`: nomor, isi, dan waktu
terbit. Unduhan berikutnya memakai salinan itu, jadi angka di PDF tidak berubah
walau admin mengubah pokok atau biaya pinjaman setelah surat terbit. Snapshot sengaja
tidak bisa diubah dari panel; penerbitan ulang dengan angka baru adalah
pekerjaan pemeliharaan data oleh admin teknis.

Setiap penerbitan dan unduhan dicatat di `auditLog`
(`somasi_diterbitkan`, `somasi_diunduh`).

## Pengiriman

Dua kanal tersedia: WhatsApp (lampiran PDF lewat gateway Fonnte) dan email
(lampiran lewat integrasi Resend/VLY).

Aturan yang berlaku untuk keduanya:

- hanya di dalam jam kontak pada konfigurasi penagihan (bawaan 08.00-20.00 WIB);
- jeda minimal 60 detik antar kiriman pada kanal yang sama;
- batas 5 kiriman per kanal per admin per hari;
- tujuan WhatsApp hanya nomor yang tersimpan di akun peminjam atau pinjaman,
  tidak pernah nomor yang diketik di dialog;
- email hanya ke alamat akun peminjam.

Setelah berhasil, surat ditandai diserahkan dan tombol "Tandai diserahkan"
hilang. Kalau surat terkirim lewat jalur lain (pos, kurir, serah langsung),
admin memakai tombol itu secara manual. Penandaan bisa dibatalkan bila salah
tekan.

Setiap percobaan tercatat di `somasiKirimLog` beserta status dan alasannya,
termasuk percobaan yang gagal karena gateway atau konfigurasi.
