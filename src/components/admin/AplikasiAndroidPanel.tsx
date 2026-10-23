/**
 * Panel admin "Aplikasi Android": ganti splash screen, logo di dalam aplikasi,
 * nama aplikasi, dan warna splash — dipakai aplikasi tanpa build ulang.
 *
 * Panel ini sengaja memisahkan dua hal yang sering dicampur:
 *  - yang BENAR-BENAR berlaku saat berjalan (splash, logo dalam aplikasi, nama,
 *    warna) — disimpan di sini dan dimuat aplikasi tiap kali dibuka;
 *  - yang tetap butuh APK baru (ikon launcher di layar utama) — berkasnya
 *    disediakan di /promo dan disebut apa adanya, bukan dijanjikan bisa diganti
 *    dari panel.
 *
 * Pratinjau memakai painter yang sama dengan /promo (`lib/asetAndroid`) untuk
 * berkas bawaan, dan berkas unggahan admin ditampilkan apa adanya, sehingga yang
 * dilihat admin sama dengan yang nanti dimuat aplikasi.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Check,
  CloudUpload,
  Copy,
  ExternalLink,
  ImageUp,
  Loader2,
  RotateCcw,
  Save,
  Smartphone,
  Trash2,
} from "lucide-react";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { PengingatPembaruanPanel } from "@/components/admin/PengingatPembaruanPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { formatWaktuWIB } from "@/lib/waktu";
import type { Id } from "@/convex/_generated/dataModel";
import {
  BAWAAN_ASET,
  DEFAULT_APLIKASI_ANDROID,
  LANGKAH_KONSUMSI,
  MAKS_NAMA_APLIKASI,
  UKURAN_SARAN,
  URUTAN_ASET_APLIKASI,
  asetBawaan,
  ringkasAsetAplikasi,
  type KunciAsetAplikasi,
} from "@/lib/asetAndroidApp";
import { gambarAsetAndroid } from "@/lib/asetAndroid";
import { unggahDokumen } from "@/lib/unggahDokumen";
import { cn } from "@/lib/utils";

/** Satu slot aset: berkas unggahan baru, dikosongkan, atau belum diubah. */
type PerubahanSlot = { id: Id<"_storage">; nama: string } | null;

/** Pratinjau berkas bawaan — digambar dari painter /promo (tanpa berkas server). */
function PratinjauBawaan({ kunci, className }: { kunci: KunciAsetAplikasi; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const aset = asetBawaan(kunci);

  useEffect(() => {
    const kanvas = ref.current;
    if (!kanvas) return;
    const ctx = kanvas.getContext("2d");
    if (!ctx) return;
    const [lebar, tinggi] = aset.canvas;
    const skala = 120 / Math.max(lebar, tinggi);
    kanvas.width = Math.round(lebar * skala);
    kanvas.height = Math.round(tinggi * skala);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, kanvas.width, kanvas.height);
    ctx.scale(skala, skala);
    gambarAsetAndroid(ctx, aset);
  }, [aset]);

  return (
    <canvas
      ref={ref}
      className={cn("max-h-28 w-auto max-w-full rounded-lg ring-1 ring-slate-200", className)}
      aria-label={BAWAAN_ASET[kunci].label}
      role="img"
    />
  );
}

/** Tombol salin untuk potongan teks di panel. */
function TombolSalin({ teks, label }: { teks: string; label: string }) {
  const [tersalin, setTersalin] = useState(false);

  useEffect(() => {
    if (!tersalin) return;
    const t = setTimeout(() => setTersalin(false), 1600);
    return () => clearTimeout(t);
  }, [tersalin]);

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-8 shrink-0 gap-1 rounded-full px-2.5 text-[11px]"
      onClick={() => {
        void navigator.clipboard
          .writeText(teks)
          .then(() => {
            setTersalin(true);
            toast.success(`${label} disalin.`);
          })
          .catch(() => toast.error("Gagal menyalin."));
      }}
    >
      {tersalin ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {tersalin ? "Tersalin" : "Salin"}
    </Button>
  );
}

