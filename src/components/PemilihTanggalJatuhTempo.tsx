import { id as localeId } from "date-fns/locale";
import { CalendarDays, ChevronDown } from "lucide-react";
import { useState, type ComponentProps } from "react";
import type { DayButton } from "react-day-picker";

import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { persenBungaHarian, TENOR_OPTIONS, tenorHarianSah } from "@/lib/loan";
import { formatRupiah, formatRupiahRingkas, percentOf } from "@/lib/money";
import {
  akhirPekan,
  hariIniLokal,
  rentangTanggalTenor,
  tambahHari,
  tanggalJatuhTempo,
  tanggalSebelumAkhirPekan,
  tengahHariWIB,
  tenorDariTanggal,
} from "@/lib/tanggalTenor";
import { formatTanggalWIB } from "@/lib/waktu";
import { cn } from "@/lib/utils";

/**
 * Satu sel kalender: tanggal dan perkiraan total bayar untuk tenor itu.
 *
 * Angka kecil di bawah tanggal memakai mesin harga yang sama dengan server,
 * jadi nasabah bisa membandingkan beberapa tanggal tanpa menutup kalender dan
 * tanpa menghitung sendiri. Tanggal yang tidak sah untuk nominal ini tidak
 * menampilkan angka, sebab memang tidak bisa dipilih.
 *
 * Latar kuning menandai Sabtu dan Minggu. Warnanya sengaja ditempel di tombol,
 * bukan di sel tabel, supaya sudutnya ikut membulat dan tidak tertutup latar
 * tombol transparan.
 */
function HariTenor({
  pokok,
  sekarang,
  ...props
}: ComponentProps<typeof DayButton> & { pokok: number; sekarang: number }) {
  const tenor = tenorDariTanggal(props.day.date, pokok, sekarang);
  const persen = tenor === null ? null : persenBungaHarian(pokok, tenor);
  const total =
    tenor === null || persen === null ? null : pokok + percentOf(pokok, persen);
  const akhirPekan = props.modifiers.akhirPekan === true;
  const dipilih = props.modifiers.selected === true;

  return (
    <CalendarDayButton
      {...props}
      className={cn(
        props.className,
        "gap-0 p-0",
        akhirPekan && !dipilih && "bg-amber-100 text-amber-950 hover:bg-amber-200/80",
        akhirPekan && dipilih && "ring-2 ring-amber-400 ring-offset-1",
      )}
    >
      <div className="flex w-full flex-col items-center leading-none">
        <span className="text-xs font-semibold">{props.day.date.getDate()}</span>
        {total === null ? (
          // Ruang kosong yang sama tinggi, supaya angka tanggal tidak melompat
          // saat berpindah baris ke tanggal yang tidak sah.
          <span aria-hidden className="mt-0.5 text-[8px] leading-[10px]">
            &nbsp;
          </span>
        ) : (
          <span className="mt-0.5 text-[8px] font-medium tabular-nums opacity-80">
            {formatRupiahRingkas(total)}
          </span>
        )}
      </div>
    </CalendarDayButton>
  );
}

/**
 * Pemilih tanggal jatuh tempo untuk pinjaman harian.
 *
 * Menggantikan dropdown berisi 44 baris "N hari": nasabah memilih tanggal
 * bayar yang ia pahami, lalu aplikasi menerjemahkannya menjadi tenor. Batas
 * 7–50 hari dari hari ini dan tenor yang tidak sah untuk nominal tertentu tidak
 * bisa diklik, sehingga angka yang tampil selalu sama dengan yang diterima
 * server.
 *
 * Tanggal yang dipilih adalah tanggal KALENDER WIB. Bila voucher menambah hari,
 * tanggal itu tetap menjadi acuan tenor, dan tanggal akhir setelah voucher
 * ditampilkan terpisah supaya tidak ada dua angka yang tampak berbeda.
 */
