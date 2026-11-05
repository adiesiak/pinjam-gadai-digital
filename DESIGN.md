# DESIGN.md - PINDAI UI/UX & Visual Direction

Dokumen ini sumber arah visual PINDAI dan menang atas rekomendasi generik dari skill. Panduan UI/UX memakai `.claude/skills/ui-ux-pro-max`, `.claude/skills/ui-styling`, dan `.claude/skills/design-system` (lihat `AGENTS.md`).

## 0. Cara memakai skill

Baca `.claude/skills/ui-ux-pro-max/SKILL.md` sebelum mengerjakan UI. Untuk pertanyaan yang sempit, cari aturan yang relevan, jangan menyalin seluruh katalog ke dalam keputusan desain.

```bash
# Arah sistem desain (jangan simpan tanpa persetujuan pemilik)
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "fintech lending dashboard" --design-system -p PINDAI

# Aturan UX, gaya, tipografi, warna, grafik
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "focus not obscured" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "paper brass premium finance" --domain color

# Panduan stack yang dipakai proyek
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "form validation" --stack react
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "chip badge overflow" --stack html-tailwind
```

Aturan pemakaian:

- Hasil pencarian adalah rekomendasi, bukan perintah. Tolak hasil yang bertentangan dengan dokumen ini, terutama saran mode gelap, gradien ungu/pink, atau kepadatan yang merusak keterbacaan.
- Skill tidak boleh menambah dependensi, mengganti pustaka, atau merombak komponen di luar lingkup tugas.
- Jangan memakai `--persist` untuk menimpa sistem desain tanpa izin. `DESIGN.md` adalah master proyek.
- `ui-styling` dipakai untuk komponen shadcn/ui dan Tailwind. `design-system` dipakai untuk token, spesifikasi komponen, dan konsistensi tema.

## 1. Identitas merek & konsep visual

Theme: Warm Paper, Polished Brass, & Double Line Glow.

PINDAI adalah platform fintech dengan penekanan pada keamanan, pencatatan, dan verifikasi aset. Identitasnya mempertemukan warisan Indonesia (motif ombak Mega Mendung) dengan lapisan kertas dan kaca finansial.

Primary persona: pemantauan kekayaan, verifikasi aset kredit, dan kendali ledger super-admin.

Core feel: eksklusif, tenang, berbobot, bersih, dan presisi. Kemewahan dibawa tepi kuningan, tekstur kertas, dan bayangan bertinta, bukan gradien terang atau animasi berlebihan.

Larangan generik:

- Tanpa kartu tengah generik di atas latar hitam, tanpa partikel mengambang acak, dan tanpa tombol biru bergradien.
- Tanpa emoji sebagai ikon struktural. Ikon dari Lucide dengan ketebalan dan ukuran yang konsisten.
- Tanpa permukaan gelap di halaman publik. Bobot dan kontras dibawa tepi, tekstur, dan bayangan.
- Setiap elemen harus punya alasan: hierarki, status, atau aksi. Ornamen tanpa fungsi dihapus.

### Satu wajah: mode terang (keputusan pemilik)

Seluruh halaman, yaitu ruang peminjam, verifikasi aset, ruang pendana, meja kerja super-admin, dan halaman masuk, memakai satu wajah terang: preset bawaan `tinta` (kertas hangat, hijau tinta, kuningan).

Preset gelap `obsidian` sudah dicabut seluruhnya. Presetnya tidak lagi terdaftar di `src/lib/system-config.ts`, kartunya hilang dari panel admin, dan blok token gelapnya dihapus dari `src/index.css`. Tidak ada aturan yang cocok dengan `data-theme="obsidian"` maupun `data-wajah="obsidian"`, jadi tidak ada jalan mengaktifkan tampilan gelap.

Pengecualian operasional: panel admin punya sakelar **Dim** dan **Padat** yang disimpan per perangkat. Dim bukan preset tema dan tidak mengubah ruang nasabah/pendana; ia hanya menurunkan silau permukaan kerja admin lewat CSS yang dibatasi `.admin-shell`.

Kartu hero landing (`src/components/landing/KartuHeroPindai.tsx`) juga cerah. Keputusan pemilik 2026-10-12: permukaan obsidian pada kartu ditinggalkan supaya titik fokus halaman ikut satu wajah terang. Permukaan barunya kertas hangat berkaca; bobot dan kemewahannya dibawa tepi kuningan, pola ombak berlapis, dan bayangan bertinta (lihat §3A).

Konsekuensi untuk skill: rekomendasi `Dark Mode (OLED)` atau varian gelap lain tidak diterapkan. Bila pencarian mengembalikan saran itu, ambil bagian yang tetap relevan (kontras, hierarki tipografi, pola interaksi) dan buang paletnya.

## 2. Design tokens

Token hidup di `src/index.css` (warna, radius, motion) dan `src/lib/motion.ts` (durasi, easing, stagger). Komponen membaca token; jangan menulis hex baru di komponen.

