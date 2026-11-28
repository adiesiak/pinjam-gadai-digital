# Instruksi untuk Hermes - integrasi bot ke PINDAI

Berkas ini **untuk agen/developer yang memegang bot WhatsApp di VPS**.
Tempelkan seluruh isi berkas ini sebagai tugas, atau tunjuk berkasnya.

---

## Tugas

Sambungkan bot WhatsApp ke API PINDAI supaya **pengajuan dari bot masuk ke
database website**, bukan ke database bot sendiri.

Saat ini bot menyimpan pengajuan sendiri. Akibatnya ada dua database untuk hal
yang sama, dan pengajuan dari bot tidak muncul di panel admin website.

---

## Cara mendapatkan berkas ini di VPS

Tiga berkas yang dibutuhkan (`pindai-api.cjs`, `uji-api-bot.mjs`, berkas ini)
ada di repo publik `adiesiak/pinjam-gadai-digital`, folder `deploy/wa-sender/`.

### Cara 1 - kalau VPS sudah punya clone repo

```bash
cd /path/ke/clone/pinjam-gadai-digital
git pull origin main
ls -la deploy/wa-sender/
```

### Cara 2 - ambil 3 berkas saja, tanpa clone

Paling ringan kalau VPS hanya butuh kliennya:

```bash
BASE="https://raw.githubusercontent.com/adiesiak/pinjam-gadai-digital/main/deploy/wa-sender"
cd /opt/pindai-wa-sender          # sesuaikan dengan folder bot

curl -fsSLO "$BASE/pindai-api.cjs"
curl -fsSLO "$BASE/uji-api-bot.mjs"
curl -fsSLO "$BASE/UNTUK-HERMES-API.md"

ls -la pindai-api.cjs uji-api-bot.mjs
```

### Cara 3 - clone baru (kalau belum ada sama sekali)

```bash
git clone --depth 1 \
  https://github.com/adiesiak/pinjam-gadai-digital.git \
  /opt/pindai-repo

ls /opt/pindai-repo/deploy/wa-sender/
```

Repo publik, jadi tidak butuh kredensial.

### PENTING: jangan deploy Convex dari VPS

Repo ini berisi kode website (Convex). **Bot tidak boleh menjalankan
`npx convex deploy`** - itu akan menghapus modul dan route yang dibuat dari
mesin admin, karena `convex deploy` meng-upload SELURUH project.

Ini sudah pernah terjadi: route `/bot/*` sempat 404 selama beberapa jam karena
deploy dari VPS menimpa `http.ts`.

Kalau `CONVEX_DEPLOY_KEY` ada di environment VPS, **hapus**:

```bash
unset CONVEX_DEPLOY_KEY
grep -rn "CONVEX_DEPLOY" /etc/pindai/ /etc/systemd/system/ ~/.bashrc 2>/dev/null
```

Bot adalah **klien HTTP**, bukan pengelola deployment.

---

## Yang sudah disiapkan (jangan ditulis ulang)

Tiga berkas ini ada di folder `deploy/wa-sender/`:

| Berkas | Isi | Tindakan |
| --- | --- | --- |
| `pindai-api.cjs` | **Klien siap pakai.** Semua detail HTTP sudah ditangani | Pakai langsung, jangan ubah |
| `uji-api-bot.mjs` | Skrip uji koneksi | Jalankan untuk verifikasi |
| `docs/api-bot-whatsapp.md` | Referensi kontrak API lengkap | Baca bagian "Field wajib" |

`pindai-api.cjs` sudah menangani: header Authorization, timeout, parsing JSON,
normalisasi galat menjadi teks Indonesia yang layak ditampilkan nasabah.

---

## Langkah 1 - simpan kunci API

Kunci diberikan admin PINDAI (64 karakter hex). **Jangan ditanam di kode** yang
di-commit.

```bash
sudo mkdir -p /etc/pindai
sudo install -m 600 root:root /dev/null /etc/pindai/bot.env
sudo nano /etc/pindai/bot.env
```

Isi:

```
PINDAI_BOT_API_KEY=<kunci 64 karakter dari admin>
```

Lalu di unit systemd bot, tambahkan:

```ini
EnvironmentFile=/etc/pindai/bot.env
```

Reload:

```bash
sudo systemctl daemon-reload
sudo systemctl restart <nama-service-bot>
```

---

## Langkah 2 - verifikasi koneksi

```bash
cd /path/ke/deploy/wa-sender
PINDAI_BOT_API_KEY=$(grep PINDAI_BOT_API_KEY /etc/pindai/bot.env | cut -d= -f2) \
  node uji-api-bot.mjs
```

Harus keluar:

```
[OK  ] Kunci API diterima
[OK  ] Kontrak /bot/status sesuai
[OK  ] Route /bot/unggah-url hidup
[OK  ] Pengajuan nomor tak terdaftar ditolak

=== Ringkasan ===
  4/4 periksa lulus
```

**Jangan lanjut sebelum 4/4 lulus.** Kalau gagal, lihat tabel gejala di bagian
akhir berkas ini.

---

## Langkah 3 - pakai klien di kode bot

```js
const { buatKlien, GalatPindai } = require("./pindai-api.cjs");

const pindai = buatKlien({
  apiKey: process.env.PINDAI_BOT_API_KEY,
});
```

### Cek apakah nomor sudah terdaftar

```js
const s = await pindai.status(nomorUser);
if (!s.terdaftar) {
  // tawarkan pendaftaran
}
// s.pengajuan = daftar pengajuan milik nomor itu
```

### Daftarkan nomor baru

