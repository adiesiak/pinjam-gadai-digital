import { useMutation, useQuery } from "convex/react";
import { CalendarClock, Check, Loader2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { formatRupiah } from "@/lib/money";
import { LABEL_JENIS_RESTRUKTURISASI, type JenisRestrukturisasi } from "@/lib/restrukturisasi";
import { formatTanggalWIB } from "@/lib/waktu";

function KartuPermohonan({
  baris,
}: {
  baris: NonNullable<ReturnType<typeof useDaftar>>[number];
}) {
  const putuskan = useMutation(api.restrukturisasi.putuskanRestrukturisasi);
  const [catatan, setCatatan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const perpanjangan = baris.jenis === "perpanjangan_tenor";

  const putus = async (setuju: boolean) => {
    setSibuk(true);
    try {
      const r = await putuskan({
        id: baris._id,
        setuju,
        ...(catatan.trim() === "" ? {} : { catatan }),
      });
      toast.success(
        setuju
          ? r.jenis === "cicilan"
            ? "Usulan cicilan dicatat sebagai kesepakatan."
            : `Perpanjangan disetujui. Tenor menjadi ${r.tenorBaruHari ?? 0} hari.`
          : "Permohonan ditolak. Tidak ada angka pinjaman yang berubah.",
      );
      setCatatan("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Keputusan gagal disimpan.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {baris.namaLengkap}
            <span className="ml-2 font-mono text-[11px] font-normal text-muted-foreground">
              {baris.nomorReferensi}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {LABEL_JENIS_RESTRUKTURISASI[baris.jenis as JenisRestrukturisasi] ?? baris.jenis} ·{" "}
            {formatTanggalWIB(baris.dibuatPada)}
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
          {baris.diajukanOlehNasabah ? "Diajukan nasabah" : `Dicatat ${baris.diajukanOlehLabel}`}
        </span>
      </div>

      <p className="mt-2 text-sm leading-6 text-slate-800">
        {perpanjangan
          ? `Perpanjangan ${baris.tenorLamaHari} → ${baris.tenorBaruHari} hari (+${baris.tambahanHari}).`
          : `Usulan ${formatRupiah(baris.usulanCicilan ?? 0)} per pembayaran, sekitar ${Math.ceil(
              baris.totalKewajiban / Math.max(1, baris.usulanCicilan ?? 1),
            )} kali. Total kewajiban ${formatRupiah(baris.totalKewajiban)}.`}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-600">Alasan: {baris.alasan}</p>

      <Textarea
        value={catatan}
        onChange={(e) => setCatatan(e.target.value)}
        placeholder="Catatan keputusan (opsional, maksimal 500 karakter)"
        className="mt-3 min-h-16 text-xs"
        maxLength={500}
        disabled={sibuk}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="h-11 sm:h-9"
          disabled={sibuk}
          onClick={() => void putus(true)}
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
          onClick={() => void putus(false)}
        >
          <X className="mr-2 size-4" aria-hidden="true" />
          Tolak
        </Button>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-slate-500">
        {perpanjangan
          ? "Persetujuan menggeser jatuh tempo. Pokok, bunga, dan total kewajiban tidak berubah."
          : "Persetujuan mencatat kesepakatan. Jadwal dan pembayaran tetap dicatat tim di luar aplikasi."}
      </p>
    </li>
  );
}

function useDaftar() {
  return useQuery(api.restrukturisasi.daftarPermohonanMenunggu, {});
}

/**
 * Antrean permohonan restrukturisasi lintas pinjaman.
 *
 * Ditempatkan di tab Jatuh Tempo karena permohonan biasanya lahir dari
 * kesulitan bayar. Tanpa daftar ini, permohonan nasabah hanya terlihat bila
 * pinjamannya sudah punya kasus penagihan.
 */
export function DaftarPermohonanRestrukturisasi() {
  const daftar = useDaftar();

  if (daftar === undefined) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Memuat permohonan
        restrukturisasi…
      </p>
    );
  }
  if (daftar.length === 0) return null;

  return (
    <section aria-labelledby="judul-permohonan-restrukturisasi">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="judul-permohonan-restrukturisasi"
          className="flex items-center gap-2 text-sm font-semibold text-slate-900"
        >
          <CalendarClock className="size-4 text-primary" aria-hidden="true" />
          Permohonan restrukturisasi menunggu
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {daftar.length} permohonan
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        Permohonan nasabah dan usulan admin digabung di sini. Keputusan memerlukan sesi
        admin ber-TOTP dan tercatat di audit trail.
      </p>
      <ul className="mt-3 space-y-3">
        {daftar.map((baris) => (
          <KartuPermohonan key={baris._id} baris={baris} />
        ))}
      </ul>
    </section>
  );
}
