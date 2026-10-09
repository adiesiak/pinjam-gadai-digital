import { useQuery } from "convex/react";
import { Loader2, Plus, Search, ShieldAlert, UserCheck, UserPlus } from "lucide-react";
import { useState } from "react";

import { useNilaiTertunda } from "@/hooks/use-validasi-tertunda";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { namaHurufBesar } from "@/lib/nama";
import { cn } from "@/lib/utils";
import { JENIS_MANUAL, type NasabahManual } from "@/lib/pengajuanManual";
import type { JenisPengajuan } from "@/lib/jenisPengajuan";

import { FormGadaiManual } from "./pengajuan-manual/FormGadaiManual";
import { FormKreditManual } from "./pengajuan-manual/FormKreditManual";
import { FormNasabahBaru } from "./pengajuan-manual/FormNasabahBaru";
import { FormPinjamanManual } from "./pengajuan-manual/FormPinjamanManual";

/**
 * Pencatatan pengajuan manual dari panel admin.
 *
 * Admin memilih nasabah lebih dulu, baru mengisi data pengajuan — supaya setiap
 * baris yang dibuat benar-benar milik satu akun, dan identitas pemohon (NIK,
 * WhatsApp, penghasilan) diambil dari data diri tersimpan, bukan diketik ulang.
 * Setelah tercatat, pengajuan masuk antrean produknya seperti pengajuan biasa;
 * keputusan tetap lewat dialog review yang sudah ada.
 *
 * Dua pintu masuk nasabah:
 *  - **Terdaftar** — pilih dari pencarian akun yang sudah ada.
 *  - **Belum punya akun** (`FormNasabahBaru`) — pemohon walk-in: admin mengisi
 *    identitas + mengunggah foto KTP, dan server membuat catatan pemohonnya
 *    tanpa memaksa orang itu mendaftar lebih dulu.
 */

/**
 * Pencarian & pemilihan nasabah tujuan pencatatan.
 *
 * Pencariannya TERTUNDA (debounce): yang diketik tetap tampil apa adanya, tapi
 * kueri ke server baru dijalankan setelah admin berhenti mengetik. Sebelumnya
 * SETIAP huruf menembakkan satu kueri yang memuat seluruh pengguna, profil,
 * pinjaman, dan kredit barang. Daftar hasil lama sengaja tidak dikosongkan saat
 * menunggu — menghapus hasil yang masih berguna setiap kali mengetik hanya
 * membuat layar berkedip — dan keadaan "mencari" diberitahukan lewat
 * `role="status"`, bukan dibiarkan tak terlihat.
 */
