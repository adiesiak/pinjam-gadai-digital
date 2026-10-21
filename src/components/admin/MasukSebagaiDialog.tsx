import { Loader2, UserRoundCog } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { usePratinjau } from "@/hooks/use-pratinjau";

/**
 * TOMBOL "MASUK SEBAGAI" — pratinjau Super Admin atas satu akun.
 *
 * Ini bukan sekadar tampilan: peramban yang menekannya berpindah ke SESI NYATA
 * akun target (lihat `convex/auth/pratinjau.ts`), sehingga layar yang muncul
 * adalah aplikasi yang dialami akun itu — data, ruang, dan haknya. Karena itu
 * konfirmasinya menyebutkan tiga hal sekaligus: akun siapa yang dibuka, di mana
 * admin akan mendarat, dan bahwa sesi adminnya sendiri akan tersimpan sehingga
 * bisa dikembalikan dari bilah di atas layar.
 *
 * Dialog sengaja tidak bisa ditutup selama proses berjalan: kegagalan di tengah
 * jalan (mis. tiket kedaluwarsa) harus terbaca di tempat, bukan menghilang
 * bersama dialognya.
 *
 * Pemicunya bisa tombol sendiri atau menu "Kelola" di tabel pendana. Isi dialog
 * dipasang hanya selama terbuka, jadi alasan pratinjau akun sebelumnya tidak
 * terbawa ke akun berikutnya.
 */
export function TombolMasukSebagai({
  targetId,
  nama,
  tujuan,
  terbuka: terbukaKendali,
  onTerbukaChange,
  tampilkanTombol = true,
}: {
  targetId: string;
  nama: string;
  /** Ruang tujuan dalam kata-kata pemilik akun (mis. "ruang pendana"). */
  tujuan: string;
  /**
   * Mode terkendali: menu aksi di luar komponen ini yang membuka dialognya.
   * Dialog tetap tinggal di sini supaya alur konfirmasi dan pemulihan sesi tidak
   * bercabang; yang dipindahkan hanya pemicunya.
   */
  terbuka?: boolean;
  onTerbukaChange?: (terbuka: boolean) => void;
  /** Sembunyikan tombol pemicu saat dialog dibuka dari menu lain. */
  tampilkanTombol?: boolean;
}) {
  const [terbukaLokal, setTerbukaLokal] = useState(false);
  const terbuka = terbukaKendali ?? terbukaLokal;
  /** Satu pintu ubah: state lokal untuk pemakaian biasa, pemanggil untuk menu. */
  const ubahTerbuka = (buka: boolean) => {
    if (terbukaKendali === undefined) setTerbukaLokal(buka);
    onTerbukaChange?.(buka);
  };

  return (
    <>
      {tampilkanTombol && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 gap-2 rounded-xl sm:min-h-9"
          onClick={() => ubahTerbuka(true)}
        >
          <UserRoundCog className="size-3.5" aria-hidden="true" />
          Masuk sebagai
        </Button>
      )}

      <Dialog
        open={terbuka}
        onOpenChange={(buka) => {
          if (!buka) ubahTerbuka(false);
        }}
      >
        {terbuka && (
          <IsiMasukSebagai
            targetId={targetId}
            nama={nama}
            tujuan={tujuan}
            onTutup={() => ubahTerbuka(false)}
          />
        )}
      </Dialog>
    </>
  );
}

/** Isi konfirmasi — dipasang ulang setiap kali dialog dibuka. */
function IsiMasukSebagai({
  targetId,
  nama,
  tujuan,
  onTutup,
}: {
  targetId: string;
  nama: string;
  tujuan: string;
  onTutup: () => void;
}) {
  const { user } = useAuth();
  const { busy, mulai, tersangkut, akhiriTersangkut } = usePratinjau();
  const [alasan, setAlasan] = useState("");
  const [pesanGagal, setPesanGagal] = useState<string | null>(null);

  const adminLabel = user?.email ?? user?.name ?? "Super Admin";

  const kirim = async () => {
    setPesanGagal(null);
    try {
      await mulai({ targetId, alasan });
      // Berhasil berarti peramban sudah dimuat ulang ke ruang akun target;
      // tidak ada langkah lanjutan di sini.
    } catch (error) {
      const pesan =
        error instanceof Error ? error.message : "Gagal memulai pratinjau.";
      setPesanGagal(pesan);
    }
  };

  /**
   * Hentikan pratinjau lama yang menahan peramban ini, lalu langsung ulangi.
   * Tanpa ini, penanda yang tersisa setelah pratinjau ditinggalkan lewat Keluar
   * memblokir "Masuk sebagai" sampai batas 2 jamnya habis.
   */
  const hentikanLaluUlangi = async () => {
    setPesanGagal(null);
    try {
      await akhiriTersangkut();
      await kirim();
    } catch (error) {
      setPesanGagal(
        error instanceof Error ? error.message : "Gagal menghentikan pratinjau lama.",
      );
    }
  };

  return (
    <DialogContent
      className="max-w-lg"
      showCloseButton={!busy}
      onEscapeKeyDown={(event) => {
        if (busy) event.preventDefault();
      }}
      onInteractOutside={(event) => {
        if (busy) event.preventDefault();
      }}
    >
      <DialogHeader>
        <DialogTitle>Masuk sebagai {nama}?</DialogTitle>
        <DialogDescription>
          Peramban ini akan memakai sesi nyata akun itu, jadi Anda melihat{" "}
          {tujuan} persis seperti yang ia lihat. Sesi admin Anda disimpan di
          peramban ini dan dapat dikembalikan dari bilah di atas layar.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-950">
          Selama pratinjau, tindakan yang dilakukan dari peramban ini tercatat sebagai
          pratinjau oleh {adminLabel} dan ikut jejak audit akun tersebut.
        </div>

        <div>
          <Label htmlFor={`alasan-pratinjau-${targetId}`} className="text-xs text-muted-foreground">
            Alasan pratinjau (opsional)
          </Label>
          <Input
            id={`alasan-pratinjau-${targetId}`}
            autoComplete="off"
            placeholder="mis. memeriksa keluhan saldo pendana"
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            disabled={busy}
            className="mt-1"
          />
        </div>

        {pesanGagal !== null && (
          <p role="alert" className="text-sm leading-6 text-destructive">
            {pesanGagal}
          </p>
        )}

        {tersangkut && pesanGagal !== null && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
            <p className="text-xs leading-5 text-amber-950">
              Bilah itu tidak tampil lagi bila pratinjau lama ditinggalkan — misalnya setelah
              keluar dari akun yang dipratinjau. Kalau tidak menemukannya, hentikan dari sini;
              jejaknya tetap tercatat di Audit Trail.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 min-h-11 rounded-xl sm:min-h-9"
              disabled={busy}
              onClick={() => void hentikanLaluUlangi()}
            >
              Hentikan pratinjau lama &amp; coba lagi
            </Button>
          </div>
        )}
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          disabled={busy}
          onClick={onTutup}
        >
          Batal
        </Button>
        <Button
          type="button"
          className="gap-2 rounded-xl bg-[#064E3B] text-white hover:bg-[#04361f]"
          disabled={busy}
          onClick={() => void kirim()}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <UserRoundCog className="size-4" aria-hidden="true" />
          )}
          Masuk sebagai {nama}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