### 2.1 Warna

Warna semantik di `:root`:

| Peran | Token | Nilai | Pemakaian |
| --- | --- | --- | --- |
| Latar halaman | `--background` | `#ffffff` | Kanvas utama |
| Teks utama | `--foreground` | `#1c1a15` | Judul dan isi |
| Permukaan | `--card` | `#ffffff` | Kartu, panel, dialog |
| Aksen utama | `--primary` | `#0f3d3a` | Aksi utama, tautan, fokus |
| Aksen terang | `--primary-foreground` | `#f7f4ec` | Teks di atas aksen |
| Netral kertas | `--secondary` | `#f1ede3` | Latar lembut, chip |
| Teks sekunder | `--muted-foreground` | `#6b6455` | Metadata, keterangan |
| Garis | `--border` | `#e3ddd0` | Batas kartu dan pemisah |
| Garis input | `--input` | `#948b78` | Tepi bidang isian (kontras 3:1 di atas putih) |
| Fokus | `--ring` | `#1f6a62` | Cincin fokus keyboard |
| Bahaya | `--destructive` | `#a5303a` | Hapus, tolak, galat |
| Kuningan | `--gold` | `#9c7b3a` | Garis, ikon, aksen; teks memakai `--gold-foreground` |
| Status positif | `--success` | `#1f6a62` | Isian dan ikon status selesai/berhasil |
| Teks status positif | `--success-foreground` | `#124340` | Teks di atas `--success-soft` |
| Permukaan status positif | `--success-soft` | `#eef5f3` | Latar lencana status |
| Tepi status positif | `--success-border` | `#b9d2cd` | Garis lencana status |
| Tinta | `--navy` | `#0f3d3a` | Judul dan teks tegas |

Pemetaan utilitas Tailwind di preset `tinta`:

- `sky` = hijau tinta tua (brand dan aksi).
- `slate` = netral kertas hangat (latar, garis, teks).
- `emerald` = kuningan, **hanya nilai uang** (nominal, saldo, biaya).
- `success` = petrol, khusus status positif (lunas, disetujui, terverifikasi). Uang dan status tidak boleh memakai warna yang sama.
- `amber` = oranye bata (peringatan).
- `red` = merah marun (bahaya).

Empat preset lain (`pesisir`, `terakota`, `salju`, `karnival`) memetakan ulang skala yang sama dengan paletnya sendiri. Komponen tidak boleh mengunci warna ke satu preset.

Permukaan kertas:

- Kertas hangat dari `#ffffff` sampai `#f1ede3` (`slate-50`/`slate-100`/`secondary`).
- Kaca kertas hanya untuk satu titik fokus: putih 0.90-0.94 opasitas + `backdrop-blur-2xl`.
- Tepi dan bayangan: garis kuningan `#c9a86a` (alpha 35-55%) dan bayangan bertinta `rgba(28,26,21,0.45)`.

Aturan kontras:

- Teks normal minimal 4.5:1 terhadap permukaannya. Teks besar (≥24px atau ≥19px tebal) minimal 3:1.
- `slate-500` adalah batas terendah untuk teks sekunder 12px; jangan turun ke `slate-400` untuk teks yang harus dibaca.
- `amber-200`, `amber-300`, `emerald-300`, dan `#10B981` dilarang sebagai warna teks di permukaan terang.
- Status positif memakai pasangan `success-foreground` / `success-soft` (9,98:1). Jangan memakai kuningan uang untuk status.
- Status tidak boleh dibedakan hanya dengan warna. Selalu sertakan label, ikon, atau bentuk.

Kuningan dan petrol:

- Kuningan logam `#c9a86a` untuk garis dan tepi; `#9c7b3a` untuk garis/ikon; label teks memakai `--gold-foreground #6e5523` agar lolos 4.5:1; `emerald-700 #6e5523` dan `emerald-800 #55421d` hanya untuk angka uang dan nama pemegang.
- Petrol `#1f6a62` (`success`/`sky-600`) untuk status positif, tekstur batik, dan aksen sekunder.
- Kuningan terang hanya di dalam kotak logam bergradasi (`from-amber-200 via-amber-400 to-amber-600`), dengan huruf `--color-slate-950` di atasnya.

Double Line Glow:

- Outer line: `ring-1 ring-[#c9a86a]/35`.
- Inner gap: `ring-offset-2 ring-offset-white/60`.
- Bahu kartu: `border-[#c9a86a]/55` + `shadow-[0_20px_45px_-26px_rgba(28,26,21,0.45)]`.
- Hanya untuk satu titik fokus per layar. Kartu lain memakai permukaan padat tanpa blur.

### 2.2 Tipografi

