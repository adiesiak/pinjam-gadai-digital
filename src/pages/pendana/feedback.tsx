import { Loader2 } from "lucide-react";
import type { ComponentType } from "react";

/** Indikator pemuatan ringkas. */
export function Loading() {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      Memuat…
    </div>
  );
}

/** Keadaan kosong seragam untuk daftar Pendana. */
export function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-14 text-center">
      <Icon className="mx-auto size-5 text-slate-400" />
      <p className="mt-4 text-sm font-medium">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}
