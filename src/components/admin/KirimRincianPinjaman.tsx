import { useAction, useQuery } from "convex/react";
import { FileDown, Loader2, Mail, MessageCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { unduhLewatAplikasi } from "@/lib/jembatanAndroid";

/**
 * Tombol admin: kirim dokumen rincian pinjaman ke peminjam.
 *
 * Tujuannya selalu kontak terdaftar milik peminjam itu (email akun atau nomor
 * WhatsApp dari KYC), bukan alamat bebas, jadi tidak ada jalan memakai panel
 * ini sebagai pengirim email massal. Dokumennya dibangun server
 * (`rincianKirim.*`) supaya kedua kanal memakai angka yang sama.
 *
 * Ikone dipilih karena menggambarkan kanalnya langsung (gelembung obrolan untuk
 * WhatsApp, amplop untuk email, tanda unduh untuk berkas), bukan hiasan.
 */

export type Kanal = "email" | "whatsapp";
export type Pekerjaan = Kanal | "unduh";

export type KesiapanKirim = {
  email: string | null;
  whatsapp: string | null;
  bolehKirim: boolean;
};

/** Nomor panjang dipotong di tengah supaya kode negara tetap terbaca admin. */
function ringkasNomor(nomor: string): string {
  return nomor.length > 10 ? `${nomor.slice(0, 6)}...${nomor.slice(-4)}` : nomor;
}

function blokDariBase64(base64: string): Blob {
  const biner = atob(base64);
  const byte = new Uint8Array(biner.length);
  for (let i = 0; i < biner.length; i += 1) byte[i] = biner.charCodeAt(i);
  return new Blob([byte], { type: "application/pdf" });
}

/** Simpan berkas di perangkat; aplikasi Android memakai jembatannya sendiri. */
async function simpanPdf(namaBerkas: string, base64: string): Promise<void> {
  const blob = blokDariBase64(base64);
  if (await unduhLewatAplikasi(namaBerkas, "application/pdf", blob)) return;
  const url = URL.createObjectURL(blob);
  const tautan = document.createElement("a");
  tautan.href = url;
  tautan.download = namaBerkas;
  tautan.rel = "noopener";
  document.body.appendChild(tautan);
  tautan.click();
  tautan.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Kalimat alasan kanal yang belum bisa dipakai, atau null bila keduanya siap. */
function alasanKanalBelumSiap(kesiapan: KesiapanKirim): string | null {
  const emailAda = kesiapan.email !== null && kesiapan.email.trim() !== "";
  const whatsappAda = kesiapan.whatsapp !== null && kesiapan.whatsapp.trim() !== "";
  if (whatsappAda && emailAda) return null;
  if (!whatsappAda && !emailAda) {
    return "Nomor WhatsApp dan email peminjam belum tercatat, jadi dokumen hanya bisa disimpan sebagai PDF.";
  }
  return !whatsappAda
    ? "Nomor WhatsApp peminjam belum tercatat, jadi kanal WhatsApp belum bisa dipakai."
    : "Email peminjam belum tercatat, jadi kanal email belum bisa dipakai.";
}

/**
 * Bagian tampilan, terpisah dari kait Convex-nya supaya bisa diuji render:
 * yang perlu dijaga adalah keadaan belum siap (kontak belum tercatat), keadaan
 * sedang bekerja, dan kabar hasil kirimannya.
 */
export function BagianKirimRincian({
  kesiapan,
  sibuk,
  kabar,
  galat,
  onKirim,
}: {
  /** undefined = kesiapan kontak masih dimuat. */
  kesiapan: KesiapanKirim | undefined;
  sibuk: Pekerjaan | null;
  kabar: string | null;
  galat: string | null;
  onKirim: (kerja: Pekerjaan) => void;
}) {
  if (kesiapan === undefined) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Memeriksa kontak peminjam...
      </span>
    );
  }

  if (!kesiapan.bolehKirim) {
    return (
      <span className="text-[11px] leading-4 text-muted-foreground">
        Rincian hanya bisa dikirim admin yang sudah memverifikasi TOTP.
      </span>
    );
  }

  const emailAda = kesiapan.email !== null && kesiapan.email.trim() !== "";
  const whatsappAda = kesiapan.whatsapp !== null && kesiapan.whatsapp.trim() !== "";
  const adaPekerjaan = sibuk !== null;
  const alasan = alasanKanalBelumSiap(kesiapan);

  return (
    <div className="flex flex-col items-stretch gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-11 border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 sm:h-9"
          disabled={!whatsappAda || adaPekerjaan}
          aria-busy={sibuk === "whatsapp"}
          onClick={() => onKirim("whatsapp")}
          title={
            whatsappAda
              ? "Kirim rincian pinjaman beserta berkas PDF ke WhatsApp peminjam"
              : "Peminjam belum punya nomor WhatsApp di data KYC maupun di akunnya"
          }
        >
          {sibuk === "whatsapp" ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <MessageCircle className="mr-1.5 size-3.5" aria-hidden="true" />
          )}
          Kirim Rincian (WA)
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-11 border-slate-200 bg-white sm:h-9"
          disabled={!emailAda || adaPekerjaan}
          aria-busy={sibuk === "email"}
          onClick={() => onKirim("email")}
          title={
            emailAda
              ? "Kirim rincian pinjaman beserta berkas PDF ke email peminjam"
              : "Akun peminjam belum punya alamat email"
          }
        >
          {sibuk === "email" ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Mail className="mr-1.5 size-3.5" aria-hidden="true" />
          )}
          Kirim Rincian (Email)
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-11 border-slate-200 bg-white sm:h-9"
          disabled={adaPekerjaan}
          aria-busy={sibuk === "unduh"}
          onClick={() => onKirim("unduh")}
          title="Simpan berkas PDF rincian untuk diserahkan sendiri"
        >
          {sibuk === "unduh" ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <FileDown className="mr-1.5 size-3.5" aria-hidden="true" />
          )}
          Simpan PDF
        </Button>
      </div>

      {alasan !== null && (
        <span className="text-[11px] leading-4 text-muted-foreground">{alasan}</span>
      )}
      {kabar !== null && (
        <span role="status" className="text-[11px] leading-4 text-emerald-700">
          {kabar}
        </span>
      )}
      {galat !== null && (
        <span role="alert" className="text-[11px] leading-4 text-red-600">
          {galat}
        </span>
      )}
    </div>
  );
}

