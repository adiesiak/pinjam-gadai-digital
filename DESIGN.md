# DESIGN.md — PINDAI UI/UX & Visual Direction

Note for AI Coding Agents (anti-slop compliance):
This file supplies explicit, intentional visual direction for PINDAI. anti-slop filters generic AI outputs; this document defines the actual aesthetic, spatial, and functional parameters to build.

## 1. Brand Identity & Aesthetic Concept

Theme: Black Obsidian Glass, Polished Gold, & Double Emerald Glow

PINDAI is a premium, high-security fintech platform. The visual identity bridges Indonesian heritage (Batik Parang) with ultra-modern, glassmorphic financial UI.

Primary Persona: High-end wealth tracking, credit asset verification, and super-admin ledger control.

Core Feel: Exclusive, reassuringly heavy, clean, and high-tech (tactile glass and subtle glow).

Anti-Slop Directive: No generic centered cards with plain black backgrounds, no random floating particles, and no rounded buttons with generic blue gradients. Every element must feel weighted, purposeful, and polished.

### Satu wajah: mode terang (keputusan pemilik)

Seluruh halaman — nasabah, verifikasi aset, ruang Pendana, meja kerja super-admin, dan halaman masuk — memakai **satu wajah terang**: preset bawaan `tinta` (kertas hangat, hijau tinta, kuningan).

Wajah gelap `obsidian` yang sempat dicoba **dicabut seluruhnya**: presetnya tidak lagi terdaftar di `src/lib/system-config.ts`, kartunya hilang dari panel admin, dan blok token gelapnya dihapus dari `src/index.css`. Tidak ada lagi aturan yang cocok dengan `data-theme="obsidian"` maupun `data-wajah="obsidian"`, jadi tidak ada jalan mengaktifkan tampilan gelap.

Catatan status: kartu hero landing (`components/landing/KartuHeroPindai.tsx`) tetap objek merek berpermukaan gelap. Itu bawaan palet `tinta` sendiri (`--color-slate-950: #12110c`), bukan sisa tema obsidian — lihat §3A.

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

### Cara palet dirender (preset `tinta`)

Skala utilitas Tailwind di proyek ini dipetakan ulang per preset, jadi kelas nama-warna baru menghasilkan warna yang dimaksud **ketika presetnya aktif**. Di preset bawaan `tinta` (`src/index.css`), nilai yang dipakai ditulis di blok `@theme` dan `:root`: `slate` adalah netral kertas hangat (permukaan terang, tinta gelap), `emerald` menanggung kuningan untuk nilai uang & status positif, `amber` menanggung oranye bata untuk peringatan, dan `sky` menanggung hijau tinta tua sebagai aksen brand. Empat preset lain (`pesisir`, `terakota`, `salju`, `karnival`) memetakan ulang skala yang sama dengan paletnya sendiri.

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

## 4. Anti-Slop Checkpoints for PINDAI

- No Generic Cards, and glass stays at the focal point (keputusan pemilik): kaca obsidian + pendaran emerald ganda hanya untuk **satu titik fokus per layar** (mis. kartu hero, atau satu kartu angka utama). Kartu lain memakai permukaan padat, tanpa blur dan tanpa pendaran; garis emerald tipis boleh tetap ada sebagai penanda batas. Teknik kaca/glow di tempat lain harus punya alasan tertulis, bukan diulang karena resep ini ada.
- No Placeholder Icons: Do not sprinkle unnecessary shopping cart or world icons on credit cards or dashboards.
- No Mismatched Gradients: Gradients are strictly reserved for Gold metallic finishes (`from-amber-200 via-amber-400 to-amber-600`) and Emerald lighting cues.
- Authentic Cultural Fusion: Batik Parang patterns must remain subtle (`opacity-15`), acting as a rich background texture rather than an overwhelming graphic.
