# DESIGN.md — PINDAI UI/UX & Visual Direction

Note for AI Coding Agents (anti-slop compliance):
This file supplies explicit, intentional visual direction for PINDAI. anti-slop filters generic AI outputs; this document defines the actual aesthetic, spatial, and functional parameters to build.

## 1. Brand Identity & Aesthetic Concept

Theme: Warm Paper, Polished Brass, & Double Line Glow

PINDAI is a premium, high-security fintech platform. The visual identity bridges Indonesian heritage (Batik Mega Mendung) with layered paper-and-glass financial UI.

Primary Persona: High-end wealth tracking, credit asset verification, and super-admin ledger control.

Core Feel: Exclusive, reassuringly heavy, clean, and high-tech (tactile glass and subtle glow).

Anti-Slop Directive: No generic centered cards with plain black backgrounds, no random floating particles, and no rounded buttons with generic blue gradients. Every element must feel weighted, purposeful, and polished. Tidak ada permukaan gelap di halaman publik: bobot dan kontras dibawa tepi, tekstur, dan bayangan.

### Satu wajah: mode terang (keputusan pemilik)

Seluruh halaman — nasabah, verifikasi aset, ruang Pendana, meja kerja super-admin, dan halaman masuk — memakai **satu wajah terang**: preset bawaan `tinta` (kertas hangat, hijau tinta, kuningan).

Wajah gelap `obsidian` yang sempat dicoba **dicabut seluruhnya**: presetnya tidak lagi terdaftar di `src/lib/system-config.ts`, kartunya hilang dari panel admin, dan blok token gelapnya dihapus dari `src/index.css`. Tidak ada lagi aturan yang cocok dengan `data-theme="obsidian"` maupun `data-wajah="obsidian"`, jadi tidak ada jalan mengaktifkan tampilan gelap.

Catatan status: kartu hero landing (`components/landing/KartuHeroPindai.tsx`) kini juga **cerah**. Keputusan pemilik 2026-10-12: permukaan obsidian pada kartu ditinggalkan supaya titik fokus halaman ikut satu wajah terang, dan tidak ada lagi token gelap yang tersisa di kartu itu. Permukaan barunya kertas hangat berkaca; bobot dan kemewahannya dibawa tepi kuningan, tekstur batik, dan bayangan bertinta — lihat §3A.

## 2. Color Palette & Lighting System

### Base Colors (Warm Paper, berkaca)

Berlaku sejak kartu hero memakai permukaan cerah (2026-10-12):

- Kertas hangat: `#ffffff` sampai `#f1ede3` (token `slate-50`/`slate-100`/`secondary`)
- Kaca kertas (satu titik fokus per layar): putih `0.90`–`0.94` opasitas + `backdrop-blur-2xl`
- Tepi & bayangan: garis kuningan `#c9a86a` (alpha 35–55%) dan bayangan bertinta `rgba(28,26,21,0.45)`

Nilai gelap lama (`#030712`, `#0b0f19`, `bg-slate-950/90`) tidak dipakai lagi di halaman publik.

### Accent Colors (Kuningan & Petrol)

Di permukaan terang hanya nilai gelapnya yang lolos kontras, jadi yang dipakai harian adalah turunannya, bukan rona terangnya:

- Kuningan logam (aksen): `#c9a86a` untuk garis/tepi, `#9c7b3a` untuk label di atas kertas, `emerald-700 #6e5523` dan `emerald-800 #55421d` untuk angka, status, dan nama pemegang.
- Petrol (penyeimbang): `#1f6a62` (`sky-600`) untuk tekstur batik dan aksen sekunder.
- Kuningan terang (khusus di dalam kotak logam bergradasi, mis. tanda logo dan chip): `from-amber-200 via-amber-400 to-amber-600`, dengan huruf `--color-slate-950` di atasnya (7.5:1).
- Rona terang `amber-200`/`amber-300`/`emerald-300` dan emerald pekat `#10B981` **dilarang sebagai warna teks di permukaan terang** (2.3–4.2:1).

### Double Line Glow

- Outer Line: `ring-1 ring-[#c9a86a]/35`
- Inner Gap (tepi kertas): `ring-offset-2 ring-offset-white/60`
- Bahu kartu: `border-[#c9a86a]/55` + `shadow-[0_20px_45px_-26px_rgba(28,26,21,0.45)]`

