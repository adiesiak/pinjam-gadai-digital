import { useState } from "react";
import { useMutation } from "convex/react";
import { Loader2, Send } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { bukaLuarJendela } from "@/lib/jembatanAndroid";
import { templateSesuaiSisaHari, urlCekStatus, urlWhatsapp } from "@/lib/pengingatWhatsapp";

/**
 * Tombol baris tabel admin: "Kirim Info Tagihan & Cek Status (WA)".
 *
 * Alur satu klik:
 *  1. `tautanStatus.buatTautan` membuat (atau memakai ulang) token status untuk
 *     pinjaman itu — idempoten selama masa berlaku, jadi menekan dua kali tidak
 *     mematikan tautan yang sudah dikirim ke peminjam.
 *  2. Pesan disusun `lib/pengingatWhatsapp`: template H-3/H-1 otomatis sesuai
 *     sisa hari, atau template info tagihan + tautan untuk keadaan lain.
 *  3. WhatsApp dibuka dengan draf tersebut. Pesannya SELALU ditinjau admin lebih
 *     dulu — tidak ada pengiriman otomatis dari klien, dan tidak ada nomor yang
 *     dikarang bila nomor nasabah kosong.
 *
 * Tautan yang dipakai selalu berasal dari `urlCekStatus(window.location.origin)`,
 * sehingga admin tidak mungkin tidak sengaja menempel domain lain (phishing).
 */
export function TombolInfoTagihanWA({
  loanId,
  namaPeminjam,
  nomorReferensi,
  nomorWhatsApp,
  tanggalTeks,
  totalKewajiban,
  sisaHari,
  ukuran = "sm",
}: {
  loanId: Id<"loans">;
  namaPeminjam: string;
  nomorReferensi: string;
  nomorWhatsApp: string | null;
  /** Tanggal jatuh tempo sudah diformat; null bila belum ada. */
  tanggalTeks?: string | null;
  /** Total kewajiban (termasuk denda) dalam rupiah; null bila belum ada. */
  totalKewajiban?: number | null;
  /** Sisa hari ke jatuh tempo; null/negatif berarti sudah lewat. */
  sisaHari?: number | null;
  ukuran?: "sm" | "default";
}) {
  const buatTautan = useMutation(api.tautanStatus.buatTautan);
  const [sibuk, setSibuk] = useState(false);
  const [kabar, setKabar] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const bukaDraf = async () => {
    setSibuk(true);
    setKabar(null);
    setGalat(null);
    try {
      const tautan = await buatTautan({ loanId });
      const url =
        typeof window === "undefined"
          ? null
          : urlCekStatus(window.location.origin, tautan.token);
      if (url === null) {
        setGalat("Alamat halaman tidak dikenali, jadi tautan belum bisa dibuat.");
        return;
      }

      const data = {
        namaPeminjam,
        nomorReferensi,
        tanggalTeks: tanggalTeks ?? null,
        totalKewajiban: totalKewajiban ?? null,
        tautan: url,
      };
      const { jenis, pesan: pesanFinal } = templateSesuaiSisaHari(
        sisaHari === null || sisaHari === undefined ? 99 : sisaHari,
        data,
      );
      const wa = urlWhatsapp(nomorWhatsApp ?? "", pesanFinal);
      if (wa === null) {
        setGalat("Nomor WhatsApp nasabah tidak tersedia atau tidak bisa dibaca.");
        return;
      }

      // Aplikasi Android memblokir jendela baru; tautan dibuka di luar WebView.
      if (!bukaLuarJendela(wa)) {
        window.open(wa, "_blank", "noopener,noreferrer");
      }
      setKabar(
        jenis === "h1"
          ? "Draf pengingat H-1 dibuka di WhatsApp — periksa lalu kirim."
          : jenis === "h3"
            ? "Draf pengingat H-3 dibuka di WhatsApp — periksa lalu kirim."
            : "Draf info tagihan + tautan cek status dibuka di WhatsApp — periksa lalu kirim.",
      );
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Gagal membuat tautan cek status.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="flex flex-col items-stretch gap-1">
      <Button
        type="button"
        size={ukuran}
        variant="outline"
        onClick={() => void bukaDraf()}
        disabled={sibuk}
        title="Membuat tautan cek status resmi, lalu membuka draf WhatsApp untuk ditinjau"
        className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
      >
        {sibuk ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="mr-1.5 size-3.5" aria-hidden="true" />
        )}
        Kirim Info Tagihan &amp; Cek Status (WA)
      </Button>
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
