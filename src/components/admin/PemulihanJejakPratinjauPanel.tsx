import { useMutation } from "convex/react";
import { Loader2, MapPin, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";

/**
 * PEMULIHAN JEJAK PRATINJAU — kartu admin untuk membersihkan titik GPS yang
 * dulu tertulis oleh peramban admin yang "masuk sebagai" nasabah.
 *
 * Sebelum pagar lokasi dipasang, titik admin tercampur di riwayat nasabah dan
 * yang terakhir juga menjadi lokasi terakhirnya. Pemulihan menandai titik di
 * dalam jendela pratinjau (tidak dihapus, jadi audit tetap utuh) dan
 * mengembalikan lokasi terakhir ke titik sah sebelum/sesudah pratinjau.
 *
 * Dua langkah disengaja: "Periksa dampak" hanya menghitung, "Terapkan" menulis
 * dan tercatat di Audit Trail. Tanpa langkah kering, operator tidak punya cara
 * tahu berapa akun yang akan berubah sebelum menekan tombol tulis.
 */

export type BarisPemulihanJejak = {
  userId: string;
  label: string;
  titikDikecualikan: number;
  status: "tetap" | "dipulihkan" | "dihapus";
  sumberStatus: "jejak" | "pengajuan" | null;
  statusLama: { lat: number; lng: number; waktu: number } | null;
  statusBaru: { lat: number; lng: number; waktu: number } | null;
};

export type HasilPemulihanJejak = {
  kering: boolean;
  jumlahTarget: number;
  titikDikecualikan: number;
  statusDipulihkan: number;
  statusDihapus: number;
  target: BarisPemulihanJejak[];
};

/** Kelas kartu yang sama dengan kartu Pratinjau Aktif di sebelahnya. */
const KARTU = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";

/** Batas baris yang ditampilkan sebelum diringkas jadi "+N akun lain". */
const BATAS_BARIS = 8;

function keteranganStatus(baris: BarisPemulihanJejak): string {
  if (baris.status === "dihapus") return "lokasi terakhir dihapus, tidak ada titik asli";
  if (baris.status === "dipulihkan") {
    return baris.sumberStatus === "pengajuan"
      ? "lokasi terakhir diambil dari pengajuan sebelum pratinjau"
      : "lokasi terakhir diambil dari jejak sebelum pratinjau";
  }
  return "lokasi terakhir tidak perlu diubah";
}

/** Angka tunggal dengan pemisah ribuan Indonesia. */
function angka(nilai: number): string {
  return nilai.toLocaleString("id-ID");
}

/** Bagian tampilan murni — dipakai uji render tanpa Convex. */
export function KartuPemulihanJejak({
  hasil,
  busy,
  onPeriksa,
  onTerapkan,
}: {
  hasil: HasilPemulihanJejak | null;
  busy: boolean;
  onPeriksa: () => void;
  onTerapkan: () => void;
}) {
  const adaDampak = hasil !== null && hasil.jumlahTarget > 0;
  const tampil = hasil === null ? [] : hasil.target.slice(0, BATAS_BARIS);
  const sisa = hasil === null ? 0 : Math.max(hasil.jumlahTarget - tampil.length, 0);

  return (
    <section className={KARTU}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <MapPin className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-bold text-slate-900">Pemulihan jejak pratinjau</h3>
            <p className="text-xs text-muted-foreground">
              Menandai titik GPS yang tertulis selama pratinjau dan mengembalikan
              lokasi terakhir nasabah. Titiknya tidak dihapus, hanya dikecualikan
              dari peta dan riwayat.
            </p>
          </div>
        </div>
        {hasil !== null && !hasil.kering && (
          <Badge variant="outline" className="border-emerald-200 text-emerald-800">
            Pemulihan diterapkan
          </Badge>
        )}
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="gap-2 rounded-xl"
          disabled={busy}
          onClick={onPeriksa}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RotateCcw className="size-3.5" aria-hidden="true" />
          )}
          Periksa dampak
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              className="gap-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
              disabled={busy || !adaDampak}
            >
              Terapkan pemulihan
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Terapkan pemulihan jejak pratinjau?</AlertDialogTitle>
              <AlertDialogDescription>
                {hasil === null
                  ? ""
                  : `${angka(hasil.jumlahTarget)} akun dan ${angka(
                      hasil.titikDikecualikan,
                    )} titik akan ditandai. Lokasi terakhir ${angka(
                      hasil.statusDipulihkan,
                    )} akun diubah ke titik sebelum pratinjau${
                      hasil.statusDihapus > 0
                        ? `, dan ${angka(hasil.statusDihapus)} akun kehilangan lokasi terakhir karena tidak ada titik asli`
                        : ""
                    }. Tindakan ini tercatat di Audit Trail.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                className="bg-slate-900 text-white hover:bg-slate-800"
                onClick={onTerapkan}
              >
                Terapkan
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {hasil === null ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-center text-xs text-muted-foreground">
          Periksa dulu untuk melihat berapa akun dan titik yang terdampak. Langkah
          ini tidak mengubah data.
        </p>
      ) : hasil.jumlahTarget === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-center text-xs text-muted-foreground">
          Tidak ada jejak pratinjau yang perlu dipulihkan.
          {!hasil.kering && " Pemeriksaan ulang juga tidak menemukan sisa data."}
        </p>
      ) : (
        <div className="mt-4">
          <p className="text-xs text-slate-600">
            {hasil.kering ? "Perkiraan dampak" : "Sudah dipulihkan"}:{" "}
            <span className="font-semibold text-slate-900">
              {angka(hasil.jumlahTarget)} akun
            </span>{" "}
            · {angka(hasil.titikDikecualikan)} titik ·{" "}
            {angka(hasil.statusDipulihkan)} lokasi dikembalikan ·{" "}
            {angka(hasil.statusDihapus)} lokasi dihapus
          </p>
          <ul className="mt-3 divide-y divide-slate-100">
            {tampil.map((baris) => (
              <li key={baris.userId} className="py-2.5">
                <p className="text-sm font-semibold text-slate-900">{baris.label}</p>
                <p className="text-xs text-muted-foreground">
                  {baris.titikDikecualikan > 0
                    ? `${angka(baris.titikDikecualikan)} titik ditandai · `
                    : ""}
                  {keteranganStatus(baris)}
                </p>
              </li>
            ))}
          </ul>
          {sisa > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              dan {angka(sisa)} akun lain. Hasil lengkap ada di Audit Trail.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** Pembungkus ber-Convex: menjalankan pemeriksaan kering dan penerapan. */
export function PemulihanJejakPratinjauPanel() {
  const jalankan = useMutation(api.pratinjau.pulihkanJejakPratinjau);
  const [hasil, setHasil] = useState<HasilPemulihanJejak | null>(null);
  const [busy, setBusy] = useState(false);

  const periksa = async (terapkan: boolean) => {
    setBusy(true);
    try {
      const jawaban = await jalankan({ terapkan });
      setHasil(jawaban);
      if (!terapkan) {
        toast.success(
          jawaban.jumlahTarget === 0
            ? "Tidak ada jejak pratinjau yang perlu dipulihkan."
            : `${jawaban.jumlahTarget} akun dan ${jawaban.titikDikecualikan} titik akan dipulihkan.`,
        );
      } else {
        toast.success(
          `Pemulihan diterapkan pada ${jawaban.jumlahTarget} akun.`,
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal menjalankan pemulihan.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <KartuPemulihanJejak
      hasil={hasil}
      busy={busy}
      onPeriksa={() => void periksa(false)}
      onTerapkan={() => void periksa(true)}
    />
  );
}
