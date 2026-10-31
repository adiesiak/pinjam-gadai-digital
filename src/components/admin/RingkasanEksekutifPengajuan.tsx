/**
 * TIGA KOTAK RINGKAS (executive summary) untuk dialog review pengajuan admin.
 *
 * Kenapa dipisah dari `LoanReviewDialog`: peninjau perlu memutuskan dari satu
 * layar — nominal & tagihan, siapa nasabahnya, lalu tombolnya — tanpa menggulir
 * matriks, unggahan dokumen, dan riwayat. Tiga kotak inilah layar itu:
 *
 *   1. METRIK PENGAJUAN  — nominal, tenor, potongan di muka, bunga, total
 *      pelunasan, bank & nomor rekening tujuan. Angkanya datang dari
 *      `lib/rincianAliranDana` (mesin uang yang sama dengan ledger), bukan
 *      rumus yang ditulis ulang di JSX.
 *   2. PROFIL NASABAH    — nama, nomor WhatsApp, status KYC, skor integritas,
 *      plus tombol kecil menuju LAMPIRAN foto (KTP/selfie) berupa modal, supaya
 *      gambar dokumen tidak memenuhi layar review.
 *   3. AKSI ADMIN        — setujui, tolak, kirim notifikasi WhatsApp.
 *
 * Komponen di berkas ini sengaja PRESENTASIONAL (tanpa Convex/DOM): semua angka,
 * status, dan handler datang dari pemanggil. Itu membuat urutan keputusannya
 * bisa diuji sebagai markup (`RingkasanEksekutifPengajuan.render.test.tsx`)
 * tanpa perlu server — dan membuat `LoanReviewDialog` tetap fokus pada alur,
 * bukan pada tata letak.
 */
import { BadgeCheck, Coins, Loader2, MessageCircle, ShieldCheck, UserRound } from "lucide-react";

import { ChipSkorRisiko } from "@/components/penyediaDana/ChipSkorRisiko";
import { Button } from "@/components/ui/button";
import {
  LABEL_STATUS_KYC,
  NADA_STATUS_KYC,
  type StatusKyc,
} from "@/lib/kycStatus";
import { formatRupiah } from "@/lib/money";

import { LencanaGrade } from "./PanelRisikoNasabah";
import type { GradeRisiko } from "@/lib/risikoNasabah";

/** Bingkai kotak ringkas — satu permukaan kaca untuk ketiganya. */
const KOTAK =
  "flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs";

/** Judul kotak: ikon + label huruf besar, sama di ketiga kotak. */
function JudulKotak({
  ikon: Ikon,
  judul,
  keterangan,
}: {
  ikon: typeof Coins;
  judul: string;
  /** Satu kalimat pendek saja; rinciannya ada di panel di bawah. */
  keterangan?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/5 text-primary">
        <Ikon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {judul}
        </p>
        {keterangan !== undefined && (
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{keterangan}</p>
        )}
      </div>
    </div>
  );
}

/** Satu baris `label: nilai` di dalam kotak ringkas. */
export function BarisRingkas({
  label,
  nilai,
  nada = "biasa",
}: {
  label: string;
  nilai: string;
  /** `biasa` abu, `penting` navy tebal, `potongan` amber, `berhasil` petrol. */
  nada?: "biasa" | "penting" | "potongan" | "berhasil";
}) {
  const kelasNilai =
    nada === "potongan"
      ? "text-amber-700"
      : nada === "berhasil"
        ? "text-success-foreground"
        : "text-navy";
  // Angka uang adalah isi utama kotak ini: 16px tebal, sedangkan keterangan
  // pendukung (tenor, bank, rekening) tetap kecil supaya tidak bersaing.
  const kelasUkuran = nada === "biasa" ? "text-xs" : "text-base font-bold";
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <dt className="min-w-0 text-[11px] leading-4 text-muted-foreground">{label}</dt>
      {/* Nilai boleh turun ke baris sendiri dan dibungkus — nama panjang tidak
          lagi terpotong, sedangkan angka tetap utuh karena hanya pecah di spasi. */}
      <dd
        className={`ml-auto max-w-[70%] break-words text-right tabular-nums ${kelasUkuran} ${kelasNilai}`}
      >
        {nilai}
      </dd>
    </div>
  );
}

