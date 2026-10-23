import { cn } from "@/lib/utils";

/**
 * Kotak label + angka untuk ringkasan review admin.
 * Label selalu 11px huruf besar; angkanya tebal dan besar supaya bisa
 * dibandingkan sekilas tanpa membaca kalimat penjelas.
 */
export function KotakRingkas({
  label,
  nilai,
  keterangan,
  kelas,
  kelasNilai,
}: {
  label: string;
  nilai: string;
  keterangan?: string;
  kelas?: string;
  kelasNilai?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white px-3 py-2.5", kelas)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 break-words text-lg font-bold leading-tight tabular-nums text-slate-900",
          kelasNilai,
        )}
      >
        {nilai}
      </p>
      {keterangan !== undefined && (
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{keterangan}</p>
      )}
    </div>
  );
}
