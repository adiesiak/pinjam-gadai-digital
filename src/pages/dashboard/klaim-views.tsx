/**
 * DASHBOARD PEMINJAM LAMA — ringkasan historis + tawaran klaim.
 *
 * Kenapa ada: peminjam yang masuk dari web lama tidak boleh mendarat di
 * dashboard kosong. Kartu di sini membaca `klaimPeminjam.ringkasanKlaimSaya`
 * dan:
 *  1. menampilkan bahwa akun ini memang hasil KLAIM (nomor bertopeng + kapan +
 *     berapa berkas yang dipindahkan),
 *  2. menyajikan RIWAYAT pinjaman lamanya (nomor referensi, pokok, skema,
 *     tanggal, status) sehingga portofolionya terbaca walau modul lain masih
 *     memuat,
 *  3. menawarkan penautan bila nomor yang tersimpan pada akun ini masih punya
 *     data lama milik akun lain — memakai formulir yang sama dengan halaman
 *     login, jadi hanya ada SATU alur klaim di seluruh aplikasi.
 *
 * Murni presentasional: tidak ada perhitungan uang di sini. Angka datang dari
 * query (Zero Fake Data), dan bila belum ada apa-apa, tidak ada yang dirender.
 */
import type { FunctionReturnType } from "convex/server";
import { CalendarClock, History, Link2, Landmark, Wallet } from "lucide-react";
import type { CSSProperties } from "react";

import { KlaimPeminjamLama } from "@/components/klaim/KlaimPeminjamLama";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { api } from "@/convex/_generated/api";
import { formatRupiahAman } from "@/lib/money";

type Ringkasan = FunctionReturnType<typeof api.klaimPeminjam.ringkasanKlaimSaya>;

/** Panjang batang: `width` untuk nilai akhir, `--bar-lebar` untuk animasi. */
function gayaBar(persen: number): CSSProperties {
  return { width: `${persen}%`, "--bar-lebar": `${persen}%` } as CSSProperties;
}

