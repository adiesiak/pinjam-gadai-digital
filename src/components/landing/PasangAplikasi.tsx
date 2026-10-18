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
      className="border-y border-[#dce7df] bg-[#f4f7f5]"
    >
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#065f46]">
            Aplikasi PINDAI
          </p>
          <h2
            id="pasang-aplikasi-judul"
            className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
          >
            PINDAI di layar utama
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Satu tombol. Bila peramban Anda mengizinkan, PINDAI langsung
            terpasang; bila belum, panduan untuk perangkat ini terbuka dan
            tinggal diikuti.
          </p>
          <p className="mt-3 text-xs leading-5 text-slate-600">
            Aplikasi berjalan dari peramban, tanpa berkas unduhan. PINDAI belum
            ada di Play Store maupun App Store.
          </p>
        </div>

        <div>
          <Button
            type="button"
            onClick={mulaiPasang}
            className="min-h-12 gap-2 rounded-full bg-[#065f46] px-6 text-white hover:bg-[#064e3b]"
          >
            <Download className="size-4" aria-hidden="true" />
            Pasang aplikasi
          </Button>
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
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#e5f2e9] text-[11px] font-semibold tabular-nums text-[#064e3b]">
                    {i + 1}
                  </span>
                  <span>{teks}</span>
                </li>
              ))}
            </ol>

            <p className="mt-1 rounded-lg bg-[#f4f7f5] px-3 py-2 text-xs leading-5 text-slate-600">
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
                  className="min-h-11 gap-2 bg-[#065f46] text-white hover:bg-[#064e3b]"
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
