# Fondasi Animasi PINDAI

Panduan tunggal untuk semua gerakan di PINDAI: token, utility, aturan pakai, dan
batas performa. Baca ini sebelum menambah animasi baru.

Fondasi ini **tidak menambah dependency**: framer-motion (sudah dipakai
landing/auth/dashboard) dan CSS biasa cukup, jadi tidak ada pustaka animasi baru.

---

## 1. Token — satu sumber kebenaran

Dua tempat, satu nilai. Keduanya dijaga oleh `src/lib/motion.test.ts`, jadi
menyimpang otomatis gagal di CI/`bun run test`.

| Token | Nilai | Untuk apa |
| --- | --- | --- |
| `--motion-fast` / `DURATION_MS.fast` | **120 ms** | Umpan balik langsung: hover, tekan, tooltip, transisi warna. |
| `--motion-normal` / `DURATION_MS.normal` | **200 ms** | Perpindahan kecil: panel, tab, lencana, kartu naik-turun. |
| `--motion-slow` / `DURATION_MS.slow` | **380 ms** | Masuknya bagian halaman: reveal, dialog, daftar panjang. |
| `--motion-ease-out` / `EASE_OUT` | `cubic-bezier(0.22, 1, 0.36, 1)` | Kurva utama (percepatan cepat, pendaratan lembut). |
| `--motion-ease-in-out` / `EASE_IN_OUT` | `cubic-bezier(0.65, 0, 0.35, 1)` | Gerakan bolak-balik (denyut). |
| `--motion-stagger` / `STAGGER.normal` | **80 ms** | Jeda antar-anak pada gerakan berurutan. |
| `--motion-jarak` / `JARAK.normal` | **16 px** | Jarak geser bawaan untuk slide. |

Rentang resmi produk: fast **100–150 ms**, normal **180–250 ms**, slow
**300–450 ms**. Jangan menulis durasi di luar token kecuali ada alasan teknis
yang ditulis sebagai komentar di tempatnya.

Token gerak **tidak berubah antar tema** (terang/gelap/pesisir/terakota/salju/
karnival): tempo milik aplikasi, bukan milik palet warna. Karena warnanya serba
token (`bg-*`, `text-*`, `border-*` + varian `dark:`), setiap animasi otomatis
benar di light mode maupun dark mode.

---

## 2. Utility CSS (`src/index.css`)

Untuk elemen yang muncul sekali dan tidak butuh state React. Nol JavaScript.

| Kelas | Efek | Durasi |
| --- | --- | --- |
| `.motion-fade` | Pudar masuk. | normal |
| `.motion-slide-up` / `-down` / `-left` / `-right` | Pudar + geser dari arah tersebut. | slow |
| `.motion-scale` | Pudar + membesar dari 0.96. | normal |
| `.motion-stagger` | Wadah; anaknya muncul berurutan. | — |
| `.motion-pulse` | Denyut perhatian **3 kali lalu berhenti**. | slow |
| `.motion-pulse-loop` | Denyut terus-menerus (opt-in, lihat §6). | slow |
| `.motion-press` | Umpan balik tekan (`scale(0.985)`). | fast |
| `.animate-masuk` | Alias lama (70+ pemakaian): pudar + naik 10 px. Kini memakai `--motion-slow`. | slow |
| `.card-lift` | Naik 2 px + bayangan saat hover. Kini memakai `--motion-normal`. | normal |

```html
<!-- daftar berurutan tanpa JavaScript -->
<ul class="motion-stagger space-y-2">
  <li class="motion-slide-up">…</li>
  <li class="motion-slide-up">…</li>
</ul>
```

Jeda berurutan dihitung dari posisi anak lewat `:nth-child(1..12)`; anak ke-13
dan seterusnya memakai jeda terakhir (daftar panjang tidak menunggu lama).

---

## 3. Utility React

Untuk kemunculan yang dikendalikan state (daftar dari query, kemunculan
bersyarat, pembatalan saat reduced-motion).

`src/components/Motion.tsx`:

```tsx
import { Fade, Slide, Scale, Stagger, StaggerItem, Pulse } from "@/components/Motion";

<Fade>…</Fade>
<Slide arah="kiri" delay={0.08}>…</Slide>
<Scale mulai={0.96}>…</Scale>

<Stagger className="grid gap-3 sm:grid-cols-3">
  {kartu.map((k) => <StaggerItem key={k.id}><Kartu {...k} /></StaggerItem>)}
</Stagger>

<Pulse ulang={3}>lencana baru</Pulse>
```

`src/components/Reveal.tsx` (sudah ada, dipakai luas di landing):

```tsx
<Reveal delay={0.1}>…</Reveal>  {/* saat masuk viewport, sekali */}
<FadeIn delay={0.05}>…</FadeIn> {/* saat mount */}
```

