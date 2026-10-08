import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, CheckCircle2, Landmark, Loader2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { formatRupiah } from "@/lib/money";
import { namaHurufBesar } from "@/lib/nama";

/** Lencana status integrasi per pinjaman. */
function BadgeIntegrasi({ terintegrasi, layak }: { terintegrasi: boolean; layak: boolean }) {
  const kelas = terintegrasi
    ? "bg-emerald-100 text-emerald-700"
    : layak
      ? "bg-amber-100 text-amber-700"
      : "bg-slate-100 text-slate-600";
  const teks = terintegrasi ? "Terintegrasi" : layak ? "Perlu integrasi" : "Belum layak";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${kelas}`}>
      {teks}
    </span>
  );
}

/**
 * Panel admin: integrasikan pinjaman lama ke ledger internal (biaya admin &
 * platform 2%) dan hapus pinjaman lama per baris. Ledger tetap append-only —
 * penghapusan hanya membersihkan baris pinjaman beserta turunannya.
 */
export function IntegrasiLedgerPanel() {
  const status = useQuery(api.integrasiLedger.statusIntegrasiLedger);
  const integrasikan = useMutation(api.integrasiLedger.integrasikanPinjamanKeLedger);
  const hapus = useMutation(api.integrasiLedger.hapusPinjamanLama);

  const [dipilih, setDipilih] = useState<Record<string, boolean>>({});
  const [alasan, setAlasan] = useState("");
  const [sibukIntegrasi, setSibukIntegrasi] = useState(false);
  const [sibukHapus, setSibukHapus] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const rows = status?.rows ?? [];
  const idTerpilih = useMemo(
    () => rows.filter((r) => dipilih[r._id] && r.bolehDihapus).map((r) => r._id),
    [rows, dipilih],
  );
  const bisaDihapus = useMemo(() => rows.filter((r) => r.bolehDihapus).length, [rows]);

  async function jalankanIntegrasi() {
    setPesan(null);
    setGalat(null);
    setSibukIntegrasi(true);
    try {
      const hasil = await integrasikan({});
      const bagian = [
        `${hasil.jumlah} pinjaman dibukukan (total biaya ${formatRupiah(hasil.totalBiaya)})`,
      ];
      if (hasil.sisa > 0) bagian.push(`sisa ${hasil.sisa} untuk pemanggilan berikutnya`);
      if (hasil.gagal.length > 0) bagian.push(`${hasil.gagal.length} gagal`);
      setPesan(`${bagian.join(" · ")}.`);
      if (hasil.gagal.length > 0) {
        setGalat(hasil.gagal.map((g) => `${g.nomorReferensi}: ${g.pesan}`).join(" | "));
      }
    } catch (cause) {
      setGalat(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSibukIntegrasi(false);
    }
  }

  async function jalankanHapus() {
    setPesan(null);
    setGalat(null);
    if (idTerpilih.length === 0) {
      setGalat("Pilih minimal satu pinjaman yang bisa dihapus.");
      return;
    }
    if (alasan.trim().length < 10) {
      setGalat("Alasan wajib minimal 10 karakter.");
      return;
    }
    const konfirmasi = window.confirm(
      `Hapus ${idTerpilih.length} pinjaman lama? Jurnal ledger tetap dipertahankan.`,
    );
    if (!konfirmasi) return;
    setSibukHapus(true);
    try {
      const hasil = await hapus({ loanIds: idTerpilih, alasan: alasan.trim() });
      const bagian = [`${hasil.dihapus} pinjaman dihapus`];
      if (hasil.terlewat.length > 0) bagian.push(`${hasil.terlewat.length} dilewati`);
      setPesan(`${bagian.join(" · ")}.`);
      if (hasil.terlewat.length > 0) {
        setGalat(hasil.terlewat.map((t) => `${t.nomorReferensi}: ${t.pesan}`).join(" | "));
      }
      setDipilih({});
      setAlasan("");
    } catch (cause) {
      setGalat(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSibukHapus(false);
    }
  }

  if (status === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat status integrasi pinjaman…
      </div>
    );
  }

  return (
    <div className="animate-masuk rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Landmark className="size-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-navy">Integrasi pinjaman ke ledger</h3>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              Pinjaman lama yang belum terbukukan ditulis sebagai biaya admin &amp; platform{" "}
              {status.persenBiaya}% (bentuk jurnal sama dengan pencairan alokasi dana). Idempoten —
              aman dijalankan berulang.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 text-[11px]">
          <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-700">
            Perlu integrasi: {status.perluIntegrasi}
          </span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700">
            Terintegrasi: {status.terintegrasiCount}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
            Belum layak: {status.belumLayak}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          className="rounded-full"
          disabled={sibukIntegrasi || status.perluIntegrasi === 0}
          onClick={jalankanIntegrasi}
        >
          {sibukIntegrasi ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> Membukukan…
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 size-4" />
              Integrasikan {status.perluIntegrasi} pinjaman
            </>
          )}
        </Button>
        {status.perluIntegrasi === 0 && (
          <span className="text-xs text-muted-foreground">
            Semua pinjaman layak sudah tercatat di ledger.
          </span>
        )}
      </div>

      {pesan && (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
          {pesan}
        </p>
      )}
      {galat && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{galat}</span>
        </p>
      )}

      <div className="mt-5 rounded-xl border border-slate-200">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
          <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <input
              type="checkbox"
              aria-label="Pilih semua pinjaman yang bisa dihapus"
              className="size-3.5 accent-primary"
              checked={idTerpilih.length > 0 && idTerpilih.length === bisaDihapus}
              disabled={bisaDihapus === 0}
              onChange={(e) =>
                setDipilih(
                  e.target.checked
                    ? Object.fromEntries(rows.filter((r) => r.bolehDihapus).map((r) => [r._id, true]))
                    : {},
                )
              }
            />
            Pilih semua yang bisa dihapus
          </label>
          <span className="shrink-0 text-[11px] text-muted-foreground">{rows.length} pinjaman</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li
              key={r._id}
              className={`flex items-start gap-3 px-3 py-3 ${r.bolehDihapus ? "" : "opacity-60"}`}
            >
              <input
                type="checkbox"
                aria-label={`Pilih pinjaman ${r.nomorReferensi}`}
                className="mt-0.5 size-3.5 shrink-0 accent-primary"
                checked={Boolean(dipilih[r._id])}
                disabled={!r.bolehDihapus}
                onChange={(e) => setDipilih((m) => ({ ...m, [r._id]: e.target.checked }))}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs font-semibold text-navy">{r.nomorReferensi}</span>
                  <BadgeIntegrasi terintegrasi={r.terintegrasi} layak={r.layak} />
                  {!r.bolehDihapus && (
                    <span className="text-[10px] text-muted-foreground">
                      {r.status === "didanai" ? "sedang berjalan" : `${r.alokasiAktif} alokasi aktif`}
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {namaHurufBesar(r.namaLengkap)} · {r.status}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                  <span className="text-muted-foreground">
                    Pokok <span className="font-medium tabular-nums text-slate-900">{formatRupiah(r.pokokPinjaman)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Biaya {status.persenBiaya}% <span className="font-medium tabular-nums text-slate-900">{formatRupiah(r.biayaIntegrasi)}</span>
                  </span>
                </div>
              </div>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              Belum ada pinjaman.
            </li>
          )}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-red-100 bg-red-50/50 p-4">
        <p className="text-xs font-semibold text-red-800">Hapus pinjaman lama (per baris)</p>
        <p className="mt-1 text-[11px] leading-4 text-red-700">
          Hanya pinjaman yang tidak berjalan dan tanpa alokasi dana aktif yang bisa dipilih.
          Jurnal ledger tidak dihapus; baris turunan pinjaman ikut dibersihkan.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1 space-y-1">
            <Label htmlFor="alasan-hapus-pinjaman" className="text-[11px]">
              Alasan (10–500 karakter)
            </Label>
            <Input
              id="alasan-hapus-pinjaman"
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder="mis. pembersihan data pinjaman seed lama"
              maxLength={500}
            />
          </div>
          <Button
            variant="destructive"
            className="rounded-full"
            disabled={sibukHapus || idTerpilih.length === 0}
            onClick={jalankanHapus}
          >
            {sibukHapus ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Menghapus…
              </>
            ) : (
              <>
                <Trash2 className="mr-2 size-4" /> Hapus {idTerpilih.length} terpilih
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
