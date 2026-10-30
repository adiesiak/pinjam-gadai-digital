"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

/**
 * Tab PINDAI.
 *
 * Micro-interaction di sini SENGAJA hanya soal transisi nada (warna, bayangan,
 * latar) memakai motion token `--motion-normal`: perubahan keadaan tab harus
 * terbaca halus, bukan melompat. Penanda tab aktif yang benar-benar BERGESER
 * antar tab dibuat oleh pemanggil, karena hanya pemanggil yang tahu nilai tab
 * aktif — lihat `dashboard-tab-nav.tsx` (pill `layoutId` dari framer-motion)
 * dan `docs/animasi.md`. Cara itu dipilih agar tab yang sudah punya gaya aktif
 * sendiri (panel admin, ruang penyedia dana) tidak tertimpa penanda kedua.
 *
 * Navigasi keyboard (panah, Home/End) tetap sepenuhnya dari Radix.
 */
function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex min-h-12 w-fit items-center justify-center gap-1 rounded-full border border-slate-200 bg-slate-100/80 p-1",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "text-muted-foreground data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap touch-manipulation outline-none transition-[color,background-color,border-color,box-shadow,opacity] duration-[var(--motion-normal)] ease-[var(--motion-ease-out)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
