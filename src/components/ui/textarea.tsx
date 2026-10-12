import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Area teks PINDAI — pasangan `Input`, jadi umpan balik visualnya sama:
 * focus ring, invalid (`aria-invalid` + `user-invalid`), dan valid opt-in
 * (`data-valid={…}`). Tempo transisi memakai motion token.
 *
 * Fokus juga memakai `focus-glow` — latar naik ke putih dan tepi menyala
 * emerald dengan pendar lembut, sama seperti `Input`.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "focus-glow border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow,border-color] duration-[var(--motion-fast)] ease-[var(--motion-ease-out)] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "user-invalid:border-destructive user-invalid:ring-destructive/20",
        "data-[valid=true]:border-emerald-600 data-[valid=true]:ring-emerald-600/15 data-[valid=true]:ring-[3px]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
