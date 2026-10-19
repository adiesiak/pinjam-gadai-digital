import { useAction, useMutation, useQuery } from "convex/react";
import {
  Check,
  ClipboardCopy,
  FileDown,
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  RotateCcw,
  Send,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { unduhLewatAplikasi } from "@/lib/jembatanAndroid";
import {
  LABEL_TINDAK_LANJUT_SOMASI,
  TINDAK_LANJUT_SOMASI,
  teksSomasi,
  type SuratSomasi as IsiSuratSomasi,
  type TindakLanjutSomasi,
} from "@/lib/suratSomasi";
import { formatTanggalWIB } from "@/lib/waktu";

/**
 * Panel surat somasi di dalam kasus penagihan.
 *
 * Surat hanya muncul untuk pinjaman yang sudah lewat jatuh tempo H+3 dan tidak
 * sedang punya janji bayar aktif atau pengaduan terbuka. Setelah diunduh
 * pertama kali, nomor dan angkanya dibekukan; unduhan berikutnya memakai
 * snapshot yang sama agar arsip tidak berubah.
 */

export type TerbitSomasi = {
  nomorSurat: string;
  pada: number;
  olehLabel: string;
  totalKewajiban: number;
  hariTerlambat: number;
  diserahkanPada: number | null;
  diserahkanMelalui: string | null;
  diserahkanOlehLabel: string | null;
  tindakLanjut: string | null;
  tindakLanjutPada: number | null;
  tindakLanjutOlehLabel: string | null;
  tindakLanjutCatatan: string | null;
};

export type RiwayatKirimSomasi = {
  kanal: string;
  tujuan: string;
  status: string;
  respon: string | null;
  pada: number;
};

export type HasilSomasi =
  | { tersedia: false; alasan: string }
  | {
      tersedia: true;
      surat: IsiSuratSomasi;
      terbit: TerbitSomasi | null;
      berubah: boolean;
      bolehKirim: boolean;
      alasanKirim: string | null;
      namaBerkas: string;
      kontak: { email: boolean; whatsapp: boolean };
      riwayatKirim: RiwayatKirimSomasi[];
    };

export type AksiSomasi =
  | "unduh"
  | "salin"
  | "whatsapp"
  | "email"
  | "serahkan"
  | "batal"
  | "tindak";

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

function labelKanal(kanal: string | null): string {
  if (kanal === "email") return "email";
  if (kanal === "whatsapp") return "WhatsApp";
  return "serah langsung";
}

function labelStatusKirim(status: string): string {
  if (status === "terkirim") return "terkirim";
  if (status === "gagal") return "gagal";
  return "sedang diproses";
}

function warnaStatusKirim(status: string): string {
  if (status === "terkirim") return "text-emerald-700";
  if (status === "gagal") return "text-rose-600";
  return "text-amber-700";
}

function tombolKecil(kelas: string): string {
  return `h-11 text-xs sm:h-9 ${kelas}`;
}

export function BagianSuratSomasi({
  hasil,
  terbuka,
  sibuk,
  kabar,
  galat,
  onToggle,
  onUnduh,
  onSalin,
  onKirim,
  onSerahkan,
  onBatalSerahkan,
  onTindakLanjut,
}: {
  /** undefined = surat masih disusun server. */
  hasil: HasilSomasi | undefined;
  terbuka: boolean;
  sibuk: AksiSomasi | null;
  kabar: string | null;
  galat: string | null;
  onToggle: () => void;
  onUnduh: () => void;
  onSalin: () => void;
  onKirim: (kanal: "whatsapp" | "email") => void;
  onSerahkan: () => void;
  onBatalSerahkan: () => void;
  onTindakLanjut: (nilai: TindakLanjutSomasi) => void;
}) {
  if (hasil === undefined) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Menyusun surat somasi...
      </p>
    );
  }

  if (!hasil.tersedia) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <FileText className="size-4 text-slate-500" aria-hidden="true" />
          Surat somasi belum tersedia
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{hasil.alasan}</p>
      </div>
    );
  }

  const surat = hasil.surat;
  const terbit = hasil.terbit;
  const diserahkan = terbit?.diserahkanPada != null;
  const adaPekerjaan = sibuk !== null;
  const bisaKirimWa = hasil.bolehKirim && hasil.kontak.whatsapp;
  const bisaKirimEmail = hasil.bolehKirim && hasil.kontak.email;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-navy">
            <FileText className="size-4 text-primary" aria-hidden="true" />
            Surat somasi keterlambatan
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {terbit === null
              ? `${surat.nomorSurat} · batas bayar ${surat.batasBayarTeks}. Nomor dan angka dibekukan saat PDF pertama diunduh.`
              : `${terbit.nomorSurat} · diterbitkan ${formatTanggalWIB(terbit.pada)} oleh ${terbit.olehLabel}.`}
          </p>
          {diserahkan && terbit !== null && (
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
              <Check className="size-3" aria-hidden="true" />
              Diserahkan {formatTanggalWIB(terbit.diserahkanPada ?? 0)} melalui{" "}
              {labelKanal(terbit.diserahkanMelalui)}
              {terbit.diserahkanOlehLabel !== null ? ` oleh ${terbit.diserahkanOlehLabel}` : ""}
            </p>
          )}
          {terbit?.tindakLanjut != null && (
            <p className="mt-1 text-[11px] leading-4 text-slate-600">
              Tindak lanjut:{" "}
              <strong>
                {LABEL_TINDAK_LANJUT_SOMASI[terbit.tindakLanjut as TindakLanjutSomasi] ??
                  terbit.tindakLanjut}
              </strong>
              {terbit.tindakLanjutPada !== null
                ? ` · ${formatTanggalWIB(terbit.tindakLanjutPada)}`
                : ""}
              {terbit.tindakLanjutCatatan !== null ? ` · ${terbit.tindakLanjutCatatan}` : ""}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={tombolKecil("border-slate-200")}
            aria-expanded={terbuka}
            onClick={onToggle}
          >
            {terbuka ? "Tutup pratinjau" : "Pratinjau surat"}
          </Button>
          <Button
            type="button"
            size="sm"
            className={tombolKecil("")}
            disabled={adaPekerjaan}
            aria-busy={sibuk === "unduh"}
            onClick={onUnduh}
          >
            {sibuk === "unduh" ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileDown className="mr-2 size-4" aria-hidden="true" />
            )}
            {terbit === null ? "Unduh PDF" : "Unduh ulang PDF"}
          </Button>
        </div>
      </div>

      {hasil.berubah && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
          Kewajiban tercatat sudah berubah sejak surat diterbitkan. Unduhan memakai angka saat
          diterbitkan; catat pembayaran lewat jalur pinjaman lebih dulu bila perlu surat baru.
        </p>
      )}
      {!hasil.bolehKirim && hasil.alasanKirim !== null && (
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{hasil.alasanKirim}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={tombolKecil("border-slate-200")}
          disabled={adaPekerjaan}
          aria-busy={sibuk === "salin"}
          onClick={onSalin}
        >
          {sibuk === "salin" ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ClipboardCopy className="mr-2 size-4" aria-hidden="true" />
          )}
          Salin teks
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={tombolKecil(
            "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
          )}
          disabled={!bisaKirimWa || adaPekerjaan}
          aria-busy={sibuk === "whatsapp"}
          onClick={() => onKirim("whatsapp")}
          title={
            !hasil.kontak.whatsapp
              ? "Peminjam belum punya nomor WhatsApp di KYC maupun akun"
              : (hasil.alasanKirim ?? "Kirim surat somasi beserta PDF ke WhatsApp peminjam")
          }
        >
          {sibuk === "whatsapp" ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
          ) : (
            <MessageCircle className="mr-2 size-4" aria-hidden="true" />
          )}
          Kirim WA
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={tombolKecil("border-slate-200")}
          disabled={!bisaKirimEmail || adaPekerjaan}
          aria-busy={sibuk === "email"}
          onClick={() => onKirim("email")}
          title={
            !hasil.kontak.email
              ? "Akun peminjam belum punya alamat email"
              : (hasil.alasanKirim ?? "Kirim surat somasi beserta PDF ke email peminjam")
          }
        >
          {sibuk === "email" ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Mail className="mr-2 size-4" aria-hidden="true" />
          )}
          Kirim email
        </Button>
        {terbit !== null && !diserahkan && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={tombolKecil("border-slate-200")}
            disabled={adaPekerjaan}
            aria-busy={sibuk === "serahkan"}
            onClick={onSerahkan}
            title="Tandai surat sudah diserahkan langsung kepada peminjam"
          >
            {sibuk === "serahkan" ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="mr-2 size-4" aria-hidden="true" />
            )}
            Tandai diserahkan
          </Button>
        )}
        {diserahkan && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={tombolKecil("text-muted-foreground")}
            disabled={adaPekerjaan}
            aria-busy={sibuk === "batal"}
            onClick={onBatalSerahkan}
          >
            {sibuk === "batal" ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw className="mr-2 size-4" aria-hidden="true" />
            )}
            Batalkan tanda
          </Button>
        )}
      </div>

      {diserahkan && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Catat hasil setelah surat diserahkan
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TINDAK_LANJUT_SOMASI.map((nilai) => (
              <Button
                key={nilai}
                type="button"
                variant={terbit?.tindakLanjut === nilai ? "default" : "outline"}
                size="sm"
                className={tombolKecil(
                  terbit?.tindakLanjut === nilai ? "" : "border-slate-200 bg-white",
                )}
                disabled={adaPekerjaan}
                aria-busy={sibuk === "tindak"}
                onClick={() => onTindakLanjut(nilai)}
              >
                {LABEL_TINDAK_LANJUT_SOMASI[nilai]}
              </Button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
            Catatan ini tidak memindahkan uang dan tidak mengubah tenor. Pembayaran tetap dicatat
            lewat jalur pinjaman; perpanjangan tenor lewat modul restrukturisasi.
          </p>
        </div>
      )}

      {kabar !== null && (
        <p role="status" className="mt-2 text-xs leading-5 text-emerald-700">
          {kabar}
        </p>
      )}
      {galat !== null && (
        <p role="alert" className="mt-2 text-xs leading-5 text-red-600">
          {galat}
        </p>
      )}

      {hasil.riwayatKirim.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
          {hasil.riwayatKirim.map((baris, indeks) => (
            <li
              key={`${baris.kanal}-${baris.pada}-${indeks}`}
              className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] leading-4"
            >
              <span className="font-medium text-slate-700">
                {baris.kanal === "whatsapp" ? "WhatsApp" : "Email"}
              </span>
              <span className="text-muted-foreground">ke {baris.tujuan}</span>
              <span className={warnaStatusKirim(baris.status)}>{labelStatusKirim(baris.status)}</span>
              <span className="text-muted-foreground">
                ·{" "}
                {formatTanggalWIB(baris.pada, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {baris.status === "gagal" && baris.respon !== null && (
                <span className="basis-full text-rose-600">{baris.respon}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {terbuka && (
        <article className="mt-3 max-h-[60vh] overflow-y-auto rounded-lg border border-slate-300 bg-[#fffdf7] px-5 py-6 text-slate-900 shadow-sm sm:px-8">
          <header className="border-b border-slate-300 pb-3">
            <p className="text-xs font-bold tracking-[0.18em] text-emerald-800">
              {surat.identitas.namaBadan}
            </p>
            <h3 className="mt-1 font-serif text-lg font-semibold">Surat Somasi</h3>
            <p className="mt-1 text-[11px] leading-5 text-slate-600">
              Nomor {surat.nomorSurat}
              <br />
              Tanggal {surat.tanggalTeks}
              {surat.identitas.alamat !== "" && (
                <>
                  <br />
                  {surat.identitas.alamat}
                </>
              )}
            </p>
          </header>

          <dl className="mt-4 grid gap-1 text-xs sm:grid-cols-[5.5rem_1fr]">
            <dt className="font-semibold text-slate-600">Kepada</dt>
            <dd>{surat.kepada}</dd>
            <dt className="font-semibold text-slate-600">Perihal</dt>
            <dd>{surat.perihal}</dd>
          </dl>

          <div className="mt-4 space-y-2 font-serif text-[13px] leading-6">
            {surat.paragraf.map((paragraf, indeks) => (
              <p key={`paragraf-${indeks}`}>{paragraf}</p>
            ))}
          </div>

          <dl className="mt-3 divide-y divide-slate-200 border-y border-slate-200 text-xs">
            {surat.rincian.map((baris, indeks) => (
              <div
                key={`${baris.label}-${indeks}`}
                className={`flex flex-wrap items-baseline justify-between gap-2 py-1.5 ${
                  indeks === surat.rincian.length - 1 ? "font-semibold" : ""
                }`}
              >
                <dt>{baris.label}</dt>
                <dd className="tabular-nums">{baris.nilai}</dd>
              </div>
            ))}
          </dl>

          <ol className="mt-3 list-decimal space-y-1 pl-5 font-serif text-[13px] leading-6">
            {surat.instruksiBayar.map((instruksi, indeks) => (
              <li key={`bayar-${indeks}`}>{instruksi}</li>
            ))}
          </ol>

          <div className="mt-4 space-y-2 font-serif text-[13px] leading-6">
            {surat.penutup.map((paragraf, indeks) => (
              <p key={`penutup-${indeks}`}>{paragraf}</p>
            ))}
          </div>

          <p className="mt-6 text-xs font-semibold">{surat.pembuat}</p>
          <p className="text-[10px] leading-4 text-slate-500">
            Dibuat {surat.tanggalTeks} melalui aplikasi PINDAI.
          </p>
        </article>
      )}
    </div>
  );
}

export function SuratSomasi({ loanId }: { loanId: Id<"loans"> }) {
  const data = useQuery(api.somasi.dataSomasi, { loanId });
  const unduh = useAction(api.somasi.unduhSomasi);
  const kirimWa = useAction(api.somasi.kirimSomasiWhatsapp);
  const kirimEmail = useAction(api.somasi.kirimSomasiEmail);
  const tandai = useMutation(api.somasi.tandaiSomasiDiserahkan);
  const batalTandai = useMutation(api.somasi.batalkanPenyerahanSomasi);
  const catatTindakLanjut = useMutation(api.somasi.catatTindakLanjutSomasi);

  const [terbuka, setTerbuka] = useState(false);
  const [sibuk, setSibuk] = useState<AksiSomasi | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const jalankan = async (aksi: AksiSomasi, kerja: () => Promise<string>) => {
    setSibuk(aksi);
    setKabar(null);
    setGalat(null);
    try {
      setKabar(await kerja());
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Tindakan gagal diselesaikan.");
    } finally {
      setSibuk(null);
    }
  };

  return (
    <BagianSuratSomasi
      hasil={data}
      terbuka={terbuka}
      sibuk={sibuk}
      kabar={kabar}
      galat={galat}
      onToggle={() => setTerbuka((nilai) => !nilai)}
      onUnduh={() =>
        void jalankan("unduh", async () => {
          const hasil = await unduh({ loanId });
          await simpanPdf(hasil.namaBerkas, hasil.base64);
          return `Surat ${hasil.nomorSurat} disimpan sebagai ${hasil.namaBerkas}.`;
        })
      }
      onSalin={() =>
        void jalankan("salin", async () => {
          if (data === undefined || !data.tersedia) throw new Error("Surat belum siap.");
          await navigator.clipboard.writeText(teksSomasi(data.surat));
          return "Teks surat disalin ke papan klip.";
        })
      }
      onKirim={(kanal) =>
        void jalankan(kanal, async () => {
          if (kanal === "whatsapp") {
            const hasil = await kirimWa({ loanId });
            return hasil.lampiran
              ? `Somasi dikirim ke WhatsApp ${hasil.tujuan} beserta PDF.`
              : `Somasi dikirim ke WhatsApp ${hasil.tujuan} sebagai teks; gateway belum mendukung lampiran.`;
          }
          const hasil = await kirimEmail({ loanId });
          return `Somasi dikirim ke email ${hasil.tujuan} beserta PDF.`;
        })
      }
      onSerahkan={() =>
        void jalankan("serahkan", async () => {
          await tandai({ loanId, melalui: "manual" });
          return "Surat ditandai sudah diserahkan langsung.";
        })
      }
      onBatalSerahkan={() =>
        void jalankan("batal", async () => {
          await batalTandai({ loanId });
          return "Tanda penyerahan dibatalkan.";
        })
      }
      onTindakLanjut={(nilai) =>
        void jalankan("tindak", async () => {
          const hasil = await catatTindakLanjut({ loanId, tindakLanjut: nilai });
          return `Tindak lanjut dicatat: ${hasil.label}.`;
        })
      }
    />
  );
}
