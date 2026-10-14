import { useQuery } from "convex/react";
import { Camera, ShieldCheck } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { EmptyQueue, PanelMemuat } from "@/components/admin/admin-shared";
import { formatDate } from "@/components/admin/admin-format";

/** Panel audit browser hanya menampilkan aktivitas dan ringkasan non-sensitif. */

/** Waktu lengkap (tanggal + jam) untuk kolom audit. */
function formatWaktu(ts: number): string {
  const jam = new Date(ts).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatDate(ts)} ${jam}`;
}

export function VerifikasiLokasiPanel() {
  const data = useQuery(api.system.auditVerifikasiPembayaran, { limit: 60 });

  if (data === undefined) return <PanelMemuat baris={3} />;

  const adaIsi = data.rows.length > 0;
  if (!adaIsi) {
    return (
      <EmptyQueue
        icon={Camera}
        title="Belum ada catatan verifikasi tagihan"
        deskripsi="Catatan muncul setelah peminjam secara eksplisit setuju menjalankan verifikasi browser dari dialog detail tagihan."
        poin={[
          "Status dimulai/selesai/gagal beserta waktu server",
          "Ukuran media yang diproses dan akurasi GPS yang dibulatkan",
          "Tidak menyimpan media, koordinat mentah, IP, atau user-agent",
        ]}
      />
    );
  }

  return (
    <section aria-labelledby="judul-verifikasi-lokasi" className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          <h2 id="judul-verifikasi-lokasi" className="text-sm font-semibold text-navy">
            Audit verifikasi browser
          </h2>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Catatan aktivitas dari sesi persetujuan. Media dan koordinat GPS mentah tidak disimpan;
          akurasi disimpan setelah pembulatan 50 meter. Akses panel ini memerlukan sesi admin TOTP.
        </p>
        <ul className="mt-4 divide-y divide-slate-100">
          {data.rows.map((row) => (
            <li key={row._id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-900">
                  Pinjaman {row.target ?? ""} · {row.aktorLabel}
                </p>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatWaktu(row.waktu)}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-700">{row.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