/** 1. METRIK PENGAJUAN — angka uang yang menentukan keputusan. */
export function KotakMetrikPengajuan({
  pokok,
  tenorTeks,
  potonganDiMuka,
  bunga,
  totalPelunasan,
  namaBank,
  nomorRekening,
}: {
  pokok: number;
  /** Tenor siap tampil (mis. "30 hari" / "3 bulan"). */
  tenorTeks: string;
  potonganDiMuka: number;
  bunga: number;
  totalPelunasan: number;
  namaBank: string | null;
  nomorRekening: string;
}) {
  return (
    <section className={KOTAK} aria-label="Metrik pengajuan">
      <JudulKotak ikon={Coins} judul="Metrik pengajuan" />
      <dl className="flex flex-col gap-1.5">
        <BarisRingkas label="Nominal pokok" nilai={formatRupiah(pokok)} nada="penting" />
        <BarisRingkas label="Tenor" nilai={tenorTeks} />
        <BarisRingkas
          label="Potongan di muka"
          nilai={formatRupiah(potonganDiMuka)}
          nada="potongan"
        />
        <BarisRingkas label="Bunga (Imbal Hasil)" nilai={formatRupiah(bunga)} />
        <BarisRingkas
          label="Total pelunasan"
          nilai={formatRupiah(totalPelunasan)}
          nada="berhasil"
        />
        <BarisRingkas label="Bank / e-wallet tujuan" nilai={namaBank ?? "Tidak dicatat"} />
        <BarisRingkas label="No. rekening tujuan" nilai={nomorRekening} />
      </dl>
    </section>
  );
}

