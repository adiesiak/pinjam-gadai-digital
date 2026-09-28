import { useMutation, useQuery } from "convex/react";
import { Loader2, Search, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import { clampPlafon, PLAFON_BATAS, PLAFON_LANGKAH } from "@/lib/plafon";

/**
 * Panel Plafon Nasabah — naikkan/turunkan batas pinjaman satu orang.
 *
 * Plafon per orang meng-override default global (Pengaturan Sistem), dan
 * ditegakkan server pada setiap pengajuan (loans.ts & kredit.ts). Setiap
 * perubahan masuk audit trail — ini keputusan kredit yang berdampak.
 */
export function PlafonPanel() {
  const [cari, setCari] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const data = useQuery(api.admin.daftarPlafonPeminjam, { cari: cari || undefined });
  const setPlafon = useMutation(api.admin.setPlafonPeminjam);

  if (data === undefined) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat plafon nasabah…
      </p>
    );
  }

  const simpan = async (userId: Id<"users">, nilai: string, resetKeDefault: boolean) => {
    setBusyId(userId);
    try {
      const hasil = await setPlafon({
        userId,
        plafon: resetKeDefault ? null : clampPlafon(Number(nilai.replace(/\D/g, "")) || 0),
        alasan: undefined,
      });
      toast.success(`Plafon diperbarui: ${formatRupiah(hasil.plafonEfektif)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan plafon.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="size-4 text-primary" /> Plafon Nasabah
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Plafon pribadi meng-override default global{" "}
          <strong className="tabular-nums">{formatRupiah(data.default)}</strong> (diubah di
          Pengaturan Sistem). Berlaku untuk pokok pinjaman tunai dan pokok dibiayai
          kredit barang; server menolak pengajuan di atasnya. Rentang{" "}
          {formatRupiah(PLAFON_BATAS.min)}–{formatRupiah(PLAFON_BATAS.maks)}.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Cari nama atau email…"
          value={cari}
          onChange={(e) => setCari(e.target.value)}
        />
      </div>

      {data.rows.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-muted-foreground">
          Belum ada Peminjam yang pernah mengajukan.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {data.rows.map((r) => {
            const nilai = draft[r.userId] ?? String(r.plafonEfektif);
            const berubah = Number(nilai.replace(/\D/g, "")) !== r.plafonEfektif;
            return (
              <li key={r.userId} className="flex flex-wrap items-end justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.nama}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.email ?? "tanpa email"} · {r.jumlahPengajuan} pengajuan ·{" "}
                    {r.pinjamanAktif} aktif
                  </p>
                  {r.plafonPribadi === null ? (
                    <Badge className="mt-1.5 bg-slate-100 text-slate-600 hover:bg-slate-100">
                      ikut default global
                    </Badge>
                  ) : (
                    <Badge className="mt-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      plafon khusus: {formatRupiah(r.plafonPribadi)}
                    </Badge>
                  )}
                </div>
                <div className="flex items-end gap-2">
                  <div>
                    <Label htmlFor={`plafon-${r.userId}`} className="text-[11px] text-muted-foreground">
                      Plafon efektif
                    </Label>
                    <Input
                      id={`plafon-${r.userId}`}
                      inputMode="numeric"
                      className="w-36 tabular-nums"
                      value={nilai}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, [r.userId]: e.target.value.replace(/\D/g, "") }))
                      }
                      onBlur={() => {
                        const angka = Number(nilai.replace(/\D/g, "")) || 0;
                        setDraft((p) => ({ ...p, [r.userId]: String(clampPlafon(angka)) }));
                      }}
                      disabled={busyId === r.userId}
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      kelipatan {formatRupiah(PLAFON_LANGKAH)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={!berubah || busyId === r.userId}
                    onClick={() => void simpan(r.userId as Id<"users">, nilai, false)}
                  >
                    {busyId === r.userId ? <Loader2 className="size-4 animate-spin" /> : "Simpan"}
                  </Button>
                  {r.plafonPribadi !== null && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === r.userId}
                      onClick={() => void simpan(r.userId as Id<"users">, "", true)}
                    >
                      Ke default
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
