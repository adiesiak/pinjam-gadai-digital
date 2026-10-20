import { useMutation, useQuery } from "convex/react";
import { Gift, Loader2, RefreshCw, Ticket, Trophy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";

function tanggal(ms: number): string {
  return new Date(ms).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Panel admin Doorprize Emas + antrean auto-matching.
 *
 * Dua hal ini memang satu meja kerja: tiket pendana lahir dari pendanaan yang
 * selesai, dan pokok pinjaman 7/14 hari yang lunas masuk pool yang sama untuk
 * disalurkan lagi. Admin melihat keduanya di satu tempat, tanpa berpindah tab.
 */
export function UndianPanel() {
  const ringkasan = useQuery(api.doorprize.ringkasanAdmin, {});
  const antrean = useQuery(api.matchingQueue.ringkasanAntrean, {});
  const acak = useMutation(api.doorprize.acakPemenang);
  const tandai = useMutation(api.matchingQueue.tandaiTersalurkan);
  const [mengundi, setMengundi] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState(false);

  async function undi() {
    setMengundi(true);
    try {
      const hasil = await acak({});
      toast.success(
        `Pemenang ${hasil.periode}: ${hasil.nama} (${hasil.peran}) — ${hasil.hadiah}.`,
      );
      setKonfirmasi(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pengundian gagal.");
    } finally {
      setMengundi(false);
    }
  }

  async function salurkan(id: Id<"matchingQueue">) {
    try {
      await tandai({ id });
      toast.success("Dana ditandai sudah tersalurkan.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menandai dana.");
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/80 via-white to-emerald-50/50 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
              <Gift className="size-3.5" aria-hidden /> Undian bulanan
            </p>
            <h2 className="mt-1 font-display text-lg text-slate-900">Doorprize Emas</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Tiket terbit otomatis dari pelunasan tepat waktu dan pendanaan Rp1 juta.
              Satu periode hanya punya satu pemenang.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!konfirmasi ? (
              <Button
                type="button"
                onClick={() => setKonfirmasi(true)}
                disabled={mengundi || ringkasan === undefined}
                className="gap-2 bg-emerald-800 text-white hover:bg-emerald-900"
              >
                <Trophy className="size-4" aria-hidden /> Acak Pemenang
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setKonfirmasi(false)}
                  disabled={mengundi}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  onClick={() => void undi()}
                  disabled={mengundi}
                  className="gap-2 bg-amber-700 text-white hover:bg-amber-800"
                >
                  {mengundi ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Ticket className="size-4" aria-hidden />
                  )}
                  Undi sekarang
                </Button>
              </>
            )}
          </div>
        </div>

        {ringkasan === undefined ? (
          <p className="mt-4 text-xs text-muted-foreground">Memuat rekap tiket…</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Periode
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {ringkasan.periode}
              </p>
              <p className="text-[11px] text-slate-500">
                Undian {ringkasan.labelTanggalUndian}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Tiket aktif
              </p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">
                {ringkasan.tiketAktif}
              </p>
              <p className="text-[11px] text-slate-500">
                {ringkasan.tiketPeminjam} peminjam · {ringkasan.tiketPendana} pendana
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Peserta
              </p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">
                {ringkasan.jumlahPeserta}
              </p>
              <p className="text-[11px] text-slate-500">akun dengan tiket sah</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Hadiah utama
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {ringkasan.hadiahUtama}
              </p>
            </div>
          </div>
        )}

        {ringkasan?.pemenang && (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900">
            Pemenang periode ini: <strong>{ringkasan.pemenang.nama}</strong> (
            {ringkasan.pemenang.peran}) — {ringkasan.pemenang.hadiah}, diundi{" "}
            {tanggal(ringkasan.pemenang.diundiPada)} dari{" "}
            {ringkasan.pemenang.jumlahTiket} tiket.
          </p>
        )}

        {konfirmasi && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            Pemenang dipilih acak dari tiket aktif periode ini dan tercatat permanen.
            Tindakan ini tidak bisa dibatalkan.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Antrean auto-matching</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Pokok pinjaman 7/14 hari yang sudah lunas kembali ke pool dan siap
              disalurkan ke peminjam berikutnya.
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums text-emerald-800">
              {antrean === undefined ? "—" : formatRupiah(antrean.totalTersedia)}
            </p>
            <p className="text-[11px] text-slate-500">
              {antrean === undefined
                ? "Memuat…"
                : `${antrean.jumlahTersedia} entri menunggu · ${antrean.sudahTersalurkan} sudah tersalurkan`}
            </p>
          </div>
        </div>

        {antrean === undefined ? (
          <p className="mt-4 text-xs text-muted-foreground">Memuat antrean dana…</p>
        ) : antrean.tersedia.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
            Belum ada dana yang kembali ke pool. Antrean terisi otomatis saat pinjaman
            7 atau 14 hari dilunasi.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {antrean.tersedia.map((baris) => (
              <li
                key={baris.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-slate-800">
                    {baris.nomorReferensi}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    {formatRupiah(baris.pokok)} · tenor {baris.tenorHari} hari · kembali{" "}
                    {tanggal(baris.tersediaPada)}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void salurkan(baris.id)}
                  className="gap-1.5"
                >
                  <RefreshCw className="size-3.5" aria-hidden /> Tandai tersalurkan
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