### Cara palet dirender (preset `tinta`)

Skala utilitas Tailwind di proyek ini dipetakan ulang per preset, jadi kelas nama-warna baru menghasilkan warna yang dimaksud **ketika presetnya aktif**. Di preset bawaan `tinta` (`src/index.css`), nilai yang dipakai ditulis di blok `@theme` dan `:root`: `slate` adalah netral kertas hangat (permukaan terang, tinta gelap), `emerald` menanggung kuningan untuk nilai uang & status positif, `amber` menanggung oranye bata untuk peringatan, dan `sky` menanggung hijau tinta tua sebagai aksen brand. Empat preset lain (`pesisir`, `terakota`, `salju`, `karnival`) memetakan ulang skala yang sama dengan paletnya sendiri.

## 3. Component Design Rules

### A. The Hero Card (PINDAI Physical & Digital Asset)

- Aspect Ratio: Standard credit card aspect ratio (`aspect-[1.586/1]`).
- Frame: Rounded-2xl dengan garis ganda kuningan (ring luar + celah kertas di dalamnya), bukan pendaran emerald.
- Surface: Kertas gading berkaca (`linear-gradient(135deg, rgba(255,255,255,0.94) → rgba(241,237,227,0.92))` + blur 24px) dengan garis kuningan dan pantulan lembut.
- Texture Pattern: Mega Mendung biru langit (`#5b9bd5`, opasitas 15%). Lengkung awan bertingkat memakai garis luar dan garis kontur berulang dalam unit 180 × 120; teksturnya halus agar data kartu tetap mudah dibaca.

Card Details:

- Top Left: wordmark PINDAI tinta. Kanan atas menampilkan simbol lingkaran merah-oranye dan tulisan `mastercard`; teks memakai `Mark for MC` bila tersedia pada perangkat, dengan fallback Helvetica/Arial sesuai panduan Mastercard. Font Mastercard tidak dibundel karena tidak ditemukan aset font resmi yang tersedia untuk penggunaan publik.
- Center Left: chip logam kuningan (garis kontak `emerald-900/35`, tepi `emerald-800/30`).
- Bottom: nomor monospace `text-emerald-800`, tanggal `12/29` monospace `text-slate-900`, nama pemegang `text-slate-900`, dan label kecil `text-slate-600` agar terbaca di atas permukaan terang.
- Logo Mastercard adalah penanda brand kartu; area kanan lain tetap kosong agar tidak menambah ornamen yang tidak perlu.
- Top right: wordmark Mastercard dan ikon contactless berada dalam satu kelompok agar identitas jaringan kartu mudah dikenali.

### B. Typography & Micro-copy

- Headings: High-contrast sans-serif or clean serif headers paired with subtle gold/emerald highlights.
- Data Monospace: Monospace font for card numbers, token codes, and cryptographic hashes.
- Copywriting Tone: Professional, authoritative, and concise. Avoid AI filler like "Unlock your financial synergy". Use direct functional labels (e.g., "Pencatatan Ledger", "Verifikasi Sertifikat").

### C. Layout & Micro-Interactions

- Card Hover State: Smooth 3D tilt effect (`hover:scale-[1.02] transition-all duration-500`) with dynamic light reflection over the glass surface.
- Security Feedback: Password strength meters and 32-character token auto-trimmers must render in real-time with sharp emerald status indicators.

## 4. Anti-Slop Checkpoints for PINDAI

- No Generic Cards, and glass stays at the focal point (keputusan pemilik): kaca kertas cerah + garis ganda kuningan hanya untuk **satu titik fokus per layar** (mis. kartu hero, atau satu kartu angka utama). Kartu lain memakai permukaan padat, tanpa blur dan tanpa pendaran; garis emerald tipis boleh tetap ada sebagai penanda batas. Teknik kaca/glow di tempat lain harus punya alasan tertulis, bukan diulang karena resep ini ada.
- No Placeholder Icons: Do not sprinkle unnecessary shopping cart or world icons on credit cards or dashboards.
- No Mismatched Gradients: Gradients are strictly reserved for Gold metallic finishes (`from-amber-200 via-amber-400 to-amber-600`) and Emerald lighting cues.
- Authentic Cultural Fusion: motif batik Mega Mendung biru langit tetap halus (`opacity-15`), sebagai tekstur latar yang bermakna, bukan grafis yang mendominasi.