/** 2. PROFIL NASABAH — identitas ringkas + pintu ke lampiran foto. */
export function KotakProfilNasabah({
  nama,
  nomorWhatsApp,
  statusKyc,
  skor,
  skorDinilai = true,
  grade,
  gradeSistem,
  gradeDitimpa = false,
  onLihatLampiran,
  lampiranSiap,
  jumlahLampiran = 0,
}: {
  nama: string;
  nomorWhatsApp: string | null;
  /** `null` = belum ada baris KYC untuk nasabah ini; `undefined` = masih dimuat. */
  statusKyc: StatusKyc | null | undefined;
  /** Skor integritas 0–100; `null` saat masih dimuat. */
  skor: number | null;
  /** false bila belum ada riwayat pinjaman (skor netral, bukan penilaian). */
  skorDinilai?: boolean;
  grade: GradeRisiko | null;
  gradeSistem?: GradeRisiko;
  gradeDitimpa?: boolean;
  onLihatLampiran: () => void;
  /** Lampiran hanya bisa dibuka setelah URL dokumen siap. */
  lampiranSiap: boolean;
  jumlahLampiran?: number;
}) {
  return (
    <section className={KOTAK} aria-label="Profil nasabah">
      <JudulKotak ikon={UserRound} judul="Profil nasabah" />
      <dl className="flex flex-col gap-1.5">
        <BarisRingkas label="Nama lengkap" nilai={nama} nada="penting" />
        <BarisRingkas label="No. WhatsApp" nilai={nomorWhatsApp ?? "Belum dicatat"} />
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[11px] leading-4 text-muted-foreground">Status KYC</dt>
          <dd className="shrink-0">
            {statusKyc === undefined ? (
              <span className="text-xs text-muted-foreground">Memuat…</span>
            ) : statusKyc === null ? (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                Belum ada KYC
              </span>
            ) : (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${NADA_STATUS_KYC[statusKyc]}`}
              >
                {statusKyc === "VERIFIED" && <BadgeCheck className="size-3" aria-hidden="true" />}
                {LABEL_STATUS_KYC[statusKyc]}
              </span>
            )}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[11px] leading-4 text-muted-foreground">Skor integritas</dt>
          <dd className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {skor === null ? (
              <span className="text-xs text-muted-foreground">Memuat…</span>
            ) : (
              <>
                <ChipSkorRisiko skor={skor} />
                {grade !== null && (
                  <LencanaGrade
                    grade={grade}
                    gradeSistem={gradeSistem}
                    ditimpa={gradeDitimpa}
                  />
                )}
                {!skorDinilai && (
                  <span className="text-[10px] leading-4 text-muted-foreground">
                    belum ada riwayat, skor netral
                  </span>
                )}
              </>
            )}
          </dd>
        </div>
      </dl>

      {/* Lampiran dibuka di MODAL, bukan ditempel di layar review: gambar
          dokumen besar mengambil ruang yang dibutuhkan angka & keputusan. */}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!lampiranSiap}
        onClick={onLihatLampiran}
        className="h-auto min-h-8 w-fit max-w-full gap-1.5 whitespace-normal rounded-lg px-2.5 py-1.5 text-left text-[11px]"
      >
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
        Lihat Lampiran Foto KTP/Selfie
        {lampiranSiap && jumlahLampiran > 0 ? ` (${jumlahLampiran})` : ""}
      </Button>
      {!lampiranSiap && (
        <p className="text-[10px] leading-4 text-muted-foreground">
          Lampiran dapat dibuka setelah data KYC selesai dimuat.
        </p>
      )}
    </section>
  );
}

/** 3. AKSI ADMIN — tiga keputusan utama, tanpa perlu menggulir. */
export function KotakAksiAdmin({
  onSetujui,
  onTolak,
  onKirimWa,
  busy,
  bolehSetujui,
  bolehTolak,
  bolehKirimWa,
  sudahLunas,
  setujuTerkunci,
  waTerkunci,
  labelSetujui = "Setujui Pengajuan",
}: {
  onSetujui: () => void;
  onTolak: () => void;
  onKirimWa: () => void;
  /** Label proses yang sedang berjalan (`null` = tidak ada). */
  busy: string | null;
  bolehSetujui: boolean;
  bolehTolak: boolean;
  bolehKirimWa: boolean;
  sudahLunas: boolean;
  /** Alasan singkat kenapa tombol setujui tidak tersedia. */
  setujuTerkunci?: string;
  /** Alasan singkat kenapa notifikasi WA tidak tersedia. */
  waTerkunci?: string;
  /**
   * Label tombol utama. Bawaannya "Setujui Pengajuan"; baris warisan yang
   * keputusannya sudah tercatat (`disetujui`) memakai "Tandai dana tersalurkan",
   * karena langkah yang tersisa bagi admin adalah pencairan, bukan persetujuan.
   */
  labelSetujui?: string;
}) {
  return (
    <section className={KOTAK} aria-label="Aksi admin">
      <JudulKotak
        ikon={MessageCircle}
        judul="Aksi admin"
        keterangan="Tercatat di Audit Trail."
      />
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          disabled={busy !== null || !bolehSetujui}
          onClick={onSetujui}
          className="w-full justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {busy === "setuju" ? <Loader2 className="size-4 animate-spin" /> : null}
          {labelSetujui}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null || !bolehTolak}
          onClick={onTolak}
          className="w-full justify-center gap-2 rounded-xl border-rose-200 text-sm font-medium text-rose-700 hover:bg-rose-50"
        >
          {busy === "tolak" ? <Loader2 className="size-4 animate-spin" /> : null}
          Tolak
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null || !bolehKirimWa}
          onClick={onKirimWa}
          className="w-full justify-center gap-2 rounded-xl border-primary/20 text-sm font-medium text-primary hover:bg-primary/5"
        >
          {busy === "wa" ? <Loader2 className="size-4 animate-spin" /> : null}
          <MessageCircle className="size-4" aria-hidden="true" />
          Kirim Notifikasi WA
        </Button>
      </div>
      {sudahLunas && (
        <p className="text-[11px] leading-4 text-muted-foreground">
          Pinjaman sudah lunas — tidak ada tindakan yang tersedia.
        </p>
      )}
      {!sudahLunas && setujuTerkunci !== undefined && (
        <p className="text-[11px] leading-4 text-muted-foreground">{setujuTerkunci}</p>
      )}
      {!sudahLunas && bolehSetujui && waTerkunci !== undefined && (
        <p className="text-[11px] leading-4 text-muted-foreground">{waTerkunci}</p>
      )}
    </section>
  );
}
