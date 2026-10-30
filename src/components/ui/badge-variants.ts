import { cva } from "class-variance-authority"

/**
 * Varian gaya badge — dipisah dari `badge.tsx` agar file komponen hanya
 * mengekspor komponen (Fast Refresh).
 *
 * Micro-interaction: transisi warna memakai motion token `--motion-fast`, jadi
 * badge yang bisa diklik (`[a&]`) berubah nada dengan halus. Badge statis tidak
 * beranimasi sendiri — angka status yang muncul berulang tidak boleh bergerak
 * hanya karena dirender; animasi masuk (`.motion-scale`) dipakai sadar oleh
 * pemanggil bila memang perlu menarik perhatian.
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive transition-[color,background-color,border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--motion-ease-out)] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export { badgeVariants }
