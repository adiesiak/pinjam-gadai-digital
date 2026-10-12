# DESIGN.md — PINDAI UI/UX & Visual Direction

Note for AI Coding Agents (anti-slop compliance):
This file supplies explicit, intentional visual direction for PINDAI. anti-slop filters generic AI outputs; this document defines the actual aesthetic, spatial, and functional parameters to build.

## 1. Brand Identity & Aesthetic Concept

Theme: Black Obsidian Glass, Polished Gold, & Double Emerald Glow

PINDAI is a premium, high-security fintech platform. The visual identity bridges Indonesian heritage (Batik Parang) with ultra-modern, glassmorphic financial UI.

Primary Persona: High-end wealth tracking, credit asset verification, and super-admin ledger control.

Core Feel: Exclusive, reassuringly heavy, clean, and high-tech (tactile glass and subtle glow).

Anti-Slop Directive: No generic centered cards with plain black backgrounds, no random floating particles, and no rounded buttons with generic blue gradients. Every element must feel weighted, purposeful, and polished.

### Dua wajah, satu sistem (keputusan pemilik)

Satu sistem tema, dua wajah yang dipilih lewat preset tema:

- **Wajah publik (preset bawaan `tinta`)** — nasabah peminjam/penggadai: kertas hangat, hijau tinta, kuningan. Hangat, ramah, membumi.
- **Wajah premium (preset `obsidian`)** — verifikasi aset, ruang Pendana, dan meja kerja super-admin: obsidian, emas metalik, pendaran emerald.

Keduanya berbagi token, tipografi, kosakata, dan komponen yang sama. Yang berganti hanya palet preset — bukan struktur, bukan susunan halaman, bukan nama istilah.

## 2. Color Palette & Lighting System

### Base Colors (Obsidian Glass)

- Background Deep: `#030712` (`bg-slate-950`)
- Glass Container: `#0b0f19` with 80-90% opacity (`bg-slate-950/90`)
- Backdrop Blur: `backdrop-blur-2xl` / `backdrop-blur-md`

### Accent Colors (Gold & Emerald)

- Gold Metallic Primary: `#D4AF37` / `#F59E0B` (`text-amber-300`, `from-amber-200 via-amber-400 to-amber-600`)
- Emerald Glow: `#10B981` / `#059669` (`emerald-500`, `emerald-600`)

### Double Line Glow

- Inner Ring: `ring-1 ring-emerald-500/60`
- Outer Shadow/Glow: `shadow-[0_0_50px_-12px_rgba(16,185,129,0.3)]`

### Cara kelas di atas dirender (preset `obsidian`)

Skala utilitas Tailwind di proyek ini dipetakan ulang per tema, jadi kelas di atas baru menghasilkan warna yang dimaksud **ketika preset `obsidian` aktif**. Di preset itu nilainya dikunci seperti ini (`src/index.css`):

| Kelas | Dirender sebagai |
|---|---|
| `bg-slate-950` | `#030712` (Background Deep) |
| `bg-slate-950/90` | permukaan kaca; `bg-white` juga menjadi `#0b0f19` (Glass Container) |
| `emerald-500` / `emerald-600` | `#10B981` / `#059669` |
| `text-emerald-300` | `#2fd39b` (terbaca di latar gelap) |
| `amber-200` → `amber-400` → `amber-600` | `#fde68a` → `#fbbf24` → `#d97706` (logam emas) |
| `--primary` | `#d4af37` (aksi utama = emas, teks di atasnya nyaris hitam) |
| `--ring` | `#10B981` (fokus emerald) |

Dua akibat yang perlu diketahui sebelum tema ini dijadikan tema situs utama: skala `amber` di preset obsidian menanggung **emas**, sehingga lencana peringatan yang memakai `amber-*` ikut tampak keemasan; dan skala netralnya dibalik (shade rendah = permukaan, shade tinggi = tinta) karena komponen lama memakai `bg-slate-50` untuk permukaan dan `text-slate-900` untuk tinta. Tema lain tidak terpengaruh: `tinta` tetap bawaan.

## 3. Component Design Rules

### A. The Hero Card (PINDAI Physical & Digital Asset)