Varian mentah ada di `src/lib/motion.ts` bila perlu dipasang ke `motion.*`
sendiri: `fadeIn`, `slideIn(arah, jarak)`, `scaleIn(mulai)`, `pulseSoft`,
`fadeUpItem`, `staggerContainer`, `buatStagger({ langkah, jeda })`, serta preset
`transition.fast | .normal | .slow`.

---

## 4. Batas performa (wajib)

1. **Hanya `opacity` dan `transform`.** Properti ini dikerjakan compositor.
   Jangan menganimasikan `width`/`height`/`top`/`margin`/`padding`/`font-size` —
   itu memicu layout ulang tiap frame dan menggeser tetangganya (layout shift).
   Uji `motion.test.ts` menolak varian dan keyframes yang melanggarnya.
2. **Keadaan dasar = keadaan akhir.** Keyframe hanya menggambarkan titik awal;
   elemen tanpa animasi tampil apa adanya. Jadi mematikan animasi tidak pernah
   meninggalkan elemen tak terlihat, dan tidak ada lompatan setelah hydration.
3. **Jangan animasikan properti yang mengubah ukuran kontainer.** Butuh
   buka-tutup tinggi? Pakai `grid-template-rows`/`max-height` pada kontainer
   tetap, atau biarkan framer-motion mengukur (`height: "auto"`) hanya untuk
   panel sekali-buka, bukan untuk baris daftar panjang.
4. **Prefers-reduced-motion.** Semua kelas `.motion-*`, `.animate-*`, dan
   `.card-lift` dimatikan pada `@media (prefers-reduced-motion: reduce)`;
   pembungkus React membaca `useReducedMotion()` dan memakai fade singkat.
   Kelas `.motion-*` baru **wajib** ditambahkan ke blok itu — dijaga tes.
5. **Tab tersembunyi.** Browser menghentikan compositing pada tab yang tidak
   terlihat, jadi animasi CSS `infinite` praktis tidak memakai CPU saat tab
   disembunyikan. Tetap: batasi animasi terus-menerus (§6).
6. **Hindari `will-change` permanen.** Biarkan browser mengangkat layer sendiri;
   `will-change` yang dibiarkan menyala justru menambah memori.

---

## 5. Reduced-motion

```css
@media (prefers-reduced-motion: reduce) {
  .motion-*, .animate-*, .card-lift, .motion-press { animation: none; transition: none; transform: none; }
}
```

```tsx
const reduce = useReducedMotion();          // dari framer-motion
transition={reduce ? transitionReduced : transition.normal}
```

`transitionReduced` (10 ms) memastikan nilai akhir tetap tercapai — bukan
animasi yang dimatikan di tengah. Untuk masuknya bagian halaman, Reveal/Motion
membuang translasi & scale saat reduce, menyisakan fade saja.

---

## 6. Animasi terus-menerus

Aturannya: **berakhir secara bawaan, berulang hanya bila statusnya memang hidup.**

- Bawaan: `.motion-pulse` / `<Pulse ulang={3}>` — menarik mata lalu berhenti.
- Opt-in: `.motion-pulse-loop`, `<Pulse ulang="selamanya">`, serta
  `animate-due-*` (pengingat jatuh tempo) dan `animate-marquee` (bar
  pengumuman). Ini dibenarkan karena menandai keadaan yang benar-benar
  berlangsung — tetapi tetap wajib `opacity`/`transform`, tempo ≥1,8 s, dan mati
  saat reduced-motion.
- Dilarang: latar/gradien yang berdenyut, ikon yang berputar terus tanpa makna
  status, teks yang berkedip.

---

## 7. Checklist menambah animasi baru

1. Pilih durasi dari token (`fast`/`normal`/`slow`) — jangan angka baru.
2. Pilih easing dari token (`EASE_OUT` untuk masuk, `EASE_IN_OUT` untuk bolak-balik).
3. Pakai properti compositor saja (`opacity`, `transform`).
4. Kalau pakai kelas CSS baru berawalan `.motion-`, tambahkan ke blok
   `prefers-reduced-motion` di `src/index.css`.
5. Uji: `bun src/lib/motion.test.ts` (token & aturan) dan render test komponen.
6. Jalankan `bunx eslint`, `bun tsc -b --noEmit`, `bun run build`.

---

## 8. Berkas terkait

| Berkas | Peran |
| --- | --- |
| `src/lib/motion.ts` | Token + varian + preset transisi (sumber kebenaran). |
| `src/index.css` | Custom property `--motion-*`, kelas `.motion-*`, blok reduced-motion. |
| `src/components/Motion.tsx` | Pembungkus React: Fade, Slide, Scale, Stagger, StaggerItem, Pulse. |
| `src/components/Reveal.tsx` | Reveal (masuk viewport) & FadeIn (saat mount). |
| `src/components/CountUp.tsx` | Angka yang naik menuju nilai akhir (memakai token). |
| `src/lib/motion.test.ts` | Penjaga: sinkronisasi CSS↔TS, rentang durasi, opt-out reduced-motion, properti terlarang. |
