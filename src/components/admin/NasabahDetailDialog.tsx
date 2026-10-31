import { useQuery } from "convex/react";
import {
  Activity,
  History,
  IdCard,
  Loader2,
  Phone,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";

import { StatusBadge } from "@/components/StatusBadge";
import { WatermarkedDoc } from "@/components/WatermarkedDoc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LABEL_STATUS_KYC, NADA_STATUS_KYC, type StatusKyc } from "@/lib/kycStatus";
import { formatRupiah } from "@/lib/money";
import { formatDate } from "./admin-format";
import { TombolMasukSebagai } from "./MasukSebagaiDialog";
import { KycAuditRingkas } from "./KycPanel";
import { PanelRisikoNasabah } from "./PanelRisikoNasabah";
import { PengaturanNotifikasiNasabah } from "./PengaturanNotifikasiNasabah";

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
 * SUSUNAN DUA KOLOM (`max-w-3xl`): kolom kiri memuat hal-hal yang menjelaskan
 * SIAPA orangnya (informasi personal, kontak WA & pekerjaan, dokumen KTP/KYC),
 * kolom kanan memuat hal-hal yang menjelaskan SEBERAPA AMAN dia (grade risiko,
 * statistik pinjaman, riwayat pelunasan). Jadi keputusan tidak perlu menggulir
 * bolak-balik: identitas dan penilaian selalu berdampingan.
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
  const navigate = useNavigate();

  return (
    <Sheet
      open
      onOpenChange={(terbuka) => {
        if (!terbuka) onClose();
      }}
    >
      {/* Profil nasabah dibuka sebagai panel samping, bukan modal 3xl: daftar
          nasabah di belakangnya tetap terbaca, dan isi panjang tidak terjebak
          di dialog sempit. `overflow-x-hidden` hanya mencegah gulir mendatar
          dari nomor referensi yang panjang. */}
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-x-hidden overflow-y-auto border-l border-slate-200 bg-white px-4 pb-8 sm:w-[50vw] sm:max-w-none sm:px-6 xl:w-[46vw]"
      >
        <SheetHeader className="px-0 pt-4 pb-2 pr-10">
          <SheetTitle className="flex flex-wrap items-center gap-2">
            Profil &amp; Data Diri
            {detail?.kyc && (
              <Badge className={NADA_STATUS_KYC[detail.kyc.status as StatusKyc]}>
                <ShieldCheck className="size-3" />
                {LABEL_STATUS_KYC[detail.kyc.status as StatusKyc]}
              </Badge>
            )}
            {detail && detail.risiko && (
              <Badge
                className={
                  detail.risiko.gradeEfektif === "D" || detail.risiko.gradeEfektif === "E"
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : detail.risiko.gradeEfektif === "C"
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-success-border bg-success-soft text-success-foreground"
                }
              >
                Risiko {detail.profilRisiko.kategori} · grade {detail.risiko.gradeEfektif} ·{" "}
                {detail.profilRisiko.skor}/100
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            Master nasabah (profil, KYC, plafon) dipisahkan dari transaksi pengajuan. Riwayat di
            bawah dibaca langsung dari database.
          </SheetDescription>
        </SheetHeader>

        {detail === undefined ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Memuat profil nasabah…
          </div>
        ) : detail === null ? (
          <p className="py-10 text-sm text-muted-foreground">Nasabah tidak ditemukan.</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-xs leading-5 text-amber-950">
                Buka dashboard nasabah ini. "Masuk sebagai" memakai sesi nyata akunnya
                sehingga tampilannya persis seperti yang ia lihat; "Lihat ringkas" hanya
                menampilkan ringkasan baca-saja. Keduanya dicatat di audit trail.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {detail.role !== "admin" && (
                  <TombolMasukSebagai
                    targetId={userId}
                    nama={detail.nama}
                    tujuan="dashboard nasabah"
                  />
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={detail.role === "admin"}
                  onClick={() => navigate(`/dashboard?lihatNasabah=${encodeURIComponent(userId)}`)}
                >
                  Lihat ringkas
                </Button>
              </div>
            </div>
            {/* ===== Kepala: identitas ===== */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-semibold text-navy">{detail.nama.toUpperCase()}</p>
                <p className="text-xs text-muted-foreground">
                  {detail.email ?? "tanpa email"}
                  {detail.kodePeminjam ? ` · kode ${detail.kodePeminjam}` : ""}
                </p>
              </div>
              <Badge
                className={
                  detail.profil === null
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-slate-100 text-slate-600"
                }
              >
                {detail.profil === null ? "data diri belum diisi" : `data diri ${detail.profil.sumber ?? "manual"}`}
              </Badge>
            </div>

            {/* ===== Grid dua kolom: SIAPA (kiri) & SEBERAPA AMAN (kanan) ===== */}
            <div className="grid gap-4 lg:grid-cols-2">
              {/* ── KOLOM KIRI ── */}
              <div className="min-w-0 space-y-3">
                <KartuKolom
                  icon={<IdCard className="size-4" />}
                  judul="Informasi personal"
                  keterangan="Identitas dasar yang tercatat di master nasabah."
                >
                  <dl className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
                    <Kartu label="Nama lengkap" nilai={detail.profil?.namaLengkap ?? detail.nama} />
                    <Kartu label="NIK" nilai={detail.profil?.nik ?? "—"} />
                    <Kartu
                      label="Diperbarui"
                      nilai={
                        detail.profil === null ? "—" : formatDate(detail.profil.diperbaruiPada)
                      }
                    />
                    <Kartu label="Kode peminjam" nilai={detail.kodePeminjam ?? "—"} />
                  </dl>
                </KartuKolom>

                <KartuKolom
                  icon={<Phone className="size-4" />}
                  judul="Kontak WA & pekerjaan"
                  keterangan="Dipakai tim untuk penagihan dan verifikasi penghasilan."
                >
                  <dl className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
                    <Kartu label="Nomor WhatsApp" nilai={detail.profil?.nomorWhatsApp ?? "—"} />
                    <Kartu label="Pekerjaan" nilai={detail.profil?.pekerjaan ?? "—"} />
                    <Kartu
                      label="Penghasilan / bulan"
                      nilai={
                        detail.profil?.penghasilanBulanan == null
                          ? "—"
                          : formatRupiah(detail.profil.penghasilanBulanan)
                      }
                    />
                    <Kartu
                      label="Rekening"
                      nilai={
                        detail.profil?.nomorRekening == null
                          ? "—"
                          : `${detail.profil.namaBank ?? "Bank"} · ${detail.profil.nomorRekening}`
                      }
                    />
                  </dl>
                  {detail.profil?.alamat != null && (
                    <p className="text-[11px] leading-4 text-muted-foreground">
                      Alamat: {detail.profil.alamat}
                    </p>
                  )}
                </KartuKolom>

                {/* Dokumen KTP/KYC — opt-in, ber-otorisasi server. */}
                <KartuKolom
                  icon={<ShieldCheck className="size-4" />}
                  judul="Foto KTP & dokumen KYC"
                  keterangan="KYC terhubung ke nasabah — satu status, bukan salinan per pengajuan."
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge
                      className={
                        detail.profil?.adaFotoKtp
                          ? "border-success-border bg-success-soft text-success-foreground"
                          : "border-amber-200 bg-amber-100 text-amber-800"
                      }
                    >
                      {detail.profil?.adaFotoKtp ? "foto KTP tersimpan" : "foto KTP belum ada"}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => setLihatKyc((v) => !v)}>
                      <IdCard className="mr-1.5 size-4" />
                      {lihatKyc ? "Tutup KYC" : "Lihat KYC"}
                    </Button>
                  </div>
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    Membuka dokumen butuh otorisasi server dan hanya dipanggil setelah tombol ini
                    ditekan.
                  </p>
                  {lihatKyc && <KycNasabah userId={userId} />}
                </KartuKolom>
              </div>

              {/* ── KOLOM KANAN ── */}
              <div className="min-w-0 space-y-3">
                {/* Skor risiko: grade sistem + override berjejak. */}
                <section className="rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Skor risiko
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`flex size-9 items-center justify-center rounded-xl border text-sm font-bold ${
                        detail.risiko.gradeEfektif === "D" || detail.risiko.gradeEfektif === "E"
                          ? "border-destructive/30 bg-destructive/10 text-destructive"
                          : detail.risiko.gradeEfektif === "C"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-success-border bg-success-soft text-success-foreground"
                      }`}
                      aria-label={`Grade risiko ${detail.risiko.gradeEfektif}`}
                    >
                      {detail.risiko.gradeEfektif}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-navy">
                        {detail.profilRisiko.kategori} · {detail.profilRisiko.skor}/100
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {detail.profilRisiko.dinilai
                          ? "Dinilai dari riwayat pinjaman PINDAI."
                          : "Belum ada riwayat — skor netral, bukan penalti."}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <PanelRisikoNasabah
                      userId={userId}
                      dinilai={detail.profilRisiko.dinilai}
                      skor={detail.profilRisiko.skor}
                      komponen={detail.profilRisiko.komponen}
                      risiko={detail.risiko}
                      riwayatOverride={detail.riwayatOverrideRisiko}
                    />
                  </div>
                </section>

                {/* Statistik pinjaman + plafon master. */}
                <KartuKolom
                  icon={<Activity className="size-4" />}
                  judul="Statistik pinjaman & plafon"
                  keterangan="Angka master plafon dan hitungan riwayat nasabah."
                >
                  <dl className="grid grid-cols-3 gap-2">
                    <Kartu kecil label="Pengajuan" nilai={`${detail.ringkasan.jumlahPengajuan}`} />
                    <Kartu kecil label="Aktif" nilai={`${detail.ringkasan.pinjamanAktif}`} />
                    <Kartu kecil label="Lunas" nilai={`${detail.ringkasan.pinjamanLunas}`} />
                    <Kartu kecil label="Ditolak" nilai={`${detail.ringkasan.pinjamanDitolak}`} />
                    <Kartu kecil label="Terlambat" nilai={`${detail.ringkasan.pinjamanTerlambat}`} />
                    <Kartu
                      kecil
                      label="Tepat waktu"
                      nilai={`${detail.ringkasan.pelunasanTepatWaktu}`}
                    />
                  </dl>
                  <dl className="mt-2 grid grid-cols-2 gap-2">
                    <Kartu label="Plafon maksimal" nilai={formatRupiah(detail.plafon.maksimal)} />
                    <Kartu
                      label="Plafon terpakai"
                      nilai={formatRupiah(detail.plafon.terpakai)}
                      nada="text-amber-700"
                    />
                    <Kartu
                      label="Plafon tersedia"
                      nilai={formatRupiah(detail.plafon.tersedia)}
                      nada="text-success-foreground"
                    />
                  </dl>
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    Plafon maksimal{" "}
                    {detail.plafon.plafonPribadi === null
                      ? "mengikuti default/riwayat"
                      : `khusus ${formatRupiah(detail.plafon.plafonPribadi)}`}
                    .
                    {detail.plafon.jumlahAktif > 0
                      ? ` ${detail.plafon.jumlahAktif} pinjaman aktif menahan plafon terpakai.`
                      : " Tidak ada pinjaman aktif yang menahan plafon."}{" "}
                    Bunga pinjaman mengikuti tenor 7/14/21/28 hari dan tidak berubah karena plafon.
                  </p>
                </KartuKolom>

                {/* Riwayat pelunasan & pembayaran. */}
                <KartuKolom
                  icon={<History className="size-4" />}
                  judul="Riwayat pelunasan"
                  keterangan="Pembayaran manual dan pelunasan yang tercatat di ledger internal."
                >
                  {detail.riwayatPembayaran.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Belum ada pembayaran tercatat.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
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
                            <span className="ml-2 font-normal text-muted-foreground">
                              {p.status}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </KartuKolom>
              </div>
            </div>

            {/* ===== Notifikasi per nasabah — lebar penuh ===== */}
            <PengaturanNotifikasiNasabah userId={userId} />

            {/* ===== Riwayat pengajuan (kronologis) — lebar penuh ===== */}
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
          </div>
        )}
      </SheetContent>
    </Sheet>
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
      {/* Riwayat audit MELEKAT di sini, bukan hanya di tab Audit Trail: tab itu
          menampilkan aksi admin terbaru secara global, jadi aksi atas satu
          nasabah tenggelam di antara puluhan aksi lain. Datanya sudah ikut
          dikirim `detailKycAdmin` (indeks `auditLog.by_target`), jadi bagian ini
          tidak menambah query baru. Diciutkan agar 20 baris tidak mendorong
          tombol keputusan jauh ke bawah. */}
      <details className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold text-slate-700">
          Riwayat audit nasabah ({kyc.audit.length})
        </summary>
        <p className="mb-2 mt-1.5 text-[11px] leading-4 text-muted-foreground">
          Maksimal 20 aksi terakhir yang menyentuh data nasabah ini, termasuk dari
          modul lain (KYC, data diri, risiko).
        </p>
        <KycAuditRingkas audit={kyc.audit} />
      </details>
    </div>
  );
}

/** Satu kolom berjudul di dalam grid dua kolom dialog profil. */
function KartuKolom({
  icon,
  judul,
  keterangan,
  children,
}: {
  icon: ReactNode;
  judul: string;
  keterangan: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-primary">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-navy">{judul}</p>
          <p className="text-[11px] leading-4 text-muted-foreground">{keterangan}</p>
        </div>
      </div>
      <div className="mt-2.5 space-y-2">{children}</div>
    </section>
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
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p
        className={`break-words tabular-nums font-semibold ${kecil ? "text-xs" : "text-sm"} ${nada ?? "text-navy"}`}
      >
        {nilai}
      </p>
    </div>
  );
}
