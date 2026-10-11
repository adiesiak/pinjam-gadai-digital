import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";

/**
 * Keadaan kosong seragam untuk seluruh daftar dashboard.
 *
 * Bentuknya sengaja disamakan dengan `EmptyQueue` di panel admin: ikon di
 * dalam kotak berbingkai, judul berwarna tinta (navy), lalu kalimat penjelas
 * selebar nyaman baca — supaya "belum ada data" terasa seperti keadaan resmi,
 * bukan halaman yang gagal memuat.
 *
 * `action` opsional menambah tombol aksi (mis. "Ajukan pinjaman") agar keadaan
 * kosong tidak hanya informatif tapi juga punya jalan keluar.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void; variant?: "default" | "outline" | "primary" | "secondary" | "ghost" };
}) {
  return (
    <div className="animate-masuk rounded-2xl border border-dashed border-slate-300 bg-gradient-to-b from-white to-slate-50/70 px-6 py-12 text-center sm:py-14">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm">
        <Icon className="size-5" />
      </span>
      <p className="mt-4 text-sm font-semibold text-navy">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {body}
      </p>
      {action && (
        <div className="mt-6">
          <Button className="h-10 px-5 text-sm" variant={action.variant ?? "primary"} onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
