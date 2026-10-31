import { useMutation } from "convex/react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { FunctionReturnType } from "convex/server";

import { KonfirmasiAksi } from "@/components/admin/KonfirmasiAksi";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import { formatRupiah } from "@/lib/money";
import { namaHurufBesar } from "@/lib/nama";

import { formatDate } from "./admin-format";
import { CatatCicilanKredit } from "./CatatCicilanKredit";
import { KreditStatusBadge } from "./KreditStatusBadge";
import { KotakRingkas } from "./KotakRingkas";

export type KreditRowData = NonNullable<
  FunctionReturnType<typeof api.kredit.antreanKreditBarang>
>[number];

/**
 * Review Kredit Barang (Skema C) dalam satu panel samping.
 *
 * Sebelumnya seluruh rincian barang, enam angka pembiayaan, data pemohon, dan
 * empat tombol keputusan menumpuk di dalam kartu antrean — setiap pengajuan
 * memakan satu layar penuh. Di sini ringkasan angka tampil lebih dulu, rincian
 * pendukung di bawahnya, dan aksi keputusan di satu tempat yang sama.
 *
 * Tidak ada logika backend yang berubah: mutation, urutan keputusan, dan
 * konfirmasi hapus tetap sama dengan panel sebelumnya.
 */
export function KreditReviewDialog({
  row,
  onClose,
}: {
  row: KreditRowData | null;
  onClose: () => void;
}) {
  const tandai = useMutation(api.kredit.tandaiKreditDitinjau);
  const setujui = useMutation(api.kredit.setujuiKreditBarang);
  const danai = useMutation(api.kredit.danaiKreditBarang);
  const tolak = useMutation(api.kredit.tolakKreditBarang);
  const hapus = useMutation(api.kredit.hapusKreditBarang);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hapusMenyeluruh, setHapusMenyeluruh] = useState(false);
  const [bukaHapus, setBukaHapus] = useState(false);
  const [konfirmasiHapus, setKonfirmasiHapus] = useState(false);

  // Baris lain = keadaan bersih. Disesuaikan saat render, bukan lewat effect,
  // supaya pesan galat baris sebelumnya tidak terbawa ke pengajuan berikutnya.
  const idBaris: string | null = row?._id ?? null;
  const [idTerakhir, setIdTerakhir] = useState<string | null>(idBaris);
  if (idBaris !== idTerakhir) {
    setIdTerakhir(idBaris);
    setBusy(null);
    setError(null);
    setHapusMenyeluruh(false);
    setBukaHapus(false);
    setKonfirmasiHapus(false);
  }

  if (row === null) return null;

  const menunggu = row.status === "diajukan" || row.status === "sedang_ditinjau";
  const ditutup = row.status === "ditolak" || row.status === "lunas";

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      toast.success("Keputusan kredit barang tersimpan dan tercatat di Audit Trail.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses keputusan kredit.");
    } finally {
      setBusy(null);
    }
  };

  const jalankanHapus = async () => {
    setBusy("delete");
    setError(null);
    try {
      await hapus({
        kreditId: row._id,
        ...(hapusMenyeluruh ? { bersihkanDana: true } : {}),
      });
      toast.success(
        hapusMenyeluruh
          ? "Kredit dan baris turunannya dihapus; jurnal ledger dipertahankan."
          : "Data kredit dihapus dan tercatat di Audit Trail.",
      );
      setKonfirmasiHapus(false);
      onClose();
    } catch (err) {
      const pesan = err instanceof Error ? err.message : "Gagal menghapus data kredit.";
      setError(pesan);
      toast.error(pesan);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto border-l border-slate-200 bg-white p-0 shadow-2xl sm:w-[92vw] sm:max-w-[1100px] xl:w-[78vw] xl:max-w-[1240px]"
      >
        <div className="sticky top-0 z-20 flex items-start gap-3 border-b border-slate-200/70 bg-white px-5 py-4 pr-14">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
            {row.tenorBulan}
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="break-words text-base font-semibold leading-snug text-slate-900">
              {row.namaBarang}
            </SheetTitle>
            <SheetDescription className="mt-0.5 break-words text-xs tabular-nums text-slate-500">
              {row.nomorReferensi} · {row.merchant} · diajukan {formatDate(row._creationTime)}
            </SheetDescription>
          </div>
          <div className="shrink-0 pt-0.5">
            <KreditStatusBadge status={row.status} />
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          {error !== null && (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800"
            >
              {error}
            </p>
          )}

          {/* ── Ringkasan angka: pembiayaan, cicilan, pemohon ─────────────── */}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
              <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Pembiayaan
              </p>
              <KotakRingkas label="Harga barang" nilai={formatRupiah(row.hargaBarang)} />
              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                <KotakRingkas
                  label="Uang muka"
                  nilai={row.dp != null ? formatRupiah(row.dp) : `${row.dpPersen}%`}
                  keterangan={`${row.dpPersen}% dari harga`}
                />
                <KotakRingkas
                  label="Pokok dibiayai"
                  nilai={row.pokokDibiayai != null ? formatRupiah(row.pokokDibiayai) : "—"}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
              <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Cicilan
              </p>
              <KotakRingkas
                label={`Cicilan / bulan · ${row.tenorBulan} bulan`}
                nilai={row.cicilanPerBulan != null ? formatRupiah(row.cicilanPerBulan) : "—"}
                kelas="border-blue-100 bg-blue-50"
                kelasNilai="text-[#0F172A]"
              />
              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                <KotakRingkas
                  label="Biaya layanan"
                  nilai={row.biayaLayanan != null ? formatRupiah(row.biayaLayanan) : "—"}
                />
                <KotakRingkas
                  label="Marjin kontrak"
                  nilai={
                    row.marginKontrak != null
                      ? formatRupiah(row.marginKontrak)
                      : "—"
                  }
                  keterangan={`${row.marginPersenPerBulan}% / bulan · hak pendana`}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
              <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Pemohon
              </p>
              <KotakRingkas label="Nama" nilai={namaHurufBesar(row.namaLengkap)} />
              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                <KotakRingkas label="WhatsApp" nilai={row.nomorWhatsApp ?? "—"} />
                <KotakRingkas
                  label="Cicilan tercatat"
                  nilai={`${row.dibayarBulan}/${row.totalBulan}`}
                  keterangan="bulan"
                />
              </div>
            </div>
          </div>

          {/* ── Rincian pendukung tanpa kalimat panjang ───────────────────── */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Rincian pengajuan
            </p>
            <dl className="mt-2 grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2">
              {(
                [
                  ["Email", row.emailPemohon ?? "—"],
                  ["NIK", row.nik],
                  ["Rekening tujuan", row.nomorRekening],
                  ["Kategori barang", row.kategori],
                  ["Tenor", `${row.tenorBulan} bulan`],
                  ["Status cicilan", `${row.dibayarBulan} dari ${row.totalBulan} bulan`],
                ] as Array<[string, string]>
              ).map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-slate-500">{label}</dt>
                  <dd className="min-w-0 break-words text-right font-medium text-slate-800">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {row.tautanBarang != null && (
              <a
                href={row.tautanBarang}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                Buka produk di merchant
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            )}
            {row.catatanPeminjam != null && row.catatanPeminjam.trim() !== "" && (
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
                <span className="font-semibold text-slate-900">Catatan pemohon: </span>
                {row.catatanPeminjam}
              </p>
            )}
            {row.catatanReview != null && row.catatanReview.trim() !== "" && (
              <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                <span className="font-semibold">Catatan review: </span>
                {row.catatanReview}
              </p>
            )}
          </section>

          {/* ── Aksi admin ────────────────────────────────────────────────── */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Aksi admin
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              Keputusan tersimpan pada ledger internal dan tercatat di Audit Trail.
            </p>

            {menunggu ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {row.status === "diajukan" && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => void run("tinjau", () => tandai({ kreditId: row._id }))}
                    className="gap-1.5 rounded-xl"
                  >
                    {busy === "tinjau" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" aria-hidden="true" />
                    )}
                    Tandai ditinjau
                  </Button>
                )}
                <Button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run("setujui", () => setujui({ kreditId: row._id }))}
                  className="gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {busy === "setujui" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  )}
                  Setujui
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void run("tolak", () => tolak({ kreditId: row._id }))}
                  className="gap-1.5 rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50"
                >
                  {busy === "tolak" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <XCircle className="size-4" aria-hidden="true" />
                  )}
                  Tolak
                </Button>
              </div>
            ) : row.status === "disetujui" ? (
              <div className="mt-3">
                <Button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run("danai", () => danai({ kreditId: row._id }))}
                  className="gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {busy === "danai" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  )}
                  Tandai dana tersalurkan
                </Button>
              </div>
            ) : row.status === "didanai" ? (
              <div>
                <CatatCicilanKredit
                  key={`${row._id}-${row.dibayarBulan}`}
                  row={row}
                />
                {row.jadwal.length > 0 && (
                  <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-left text-[11px]">
                      <caption className="sr-only">Jadwal cicilan kredit</caption>
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th scope="col" className="px-3 py-1.5 font-semibold">Bulan</th>
                          <th scope="col" className="px-3 py-1.5 text-right font-semibold">Pokok</th>
                          <th scope="col" className="px-3 py-1.5 text-right font-semibold">Margin</th>
                          <th scope="col" className="px-3 py-1.5 text-right font-semibold">Total</th>
                          <th scope="col" className="px-3 py-1.5 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {row.jadwal.map((j) => {
                          const lunas = j.bulan <= row.dibayarBulan;
                          const berikut = j.bulan === row.dibayarBulan + 1;
                          return (
                            <tr
                              key={j.bulan}
                              className={berikut ? "bg-primary/5" : undefined}
                            >
                              <td className="px-3 py-1.5 tabular-nums text-slate-700">
                                {j.bulan}/{row.totalBulan}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">
                                {formatRupiah(j.pokok)}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">
                                {formatRupiah(j.margin)}
                              </td>
                              <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-900">
                                {formatRupiah(j.total)}
                              </td>
                              <td className="px-3 py-1.5">
                                <span
                                  className={
                                    lunas
                                      ? "font-semibold text-success-foreground"
                                      : berikut
                                        ? "font-semibold text-amber-700"
                                        : "text-slate-500"
                                  }
                                >
                                  {lunas ? "Lunas" : berikut ? "Berikutnya" : "Belum"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                {ditutup
                  ? "Pengajuan ini sudah ditutup; tidak ada tindakan status yang tersedia."
                  : "Kredit sedang berjalan; tindakan berikutnya mengikuti status ledger."}
              </p>
            )}
          </section>

          {/* ── Hapus data salah input ────────────────────────────────────── */}
          <div className="rounded-xl border border-rose-200/70 bg-rose-50 p-3 text-rose-700">
            <button
              type="button"
              onClick={() => setBukaHapus((x) => !x)}
              aria-expanded={bukaHapus}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-rose-100/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-rose-800">
                <AlertTriangle className="size-4 text-rose-600" aria-hidden="true" />
                Danger Zone · Hapus Kredit
              </span>
              <ChevronDown
                className={`size-4 shrink-0 transition-transform duration-[var(--motion-normal)] ${
                  bukaHapus ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              />
            </button>

            {bukaHapus && (
              <div className="mt-2 space-y-3 border-t border-rose-200/60 px-1 pt-3">
                <p className="text-xs leading-5 text-rose-700">
                  Menghapus kredit <strong>{row.nomorReferensi}</strong> tidak dapat dibatalkan.
                  Audit Trail tetap tersimpan.
                </p>
                <label className="flex items-start gap-2 text-xs leading-5 text-rose-800">
                  <Checkbox
                    checked={hapusMenyeluruh}
                    onCheckedChange={(v) => setHapusMenyeluruh(v === true)}
                    className="mt-0.5 border-rose-300 data-[state=checked]:bg-rose-600 data-[state=checked]:text-white"
                    aria-label="Hapus menyeluruh termasuk alokasi dan cicilan"
                  />
                  <span>
                    <span className="font-semibold">Hapus menyeluruh</span> — alokasi dana dan
                    cicilan ikut dihapus; jurnal ledger tetap utuh.
                  </span>
                </label>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy !== null}
                  onClick={() => setKonfirmasiHapus(true)}
                  className="w-full gap-1.5 rounded-xl sm:w-auto"
                >
                  {busy === "delete" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" aria-hidden="true" />
                  )}
                  Hapus Kredit{hapusMenyeluruh ? " (menyeluruh)" : ""}
                </Button>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
      </Sheet>

      <KonfirmasiAksi
        open={konfirmasiHapus}
        onOpenChange={(terbuka) => {
          if (!terbuka && busy === null) setKonfirmasiHapus(false);
        }}
        judul={`Hapus ${hapusMenyeluruh ? "menyeluruh " : ""}kredit ${row.nomorReferensi}?`}
        deskripsi={
          hapusMenyeluruh
            ? "Alokasi dana dan cicilan yang tercatat ikut dihapus. Jurnal ledger dan Audit Trail tetap tersimpan."
            : "Data dengan transaksi terkait akan ditolak. Centang Hapus menyeluruh bila server menolak karena alokasi dana sudah ada. Audit Trail tetap tersimpan."
        }
        labelKonfirmasi={hapusMenyeluruh ? "Hapus menyeluruh" : "Hapus kredit"}
        busy={busy === "delete"}
        onConfirm={() => void jalankanHapus()}
      />
    </>
  );
}
