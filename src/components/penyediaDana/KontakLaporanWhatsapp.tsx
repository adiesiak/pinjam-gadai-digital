import { FileDown, Loader2, Send } from "lucide-react";
import { useState } from "react";

import { FOLIO } from "@/components/penyediaDana/folio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Kartu pengaturan kontak laporan WhatsApp di ruang penyedia dana.
 *
 * Satu bagian, dua tindakan yang berurutan wajar: isi nomor, lalu minta
 * laporannya. Keduanya diletakkan bersama karena tombol kirim tidak ada artinya
 * sebelum nomornya ada, dan pemisahan ke dua bagian akan membuat pendana
 * mencari-cari tempat mengisi nomornya.
 *
 * Teks kartu mengikuti bahasa laporan yang dipilih. Bawaannya Indonesia, jadi
 * pemanggil lama dan uji markup tidak berubah.
 *
 * Murni presentasional, tanpa Convex: halaman (`pages/PenyediaDana.tsx`) yang
 * memegang query dan aksi, sama seperti bagian persetujuan risiko.
 */
const TEKS = {
  id: {
    aria: "Laporan pendanaan",
    judul: "Laporan pendanaan",
    ringkas:
      "Salinan angka di halaman ini dalam satu berkas PDF. Unduh langsung, atau minta dikirim ke WhatsApp Anda. Nomor luar Indonesia ditulis dengan kode negaranya, mis. +49 151 2345678.",
    labelNomor: "Nomor WhatsApp untuk laporan",
    simpan: "Simpan nomor",
    menyimpan: "Menyimpan",
    tersimpan: "Tersimpan di akun Anda:",
    tersimpanLanjut:
      ". Laporan hanya dikirim ke nomor ini, dan hanya saat Anda memintanya. Nomor ini juga bisa dipakai untuk masuk lewat OTP WhatsApp.",
    belumAda: "Belum ada nomor tersimpan, jadi tidak ada laporan yang dikirim ke mana pun.",
    belumAdaLanjut:
      " Isi nomor untuk mengaktifkan tombol kirim dan pintu masuk OTP WhatsApp.",
    judulLaporan: "Laporan kinerja pendanaan",
    bahasa: "Bahasa PDF",
    unduh: "Unduh PDF",
    menyiapkan: "Menyiapkan PDF",
    kirim: "Kirim laporan ke WhatsApp",
    mengirim: "Mengirim laporan",
    catatanAda:
      "Berisi seluruh pinjaman atas nama Anda: dana tersalurkan, keuntungan yang sudah dibukukan, dan perkiraan dari pinjaman berjalan. Unduh PDF tidak memerlukan nomor.",
    catatanBelum:
      "Isi nomor lebih dulu untuk mengaktifkan tombol WhatsApp. Tombol Unduh PDF tetap bisa dipakai tanpa nomor.",
    kaki:
      "Laporan berisi angka pendanaan Anda. Unduhan PDF disimpan di perangkat ini. Kiriman WhatsApp memakai gateway yang diatur admin, dan salinannya berada di riwayat percakapan WhatsApp Anda, di luar aplikasi ini.",
  },
  en: {
    aria: "Funding report",
    judul: "Funding report",
    ringkas:
      "A PDF copy of the figures on this page. Download it directly, or have it sent to your WhatsApp. Non-Indonesian numbers must include the country code, e.g. +49 151 2345678.",
    labelNomor: "WhatsApp number for reports",
    simpan: "Save number",
    menyimpan: "Saving",
    tersimpan: "Saved on your account:",
    tersimpanLanjut:
      ". Reports are only sent to this number, and only when you ask for one. The same number can be used to sign in with a WhatsApp OTP.",
    belumAda: "No number is saved yet, so no report is sent anywhere.",
    belumAdaLanjut: " Add a number to enable the send button and WhatsApp OTP sign-in.",
    judulLaporan: "Funding performance report",
    bahasa: "PDF language",
    unduh: "Download PDF",
    menyiapkan: "Preparing PDF",
    kirim: "Send report to WhatsApp",
    mengirim: "Sending report",
    catatanAda:
      "Contains every loan under your name: funds disbursed, booked profit, and estimates from active loans. Downloading the PDF does not require a number.",
    catatanBelum:
      "Add a number first to enable the WhatsApp button. The Download PDF button works without a number.",
    kaki:
      "This report contains your funding figures. PDF downloads are saved on this device. WhatsApp delivery uses the gateway configured by the admin, and the copy lives in your WhatsApp conversation, outside this app.",
  },
} as const;

