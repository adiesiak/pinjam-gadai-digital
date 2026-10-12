# DESIGN.md — PINDAI UI/UX & Visual Direction

Note for AI Coding Agents (anti-slop compliance):
This file supplies explicit, intentional visual direction for PINDAI. anti-slop filters generic AI outputs; this document defines the actual aesthetic, spatial, and functional parameters to build.

## 1. Brand Identity & Aesthetic Concept

Theme: Black Obsidian Glass, Polished Gold, & Double Emerald Glow

PINDAI is a premium, high-security fintech platform. The visual identity bridges Indonesian heritage (Batik Parang) with ultra-modern, glassmorphic financial UI.

Primary Persona: High-end wealth tracking, credit asset verification, and super-admin ledger control.

Core Feel: Exclusive, reassuringly heavy, clean, and high-tech (tactile glass and subtle glow).

Anti-Slop Directive: No generic centered cards with plain black backgrounds, no random floating particles, and no rounded buttons with generic blue gradients. Every element must feel weighted, purposeful, and polished.

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

## 3. Component Design Rules

### A. The Hero Card (PINDAI Physical & Digital Asset)

- Aspect Ratio: Standard credit card aspect ratio (`aspect-[1.586/1]`).
- Frame: Rounded-2xl with double-line emerald pendaran/glow.
- Texture Pattern: Subdued Batik Parang overlay (`opacity-15 mix-blend-overlay`). Batik lines must feature subtle gold/emerald oxidation tones.

Card Details:

- Top Left: Embossed metallic gold PINDAI logo and brand name.
- Center Left: 3D polished gold EMV Chip + Gold Contactless NFC icon.
- Bottom: Gold monospace card number (`1234 5678 9012 3456`), status tag `TERAKREDITASI & AMAN`, validity date `12/29`, and cardholder name (e.g., `BUDI SETIAWAN`).
- Top Right & Side Icons: STRICTLY OMITTED. Sisi kanan kartu harus tetap bersih (uncluttered space).

### B. Typography & Micro-copy

- Headings: High-contrast sans-serif or clean serif headers paired with subtle gold/emerald highlights.
- Data Monospace: Monospace font for card numbers, token codes, and cryptographic hashes.
- Copywriting Tone: Professional, authoritative, and concise. Avoid AI filler like "Unlock your financial synergy". Use direct functional labels (e.g., "Pencatatan Ledger", "Verifikasi Sertifikat").

### C. Layout & Micro-Interactions

- Card Hover State: Smooth 3D tilt effect (`hover:scale-[1.02] transition-all duration-500`) with dynamic light reflection over the glass surface.
- Security Feedback: Password strength meters and 32-character token auto-trimmers must render in real-time with sharp emerald status indicators.

## 4. Anti-Slop Checkpoints for PINDAI

- No Generic Cards: All cards must use dark obsidian glass with specified double-line emerald borders.
- No Placeholder Icons: Do not sprinkle unnecessary shopping cart or world icons on credit cards or dashboards.
- No Mismatched Gradients: Gradients are strictly reserved for Gold metallic finishes (`from-amber-200 via-amber-400 to-amber-600`) and Emerald lighting cues.
- Authentic Cultural Fusion: Batik Parang patterns must remain subtle (`opacity-15`), acting as a rich background texture rather than an overwhelming graphic.
