import { useMutation, useQuery } from "convex/react";
import { CalendarClock, Loader2, Send } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import {
  BATAS_RESTRUKTURISASI,
  LABEL_JENIS_RESTRUKTURISASI,
  LABEL_STATUS_RESTRUKTURISASI,
  TAMBAHAN_HARI_PILIHAN,
  saranUsulanCicilan,
  validasiUsulanCicilan,
  type JenisRestrukturisasi,
  type StatusRestrukturisasi,
} from "@/lib/restrukturisasi";
import { formatTanggalWIB } from "@/lib/waktu";

type JenisPermohonan = "perpanjangan_tenor" | "cicilan";

type MenungguPermohonan = {
  _id: Id<"restrukturisasiPinjaman">;
  jenis: string;
  tambahanHari: number;
  tenorBaruHari: number;
  usulanCicilan: number | null;
  alasan: string;
  dibuatPada: number;
};

type RiwayatPermohonan = {
  _id: Id<"restrukturisasiPinjaman">;
  jenis: string;
  status: string;
  tenorLamaHari: number;
  tenorBaruHari: number;
  tambahanHari: number;
  usulanCicilan: number | null;
  alasan: string;
  dibuatPada: number;
  diputuskanPada: number | null;
  catatanKeputusan: string | null;
};

export type RingkasanPermohonanNasabah = {
  statusPinjaman: string;
  tenorHari: number;
  tenorBulan: number | null;
  totalKewajiban: number;
  bolehPerpanjangan: boolean;
  alasanPerpanjangan: string | null;
  bolehCicilan: boolean;
  alasanCicilan: string | null;
  menunggu: MenungguPermohonan | null;
  riwayat: RiwayatPermohonan[];
};

/**
 * Bagian tampilan permohonan restrukturisasi nasabah.
 *
 * Dipisah dari pembungkus Convex supaya tiap keadaan (memilih jenis, menunggu
 * keputusan, usulan tidak valid, tanpa opsi) bisa dirender dan diperiksa tanpa
 * server. Semua angka pembatas tetap berasal dari validasi bersama di
 * `lib/restrukturisasi`.
 */
