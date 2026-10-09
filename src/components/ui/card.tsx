import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Kartu PINDAI.
 *
 * Micro-interaction: perpindahan tepi & bayangan memakai motion token, jadi
 * perubahan yang dipicu pemanggil (mis. `hover:border-primary/40`) terasa halus
 * tanpa perlu menulis durasi sendiri.
 *
 * `hover` (opsional) menyalakan pengangkatan ringan untuk kartu yang benar-benar
 * bisa diklik/dibuka (`card-lift`: naik 2 px + bayangan lebih dalam). Sengaja
 * opsional: kartu informasi statis tidak boleh bergerak hanya karena kursor
 * melintas. Bila `hover` aktif, transisi bawaan tidak dipasang lagi karena
 * `.card-lift` sudah membawa transisinya sendiri (menghindari dua definisi
 * `transition` yang saling menimpa).
 */
function Card({
  className,
  hover = false,
  ...props
}: React.ComponentProps<"div"> & {
  /** Kartu bisa diklik/dibuka → naik halus saat disorot. */
  hover?: boolean
}) {
  return (
    <div
      data-slot="card"
      data-hover={hover ? "true" : undefined}
      className={cn(
        "bg-card text-card-foreground clay-card flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
        hover
          ? "card-lift"
          : "transition-[border-color,box-shadow] duration-[var(--motion-normal)] ease-[var(--motion-ease-out)]",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-tight font-semibold text-balance", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
