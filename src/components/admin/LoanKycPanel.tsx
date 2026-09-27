import { useAction, useQuery } from "convex/react";
import { Loader2, MapPin, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { WatermarkedDoc } from "@/components/WatermarkedDoc";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";

import { type LoanRow } from "./admin-shared";

/**
 * Panel KYC + lokasi pengajuan + kirim pengingat WhatsApp.
 */
export function LoanKycPanel({ row }: { row: LoanRow }) {
  const urls = useQuery(api.admin.dokumenKycUrls, { loanId: row._id });
  const sendWa = useAction(api.whatsapp.sendReminder);
  const [waBusy, setWaBusy] = useState(false);

  const lokasi = row.lokasiAjukan;
  const petaHref = lokasi
    ? `https://www.openstreetmap.org/?mlat=${lokasi.lat}&mlon=${lokasi.lng}#map=16/${lokasi.lat}/${lokasi.lng}`
    : null;

  const kirim = async () => {
    setWaBusy(true);
    try {
      await sendWa({ loanId: row._id });
      toast.success("Pengingat WhatsApp terkirim & tercatat di log.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengirim pengingat.");
    } finally {
      setWaBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Data KYC peminjam
      </p>
      {urls === undefined ? (
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat data KYC…
        </div>
      ) : urls === null ? (
        <p className="text-sm text-muted-foreground">Data KYC tidak ditemukan untuk pinjaman ini.</p>
      ) : (
        <>
          <div className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            <p className="text-muted-foreground">
              NIK: <span className="tabular-nums text-navy">{urls.nik ?? "—"}</span>
            </p>
            <p className="text-muted-foreground">
              WhatsApp: <span className="tabular-nums text-navy">{urls.nomorWhatsApp ?? "—"}</span>
            </p>
            <p className="text-muted-foreground">
              Penghasilan: <span className="tabular-nums text-navy">{urls.penghasilanBulanan !== null ? formatRupiah(urls.penghasilanBulanan) : "—"}</span>
            </p>
            <p className="text-muted-foreground">
              Sumber: <span className="text-navy">{urls.sumberPenghasilan ?? "—"}</span>
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              ["KTP", urls.ktpUrl],
              ["Selfie + KTP", urls.selfieUrl],
              ["Slip gaji", urls.slipUrl],
            ] as const).map(([label, url]) =>
              url ? (
                <WatermarkedDoc key={label} src={url} label={label} />
              ) : (
                <span
                  key={label}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-6 text-xs text-muted-foreground"
                >
                  {label} tidak tersedia
                </span>
              ),
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <MapPin className="size-3.5 text-primary" /> Lokasi saat pengajuan
            </p>
            {lokasi ? (
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {lokasi.lat.toFixed(5)}, {lokasi.lng.toFixed(5)} · ±{Math.round(lokasi.akurasi)} m
                {petaHref && (
                  <>
                    {" · "}
                    <a href={petaHref} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">
                      Buka peta
                    </a>
                  </>
                )}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Tidak ada (pengajuan sebelum fitur lokasi).</p>
            )}
          </div>
          <RiwayatLokasiMini userId={row.userIdPeminjam} />
          {row.nomorWhatsApp && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={waBusy}
                onClick={kirim}
              >
                {waBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
                Kirim pengingat WhatsApp
              </Button>
              <a
                href={`https://wa.me/${row.nomorWhatsApp}?text=${encodeURIComponent(
                  `Halo ${row.namaLengkap}, kami dari PINDAI (Pinjam & Gadai Digital). Pinjaman Anda ${row.nomorReferensi} memiliki total kewajiban ${formatRupiah(row.totalKewajibanDenganPenalti ?? 0)}${(row.hariTerlambat ?? 0) > 0 ? ` (termasuk denda keterlambatan ${formatRupiah(row.dendaTerlambat ?? 0)})` : ""}. Mohon lakukan pelunasan tepat waktu. Terima kasih.`,
                )}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-transform hover:-translate-y-0.5 hover:bg-emerald-600"
              >
                <Send className="size-4" /> Kirim Tagihan WA
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** 5 titik lokasi terakhir peminjam — ringkasan untuk reviewer. */
function RiwayatLokasiMini({ userId }: { userId: Id<"users"> }) {
  const riwayat = useQuery(api.tracking.riwayatAdmin, { userId, limit: 5 });
  if (riwayat === undefined) return null;
  if (riwayat.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Belum ada jejak lokasi berkelanjutan dari peminjam ini.
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-xs font-medium">Jejak lokasi terakhir ({riwayat.length})</p>
      <ul className="mt-1.5 space-y-1">
        {riwayat.map((t) => (
          <li key={t._id} className="text-xs tabular-nums text-muted-foreground">
            {new Date(t.waktu).toLocaleString("id-ID")} · {t.lat.toFixed(5)}, {t.lng.toFixed(5)} · ±{Math.round(t.akurasi)} m
          </li>
        ))}
      </ul>
    </div>
  );
}
