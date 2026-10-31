import { CircleAlert, RotateCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * Batas galat satu modul admin.
 *
 * Shell, sidebar, dan kepala panel sengaja tetap hidup saat satu panel gagal.
 * Admin bisa membaca sebabnya, mencoba lagi, atau pindah modul tanpa kehilangan
 * seluruh konteks kerja karena satu query yang sedang bermasalah.
 */
export class BatasModulAdmin extends Component<
  { nama: string; children: ReactNode },
  { galat: boolean }
> {
  state = { galat: false };

  static getDerivedStateFromError() {
    return { galat: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[PINDAI] Modul admin "${this.props.nama}" gagal:`, error, info.componentStack);
  }

  render() {
    if (!this.state.galat) return this.props.children;

    return (
      <section
        role="alert"
        className="rounded-2xl border border-red-200 bg-red-50/70 p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-white text-red-700">
            <CircleAlert className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-red-950">
              Modul {this.props.nama} gagal dimuat
            </h2>
            <p className="mt-1 text-sm leading-6 text-red-900">
              Sebagian data tidak bisa dibaca. Panel lain tetap bisa dipakai; coba
              muat ulang modul ini setelah koneksi stabil.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 border-red-200 bg-white text-red-800 hover:bg-red-100"
              onClick={() => this.setState({ galat: false })}
            >
              <RotateCw className="size-4" aria-hidden />
              Coba lagi
            </Button>
          </div>
        </div>
      </section>
    );
  }
}