| Peran | Kelas | Catatan |
| --- | --- | --- |
| Judul bagian | `font-judul` | Georgia, tegak, bobot 500 |
| Frasa penekanan hero | `font-display` | Georgia, miring, satu frasa saja |
| Isi | `font-sans` bawaan | Minimal 16px untuk paragraf di ponsel |
| Label dan metadata | `text-xs` (12px) | Jangan di bawah 12px |
| Angka uang | `tabular-nums` | Cegah lebar angka melompat |
| Nomor kartu, token, hash | `font-mono` | Karakter dibedakan dengan jelas |

Aturan:

- Skala yang dipakai: 12, 14, 16, 18, 20, 24, 32, 40. Jangan menambah ukuran acak.
- Teks UI minimal 12px. Ukuran 10-11px hanya untuk pengecualian dekoratif: poster promo, ilustrasi/kartu contoh, cap "Dicatat", dan wordmark. Jangan memakai 10-11px untuk label, metadata, tombol, atau keterangan formulir.
- Line-height isi 1.5-1.75. Judul pendek boleh 1.1-1.25.
- Panjang baris nyaman 60-75 karakter di desktop dan 35-60 di ponsel.
- Bobot hierarki: 600-700 untuk judul, 500 untuk label, 400 untuk isi.
- Jangan memakai `tracking` rapat pada isi. Huruf kapital berjarak hanya untuk label kecil.
- Judul boleh membungkus alami. Jangan memaksa satu kata ke baris terakhir dengan `&nbsp;` berlebihan.
- URL, ID, dan teks pengguna panjang memakai `overflow-wrap: anywhere` pada anak yang bisa menyusut, bukan `word-break: break-all` pada prosa.

### 2.3 Spasi, radius, dan bayangan

Ritme spasi 4/8. Jarak bagian desktop 56-64px, ponsel 40px. Celah grid desktop 32-40px, ponsel 24px. Padding kartu desktop 24px, ponsel 16px. Padding kartu halaman masuk 24px di ponsel dan 32px di desktop. Yang dipadatkan hanya ruang, bukan sasaran: tap target tetap minimal 44px.

Radius menyatakan ukuran benda, bukan selera:

Tiga peran saja. Jangan menambah tingkat radius keempat untuk kontrol baru.

| Peran | Kelas | Contoh |
| --- | --- | --- |
| Kontrol: tombol, bidang isian, pilihan, popover | `rounded-lg` | `src/components/ui/button-variants.ts`, `input.tsx`, `select.tsx`, `textarea.tsx` |
| Permukaan: kartu, panel, dialog, kartu angka | `rounded-2xl` | `src/components/ui/card.tsx`, `dialog.tsx` |
| Pil: badge, chip status, tab, tombol bulat | `rounded-full` | `src/components/ui/badge-variants.ts`, `tabs.tsx`, `StatusBadge.tsx` |

Pengecualian yang dipertahankan: lembar folio ruang pendana memakai `rounded-lg` karena ia kertas kerja, bukan kartu maupun kontrol.

Bayangan:

- Tombol dan kartu daftar memakai garis rambut, bukan bayangan.
- Bayangan bertinta hanya untuk permukaan fokus.
- Satu titik fokus per layar. Jangan menumpuk blur, glow, dan bayangan besar pada beberapa kartu sekaligus.

### 2.4 Gerak

Token di `src/index.css` dan `src/lib/motion.ts`:

| Token | Nilai | Pemakaian |
| --- | --- | --- |
| `--motion-fast` | 120ms | Hover, tekan, tooltip, transisi warna |
| `--motion-normal` | 200ms | Panel, tab, lencana |
| `--motion-slow` | 380ms | Reveal, dialog, bagian panjang |
| `--motion-stagger` | 80ms | Jeda antar-anak daftar |
| `--motion-ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Masuk dan selesai |
| `--motion-ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Gerakan bolak-balik |

Aturan:

- Hanya `opacity` dan `transform`. Jangan menganimasikan `width`, `height`, `top`, `left`, atau `margin`.
- Keluar lebih cepat dari masuk, sekitar 60-70% durasi masuk.
- Animasi harus bisa dibatalkan dan tidak boleh menahan input.
- Saat `prefers-reduced-motion: reduce`, tampilkan keadaan akhir tanpa gerak non-esensial.
- Satu layar cukup 1-2 elemen bergerak. Gerak harus menjelaskan sebab-akibat, bukan hiasan.

### 2.5 Lapisan z-index

Gunakan skala ini, jangan angka baru:

| Lapisan | Nilai | Contoh |
| --- | --- | --- |
| Dasar | 0 | Isi halaman |
| Sticky | 10-20 | Ringkasan, kepala bagian |
| Navigasi | 30 | Bilah bawah, chip menu |
| Kepala | 40 | Header lengket |
| Overlay | 50 | Dialog, sheet, scrim |
| Notifikasi | 100 | Toast |

### 2.6 Breakpoint

Uji di 375px, 768px, 1024px, dan 1440px. Tailwind: `sm` 640, `md` 768, `lg` 1024, `xl` 1280.

