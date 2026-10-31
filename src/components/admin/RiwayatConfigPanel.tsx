/**
 * Riwayat versi konfigurasi sistem + tombol rollback (panel admin).
 *
 * Kenapa panel terpisah: formulir konfigurasi menjawab "nilai berapa yang
 * dipakai sekarang", sedangkan panel ini menjawab "siapa mengubah apa, dari
 * nilai berapa ke berapa, sejak kapan" — dan menyediakan satu tindakan yang
 * tidak boleh tersembunyi di dalam formulir: mengembalikan nilai versi lama.
 *
 * Rollback di sini TIDAK menghapus riwayat: ia membuat versi baru yang menyalin
 * nilai lama, dan server mencatatnya sebagai aksi `rollback_config`.
 */
import { useMutation, useQuery } from "convex/react";
import { History, Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import {
  labelConfig,
  nilaiConfigTampil,
  type PerubahanConfig,
} from "@/lib/bandingkanConfig";

import { EmptyQueue, PanelMemuat } from "./admin-shared";

type BarisRiwayat = {
  versi: number;
  jenis: "simpan" | "rollback";
  dariVersi: number | null;
  berlakuSejak: number;
  diubahOleh: string;
  catatan: string | null;
  dibuatPada: number;
  perubahan: PerubahanConfig[];
};

function waktu(ms: number): string {
  return new Date(ms).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Daftar nilai yang berubah pada satu versi — komponen MURNI supaya bisa diuji
 * tanpa server (lihat `RiwayatConfigPanel.render.test.tsx`).
 */
export function DaftarPerubahan({ perubahan }: { perubahan: PerubahanConfig[] }) {
  if (perubahan.length === 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Tidak ada nilai yang berubah pada versi ini.
      </p>
    );
  }
  return (
    <ul className="mt-2 space-y-1">
      {perubahan.map((p) => (
        <li key={p.kunci} className="text-xs text-slate-700">
          <b>{labelConfig(p.kunci)}</b>: {nilaiConfigTampil(p.lama)} →{" "}
          {nilaiConfigTampil(p.baru)}
        </li>
      ))}
    </ul>
  );
}

export function RiwayatConfigPanel() {
  const data = useQuery(api.system.riwayatConfig, { batas: 20 }) as
    | BarisRiwayat[]
    | undefined;
  const rollback = useMutation(api.system.rollbackConfig);
  const [target, setTarget] = useState<number | null>(null);
  const [alasan, setAlasan] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (data === undefined) return <PanelMemuat />;

  const versiBerlaku = data[0]?.versi ?? null;

  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-navy">
        <History className="size-4 text-primary" /> Riwayat versi konfigurasi
      </p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Setiap penyimpanan membuat versi baru. Rollback menyalin nilai versi lama
        menjadi versi <b>baru</b>; riwayat lama tidak pernah dihapus, dan
        pengajuan yang sudah tercatat tetap memakai angka saat diajukan.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {data.length === 0 ? (
        <div className="mt-3">
          <EmptyQueue
            icon={History}
            title="Belum ada riwayat perubahan"
            deskripsi="Versi baru muncul di sini setelah konfigurasi disimpan pertama kali."
          />
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {data.map((baris) => {
            const berlaku = baris.versi === versiBerlaku;
            const dipilih = target === baris.versi;
            return (
              <li
                key={baris.versi}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-navy">
                      Versi {baris.versi}
                      {berlaku ? " · berlaku sekarang" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {baris.jenis === "rollback" ? "Rollback" : "Penyimpanan"}
                      {baris.dariVersi === null
                        ? ""
                        : ` dari versi ${baris.dariVersi}`}{" "}
                      · {waktu(baris.berlakuSejak)} · oleh {baris.diubahOleh}
                    </p>
                  </div>
                  {!berlaku && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTarget(dipilih ? null : baris.versi);
                        setAlasan("");
                        setError(null);
                      }}
                    >
                      <RotateCcw className="mr-2 size-4" />
                      {dipilih ? "Batal" : "Kembalikan ke versi ini"}
                    </Button>
                  )}
                </div>

                <DaftarPerubahan perubahan={baris.perubahan} />

                {baris.catatan && (
                  <p className="mt-2 text-xs italic text-muted-foreground">
                    Catatan: {baris.catatan}
                  </p>
                )}

                {dipilih && (
                  <div className="mt-3 space-y-2 rounded-xl border border-primary/30 bg-white p-3">
                    <Label htmlFor={`alasan-rollback-${baris.versi}`}>
                      Alasan pengembalian (opsional, tampil di riwayat)
                    </Label>
                    <Input
                      id={`alasan-rollback-${baris.versi}`}
                      value={alasan}
                      onChange={(e) => setAlasan(e.target.value)}
                      placeholder="mis. tarif baru menyebabkan keluhan nasabah"
                    />
                    <p className="text-xs text-muted-foreground">
                      Nilai dari versi {baris.versi} akan disalin menjadi versi
                      baru. Perubahan ini tercatat di audit trail.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError(null);
                          try {
                            const hasil = await rollback({
                              versi: baris.versi,
                              ...(alasan.trim() === "" ? {} : { catatan: alasan.trim() }),
                            });
                            toast.success(
                              `Konfigurasi dikembalikan ke nilai versi ${baris.versi} sebagai versi ${hasil.versi}.`,
                            );
                            setTarget(null);
                            setAlasan("");
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : "Gagal mengembalikan konfigurasi.",
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                        Terapkan rollback
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          setTarget(null);
                          setAlasan("");
                        }}
                      >
                        Batal
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