function PencariNasabah({ onPilih }: { onPilih: (nasabah: NasabahManual) => void }) {
  const [kueri, setKueri] = useState("");
  const kueriTertunda = useNilaiTertunda(kueri);
  const hasil = useQuery(api.adminPengajuan.cariNasabah, { kueri: kueriTertunda });
  const menunggu = kueri !== kueriTertunda || hasil === undefined;
  return (
    <div className="space-y-3" aria-busy={menunggu || undefined}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Cari nasabah tujuan pencatatan"
          value={kueri}
          onChange={(event) => setKueri(event.target.value)}
          placeholder="Cari nama, email, kode peminjam, atau NIK…"
          className="pl-9"
          autoComplete="off"
          autoFocus
        />
      </div>
      {menunggu && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Mencari nasabah…
        </p>
      )}
      {hasil === undefined ? (
        <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat daftar nasabah…
        </p>
      ) : hasil.hasil.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-muted-foreground">
          {menunggu
            ? "Tunggu sebentar sampai pencarian selesai."
            : "Tidak ada nasabah yang cocok. Kalau pemohonnya belum punya akun, pakai tab “Belum punya akun” di atas."}
        </p>
      ) : (
        <ul className="max-h-72 divide-y divide-slate-200 overflow-y-auto rounded-xl border border-slate-200 bg-white">
          {hasil.hasil.map((n) => (
            <li key={n.userId}>
              <button
                type="button"
                onClick={() => onPilih(n)}
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-navy">{namaHurufBesar(n.nama)}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {n.email ?? "tanpa email"} · {n.kodePeminjam ?? "tanpa kode peminjam"}
                  </span>
                </span>
                {n.dibuatAdmin ? (
                  <Badge className="border-0 bg-slate-100 text-slate-700 hover:bg-slate-100">
                    <UserPlus className="mr-1 size-3.5" /> Dicatat admin
                  </Badge>
                ) : n.adaDataDiri ? (
                  <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    <UserCheck className="mr-1 size-3.5" /> Data diri lengkap
                  </Badge>
                ) : (
                  <Badge className="border-0 bg-amber-100 text-amber-800 hover:bg-amber-100">
                    <ShieldAlert className="mr-1 size-3.5" /> Belum ada data diri
                  </Badge>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        NIK, nomor WhatsApp, penghasilan, dan rekening tujuan diambil dari Data Diri
        nasabah. Dokumen pengajuan (foto KTP, selfie, bukti penghasilan) ikut tersimpan
        pada pinjaman yang dicatat. Pengajuan kredit barang hanya bisa dicatat setelah
        data diri lengkap.
      </p>
    </div>
  );
}

/** Jalur pencatatan: nasabah terdaftar, atau pemohon yang belum punya akun. */
type JalurNasabah = "terdaftar" | "baru";

/** Pemilih jalur di atas daftar/pencarian nasabah. */
function PilihJalurNasabah({
  mode,
  onUbah,
}: {
  mode: JalurNasabah;
  onUbah: (mode: JalurNasabah) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Jalur pencatatan nasabah"
      className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
    >
      {(
        [
          ["terdaftar", "Nasabah terdaftar"],
          ["baru", "Belum punya akun"],
        ] as const
      ).map(([nilai, label]) => (
        <button
          key={nilai}
          type="button"
          role="tab"
          aria-selected={mode === nilai}
          onClick={() => onUbah(nilai)}
          className={cn(
            "rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
            mode === nilai
              ? "bg-white text-navy shadow-sm"
              : "text-muted-foreground hover:text-navy",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Tombol + dialog pencatatan manual satu produk. Dipasang di tab produk yang
 * bersangkutan agar admin menambah pengajuan dari tempat ia meninjaunya.
 */
export function CatatPengajuanManualButton({ jenis }: { jenis: JenisPengajuan }) {
  const [terbuka, setTerbuka] = useState(false);
  const [nasabah, setNasabah] = useState<NasabahManual | null>(null);
  const [mode, setMode] = useState<JalurNasabah>("terdaftar");
  const info = JENIS_MANUAL[jenis];

  const tutup = () => {
    setTerbuka(false);
    setNasabah(null);
    setMode("terdaftar");
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="rounded-full"
        onClick={() => setTerbuka(true)}
      >
        <Plus className="mr-1.5 size-4" /> {info.cta}
      </Button>
      <Dialog
        open={terbuka}
        onOpenChange={(nilai) => {
          if (!nilai) tutup();
          else setTerbuka(true);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto p-4 sm:max-w-2xl sm:p-6">
          <DialogHeader>
            <DialogTitle>{info.judul}</DialogTitle>
            <DialogDescription>{info.deskripsi}</DialogDescription>
          </DialogHeader>

          {nasabah === null && mode === "terdaftar" ? (
            <div className="space-y-3">
              <PilihJalurNasabah mode={mode} onUbah={setMode} />
              <PencariNasabah onPilih={setNasabah} />
            </div>
          ) : nasabah === null ? (
            <div className="space-y-3">
              <PilihJalurNasabah mode={mode} onUbah={setMode} />
              <FormNasabahBaru
                onSukses={(pemohon) => {
                  toast.success(
                    `Pemohon ${namaHurufBesar(pemohon.nama)} tercatat. Lanjutkan mengisi pengajuannya.`,
                  );
                  setNasabah(pemohon);
                }}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Nasabah tujuan
                  </p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-navy">{namaHurufBesar(nasabah.nama)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {nasabah.email ?? "tanpa email"} · {nasabah.kodePeminjam ?? "tanpa kode peminjam"}
                    {!nasabah.adaDataDiri && " · data diri belum ada"}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setNasabah(null)}>
                  Ganti nasabah
                </Button>
              </div>

              {jenis === "pinjaman" && (
                <FormPinjamanManual
                  nasabah={nasabah}
                  onSukses={(referensi) => {
                    toast.success(`Pengajuan pinjaman ${referensi} tercatat untuk ${namaHurufBesar(nasabah.nama)}.`);
                    tutup();
                  }}
                />
              )}
              {jenis === "gadai" && (
                <FormGadaiManual
                  nasabah={nasabah}
                  onSukses={(referensi) => {
                    toast.success(`Pengajuan gadai ${referensi} tercatat untuk ${namaHurufBesar(nasabah.nama)}.`);
                    tutup();
                  }}
                />
              )}
              {jenis === "kredit" && (
                <FormKreditManual
                  nasabah={nasabah}
                  onSukses={(referensi) => {
                    toast.success(`Pengajuan kredit ${referensi} tercatat untuk ${namaHurufBesar(nasabah.nama)}.`);
                    tutup();
                  }}
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
