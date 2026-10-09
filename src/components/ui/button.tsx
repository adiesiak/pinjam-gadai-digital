import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { CircleAlertIcon, CircleCheckIcon } from "lucide-react"
import { type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button-variants"
import { Spinner } from "@/components/ui/spinner"

/**
 * Tombol PINDAI.
 *
 * Dua prop tambahan di atas tombol biasa, keduanya OPSIONAL sehingga seluruh
 * pemakaian lama tidak berubah:
 *
 * - `loading` — tindakan sedang berjalan. Tombol dikunci (`disabled`) dan diberi
 *   `aria-busy`, pemintal muncul di depan label. Ukuran tombol tidak melompat
 *   karena pemintal memakai ukuran ikon yang sama (`size-4`).
 * - `status` — umpan balik SESUAT setelah tindakan selesai ("sukses"/"gagal").
 *   Menambahkan ikon yang masuk dengan animasi kecil (`motion-check-in`) dan
 *   `aria-live="polite"` supaya pembaca layar ikut mendengar hasilnya.
 *   Warna tombol TIDAK diubah oleh `status` — nada tetap dari `variant`
 *   (mis. `variant="sukses"` atau `variant="destructive"`), jadi tidak ada
 *   kelas yang saling menimpa.
 *
 * Perilaku klik, `asChild`, dan seluruh varian lama tetap sama.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  status,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Tindakan sedang berjalan: kunci tombol + tampilkan pemintal. */
    loading?: boolean
    /** Umpan balik sesaat setelah tindakan: ikon sukses/gagal + aria-live. */
    status?: "sukses" | "gagal"
  }) {
  const Comp = asChild ? Slot : "button"
  const adaIkon = loading || status !== undefined

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-status={status}
      aria-busy={loading || undefined}
      disabled={disabled || loading || undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {asChild ? (
        // `asChild` menyerahkan elemennya ke anak (mis. `<a>` dari `<Link>`), dan
        // `Slot` Radix menuntut TEPAT SATU anak — jadi di jalur ini tidak ada
        // ikon/pengumuman yang disisipkan; hanya anaknya yang diteruskan apa
        // adanya. Nada & ukuran tetap dari kelas tombol.
        children
      ) : (
        <>
          {adaIkon && (
            <span className="inline-flex shrink-0 items-center" aria-hidden>
              {loading ? (
                <Spinner className="size-4" />
              ) : status === "sukses" ? (
                <CircleCheckIcon data-slot="button-status-icon" className="motion-check-in size-4" />
              ) : (
                <CircleAlertIcon data-slot="button-status-icon" className="motion-check-in size-4" />
              )}
            </span>
          )}
          {children}
          {status !== undefined && (
            // Pengumuman hasil untuk pembaca layar: teks pendek, tidak terlihat,
            // dan sudah membawa konteksnya sendiri.
            <span className="sr-only" role="status">
              {status === "sukses" ? "Berhasil." : "Gagal."}
            </span>
          )}
        </>
      )}
    </Comp>
  )
}

export { Button }
