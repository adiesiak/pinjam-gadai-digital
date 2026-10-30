import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Input teks PINDAI.
 *
 * Umpan balik visual yang dijaga:
 * - **Focus** — tepi memakai `ring-ring` setebal 3 px, hanya untuk
 *   `:focus-visible` (keyboard) maupun klik; transisinya memakai motion token
 *   `--motion-fast` supaya terasa langsung, bukan berkedip. Kelas `focus-glow`
 *   menambahkan latar yang naik ke putih penuh + pendar emerald 4 px, sekaligus
 *   melebar ke tepi emerald — isian yang sedang diisi jadi jelas "sedang
 *   disentuh" tanpa menggeser satu piksel pun tata letaknya.
 * - **Invalid** — `aria-invalid` (dipakai mesin validasi di aplikasi) memberi
 *   tepi merah; `user-invalid` menangkap kasus bawaan HTML (`required`,
 *   `type`, `pattern`) TANPA perlu perubahan di pemanggil.
 * - **Valid** — opt-in: pemanggil menulis `data-valid={cekValid}` pada input
 *   yang sudah divalidasi sendiri, lalu tepinya berubah ke nada positif.
 *   Sengaja tidak otomatis: `:user-valid` juga menyala untuk input tanpa
 *   aturan apa pun yang sudah diisi, dan hijau di semua kolom hanya jadi
 *   kebisingan.
 *
 * Tidak ada perubahan pada nilai, nama, maupun penanganan event.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "focus-glow file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-11 w-full min-w-0 rounded-lg border bg-white px-3.5 py-1 text-base sm:h-10 shadow-[inset_0_2px_5px_oklch(0.5_0.02_75/0.08)] transition-[color,box-shadow,border-color] duration-[var(--motion-fast)] ease-[var(--motion-ease-out)] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
        "user-invalid:border-destructive user-invalid:ring-destructive/20",
        "data-[valid=true]:border-emerald-600 data-[valid=true]:ring-emerald-600/15 data-[valid=true]:ring-[3px]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