- Mobile-first: susun untuk 375px lebih dulu.
- Tanpa gulir mendatar di halaman. Tabel lebar boleh menggulir di dalam wadahnya sendiri.
- `min-h-dvh`, bukan `100vh`, untuk layar penuh di ponsel.
- Hormati `env(safe-area-inset-*)` pada header, bilah bawah, dan tombol aksi tetap.

## 3. Aturan komponen

### A. Kartu hero PINDAI

- Rasio kartu kredit standar: `aspect-[1.586/1]`.
- Bingkai `rounded-2xl` dengan garis ganda kuningan: ring luar dan celah kertas di dalamnya, bukan pendaran emerald.
- Permukaan kertas gading berkaca: `linear-gradient(135deg, rgba(255,255,255,0.94) → rgba(241,237,227,0.92))` + blur 24px, garis kuningan, dan pantulan lembut.
- Motif ombak biru laut `#326eb1`: empat garis swell sejajar, bergeser 8 satuan ke bawah, wash `rgba(50,110,177,0.16)`, aksen `#9bcdf0` di puncak, titik kuningan `#c9a86a` pada dua puncak. Unit 64 × 40 pada bidang 420 × 265; sambungan kiri-kanan memakai kemiringan yang sama. Opasitas 56%.
- Teks kartu memakai tinta gelap atau kuningan di atas kertas gading. Nomor memakai monospace; masa berlaku lebih kecil.
- Kiri atas: wordmark PINDAI tinta. Kanan atas: simbol Mastercard, wordmark, dan contactless dalam satu kelompok. Chip logam kuningan di kiri tengah.
- Font Mastercard tidak dibundel. Gunakan `Mark for MC` bila tersedia, fallback Helvetica/Arial.
- Area kanan lainnya kosong. Jangan menambah ornamen yang tidak ada pada motif.
- Hover kartu: `hover:scale-[1.02] transition-transform duration-500` dengan pantulan cahaya halus di permukaan kertas. Jangan menggeser tata letak di sekitarnya.

### B. Tombol dan tautan

- Satu aksi utama per layar. Daftar dan antrean boleh punya aksi per baris asalkan aksinya jelas dan tidak bersaing dengan aksi utama halaman. Aksi sekunder memakai `variant="outline"` atau `ghost`.
- Tombol ikon wajib punya `aria-label`; ikon dekoratif di samping teks memakai `aria-hidden`.
- Saat proses berjalan: nonaktifkan tombol, tampilkan spinner, dan cegah klik ganda.
- Umpan balik tekan 80-150ms. Jangan menggeser tata letak saat ditekan.
- Fokus keyboard terlihat dengan `ring` dan `ring-offset`. Jangan menghapus outline tanpa pengganti.
- Tautan navigasi memakai `<a>`/`<Link>`, bukan tombol yang berpura-pura menjadi tautan.
- Umpan balik keamanan: meter kekuatan kata sandi dan pemangkas token 32 karakter tampil real-time. Status memakai kuningan atau merah yang tetap lolos kontras, bukan emerald terang.

### C. Formulir

- Label terlihat di setiap bidang. Placeholder hanya contoh, bukan label.
- Tanda wajib, teks bantuan untuk bidang rumit, dan pesan galat spesifik di bawah bidang.
- Hubungkan galat dengan `aria-describedby`; gunakan `role="alert"` atau `aria-live` untuk galat yang muncul setelah kirim.
- Setelah kirim gagal dengan beberapa galat, fokuskan ringkasan galat di atas, lalu tautkan tiap butir ke bidangnya. Galat inline tetap dipertahankan.
- Validasi saat blur, bukan setiap ketikan.
- Gunakan tipe input semantik (`email`, `tel`, `number`) dan `autocomplete` agar pengelola kata sandi dan isi otomatis bekerja.
- Bidang kata sandi punya tombol tampil/sembunyikan.
- Formulir panjang menyimpan draf. Tinggalkan halaman dengan perubahan belum tersimpan harus meminta konfirmasi.
- Tombol kirim menampilkan status memuat, sukses, dan gagal. Jangan hanya mengandalkan toast.
- Di ponsel, tinggi bidang minimal 44px.

### D. Kartu dan permukaan

- Kaca hanya untuk panggung landing (hero/kartu contoh) dan kartu auth. Seluruh permukaan operasional, termasuk nav, dock aksi, kartu data, catatan, dan modal, memakai permukaan solid bertoken `--card`.
- Satu titik fokus kaca per layar landing. Sisanya padat.
- Jangan mencampur radius berbeda dalam satu baris kontrol.
- Kartu daftar memakai garis rambut dan latar putih, bukan bayangan besar.
- Kartu yang bisa diklik harus punya keadaan hover, fokus, dan tekan yang jelas, serta target sentuh penuh.

### D.1 Landasan beranda

