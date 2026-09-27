import { motion } from "framer-motion";
import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";

/** Halaman 404 — kembali ke beranda atau masuk ke akun. */
export default function NotFound() {
  return (
    <motion.main
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-16 text-slate-900"
    >
      <Link
        to="/"
        className="flex items-center gap-2.5 text-sm font-semibold tracking-[0.18em]"
      >
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          P
        </span>
        PINDAI
      </Link>

      <div className="mt-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span className="clay-icon-blue inline-flex size-11 items-center justify-center">
          <Compass className="size-5" />
        </span>
        <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Error 404
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Halaman tidak ditemukan
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Alamat yang Anda buka tidak ada atau sudah dipindahkan. Kembali ke beranda
          untuk melanjutkan pengajuan pinjaman maupun gadai.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild className="h-11">
            <Link to="/">
              <ArrowLeft className="mr-1.5 size-4" />
              Kembali ke beranda
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <Link to="/auth">Masuk ke akun</Link>
          </Button>
        </div>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        PINDAI — Pinjam &amp; Gadai Digital
      </p>
    </motion.main>
  );
}
