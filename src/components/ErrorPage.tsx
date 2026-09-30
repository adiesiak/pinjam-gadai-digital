import { motion } from "framer-motion";
import { ArrowLeft, RotateCcw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Error page generik PINDAI — SATU tampilan untuk semua kendala tak terduga.
 *
 * Aturan penting: detail teknis (pesan server, stack, kode Convex) TIDAK
 * pernah dirender ke layar. Pemanggil cukup mencatatnya di console untuk
 * keperluan diagnosis; pengunjung hanya melihat pesan ramah berbahasa
 * Indonesia beserta jalan keluar yang jelas.
 */
export interface ErrorPageProps {
  /** Label kecil di atas judul, mis. "Kendala sistem". */
  kode?: string;
  judul?: string;
  deskripsi?: string;
  /** Aksi utama: tautan internal, aksi kustom, atau (default) muat ulang. */
  primaryLabel?: string;
  primaryHref?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  secondaryHref?: string;
}

export function ErrorPage({
  kode = "Kendala sistem",
  judul = "Terjadi kendala teknis",
  deskripsi = "PINDAI tidak dapat menyelesaikan permintaan Anda saat ini. Tidak ada data atau dana yang hilang — silakan coba lagi sebentar lagi.",
  primaryLabel,
  primaryHref,
  onPrimary,
  secondaryLabel = "Kembali ke beranda",
  secondaryHref = "/",
}: ErrorPageProps) {
  const aksiUtamaDefault = primaryHref === undefined && onPrimary === undefined;
  const labelUtama = primaryLabel ?? (aksiUtamaDefault ? "Muat ulang halaman" : "Lanjutkan");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"
    >
      <span className="clay-icon-blue inline-flex size-11 items-center justify-center">
        <ShieldAlert className="size-5" />
      </span>
      <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {kode}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{judul}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{deskripsi}</p>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {primaryHref !== undefined ? (
          <Button asChild className="h-11">
            <a href={primaryHref}>{labelUtama}</a>
          </Button>
        ) : (
          <Button
            className="h-11"
            onClick={onPrimary ?? (() => window.location.reload())}
          >
            <RotateCcw className="mr-1.5 size-4" />
            {labelUtama}
          </Button>
        )}
        {secondaryLabel !== null && secondaryHref !== undefined && (
          <Button asChild variant="outline" className="h-11">
            <a href={secondaryHref}>
              <ArrowLeft className="mr-1.5 size-4" />
              {secondaryLabel}
            </a>
          </Button>
        )}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Butuh bantuan? Hubungi tim PINDAI — sertakan nomor referensi transaksi Anda.
      </p>
    </motion.div>
  );
}
