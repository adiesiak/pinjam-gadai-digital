import { useQuery } from "convex/react";
import { IdCard, Loader2, ShieldCheck, ShieldQuestion } from "lucide-react";
import { useState } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import { WatermarkedDoc } from "@/components/WatermarkedDoc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LABEL_STATUS_KYC, NADA_STATUS_KYC, type StatusKyc } from "@/lib/kycStatus";
import { formatRupiah } from "@/lib/money";
import { formatDate } from "./admin-format";

/**
 * DETAIL NASABAH (panel admin) — satu pintu yang memisahkan MASTER nasabah dari
 * TRANSAKSI pengajuan:
 *
 *  - MASTER: profil (data diri) + status KYC + plafon (maksimal/terpakai/tersedia)
 *    + profil risiko. Satu nasabah, satu KYC, satu plafon — apa pun jumlah
 *    pengajuan.
 *  - TRANSAKSI: riwayat pengajuan kronologis (#001, #002, …) dan riwayat
 *    pembayaran, semuanya dibaca dari database.
 *
 * Dokumen KYC TIDAK dimuat diam-diam: tombol "Lihat KYC" memanggil query
 * ber-otorisasi `kyc.detailKycAdmin` yang menuntut admin ber-TOTP, dan hanya
 * setelah diklik. URL dokumen bertanda tangan tidak pernah ikut di muatan awal.
 */
