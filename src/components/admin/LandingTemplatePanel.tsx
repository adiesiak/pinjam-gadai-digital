import { useMutation, useQuery } from "convex/react";
import {
  Check,
  Eye,
  Loader2,
  Monitor,
  Smartphone,
  Sparkles,
  Tablet,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { LandingHero } from "@/components/landing/LandingHero";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import {
  labelTemplateLanding,
  LANDING_TEMPLATES,
  templateLandingAman,
  type LandingTemplateId,
} from "@/lib/landingTemplate";

/**
 * Panel Admin → Landing Page → Template 3D.
 *
 * Menampilkan ENAM template landing 3D, memungkinkan admin mempratinjau
 * masing-masing (dengan komponen template SEBENARNYA, bukan tangkapan layar),
 * lalu mengaktifkannya. Aktivasi benar-benar tersimpan di Convex lewat
 * `api.system.setLandingTemplate` — backend memeriksa sesi admin dan hanya
 * menerima ID dari allowlist — dan dicatat di Audit Trail. Tidak perlu ubah
 * kode maupun deploy ulang: halaman `/` membaca template aktif dari backend.
 *
 * Kinerja pratinjau (penting): HANYA SATU adegan 3D hidup pada satu waktu.
 * Dialog pratinjau merender satu template; mengganti pilihan meng-unmount yang
 * lama (loop WebGL + konteks dibersihkan oleh `destroy()` di templateScene.ts).
 * Kartu-kartu di daftar sengaja memakai miniatur CSS, bukan enam canvas WebGL.
 *
 * Tautan di dalam pratinjau dinonaktifkan (klik tidak berpindah halaman) supaya
 * admin tidak meninggalkan Meja Kerja hanya karena mencoba CTA.
 */

type Perangkat = { id: string; label: string; lebar: number; Icon: typeof Monitor };

/** Lebar mengikuti target responsif §30 (desktop, tablet, dua ukuran ponsel). */
const PERANGKAT: readonly Perangkat[] = [
  { id: "desktop", label: "Desktop 1440", lebar: 1440, Icon: Monitor },
  { id: "tablet", label: "Tablet 1024", lebar: 1024, Icon: Tablet },
  { id: "mobile", label: "Mobile 390", lebar: 390, Icon: Smartphone },
  { id: "mobile-kecil", label: "Mobile kecil 360", lebar: 360, Icon: Smartphone },
];

/** Tinggi jendela pratinjau (isi dipotong seperti tangkapan perangkat). */
const TINGGI_PRATINJAU = 460;

/**
 * Skala pratinjau = lebar jendela / lebar perangkat.
 *
 * Diukur lewat ResizeObserver, BUKAN dihitung sekali saat mount: dialog bisa
 * dibuka pada lebar layar apa pun. Nilai awal di-set dari callback rAF (bukan di
 * badan effect) supaya tidak ada render berantai saat halaman pertama dimuat.
 */
function useSkalaPratinjau(lebar: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [skala, setSkala] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const hitung = () => {
      if (el.clientWidth === 0) return;
      setSkala(Math.min(1, el.clientWidth / lebar));
    };
    const raf = requestAnimationFrame(hitung);
    const ro = new ResizeObserver(hitung);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [lebar]);

  return { ref, skala };
}

