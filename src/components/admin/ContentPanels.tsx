import { useMutation, useQuery } from "convex/react";
import { Loader2, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { CMS_DEFAULTS } from "@/lib/cms-defaults";
import { formatDate } from "./admin-shared";

/**
 * Editor CMS landing — semua teks halaman utama & pengumuman (bar berjalan,
 * popup, widget mengambang) diedit tim di sini, langsung tampil publik.
 */
export function AnnouncementCms() {
  const row = useQuery(api.announcements.getCmsRow);
  const publik = useQuery(api.announcements.getPublic);
  const save = useMutation(api.announcements.save);
  const reset = useMutation(api.announcements.resetToDefaults);

  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, string | boolean> | null>(null);

  const d = (key: string, fallback: string): string =>
    (draft?.[key] as string | undefined) ?? fallback;
  const db = (key: string, fallback: boolean): boolean =>
    (draft?.[key] as boolean | undefined) ?? fallback;

  if (row === undefined || publik === undefined) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat CMS…
      </p>
    );
  }

  const set = (key: string, value: string | boolean) =>
    setDraft((prev) => ({ ...(prev ?? {}), [key]: value }));

  const simpan = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await save({ ...draft });
      setDraft(null);
      toast.success("Konten tersimpan — halaman utama langsung diperbarui.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  };

  const kembalikanDefault = async () => {
    setBusy(true);
    try {
      await reset({});
      setDraft(null);
      toast.success("Semua teks kembali ke default bawaan.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal reset.");
    } finally {
      setBusy(false);
    }
  };

  const T = (
    label: string,
    key: string,
    val: string,
    opts?: { area?: boolean; max?: number; placeholder?: string },
  ) => (
    <div>
      <Label htmlFor={`cms-${key}`}>{label}</Label>
      {opts?.area ? (
        <Textarea
          id={`cms-${key}`}
          rows={3}
          className="mt-1.5 rounded-xl"
          maxLength={opts.max}
          value={val}
          placeholder={opts.placeholder}
          onChange={(e) => set(key, e.target.value)}
        />
      ) : (
        <Input
          id={`cms-${key}`}
          className="mt-1.5"
          maxLength={opts?.max}
          value={val}
          placeholder={opts?.placeholder}
          onChange={(e) => set(key, e.target.value)}
        />
      )}
    </div>
  );

  const Toggle = (label: string, hint: string, key: string, val: boolean) => (
    <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-4 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={val} onCheckedChange={(v) => set(key, v)} />
    </div>
  );

  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-[0_10px_30px_-18px_oklch(0.55_0.12_240/0.25)]">
      <h3 className="text-sm font-semibold text-navy">{title}</h3>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-muted-foreground">
          Semua perubahan langsung tampil di halaman utama setelah disimpan.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-full" disabled={busy} onClick={kembalikanDefault}>
            Reset ke default
          </Button>
          <Button
            className="gradient-primary rounded-full border-0"
            disabled={!draft || busy}
            onClick={simpan}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Simpan perubahan
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Bar pengumuman berjalan (atas semua halaman)">
          {T("Teks berjalan", "teks", d("teks", publik.barTeks), { area: true, max: 240 })}
          {T("Tautan CTA (opsional)", "tautan", d("tautan", publik.barTautan), { placeholder: "/auth" })}
          {Toggle("Tampilkan bar", "Nonaktif menyembunyikan bar dari semua halaman.", "barAktif", db("barAktif", publik.barAktif))}
          <div className="overflow-hidden rounded-xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-emerald-50/70">
            <div className="animate-marquee flex w-max py-2">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="mx-4 text-xs font-medium text-sky-900">{d("teks", publik.barTeks)}</span>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Popup pengumuman (muncul 1,5 detik setelah buka)">
          {T("Judul", "popupJudul", d("popupJudul", publik.popupJudul), { max: 80 })}
          {T("Isi", "popupIsi", d("popupIsi", publik.popupIsi), { area: true, max: 500 })}
          {T("Teks tombol CTA", "popupCta", d("popupCta", publik.popupCta), { max: 60 })}
          {Toggle("Tampilkan popup", "Tampil tiap kunjungan halaman utama.", "popupAktif", db("popupAktif", publik.popupAktif))}
        </Section>

        <Section title="Widget pengumuman mengambang (pojok kanan bawah)">
          {T("Judul", "floatJudul", d("floatJudul", publik.floatJudul), { max: 80 })}
          {T("Isi", "floatIsi", d("floatIsi", publik.floatIsi), { area: true, max: 300 })}
          {T("Teks tombol CTA", "floatCta", d("floatCta", publik.floatCta), { max: 60 })}
          {T("Delay kemunculan (detik)", "floatDelayDetik", d("floatDelayDetik", String(publik.floatDelayDetik)))}
          {Toggle("Tampilkan widget", "Muncul otomatis sesuai delay, bisa ditutup.", "floatAktif", db("floatAktif", publik.floatAktif))}
        </Section>

        <Section title="Header & Hero">
          {T("Teks logo", "logoTeks", d("logoTeks", publik.logoTeks), { max: 40 })}
          {T("Menu nav 1", "nav1", d("nav1", publik.nav1), { max: 40 })}
          {T("Menu nav 2", "nav2", d("nav2", publik.nav2), { max: 40 })}
          {T("Menu nav 3", "nav3", d("nav3", publik.nav3), { max: 40 })}
          {T("Menu nav 4", "nav4", d("nav4", publik.nav4), { max: 40 })}
          {T("Badge atas hero", "heroBadge", d("heroBadge", publik.heroBadge), { max: 160 })}
          {T("Judul hero (bagian 1)", "heroJudul", d("heroJudul", publik.heroJudul), { max: 120 })}
          {T("Judul hero (aksen berwarna)", "heroJudul2", d("heroJudul2", publik.heroJudul2), { max: 60 })}
          {T("Sub-judul hero", "heroSub", d("heroSub", publik.heroSub), { area: true, max: 400 })}
          {T("Tombol CTA 1", "heroCta1", d("heroCta1", publik.heroCta1), { max: 40 })}
          {T("Tombol CTA 2", "heroCta2", d("heroCta2", publik.heroCta2), { max: 40 })}
          {T("Chip 1 — label", "chip1Label", d("chip1Label", publik.chip1Label), { max: 40 })}
          {T("Chip 1 — nilai", "chip1Nilai", d("chip1Nilai", publik.chip1Nilai), { max: 40 })}
          {T("Chip 2 — label", "chip2Label", d("chip2Label", publik.chip2Label), { max: 40 })}
          {T("Chip 2 — nilai", "chip2Nilai", d("chip2Nilai", publik.chip2Nilai), { max: 40 })}
        </Section>

        <Section title="Bagian layanan (body)">
          {T("Judul bagian", "layananJudul", d("layananJudul", publik.layananJudul), { max: 120 })}
          {T("Sub-judul bagian", "layananSub", d("layananSub", publik.layananSub), { area: true, max: 300 })}
          {T("Judul kartu Pinjaman", "pinjamanJudul", d("pinjamanJudul", publik.pinjamanJudul), { max: 80 })}
          {T("Isi kartu Pinjaman", "pinjamanIsi", d("pinjamanIsi", publik.pinjamanIsi), { area: true, max: 400 })}
          {T("Tombol kartu Pinjaman", "pinjamanCta", d("pinjamanCta", publik.pinjamanCta), { max: 40 })}
          {T("Judul kartu Gadai", "gadaiJudul", d("gadaiJudul", publik.gadaiJudul), { max: 80 })}
          {T("Isi kartu Gadai", "gadaiIsi", d("gadaiIsi", publik.gadaiIsi), { area: true, max: 400 })}
          {T("Tombol kartu Gadai", "gadaiCta", d("gadaiCta", publik.gadaiCta), { max: 40 })}
        </Section>
      </div>
    </div>
  );
}