export function BagianPermohonanNasabah({
  hasil,
  jenisAktif,
  tambahan,
  nilaiUsulan,
  alasan,
  sibuk,
  kabar,
  galat,
  onPilihJenis,
  onUbahTambahan,
  onUbahUsulan,
  onUbahAlasan,
  onKirim,
}: {
  hasil: RingkasanPermohonanNasabah;
  jenisAktif: JenisPermohonan | null;
  tambahan: number;
  nilaiUsulan: number;
  alasan: string;
  sibuk: boolean;
  kabar: string | null;
  galat: string | null;
  onPilihJenis: (jenis: JenisPermohonan) => void;
  onUbahTambahan: (nilai: number) => void;
  onUbahUsulan: (nilai: number) => void;
  onUbahAlasan: (nilai: string) => void;
  onKirim: () => void;
}) {
  const cekCicilan = validasiUsulanCicilan({
    usulanCicilan: nilaiUsulan,
    totalKewajiban: hasil.totalKewajiban,
  });
  const alasanSah = alasan.trim().length >= BATAS_RESTRUKTURISASI.minAlasan;
  const bisaKirim =
    !sibuk &&
    alasanSah &&
    jenisAktif !== null &&
    (jenisAktif === "perpanjangan_tenor" || cekCicilan.ok);

  if (hasil.menunggu !== null) {
    const m = hasil.menunggu;
    return (
      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-950">
          <CalendarClock className="size-4" aria-hidden="true" />
          Permohonan sedang diperiksa
        </p>
        <p className="mt-1.5 text-xs leading-5 text-amber-950">
          {m.jenis === "cicilan"
            ? `Usulan cicilan ${formatRupiah(m.usulanCicilan ?? 0)} per pembayaran.`
            : `Perpanjangan menjadi ${m.tenorBaruHari} hari (+${m.tambahanHari}).`}{" "}
          Dikirim {formatTanggalWIB(m.dibuatPada)}. Alasan: {m.alasan}
        </p>
        <p className="mt-2 text-xs leading-5 text-amber-900">
          Hasilnya muncul di bagian ini setelah tim PINDAI memutuskan. Sampai saat itu,
          tenor dan jadwal pinjaman belum berubah.
        </p>
      </div>
    );
  }

  if (jenisAktif === null) {
    return (
      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-900">Restrukturisasi pinjaman</p>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          {hasil.alasanPerpanjangan ?? hasil.alasanCicilan}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <CalendarClock className="size-4 text-primary" aria-hidden="true" />
        Ajukan restrukturisasi
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        Pilih satu jalur. Permohonan diperiksa tim PINDAI; tidak ada perubahan tenor
        atau jadwal sebelum disetujui.
      </p>

      <fieldset className="mt-3" disabled={sibuk}>
        <legend className="text-xs font-medium text-slate-700">Jenis permohonan</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {hasil.bolehPerpanjangan && (
            <label
              className={`flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-5 transition-colors ${
                jenisAktif === "perpanjangan_tenor"
                  ? "border-primary bg-primary/5 text-slate-900"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="jenis-restrukturisasi"
                value="perpanjangan_tenor"
                checked={jenisAktif === "perpanjangan_tenor"}
                onChange={() => onPilihJenis("perpanjangan_tenor")}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <span className="block font-semibold text-slate-900">Perpanjangan tenor</span>
                Jatuh tempo bergeser. Pokok, bunga, dan total kewajiban tetap.
              </span>
            </label>
          )}
          {hasil.bolehCicilan && (
            <label
              className={`flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-5 transition-colors ${
                jenisAktif === "cicilan"
                  ? "border-primary bg-primary/5 text-slate-900"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="jenis-restrukturisasi"
                value="cicilan"
                checked={jenisAktif === "cicilan"}
                onChange={() => onPilihJenis("cicilan")}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <span className="block font-semibold text-slate-900">Cicilan bertahap</span>
                Usulkan nominal per pembayaran. Jadwal disepakati dengan tim.
              </span>
            </label>
          )}
        </div>
      </fieldset>

      {jenisAktif === "perpanjangan_tenor" && (
        <label className="mt-3 block text-xs font-medium text-slate-700">
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
          <span className="mt-1 block text-[11px] font-normal leading-4 text-slate-500">
            Tenor menjadi {hasil.tenorHari + tambahan} hari. Total kewajiban tidak berubah.
          </span>
        </label>
      )}

      {jenisAktif === "cicilan" && (
        <label className="mt-3 block text-xs font-medium text-slate-700">
          Usulan per pembayaran
          <input
            type="number"
            inputMode="numeric"
            min={BATAS_RESTRUKTURISASI.minUsulanCicilan}
            max={hasil.totalKewajiban}
            step={10_000}
            value={nilaiUsulan}
            onChange={(e) => onUbahUsulan(Number(e.target.value))}
            className="mt-1 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm tabular-nums focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50 sm:h-9"
            disabled={sibuk}
          />
          <span className="mt-1 block text-[11px] font-normal leading-4 text-slate-500">
            Total kewajiban {formatRupiah(hasil.totalKewajiban)}. Usulan ini setara
            sekitar {cekCicilan.ok ? cekCicilan.perkiraanJumlahCicilan : "—"} kali
            pembayaran. Bukan janji jadwal; nominal akhir disepakati dengan tim.
          </span>
          {!cekCicilan.ok && (
            <span className="mt-1 block text-[11px] font-normal leading-4 text-red-600">
              {cekCicilan.alasan}
            </span>
          )}
        </label>
      )}

      <label className="mt-3 block text-xs font-medium text-slate-700">
        Alasan
        <Textarea
          value={alasan}
          onChange={(e) => onUbahAlasan(e.target.value)}
          placeholder="Misalnya: penghasilan turun bulan ini karena usaha sepi."
          className="mt-1 min-h-20 text-sm"
          maxLength={BATAS_RESTRUKTURISASI.maxAlasan}
          disabled={sibuk}
        />
        <span className="mt-1 flex items-center justify-between gap-2 text-[11px] font-normal leading-4 text-slate-500">
          <span>Minimal {BATAS_RESTRUKTURISASI.minAlasan} karakter.</span>
          <span className="tabular-nums">
            {alasan.trim().length}/{BATAS_RESTRUKTURISASI.maxAlasan}
          </span>
        </span>
      </label>

      <Button
        type="button"
        className="mt-3 h-11 w-full sm:w-auto"
        disabled={!bisaKirim}
        onClick={onKirim}
      >
        {sibuk ? (
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="mr-2 size-4" aria-hidden="true" />
        )}
        Kirim permohonan
      </Button>

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
          {hasil.riwayat.slice(0, 3).map((r) => (
            <li key={r._id} className="text-[11px] leading-4 text-slate-600">
              <strong>
                {LABEL_STATUS_RESTRUKTURISASI[r.status as StatusRestrukturisasi] ?? r.status}
              </strong>{" "}
              · {LABEL_JENIS_RESTRUKTURISASI[r.jenis as JenisRestrukturisasi] ?? r.jenis}
              {r.jenis === "cicilan"
                ? ` ${formatRupiah(r.usulanCicilan ?? 0)} per pembayaran`
                : ` ${r.tenorLamaHari} → ${r.tenorBaruHari} hari`}{" "}
              · {formatTanggalWIB(r.diputuskanPada ?? r.dibuatPada)}
              {r.catatanKeputusan !== null ? ` · ${r.catatanKeputusan}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Permohonan restrukturisasi milik nasabah, dipasang di rincian pinjaman aktif.
 *
 * Nasabah hanya mengirim permohonan; keputusan tetap di tangan admin. Karena
 * pembayaran dicatat di luar aplikasi, usulan cicilan tidak mengubah jadwal
 * secara otomatis — persetujuannya adalah kesepakatan yang dicatat.
 */
export function PermohonanRestrukturisasi({ loanId }: { loanId: Id<"loans"> }) {
  const hasil = useQuery(api.restrukturisasi.ringkasanPermohonanNasabah, { loanId });
  const ajukan = useMutation(api.restrukturisasi.ajukanPermohonanNasabah);

  const [jenis, setJenis] = useState<JenisPermohonan | null>(null);
  const [tambahan, setTambahan] = useState<number>(TAMBAHAN_HARI_PILIHAN[1]);
  const [usulan, setUsulan] = useState<number | null>(null);
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [kabar, setKabar] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  if (hasil === undefined) {
    return (
      <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Memuat opsi
        perpanjangan…
      </p>
    );
  }

  const jenisAktif: JenisPermohonan | null =
    jenis ?? (hasil.bolehPerpanjangan ? "perpanjangan_tenor" : hasil.bolehCicilan ? "cicilan" : null);
  const nilaiUsulan = usulan ?? saranUsulanCicilan(hasil.totalKewajiban);

  const kirim = async () => {
    if (jenisAktif === null) return;
    setSibuk(true);
    setKabar(null);
    setGalat(null);
    try {
      const r = await ajukan({
        loanId,
        jenis: jenisAktif,
        ...(jenisAktif === "perpanjangan_tenor" ? { tambahanHari: tambahan } : {}),
        ...(jenisAktif === "cicilan" ? { usulanCicilan: nilaiUsulan } : {}),
        alasan,
      });
      setAlasan("");
      setKabar(
        r.jenis === "cicilan"
          ? `Usulan cicilan ${formatRupiah(nilaiUsulan)} per pembayaran terkirim. Tim PINDAI akan memeriksanya.`
          : `Permohonan perpanjangan ke ${r.tenorBaruHari ?? 0} hari terkirim. Tim PINDAI akan memeriksanya.`,
      );
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Permohonan gagal dikirim.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <BagianPermohonanNasabah
      hasil={hasil}
      jenisAktif={jenisAktif}
      tambahan={tambahan}
      nilaiUsulan={nilaiUsulan}
      alasan={alasan}
      sibuk={sibuk}
      kabar={kabar}
      galat={galat}
      onPilihJenis={setJenis}
      onUbahTambahan={setTambahan}
      onUbahUsulan={setUsulan}
      onUbahAlasan={setAlasan}
      onKirim={() => void kirim()}
    />
  );
}
