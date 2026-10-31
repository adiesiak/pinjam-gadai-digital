import { useAction, useQuery } from "convex/react";
import { Loader2, MapPin, Send, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PenampilDokumen } from "./PenampilDokumen";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { LABEL_STATUS_KYC, type StatusKyc } from "@/lib/kycStatus";
import { formatRupiah } from "@/lib/money";
import { formatWaktuWIB } from "@/lib/waktu";

import { formatDate } from "./admin-format";
import { type LoanRow } from "./admin-shared";
import { NasabahDetailDialog } from "./NasabahDetailDialog";

/**
 * Panel data pengajuan, koordinat perangkat, dan pesan WhatsApp terkait catatan aplikasi.
 */
export function LoanKycPanel({ row }: { row: LoanRow }) {
  const urls = useQuery(api.admin.dokumenKycUrls, { loanId: row._id });
  const sendWa = useAction(api.whatsapp.sendReminder);
  const [waBusy, setWaBusy] = useState(false);
  /** Nasabah pemilik pengajuan yang profil lengkapnya sedang dibuka. */
  const [profilTarget, setProfilTarget] = useState<Id<"users"> | null>(null);

  const lokasi = row.lokasiAjukan;
  const petaHref = lokasi
    ? `https://www.openstreetmap.org/?mlat=${lokasi.lat}&mlon=${lokasi.lng}#map=16/${lokasi.lat}/${lokasi.lng}`
    : null;

  const kirim = async () => {
    setWaBusy(true);
    try {
      await sendWa({ loanId: row._id });
      toast.success("Pesan WhatsApp terkirim; log aplikasi diperbarui.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengirim pengingat.");
    } finally {
      setWaBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Data pengajuan peminjam
      </p>
      <p className="text-xs leading-5 text-muted-foreground">
        NIK, foto, selfie, slip, dan koordinat adalah data yang diunggah/dikirim ke aplikasi. Peninjauan keaslian dokumen, penghasilan, dan lokasi dilakukan tim PINDAI melalui panel ini.
      </p>
      {/* MASTER vs TRANSAKSI: profil, KYC, plafon, dan riwayat NASABAH (bukan
          salinan dokumen per pengajuan) dibuka eksplisit lewat tombol ini. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setProfilTarget(row.userIdPeminjam)}>
          <Users className="mr-1.5 size-4" /> Lihat Profil Nasabah
        </Button>
        <span className="text-[11px] leading-4 text-muted-foreground">
          KYC terhubung ke nasabah (satu status), bukan ke pengajuan ini.
        </span>
      </div>
      {profilTarget !== null && (
        <NasabahDetailDialog userId={profilTarget} onClose={() => setProfilTarget(null)} />
      )}

      <RingkasPengajuan loanId={row._id} />
      {urls === undefined ? (
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat data KYC…
        </div>
      ) : urls === null ? (
        <p className="text-sm text-muted-foreground">Data KYC tidak ditemukan untuk pinjaman ini.</p>
      ) : (
        <div className="animate-masuk flex flex-col gap-3">
          <div className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            <p className="text-muted-foreground">
              NIK: <span className="tabular-nums text-navy">{urls.nik ?? "—"}</span>
            </p>
            <p className="text-muted-foreground">
              WhatsApp: <span className="tabular-nums text-navy">{urls.nomorWhatsApp ?? "—"}</span>
            </p>
            <p className="text-muted-foreground">
              Penghasilan: <span className="tabular-nums text-navy">{urls.penghasilanBulanan !== null ? formatRupiah(urls.penghasilanBulanan) : "—"}</span>
            </p>
            <p className="text-muted-foreground">
              Sumber: <span className="text-navy">{urls.sumberPenghasilan ?? "—"}</span>
            </p>
          </div>
          {/* Penampil ber-zoom: peninjau harus bisa memperbesar NIK/nama bank
            sebelum memutuskan — lihat `PenampilDokumen`.

            Tiga dokumen (NIK, selfie, slip) disusun rapat tiga kolom tanpa gulir
            horizontal. Tiap sel memakai kursor & pembesaran halus saat disorot,
            jadi jelas bahwa fotonya bisa dibuka — bukan sekadar gambar diam. */}
          <div className="grid grid-cols-3 gap-3">
            {([
              ["KTP", urls.ktpUrl],
              ["Selfie + KTP", urls.selfieUrl],
              ["Slip gaji", urls.slipUrl],
              ["Kartu Keluarga", urls.kartuKeluargaUrl],
              ["Bukti domisili", urls.buktiDomisiliUrl],
            ] as const).map(([label, url]) =>
              url ? (
                <div
                  key={label}
                  className="cursor-pointer transition-transform duration-[var(--motion-normal)] hover:scale-105"
                >
                  <PenampilDokumen src={url} label={label} />
                </div>
              ) : (
                <span
                  key={label}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-muted-foreground"
                >
                  {label} tidak tersedia
                </span>
              ),
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <MapPin className="size-3.5 text-primary" /> Koordinat perangkat yang dicatat saat pengajuan
            </p>
            {lokasi ? (
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {lokasi.lat.toFixed(5)}, {lokasi.lng.toFixed(5)} · ±{Math.round(lokasi.akurasi)} m · metadata perangkat
                {petaHref && (
                  <>
                    {" · "}
                    <a href={petaHref} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">
                      Buka peta
                    </a>
                  </>
                )}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Tidak ada (pengajuan sebelum fitur lokasi).</p>
            )}
          </div>
          <RiwayatLokasiMini userId={row.userIdPeminjam} />
          {row.nomorWhatsApp && (
            <div className="space-y-2">
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                Tombol ini langsung mengirim template aktif ke nomor yang tersimpan (tidak menampilkan draf terlebih dahulu). Periksa dan ubah template di tab WhatsApp sebelum mengirim; nomor dan identitas mengikuti pengisian pengajuan. Nilai/tanggal ledger hanya catatan internal.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={waBusy} onClick={kirim}>
                  {waBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
                  Kirim template WhatsApp
                </Button>
                <a
                  href={`https://wa.me/${row.nomorWhatsApp}?text=${encodeURIComponent(
                    `Halo. Pesan ini merujuk pada catatan aplikasi PINDAI ${row.nomorReferensi}: angka kewajiban ${formatRupiah(row.totalKewajibanDenganPenalti ?? 0)}${(row.hariTerlambat ?? 0) > 0 ? ` dan denda ${formatRupiah(row.dendaTerlambat ?? 0)} dengan jatuh tempo terlewati ${row.hariTerlambat ?? 0} hari` : ""}. Angka dan status ini hanya catatan internal aplikasi; bukan tagihan, tunggakan terverifikasi, bukti transfer, atau kewajiban pembayaran aktual. Untuk pertanyaan, gunakan kanal resmi PINDAI yang sudah Anda konfirmasi.`,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 hover:bg-primary/90"
                >
                  <Send className="size-4" /> Tinjau draf WA
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Ringkasan DETAIL PENGAJUAN dari master: nomor, nasabah, status KYC, nominal,
 * tenor, dana bersih, kewajiban, status, pendanaan, pencairan, pembayaran, dan
 * keterlambatan. Dibaca dari query khusus (`nasabah.detailPengajuan`) yang
 * menghitung nilai dari SNAPSHOT baris pinjaman — bukan dari tarif hari ini.
 */
function RingkasPengajuan({ loanId }: { loanId: Id<"loans"> }) {
  const detail = useQuery(api.nasabah.detailPengajuan, { loanId });
  if (detail === undefined || detail === null) return null;
  const baris: Array<[string, string]> = [
    ["Nomor pengajuan", detail.nomorReferensi],
    ["Nasabah", detail.nasabah.nama.toUpperCase()],
    [
      "Status KYC",
      detail.kyc ? LABEL_STATUS_KYC[detail.kyc.status as StatusKyc] : "Belum ada KYC",
    ],
    ["Nominal disetujui", formatRupiah(detail.nominal)],
    [
      "Tenor",
      detail.tenorBulan !== null ? `${detail.tenorBulan} bulan` : `${detail.tenorHari} hari`,
    ],
    ["Dana bersih", formatRupiah(detail.finansial.danaBersih)],
    ["Total kewajiban", formatRupiah(detail.finansial.totalKewajibanPelunasan)],
    ["Kewajiban saat ini", detail.kewajibanSaatIni === null ? "—" : formatRupiah(detail.kewajibanSaatIni)],
    ["Pencairan", detail.didanaiPada === null ? "Belum cair" : formatDate(detail.didanaiPada)],
    [
      "Pendanaan",
      detail.pendanaan.totalDisalurkan > 0
        ? `${formatRupiah(detail.pendanaan.totalDisalurkan)}${detail.pendanaan.pendanaNama ? ` · ${detail.pendanaan.pendanaNama}` : ""}`
        : "Belum ada alokasi dana",
    ],
    ["Pembayaran tercatat", `${detail.pembayaran.length} bukti`],
    [
      "Keterlambatan",
      detail.hariTerlambat > 0
        ? `${detail.hariTerlambat} hari · denda ${formatRupiah(detail.dendaTerlambat)}`
        : "Tidak ada",
    ],
  ];
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Detail pengajuan (master)
      </p>
      <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
        {baris.map(([label, nilai]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium tabular-nums text-navy">{nilai}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** 5 titik lokasi terakhir peminjam — ringkasan untuk reviewer. */
function RiwayatLokasiMini({ userId }: { userId: Id<"users"> }) {
  const riwayat = useQuery(api.tracking.riwayatAdmin, { userId, limit: 5 });
  if (riwayat === undefined) return null;
  if (riwayat.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Belum ada jejak lokasi berkelanjutan dari peminjam ini.
      </p>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <p className="text-xs font-medium">Koordinat perangkat yang tercatat ({riwayat.length})</p>
      <ul className="mt-1.5 space-y-1">
        {riwayat.map((t) => (
          <li key={t._id} className="text-xs tabular-nums text-muted-foreground">
            {formatWaktuWIB(t.waktu)} WIB · {t.lat.toFixed(5)}, {t.lng.toFixed(5)} · ±{Math.round(t.akurasi)} m
          </li>
        ))}
      </ul>
    </div>
  );
}
