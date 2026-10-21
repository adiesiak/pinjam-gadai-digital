/**
 * Dua lapisan pengumuman landing: dialog yang muncul sekali setelah halaman
 * terbuka, dan tombol mengambang yang menyimpan pengumuman agar bisa dibuka
 * kapan saja.
 *
 * Dipindah dari `pages/Landing.tsx` tanpa perubahan tampilan maupun perilaku;
 * keduanya hanya butuh teks dari CMS dan satu callback CTA.
 */
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Megaphone, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AnnouncementModal({
  onOpenCta,
  judul,
  isi,
  cta,
  aktif,
}: {
  onOpenCta: () => void;
  judul: string;
  isi: string;
  cta: string;
  aktif: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!aktif) return;
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, [aktif]);

  if (!aktif) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* `p-0 sm:p-0` meniadakan padding bawaan DialogContent di semua breakpoint:
          panel ini menyusun jaraknya sendiri lewat pembungkus ber-`px-6`. */}
      <DialogContent className="max-h-[90dvh] w-full max-w-md gap-0 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 p-0 sm:max-w-md sm:p-0">
        <div className="px-6 pb-2 pt-7">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Megaphone className="size-5" />
          </span>
          <DialogHeader className="mt-4 space-y-2 text-left">
            <DialogTitle className="text-lg font-semibold text-slate-900">{judul}</DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-600">
              {isi}
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="flex flex-col gap-2 px-6 pb-6 pt-4">
          <Button
            className="w-full bg-primary text-white hover:bg-primary/90"
            onClick={() => {
              setOpen(false);
              onOpenCta();
            }}
          >
            {cta}
            <ArrowRight className="ml-1.5 size-4" />
          </Button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            Nanti saja
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FloatingWidget({
  onOpenCta,
  judul,
  isi,
  cta,
  aktif,
  delayDetik,
}: {
  onOpenCta: () => void;
  judul: string;
  isi: string;
  cta: string;
  aktif: boolean;
  delayDetik: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!aktif) return;
    const t = setTimeout(() => setRevealed(true), Math.max(0, delayDetik) * 1000);
    return () => clearTimeout(t);
  }, [aktif, delayDetik]);

  if (!aktif || !revealed) return null;

  return (
    <div
      className="fixed right-4 z-50 flex flex-col items-end gap-3 sm:right-5"
      style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
    >
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="w-72 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 shadow-lg"
            style={{ maxHeight: "min(24rem, calc(100dvh - 7rem))" }}
          >
            <p className="text-sm font-semibold text-slate-900">{judul}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">{isi}</p>
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                onOpenCta();
              }}
              className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80"
            >
              {cta}
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? "Tutup pengumuman" : "Buka pengumuman"}
        className="inline-flex size-12 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-colors hover:bg-primary/90"
      >
        {expanded ? <X className="size-5" /> : <Megaphone className="size-5" />}
      </button>
    </div>
  );
}