export function PemilihTanggalJatuhTempo({
  pokok,
  tenor,
  onPilih,
  disabled = false,
  invalid = false,
  tambahanHari = 0,
  id = "loan-tenor-trigger",
}: {
  /** Id tombol pemicu, dipasangkan dengan `<Label htmlFor>`. */
  id?: string;
  /** Nominal pinjaman — menentukan tenor mana yang sah. */
  pokok: number;
  /** Tenor terpilih dalam hari (7–50). */
  tenor: number;
  onPilih: (hari: number) => void;
  disabled?: boolean;
  invalid?: boolean;
  /** Hari tambahan dari voucher tenor, hanya untuk keterangan tanggal akhir. */
  tambahanHari?: number;
}) {
  const [buka, setBuka] = useState(false);
  const sekarang = Date.now();
  const hariIni = hariIniLokal(sekarang);
  const { maks } = rentangTanggalTenor(sekarang);
  const dipilih = tanggalJatuhTempo(tenor, sekarang);
  const akhir = tambahanHari > 0 ? tambahHari(dipilih, tambahanHari) : null;
  // Bunga dihitung dari mesin harga yang sama dengan server, bukan perkiraan
  // terpisah: angka di popover harus sama dengan yang muncul di ringkasan.
  const bungaUntuk = (hari: number): number | null => {
    if (!Number.isInteger(pokok) || pokok <= 0) return null;
    const persen = persenBungaHarian(pokok, hari);
    return persen === null ? null : percentOf(pokok, persen);
  };
  const bungaSekarang = bungaUntuk(tenor);
  const bungaSehariLagi = bungaUntuk(tenor + 1);
  const tambahanSehari =
    bungaSekarang !== null && bungaSehariLagi !== null
      ? bungaSehariLagi - bungaSekarang
      : null;
  // Jatuh tempo di Sabtu/Minggu tetap sah, tetapi tim penagihan manual libur.
  // Tawarkan Jumat sebelumnya tanpa memaksa: tanggal tetap pilihan nasabah.
  const jatuhAkhirPekan = akhirPekan(dipilih);
  const jumat = tanggalSebelumAkhirPekan(dipilih);
  const tenorJumat = jatuhAkhirPekan
    ? tenorDariTanggal(jumat, pokok, sekarang)
    : null;
  const labelJumat =
    tenorJumat === null
      ? null
      : formatTanggalWIB(tengahHariWIB(jumat), {
          weekday: "short",
          day: "numeric",
          month: "short",
        });

  const label = formatTanggalWIB(tengahHariWIB(dipilih), {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const labelAkhir =
    akhir === null
      ? null
      : formatTanggalWIB(tengahHariWIB(akhir), {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        });

  return (
    <Popover open={buka} onOpenChange={setBuka}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-label={`Tanggal jatuh tempo ${label}, tenor ${tenor} hari`}
          aria-invalid={invalid || undefined}
          className={cn(
            "flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-2",
            disabled ? "cursor-not-allowed opacity-60" : "hover:border-slate-400",
            invalid ? "border-red-400" : "border-slate-300",
          )}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <CalendarDays className="size-4 shrink-0 text-slate-500" aria-hidden />
            <span className="min-w-0">
              <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                Jatuh tempo
              </span>
              <span className="block truncate text-sm font-semibold text-slate-900">
                {label}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-emerald-800 ring-1 ring-inset ring-emerald-200">
              {tenor} hari
            </span>
            <ChevronDown className="size-4 text-slate-400" aria-hidden />
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[min(21rem,calc(100vw-2rem))] p-0"
      >
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">
            Pilih tanggal jatuh tempo
          </p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            Tenor {TENOR_OPTIONS[0]}–50 hari dari hari ini. Tanggal di luar
            rentang itu tidak bisa dipilih. Angka kecil di bawah tanggal adalah
            perkiraan total bayar, dan latar kuning menandai akhir pekan.
          </p>
        </div>

        <Calendar
          mode="single"
          selected={dipilih}
          defaultMonth={dipilih}
          startMonth={hariIni}
          endMonth={maks}
          locale={localeId}
          modifiers={{
            akhirPekan: (date) => date.getDay() === 0 || date.getDay() === 6,
          }}
          components={{
            DayButton: (props) => (
              <HariTenor {...props} pokok={pokok} sekarang={sekarang} />
            ),
          }}
          disabled={(date) => tenorDariTanggal(date, pokok, sekarang) === null}
          onSelect={(date) => {
            if (date === undefined) return;
            const hasil = tenorDariTanggal(date, pokok, sekarang);
            if (hasil === null) return;
            onPilih(hasil);
            setBuka(false);
          }}
          className="w-full [--cell-size:--spacing(10)]"
        />

        {tenorJumat !== null && labelJumat !== null && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[11px] leading-5 text-amber-950">
              Jatuh tempo {label} bertepatan akhir pekan. Bisa tetap dipilih,
              atau majukan ke hari kerja terdekat.
            </p>
            <button
              type="button"
              onClick={() => {
                onPilih(tenorJumat);
                setBuka(false);
              }}
              className="mt-1.5 min-h-8 rounded-lg border border-amber-300 bg-white px-2.5 text-[11px] font-semibold text-amber-900 transition-colors hover:border-amber-500"
            >
              Pilih Jumat, {labelJumat} ({tenorJumat} hari)
            </button>
          </div>
        )}

        {bungaSekarang !== null && (
          <div className="border-t border-slate-200 px-4 py-3 text-[11px] leading-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-slate-500">Sisa waktu</span>
              <span className="font-semibold tabular-nums text-slate-900">
                {tenor} hari dari hari ini
              </span>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between gap-3">
              <span className="text-slate-500">Bunga tenor {tenor} hari</span>
              <span className="font-semibold tabular-nums text-slate-900">
                {formatRupiah(bungaSekarang)}
              </span>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between gap-3">
              <span className="text-slate-500">Total kembali</span>
              <span className="font-semibold tabular-nums text-slate-900">
                {formatRupiah(pokok + bungaSekarang)}
              </span>
            </div>
            {tambahanSehari !== null && tambahanSehari > 0 && (
              <p className="mt-1 text-slate-500">
                Mundur satu hari menambah bunga{" "}
                <strong className="font-semibold text-amber-800">
                  {formatRupiah(tambahanSehari)}
                </strong>
                .
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 border-t border-slate-200 px-4 py-3">
          {TENOR_OPTIONS.map((hari) => {
            const aktif = hari === tenor;
            const boleh = tenorHarianSah(pokok, hari);
            return (
              <button
                key={hari}
                type="button"
                disabled={!boleh}
                aria-pressed={aktif}
                onClick={() => {
                  onPilih(hari);
                  setBuka(false);
                }}
                className={cn(
                  "min-h-9 rounded-lg border px-2.5 text-xs font-semibold tabular-nums transition-colors",
                  aktif
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-emerald-700 hover:text-emerald-800",
                  !boleh && "cursor-not-allowed opacity-50",
                )}
              >
                {hari} hari
              </button>
            );
          })}
        </div>

        {labelAkhir !== null && (
          <p className="border-t border-emerald-100 bg-emerald-50/70 px-4 py-2.5 text-[11px] leading-5 text-emerald-900">
            Voucher menambah {tambahanHari} hari. Jatuh tempo akhir{" "}
            <strong className="font-semibold">{labelAkhir}</strong>, bunga tidak
            bertambah.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
