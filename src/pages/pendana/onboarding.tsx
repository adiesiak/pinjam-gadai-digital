import { useMutation } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  Coins,
  Eye,
  KeyRound,
  Landmark,
  Loader2,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";

/** Kartu informasi untuk peran yang tidak dapat menjadi Pendana. */
export function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <Coins className="mx-auto size-5 text-slate-400" />
      <h1 className="mt-4 text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/dashboard">
          <ArrowLeft className="mr-2 size-4" />
          Kembali
        </Link>
      </Button>
    </div>
  );
}

/**
 * Isi panel kepercayaan — HARUS mencerminkan yang benar-benar diterapkan
 * platform. Setiap poin di bawah ini ada implementasinya di kode (server-side,
 * bukan klaim marketing): lihat convex/security.ts, convex/lokasi.ts,
 * convex/pendana.ts, dan ledger append-only di convex/schema.ts.
 */
const KEAMANAN = [
  {
    ikon: ShieldCheck,
    judul: "Keamanan dana",
    poin: [
      "Jurnal keuangan append-only dan berpasangan (double-entry) — saldo tidak bisa diubah atau dihapus diam-diam.",
      "Setoran Anda diverifikasi tim terlebih dahulu; dana baru masuk dompet setelah transfer terkonfirmasi.",
      "Satu alokasi dicatat satu kali per pinjaman — dana tidak bisa dialokasikan ganda.",
      "Hak Imbal Hasil Anda tercatat per alokasi sejak hari pertama dan dibayarkan otomatis saat pelunasan.",
    ],
  },
  {
    ikon: KeyRound,
    judul: "Keamanan akun & transaksi",
    poin: [
      "Proteksi OTP WhatsApp: setiap alokasi dana dan penarikan wajib verifikasi kode ke nomor Anda.",
      "Autentikasi dua faktor (TOTP) opsional, batas 5 percobaan login per 15 menit per akun.",
      "Log login append-only — IP, perangkat, dan waktu setiap masuk tercatat.",
      "Anda bisa melihat dan mencabut sesi login di perangkat lain kapan saja.",
    ],
  },
  {
    ikon: MapPin,
    judul: "Verifikasi lokasi (live location)",
    poin: [
      "Peminjam wajib GPS aktif: server menolak pengajuan, cicilan, dan pelunasan tanpa titik lokasi segar (batas 10 menit).",
      "Anti-lokasi palsu: titik dari aplikasi fake GPS, akurasi mustahil (<1 m), dan lompatan kecepatan ditolak server.",
      "Koordinat yang dibekukan berulang kali ditandai — nasabah diberi peringatan, tim PINDAI menerima laporannya.",
      "Posisi Peminjam tampil di peta live admin dengan radius mismatch gudang — lokasi janggal terlihat cepat.",
    ],
  },
  {
    ikon: Eye,
    judul: "Transparansi & akuntabilitas",
    poin: [
      "Audit trail mencatat setiap keputusan review dan perubahan konfigurasi — bisa ditinjau kapan saja.",
      "Kontrak digital bertanda tangan elektronik mengatur objek pendanaan, hak Imbal Hasil, dan pencatatan.",
      "Pengingat jatuh tempo dan penagihan berjalan otomatis dan tercatat di log.",
      "Data lokasi dihapus otomatis setelah 90 hari (lebih lama hanya untuk bukti pinjaman berjalan) — prinsip minimalisasi UU PDP.",
    ],
  },
] as const;

/** Panel kepercayaan: apa yang PINDAI lakukan untuk melindungi Pendana. */
function PanelKepercayaan() {
  return (
    <section className="mx-auto mt-6 max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight">
        Mengapa dana Anda aman di PINDAI
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Kepercayaan tidak diminta — dibangun di atas mekanisme. Ini yang aktif
        di platform hari ini, ditegakkan di server (bukan sekadar janji di layar):
      </p>
      <div className="mt-6 space-y-6">
        {KEAMANAN.map(({ ikon: Ikon, judul, poin }) => (
          <div key={judul}>
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Ikon className="size-4" /> {judul}
            </p>
            <ul className="mt-2 space-y-2">
              {poin.map((p) => (
                <li key={p} className="flex gap-2.5 text-sm leading-6">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/70" />
                  <span className="text-muted-foreground">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-muted-foreground">
        PINDAI memitigasi risiko dengan KYC, verifikasi lokasi, dan kontrak
        digital — namun Imbal Hasil mengikuti kinerja pelunasan Peminjam dan
        bukan merupakan jaminan. Setiap pergerakan dana tetap dapat Anda audit
        sendiri dari riwayat dan kontrak di akun Anda.
      </p>
    </section>
  );
}

/** Onboarding: ajakan menjadi Pendana. */
export function Onboarding() {
  const becomePendana = useMutation(api.pendana.becomePendana);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <span className="flex size-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <Landmark className="size-5" strokeWidth={2} />
        </span>
        <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Peran Pendana
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sediakan dana, terima Imbal Hasil.</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Salurkan dana ke pinjaman yang sudah disetujui tim. Imbal Hasil Anda 30%
          dari porsi pokok pada skema harian, atau bunga menurun 10%/8%/7,5% per
          bulan pada skema bulanan (1–6 bulan) — dibayarkan saat Peminjam melunasi.
        </p>
        <ul className="mt-6 space-y-3 text-sm">
          {[
            ["Setoran terverifikasi", "Dana Anda masuk dompet setelah tim memverifikasi transfer."],
            ["Alokasi transparan", "Anda melihat sisa kebutuhan tiap pinjaman — tidak ada alokasi ganda."],
            ["Pencatatan ganda", "Setiap pergerakan dana tercatat berpasangan di jurnal append-only."],
          ].map(([t, b]) => (
            <li key={t} className="flex gap-3">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>
                <span className="font-medium">{t}</span>
                <span className="text-muted-foreground"> — {b}</span>
              </span>
            </li>
          ))}
        </ul>

        <Button
          className="mt-8 px-6"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
          await becomePendana({});
          toast.success("Selamat — Anda kini Pendana. Mulai dengan menyetor dana.");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Gagal mengubah peran.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Jadi Pendana
          <ArrowRight className="ml-1 size-4" />
        </Button>
      </div>

      <PanelKepercayaan />
    </div>
  );
}
