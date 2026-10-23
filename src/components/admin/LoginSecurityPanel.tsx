import { useMutation, useQuery } from "convex/react";
import { Loader2, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonBarisDaftar } from "@/components/ui/loading";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ambilTokenPerangkat, lupakanTokenPerangkat } from "@/lib/perangkatPercaya";
import { formatWaktuWIB } from "@/lib/waktu";

import { formatDate } from "./admin-format";

/**
 * Panel Keamanan Login — log login append-only + sesi aktif + 2FA admin.
 */
export function LoginSecurityPanel({ onOpenSetup }: { onOpenSetup: () => void }) {
  const logs = useQuery(api.security.getLoginLogs, {});
  const overviewKeam = useQuery(api.security.getSecurityOverview, {});
  const sessions = useQuery(api.security.mySessions, {});
  const totpStatus = useQuery(api.security.myTotpStatus, {});
  const perangkatQ = useQuery(api.security.daftarPerangkatPercaya, {});
  const cabutPerangkat = useMutation(api.security.cabutPerangkatPercaya);
  const lupakanPerangkat = useMutation(api.security.lupakanPerangkatPercaya);
  const [busyPerangkat, setBusyPerangkat] = useState<string | null>(null);
  const [saringLog, setSaringLog] = useState<"semua" | "berhasil" | "perhatian">(
    "semua",
  );
  // Token perangkat ini (bila ada) — hanya untuk tombol "Lupakan perangkat ini".
  const tokenLokal = ambilTokenPerangkat();

  const cabut = async (id: Id<"trustedDevices">, perangkat: string) => {
    setBusyPerangkat(id);
    try {
      await cabutPerangkat({ id });
      toast.success(`Perangkat "${perangkat}" dicabut.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mencabut perangkat.");
    } finally {
      setBusyPerangkat(null);
    }
  };

  const lupakan = async () => {
    const token = ambilTokenPerangkat();
    if (token === null) return;
    setBusyPerangkat("lokal");
    try {
      await lupakanPerangkat({ token });
      lupakanTokenPerangkat();
      toast.success("Perangkat ini tidak lagi dipercaya, kode TOTP diminta lagi.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal melupakan perangkat.");
    } finally {
      setBusyPerangkat(null);
    }
  };

  const logTampil = (logs ?? []).filter((l) =>
    saringLog === "semua"
      ? true
      : saringLog === "berhasil"
        ? l.status === "berhasil"
        : l.status !== "berhasil",
  );

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

      {/* Perangkat dipercaya ("ingat perangkat ini") */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Smartphone className="size-4 text-sky-600" /> Perangkat dipercaya
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Perangkat yang mencentang "Ingat perangkat ini" melewati gate TOTP hingga 30 hari.
              Cabut perangkat yang tidak Anda kenali.
            </p>
          </div>
          {tokenLokal !== null && (
            <Button
              size="sm"
              variant="outline"
              disabled={busyPerangkat === "lokal"}
              onClick={() => void lupakan()}
            >
              {busyPerangkat === "lokal" ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 size-4" />
              )}
              Lupakan perangkat ini
            </Button>
          )}
        </div>
        {perangkatQ === undefined ? (
          <Loader2 className="mt-4 size-4 animate-spin text-muted-foreground" />
        ) : perangkatQ.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Belum ada perangkat dipercaya. Centang "Ingat perangkat ini" saat verifikasi TOTP
            untuk menambahkan.
          </p>
        ) : (
          <ul className="animate-masuk mt-4 divide-y divide-slate-200">
            {perangkatQ.map((d) => (
              <li key={d._id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{d.perangkat}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {d.ip ?? "IP tidak diketahui"} · terakhir dipakai{" "}
                    {d.terakhirDipakai ? formatDate(d.terakhirDipakai) : "belum"} · kedaluwarsa{" "}
                    {formatDate(d.kedaluwarsaPada)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={busyPerangkat === d._id}
                  onClick={() => void cabut(d._id, d.perangkat)}
                >
                  {busyPerangkat === d._id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  <span className="ml-1">Cabut</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
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
          <ul className="animate-masuk mt-4 divide-y divide-slate-200">
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
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Log login (append-only)</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Waktu tampil dalam WIB agar cocok dengan jam operasional dan jejak audit.
            </p>
          </div>
          <Badge variant="outline" className="text-[10px]">
            100 entri terakhir
          </Badge>
        </div>

        <div
          role="group"
          aria-label="Saring log login menurut status"
          className="mt-3 flex flex-wrap gap-1.5"
        >
          {([
            ["semua", "Semua"],
            ["berhasil", "Berhasil"],
            ["perhatian", "Perlu perhatian"],
          ] as const).map(([nilai, label]) => (
            <Button
              key={nilai}
              type="button"
              size="sm"
              variant={saringLog === nilai ? "default" : "outline"}
              aria-pressed={saringLog === nilai}
              className="max-md:min-h-11"
              onClick={() => setSaringLog(nilai)}
            >
              {label}
            </Button>
          ))}
        </div>

        {logs !== undefined && (
          <p aria-live="polite" className="mt-2 text-[11px] tabular-nums text-muted-foreground">
            Menampilkan {logTampil.length} dari {logs.length} entri
            {saringLog === "semua" ? "" : " pada saringan ini"}.
          </p>
        )}

        {logs === undefined ? (
          <div className="mt-4">
            <SkeletonBarisDaftar baris={5} />
          </div>
        ) : logs.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Belum ada aktivitas login tercatat.
          </p>
        ) : logTampil.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-center text-xs text-muted-foreground">
            <p>Tidak ada log dengan status ini.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 min-h-11"
              onClick={() => setSaringLog("semua")}
            >
              Tampilkan semua log
            </Button>
          </div>
        ) : (
          <>
            <ul className="mt-3 space-y-2 md:hidden">
              {logTampil.map((l) => (
                <li
                  key={l._id}
                  className="rounded-xl border border-slate-200 bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {formatWaktuWIB(l.waktu)} WIB
                    </p>
                    <LencanaStatusLogin status={l.status} />
                  </div>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Metode</dt>
                    <dd>{l.metode}</dd>
                    <dt className="text-muted-foreground">IP</dt>
                    <dd className="font-mono">{l.ip}</dd>
                    <dt className="text-muted-foreground">Perangkat</dt>
                    <dd className="break-words text-slate-700">{l.userAgent}</dd>
                  </dl>
                </li>
              ))}
            </ul>

            <div className="mt-3 hidden md:block">
              <Table
                containerClassName="max-h-[30rem] overflow-y-auto"
                className="[&_td]:align-top"
              >
                <TableCaption className="sr-only">
                  100 entri login terakhir, waktu dalam WIB, dengan saringan status
                </TableCaption>
                <TableHeader className="sticky top-0 z-10 bg-slate-50">
                  <TableRow className="border-b border-slate-200 bg-slate-50 hover:bg-slate-50">
                    {["Waktu", "Status", "Metode", "IP", "Perangkat"].map((kolom) => (
                      <TableHead
                        key={kolom}
                        scope="col"
                        className="text-xs font-semibold text-slate-600"
                      >
                        {kolom}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logTampil.map((l) => (
                    <TableRow key={l._id}>
                      <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                        {formatWaktuWIB(l.waktu)} WIB
                      </TableCell>
                      <TableCell>
                        <LencanaStatusLogin status={l.status} />
                      </TableCell>
                      <TableCell className="text-xs">{l.metode}</TableCell>
                      <TableCell className="font-mono text-xs">{l.ip}</TableCell>
                      <TableCell
                        className="max-w-56 whitespace-normal break-words text-xs text-muted-foreground"
                        title={l.userAgent}
                      >
                        {l.userAgent}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/** Nada status log login, dipakai tabel dan kartu ponsel. */
function LencanaStatusLogin({ status }: { status: string }) {
  const kelas =
    status === "berhasil"
      ? "bg-emerald-100 text-emerald-700"
      : status === "diblokir"
        ? "bg-red-100 text-red-700"
        : status === "dipertanyakan"
          ? "bg-amber-100 text-amber-700"
          : "bg-red-50 text-red-600";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${kelas}`}
    >
      {status}
    </span>
  );
}