- Urutan beranda dibaca sebagai satu dokumen: hero, batas layanan, produk dan banding, satu slot promo, kalkulator dan tarif, demo dan dokumen, panduan, pertanyaan umum, penutup. Program apresiasi tidak lagi menjadi bagian badan beranda; aplikasi dan ruang pendana tinggal di footer. Jangan menambah bagian baru tanpa menghapus atau menggabungkan bagian yang menjawab pertanyaan yang sama.
- Header desktop hanya lima tujuan: Produk (dropdown), Biaya, Cara kerja, Keamanan, FAQ. Menu ponsel memakai kelompok Produk, Panduan, dan Lainnya. Aplikasi dan ruang pendana tinggal di footer.
- Satu slot promo di atas kalkulator. Banner gambar, promo pinjaman, dan promo bunga tidak ditumpuk dalam satu layar.
- Satu aksi utama per viewport. CTA tamu menuju `/auth?returnTo=%2Fdashboard%3Ftab%3Dform`, bukan halaman masuk tanpa tujuan. Label tombol dan tujuan sesudah masuk harus sama.
- Produk memakai tiga kartu kebutuhan, lalu strip dua jalur akad, lalu tabel banding tiga baris. Jangan memisahkan taksonomi jalur dan layanan ke dua bagian yang berjauhan.
- Kalkulator dan tarif berlaku berbagi satu band. Kalkulator memakai token permukaan, `rounded-2xl`, dan `aria-valuetext` berupa rupiah pada slider nominal.
- Demo berhenti saat keluar layar, tombol Jeda ada di kepala kartu, dan bingkai layar memakai identitas PINDAI, bukan tiruan jendela peramban.
- Teks isi minimal 14px. 12px hanya untuk label, metadata, dan cap. Jangan memakai 12px untuk paragraf atau daftar dokumen.
- CTA lengket ponsel hanya muncul setelah hero lewat dan hilang saat penutup atau footer masuk. Beri `scroll-padding-bottom` agar kontrol terakhir tidak tertutup.
- Status dan uang tetap dipisah: petrol untuk status positif, kuningan untuk nilai uang. Produk konvensional memakai petrol; syariah memakai kuningan.

### E. Tabel dan angka

- Angka uang memakai `formatRupiah` dan `tabular-nums`.
- Tanggal memakai zona waktu WIB dan format Indonesia yang konsisten.
- Tabel lebar menggulir di dalam wadahnya, bukan membuat halaman menggulir mendatar.
- Kepala tabel melekat saat digulir bila daftar panjang.
- Tabel yang bisa diurutkan memakai `aria-sort` dan tombol urut yang bisa dioperasikan keyboard.
- Status memakai badge dengan label teks, bukan warna saja.
- Sel kosong memakai `-` atau keterangan, bukan `NaN`, `undefined`, atau angka palsu.

### F. Navigasi

- Peminjam: sidebar di desktop, bilah bawah di ponsel. Lima menu: Ringkasan, Cicilan, Ajukan, Catatan, Akun. Profil & Rekening dan Verifikasi KYC berbagi halaman Akun lewat sub-pilihan 44px.
- Deep link lama `?tab=diri` dan `?tab=kyc` tetap sah: keduanya membuka Akun dengan subbagian yang benar, dan menu Akun menyala. Jangan menghapus alias ini selama tautan notifikasi lama masih tersimpan.
- Jangan menambah item keenam ke bilah bawah. Menu baru harus masuk ke salah satu dari lima tujuan itu atau menjadi sub-pilihan di dalamnya.
- Pendana: navigasi jangkar dan tab di dalam satu halaman panjang. Jangan menambah bilah bawah baru.
- Admin: sidebar desktop, lima grup di ponsel, strip chip modul, dan pencarian menu. Modul aktif disimpan di `?tab=`.
- Label navigasi selalu disertai ikon; ikon saja tidak cukup.
- Posisi navigasi konsisten antar halaman. Jangan mencampur tab, sidebar, dan bottom nav pada hierarki yang sama.
- Setelah pindah halaman, pindahkan fokus ke `#konten` dan gulir ke atas.
- Tombol kembali peramban harus mengembalikan halaman, filter, dan posisi gulir yang wajar.
- Aksi berbahaya (keluar, hapus akun) dipisah dari navigasi biasa.

### G. Dialog, sheet, dan overlay

- Selalu ada tombol tutup yang terlihat, `Esc` berfungsi, dan fokus terperangkap di dalam dialog.
- Scrim harus cukup kuat memisahkan isi latar; ukur kontras terhadap latar sebenarnya.
- Sheet dengan perubahan belum tersimpan meminta konfirmasi sebelum ditutup.
- Dialog bukan pengganti navigasi utama.
- Fokus kembali ke pemicu setelah dialog ditutup.

### H. Badge, chip, dan label

