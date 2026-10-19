import { useMutation, useQuery } from "convex/react";
import { CalendarClock, Check, Loader2, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  LABEL_STATUS_RESTRUKTURISASI,
  TAMBAHAN_HARI_PILIHAN,
  type StatusRestrukturisasi,
} from "@/lib/restrukturisasi";
import { formatTanggalWIB } from "@/lib/waktu";

/**
 * Panel perpanjangan tenor di dalam kasus penagihan.
 *
 * Hanya pinjaman harian yang bisa diperpanjang; skema bulanan ditolak server
 * dengan alasan yang tampil di sini. Persetujuan menggeser jatuh tempo tanpa
 * mengubah pokok, bunga, atau total kewajiban.
 */

export type RingkasanRestrukturisasi = {
  boleh: boolean;
  alasan: string | null;
  tenorHari: number | null;
  tenorBulan: number | null;
  didanaiPada: number | null;
  jatuhTempoPada: number | null;
  hariTerlambat: number;
  menunggu: {
    _id: Id<"restrukturisasiPinjaman">;
    tambahanHari: number;
    tenorBaruHari: number;
    alasan: string;
    diajukanOlehLabel: string;
    dibuatPada: number;
  } | null;
  riwayat: {
    _id: Id<"restrukturisasiPinjaman">;
    jenis: string;
    status: string;
    tenorLamaHari: number;
    tenorBaruHari: number;
    tambahanHari: number;
    alasan: string;
    diajukanOlehLabel: string;
    dibuatPada: number;
    diputuskanOlehLabel: string | null;
    diputuskanPada: number | null;
    catatanKeputusan: string | null;
  }[];
};

