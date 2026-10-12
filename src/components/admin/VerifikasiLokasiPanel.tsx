import { useQuery } from "convex/react";
import { AlertTriangle, Camera, MapPin, ShieldCheck } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { EmptyQueue, PanelMemuat } from "@/components/admin/admin-shared";
import { formatDate } from "@/components/admin/admin-format";

/**
 * PANEL ADMIN — audit verifikasi & titik lokasi dari tautan WhatsApp.
 *
 * Ditampilkan di modul "Peta Live Location" karena isinya satu keluarga: titik
 * yang datang dari halaman `/cek-status` memang ikut mengalir ke peta di atasnya
 * (jalur `live_locations` → `lokasiJejak`). Yang khas di panel ini adalah bukti
 * VERIFIKASI: foto selfie yang benar-benar tersimpan, waktu pengambilan menurut
 * perangkat dan waktu penerimaan server, koordinat, serta IP/user agent pemakai.
 *
 * Catatan untuk tim: data ini dikumpulkan dengan penyataan terbuka di halaman
 * verifikasi (lihat `components/cekStatus/KartuVerifikasi`) dan hanya untuk
 * memastikan kwitansi dibuka pemilik pinjamannya. Jangan dipakai untuk keperluan
 * lain, dan jangan diteruskan ke pihak ketiga tanpa dasar.
 */

/** Waktu lengkap (tanggal + jam) untuk kolom audit. */
function formatWaktu(ts: number): string {
  const jam = new Date(ts).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatDate(ts)} ${jam}`;
}

/** Koordinat ringkas + akurasi; null bila tidak ada. */
function formatKoordinat(lat: number | null, lng: number | null, akurasi: number | null): string {
  if (lat === null || lng === null) return "lokasi tidak tersedia";
  const dasar = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return akurasi === null ? dasar : `${dasar} (±${Math.round(akurasi)} m)`;
}

/** Lencana sumber titik: klik tautan atau verifikasi. */
function lencanaSumber(source: string) {
  if (source === "whatsapp_link_click") {
    return { label: "Klik tautan WhatsApp", kelas: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  }
  if (source === "verifikasi_tautan") {
    return { label: "Verifikasi", kelas: "border-sky-200 bg-sky-50 text-sky-800" };
  }
  return { label: source, kelas: "border-slate-200 bg-slate-50 text-slate-600" };
}

export function VerifikasiLokasiPanel() {
  const data = useQuery(api.tautanStatus.verifikasiTerbaru, { limit: 20 });

  if (data === undefined) return <PanelMemuat baris={3} />;

  const adaIsi = data.verifikasi.length > 0 || data.titik.length > 0;
  if (!adaIsi) {
    return (
      <EmptyQueue
        icon={Camera}
        title="Belum ada verifikasi dari tautan WhatsApp"
        deskripsi="Baris muncul setelah peminjam membuka tautan cek status yang dikirim admin dan menyelesaikan verifikasi."
        poin={[
          "Foto selfie yang diterima beserta waktu pengambilan & penerimaan",
          "Koordinat, akurasi, IP, dan user agent pemakai",
          "Titik lokasi berkala dari halaman cek status (tiap 10 detik)",
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
            Verifikasi dari tautan WhatsApp
          </h2>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Pengambilan foto & lokasi di halaman <code>/cek-status</code> dinyatakan terbuka kepada
          peminjam sebelum izin diminta. Data di bawah dipakai hanya untuk memastikan kwitansi
          dibuka pemilik pinjamannya.
        </p>

        {data.verifikasi.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-3 py-4 text-xs leading-5 text-muted-foreground">
            Belum ada foto verifikasi yang tersimpan. Titik lokasi dari tautan tetap tampil di
            bawah bila halaman cek status sudah pernah dibuka.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {data.verifikasi.map((v) => (
              <li key={v._id} className="flex flex-wrap items-start gap-4 py-4">
                {v.foto === null ? (
                  <span className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-[10px] text-muted-foreground">
                    foto tidak dapat dimuat
                  </span>
                ) : (
                  <a
                    href={v.foto}
                    target="_blank"
                    rel="noreferrer"
                    className="block size-16 shrink-0 overflow-hidden rounded-xl border border-slate-200"
                    title="Buka foto verifikasi"
                  >
                    <img
                      src={v.foto}
                      alt={`Foto verifikasi ${v.namaLengkap}`}
                      loading="lazy"
                      className="size-16 object-cover"
                    />
                  </a>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{v.namaLengkap}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {v.nomorReferensi} · {Math.max(1, Math.round(v.selfieByte / 1024))} KB
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Diambil {formatWaktu(v.diambilPada)} · diterima {formatWaktu(v.diterimaPada)}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                    <MapPin className="size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                    {formatKoordinat(v.latitude, v.longitude, v.accuracy)}
                  </p>
                  <p className="mt-0.5 break-all text-[11px] text-muted-foreground">
                    IP {v.ipAddress ?? "tidak tercatat"}
                    {v.userAgent === null ? "" : ` · ${v.userAgent}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <MapPin className="size-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-navy">Titik lokasi dari tautan</h3>
        </div>
        {data.titik.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Belum ada titik lokasi dari tautan cek status.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {data.titik.map((t) => {
              const lencana = lencanaSumber(t.source);
              return (
                <li key={t._id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {t.namaLengkap} · <span className="text-muted-foreground">{t.nomorReferensi}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatWaktu(t.updatedAt)} · {formatKoordinat(t.latitude, t.longitude, t.accuracy)}
                    </p>
                    {t.ipAddress !== null && (
                      <p className="mt-0.5 break-all text-[11px] text-muted-foreground">
                        IP {t.ipAddress}
                      </p>
                    )}
                    {t.catatan !== null && (
                      <p className="mt-1 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] leading-4 text-amber-900">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                        <span>Tidak masuk jejak resmi: {t.catatan}</span>
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${lencana.kelas}`}
                  >
                    {lencana.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