export function KontakLaporanWhatsapp({
  /** Nomor tersimpan pada akun (`null` = belum pernah diisi). */
  nomor,
  menyimpan,
  mengirim,
  mengunduh,
  bolehUnduh,
  galat,
  onSimpan,
  onKirim,
  onUnduh,
  bahasa,
  onUbahBahasa,
  className,
}: {
  nomor: string | null;
  menyimpan: boolean;
  mengirim: boolean;
  mengunduh: boolean;
  /** Angka laporan sudah tersedia; tanpa itu PDF tidak bisa disusun. */
  bolehUnduh: boolean;
  galat: string | null;
  onSimpan: (nomor: string) => void;
  onKirim: () => void;
  onUnduh: () => void;
  /** Bahasa kartu dan PDF yang diunduh; bawaan Indonesia. */
  bahasa?: "id" | "en";
  /** Bila diisi, pilihan bahasa tampil di kartu ini. */
  onUbahBahasa?: (bahasa: "id" | "en") => void;
  className?: string;
}) {
  const [isian, setIsian] = useState("");
  const bhs = bahasa ?? "id";
  const t = TEKS[bhs];

  const adaNomor = nomor !== null && nomor !== "";
  const bolehSimpan = isian.trim() !== "" && !menyimpan;
  const bolehKirim = adaNomor && !mengirim && !menyimpan;

  return (
    <section
      aria-label={t.aria}
      className={cn("animate-masuk px-4 py-3 sm:px-5", FOLIO.kertas, className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-200 pb-2">
        <h2 className={FOLIO.judul}>{t.judul}</h2>
        <p className="max-w-md text-xs leading-5 text-muted-foreground">{t.ringkas}</p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="nomor-laporan" className="text-xs font-semibold text-navy">
            {t.labelNomor}
          </Label>
          <div className="mt-1.5 flex flex-wrap items-start gap-2">
            <Input
              id="nomor-laporan"
              value={isian}
              onChange={(e) => setIsian(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="0812 3456 7890"
              className="min-h-11 max-w-56"
            />
            <Button
              type="button"
              variant="outline"
              disabled={!bolehSimpan}
              onClick={() => onSimpan(isian)}
              className="min-h-11"
            >
              {menyimpan ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
              {menyimpan ? t.menyimpan : t.simpan}
            </Button>
          </div>
          <p className={cn("mt-1.5 text-xs leading-5", FOLIO.catatan)}>
            {adaNomor ? (
              <>
                {t.tersimpan}{" "}
                <span className={cn("font-medium text-navy", FOLIO.angka)}>{nomor}</span>
                {t.tersimpanLanjut}
              </>
            ) : (
              <>
                {t.belumAda}
                {t.belumAdaLanjut}
              </>
            )}
          </p>
        </div>

        <div className="sm:border-l sm:border-slate-200 sm:pl-3">
          <p className="text-xs font-semibold text-navy">{t.judulLaporan}</p>
          {onUbahBahasa !== undefined && (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[11px] text-slate-500">{t.bahasa}</span>
              <div
                role="group"
                aria-label={t.bahasa}
                className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5"
              >
                {(
                  [
                    { nilai: "id" as const, label: "Indonesia" },
                    { nilai: "en" as const, label: "English" },
                  ] as const
                ).map((pilihan) => (
                  <button
                    key={pilihan.nilai}
                    type="button"
                    aria-pressed={bhs === pilihan.nilai}
                    onClick={() => onUbahBahasa(pilihan.nilai)}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                      bhs === pilihan.nilai
                        ? "bg-emerald-800 text-white"
                        : "text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {pilihan.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!bolehUnduh || mengunduh || mengirim}
              onClick={onUnduh}
              className="min-h-11 rounded-lg px-4 text-sm font-semibold"
            >
              {mengunduh ? (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              ) : (
                <FileDown className="mr-2 size-4" aria-hidden />
              )}
              {mengunduh ? t.menyiapkan : t.unduh}
            </Button>
            <Button
              type="button"
              disabled={!bolehKirim}
              onClick={onKirim}
              className="min-h-11 rounded-lg bg-[#064E3B] px-4 text-sm font-semibold text-white hover:bg-[#021E17]"
            >
              {mengirim ? (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="mr-2 size-4" aria-hidden />
              )}
              {mengirim ? t.mengirim : t.kirim}
            </Button>
          </div>
          <p className={cn("mt-1.5 text-xs leading-5", FOLIO.catatan)}>
            {adaNomor ? t.catatanAda : t.catatanBelum}
          </p>
        </div>
      </div>

      {galat !== null && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-300/70 bg-red-50/60 px-3 py-2 text-xs leading-5 text-red-900"
        >
          {galat}
        </p>
      )}

      <p className={cn("mt-3 border-t border-slate-200 pt-2", FOLIO.catatan)}>{t.kaki}</p>
    </section>
  );
}