```js
const { userId, baru } = await pindai.daftar(nomorUser, namaUser);
// baru === false artinya nomor sudah pernah terdaftar
```

### Unggah foto KTP / selfie / slip gaji

```js
const buffer = await unduhMediaDariWhatsApp(pesan);   // fungsi bot yang sudah ada
const { storageId } = await pindai.unggahFoto(buffer, "image/jpeg");
```

> **WAJIB:** foto **jangan** disimpan di VPS. Langsung unggah ke PINDAI.
> Kalau disimpan sendiri, dokumen KYC terpecah dua tempat dan pemulihan backup
> tidak lagi utuh.

Butuh 3 berkas untuk satu pengajuan: KTP, selfie + KTP, slip gaji.
Panggil `unggahFoto` tiga kali.

### Ajukan pinjaman

```js
try {
  const { nomorReferensi } = await pindai.ajukanSekali(
    nomorUser,
    {
      pokokPinjaman: 2000000,
      tujuan: "Modal usaha",
      namaLengkap: "Budi Santoso",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      tenorHari: 28,
      nik: "3273012345678901",
      nomorWhatsApp: nomorUser,
      penghasilanBulanan: 5000000,
      sumberPenghasilan: "Karyawan swasta",
      dokKtpId: storageIdKtp,
      dokSelfieKtpId: storageIdSelfie,
      dokSlipGajiId: storageIdSlip,
      persetujuanSyarat: true,
    },
    `wa-${nomorUser}-${Date.now()}`,   // kunci idempotensi
  );
  await kirimWA(nomorUser, `Pengajuan diterima. Nomor referensi: ${nomorReferensi}`);
} catch (e) {
  if (e instanceof GalatPindai) {
    // e.pesan sudah bahasa Indonesia, aman ditampilkan ke nasabah
    await kirimWA(nomorUser, `Pengajuan gagal: ${e.pesan}`);
  } else {
    throw e;
  }
}
```

`ajukanSekali` memakai kunci idempotensi: kalau bot mengirim ulang karena
jaringan putus, **tidak** lahir pengajuan kedua.

---

## Aturan yang TIDAK bisa dilanggar bot

Pengajuan dari bot memakai fungsi yang sama dengan website. Jadi semua aturan
berlaku otomatis:

| Aturan | Pesan yang muncul |
| --- | --- |
| KYC harus terverifikasi | "KYC belum terverifikasi..." |
| Plafon pinjaman | "Plafon ..." |
| Batas pokok | "Pokok pinjaman minimal/maksimal ..." |
| Tenor dari opsi resmi | "Tenor tidak dikenali..." |
| Jaminan untuk pinjaman besar | "... wajib melampirkan Kartu Keluarga" |
| Anti-spam | "Terlalu cepat..." |
| Pembatas laju | "Terlalu banyak percobaan..." |

**Jangan** mencoba melewati ini dengan memanggil endpoint lain. Server memeriksa
ulang semuanya.

---

## Yang TIDAK boleh dilakukan

| Larangan | Alasan |
| --- | --- |
| Menyimpan foto KTP di VPS | Dokumen terpecah dua tempat, backup tidak utuh |
| Menanam kunci API di kode | Kunci bocor = siapa pun bisa mengajukan atas nama nasabah |
| Mengirim `userId` sendiri | Server memetakan dari nomor; bot tidak boleh menentukan identitas |
| Membuat database pengajuan sendiri | Itu kembali ke masalah dua database |
| Menyalin logika validasi | Validasi ada di server, satu sumber |
| Menjalankan `convex deploy` | Menghapus modul dan route milik mesin admin |

---

## Urutan yang disarankan untuk bot

```
1. User: "AJUKAN 2 JUTA"
2. Bot:  status(nomor)
         - belum terdaftar -> minta nama -> daftar(nomor, nama)
         - terdaftar
3. Bot:  minta: tujuan, bank, rekening, NIK, penghasilan
4. Bot:  minta foto: KTP, selfie, slip gaji
         untuk tiap foto: unggahFoto() -> storageId
5. Bot:  ringkas ke user, minta konfirmasi
6. Bot:  ajukanSekali(nomor, data, kunciUnik)
7. Bot:  kirim nomorReferensi ke user
```

---

## Kalau ada masalah

| Gejala | Sebab | Tindakan |
| --- | --- | --- |
| `401` | Kunci berbeda dengan di Convex | Cek `/etc/pindai/bot.env` |
| `503` | `BOT_API_KEY` belum diset di Convex | Hubungi admin PINDAI |
| `404` saat pengajuan | Nomor belum terdaftar | Panggil `daftar()` dulu |
| `404` di semua endpoint `/bot/*` | Ada deploy dari mesin lain | Hubungi admin PINDAI; **jangan** deploy sendiri |
| `400` "KYC belum terverifikasi" | User harus selesaikan KYC di website | Arahkan user ke website |
| `400` "Plafon ..." | Pokok melebihi plafon | Tampilkan pesan, tawarkan nominal lebih kecil |
| Timeout | Jaringan VPS | Coba lagi; `ajukanSekali` aman diulang |

---

## Setelah selesai

Laporkan ke admin PINDAI:

1. Hasil `uji-api-bot.mjs` (harus 4/4)
2. Daftar perintah bot yang sudah tersambung
3. Apakah ada data pengajuan lama di bot yang masih perlu dipindahkan

Untuk data lama: **jangan** pindahkan sendiri. Kirim strukturnya (`.tables` dan
jumlah baris kalau SQLite) ke admin PINDAI - migrasinya harus menghindari
duplikat dengan data yang sudah ada di website.