/** Tanggal singkat Indonesia; kosong bila waktunya memang tidak ada. */
function tanggal(waktu: number | null): string {
  if (waktu === null) return "—";
  return new Date(waktu).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function Satuan({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="rounded-xl border border-emerald-900/10 bg-white/70 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{nilai}</p>
    </div>
  );
}

export function RingkasanPeminjamLama({ klaim }: { klaim: Ringkasan | undefined }) {
  if (klaim === undefined || klaim === null) return null;

  const { ringkasan, klaimTerbaru, pinjaman, tawaranKlaim } = klaim;
  const adaPortofolio = pinjaman.length > 0 || ringkasan.gadai > 0 || ringkasan.kredit > 0;

  // Tawaran klaim hanya ditampilkan bila akun ini BELUM punya portofolio atau
  // memang belum pernah menautkan data lama — supaya tidak menutupi data nyata.
  if (!klaim.sudahKlaim && !adaPortofolio && tawaranKlaim === null) return null;

  const persenLunas =
    ringkasan.pinjaman === 0
      ? 0
      : Math.round((ringkasan.pinjamanLunas / ringkasan.pinjaman) * 100);

  return (
    <div className="mb-6 space-y-4">
      {(klaim.sudahKlaim || adaPortofolio) && (
        <section
          aria-label="Riwayat peminjam lama"
          className="glass-card micro-metric rounded-2xl border p-4 shadow-sm sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                <History className="size-4 text-emerald-700" aria-hidden="true" />
                Riwayat peminjam lama
                {klaim.sudahKlaim && (
                  <Badge
                    variant="outline"
                    className="badge-pop border-emerald-200 bg-emerald-50 text-emerald-800"
                  >
                    <span aria-hidden className="badge-dot badge-dot--hidup" />
                    Data lama tersambung
                  </Badge>
                )}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {klaimTerbaru === null
                  ? "Portofolio historis yang tercatat pada akun ini."
                  : `Diverifikasi lewat WhatsApp ${klaimTerbaru.nomorTampil} pada ${tanggal(klaimTerbaru.pada)} · ${klaimTerbaru.metode === "otp_whatsapp" ? "login nomor lama" : "klaim dari sesi aktif"}.`}
              </p>
            </div>
            {klaim.nomorTersimpanTampil !== null && (
              <p className="shrink-0 text-[11px] text-muted-foreground">
                Nomor akun:{" "}
                <span className="font-semibold tabular-nums text-slate-700">
                  {klaim.nomorTersimpanTampil}
                </span>
              </p>
            )}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Satuan label="Pinjaman" nilai={String(ringkasan.pinjaman)} />
            <Satuan label="Pokok tercatat" nilai={formatRupiahAman(ringkasan.pokokPinjaman)} />
            <Satuan label="Aktif" nilai={String(ringkasan.pinjamanAktif)} />
            <Satuan label="Lunas" nilai={String(ringkasan.pinjamanLunas)} />
          </div>

          {/* Batang proporsi pelunasan: meluncur dari 0 ke nilai target, dengan
              kilau berjalan di atasnya (`.bar-tumbuh` + `.shimmer-pass`). */}
          <div className="mt-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-700">
                Proporsi pinjaman lunas
              </span>
              <span className="text-[11px] font-semibold tabular-nums text-slate-500">
                {persenLunas}%
              </span>
            </div>
            <div
              aria-hidden
              className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/70 ring-inset"
            >
              <span
                className="bar-tumbuh shimmer-pass block h-full rounded-full bg-emerald-600"
                style={gayaBar(persenLunas)}
              />
            </div>
            {(ringkasan.gadai > 0 || ringkasan.kredit > 0) && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Gadai {ringkasan.gadai} berkas ({ringkasan.gadaiAktif} aktif) · kredit barang{" "}
                {ringkasan.kredit} berkas ({ringkasan.kreditAktif} aktif)
              </p>
            )}
          </div>

          {pinjaman.length > 0 && (
            <ul className="mt-4 space-y-2">
              {pinjaman.map((baris) => (
                <li
                  key={baris._id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2.5 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-white/90 hover:shadow-[0_12px_30px_rgba(6,78,59,0.1)]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold tabular-nums text-slate-900">
                      {formatRupiahAman(baris.pokokPinjaman)}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {baris.nomorReferensi}
                      </span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Wallet className="size-3" aria-hidden="true" />
                        {baris.skema === "bulanan"
                          ? `Bulanan ${baris.tenorBulan ?? 0} bulan`
                          : `Harian ${baris.tenorHari ?? 0} hari`}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="size-3" aria-hidden="true" />
                        Diajukan {tanggal(baris.diajukanPada)}
                        {baris.lunasPada !== null ? ` · Lunas ${tanggal(baris.lunasPada)}` : ""}
                      </span>
                    </p>
                  </div>
                  <StatusBadge status={baris.status} kind="loan" />
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 flex items-start gap-2 text-[10px] leading-4 text-muted-foreground">
            <Landmark className="mt-0.5 size-3 shrink-0 text-emerald-700" aria-hidden="true" />
            Baris di atas adalah riwayat internal PINDAI. Klaim hanya menyambungkan
            kepemilikan berkas — nominal, status, tanggal, dan pencatatan lama tidak diubah.
          </p>
        </section>
      )}

      {tawaranKlaim !== null && (
        <section
          aria-label="Tawaran klaim data lama"
          className="rounded-2xl border border-emerald-900/10 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/60 p-4 shadow-sm sm:p-5"
        >
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
            <Link2 className="size-4 text-emerald-700" aria-hidden="true" />
            Data lama menunggu disambungkan
            <Badge
              variant="outline"
              className="badge-pop border-emerald-200 bg-white text-emerald-800"
            >
              {tawaranKlaim.berkas.pinjaman + tawaranKlaim.berkas.gadai + tawaranKlaim.berkas.kredit}{" "}
              berkas
            </Badge>
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Nomor {tawaranKlaim.nomorTampil} tercatat punya data lama pada akun lain. Verifikasi
            nomor itu untuk memindahkan kepemilikannya ke akun yang sedang Anda pakai.
          </p>
          <KlaimPeminjamLama className="mt-3" />
        </section>
      )}
    </div>
  );
}
