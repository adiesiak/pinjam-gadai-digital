import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import { tanggalWIB } from "@/lib/waktu";

/**
 * Catat pelunasan penuh dari ruang mana pun yang memegang baris pinjaman.
 *
 * Satu dialog dipakai Peninjauan Pengajuan dan Ruang Pendana supaya nominal
 * yang disimpan selalu dihitung server (`infoPelunasanManual`) dan selalu
 * menutup jurnal, angsuran, serta hak penyedia dana. Nomor mutasi bank
 * opsional: admin boleh mencatat pelunasan langsung tanpa nomor, yang wajib
 * hanya nominal yang sama persis dengan sisa tagihan.
 */
export function DialogCatatPelunasan({
  open,
  onClose,
  loanId,
  nama,
  nomorReferensi,
}: {
  open: boolean;
  onClose: () => void;
  loanId: Id<"loans"> | null;
  /** Nama peminjam untuk keterangan dialog (opsional). */
  nama?: string;
  /** Nomor referensi pinjaman untuk keterangan dialog (opsional). */
  nomorReferensi?: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-lg">
        {/* Isi dipasang hanya saat terbuka: isi dialog ikut dibongkar saat
            ditutup, sehingga ketikan admin tidak tersisa untuk kasus berikutnya. */}
        {open && loanId !== null && (
          <IsiCatatPelunasan
            loanId={loanId}
            nama={nama}
            nomorReferensi={nomorReferensi}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function IsiCatatPelunasan({
  loanId,
  nama,
  nomorReferensi,
  onClose,
}: {
  loanId: Id<"loans">;
  nama?: string;
  nomorReferensi?: string;
  onClose: () => void;
}) {
  const catatHarian = useMutation(api.perpanjanganPinjaman.catatPelunasanManual);
  const catatBulanan = useMutation(api.angsuran.catatPelunasanManualBulanan);

  const [referensi, setReferensi] = useState("");
  const [tanggal, setTanggal] = useState(() => tanggalWIB(Date.now()));
  // Batas tanggal dihitung sekali saat isi dipasang supaya `max` stabil.
  const [tanggalHariIni] = useState(() => tanggalWIB(Date.now()));
  // Waktu acuan juga dikunci: kalau memakai Date.now() langsung di render,
  // argumen query berubah terus dan dialog tidak pernah selesai menghitung.
  const [waktuAcuan] = useState(() => Date.now());
  const [catatan, setCatatan] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Input tanggal tidak membawa jam. Tengah hari WIB dipakai supaya tanggal
   * tidak bergeser ke hari sebelumnya, lalu dipotong ke waktu sekarang untuk
   * hari ini — tanpa itu, mencatat pelunasan pagi mengirim tanggal yang masih
   * di masa depan dan ditolak server.
   */
  const keWaktu = (nilai: string) => {
    const tengahHari = Date.parse(`${nilai}T12:00:00+07:00`);
    return Number.isFinite(tengahHari) ? Math.min(tengahHari, waktuAcuan) : tengahHari;
  };
  // Tanggal terima ikut dikirim, supaya denda dan total di dialog sama dengan
  // tanggal yang nanti dicatat server.
  const tanggalAcuan = keWaktu(tanggal);
  const info = useQuery(
    api.perpanjanganPinjaman.infoPelunasanManual,
    Number.isFinite(tanggalAcuan) ? { loanId, tanggal: tanggalAcuan } : { loanId },
  );

  const kirim = async () => {
    if (info === undefined || info === null) return;
    if (!info.bisa) {
      setError(info.alasan);
      return;
    }
    if (!Number.isFinite(tanggalAcuan)) {
      setError("Tanggal terima belum diisi dengan benar.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const args = {
        loanId,
        referensiMutasi: referensi.trim(),
        jumlahMutasi: info.totalDue,
        tanggal: tanggalAcuan,
        ...(catatan.trim() === "" ? {} : { catatan: catatan.trim() }),
      };
      if (info.jalur === "harian") {
        await catatHarian(args);
      } else {
        await catatBulanan(args);
      }
      toast.success(
        "Pelunasan tercatat. Angsuran, jurnal, dan hak penyedia dana ikut ditutup.",
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mencatat pelunasan.");
    } finally {
      setBusy(false);
    }
  };

  const keterangan =
    nomorReferensi !== undefined && nama !== undefined
      ? `Pelunasan ${nomorReferensi} untuk ${nama}. Nominal dihitung server dari sisa tagihan dan harus sama dengan uang yang diterima.`
      : "Nominal dihitung server dari sisa tagihan dan harus sama dengan uang yang diterima.";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Catat pelunasan</DialogTitle>
        <DialogDescription>
          {keterangan} Nomor mutasi bank bersifat opsional.
        </DialogDescription>
      </DialogHeader>

      {info === undefined ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Menghitung sisa tagihan...
        </p>
      ) : info === null ? (
        <p className="text-sm text-muted-foreground">Pinjaman tidak ditemukan.</p>
      ) : !info.bisa ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {info.alasan}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs uppercase tracking-wide text-slate-500">
                Total pelunasan
              </span>
              <span className="text-xl font-semibold text-slate-900">
                {formatRupiah(info.totalDue)}
              </span>
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Pokok</dt>
                <dd className="font-medium text-slate-800">
                  {formatRupiah(info.pokok)}
                </dd>
              </div>
              {info.bunga > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Bunga</dt>
                  <dd className="font-medium text-slate-800">
                    {formatRupiah(info.bunga)}
                  </dd>
                </div>
              )}
              {info.biayaAdmin > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Biaya admin cicilan</dt>
                  <dd className="font-medium text-slate-800">
                    {formatRupiah(info.biayaAdmin)}
                  </dd>
                </div>
              )}
              {info.denda > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-amber-700">Denda keterlambatan</dt>
                  <dd className="font-medium text-amber-800">
                    {formatRupiah(info.denda)}
                  </dd>
                </div>
              )}
            </dl>
            {info.jalur === "bulanan" && (
              <p className="mt-2 text-xs text-slate-500">
                Menutup {info.jumlahAngsuran} angsuran yang belum lunas.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="referensi-pelunasan">Nomor mutasi bank (opsional)</Label>
            <Input
              id="referensi-pelunasan"
              value={referensi}
              onChange={(event) => setReferensi(event.target.value)}
              placeholder="Kosongkan bila tidak ada nomor"
              autoComplete="off"
              maxLength={120}
            />
            <p className="text-xs text-slate-500">
              Boleh dikosongkan; pencatatan tetap masuk Audit Trail.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tanggal-pelunasan">Tanggal terima</Label>
            <Input
              id="tanggal-pelunasan"
              type="date"
              max={tanggalHariIni}
              value={tanggal}
              onChange={(event) => setTanggal(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="catatan-pelunasan">Catatan (opsional)</Label>
            <Input
              id="catatan-pelunasan"
              value={catatan}
              onChange={(event) => setCatatan(event.target.value)}
              maxLength={500}
              placeholder="Misalnya setoran tunai di kantor"
            />
          </div>

          {error !== null && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button variant="outline" disabled={busy} onClick={onClose}>
              Batal
            </Button>
            <Button
              disabled={busy}
              onClick={() => void kirim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Simpan pelunasan
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
