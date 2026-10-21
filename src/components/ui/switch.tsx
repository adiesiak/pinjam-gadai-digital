"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

/**
 * Sakelar PINDAI.
 *
 * Micro-interaction: tombol geser (thumb) berpindah dengan `translate-x` bertempo
 * `--motion-normal` (200 ms) dan easing token — cukup terlihat "bergerak halus",
 * tidak meluncur lambat. Warna jalur memakai `--motion-fast` supaya perubahan
 * keadaan terasa langsung. Hanya warna & transform yang dianimasikan (properti
 * compositor), bukan `transition-all`, jadi tidak ada properti tata letak yang
 * ikut berubah. Ruang tekan tidak berubah; `touch-manipulation` hanya menghapus
 * jeda 300 ms pada layar sentuh.
 */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs touch-manipulation transition-[background-color,border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--motion-ease-out)] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "bg-background pointer-events-none block size-4 rounded-full ring-0 transition-transform duration-[var(--motion-normal)] ease-[var(--motion-ease-out)] data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