export function BagianRestrukturisasi({
  hasil,
  tambahan,
  alasan,
  catatan,
  sibuk,
  kabar,
  galat,
  onUbahTambahan,
  onUbahAlasan,
  onUbahCatatan,
  onAjukan,
  onPutuskan,
}: {
  hasil: RingkasanRestrukturisasi | undefined;
  tambahan: number;
  alasan: string;
  catatan: string;
  sibuk: boolean;
  kabar: string | null;
  galat: string | null;
  onUbahTambahan: (nilai: number) => void;
  onUbahAlasan: (nilai: string) => void;
  onUbahCatatan: (nilai: string) => void;
  onAjukan: () => void;
  onPutuskan: (setuju: boolean) => void;
}) {
  if (hasil === undefined) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Memuat data perpanjangan...
      </p>
    );
  }

  const tenorBaru = (hasil.tenorHari ?? 0) + tambahan;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-navy">
        <CalendarClock className="size-4 text-primary" aria-hidden="true" />
        Perpanjangan tenor
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {hasil.tenorBulan !== null
          ? "Pinjaman ini memakai skema bulanan."
          : `Tenor saat ini ${hasil.tenorHari ?? "—"} hari${
              hasil.jatuhTempoPada === null
                ? ""
                : ` · jatuh tempo ${formatTanggalWIB(hasil.jatuhTempoPada)}${
                    hasil.hariTerlambat > 0 ? ` · terlambat ${hasil.hariTerlambat} hari` : ""
                  }`
            }.`}
      </p>

      {hasil.menunggu !== null && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-amber-900">
            Usulan menunggu keputusan: {hasil.menunggu.tenorBaruHari} hari (+
            {hasil.menunggu.tambahanHari})
          </p>
          <p className="mt-1 text-[11px] leading-4 text-amber-900">
            Diajukan {formatTanggalWIB(hasil.menunggu.dibuatPada)} oleh{" "}
            {hasil.menunggu.diajukanOlehLabel}. Alasan: {hasil.menunggu.alasan}
          </p>
          <Textarea
            value={catatan}
            onChange={(e) => onUbahCatatan(e.target.value)}
            placeholder="Catatan keputusan (opsional)"
            className="mt-2 min-h-16 bg-white text-xs"
            disabled={sibuk}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="h-11 sm:h-9"
              disabled={sibuk}
              onClick={() => onPutuskan(true)}
            >
              {sibuk ? (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="mr-2 size-4" aria-hidden="true" />
              )}
              Setujui
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-11 border-slate-200 sm:h-9"
              disabled={sibuk}
              onClick={() => onPutuskan(false)}
            >
              <X className="mr-2 size-4" aria-hidden="true" />
              Tolak
            </Button>
          </div>
        </div>
      )}

      {hasil.menunggu === null && (
        <div className="mt-3 space-y-2">
          {!hasil.boleh && hasil.alasan !== null && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-600">
              {hasil.alasan}
            </p>
          )}
          {hasil.boleh && (
            <>
              <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                <label className="text-xs text-slate-600">
                  Tambahan hari
                  <select
                    className="mt-1 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50 sm:h-9"
                    value={String(tambahan)}
                    onChange={(e) => onUbahTambahan(Number(e.target.value))}
                    disabled={sibuk}
                  >
                    {TAMBAHAN_HARI_PILIHAN.map((n) => (
                      <option key={n} value={n}>
                        +{n} hari
                      </option>
                    ))}
                  </select>
                </label>
                <p className="self-end text-xs leading-5 text-muted-foreground">
                  Tenor baru menjadi <strong>{tenorBaru} hari</strong>. Pokok, bunga, dan total
                  kewajiban tidak berubah.
                </p>
              </div>
              <Textarea
                value={alasan}
                onChange={(e) => onUbahAlasan(e.target.value)}
                placeholder="Alasan perpanjangan (mis. nasabah kehilangan penghasilan bulan ini)"
                className="min-h-16 text-xs"
                disabled={sibuk}
              />
              <Button
                type="button"
                size="sm"
                className="h-11 sm:h-9"
                disabled={sibuk || alasan.trim().length < 10}
                onClick={onAjukan}
              >
                {sibuk ? (
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CalendarClock className="mr-2 size-4" aria-hidden="true" />
                )}
                Ajukan perpanjangan
              </Button>
            </>
          )}
        </div>
      )}

      {kabar !== null && (
        <p role="status" className="mt-2 text-xs leading-5 text-emerald-700">
          {kabar}
        </p>
      )}
      {galat !== null && (
        <p role="alert" className="mt-2 text-xs leading-5 text-red-600">
          {galat}
        </p>
      )}

      {hasil.riwayat.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2">
          {hasil.riwayat.slice(0, 5).map((r) => (
            <li key={r._id} className="text-[11px] leading-4 text-slate-600">
              <strong>
                {LABEL_STATUS_RESTRUKTURISASI[r.status as StatusRestrukturisasi] ?? r.status}
              </strong>{" "}
              · {r.tenorLamaHari} → {r.tenorBaruHari} hari (+{r.tambahanHari}) ·{" "}
              {formatTanggalWIB(r.diputuskanPada ?? r.dibuatPada)}
              {r.diputuskanOlehLabel !== null ? ` oleh ${r.diputuskanOlehLabel}` : ""}
              {r.catatanKeputusan !== null ? ` · ${r.catatanKeputusan}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RestrukturisasiPinjaman({ loanId }: { loanId: Id<"loans"> }) {
  const hasil = useQuery(api.restrukturisasi.ringkasanRestrukturisasi, { loanId });
  const ajukan = useMutation(api.restrukturisasi.ajukanRestrukturisasi);
  const putuskan = useMutation(api.restrukturisasi.putuskanRestrukturisasi);

  const [tambahan, setTambahan] = useState<number>(TAMBAHAN_HARI_PILIHAN[1]);
  const [alasan, setAlasan] = useState("");
  const [catatan, setCatatan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [kabar, setKabar] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const jalankan = async (kerja: () => Promise<string>) => {
    setSibuk(true);
    setKabar(null);
    setGalat(null);
    try {
      setKabar(await kerja());
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Tindakan gagal diselesaikan.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <BagianRestrukturisasi
      hasil={hasil}
      tambahan={tambahan}
      alasan={alasan}
      catatan={catatan}
      sibuk={sibuk}
      kabar={kabar}
      galat={galat}
      onUbahTambahan={setTambahan}
      onUbahAlasan={setAlasan}
      onUbahCatatan={setCatatan}
      onAjukan={() =>
        void jalankan(async () => {
          const r = await ajukan({ loanId, tambahanHari: tambahan, alasan });
          setAlasan("");
          return `Usulan perpanjangan ke ${r.tenorBaruHari} hari terkirim dan menunggu keputusan.`;
        })
      }
      onPutuskan={(setuju) =>
        void jalankan(async () => {
          if (hasil === undefined || hasil.menunggu === null) throw new Error("Tidak ada usulan.");
          const r = await putuskan({
            id: hasil.menunggu._id,
            setuju,
            catatan: catatan.trim() === "" ? undefined : catatan,
          });
          setCatatan("");
          return setuju
            ? `Perpanjangan disetujui. Tenor pinjaman kini ${r.tenorBaruHari ?? 0} hari.`
            : "Usulan perpanjangan ditolak. Tenor pinjaman tidak berubah.";
        })
      }
    />
  );
}