export function KirimRincianPinjaman({ loanId }: { loanId: Id<"loans"> }) {
  const data = useQuery(api.rincianPinjaman.dataRincian, { loanId });
  const kirimEmail = useAction(api.rincianKirim.kirimRincianEmail);
  const kirimWhatsapp = useAction(api.rincianKirim.kirimRincianWhatsapp);
  const unduhPdf = useAction(api.rincianKirim.unduhRincianPdf);

  const [sibuk, setSibuk] = useState<Pekerjaan | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const jalankan = async (kerja: Pekerjaan) => {
    setSibuk(kerja);
    setKabar(null);
    setGalat(null);
    try {
      if (kerja === "whatsapp") {
        const hasil = await kirimWhatsapp({ loanId });
        setKabar(
          hasil.lampiran
            ? `Rincian dikirim ke WhatsApp ${ringkasNomor(hasil.tujuan)} beserta berkas PDF.`
            : `Rincian dikirim ke WhatsApp ${ringkasNomor(hasil.tujuan)} tanpa lampiran PDF: gateway WhatsApp yang diatur belum mendukung lampiran berkas.`,
        );
        return;
      }
      if (kerja === "email") {
        const hasil = await kirimEmail({ loanId });
        setKabar(`Rincian dikirim ke email ${hasil.tujuan} beserta berkas PDF.`);
        return;
      }
      const hasil = await unduhPdf({ loanId });
      await simpanPdf(hasil.namaBerkas, hasil.base64);
      setKabar(`Berkas ${hasil.namaBerkas} disimpan ke perangkat.`);
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Pengiriman gagal tanpa keterangan.");
    } finally {
      setSibuk(null);
    }
  };

  return (
    <BagianKirimRincian
      kesiapan={
        data === undefined
          ? undefined
          : { email: data.email, whatsapp: data.whatsapp, bolehKirim: data.bolehKirim }
      }
      sibuk={sibuk}
      kabar={kabar}
      galat={galat}
      onKirim={(kerja) => void jalankan(kerja)}
    />
  );
}