- Aspect Ratio: Standard credit card aspect ratio (`aspect-[1.586/1]`).
- Frame: Rounded-2xl with double-line emerald pendaran/glow.
- Texture Pattern: Subdued Batik Parang overlay (`opacity-15 mix-blend-overlay`). Batik lines must feature subtle gold/emerald oxidation tones.

Card Details:

- Top Left: Embossed metallic gold PINDAI logo and brand name.
- Center Left: 3D polished gold EMV Chip + Gold Contactless NFC icon.
- Bottom: Gold monospace card number (`1234 5678 9012 3456`), status tag `TERAKREDITASI & AMAN`, validity date `12/29`, and cardholder name (e.g., `BUDI SETIAWAN`).
- **Dua label berdampingan (keputusan pemilik):** label klaim `TERAKREDITASI & AMAN` tetap tampil, dan label penjaga `Kartu contoh · bukan alat bayar` tetap tampil bersamanya di kartu yang sama. Klaim tidak pernah berdiri sendiri tanpa penanda bahwa nomornya contoh. Pemilik produk yang memastikan klaim akreditasi itu punya dasar sebelum dipakai di produksi.
- Top Right & Side Icons: STRICTLY OMITTED. Sisi kanan kartu harus tetap bersih (uncluttered space).

### B. Typography & Micro-copy

- Headings: High-contrast sans-serif or clean serif headers paired with subtle gold/emerald highlights.
- Data Monospace: Monospace font for card numbers, token codes, and cryptographic hashes.
- Copywriting Tone: Professional, authoritative, and concise. Avoid AI filler like "Unlock your financial synergy". Use direct functional labels (e.g., "Pencatatan Ledger", "Verifikasi Sertifikat").

### C. Layout & Micro-Interactions

- Card Hover State: Smooth 3D tilt effect (`hover:scale-[1.02] transition-all duration-500`) with dynamic light reflection over the glass surface.
- Security Feedback: Password strength meters and 32-character token auto-trimmers must render in real-time with sharp emerald status indicators.

### D. Tekstur Batik Parang se-halaman (keputusan pemilik)

Motif Batik Parang dipasang sebagai **satu lapisan untuk seluruh halaman** landing, bukan pola yang ditempel ulang di setiap seksi: kelas `.tekstur-parang` di `src/index.css` memasang satu lapisan `position: fixed` ber-`pointer-events: none`, dan pembungkus halaman di `src/pages/Landing.tsx` hanya menambahkan kelas itu sekali. Bentuk parangnya digambar sebagai topeng SVG putih, sedangkan warnanya datang dari token `--gold` tema yang sedang aktif, sehingga motifnya ikut berganti wajah (kuningan di `tinta`, emas di `obsidian`) tanpa digambar ulang per tema.

Batas yang disepakati: opasitas ditahan di **6%** supaya terbaca sebagai air-tanda, bukan gambar di atas halaman; polanya **statis** (tidak ada animasi, jadi tidak ada yang perlu dikecualikan dari `prefers-reduced-motion`); dan karena lapisannya menyatu di atas latar seksi, teks, kartu, serta tombol tetap harus melewati pemeriksaan kontras seperti biasa — bukan dianggap aman karena "cuma tekstur".

## 4. Anti-Slop Checkpoints for PINDAI

- No Generic Cards, and glass stays at the focal point (keputusan pemilik): kaca obsidian + pendaran emerald ganda hanya untuk **satu titik fokus per layar** (mis. kartu hero, atau satu kartu angka utama). Kartu lain memakai permukaan padat, tanpa blur dan tanpa pendaran; garis emerald tipis boleh tetap ada sebagai penanda batas. Teknik kaca/glow di tempat lain harus punya alasan tertulis, bukan diulang karena resep ini ada.
- No Placeholder Icons: Do not sprinkle unnecessary shopping cart or world icons on credit cards or dashboards.
- No Mismatched Gradients: Gradients are strictly reserved for Gold metallic finishes (`from-amber-200 via-amber-400 to-amber-600`) and Emerald lighting cues.
- Authentic Cultural Fusion: Batik Parang patterns must remain subtle (`opacity-15`), acting as a rich background texture rather than an overwhelming graphic.
