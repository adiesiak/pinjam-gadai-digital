/**
 * Tombol "Kirim rekening" pada SATU baris pinjaman berjalan (khusus Super Admin).
 *
 * Ada karena kartu "Kirim rekening pembayaran" di atas tabel memaksa admin
 * mengetik nomor WhatsApp peminjam setiap kali — padahal nomornya sudah
 * tersimpan dan barisnya sudah menunjuk orang yang tepat. Tombol ini menghapus
 * langkah itu: satu klik, draf WhatsApp langsung berisi rekening, nomor
 * pinjaman, dan tanggal jatuh temponya.
 *
 * Nomor TIDAK ikut di daftar pengajuan. Daftar itu juga dibaca akun pendana dan
 * pemantau, dan tes `penyediaDana.convex.test.ts` menjaga agar tidak satu pun
 * nomor identitas ada di dalamnya. Karena itu nomor diambil dari
 * `admin.kontakPeminjam` — hanya saat tombolnya benar-benar ditekan, hanya untuk
 * satu pinjaman, dan hanya untuk sesi admin.
 *
 * Prinsip lain yang tetap dijaga:
 *  - **Tidak ada pengiriman otomatis.** Pesan dibuka sebagai draf; admin yang
 *    menekan kirim setelah membacanya, sama seperti kartu manual.
 *  - **Tidak ada nomor karangan.** Nomor yang belum tercatat atau tidak bisa
 *    dibaca memberi pesan jelas, bukan membuka WhatsApp kosong.
 *  - **Nominal tidak ditebak.** Tagihan per cicilan dihitung mesin angsuran;
 *    tombol ini hanya mengirim rekening + rujukan pinjaman, bukan angka yang
 *    bisa salah dan membuat peminjam membayar jumlah keliru.
 */
import { useConvex, useQuery } from "convex/react";
import { Loader2, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { bukaLuarJendela } from "@/lib/jembatanAndroid";
import { normalkanNomorWa, urlWhatsapp } from "@/lib/pengingatWhatsapp";
import { formatTanggalWIB } from "@/lib/waktu";
import { pesanPembayaranManual } from "@/lib/waPembayaranManual";

export function TombolKirimRekening({
  loanId,
  nama,
  referensi,
  jatuhTempoPada = null,
  penuh = false,
  ikonSaja = false,
}: {
  /** Pinjaman yang barisnya sedang dilihat — sumber nomor & jatuh tempo. */
  loanId: Id<"loans">;
  /** Nama peminjam untuk pesan galat & konfirmasi. */
  nama: string;
  /** Nomor referensi pinjaman yang dirujuk di pesan. */
  referensi: string;
  /** Tanggal jatuh tempo (ms) — ikut ditulis bila tersedia. */
  jatuhTempoPada?: number | null;
  /** Kartu layar sempit: tombol memenuhi lebar kartu. */
  penuh?: boolean;
  /** Kolom Aksi tabel: ikon saja, dengan label aksesibel. */
  ikonSaja?: boolean;
}) {
  const klien = useConvex();
  const instruksi = useQuery(api.system.getPaymentInstructions, {});
  const [mengambil, setMengambil] = useState(false);
  const sibuk = instruksi === undefined || mengambil;

  const kirim = async () => {
    if (sibuk) return;
    if (instruksi !== undefined && !instruksi.tersedia) {
      toast.error(
        "Rekening usaha belum lengkap di Pengaturan Sistem, jadi pesan belum bisa disusun.",
      );
      return;
    }
    setMengambil(true);
    try {
      const kontak = await klien.query(api.admin.kontakPeminjam, { loanId });
      const nomor = kontak?.nomorWhatsApp ?? null;
      if (normalkanNomorWa(nomor) === null) {
        toast.error(
          `Nomor WhatsApp ${nama} belum tercatat atau tidak bisa dibaca. Lengkapi dulu di panel admin.`,
        );
        return;
      }
      if (instruksi === undefined) return;
      const catatan = [
        `Untuk pinjaman ${referensi}.`,
        jatuhTempoPada === null
          ? null
          : `Jatuh tempo ${formatTanggalWIB(jatuhTempoPada)}.`,
      ]
        .filter((baris) => baris !== null)
        .join(" ");
      const pesan = pesanPembayaranManual({
        namaBank: instruksi.namaBank,
        nomorRekening: instruksi.nomorRekening,
        namaRekening: instruksi.namaRekening,
        catatan,
      });
      const wa = urlWhatsapp(nomor ?? "", pesan);
      if (wa === null) {
        toast.error("Nomor WhatsApp peminjam tidak bisa dibaca.");
        return;
      }
      // Aplikasi Android memblokir jendela baru; tautan dibuka di luar WebView.
      if (!bukaLuarJendela(wa)) {
        window.open(wa, "_blank", "noopener,noreferrer");
      }
      toast.success(
        `Draf rekening untuk ${nama} dibuka di WhatsApp — periksa lalu tekan kirim.`,
      );
    } catch (galat) {
      toast.error(
        galat instanceof Error
          ? galat.message
          : "Nomor peminjam gagal dibaca. Coba lagi.",
      );
    } finally {
      setMengambil(false);
    }
  };

  const label = `Kirim rekening pembayaran ke ${nama}`;
  const ikon = sibuk ? (
    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
  ) : (
    <Send className="size-4" aria-hidden="true" />
  );

  if (ikonSaja) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void kirim()}
        disabled={sibuk}
        aria-label={label}
        title={label}
        className="h-9 w-9 shrink-0 p-0 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900"
      >
        {ikon}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void kirim()}
      disabled={sibuk}
      aria-label={label}
      className={
        penuh
          ? "h-11 w-full justify-center gap-1.5 border-emerald-700/40 text-emerald-900 hover:bg-emerald-50"
          : "h-9 gap-1.5 border-emerald-700/40 text-emerald-900 hover:bg-emerald-50"
      }
    >
      {ikon}
      Kirim rekening
    </Button>
  );
}
