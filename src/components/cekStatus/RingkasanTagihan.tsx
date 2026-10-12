import { AlertTriangle, CalendarClock, CheckCircle2, Wallet } from "lucide-react";

import { formatRupiahAman } from "@/lib/money";

/**
 * RINGKASAN TAGIHAN (kwitansi digital) pada halaman publik `/cek-status/<token>`.
 *
 * Murni tampilan: seluruh angka sudah dihitung server (`pelunasanPinjaman`) dan
 * dikirim sebagai teks/nilai jadi, sehingga halaman publik tidak pernah
 * menghitung ulang kewajiban dengan aturan sendiri. Itu penting: dua tempat yang
 * menghitung denda secara terpisah cepat atau lambat akan berbeda angka dengan
 * dashboard peminjam dan tabel admin.
 */

/** Bentuk ringkasan dari `api.tautanStatus.infoTautan`. */
export type RingkasanKwitansi = {
  namaLengkap: string;
  nomorReferensi: string;
  statusLabel: string;
  pokokPinjaman: number;
  tenorTeks: string | null;
  diajukanPada: number;
  totalKewajiban: number | null;
  totalTanpaDenda: number | null;
  dendaTerlambat: number | null;
  jatuhTempoPada: number | null;
  tanggalJatuhTempo: string | null;
  sisaHari: number | null;
  hariTerlambat: number;
};

/** Tanggal ringkas gaya Indonesia; "—" bila nilainya tidak ada. */
function tanggal(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Kalimat hitung hari untuk kewajiban berjalan. */
function kalimatJatuhTempo(r: RingkasanKwitansi): string {
  if (r.totalKewajiban === null) return "Pinjaman ini belum memiliki kewajiban berjalan.";
  if (r.hariTerlambat > 0) return `Terlambat ${r.hariTerlambat} hari dari tanggal jatuh tempo.`;
  if (r.sisaHari === 0) return "Jatuh tempo hari ini.";
  if (r.sisaHari !== null) return `Sisa ${r.sisaHari} hari menuju jatuh tempo.`;
  return "Tanggal jatuh tempo belum tercatat.";
}

/** Baris metrik label/nilai pada kartu kwitansi. */
function Metrik({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm font-medium tabular-nums text-slate-900">{nilai}</dd>
    </div>
  );
}

export function RingkasanTagihan({
  ringkasan,
  terverifikasi,
}: {
  ringkasan: RingkasanKwitansi;
  /** Verifikasi selfie sudah diterima server untuk tautan ini. */
  terverifikasi: boolean;
}) {
  const belumLunas = ringkasan.totalKewajiban !== null;

  return (
    <section
      aria-labelledby="judul-kwitansi"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-br from-emerald-50 to-white px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
            Kwitansi digital · PINDAI
          </p>
          <h2 id="judul-kwitansi" className="mt-1 truncate text-lg font-semibold text-navy">
            {ringkasan.namaLengkap}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ringkasan.nomorReferensi} · diajukan {tanggal(ringkasan.diajukanPada)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-navy">
            {ringkasan.statusLabel}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
              terverifikasi
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {terverifikasi ? (
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
            ) : (
              <AlertTriangle className="size-3.5" aria-hidden="true" />
            )}
            {terverifikasi ? "Verifikasi diterima" : "Belum terverifikasi"}
          </span>
        </div>
      </header>

      <div className="space-y-4 px-5 py-4">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <Wallet className="size-4 shrink-0 text-emerald-700" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
              Total kewajiban
            </p>
            <p className="text-xl font-semibold tabular-nums text-navy">
              {belumLunas ? formatRupiahAman(ringkasan.totalKewajiban as number) : "—"}
            </p>
            {ringkasan.dendaTerlambat !== null && ringkasan.dendaTerlambat > 0 && (
              <p className="mt-0.5 text-[11px] text-amber-800">
                Termasuk denda keterlambatan {formatRupiahAman(ringkasan.dendaTerlambat)}
              </p>
            )}
          </div>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <Metrik
            label="Pokok pinjaman"
            nilai={formatRupiahAman(ringkasan.pokokPinjaman)}
          />
          <Metrik label="Tenor" nilai={ringkasan.tenorTeks ?? "—"} />
          <Metrik
            label="Jatuh tempo"
            nilai={ringkasan.tanggalJatuhTempo ?? "—"}
          />
          <Metrik
            label="Kewajiban sebelum denda"
            nilai={
              ringkasan.totalTanpaDenda === null
                ? "—"
                : formatRupiahAman(ringkasan.totalTanpaDenda)
            }
          />
        </dl>

        <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs leading-5 text-slate-600">
          <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
          <span>{kalimatJatuhTempo(ringkasan)}</span>
        </p>

        {!terverifikasi && (
          <p
            role="status"
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
          >
            Verifikasi selfie & lokasi belum selesai untuk tautan ini. Rincian tetap ditampilkan
            karena ini data pinjaman Anda sendiri — petugas PINDAI dapat melihat status
            verifikasi pada kwitansi ini.
          </p>
        )}

        <p className="text-[11px] leading-5 text-muted-foreground">
          Angka di atas berasal dari catatan internal PINDAI dan bisa berubah bila ada pembayaran
          atau penyesuaian yang dicatat petugas. Kwitansi ini bukan bukti pembayaran — bukti
          pembayaran diberikan setelah pembayaran dicatat petugas.
        </p>
      </div>
    </section>
  );
}
