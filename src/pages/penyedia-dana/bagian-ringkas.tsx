import { useQuery } from "convex/react";
import { CalendarClock } from "lucide-react";

import { BarisAngka } from "@/pages/penyedia-dana/bagian-umum";
import { rupiah, tanggalRingkas } from "@/pages/penyedia-dana/format";
import { api } from "@/convex/_generated/api";

/**
 * Catatan siklus 30 hari di puncak ruang pendana.
 *
 * Query-nya tinggal di komponen sendiri supaya kegagalan membaca siklus tidak
 * ikut mengosongkan portofolio. Pemanggil membungkusnya dengan `BatasBagian`.
 */
export function CatatanSiklus() {
  const siklusSaya = useQuery(api.siklusPendana.siklusSaya, {});
  const siklusBerikut = (siklusSaya ?? [])
    .filter((s) => s.status === "berjalan")
    .sort((a, b) => a.jatuhTempoPada - b.jatuhTempoPada)[0];
  if (siklusBerikut === undefined) return null;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs leading-5 text-emerald-950">
      <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
      {siklusBerikut.jatuhTempo ? (
        <>
          Siklus <strong>{rupiah(siklusBerikut.totalCair)}</strong> sudah jatuh
          tempo sejak {tanggalRingkas(siklusBerikut.jatuhTempoPada)} dan menunggu
          pencairan admin.
        </>
      ) : (
        <>
          Siklus berikutnya cair{" "}
          <strong>{tanggalRingkas(siklusBerikut.jatuhTempoPada)}</strong> sebesar{" "}
          <strong>{rupiah(siklusBerikut.totalCair)}</strong>
          {siklusBerikut.pilihanPendana === "putar_ulang"
            ? " dan diputar lagi 30 hari."
            : siklusBerikut.pilihanPendana === "cairkan"
              ? " ke rekening Anda."
              : ". Pilih cair ke rekening atau putar lagi di kartu siklus."}
        </>
      )}
    </p>
  );
}

/** Satu baris proyeksi nisbah syariah, dengan query dan batasnya sendiri. */
export function BarisNisbahSyariah() {
  const proyeksi = useQuery(api.syariahAkad.proyeksiPendanaSaya, {});
  if (proyeksi === null || proyeksi === undefined) return null;
  return (
    <BarisAngka
      label="Nisbah syariah (perkiraan)"
      nilai={rupiah(proyeksi.nisbahAktif)}
      detail={`bagian pendana dari margin atau ujrah atas ${rupiah(proyeksi.pokokAktif)} pokok akad berjalan`}
      tanda="perkiraan"
      catatanRisiko="Proyeksi akad berjalan; belum menjadi uang pendana sebelum akad selesai."
    />
  );
}
