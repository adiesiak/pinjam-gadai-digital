import { Badge } from "@/components/ui/badge";
import { loanStatusMeta, type LoanStatus } from "@/lib/loan";
import { pawnStatusMeta, type PawnStatus } from "@/lib/pawn";
import { diTahapTinjauan } from "@/lib/statusPinjaman";

/**
 * Lencana status untuk pinjaman (`kind="loan"`) dan gadai (`kind="pawn"`).
 *
 * SATU sistem warna untuk seluruh aplikasi (tabel, kartu, dan panel admin),
 * supaya arti sebuah warna tidak berubah antar layar:
 *
 * - **hijau (emerald)** — sudah berjalan atau sudah selesai: Disalurkan,
 *   Lunas, Disetujui, gadai Aktif / sudah dilepas.
 * - **kuning (amber)** — masih menunggu tindakan: Ditinjau (tiga ejaan tahap
 *   tinjauan dipetakan ke satu warna, bukan tiga), sedang dinilai, menunggu
 *   pelepasan.
 * - **merah muda (rose)** — Ditolak.
 * - **abu (slate)** — tidak masuk ketiganya (mis. status lama yang tidak
 *   dikenali), bukan dipaksa masuk kategori yang salah.
 *
 * Warnanya pil lembut bergaris tipis (bukan isian pejal): badge muncul puluhan
 * kali per layar, jadi harus mudah dibaca tanpa berteriak. Nadanya soft-tint
 * kontras tinggi — latar sangat muda, huruf pekat, dan tepi tipis senada.
 */
const PIL = "inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-semibold";
const HIJAU = "border-emerald-200 bg-emerald-50 text-emerald-800";
const KUNING = "border-amber-200 bg-amber-50 text-amber-900";
const MERAH = "border-rose-200 bg-rose-50 text-rose-800";
const ABU = "border-slate-200 bg-slate-100 text-slate-800";

/** Status gadai yang berarti "berjalan atau sudah selesai" → hijau. */
const PAWN_HIJAU = new Set(["aktif", "lunas_dilepas"]);
/** Status gadai yang berarti "menunggu tindakan" → kuning. */
const PAWN_KUNING = new Set(["sedang_dinilai", "menunggu_pelepasan"]);

export function StatusBadge({
  status,
  kind,
}: {
  status: string;
  kind: "loan" | "pawn";
}) {
  const meta =
    kind === "loan"
      ? loanStatusMeta(status as LoanStatus)
      : pawnStatusMeta(status as PawnStatus);

  const kelas =
    status === "ditolak"
      ? MERAH
      : kind === "loan" && (status === "lunas" || status === "didanai")
        ? HIJAU
        : kind === "loan" && diTahapTinjauan(status)
          ? KUNING
          : kind === "loan" && status === "disetujui"
            ? HIJAU
            : kind === "pawn" && PAWN_HIJAU.has(status)
              ? HIJAU
              : kind === "pawn" && PAWN_KUNING.has(status)
                ? KUNING
                : ABU;

  return (
    <Badge variant="outline" className={`${PIL} ${kelas}`}>
      {meta.label}
    </Badge>
  );
}