// =====================================================================
// Panel Keamanan Login — log login append-only + sesi aktif + 2FA admin
// =====================================================================

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
            className="card-lift rounded-2xl border border-sky-100 bg-white px-4 py-4 shadow-[0_14px_30px_-20px_oklch(0.55_0.12_240/0.35)]"
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
      <section className="rounded-2xl border border-sky-100 bg-white p-6 shadow-md shadow-sky-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Two-Factor Authentication (TOTP)</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Wajib untuk Super Admin — kode 6 digit dari Google Authenticator/Authy
              diminta setiap sesi browser baru sebelum panel terbuka.
            </p>
          </div>
          {totpStatus?.aktif ? (
            <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              <ShieldCheck className="mr-1 size-3" /> 2FA Aktif
            </Badge>
          ) : (
            <Button size="sm" className="rounded-full" onClick={onOpenSetup}>
              <ShieldCheck className="mr-1.5 size-3.5" /> Aktifkan 2FA
            </Button>
          )}
        </div>
      </section>

      {/* Sesi aktif */}
      <section className="rounded-2xl border border-sky-100 bg-white p-6 shadow-md shadow-sky-100">
        <h3 className="text-sm font-semibold">Sesi aktif (single active session)</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Login di perangkat baru otomatis menggugurkan sesi lama. Admin dengan 2FA
          wajib lolos verifikasi TOTP untuk mengaktifkan sesi.
        </p>
        {sessions === undefined ? (
          <Loader2 className="mt-4 size-4 animate-spin text-muted-foreground" />
        ) : sessions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Tidak ada sesi aktif.</p>
        ) : (
          <ul className="mt-4 divide-y divide-sky-100">
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
      <section className="rounded-2xl border border-sky-100 bg-white p-6 shadow-md shadow-sky-100">
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
                <tr className="border-b border-sky-100 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Waktu</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Metode</th>
                  <th className="py-2 pr-3 font-medium">IP</th>
                  <th className="py-2 font-medium">Perangkat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-50">
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