- Chip dan badge boleh membungkus. Jangan mengecilkan label sampai tidak terbaca.
- Koleksi chip yang panjang membungkus atau memakai tombol `+n` yang bisa dioperasikan, bukan menyembunyikan nilai.
- Label penting tetap utuh. Bila terpaksa terpotong, sediakan jalur baca penuh untuk keyboard, pointer, dan sentuh.
- Status memakai teks dan ikon; warna hanya penguat.
- Lencana angka pada navigasi memakai kalimat kontekstual untuk pembaca layar, bukan angka telanjang.

### I. Kosong, memuat, dan galat

- Memuat: skeleton yang mengikuti bentuk akhir, bukan spinner penuh layar untuk data yang bisa ditampilkan bertahap.
- Layar penuh hanya untuk boot pertama dan gerbang sesi (`LoadingScreen`). Perpindahan rute memakai bilah tipis `RouteLoading`, bukan splash brankas.
- Splash memakai kertas hangat `#f8f6f1`, tinta `#0f3d3a`, garis `#e3ddd0`, dan label `#6f6858`; jangan memakai slate dingin lama.
- Dial dan garis pindai bergerak satu kali. Hanya bilah proses yang berulang. Saat `prefers-reduced-motion`, semua kecuali denyut opasitas bilah dimatikan.
- Setelah 8 detik, layar penuh wajib menampilkan “Masih menyiapkan. Koneksi mungkin lambat.” dan tombol “Muat ulang”. Jangan menahan pengguna tanpa jalan keluar.
- Kosong: jelaskan mengapa kosong dan beri satu aksi berikutnya.
- Galat: sebutkan sebab dan cara memulihkan, plus tombol coba lagi.
- Jangan menampilkan `NaN`, `undefined`, `0` palsu, atau grafik kosong tanpa keterangan.
- Reservasi ruang untuk data asinkron agar tata letak tidak melompat (CLS < 0.1).

### J. Grafik dan data

- Palet kategorikal default: `--chart-1 #1f6a62` (petrol), `--chart-2 #8a641f` (kuningan tua), `--chart-3 #5c5688` (violet), `--chart-4 #3f6f8a` (baja), `--chart-5 #a05a4a` (terakota). Kelima hue harus tetap berbeda di semua preset; jangan mengganti menjadi gradasi satu warna.
- Setiap seri grafik minimal 3:1 terhadap kanvas. Uji `src/lib/kontrasWarna.test.ts` menjaga lima token ini.
- Jenis grafik mengikuti data: tren garis, perbandingan batang, proporsi donat maksimal lima kategori.
- Legenda terlihat dan dekat grafik. Tooltip bisa diakses keyboard, bukan hanya hover.
- Sediakan ringkasan teks atau `aria-label` untuk pembaca layar.
- Jangan memakai merah/hijau saja. Tambahkan pola, bentuk, atau label.
- Sumbu memakai satuan dan format angka Indonesia. Label sumbu tidak berdesakan di ponsel.
- Data kosong dan gagal muat punya keadaan sendiri, bukan grafik kosong.
- Animasi masuk grafik mengikuti `prefers-reduced-motion`; data harus terbaca segera.

### K. Peta

- Peta Leaflet memuat tile dari OSM/Carto. Atribusi tidak boleh dihapus.
- Marker lokasi tidak boleh menjadi satu-satunya cara membaca status; sediakan daftar atau teks.
- Wadah peta punya tinggi tetap dan `aria-label`; interaksi peta tidak boleh menangkap gulir halaman tanpa izin pengguna.
- Jangan menampilkan lokasi presisi peminjam ke sesi kode akses bersama. Batas ini ditegakkan server, bukan hanya UI.

## 4. Aturan per peran

### Peminjam

- Fokus: kewajiban terdekat, status pengajuan, dan langkah berikutnya.
- Ringkasan menampilkan satu tagihan terdekat dan tiga angka pokok; jangan menumpuk semua modul di atas lipatan.
- KYC menampilkan tahap, kekurangan, dan satu aksi utama. Status `VERIFIED` bukan persetujuan pinjaman; jelaskan perbedaannya.
- Pengajuan panjang menyimpan draf dan meminta konfirmasi saat ditinggalkan.
- Bukti pembayaran menjelaskan bahwa status lunas mengikuti verifikasi petugas, bukan unggahan nasabah.
- Jangan menampilkan angka yang belum ada sebagai nol. Gunakan keadaan kosong yang jujur.

### Pendana

- Ruang pendana adalah portofolio pribadi. Jangan menampilkan posisi pendana lain kepada akun pendana.
- Nama peminjam ditampilkan tersamar untuk akun pendana dan pemantau. Berkas identitas hanya untuk peran `dana` dan `admin`.
- Peringatan risiko tampil sebelum angka keuntungan.
- Bedakan tegas uang yang sudah dibukukan dan yang masih perkiraan.
- Satu aksi utama: menambah penempatan atau membaca laporan. Aksi lain subordinate.
- Jangan menjanjikan hasil. Kalimat "estimasi, bukan jaminan" dipertahankan.

