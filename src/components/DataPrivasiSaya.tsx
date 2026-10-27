/**
 * Data & privasi — hak pemilik akun atas datanya sendiri.
 *
 * Dua tindakan, dua sifat berbeda:
 *  - **Salinan data** hanya membaca baris milik pemanggil dan mengunduhnya
 *    sebagai JSON. Aman diulang kapan saja.
 *  - **Hapus akun** benar-benar menghapus akun, kredensial, data KYC, dan
 *    berkasnya. Karena itu frasa konfirmasi harus DIKETIK, bukan ditekan, dan
 *    tombolnya tetap terkunci sampai frasa itu tepat.
 *
 * Teks di sini menjelaskan akibatnya lebih dulu; keputusan tetap milik server
 * (`convex/dataSaya.ts`) yang memeriksa ulang setiap syarat.
 */
import { useConvex, useMutation } from "convex/react";
import { AlertTriangle, Download, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import {
  KONFIRMASI_HAPUS_AKUN,
  konfirmasiCocok,
  namaBerkasSalinanData,
} from "@/lib/hakData";
import { tanggalWIB } from "@/lib/waktu";

/** Blok unduhan salinan — murni, supaya bisa diuji tanpa Convex. */
export function BlokSalinanData({
  sibuk,
  galat,
  onUnduh,
}: {
  sibuk: boolean;
  galat: string | null;
  onUnduh: () => void;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-navy">Salinan data saya</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Berkas JSON berisi data diri, status KYC (tanpa gambar tanda tangan), pengajuan
        pinjaman/gadai/kredit barang, jadwal angsuran, catatan lokasi terakhir, dan perangkat
        terdaftar. Tautan berkas identitas di dalamnya hanya berlaku sepuluh menit.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={onUnduh} disabled={sibuk} aria-busy={sibuk}>
          {sibuk ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
          {sibuk ? "Menyusun salinan…" : "Unduh salinan data (JSON)"}
        </Button>
        <Link
          to="/privasi"
          className="text-xs font-medium text-emerald-800 underline-offset-4 hover:underline"
        >
          Baca kebijakan privasi
        </Link>
      </div>
      {galat === null ? null : (
        <p role="alert" className="mt-2 text-xs font-medium text-rose-700">
          {galat}
        </p>
      )}
    </div>
  );
}

/** Blok penghapusan akun — murni, supaya bisa diuji tanpa Convex. */
export function BlokHapusAkun({
  frasa,
  onFrasa,
  alasan,
  onAlasan,
  sibuk,
  galat,
  onHapus,
}: {
  frasa: string;
  onFrasa: (nilai: string) => void;
  alasan: string;
  onAlasan: (nilai: string) => void;
  sibuk: boolean;
  galat: string | null;
  onHapus: () => void;
}) {
  const cocok = konfirmasiCocok(frasa);
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-rose-900">
        <AlertTriangle className="size-4 shrink-0" aria-hidden /> Hapus akun
      </p>
      <p className="mt-1 text-xs leading-5 text-rose-900">
        Akun, data diri, data KYC, dan foto identitas Anda dihapus. Riwayat keuangan tetap
        tersimpan sebagai catatan usaha tanpa akun Anda, dan penghapusannya tercatat di audit
        internal. Tindakan ini tidak bisa dibatalkan dari halaman ini. Penghapusan hanya berjalan
        bila tidak ada pinjaman, gadai, atau kredit barang yang masih berjalan.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="hapus-konfirmasi">Ketik {KONFIRMASI_HAPUS_AKUN} untuk mengonfirmasi</Label>
          <Input
            id="hapus-konfirmasi"
            value={frasa}
            onChange={(e) => onFrasa(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={KONFIRMASI_HAPUS_AKUN}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hapus-alasan">Alasan (opsional)</Label>
          <Input
            id="hapus-alasan"
            value={alasan}
            onChange={(e) => onAlasan(e.target.value)}
            maxLength={500}
            placeholder="Mis. tidak akan memakai layanan lagi"
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="destructive"
          onClick={onHapus}
          disabled={!cocok || sibuk}
          aria-busy={sibuk}
        >
          {sibuk ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
          {sibuk ? "Menghapus akun…" : "Hapus akun saya"}
        </Button>
        {cocok ? null : (
          <span className="text-xs text-rose-900">Tombol aktif setelah frasa diketik tepat.</span>
        )}
      </div>
      {galat === null ? null : (
        <p role="alert" className="mt-2 text-xs font-medium text-rose-900">
          {galat}
        </p>
      )}
    </div>
  );
}

/**
 * Kartu "Data & privasi" di dashboard nasabah.
 *
 * Salinan data diambil saat tombol ditekan (`convex.query`), bukan lewat
 * `useQuery`: menyusunnya memuat riwayat pengajuan, jadi tidak pantas berjalan
 * di setiap render halaman.
 */
export function DataPrivasiSaya() {
  const klien = useConvex();
  const hapusAkun = useMutation(api.dataSaya.hapusAkunSendiri);
  const { signOut } = useAuth();

  const [sibukUnduh, setSibukUnduh] = useState(false);
  const [galatUnduh, setGalatUnduh] = useState<string | null>(null);
  const [frasa, setFrasa] = useState("");
  const [alasan, setAlasan] = useState("");
  const [sibukHapus, setSibukHapus] = useState(false);
  const [galatHapus, setGalatHapus] = useState<string | null>(null);

  const unduh = async () => {
    setSibukUnduh(true);
    setGalatUnduh(null);
    try {
      const data = await klien.query(api.dataSaya.salinanSaya, {});
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const tautan = document.createElement("a");
      tautan.href = url;
      tautan.download = namaBerkasSalinanData(tanggalWIB(Date.now()));
      tautan.click();
      URL.revokeObjectURL(url);
      toast.success("Salinan data tersimpan di perangkat Anda.");
    } catch (err: unknown) {
      setGalatUnduh(err instanceof Error ? err.message : "Salinan data gagal disusun.");
    } finally {
      setSibukUnduh(false);
    }
  };

  const jalankanHapus = async () => {
    if (!konfirmasiCocok(frasa)) return;
    setSibukHapus(true);
    setGalatHapus(null);
    try {
      await hapusAkun({
        konfirmasi: frasa,
        ...(alasan.trim() === "" ? {} : { alasan: alasan.trim() }),
      });
      toast.success("Akun Anda dihapus.");
      await signOut();
    } catch (err: unknown) {
      setGalatHapus(err instanceof Error ? err.message : "Penghapusan akun gagal.");
    } finally {
      setSibukHapus(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-navy">
            <ShieldCheck className="size-4" aria-hidden /> Data &amp; privasi
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Unduh salinan data Anda atau hapus akun. Permintaan ini dijalankan server dengan
            pemeriksaan sendiri, dan jejaknya tercatat.
          </p>
        </div>
        <Badge className="border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100">
          Hak pemilik data
        </Badge>
      </div>

      <div className="mt-4 space-y-4">
        <BlokSalinanData sibuk={sibukUnduh} galat={galatUnduh} onUnduh={() => void unduh()} />
        <div className="border-t border-slate-200" />
        <BlokHapusAkun
          frasa={frasa}
          onFrasa={setFrasa}
          alasan={alasan}
          onAlasan={setAlasan}
          sibuk={sibukHapus}
          galat={galatHapus}
          onHapus={() => void jalankanHapus()}
        />
      </div>
    </section>
  );
}
