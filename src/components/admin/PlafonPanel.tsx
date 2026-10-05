import { useMutation, useQuery } from "convex/react";
import { Loader2, Search, SlidersHorizontal, Trash2 } from "lucide-react";
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
import { BUNGA_BATAS, BUNGA_LANGKAH, clampPersenBunga } from "@/lib/bunga";

/**
 * Panel Plafon Nasabah — naikkan/turunkan batas pinjaman satu orang dan atur
 * bunga khususnya.
 *
 * Panel ini mengatur pinjaman tunai. Setiap pinjaman pokok ≥Rp1 juta yang
 * lunas tepat waktu menaikkan plafon dasar Rp1 juta hingga maksimum Rp10 juta;
 * override admin tetap menang. Kredit barang punya batas tersendiri.
 *
 * Bunga per nasabah mengalahkan default Pengaturan Sistem dan disimpan sebagai
 * snapshot pada tiap pengajuan; pengajuan yang belum cair ikut diperbarui,
 * pinjaman yang sudah cair tidak berubah. Menghapus nasabah hanya menghapus
 * akunnya — pengajuan dan riwayat keuangannya tetap utuh.
 */
export function PlafonPanel() {
  const [cari, setCari] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [draftBunga, setDraftBunga] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyBungaId, setBusyBungaId] = useState<string | null>(null);
  const [busyHapusId, setBusyHapusId] = useState<string | null>(null);
  const data = useQuery(api.admin.daftarPlafonPeminjam, { cari: cari || undefined });
  const setPlafon = useMutation(api.admin.setPlafonPeminjam);
  const setBunga = useMutation(api.admin.setBungaPeminjam);
  const hapusNasabah = useMutation(api.admin.hapusNasabah);

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
      toast.success(`Plafon internal diperbarui: ${formatRupiah(hasil.plafonEfektif)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan plafon.");
    } finally {
      setBusyId(null);
    }
  };

  const simpanBunga = async (
    userId: Id<"users">,
    nilai: string,
    resetKeDefault: boolean,
  ) => {
    setBusyBungaId(userId);
    try {
      const hasil = await setBunga({
        userId,
        persenBunga: resetKeDefault ? null : clampPersenBunga(parsePersen(nilai)),
        alasan: undefined,
      });
      toast.success(
        `Bunga nasabah diperbarui: ${formatPersen(hasil.persenBunga)}` +
          (hasil.pengajuanDiperbarui > 0
            ? ` · ${hasil.pengajuanDiperbarui} pengajuan berjalan ikut disesuaikan`
            : ""),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan bunga.");
    } finally {
      setBusyBungaId(null);
    }
  };

  const hapus = async (userId: Id<"users">, nama: string) => {
    const alasan = window.prompt(
      `Hapus AKUN nasabah "${nama.toUpperCase()}"?\n\n` +
        "Pengajuan dan riwayat keuangannya TETAP disimpan; hanya akunnya yang dihapus.\n\n" +
        "Alasan penghapusan (10–500 karakter):",
    );
    if (alasan === null) return;
    const bersih = alasan.trim();
    if (bersih.length < 10 || bersih.length > 500) {
      toast.error("Alasan penghapusan wajib 10–500 karakter.");
      return;
    }
    if (!window.confirm(`Konfirmasi: hapus akun ${nama.toUpperCase()} sekarang?`)) return;
    setBusyHapusId(userId);
    try {
      await hapusNasabah({ userId, alasan: bersih });
      toast.success(`Akun ${nama.toUpperCase()} dihapus.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus akun.");
    } finally {
      setBusyHapusId(null);
    }
  };

  return (
    <div className="animate-masuk space-y-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="size-4 text-primary" /> Plafon & bunga nasabah
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Untuk pinjaman tunai, default plafon awal{" "}
          <strong className="tabular-nums">{formatRupiah(data.default)}</strong> dan bunga dasar{" "}
          <strong className="tabular-nums">{formatPersen(data.defaultBunga)}</strong> (Pengaturan
          Sistem). Setiap pinjaman tunai dengan pokok minimal Rp1 juta dan status lunas tepat waktu
          pada ledger internal dapat menambah plafon Rp1 juta, hingga maksimum Rp10 juta. Status
          lunas/tanggal mengikuti entri ledger internal PINDAI. Override admin tetap berlaku; reset
          kembali ke plafon progresif / bunga global. Bunga khusus disimpan per pengajuan: pengajuan
          yang belum cair ikut diperbarui, pinjaman yang sudah cair tetap memakai bunganya. Rentang
          plafon {formatRupiah(PLAFON_BATAS.min)}–{formatRupiah(PLAFON_BATAS.maks)}; rentang bunga{" "}
          {BUNGA_BATAS.min}–{BUNGA_BATAS.maks}%.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          aria-label="Cari nasabah berdasarkan nama atau email"
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
            const nilaiBunga = draftBunga[r.userId] ?? String(r.persenBungaEfektif);
            const bungaBerubah =
              parsePersen(nilaiBunga) !== r.persenBungaEfektif;
            return (
              <li key={r.userId} className="flex flex-wrap items-end justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.nama.toUpperCase()}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.email ?? "tanpa email"} · {r.jumlahPengajuan} pengajuan aplikasi ·{" "}
                    {r.pinjamanAktif} status aktif di ledger
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {r.plafonPribadi === null ? (
                      r.jumlahPelunasanTepatWaktu === 0 ? (
                        <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100">
                          plafon ikut default global
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          plafon progresif · {r.jumlahPelunasanTepatWaktu} lunas tepat waktu
                        </Badge>
                      )
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        plafon khusus: {formatRupiah(r.plafonPribadi)}
                      </Badge>
                    )}
                    {r.persenBungaPribadi === null ? (
                      <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100">
                        bunga ikut default global
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                        bunga khusus: {formatPersen(r.persenBungaPribadi)}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <Label htmlFor={`plafon-${r.userId}`} className="text-[11px] text-muted-foreground">
                      Plafon efektif
                    </Label>
                    <Input
                      id={`plafon-${r.userId}`}
                      inputMode="numeric"
                      className="w-32 tabular-nums"
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
                      {r.jumlahPelunasanTepatWaktu === 0
                        ? "Plafon ke default"
                        : "Plafon progresif"}
                    </Button>
                  )}
                  <div>
                    <Label htmlFor={`bunga-${r.userId}`} className="text-[11px] text-muted-foreground">
                      Bunga efektif
                    </Label>
                    <div className="flex items-center gap-1">
                      <Input
                        id={`bunga-${r.userId}`}
                        inputMode="decimal"
                        className="w-24 tabular-nums"
                        value={nilaiBunga}
                        onChange={(e) =>
                          setDraftBunga((p) => ({ ...p, [r.userId]: e.target.value.replace(/[^\d.]/g, "") }))
                        }
                        onBlur={() =>
                          setDraftBunga((p) => ({
                            ...p,
                            [r.userId]: String(clampPersenBunga(parsePersen(nilaiBunga))),
                          }))
                        }
                        disabled={busyBungaId === r.userId}
                      />
                      <span className="text-sm font-medium text-muted-foreground">%</span>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      langkah {formatPersen(BUNGA_LANGKAH)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={!bungaBerubah || busyBungaId === r.userId}
                    onClick={() => void simpanBunga(r.userId as Id<"users">, nilaiBunga, false)}
                  >
                    {busyBungaId === r.userId ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Simpan bunga"
                    )}
                  </Button>
                  {r.persenBungaPribadi !== null && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyBungaId === r.userId}
                      onClick={() => void simpanBunga(r.userId as Id<"users">, "", true)}
                    >
                      Bunga ke default
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={busyHapusId === r.userId}
                    onClick={() => void hapus(r.userId as Id<"users">, r.nama)}
                    title="Hapus akun nasabah (pengajuan tetap disimpan)"
                  >
                    {busyHapusId === r.userId ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                    <span className="ml-1">Hapus akun</span>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** "12,5" / "12.5" → 12.5; kosong / tidak valid → 0. */
function parsePersen(nilai: string): number {
  const bersih = nilai.replace(",", ".").replace(/[^\d.]/g, "");
  const angka = Number(bersih);
  return Number.isFinite(angka) ? angka : 0;
}

/** 30 → "30%", 12.5 → "12,5%". */
function formatPersen(nilai: number): string {
  return `${String(nilai).replace(".", ",")}%`;
}
