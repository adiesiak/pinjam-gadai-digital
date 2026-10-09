"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Kotak centang PINDAI.
 *
 * Micro-interaction:
 * - Tepi & isian bertransisi dengan motion token `--motion-fast` (langsung, tidak berkedip).
 * - Tekan sedikit menyusut (`active:scale-[0.96]`) — 4% saja, tidak memantul.
 * - Tanda centang masuk dengan `motion-check-in` (skala 0,6 → 1) sehingga
 *   tindakan "tercentang" terasa tegas.
 * - `touch-manipulation` menghapus jeda 300 ms pada layar sentuh.
 * Keadaan terkunci tetap `disabled:opacity-50` + `cursor-not-allowed`.
 * Perilaku, nilai, dan event (onCheckedChange) tidak berubah.
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer border-input dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-[background-color,border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--motion-ease-out)] outline-none focus-visible:ring-[3px] active:scale-[0.96] touch-manipulation disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current"
      >
        <CheckIcon className="motion-check-in size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
