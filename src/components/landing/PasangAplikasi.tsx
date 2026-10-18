/**
 * Tombol pemasangan aplikasi di beranda — Android dan iPhone.
 *
 * Keputusan penting: PINDAI belum punya listing Play Store maupun App Store,
 * jadi TIDAK ADA tautan toko di sini. Kedua tombol membuka panduan pemasangan
 * dari peramban, dan bagian ini menyebut status itu apa adanya. Tombol yang
 * menuju toko kosong akan membuat pengunjung menunggu sesuatu yang belum ada.
 *
 * Android: bila Chrome sudah menawarkan pemasangan (`beforeinstallprompt`),
 * dialog menampilkan tombol "Instal sekarang" yang memakai tawaran itu. Bila
 * belum (manifest/service worker belum memenuhi syarat), yang tampil hanya
 * langkah manual — bukan tombol mati.
 */
import { Apple, Download, Smartphone } from "lucide-react";
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
  PANDUAN_PASANG,
  panduanPasang,
  type IdPlatformPasang,
} from "@/lib/panduanPasang";

/** Potongan `beforeinstallprompt`; tipe DOM belum memuat peristiwa ini. */
type PeristiwaPasang = Event & { prompt: () => Promise<void> };

export function PasangAplikasi() {
  const [buka, setBuka] = useState<IdPlatformPasang | null>(null);
  const [tawaran, setTawaran] = useState<PeristiwaPasang | null>(null);

  // Tawaran pemasangan hanya datang sekali dan bisa hilang setelah dipakai,
  // jadi peristiwanya disimpan lalu ditawarkan ulang lewat dialog.
  useEffect(() => {
    const simpan = (e: Event) => {
      e.preventDefault();
      setTawaran(e as PeristiwaPasang);
    };
    window.addEventListener("beforeinstallprompt", simpan);
    return () => window.removeEventListener("beforeinstallprompt", simpan);
  }, []);

  const panduan = buka === null ? null : panduanPasang(buka);

  const pasangSekarang = async () => {
    if (tawaran === null) return;
    await tawaran.prompt();
    setTawaran(null);
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
            Pasang aplikasi
          </p>
          <h2
            id="pasang-aplikasi-judul"
            className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
          >
            PINDAI di layar utama
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Aplikasi berjalan dari peramban, jadi tidak ada berkas unduhan.
            Memasangnya hanya menambah ikon — akun, status, dan data tetap sama.
          </p>
          <p className="mt-3 text-xs leading-5 text-slate-600">
            PINDAI belum ada di Play Store maupun App Store. Tombol di samping
            membuka langkah pemasangan dari peramban.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {PANDUAN_PASANG.map((item) => {
            const Ikon = item.id === "ios" ? Apple : Smartphone;
            return (
              <Button
                key={item.id}
                type="button"
                variant="outline"
                onClick={() => setBuka(item.id)}
                className="min-h-12 gap-2 rounded-full border-[#d5e1d8] bg-white px-5 text-[#1e293b] hover:bg-[#fbfcfa]"
              >
                <Ikon className="size-4" aria-hidden="true" />
                Pasang di {item.label}
              </Button>
            );
          })}
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
                  onClick={() => void pasangSekarang()}
                  className="min-h-11 gap-2 bg-[#065f46] text-white hover:bg-[#064e3b]"
                >
                  <Download className="size-4" aria-hidden="true" />
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
