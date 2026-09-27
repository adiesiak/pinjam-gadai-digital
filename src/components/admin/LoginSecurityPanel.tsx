import { useQuery } from "convex/react";
import { Loader2, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";

import { formatDate } from "./admin-shared";

/**
 * Panel Keamanan Login — log login append-only + sesi aktif + 2FA admin.
 */
export function LoginSecurityPanel({ onOpenSetup }: { onOpenSetup: () => void }) {
  const logs = useQuery(api.security.getLoginLogs, {});
  const overviewKeam = useQuery(api.security.getSecurityOverview, {});
  const sessions = useQuery(api.security.mySessions, {});
  const totpStatus = useQuery(api.security.myTotpStatus, {});

  return (
    <div className="space-y-6">
      {/* Ringkasan 24 jam */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Login 24 jam", overviewKeam?.totalBaru ?? 0, "sky"],
          ["Gagal", overviewKeam?.gagal ?? 0, "amber"],
          ["Diblokir (rate limit)", overviewKeam?.diblokir ?? 0, "red"],
          ["Anomali IP baru", overviewKeam?.anomali ?? 0, "red"],
        ].map(([label, value, tone]) => (
          <div
            key={label as string}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
          >
            <p className="text-xs text-muted-foreground">{label as string}</p>
            <p
              className={`mt-2 text-lg font-semibold tabular-nums ${
                tone === "red"
                  ? "text-red-600"
                  : tone === "amber"
                    ? "text-amber-600"
                    : "text-navy"
              }`}
            >
              {value as number}
            </p>
          </div>
        ))}
      </section>

      {/* 2FA admin */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Autentikasi dua faktor (TOTP)</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Wajib untuk Super Admin — kode 6 digit dari Google Authenticator/Authy
              diminta setiap sesi browser baru sebelum panel terbuka.
            </p>
          </div>
          {totpStatus?.aktif ? (
            <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              <ShieldCheck className="mr-1 size-3.5" /> 2FA Aktif
            </Badge>
          ) : (
            <Button size="sm" onClick={onOpenSetup}>
              <ShieldCheck className="mr-1.5 size-4" /> Aktifkan 2FA
            </Button>
          )}
        </div>
      </section>

      {/* Sesi aktif */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold">Sesi aktif (satu sesi per akun)</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Login di perangkat baru otomatis menggugurkan sesi lama. Admin dengan 2FA
          wajib lolos verifikasi TOTP untuk mengaktifkan sesi.
        </p>
        {sessions === undefined ? (
          <Loader2 className="mt-4 size-4 animate-spin text-muted-foreground" />
        ) : sessions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Tidak ada sesi aktif.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200">
            {sessions.map((s) => (
              <li key={s._id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.perangkat}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    IP {s.ip} · mulai {formatDate(s.waktuMulai)}
                  </p>
                </div>
                <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                  Aktif
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Log login append-only */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Log login (append-only)</h3>
          <Badge variant="outline" className="text-[10px]">
            100 entri terakhir
          </Badge>
        </div>
        {logs === undefined ? (
          <Loader2 className="mt-4 size-4 animate-spin text-muted-foreground" />
        ) : logs.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Belum ada aktivitas login tercatat.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Waktu</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Metode</th>
                  <th className="py-2 pr-3 font-medium">IP</th>
                  <th className="py-2 font-medium">Perangkat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((l) => (
                  <tr key={l._id} className="align-top">
                    <td className="whitespace-nowrap py-2.5 pr-3 text-xs tabular-nums text-muted-foreground">
                      {new Date(l.waktu).toLocaleString("id-ID")}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          l.status === "berhasil"
                            ? "bg-emerald-100 text-emerald-700"
                            : l.status === "diblokir"
                              ? "bg-red-100 text-red-700"
                              : l.status === "dipertanyakan"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-50 text-red-600"
                        }`}
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-xs">{l.metode}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs">{l.ip}</td>
                    <td className="max-w-40 truncate py-2.5 text-xs text-muted-foreground" title={l.userAgent}>
                      {l.userAgent}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
