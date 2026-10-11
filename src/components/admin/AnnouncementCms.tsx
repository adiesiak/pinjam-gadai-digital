import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";

/** Kartu section CMS (komponen modul, bukan dibuat saat render). */
function CmsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-navy">{title}</h3>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/**
 * Editor CMS landing — semua teks halaman utama & pengumuman (bar berjalan,
 * popup, widget mengambang) diedit tim di sini, langsung tampil publik.
 */
export function AnnouncementCms() {
  const row = useQuery(api.announcements.getCmsRow);
  const publik = useQuery(api.announcements.getPublic);
  const save = useMutation(api.announcements.save);
  const reset = useMutation(api.announcements.resetToDefaults);
  const bersihkan = useMutation(api.announcements.bersihkanTeksLama);

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

  const bersihkanTeksLama = async () => {
    setBusy(true);
    try {
      const hasil = await bersihkan({});
      if (hasil.diganti.length === 0) {
        toast.success("Tidak ada teks lama yang perlu dibersihkan.");
        return;
      }
      setDraft(null);
      toast.success(
        `Teks lama dikembalikan ke default baru: ${hasil.diganti.join(", ")}.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membersihkan teks lama.");
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
      <Switch aria-label={label} checked={val} onCheckedChange={(v) => set(key, v)} />
    </div>
  );

  return (
    <div className="animate-masuk space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        Teks CMS yang tersimpan menggantikan default di halaman utama. Periksa semua bar, popup, widget, hero, dan kartu layanan agar tidak mengklaim transfer, pencairan, atau pembayaran/pelunasan yang terverifikasi; nilai CMS yang sudah tersimpan tidak diubah oleh audit ini — pakai tombol "Bersihkan teks lama" agar teks lama era pendana dikembalikan ke default baru.
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-muted-foreground">
          Semua perubahan langsung tampil di halaman utama setelah disimpan.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={busy} onClick={bersihkanTeksLama}>
            Bersihkan teks lama
          </Button>
          <Button variant="outline" disabled={busy} onClick={kembalikanDefault}>
            Reset ke default
          </Button>
          <Button disabled={!draft || busy} onClick={simpan}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Simpan perubahan
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <CmsSection title="Bar pengumuman berjalan (atas semua halaman)">
          {T("Teks berjalan", "teks", d("teks", publik.barTeks), { area: true, max: 240 })}
          {T("Tautan CTA (opsional)", "tautan", d("tautan", publik.barTautan), { placeholder: "/auth" })}
          {Toggle("Tampilkan bar", "Nonaktif menyembunyikan bar dari semua halaman.", "barAktif", db("barAktif", publik.barAktif))}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="animate-marquee flex w-max py-2">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="mx-4 text-xs font-medium text-slate-900">{d("teks", publik.barTeks)}</span>
              ))}
            </div>
          </div>
        </CmsSection>

        <CmsSection title="Popup pengumuman (muncul 1,5 detik setelah buka)">
          {T("Judul", "popupJudul", d("popupJudul", publik.popupJudul), { max: 80 })}
          {T("Isi", "popupIsi", d("popupIsi", publik.popupIsi), { area: true, max: 500 })}
          {T("Teks tombol CTA", "popupCta", d("popupCta", publik.popupCta), { max: 60 })}
          {Toggle("Tampilkan popup", "Tampil tiap kunjungan halaman utama.", "popupAktif", db("popupAktif", publik.popupAktif))}
        </CmsSection>

        <CmsSection title="Widget pengumuman mengambang (pojok kanan bawah)">
          {T("Judul", "floatJudul", d("floatJudul", publik.floatJudul), { max: 80 })}
          {T("Isi", "floatIsi", d("floatIsi", publik.floatIsi), { area: true, max: 300 })}
          {T("Teks tombol CTA", "floatCta", d("floatCta", publik.floatCta), { max: 60 })}
          {T("Delay kemunculan (detik)", "floatDelayDetik", d("floatDelayDetik", String(publik.floatDelayDetik)))}
          {Toggle("Tampilkan widget", "Muncul otomatis sesuai delay, bisa ditutup.", "floatAktif", db("floatAktif", publik.floatAktif))}
        </CmsSection>

        <CmsSection title="Header & Hero">
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
        </CmsSection>

        <CmsSection title="Bagian layanan (body)">
          {T("Judul bagian", "layananJudul", d("layananJudul", publik.layananJudul), { max: 120 })}
          {T("Sub-judul bagian", "layananSub", d("layananSub", publik.layananSub), { area: true, max: 300 })}
          {T("Judul kartu Pinjaman", "pinjamanJudul", d("pinjamanJudul", publik.pinjamanJudul), { max: 80 })}
          {T("Isi kartu Pinjaman", "pinjamanIsi", d("pinjamanIsi", publik.pinjamanIsi), { area: true, max: 400 })}
          {T("Tombol kartu Pinjaman", "pinjamanCta", d("pinjamanCta", publik.pinjamanCta), { max: 40 })}
          {T("Judul kartu Gadai", "gadaiJudul", d("gadaiJudul", publik.gadaiJudul), { max: 80 })}
          {T("Isi kartu Gadai", "gadaiIsi", d("gadaiIsi", publik.gadaiIsi), { area: true, max: 400 })}
          {T("Tombol kartu Gadai", "gadaiCta", d("gadaiCta", publik.gadaiCta), { max: 40 })}
        </CmsSection>
      </div>
    </div>
  );
}
