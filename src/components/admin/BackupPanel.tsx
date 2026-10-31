import type { FunctionReturnType } from "convex/server";
import { useConvex, useMutation, useQuery } from "convex/react";
import { Database, FileDown, Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { LABEL_JUMLAH, SUMBER_DOKUMEN, TABEL_SNAPSHOT } from "@/lib/backupTabel";
import { cetakLewatAplikasi } from "@/lib/jembatanAndroid";
import { formatWaktuWIB } from "@/lib/waktu";

/**
 * Escape teks sebelum ditempel ke HTML yang dirender di tab baru.
 * Wajib: isi audit/ledger memuat data yang diisi pengguna (nama, referensi),
 * dan tab hasil `window.open("", "_blank")` mewarisi origin aplikasi — tanpa
 * escape, satu isian berisi tag/script bisa berjalan dengan sesi admin.
 */
function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

/**
 * Sel CSV aman: kutip ganda di-escape dan sel yang diawali `=`, `+`, `-`, `@`,
 * tab, atau CR diberi awalan `'` supaya tidak dieksekusi sebagai formula saat
 * file dibuka di Excel/Spreadsheet.
 */
function csvCell(value: unknown): string {
  const teks = String(value ?? "");
  const aman = /^[=+\-@\t\r]/.test(teks) ? `'${teks}` : teks;
  return `"${aman.replace(/"/g, '""')}"`;
}

/** Satu halaman arsip ledger — bentuknya ditentukan query server. */
type HalamanLedger = FunctionReturnType<typeof api.admin.ledgerRows>;

/** Satu halaman tabel snapshot (bentuknya ditentukan query server). */
type HalamanBagian = { baris: unknown[]; kursor: string | null };

/** Satu halaman tautan dokumen untuk berkas backup. */
type HalamanDokumen = { dokumen: unknown[]; kursor: string | null };

export function BackupPanel() {
  /**
   * Snapshot dan ledger diambil SAAT tombol ditekan (`klien.query`), bukan lewat
   * `useQuery`.
   *
   * Query reaktif membaca seluruh tabel database setiap kali ada satu tulisan
   * masuk — untuk setiap admin yang membuka tab ini, sebelum satu berkas pun
   * diminta. Untuk arsip sebesar itu pemborosan yang bisa menembus batas baca
   * Convex. Ekspornya sendiri tetap utuh: ledger dibaca halaman demi halaman,
   * dan snapshot diambil sekali saat diunduh.
   */
  const klien = useConvex();
  const auditData = useQuery(api.system.getConfigAdmin);
  const backupTerakhir = useQuery(api.system.backupTerakhir);
  const catat = useMutation(api.system.catatBackup);
  const backfillKode = useMutation(api.admin.backfillKodePeminjam);
  const backfillBerkasKyc = useMutation(api.kyc.backfillMetadataBerkas);
  const [busy, setBusy] = useState<string | null>(null);
  /** Jumlah tabel yang sudah terbaca saat snapshot JSON disusun. */
  const [tabelJson, setTabelJson] = useState<number | null>(null);
  const [kodePeminjamDiterbitkan, setKodePeminjamDiterbitkan] = useState<number | null>(null);
  const [metadataBerkasDilengkapi, setMetadataBerkasDilengkapi] = useState<number | null>(null);

  const unduhFile = (nama: string, isi: string, mime: string) => {
    const blob = new Blob([isi], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nama;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Safari/Firefox membatalkan unduhan bila URL dicabut di tick yang sama.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /**
   * Snapshot diunduh PER HALAMAN.
   *
   * Server membatasi jumlah dokumen yang boleh dibaca satu fungsi, sedangkan
   * arsip tumbuh terus. Karena itu setiap tabel diminta halaman demi halaman
   * sampai `kursor` bernilai null, lalu semuanya dirangkai menjadi SATU berkas.
   * Hasilnya tetap utuh, bukan potongan yang berhenti diam-diam di halaman
   * pertama saat backup paling dibutuhkan.
   */
  const unduhJson = async () => {
    setBusy("json");
    setTabelJson(0);
    try {
      const isi: Record<string, unknown[]> = {};
      const jumlah: Record<string, number> = {};
      for (const [urutan, tabel] of TABEL_SNAPSHOT.entries()) {
        const baris: unknown[] = [];
        let kursor: string | null = null;
        do {
          const halaman: HalamanBagian = await klien.query(api.system.snapshotBagian, {
            tabel,
            kursor: kursor ?? undefined,
          });
          baris.push(...halaman.baris);
          kursor = halaman.kursor;
        } while (kursor !== null);
        isi[tabel] = baris;
        jumlah[LABEL_JUMLAH[tabel]] = baris.length;
        setTabelJson(urutan + 1);
      }

      // Tautan dokumen diambil terpisah: barisnya sama dengan yang sudah di atas,
      // tetapi URL penyimpanan hanya bisa dibuat di server.
      const dokumen: unknown[] = [];
      for (const sumber of SUMBER_DOKUMEN) {
        let kursor: string | null = null;
        do {
          const halaman: HalamanDokumen = await klien.query(api.system.snapshotDokumen, {
            sumber,
            kursor: kursor ?? undefined,
          });
          dokumen.push(...halaman.dokumen);
          kursor = halaman.kursor;
        } while (kursor !== null);
      }
      jumlah.dokumen = dokumen.length;

      // Konfigurasi sistem ikut supaya berkas ini bisa dipulihkan utuh.
      const config =
        auditData?.config ?? (await klien.query(api.system.getConfigAdmin, {})).config;

      const snapshot = {
        dibuatPada: new Date().toISOString(),
        jumlah,
        ...isi,
        systemConfig: config,
        dokumen,
      };
      unduhFile(
        `pindai-backup-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(snapshot, null, 2),
        "application/json",
      );
      await catat({ jenis: "snapshot-json" });
      toast.success(
        `Snapshot JSON terunduh (${TABEL_SNAPSHOT.length} tabel) & tercatat di audit.`,
      );
    } finally {
      setBusy(null);
      setTabelJson(null);
    }
  };

  const unduhCsv = async () => {
    setBusy("csv");
    try {
      const head = "waktu,grup,akun,arah,jumlah,jenis,keterangan,aktor";
      const baris: string[] = [];
      let kursor: string | null = null;
      // Seluruh arsip tetap terunduh: halaman berikutnya diminta sampai server
      // menyatakan selesai. Tidak ada baris yang diam-diam terpotong.
      do {
        const halaman: HalamanLedger = await klien.query(api.admin.ledgerRows, {
          kursor: kursor ?? undefined,
        });
        for (const r of halaman.rows) {
          baris.push(
            [
              new Date(r.waktu).toISOString(),
              r.groupId,
              r.akun,
              r.arah,
              r.jumlah,
              r.jenis,
              r.keterangan,
              r.aktor,
            ]
              .map(csvCell)
              .join(","),
          );
        }
        kursor = halaman.kursor;
      } while (kursor !== null);
      unduhFile(
        `pindai-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
        `${head}\n${baris.join("\n")}`,
        "text/csv",
      );
      await catat({ jenis: "ledger-csv" });
      toast.success(`Ekspor CSV ledger terunduh (${baris.length} baris).`);
    } finally {
      setBusy(null);
    }
  };

  const migrasiKodePeminjam = async () => {
    setBusy("kode-peminjam");
    setKodePeminjamDiterbitkan(0);
    let cursor: string | null = null;
    let totalDiterbitkan = 0;
    try {
      while (true) {
        const hasil: { cursor: string; selesai: boolean; diterbitkan: number } = await backfillKode({ cursor });
        totalDiterbitkan += hasil.diterbitkan;
        setKodePeminjamDiterbitkan(totalDiterbitkan);
        if (hasil.selesai) break;
        cursor = hasil.cursor;
      }
      toast.success(`${totalDiterbitkan} kode peminjam baru diterbitkan. Data identitas tidak diubah.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Migrasi kode peminjam gagal.");
    } finally {
      setBusy(null);
    }
  };

  /**
   * Migrasi bertahap: lengkapi metadata berkas KYC lama dari tabel `_storage`.
   * Nilainya dibaca dari penyimpanan (ukuran, tipe, sidik jari SHA-256) — tidak
   * ada yang dikarang, dan versi aturan lama sengaja TIDAK diisi.
   */
  const migrasiMetadataBerkasKyc = async () => {
    setBusy("berkas-kyc");
    setMetadataBerkasDilengkapi(0);
    let cursor: string | null = null;
    let total = 0;
    try {
      while (true) {
        const hasil: { cursor: string; selesai: boolean; dilengkapi: number } =
          await backfillBerkasKyc({ cursor });
        total += hasil.dilengkapi;
        setMetadataBerkasDilengkapi(total);
        if (hasil.selesai) break;
        cursor = hasil.cursor;
      }
      toast.success(`${total} metadata berkas KYC dilengkapi dari penyimpanan.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Migrasi metadata berkas KYC gagal.");
    } finally {
      setBusy(null);
    }
  };

  const unduhAuditPdf = async () => {
    if (!auditData) return;
    setBusy("pdf");
    try {
      const log = auditData.auditTerbaru;
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Audit Trail PINDAI</title><style>body{font-family:system-ui,sans-serif;padding:32px;color:#1c1a15}h1{font-size:20px}table{width:100%;border-collapse:collapse;font-size:12px}td,th{border:1px solid #e3ddd0;padding:6px 8px;text-align:left}</style></head><body><h1>Audit Trail | Pinjam Gadai Digital</h1><p>Dicetak: ${formatWaktuWIB(Date.now())} WIB</p><table><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Target</th><th>Detail</th></tr>${log
        .map((a) => `<tr><td>${escapeHtml(`${formatWaktuWIB(a.waktu)} WIB`)}</td><td>${escapeHtml(a.aktorLabel)}</td><td>${escapeHtml(a.aksi)}</td><td>${escapeHtml(a.target ?? "-")}</td><td>${escapeHtml(a.detail ?? "-")}</td></tr>`)
        .join("")}</table></body></html>`;
      // Aplikasi Android: window.open diblokir, jadi dialog cetak Android dipakai.
      if (!cetakLewatAplikasi(html)) {
        const w = window.open("", "_blank");
        if (w) {
          w.document.write(html);
          w.document.close();
          w.print();
        }
      }
      await catat({ jenis: "audit-pdf" });
      toast.success("Audit log dikirim ke dialog cetak PDF.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <Database className="size-4 text-primary" /> Backup data sekali klik
        </p>
        <div className="space-y-2">
          <Button variant="outline" className="w-full justify-start" disabled={busy !== null} onClick={unduhJson}>
            {busy === "json" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileDown className="mr-2 size-4 text-primary" />}
            {busy === "json" && tabelJson !== null
              ? `Membaca tabel ${tabelJson}/${TABEL_SNAPSHOT.length}…`
              : "Unduh snapshot database (.JSON)"}
          </Button>
          <Button variant="outline" className="w-full justify-start" disabled={busy !== null} onClick={unduhCsv}>
            {busy === "csv" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileDown className="mr-2 size-4 text-success-foreground" />}
            Ekspor ledger & mutasi (.CSV)
          </Button>
          <Button variant="outline" className="w-full justify-start" disabled={busy !== null || !auditData} onClick={unduhAuditPdf}>
            {busy === "pdf" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileDown className="mr-2 size-4 text-amber-600" />}
            Ekspor audit log (.PDF)
          </Button>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Snapshot memuat SELURUH data pinjaman: pinjaman, gadai, kredit barang, pembayaran cicilan gadai/kredit, pendanaan, setoran/penarikan, transfer pendana, bukti pembayaran, log WA, jejak lokasi, pengingat, peringatan lokasi, pengumuman, ledger, audit, dan seluruh baris pengguna (data dirinya) apa adanya, plus daftar dokumen (KTP, selfie, slip gaji, foto barang, bukti setoran/pembayaran, QRIS) beserta tautan unduhnya. <strong>Berisi data pribadi — simpan sebagai rahasia.</strong> Semua unduhan tercatat di audit trail.
        </p>
      </div>
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <Lock className="size-4 text-success-foreground" /> Proteksi Data
        </p>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium">Watermark otomatis KTP</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Setiap dokumen KYC yang dibuka reviewer diberi overlay transparan VERIFIKASI PINDAI — mencegah penyalahgunaan foto identitas.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium">Batas waktu sesi admin</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Logout otomatis saat admin pasif diatur di tab Pengaturan Sistem (default 30 menit).</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium">Backup terakhir</p>
          <p className="mt-1 text-xs leading-5 text-success-foreground">
            {backupTerakhir === undefined
              ? "Memuat catatan backup…"
              : backupTerakhir === null
                ? "Belum ada backup yang tercatat. Unduh snapshot JSON untuk arsip pertama."
                : `${formatWaktuWIB(backupTerakhir.waktu)} WIB · ${backupTerakhir.jenis ?? "backup"} · oleh ${backupTerakhir.oleh}`}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Backup otomatis dijadwalkan di platform, bukan dari halaman ini. Unduhan di tab
            Ekspor adalah arsip tambahan; setiap unduhan tercatat di audit trail.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium">Kode pseudonim untuk pengajuan lama</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Terbitkan kode acak permanen untuk akun yang memiliki pengajuan kas, gadai, atau kredit. Proses bertahap dan hanya mengisi kode yang belum ada.
          </p>
          {kodePeminjamDiterbitkan !== null && (
            <p className="mt-2 text-xs font-medium text-success-foreground" aria-live="polite">
              {busy === "kode-peminjam" ? "Sedang memproses" : "Terakhir selesai"}: {kodePeminjamDiterbitkan} kode diterbitkan.
            </p>
          )}
          <Button
            variant="outline"
            className="mt-3 w-full justify-start"
            disabled={busy !== null}
            onClick={() => void migrasiKodePeminjam()}
          >
            {busy === "kode-peminjam" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Lock className="mr-2 size-4 text-success-foreground" />}
            {busy === "kode-peminjam" ? "Memproses kode lama…" : "Backfill kode peminjam lama"}
          </Button>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium">Metadata berkas KYC lama</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Lengkapi ukuran, tipe, dan sidik jari SHA-256 berkas KYC yang diunggah sebelum kolom
            metadata ada. Nilainya dibaca dari penyimpanan, prosesnya bertahap, dan setiap baris yang
            sudah lengkap dilewati. Versi aturan lama TIDAK diisi — aturan yang memeriksa berkas itu
            tidak diketahui, jadi tidak boleh dikarang.
          </p>
          {metadataBerkasDilengkapi !== null && (
            <p className="mt-2 text-xs font-medium text-success-foreground" aria-live="polite">
              {busy === "berkas-kyc" ? "Sedang memproses" : "Terakhir selesai"}:{" "}
              {metadataBerkasDilengkapi} baris dilengkapi.
            </p>
          )}
          <Button
            variant="outline"
            className="mt-3 w-full justify-start"
            disabled={busy !== null}
            onClick={() => void migrasiMetadataBerkasKyc()}
          >
            {busy === "berkas-kyc" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Lock className="mr-2 size-4 text-success-foreground" />
            )}
            {busy === "berkas-kyc" ? "Memproses metadata…" : "Lengkapi metadata berkas KYC"}
          </Button>
        </div>
      </div>
    </div>
  );
}