### Admin

- Meja kerja mengutamakan antrean yang menunggu keputusan, lalu KPI, lalu grafik.
- TOTP wajib sebelum data operasional dimuat. Jangan menampilkan data admin di balik gate yang belum terverifikasi.
- Aksi destruktif memakai warna bahaya, konfirmasi, dan alasan tertulis bila relevan.
- Setiap tindakan yang mengubah uang atau status meninggalkan jejak audit.
- Kepadatan tinggi diperbolehkan, tetapi hierarki harus jelas: judul modul, ringkasan, antrean, detail.
- Kepala admin punya sakelar tampilan **Dim** dan **Padat** (44px, `role="switch"`), tersimpan di `localStorage` dan diterapkan sebagai `data-admin-tema`/`data-admin-padat` pada `<html>`. CSS-nya hanya boleh menyasar `.admin-shell`; jangan mengubah tema global atau ruang peran lain.
- Pencarian menu dan `Ctrl+B`/`Cmd+B` harus tetap berfungsi; jangan menambah pintasan yang bertabrakan dengan input.

## 5. Aksesibilitas dan ketahanan teks

- Kontras teks 4.5:1; teks besar 3:1; ikon dan batas kontrol 3:1.
- Fokus keyboard terlihat di semua kontrol, termasuk di dalam dialog dan di bawah sticky header.
- Urutan fokus mengikuti urutan visual. `Tab` tidak boleh masuk ke elemen tersembunyi.
- Sediakan tautan "Lewati ke konten" dan heading `h1` sampai `h6` yang berurutan.
- Setiap gambar bermakna punya alt; gambar dekoratif memakai alt kosong.
- Ikon dekoratif di samping teks memakai `aria-hidden="true"`. Ikon mandiri yang bermakna punya nama aksesibel.
- Tombol ikon memakai `aria-label`; kontrol yang bisa dipilih mengumumkan keadaan `aria-pressed`/`aria-expanded`.
- Jangan mengandalkan hover. Semua aksi tersedia lewat klik, sentuh, dan keyboard.
- Target sentuh minimal 44×44px; jarak antar target minimal 8px.
- Hormati `prefers-reduced-motion` dan pembesaran teks sistem. Uji teks 200% tanpa terpotong.
- Jangan menonaktifkan zoom (`user-scalable=no`).
- Formulir: label, petunjuk, galat inline, ringkasan galat, dan `aria-live` untuk galat.
- Autentikasi: izinkan pengelola kata sandi dan tempel kode. Sediakan jalur non-kognitif.
- Konten berputar otomatis punya tombol jeda dan berhenti saat fokus atau reduced motion.
- Drag-and-drop punya alternatif tombol dan keyboard.
- Toast tidak merebut fokus; pengumuman memakai `aria-live="polite"`.
- Dijaga `src/lib/kontrasWarna.test.ts` (kontras token teks dan batas kontrol) dan `src/lib/targetSentuhUi.render.test.tsx` (sampel landing, kalkulator, navigasi peminjam).

## 6. Copy dan data

- Bahasa Indonesia, langsung, dan tenang. Hindari filler seperti "wujudkan sinergi finansial Anda".
- Label fungsional: "Catat pelunasan", "Verifikasi sertifikat", "Ajukan pinjaman".
- Hindari em dash pada teks UI. Gunakan titik dua, koma, atau tanda hubung biasa.
- Sebut angka apa adanya. Jangan membulatkan diam-diam atau mengarang nilai contoh.
- Bedakan "sudah dibayar", "menunggu verifikasi", dan "tercatat lunas".
- Galat menyebutkan sebab dan langkah berikutnya, bukan hanya "Terjadi kesalahan".
- Konfirmasi destruktif menyebut objek dan akibatnya.
- Tanggal dan waktu memakai WIB. Mata uang memakai `Rp` dan pemisah ribuan Indonesia.
- Jangan menampilkan data pribadi di URL, log, atau pesan galat.

## 7. Anti-pola

- Mode gelap, `dark:` baru, atau permukaan obsidian di halaman mana pun.
- Gradien ungu/pink, biru SaaS generik, atau neon.
- Emoji sebagai ikon navigasi, status, atau kontrol.
- Kaca, blur, dan glow di banyak kartu sekaligus.
- Label hanya di placeholder; galat hanya di atas form.
- Status hanya warna; angka tanpa label; grafik tanpa legenda.
- Tombol tanpa label aksesibel; ikon tanpa nama.
- Menghapus focus ring; hover-only; target di bawah 44px.
- Animasi yang menggeser tata letak, durasi 0ms, atau satu durasi untuk semua transisi.
- Dialog untuk navigasi utama; sheet tanpa tombol tutup.
- Tabel yang membuat seluruh halaman menggulir mendatar.
- Data palsu, `NaN`, `undefined`, atau angka nol sebagai pengganti "belum ada".
- Menampilkan identitas peminjam ke sesi kode akses bersama.
- Menambah dependensi atau pustaka UI baru tanpa kebutuhan yang jelas.

