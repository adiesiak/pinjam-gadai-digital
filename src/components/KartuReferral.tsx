/**
 * Kartu referral di Ringkasan dashboard nasabah.
 *
 * Tiga keadaan yang ditampilkan apa adanya:
 *  - belum punya kode: kunci sampai ada pinjaman lunas, atau tombol aktifkan;
 *  - sudah punya kode: kode, tombol salin/bagikan, dan hitungan teman;
 *  - belum memakai kode orang lain: kotak klaim, hanya sebelum pinjaman pertama.
 *
 * Hadiah tidak dijanjikan di layar sebelum pinjaman lunas — kartu menyebut
 * syaratnya, karena voucher baru terbit di server saat pelunasan.
 */
import { useMutation, useQuery } from "convex/react";
import { Check, Copy, Gift, Lock, Send, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { formatRupiah } from "@/lib/money";
import { pesanBagikanReferral } from "@/lib/referral";
import { formatTanggalWIB } from "@/lib/waktu";
import { cn } from "@/lib/utils";

const KELAS_STATUS = {
  menunggu_lunas: "bg-amber-50 text-amber-800 border-amber-200",
  hadiah_diberikan: "bg-emerald-50 text-emerald-800 border-emerald-200",
  batal: "bg-slate-100 text-slate-600 border-slate-200",
} as const;

export function KartuReferral({ className }: { className?: string }) {
  const data = useQuery(api.referral.ringkasanSaya);
  const aktifkan = useMutation(api.referral.aktifkanKode);
  const klaim = useMutation(api.referral.klaimKode);
  const [sibuk, setSibuk] = useState(false);
  const [kodeMasukan, setKodeMasukan] = useState("");
  const [tersalin, setTersalin] = useState(false);

  if (data === undefined || data === null) return null;

  const salin = async () => {
    if (data.kode === null) return;
    try {
      await navigator.clipboard.writeText(data.kode);
      setTersalin(true);
      toast.success("Kode referral disalin.");
      setTimeout(() => setTersalin(false), 2000);
    } catch {
      toast.error("Peramban menolak menyalin. Salin kodenya secara manual.");
    }
  };

  const bagikan = () => {
    if (data.kode === null) return;
    const tautan = `${window.location.origin}/auth`;
    const pesan = pesanBagikanReferral(data.kode, tautan);
    window.open(`https://wa.me/?text=${encodeURIComponent(pesan)}`, "_blank", "noopener");
  };

  const buatKode = async () => {
    setSibuk(true);
    try {
      await aktifkan({});
      toast.success("Kode referral aktif.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kode gagal dibuat.");
    } finally {
      setSibuk(false);
    }
  };

  const pakaiKode = async () => {
    setSibuk(true);
    try {
      await klaim({ kode: kodeMasukan });
      setKodeMasukan("");
      toast.success("Kode tercatat. Hadiah terbit setelah pinjaman pertama lunas.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kode gagal dipakai.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <section
      className={cn(
        "rounded-2xl border border-emerald-900/10 bg-white p-4 shadow-sm sm:p-5",
        className,
      )}
      aria-labelledby="judul-referral"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800">
          <Users className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="judul-referral" className="text-sm font-semibold text-slate-900">
            Ajak teman, dapat potongan biaya admin
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-slate-600">
            Hadiah untukmu {formatRupiah(data.hadiah.perujuk)} dan untuk teman{" "}
            {formatRupiah(data.hadiah.pengundang)}, terbit saat pinjaman pertamanya lunas
            (pokok minimal {formatRupiah(data.hadiah.minimalPokok)}).
          </p>
        </div>
      </div>

      {data.kode !== null ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/70 px-3 py-2 font-mono text-base font-semibold tracking-[0.18em] text-emerald-900">
              {data.kode}
            </code>
            <Button type="button" size="sm" variant="outline" onClick={salin} className="gap-1.5">
              {tersalin ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {tersalin ? "Tersalin" : "Salin"}
            </Button>
            <Button type="button" size="sm" onClick={bagikan} className="gap-1.5 bg-emerald-800 text-white hover:bg-emerald-900">
              <Send className="size-3.5" aria-hidden="true" />
              Bagikan
            </Button>
          </div>

          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
              <dt className="text-[10px] uppercase tracking-wide text-slate-500">Teman memakai</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                {data.ringkasan.menunggu + data.ringkasan.berhasil}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
              <dt className="text-[10px] uppercase tracking-wide text-slate-500">Berhasil lunas</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                {data.ringkasan.berhasil}
              </dd>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-2">
              <dt className="text-[10px] uppercase tracking-wide text-emerald-700">Total hadiah</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-900">
                {formatRupiah(data.ringkasan.totalHadiah)}
              </dd>
            </div>
          </dl>

          {data.klaim.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {data.klaim.slice(0, 3).map((satu) => (
                <li
                  key={satu.diklaimPada}
                  className="flex items-center justify-between gap-2 text-[11px] text-slate-600"
                >
                  <span>{formatTanggalWIB(satu.diklaimPada)}</span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 font-medium",
                      KELAS_STATUS[satu.status],
                    )}
                  >
                    {satu.status === "hadiah_diberikan"
                      ? "Hadiah diberikan"
                      : satu.status === "menunggu_lunas"
                        ? "Menunggu lunas"
                        : "Dibatalkan"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <Lock className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-xs leading-5 text-slate-600">
            {data.alasan ?? "Kode referral belum aktif untuk akun ini."}
          </p>
          {data.bisaAktifkan && (
            <Button type="button" size="sm" onClick={buatKode} disabled={sibuk}>
              {sibuk ? "Membuat…" : "Aktifkan kode"}
            </Button>
          )}
        </div>
      )}

      {data.klaimSaya !== null ? (
        <p
          className={cn(
            "mt-3 rounded-xl border px-3 py-2 text-[11px] leading-5",
            KELAS_STATUS[data.klaimSaya.status],
          )}
        >
          Kode <strong>{data.klaimSaya.kode}</strong> tercatat pada{" "}
          {formatTanggalWIB(data.klaimSaya.diklaimPada)}. {data.klaimSaya.labelStatus}.
        </p>
      ) : data.punyaPinjaman ? null : (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void pakaiKode();
          }}
        >
          <label htmlFor="kode-referral" className="sr-only">
            Kode referral teman
          </label>
          <Input
            id="kode-referral"
            value={kodeMasukan}
            onChange={(e) => setKodeMasukan(e.target.value.toUpperCase())}
            placeholder="Contoh: BUDI7K2"
            autoComplete="off"
            className="sm:max-w-xs"
            maxLength={12}
          />
          <Button type="submit" variant="outline" size="sm" disabled={sibuk || kodeMasukan.trim().length < 4} className="gap-1.5">
            <Gift className="size-3.5" aria-hidden="true" />
            {sibuk ? "Menyimpan…" : "Pakai kode"}
          </Button>
        </form>
      )}
    </section>
  );
}
