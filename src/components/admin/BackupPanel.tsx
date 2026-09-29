import { useMutation, useQuery } from "convex/react";
import { Database, FileDown, Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";

export function BackupPanel() {
  const snapshot = useQuery(api.system.snapshotData);
  const ledgerRows = useQuery(api.admin.ledgerRows);
  const auditData = useQuery(api.system.getConfigAdmin);
  const catat = useMutation(api.system.catatBackup);
  const backfillKode = useMutation(api.admin.backfillKodePeminjam);
  const [busy, setBusy] = useState<string | null>(null);
  const [kodePeminjamDiterbitkan, setKodePeminjamDiterbitkan] = useState<number | null>(null);

  const unduhFile = (nama: string, isi: string, mime: string) => {
    const blob = new Blob([isi], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nama;
    a.click();
    URL.revokeObjectURL(url);
  };

  const unduhJson = async () => {
    if (!snapshot) return;
    setBusy("json");
    try {
      unduhFile(`pindai-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(snapshot, null, 2), "application/json");
      await catat({ jenis: "snapshot-json" });
      toast.success("Snapshot JSON terunduh & tercatat di audit.");
    } finally {
      setBusy(null);
    }
  };

  const unduhCsv = async () => {
    if (!ledgerRows) return;
    setBusy("csv");
    try {
      const head = "waktu,grup,akun,arah,jumlah,jenis,keterangan,aktor";
      const baris = ledgerRows
        .map((r) => `${new Date(r.waktu).toISOString()},${r.groupId},"${r.akun}",${r.arah},${r.jumlah},${r.jenis},"${r.keterangan}","${r.aktor}"`)
        .join("\n");
      unduhFile(`pindai-ledger-${new Date().toISOString().slice(0, 10)}.csv`, `${head}\n${baris}`, "text/csv");
      await catat({ jenis: "ledger-csv" });
      toast.success("Ekspor CSV ledger terunduh.");
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

  const unduhAuditPdf = async () => {
    if (!auditData) return;
    setBusy("pdf");
    try {
      const log = auditData.auditTerbaru;
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Audit Trail PINDAI</title><style>body{font-family:system-ui,sans-serif;padding:32px;color:#1c1a15}h1{font-size:20px}table{width:100%;border-collapse:collapse;font-size:12px}td,th{border:1px solid #e3ddd0;padding:6px 8px;text-align:left}</style></head><body><h1>Audit Trail — Pinjam Gadai Digital</h1><p>Dicetak: ${new Date().toLocaleString("id-ID")}</p><table><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Target</th><th>Detail</th></tr>${log
        .map((a) => `<tr><td>${new Date(a.waktu).toLocaleString("id-ID")}</td><td>${a.aktorLabel}</td><td>${a.aksi}</td><td>${a.target ?? "-"}</td><td>${a.detail ?? "-"}</td></tr>`)
        .join("")}</table></body></html>`;
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
        w.print();
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
          <Button variant="outline" className="w-full justify-start" disabled={busy !== null || !snapshot} onClick={unduhJson}>
            {busy === "json" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileDown className="mr-2 size-4 text-primary" />}
            Unduh snapshot database (.JSON)
          </Button>
          <Button variant="outline" className="w-full justify-start" disabled={busy !== null || !ledgerRows} onClick={unduhCsv}>
            {busy === "csv" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileDown className="mr-2 size-4 text-emerald-600" />}
            Ekspor ledger & mutasi (.CSV)
          </Button>
          <Button variant="outline" className="w-full justify-start" disabled={busy !== null || !auditData} onClick={unduhAuditPdf}>
            {busy === "pdf" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileDown className="mr-2 size-4 text-amber-600" />}
            Ekspor audit log (.PDF)
          </Button>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Snapshot memuat seluruh pinjaman, gadai, setoran, pendanaan, dan pengguna (email disamarkan). Semua unduhan tercatat di audit trail.
        </p>
      </div>
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <Lock className="size-4 text-emerald-600" /> Proteksi Data
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
          <p className="text-sm font-medium">Backup siap</p>
          <p className="mt-1 text-xs leading-5 text-emerald-700">
            Snapshot siap: {snapshot ? `${snapshot.jumlah.loans} pinjaman, ${snapshot.jumlah.pawns} gadai` : "—"} · database dapat dipulihkan dari file JSON.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium">Kode pseudonim untuk pengajuan lama</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Terbitkan kode acak permanen untuk akun yang memiliki pengajuan kas, gadai, atau kredit. Proses bertahap dan hanya mengisi kode yang belum ada.
          </p>
          {kodePeminjamDiterbitkan !== null && (
            <p className="mt-2 text-xs font-medium text-emerald-700" aria-live="polite">
              {busy === "kode-peminjam" ? "Sedang memproses" : "Terakhir selesai"}: {kodePeminjamDiterbitkan} kode diterbitkan.
            </p>
          )}
          <Button
            variant="outline"
            className="mt-3 w-full justify-start"
            disabled={busy !== null}
            onClick={() => void migrasiKodePeminjam()}
          >
            {busy === "kode-peminjam" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Lock className="mr-2 size-4 text-emerald-600" />}
            {busy === "kode-peminjam" ? "Memproses kode lama…" : "Backfill kode peminjam lama"}
          </Button>
        </div>
      </div>
    </div>
  );
}