export function AplikasiAndroidPanel() {
  const baris = useQuery(api.androidApp.getConfigRow);
  const aktif = useQuery(api.androidApp.asetAktif);
  const simpan = useMutation(api.androidApp.simpan);
  const reset = useMutation(api.androidApp.reset);
  const mintaUrl = useMutation(api.androidApp.generateUploadUrl);

  const [draft, setDraft] = useState<{
    namaAplikasi: string;
    warnaSplash: string;
    warnaTeksSplash: string;
  } | null>(null);
  const [slot, setSlot] = useState<Partial<Record<KunciAsetAplikasi, PerubahanSlot>>>({});
  const [pratinjau, setPratinjau] = useState<Partial<Record<KunciAsetAplikasi, string>>>({});
  const [busy, setBusy] = useState(false);
  const [unggah, setUnggah] = useState<KunciAsetAplikasi | null>(null);
  const [konfirmasiReset, setKonfirmasiReset] = useState(false);

  // URL objek pratinjau dibersihkan saat panel ditutup atau slot diganti.
  useEffect(() => {
    return () => {
      for (const url of Object.values(pratinjau)) {
        if (url) URL.revokeObjectURL(url);
      }
    };
  }, [pratinjau]);

  const adaPerubahan =
    draft !== null || Object.keys(slot).length > 0;

  const nilai = useMemo(
    () => ({
      namaAplikasi: draft?.namaAplikasi ?? aktif?.aplikasi ?? DEFAULT_APLIKASI_ANDROID.namaAplikasi,
      warnaSplash:
        draft?.warnaSplash ?? aktif?.warna.latarSplash ?? DEFAULT_APLIKASI_ANDROID.warnaSplash,
      warnaTeksSplash:
        draft?.warnaTeksSplash ??
        aktif?.warna.teksSplash ??
        DEFAULT_APLIKASI_ANDROID.warnaTeksSplash,
    }),
    [draft, aktif],
  );

  if (baris === undefined || aktif === undefined) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat pengaturan aplikasi…
      </p>
    );
  }

  const json = JSON.stringify(aktif, null, 2);
  const ringkas = ringkasAsetAplikasi(aktif);
  // Ikon yang akan tampil di dalam aplikasi: pratinjau unggahan baru lebih dulu,
  // lalu berkas tersimpan, terakhir berkas bawaan.
  const ikonAktif =
    pratinjau.ikon ?? (slot.ikon === null ? undefined : aktif.aset.ikon.url ?? undefined);

  /** Unggah satu berkas ke storage lalu catat sebagai perubahan yang belum disimpan. */
  const pilihBerkas = async (kunci: KunciAsetAplikasi, file: File | undefined) => {
    if (!file) return;
    setUnggah(kunci);
    try {
      const id = await unggahDokumen(file, () => mintaUrl({}), BAWAAN_ASET[kunci].label);
      setSlot((sebelumnya) => ({ ...sebelumnya, [kunci]: { id, nama: file.name } }));
      setPratinjau((sebelumnya) => {
        const lama = sebelumnya[kunci];
        if (lama) URL.revokeObjectURL(lama);
        return { ...sebelumnya, [kunci]: URL.createObjectURL(file) };
      });
      toast.success(`${file.name} siap disimpan. Tekan “Simpan pengaturan” untuk menerapkan.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Berkas gagal diunggah.");
    } finally {
      setUnggah(null);
    }
  };

  const simpanPengaturan = async () => {
    if (!adaPerubahan) return;
    setBusy(true);
    try {
      await simpan({
        ...(draft !== null
          ? {
              namaAplikasi: draft.namaAplikasi,
              warnaSplash: draft.warnaSplash,
              warnaTeksSplash: draft.warnaTeksSplash,
            }
          : {}),
        ...(slot.splash !== undefined
          ? { splashId: slot.splash === null ? null : slot.splash.id, splashNama: slot.splash?.nama }
          : {}),
        ...(slot.ikon !== undefined
          ? { ikonId: slot.ikon === null ? null : slot.ikon.id, ikonNama: slot.ikon?.nama }
          : {}),
        ...(slot.ikonSplash !== undefined
          ? {
              ikonSplashId: slot.ikonSplash === null ? null : slot.ikonSplash.id,
              ikonSplashNama: slot.ikonSplash?.nama,
            }
          : {}),
      });
      setDraft(null);
      setSlot({});
      setPratinjau({});
      toast.success("Pengaturan tersimpan — aplikasi memakainya saat dibuka berikutnya.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan pengaturan.");
    } finally {
      setBusy(false);
    }
  };

  const kembalikanBawaan = async () => {
    if (!konfirmasiReset) {
      setKonfirmasiReset(true);
      return;
    }
    setBusy(true);
    try {
      const hasil = await reset({});
      setDraft(null);
      setSlot({});
      setPratinjau({});
      setKonfirmasiReset(false);
      toast.success(
        `Pengaturan dikembalikan ke bawaan (${hasil.dihapus} berkas unggahan dihapus).`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengembalikan ke bawaan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-masuk space-y-5">
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-900">
        Perubahan di sini dibaca aplikasi Android <strong>setiap kali dibuka</strong> — tidak perlu
        build ulang untuk splash screen, logo di dalam aplikasi, nama, dan warna. Ikon di{" "}
        <strong>layar utama</strong> tetap milik APK (Android menyimpannya di dalam paket), jadi ia
        baru berubah saat APK berikutnya dibangun dengan berkas dari{" "}
        <Link to="/promo#aset-android" className="inline-flex items-center gap-1 underline">
          /promo <ExternalLink className="size-3" />
        </Link>
        .
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Smartphone className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-navy">Status pengaturan</p>
            <p className="text-xs text-muted-foreground">
              {ringkas.teks}
              {aktif.diperbaruiOleh ? ` · terakhir oleh ${aktif.diperbaruiOleh}` : ""}
              {aktif.diperbaruiPada
                ? ` · ${formatWaktuWIB(aktif.diperbaruiPada)} WIB`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[11px] tabular-nums">
            versi {aktif.versi}
          </Badge>
          <Button
            variant={konfirmasiReset ? "destructive" : "outline"}
            size="sm"
            className="rounded-full"
            disabled={busy || baris === null}
            onClick={() => void kembalikanBawaan()}
          >
            <RotateCcw className="size-4" />
            {konfirmasiReset ? "Klik lagi: ya, kembalikan" : "Kembalikan ke bawaan"}
          </Button>
          <Button
            size="sm"
            className="rounded-full"
            disabled={busy || !adaPerubahan}
            onClick={() => void simpanPengaturan()}
          >
            {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Save className="mr-1.5 size-4" />}
            Simpan pengaturan
          </Button>
        </div>
      </div>

      <PengingatPembaruanPanel />

      <div className="grid gap-5 xl:grid-cols-2">
        {/* Identitas di dalam aplikasi */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-navy">Identitas di dalam aplikasi</h3>
          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="app-nama">Nama aplikasi</Label>
              <Input
                id="app-nama"
                className="mt-1.5"
                maxLength={MAKS_NAMA_APLIKASI}
                value={nilai.namaAplikasi}
                onChange={(e) =>
                  setDraft({ ...nilai, namaAplikasi: e.target.value })
                }
              />
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                Dipakai sebagai judul di dalam aplikasi. Label ikon di layar utama tetap dari APK.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="app-warna-latar">Warna latar splash</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    id="app-warna-latar"
                    type="color"
                    aria-label="Pilih warna latar splash"
                    className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
                    value={nilai.warnaSplash}
                    onChange={(e) => setDraft({ ...nilai, warnaSplash: e.target.value })}
                  />
                  <Input
                    aria-label="Nilai hex warna latar splash"
                    className="font-mono uppercase"
                    maxLength={7}
                    value={nilai.warnaSplash}
                    onChange={(e) => setDraft({ ...nilai, warnaSplash: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="app-warna-teks">Warna teks splash</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    id="app-warna-teks"
                    type="color"
                    aria-label="Pilih warna teks splash"
                    className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
                    value={nilai.warnaTeksSplash}
                    onChange={(e) => setDraft({ ...nilai, warnaTeksSplash: e.target.value })}
                  />
                  <Input
                    aria-label="Nilai hex warna teks splash"
                    className="font-mono uppercase"
                    maxLength={7}
                    value={nilai.warnaTeksSplash}
                    onChange={(e) => setDraft({ ...nilai, warnaTeksSplash: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <p className="text-[11px] leading-4 text-muted-foreground">
              Nilai warna harus berbentuk <code className="font-mono">#RRGGBB</code>; nilai yang
              tidak sah otomatis memakai warna bawaan.
            </p>

            {/* Mock layar pembuka: hanya ilustrasi tata letak, bukan render aplikasi. */}
            <div
              className="flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-300"
              style={{ backgroundColor: nilai.warnaSplash }}
            >
              <div className="text-center">
                <div className="mx-auto flex size-14 items-center justify-center overflow-hidden rounded-2xl bg-white/90 shadow-sm">
                  {ikonAktif ? (
                    <img
                      src={ikonAktif}
                      alt="Logo aplikasi aktif"
                      loading="lazy"
                      decoding="async"
                      className="max-h-12 max-w-12 object-contain"
                    />
                  ) : (
                    <PratinjauBawaan kunci="ikon" className="max-h-12" />
                  )}
                </div>
                <p
                  className="mt-3 text-sm font-bold tracking-[0.18em]"
                  style={{ color: nilai.warnaTeksSplash }}
                >
                  {nilai.namaAplikasi}
                </p>
                <p className="text-[10px] tracking-[0.14em]" style={{ color: nilai.warnaTeksSplash }}>
                  PRATINJAU SPLASH
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Slot aset */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-navy">Berkas aset</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Unggah gambar pengganti, atau kosongkan satu slot untuk kembali memakai berkas bawaan
            yang sudah disertakan aplikasi.
          </p>
          <div className="mt-4 space-y-4">
            {URUTAN_ASET_APLIKASI.map((kunci) => {
              const perubahan = slot[kunci];
              const urlTersimpan = aktif.aset[kunci].url;
              const gambar = pratinjau[kunci] ?? (perubahan === null ? undefined : urlTersimpan ?? undefined);
              const kosong = perubahan === null;
              return (
                <div
                  key={kunci}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-navy">{BAWAAN_ASET[kunci].label}</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                        {BAWAAN_ASET[kunci].berlaku}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-4 text-slate-400">
                        Saran: {UKURAN_SARAN[kunci]}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 text-[11px]",
                        kosong || aktif.aset[kunci].jenis === "bawaan"
                          ? "border-slate-300 text-slate-500"
                          : "border-emerald-300 text-emerald-700",
                      )}
                    >
                      {kosong
                        ? "bawaan"
                        : aktif.aset[kunci].jenis === "unggahan"
                          ? "unggahan admin"
                          : "bawaan"}
                    </Badge>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                      {gambar ? (
                        <img
                          src={gambar}
                          alt={`Pratinjau ${BAWAAN_ASET[kunci].label}`}
                          loading="lazy"
                          decoding="async"
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <PratinjauBawaan kunci={kunci} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:border-primary hover:text-primary">
                          {unggah === kunci ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <ImageUp className="size-3.5" />
                          )}
                          {gambar ? "Ganti berkas" : "Pilih berkas"}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            aria-label={`Unggah ${BAWAAN_ASET[kunci].label}`}
                            disabled={unggah !== null}
                            onChange={(e) => {
                              void pilihBerkas(kunci, e.target.files?.[0]);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 rounded-full px-2 text-[11px] text-destructive hover:bg-destructive/10"
                          disabled={unggah !== null}
                          onClick={() => {
                            setSlot((sebelumnya) => ({ ...sebelumnya, [kunci]: null }));
                            setPratinjau((sebelumnya) => {
                              const lama = sebelumnya[kunci];
                              if (lama) URL.revokeObjectURL(lama);
                              const salinan = { ...sebelumnya };
                              delete salinan[kunci];
                              return salinan;
                            });
                          }}
                        >
                          <Trash2 className="size-3.5" /> Pakai bawaan
                        </Button>
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {perubahan
                          ? `Akan disimpan: ${perubahan.nama}`
                          : aktif.aset[kunci].namaBerkas
                            ? `Aktif: ${aktif.aset[kunci].namaBerkas}`
                            : "Belum ada berkas unggahan — memakai bawaan."}
                      </p>
                      {perubahan && (
                        <p className="text-[11px] font-medium text-amber-700">
                          Tekan “Simpan pengaturan” untuk menerapkan.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Cakupan + cara konsumsi */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-navy">Apa yang berlaku tanpa build ulang</h3>
          <ul className="mt-3 space-y-2">
            {aktif.berlaku.tanpaBuildUlang.map((baris) => (
              <li key={baris} className="flex gap-2 text-xs leading-5 text-slate-600">
                <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                <span>{baris}</span>
              </li>
            ))}
          </ul>
          <h4 className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            Tetap butuh APK baru
          </h4>
          <ul className="mt-2 space-y-2">
            {aktif.berlaku.butuhApkBaru.map((baris) => (
              <li key={baris} className="flex gap-2 text-xs leading-5 text-slate-600">
                <Trash2 className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
                <span>{baris}</span>
              </li>
            ))}
          </ul>
          <h4 className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            Sekali pasang di aplikasi
          </h4>
          <ol className="mt-2 space-y-2">
            {LANGKAH_KONSUMSI.map((langkah, i) => (
              <li key={langkah} className="flex gap-2 text-xs leading-5 text-slate-600">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-navy text-[10px] font-semibold text-white">
                  {i + 1}
                </span>
                <span>{langkah}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Kontrak JSON + endpoint */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-navy">Yang diterima aplikasi</h3>
            <TombolSalin teks={json} label="JSON pengaturan aplikasi" />
          </div>
          <p className="mt-1 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <CloudUpload className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <code className="font-mono">GET {"{CONVEX_SITE_URL}"}/api/aplikasi-android</code> —
              publik, tanpa autentikasi, tanpa data nasabah. Klien Convex bisa memakai query{" "}
              <code className="font-mono">androidApp.asetAktif</code> untuk data yang sama.
            </span>
          </p>
          <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-navy p-3 text-[11px] leading-5 text-[#fbf8f1]">
            <code>{json}</code>
          </pre>
        </section>
      </div>
    </div>
  );
}
