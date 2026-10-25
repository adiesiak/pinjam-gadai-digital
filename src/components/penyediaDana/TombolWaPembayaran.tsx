/**
 * Kartu admin di ruang pendana: kirim rekening pembayaran lewat WhatsApp.
 *
 * Ruang pendana sudah menampilkan rekening tujuan setoran kepada pendana, tetapi
 * admin tidak punya jalan cepat untuk mengirimkannya ketika pendana bertanya
 * lewat WhatsApp — biasanya saat setoran pertama atau ketika nominalnya berbeda
 * dari catatan. Kartu ini menutup jalur itu tanpa mutation baru: rekening dibaca
 * dari `system.getPaymentInstructions` (konfigurasi Pengaturan Sistem), pesan
 * disusun `lib/waPembayaranManual`, lalu WhatsApp dibuka sebagai draf.
 *
 * Tidak ada pengiriman otomatis: pesan selalu ditinjau admin lebih dulu, sama
 * seperti tombol info tagihan. Nomor yang tidak sah menampilkan alasan, bukan
 * membuka WhatsApp dengan nomor kosong.
 *
 * Hanya dirender untuk `role === "admin"` oleh halaman pemanggil.
 */
import { useQuery } from "convex/react";
import { Loader2, Send } from "lucide-react";
import { useState } from "react";

import { FOLIO } from "@/components/penyediaDana/folio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { bukaLuarJendela } from "@/lib/jembatanAndroid";
import { kelompokkanDigit } from "@/lib/money";
import { normalkanNomorWa, urlWhatsapp } from "@/lib/pengingatWhatsapp";
import { cn } from "@/lib/utils";
import { pesanPembayaranManual, ringkasRekening } from "@/lib/waPembayaranManual";

export function TombolWaPembayaran({ className }: { className?: string }) {
  const instruksi = useQuery(api.system.getPaymentInstructions, {});
  const [nomor, setNomor] = useState("");
  const [nominal, setNominal] = useState("");
  const [catatan, setCatatan] = useState("");
  const [kabar, setKabar] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const tersedia = instruksi?.tersedia === true;
  const nomorSah = normalkanNomorWa(nomor) !== null;
  const digitNominal = nominal.replace(/\D/g, "");
  const nominalAngka = digitNominal === "" ? null : Number(digitNominal);

  const bukaDraf = () => {
    setKabar(null);
    setGalat(null);
    if (instruksi === undefined || !tersedia) {
      setGalat("Rekening usaha belum lengkap di Pengaturan Sistem.");
      return;
    }
    const pesan = pesanPembayaranManual({
      namaBank: instruksi.namaBank,
      nomorRekening: instruksi.nomorRekening,
      namaRekening: instruksi.namaRekening,
      nominal: nominalAngka,
      catatan,
    });
    const wa = urlWhatsapp(nomor, pesan);
    if (wa === null) {
      setGalat("Nomor WhatsApp tujuan tidak bisa dibaca. Tulis dengan kode negara, mis. +62…");
      return;
    }
    // Aplikasi Android memblokir jendela baru; tautan dibuka di luar WebView.
    if (!bukaLuarJendela(wa)) {
      window.open(wa, "_blank", "noopener,noreferrer");
    }
    setKabar("Draf pesan dibuka di WhatsApp — periksa lalu kirim.");
  };

  return (
    <section
      aria-labelledby="judul-wa-pembayaran"
      className={cn("animate-masuk mt-5 px-4 py-3 sm:px-5", FOLIO.kertas, className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-200 pb-2">
        <h2 id="judul-wa-pembayaran" className="flex items-center gap-2 text-sm font-semibold text-navy">
          <Send className="size-4 text-emerald-700" aria-hidden="true" />
          Kirim rekening pembayaran
        </h2>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-600">
          Khusus admin
        </span>
      </div>

      <p className={cn("mt-2 max-w-2xl", FOLIO.catatan)}>
        Rekening diambil dari Pengaturan Sistem. Pesan dibuka sebagai draf WhatsApp
        berisi rekening dan permintaan bukti transfer; Anda yang menekan kirim.
      </p>

      {instruksi !== undefined && tersedia && (
        <p className="mt-2 text-xs font-medium text-navy">
          <span className={FOLIO.angka}>{ringkasRekening(instruksi)}</span>
        </p>
      )}

      {instruksi !== undefined && !tersedia && (
        <p className="mt-2 rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-xs leading-5 text-amber-900">
          Rekening usaha belum lengkap. Isi bank, nomor rekening, dan atas nama di
          Pengaturan Sistem sebelum mengirim pesan.
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="wa-pembayaran-nomor" className="text-xs font-semibold text-navy">
            Nomor WhatsApp tujuan
          </Label>
          <Input
            id="wa-pembayaran-nomor"
            value={nomor}
            onChange={(e) => setNomor(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="0812 3456 7890"
            className="mt-1.5 min-h-11"
          />
        </div>
        <div>
          <Label htmlFor="wa-pembayaran-nominal" className="text-xs font-semibold text-navy">
            Nominal (opsional)
          </Label>
          <Input
            id="wa-pembayaran-nominal"
            value={nominal}
            onChange={(e) => setNominal(kelompokkanDigit(e.target.value))}
            inputMode="numeric"
            placeholder="1.000.000"
            className="mt-1.5 min-h-11 tabular-nums"
          />
        </div>
        <div>
          <Label htmlFor="wa-pembayaran-catatan" className="text-xs font-semibold text-navy">
            Catatan (opsional)
          </Label>
          <Input
            id="wa-pembayaran-catatan"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="mis. transfer sebelum 15.00 WIB"
            className="mt-1.5 min-h-11"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={bukaDraf}
          disabled={!nomorSah || instruksi === undefined || !tersedia}
          className="min-h-11 rounded-lg bg-[#064E3B] px-4 text-sm font-semibold text-white hover:bg-[#021E17]"
        >
          {instruksi === undefined ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="mr-2 size-4" aria-hidden="true" />
          )}
          Buka draf WhatsApp
        </Button>
        {nomor !== "" && !nomorSah && (
          <span className="text-[11px] leading-4 text-amber-800">
            Nomor belum bisa dibaca — tulis lengkap dengan kode negara.
          </span>
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
    </section>
  );
}
