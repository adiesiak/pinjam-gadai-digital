import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { AMBANG_SEGERA_HARI, type NadaJatuhTempo } from "@/lib/jatuhTempo";
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
 *
 * "Hidup" dan "menunggu tindakan" juga ditandai titik kecil yang bergerak
 * (`.badge-dot--hidup` berdenyut, `.badge-dot--tunggu` memancar). Gerakan itu
 * sengaja hanya pada dua nada ini: kalau semua status bergerak, tabel penuh
 * aplikasi justru jadi berisik. Titiknya dekoratif (`aria-hidden`) karena
 * statusnya tetap dibaca sebagai teks lencana, dan teks itu tidak pernah
 * berubah karena penambahan ini.
 */
const PIL = "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold";
const HIJAU = "border-emerald-200 bg-emerald-50 text-emerald-800";
const KUNING = "border-amber-200 bg-amber-50 text-amber-900";
const MERAH = "border-rose-200 bg-rose-50 text-rose-800";
const ABU = "border-slate-200 bg-slate-100 text-slate-800";

/** Status gadai yang berarti "berjalan atau sudah selesai" → hijau. */
const PAWN_HIJAU = new Set(["aktif", "lunas_dilepas"]);
/** Status gadai yang berarti "menunggu tindakan" → kuning. */
const PAWN_KUNING = new Set(["sedang_dinilai", "menunggu_pelepasan"]);

/**
 * Status tagihan yang dipakai SELURUH halaman peminjam — satu definisi, supaya
 * "aman" tidak berarti dua hal berbeda di dua kartu.
 *
 * - **Aman** — belum jatuh tempo dan masih lebih dari 3 hari lagi.
 * - **Segera jatuh tempo** — tinggal 3 hari atau kurang (termasuk hari ini).
 * - **Terlambat** — tanggal acuan sudah lewat; denda tercatat terpisah.
 * - **Lunas** — kewajiban sudah selesai.
 * - **Belum dicairkan** — belum ada tanggal yang bisa diperiksa.
 */
export type StatusTagihan = "aman" | "segera" | "terlambat" | "lunas" | "belum-dicairkan";

const LENCANA_TAGIHAN: Record<
  StatusTagihan,
  { label: string; kelas: string; Ikon: typeof Clock3 }
> = {
  aman: { label: "Aman", kelas: HIJAU, Ikon: CheckCircle2 },
  segera: { label: `Segera jatuh tempo (≤ ${AMBANG_SEGERA_HARI} hari)`, kelas: KUNING, Ikon: Clock3 },
  terlambat: { label: "Terlambat", kelas: MERAH, Ikon: AlertTriangle },
  lunas: { label: "Lunas", kelas: HIJAU, Ikon: CheckCircle2 },
  "belum-dicairkan": { label: "Belum dicairkan", kelas: ABU, Ikon: Clock3 },
};

/** Nada dari `lib/jatuhTempo.ts` → status tagihan yang bisa dibaca pengguna. */
export function statusTagihanDari(nada: NadaJatuhTempo): StatusTagihan {
  if (nada === "terlambat") return "terlambat";
  if (nada === "segera") return "segera";
  if (nada === "lunas") return "lunas";
  if (nada === "belum_didanai") return "belum-dicairkan";
  return "aman";
}

/**
 * Lencana status tagihan: ikon + teks + warna, tanpa titik berdenyut. Warna
 * hanya mempercepat pembacaan; artinya selalu ikut ditulis.
 */
export function JatuhTempoBadge({ status }: { status: StatusTagihan }) {
  const { label, kelas, Ikon } = LENCANA_TAGIHAN[status];
  return (
    <Badge variant="outline" className={`${PIL} ${kelas}`}>
      <Ikon className="size-3.5 shrink-0" aria-hidden />
      {label}
    </Badge>
  );
}

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

  const nada: "hijau" | "kuning" | "merah" | "abu" =
    status === "ditolak"
      ? "merah"
      : kind === "loan" && (status === "lunas" || status === "didanai")
        ? "hijau"
        : kind === "loan" && diTahapTinjauan(status)
          ? "kuning"
          : kind === "loan" && status === "disetujui"
            ? "hijau"
            : kind === "pawn" && PAWN_HIJAU.has(status)
              ? "hijau"
              : kind === "pawn" && PAWN_KUNING.has(status)
                ? "kuning"
                : "abu";

  const kelas = nada === "hijau" ? HIJAU : nada === "kuning" ? KUNING : nada === "merah" ? MERAH : ABU;

  return (
    <Badge variant="outline" className={`${PIL} ${kelas}`}>
      {nada === "hijau" && <span aria-hidden className="badge-dot badge-dot--hidup" />}
      {nada === "kuning" && <span aria-hidden className="badge-dot badge-dot--tunggu" />}
      {meta.label}
    </Badge>
  );
}
