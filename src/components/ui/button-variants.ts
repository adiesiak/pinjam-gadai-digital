import { cva } from "class-variance-authority"

/**
 * Varian gaya tombol — dipisah dari `button.tsx` agar file komponen hanya
 * mengekspor komponen (Fast Refresh).
 *
 * Micro-interaction yang dijaga di sini:
 * - `hover`  → warna/bayangan berubah (umpan balik tetikus): nada utama
 *   dicerahkan sedikit (`hover:brightness-110`) dan diberi bayangan berwarna
 *   (`hover:shadow-lg hover:shadow-primary/25`), jadi tombol utama terangkat
 *   tanpa perlu animasi transform yang mahal.
 * - `active` → turun 2% (`active:scale-[0.98]`) sebagai umpan balik tekan.
 * - `focus-visible` → cincin `ring-[3px]` + celah `ring-offset-2` yang hanya
 *   muncul untuk keyboard, sehingga cincin tetap kontras di atas tombol gelap
 *   maupun terang.
 * - `disabled` → `pointer-events-none` + pudar, jadi tidak bisa diklik maupun
 *   difokus, tetapi tetap terbaca pembaca layar.
 * - `aria-busy` → kursor progres saat `loading`.
 * Semua temponya memakai motion token (`--motion-fast`), bukan angka baru.
 * Perbesaran sengaja dibatasi 2% supaya tidak terasa memantul.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium touch-manipulation transition-[color,background-color,border-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--motion-ease-out)] disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:brightness-110 hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] active:bg-primary/95",
        destructive:
          "bg-destructive text-white shadow-sm hover:bg-destructive/90 hover:brightness-110 hover:shadow-lg hover:shadow-destructive/20 active:scale-[0.98] active:bg-destructive/95 focus-visible:ring-destructive/20",
        // Nada positif permanen (mis. tombol "Simpan" setelah data valid).
        // `emerald` dipetakan ke kuningan di tema PINDAI = warna status positif.
        sukses:
          "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 hover:brightness-110 hover:shadow-lg hover:shadow-emerald-900/20 active:scale-[0.98] active:bg-emerald-800",
        // Varian garis: saat disorot tepinya ikut nada utama tema (= aksen
        // emerald PINDAI) dan latarnya diberi tint tipis — bukan diisi pejal,
        // supaya tombol garis tetap terlihat sebagai aksi sekunder.
        outline:
          "border border-input bg-background hover:border-primary/40 hover:bg-primary/5 hover:text-primary active:scale-[0.98] active:bg-primary/10",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-[0.98] active:bg-secondary/70",
        ghost:
          "hover:bg-secondary hover:text-secondary-foreground active:scale-[0.98] active:bg-secondary/70",
        // Tautan: garis bawah juga muncul saat fokus keyboard, bukan hanya hover.
        link: "text-primary underline-offset-4 hover:underline focus-visible:underline active:opacity-80",
        primary:
          "bg-navy text-white shadow-sm hover:bg-navy/90 hover:brightness-110 hover:shadow-lg hover:shadow-navy/25 active:scale-[0.98] active:bg-navy/95",
      },
      size: {
        // 44px di ponsel; desktop boleh lebih rapat. Semua ukuran tetap
        // memenuhi target sentuh DESIGN.md §5 di lebar ponsel.
        default: "h-11 px-4 py-2 sm:h-9 has-[>svg]:px-3",
        sm: "h-11 rounded-lg gap-1.5 px-3 sm:h-8 has-[>svg]:px-2.5",
        lg: "h-11 rounded-lg px-6 sm:h-10 has-[>svg]:px-4",
        icon: "size-11 sm:size-9",
        "icon-sm": "size-11 sm:size-8",
        "icon-lg": "size-11 sm:size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export { buttonVariants }
