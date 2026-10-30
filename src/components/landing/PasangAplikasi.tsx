/**
 * Satu tombol "Pasang aplikasi" di beranda.
 *
 * Alurnya dibuat sesingkat mungkin:
 *  1. Bila peramban sudah menawarkan pemasangan (`beforeinstallprompt`), tombol
 *     langsung memanggil tawaran itu — satu ketuk, PINDAI terpasang.
 *  2. Bila belum (iOS selalu begitu, dan sebagian peramban desktop), dialog
 *     menampilkan langkah untuk perangkat yang terdeteksi. Deteksinya murni
 *     (`lib/panduanPasang`), jadi tidak ada tebakan di dalam komponen.
 *
 * Tidak ada tautan Play Store/App Store di sini: listing-nya memang belum ada,
 * dan tombol yang menuju toko kosong akan mengecewakan pengunjung.
 */
import { Download, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  panduanPasang,
  platformPemasanganDari,
  type IdPlatformPasang,
} from "@/lib/panduanPasang";

/** Potongan `beforeinstallprompt`; tipe DOM belum memuat peristiwa ini. */
type PeristiwaPasang = Event & { prompt: () => Promise<void> };

export function PasangAplikasi() {
  const [buka, setBuka] = useState<IdPlatformPasang | null>(null);
  const [tawaran, setTawaran] = useState<PeristiwaPasang | null>(null);

  // Tawaran pemasangan datang sekali dan hilang setelah dipakai.
  useEffect(() => {
    const simpan = (e: Event) => {
      e.preventDefault();
      setTawaran(e as PeristiwaPasang);
    };
    window.addEventListener("beforeinstallprompt", simpan);
    return () => window.removeEventListener("beforeinstallprompt", simpan);
  }, []);

  const panduan = buka === null ? null : panduanPasang(buka);

  const mulaiPasang = () => {
    if (tawaran !== null) {
      void tawaran.prompt();
      setTawaran(null);
      return;
    }
    setBuka(
      typeof navigator === "undefined"
        ? "desktop"
        : platformPemasanganDari(
            navigator.userAgent,
            navigator.maxTouchPoints ?? 0,
          ),
    );
  };

  return (
    <section
      id="pasang-aplikasi"
      aria-labelledby="pasang-aplikasi-judul"
      className="border-y border-border bg-muted"
    >
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="grid gap-6 rounded-kartu border border-border bg-card p-4 sm:gap-8 sm:p-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center lg:gap-12">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-foreground">
              Aplikasi PINDAI
            </p>
            <h2
              id="pasang-aplikasi-judul"
              className="mt-2.5 font-judul text-[1.7rem] leading-[1.15] tracking-tight text-foreground sm:text-[2.1rem]"
            >
              PINDAI di layar utama
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
              Satu tombol. Bila peramban Anda mengizinkan, PINDAI langsung
              terpasang; bila belum, panduan untuk perangkat ini terbuka dan
              tinggal diikuti.
            </p>
            <p className="mt-3 max-w-xl text-xs leading-5 text-slate-500">
              Aplikasi berjalan dari peramban, tanpa berkas unduhan. PINDAI
              belum ada di Play Store maupun App Store.
            </p>
          </div>

          {/* Kotak pemasangan dipisah dari penjelasan supaya tombolnya punya
              tempat sendiri, tidak mengambang di samping dua paragraf. */}
          <div className="rounded-kartu border border-border bg-muted p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-foreground">
              Pasang sekarang
            </p>
            <Button
              type="button"
              onClick={mulaiPasang}
              className="mt-3 min-h-12 w-full gap-2 rounded-tombol bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Download className="size-4" aria-hidden="true" />
              Pasang aplikasi
            </Button>
            <div className="mt-4 border-t border-border pt-4">
              <a
                href="/pindai.apk"
                download="PINDAI.apk"
                className="inline-flex min-h-11 items-center text-xs font-semibold text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Unduh APK Android (pasang manual)
              </a>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Untuk Android yang tidak menampilkan tawaran pemasangan.
                Izinkan “instal dari sumber ini” saat diminta.
              </p>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={panduan !== null}
        onOpenChange={(terbuka) => {
          if (!terbuka) setBuka(null);
        }}
      >
        {panduan ? (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Pasang di {panduan.label}</DialogTitle>
              <DialogDescription>{panduan.peramban}</DialogDescription>
            </DialogHeader>

            <ol className="mt-1 space-y-3">
              {panduan.langkah.map((teks, i) => (
                <li
                  key={teks}
                  className="flex gap-3 text-sm leading-6 text-slate-700"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold tabular-nums text-secondary-foreground">
                    {i + 1}
                  </span>
                  <span>{teks}</span>
                </li>
              ))}
            </ol>

            <p className="mt-1 rounded-lg bg-muted px-3 py-2 text-xs leading-5 text-slate-600">
              {panduan.catatan}
            </p>

            <DialogFooter className="gap-2">
              {panduan.id === "android" && tawaran !== null ? (
                <Button
                  type="button"
                  onClick={() => {
                    void tawaran.prompt();
                    setTawaran(null);
                  }}
                  className="min-h-11 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Smartphone className="size-4" aria-hidden="true" />
                  Instal sekarang
                </Button>
              ) : null}
              <DialogClose asChild>
                <Button type="button" variant="outline" className="min-h-11">
                  Tutup
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  );
}