export function LandingTemplatePanel() {
  const aktif = useQuery(api.system.getLandingTemplatePublic, {});
  const setLandingTemplate = useMutation(api.system.setLandingTemplate);

  const [pratinjau, setPratinjau] = useState<LandingTemplateId | null>(null);
  const [perangkatId, setPerangkatId] = useState(PERANGKAT[0].id);
  const [konfirmasi, setKonfirmasi] = useState<LandingTemplateId | null>(null);
  const [busy, setBusy] = useState<LandingTemplateId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const perangkat = PERANGKAT.find((p) => p.id === perangkatId) ?? PERANGKAT[0];
  const { ref: panggungRef, skala } = useSkalaPratinjau(perangkat.lebar);

  /** Cegah klik CTA di dalam pratinjau membawa admin keluar dari Meja Kerja. */
  const tahanTautan = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target;
    if (target instanceof Element && target.closest("a") !== null) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  if (aktif === undefined) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat template 3D…
      </div>
    );
  }

  const templateAktif = templateLandingAman(aktif.template);

  const aktifkan = async (id: LandingTemplateId) => {
    setBusy(id);
    setError(null);
    try {
      await setLandingTemplate({ template: id });
      toast.success(
        `${labelTemplateLanding(id)} sekarang menjadi tampilan landing page publik.`,
      );
      setKonfirmasi(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal mengganti template 3D.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const infoKonfirmasi = konfirmasi !== null ? labelTemplateLanding(konfirmasi) : null;

  return (
    <div className="animate-masuk space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          <Sparkles className="size-4" /> Landing page · Template 3D
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-navy">
          Enam pengalaman visual untuk halaman depan
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Pilih template visual 3D untuk route publik <code>/</code>. Konten, CMS, dan alur
          pengajuan tetap sama — yang berganti hanya adegan 3D-nya. Perubahan langsung dipakai
          halaman depan tanpa mengubah kode dan tanpa deploy ulang, serta tercatat di Audit Trail.
        </p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground">
          <Check className="size-3.5" /> Template aktif: {labelTemplateLanding(templateAktif)}
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-3">
        {LANDING_TEMPLATES.map((template) => {
          const terpilih = templateAktif === template.id;
          return (
            <article
              key={template.id}
              data-template={template.id}
              className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md ${
                terpilih ? "border-emerald-300 ring-2 ring-emerald-600/20" : "border-slate-200"
              }`}
            >
              {/* Miniatur CSS bertema palet template — BUKAN canvas WebGL. Enam
                  scene sekaligus tidak perlu dijalankan hanya untuk daftar ini. */}
              <div
                className="relative p-4"
                style={{
                  backgroundImage: `radial-gradient(120% 90% at 24% 16%, ${template.palet[0]}dd, transparent 62%), radial-gradient(90% 80% at 80% 84%, ${template.palet[1]}33, transparent 70%)`,
                  backgroundColor: template.palet[2],
                }}
              >
                <span className="absolute right-3 top-3 rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-white/85">
                  {template.nomor}
                </span>
                <div className="mt-8 flex items-end gap-2">
                  <span
                    className="block h-16 w-24 rotate-[-6deg] rounded-lg border shadow-lg"
                    style={{
                      backgroundColor: template.palet[0],
                      borderColor: `${template.palet[1]}66`,
                    }}
                  />
                  <span
                    className="block h-10 w-16 rotate-[4deg] rounded-lg border shadow-lg"
                    style={{
                      backgroundColor: `${template.palet[0]}cc`,
                      borderColor: `${template.palet[1]}55`,
                    }}
                  />
                </div>
                <div className="mt-4 flex gap-1.5" aria-hidden="true">
                  {template.palet.map((warna) => (
                    <span
                      key={warna}
                      className="size-4 rounded-full border border-black/20"
                      style={{ backgroundColor: warna }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-navy">{template.nama}</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {template.deskripsi}
                    </p>
                  </div>
                  {terpilih && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-800">
                      <Check className="size-3" /> Aktif · Sedang digunakan
                    </span>
                  )}
                </div>

                <ul className="flex flex-wrap gap-1.5" aria-label="Interaksi yang tersedia">
                  {template.interaksi.map((interaksi) => (
                    <li
                      key={interaksi}
                      className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                    >
                      {interaksi}
                    </li>
                  ))}
                </ul>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setPratinjau(template.id)}
                  >
                    <Eye className="size-4" /> Preview
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    variant={terpilih ? "outline" : "default"}
                    disabled={busy !== null || terpilih}
                    onClick={() => setKonfirmasi(template.id)}
                  >
                    {busy === template.id ? <Loader2 className="size-4 animate-spin" /> : null}
                    {terpilih ? "Sedang digunakan" : "Gunakan Template"}
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      {/* ── Pratinjau: SATU adegan hidup, komponen template yang sebenarnya. ── */}
      <Dialog
        open={pratinjau !== null}
        onOpenChange={(open) => {
          if (!open) setPratinjau(null);
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              Pratinjau {pratinjau !== null ? labelTemplateLanding(pratinjau) : ""}
            </DialogTitle>
            <DialogDescription>
              Ini komponen landing page yang sebenarnya, dirender pada lebar perangkat yang
              dipilih. Interaksi (tilt kartu, parallax, hover) tetap aktif. Tautan di dalam
              pratinjau sengaja dinonaktifkan agar tidak meninggalkan Meja Kerja.
            </DialogDescription>
          </DialogHeader>

          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Ukuran perangkat pratinjau"
          >
            {PERANGKAT.map((p) => (
              <Button
                key={p.id}
                type="button"
                size="sm"
                variant={p.id === perangkatId ? "default" : "outline"}
                aria-pressed={p.id === perangkatId}
                onClick={() => setPerangkatId(p.id)}
              >
                <p.Icon className="size-4" /> {p.label}
              </Button>
            ))}
          </div>

          <div
            ref={panggungRef}
            className="relative w-full overflow-hidden rounded-xl border border-slate-800"
            style={{ height: TINGGI_PRATINJAU, backgroundColor: "#021E17" }}
            onClickCapture={tahanTautan}
          >
            <div
              style={{
                width: perangkat.lebar,
                transform: `scale(${skala})`,
                transformOrigin: "top left",
              }}
            >
              {pratinjau !== null && (
                <LandingHero
                  template={pratinjau}
                  eyebrow="PINDAI · Pinjaman dan Gadai Digital"
                  judul1="Solusi Finansial, Lebih Jelas"
                  judul2="dalam Genggaman."
                  deskripsi="Kenali pilihan pinjaman dan gadai, pahami biaya serta ketentuannya, dan kelola pengajuan secara digital melalui PINDAI."
                  ctaUtama={{ label: "Ajukan Sekarang", href: "/auth" }}
                  ctaSekunder={{ label: "Pelajari Cara Kerja", onClick: () => {} }}
                  mikro="Informasi biaya, ketentuan, dan hasil pengajuan mengikuti produk serta proses verifikasi yang berlaku."
                  sudahMasuk={false}
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Konfirmasi aktivasi: preview ≠ aktivasi. ── */}
      <AlertDialog
        open={konfirmasi !== null}
        onOpenChange={(open) => {
          if (!open) setKonfirmasi(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gunakan Template {infoKonfirmasi}?</AlertDialogTitle>
            <AlertDialogDescription>
              Template ini akan menjadi tampilan landing page publik dan langsung dipakai semua
              pengunjung pada halaman <code>/</code>. Konten, CMS, dan alur pengajuan tidak
              berubah. Perubahan ini tercatat di Audit Trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Batalkan</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy !== null}
              onClick={(e) => {
                // Dialog ditutup sendiri oleh handler `aktifkan` setelah sukses.
                e.preventDefault();
                if (konfirmasi !== null) void aktifkan(konfirmasi);
              }}
            >
              {busy !== null ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Gunakan Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
