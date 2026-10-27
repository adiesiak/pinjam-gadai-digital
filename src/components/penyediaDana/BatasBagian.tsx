import { RotateCcw, TriangleAlert } from "lucide-react";
import { Component, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * Batas galat untuk SATU bagian ruang pendana yang punya query sendiri.
 *
 * Halaman itu membaca beberapa query terpisah (peta, laporan, siklus,
 * persetujuan, proyeksi syariah). Sebelumnya semuanya berada di satu komponen,
 * jadi satu query opsional yang gagal membuat seluruh portofolio kosong.
 * Dengan batas ini, bagian yang gagal hanya mengganti dirinya sendiri dan
 * menawarkan coba lagi tanpa memuat ulang seluruh halaman.
 */
export class BatasBagian extends Component<
  { nama: string; children: ReactNode },
  { pesan: string | null }
> {
  state: { pesan: string | null } = { pesan: null };

  static getDerivedStateFromError(error: Error) {
    return { pesan: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[PINDAI] Bagian "${this.props.nama}" gagal dimuat:`,
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.pesan === null) return this.props.children;
    return (
      <div
        role="status"
        className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950"
      >
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          Bagian {this.props.nama} tidak bisa dimuat sekarang. Bagian lain tetap
          bisa dibaca.
          {import.meta.env.DEV && (
            <span className="mt-1 block break-words font-mono text-[11px] text-amber-900/80">
              {this.state.pesan}
            </span>
          )}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1 border-amber-300 bg-white text-xs text-amber-950"
          onClick={() => this.setState({ pesan: null })}
        >
          <RotateCcw className="size-3.5" aria-hidden /> Coba lagi
        </Button>
      </div>
    );
  }
}
