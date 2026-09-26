import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { api } from "@/convex/_generated/api";

export function AuditTrailPanel() {
  const data = useQuery(api.system.getConfigAdmin);
  if (data === undefined) {
    return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>;
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between px-5 py-4">
        <p className="text-sm font-semibold text-navy">Rekam jejak aktivitas admin</p>
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">{data.auditTerbaru.length} entri terbaru</Badge>
      </div>
      <ul className="divide-y divide-slate-100">
        {data.auditTerbaru.map((a) => (
          <li key={a._id} className="px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <span className="font-semibold text-navy">{a.aktorLabel}</span>{" "}
                <Badge variant="outline" className="mx-1 text-[10px] uppercase">{a.aksi}</Badge>{" "}
                <span className="text-muted-foreground">{a.target ?? ""}</span>
              </p>
              <span className="text-xs tabular-nums text-muted-foreground">{new Date(a.waktu).toLocaleString("id-ID")}</span>
            </div>
            {a.detail && <p className="mt-1 text-xs text-muted-foreground">{a.detail}</p>}
          </li>
        ))}
        {data.auditTerbaru.length === 0 && (
          <li className="px-5 py-6 text-sm text-muted-foreground">Belum ada aktivitas tercatat.</li>
        )}
      </ul>
    </div>
  );
}