## 8. Checklist pra-rilis

### Proses

- [ ] Sudah membaca `SKILL.md` dan mencari aturan UX yang relevan.
- [ ] Sudah memeriksa `quick-reference.md` §1-§3 (Accessibility, Touch, Performance) untuk perubahan besar.
- [ ] Diuji di 375px, 768px, 1024px, dan 1440px.
- [ ] Diuji dengan reduced motion, pembesaran teks 200%, dan keyboard saja.
- [ ] Diuji dengan data kosong, memuat, galat, dan data panjang.

### Visual

- [ ] Tidak ada mode gelap atau `dark:` baru. Dim admin bukan tema gelap dan tidak bocor ke peran lain.
- [ ] Kaca hanya di landing/auth; nav, kartu kerja, dan modal solid.
- [ ] Satu titik fokus kaca per layar landing; kartu lain padat.
- [ ] Radius mengikuti tiga peran: kontrol `rounded-lg`, permukaan `rounded-2xl`, pil `rounded-full`.
- [ ] Teks UI minimal 12px; 10-11px hanya pada poster/ilustrasi yang didokumentasikan.
- [ ] Dim dan Padat admin tidak mengubah ruang nasabah/pendana.
- [ ] Ikon dari Lucide, konsisten, tanpa emoji.
- [ ] Angka uang memakai `tabular-nums` dan format Rupiah.
- [ ] Tidak ada teks terpotong tanpa jalur baca penuh di 375px.

### Interaksi

- [ ] Semua kontrol punya fokus keyboard yang terlihat.
- [ ] Target sentuh ≥44px dan jarak ≥8px.
- [ ] Tombol memuat nonaktif dan menampilkan progres.
- [ ] Aksi destruktif memakai konfirmasi dan warna bahaya.
- [ ] Dialog punya tombol tutup, `Esc`, dan fokus kembali ke pemicu.
- [ ] Tidak ada aksi yang hanya bisa hover atau drag.

### Aksesibilitas

- [ ] Kontras teks ≥4.5:1 dan kontrol ≥3:1.
- [ ] Label, petunjuk, dan galat form terbaca pembaca layar.
- [ ] Status tidak hanya warna.
- [ ] Heading berurutan; `aria-label` ada pada tombol ikon.
- [ ] `prefers-reduced-motion` dihormati.
- [ ] Fokus tidak tertutup sticky header, banner, atau sheet.

### Data dan peran

- [ ] Ruang pendana tidak mengirim posisi pendana lain ke akun pendana.
- [ ] Berkas identitas hanya untuk `dana`/`admin`, bukan sesi kode bersama.
- [ ] Peringatan risiko tampil sebelum angka keuntungan.
- [ ] Status "lunas" mengikuti verifikasi, bukan unggahan bukti.
- [ ] Tidak ada `NaN`, `undefined`, atau angka palsu.
- [ ] Tabel lebar menggulir di wadahnya, bukan halaman.
- [ ] Perubahan uang/status meninggalkan audit trail.

## 9. Catatan perubahan

- 2026-10-30: layar pemuatan dirapikan menjadi “Brankas Tenang”: palet kertas hangat, dial dan scan satu kali, bilah rute terpisah, label kontekstual, serta fallback koneksi lambat setelah 8 detik.
- 2026-10-30: override desain: menu peminjam menjadi lima dengan halaman Akun; token `success` memisahkan status dari uang; kaca dibatasi ke landing/auth; admin mendapat Dim/Padat; radius disederhanakan menjadi tiga peran; palet grafik kategorikal; microtype UI minimal 12px.
- 2026-10-30: beranda dirampingkan: header lima tujuan dengan dropdown produk, satu slot promo, produk dan banding menyatu, kalkulator dan tarif satu band, demo berhenti di luar layar, dokumen tanpa langkah ganda, pendana menjadi strip, CTA tamu langsung ke formulir, dan CTA lengket mengikuti posisi gulir.
- 2026-10-30: `DESIGN.md` diperbarui memakai UI/UX Pro Max. Antislop diganti; token, tipografi, gerak, aturan per peran, dan checklist dirapikan. Keputusan satu wajah terang tetap berlaku.
- 2026-10-30: audit aksesibilitas landing, dashboard peminjam, dan ruang pendana. Target sentuh 44px, fokus keyboard, tautan lewati konten, batas input 3:1, serta uji `kontrasWarna` dan `targetSentuhUi` ditambahkan.
- 2026-10-12: seluruh halaman memakai satu wajah terang; preset gelap `obsidian` dicabut; kartu hero landing ikut cerah.