export function NasabahDetailDialog({
  userId,
  onClose,
}: {
  userId: Id<"users">;
  onClose: () => void;
}) {
  const [lihatKyc, setLihatKyc] = useState(false);
  const detail = useQuery(api.nasabah.detailNasabah, { userId });

  return (
    <Dialog
      open
      onOpenChange={(terbuka) => {
        if (!terbuka) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Profil Nasabah
            {detail?.kyc && (
              <Badge className={NADA_STATUS_KYC[detail.kyc.status as StatusKyc]}>
                <ShieldCheck className="size-3" />
                {LABEL_STATUS_KYC[detail.kyc.status as StatusKyc]}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Master nasabah (profil, KYC, plafon) dipisahkan dari transaksi
            pengajuan. Riwayat di bawah dibaca langsung dari database.
          </DialogDescription>
        </DialogHeader>

        {detail === undefined ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Memuat profil nasabah…
          </div>
        ) : detail === null ? (
          <p className="py-10 text-sm text-muted-foreground">Nasabah tidak ditemukan.</p>
        ) : (
          <div className="space-y-5">
            {/* ===== Kepala: identitas + ringkasan ===== */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-semibold text-navy">
                  {detail.nama.toUpperCase()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {detail.email ?? "tanpa email"}
                  {detail.kodePeminjam ? ` · kode ${detail.kodePeminjam}` : ""}
                  {detail.profil ? ` · NIK ${detail.profil.nik}` : " · data diri belum diisi"}
                </p>
              </div>
              <Badge
                className={
                  detail.profilRisiko.kategori === "TINGGI"
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : detail.profilRisiko.kategori === "BARU"
                      ? "border-slate-200 bg-slate-100 text-slate-600"
                      : "border-emerald-200 bg-emerald-100 text-emerald-700"
                }
              >
                Risiko {detail.profilRisiko.kategori} · {detail.profilRisiko.skor}/100
              </Badge>
            </div>

            {/* ===== Plafon master ===== */}
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kartu label="Plafon maksimal" nilai={formatRupiah(detail.plafon.maksimal)} />
              <Kartu
                label="Plafon terpakai"
                nilai={formatRupiah(detail.plafon.terpakai)}
                nada="text-amber-700"
              />
              <Kartu
                label="Plafon tersedia"
                nilai={formatRupiah(detail.plafon.tersedia)}
                nada="text-emerald-700"
              />
              <Kartu
                label="Bunga efektif"
                nilai={`${String(detail.plafon.persenBungaEfektif).replace(".", ",")}%`}
              />
            </section>
            <p className="text-[11px] leading-4 text-muted-foreground">
              Plafon maksimal {detail.plafon.plafonPribadi === null ? "mengikuti default/riwayat" : `khusus ${formatRupiah(detail.plafon.plafonPribadi)}`}.
              {detail.plafon.jumlahAktif > 0
                ? ` ${detail.plafon.jumlahAktif} pinjaman aktif menahan plafon terpakai.`
                : " Tidak ada pinjaman aktif yang menahan plafon."}
            </p>

            {/* ===== Ringkasan pinjaman ===== */}
            <section className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <Kartu kecil label="Pengajuan" nilai={`${detail.ringkasan.jumlahPengajuan}`} />
              <Kartu kecil label="Aktif" nilai={`${detail.ringkasan.pinjamanAktif}`} />
              <Kartu kecil label="Lunas" nilai={`${detail.ringkasan.pinjamanLunas}`} />
              <Kartu kecil label="Ditolak" nilai={`${detail.ringkasan.pinjamanDitolak}`} />
              <Kartu kecil label="Terlambat" nilai={`${detail.ringkasan.pinjamanTerlambat}`} />
              <Kartu kecil label="Tepat waktu" nilai={`${detail.ringkasan.pelunasanTepatWaktu}`} />
            </section>

            {/* ===== Profil risiko ===== */}
            <section className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Penilaian risiko nasabah
              </p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {detail.profilRisiko.faktor.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
                Skor ini alat bantu tampilan dari riwayat tersimpan — bukan keputusan
                otomatis, dan tetap ditinjau petugas.
              </p>
            </section>

            {/* ===== Lihat KYC (opt-in, ber-otorisasi) ===== */}
            <section className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-navy">KYC nasabah</p>
                  <p className="text-xs text-muted-foreground">
                    KYC terhubung ke nasabah — satu status, bukan salinan per pengajuan.
                    Membuka dokumen butuh otorisasi server.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLihatKyc((v) => !v)}
                >
                  <IdCard className="mr-1.5 size-4" />
                  {lihatKyc ? "Tutup KYC" : "Lihat KYC"}
                </Button>
              </div>
              {lihatKyc && <KycNasabah userId={userId} />}
            </section>

            {/* ===== Riwayat pengajuan (kronologis) ===== */}
            <section>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Riwayat pengajuan
              </p>
              {detail.riwayatPengajuan.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Belum ada pengajuan.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {detail.riwayatPengajuan.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-navy">
                          #{String(r.nomorUrut).padStart(3, "0")} · {formatRupiah(r.pokokPinjaman)}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {r.nomorReferensi} · tenor{" "}
                            {r.tenorBulan !== null ? `${r.tenorBulan} bulan` : `${r.tenorHari} hari`}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Diajukan {formatDate(r.diajukanPada)}
                          {r.didanaiPada ? ` · cair ${formatDate(r.didanaiPada)}` : ""}
                          {r.lunasPada ? ` · lunas ${formatDate(r.lunasPada)}` : ""}
                          {r.hariTerlambat > 0 ? ` · terlambat ${r.hariTerlambat} hari` : ""}
                          {r.kycStatusSaatPengajuan
                            ? ` · KYC saat itu ${LABEL_STATUS_KYC[r.kycStatusSaatPengajuan as StatusKyc]}`
                            : ""}
                        </p>
                      </div>
                      <StatusBadge status={r.status} kind="loan" />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ===== Riwayat pembayaran ===== */}
            <section>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Riwayat pembayaran
              </p>
              {detail.riwayatPembayaran.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Belum ada pembayaran tercatat.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                  {detail.riwayatPembayaran.map((p, i) => (
                    <li
                      key={`${p.jenis}-${p.referensi}-${i}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                    >
                      <span className="text-muted-foreground">
                        {formatDate(p.waktu)} · {p.label}
                      </span>
                      <span className="tabular-nums font-medium text-navy">
                        {formatRupiah(p.jumlah)}
                        <span className="ml-2 font-normal text-muted-foreground">{p.status}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Muatan KYC ber-otorisasi — hanya dipanggil setelah tombol "Lihat KYC". */
function KycNasabah({ userId }: { userId: Id<"users"> }) {
  const kyc = useQuery(api.kyc.detailKycAdmin, { userId });
  if (kyc === undefined) {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Memuat KYC…
      </div>
    );
  }
  if (kyc === null) {
    return <p className="mt-3 text-xs text-muted-foreground">Nasabah ini belum memulai KYC.</p>;
  }
  const dok = (
    [
      ["Foto KTP", kyc.url.ktp],
      ["Selfie dengan KTP", kyc.url.selfie],
      ["Bukti penghasilan", kyc.url.buktiPenghasilan],
    ] as const
  ).flatMap(([label, url]) => (url === null ? [] : [{ label, url }]));
  return (
    <div className="mt-3 space-y-2">
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <ShieldQuestion className="size-3.5" />
        Status {LABEL_STATUS_KYC[kyc.status]}
        {kyc.kekurangan.length > 0 ? ` · kekurangan: ${kyc.kekurangan.join(", ")}` : " · isian lengkap"}
      </p>
      {dok.length === 0 ? (
        <p className="text-xs text-muted-foreground">Belum ada dokumen yang diunggah.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          {dok.map((d) => (
            <WatermarkedDoc key={d.label} src={d.url} label={d.label} />
          ))}
        </div>
      )}
    </div>
  );
}

function Kartu({
  label,
  nilai,
  nada,
  kecil = false,
}: {
  label: string;
  nilai: string;
  nada?: string;
  kecil?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className={`tabular-nums font-semibold ${kecil ? "text-xs" : "text-sm"} ${nada ?? "text-navy"}`}>
        {nilai}
      </p>
    </div>
  );
}
