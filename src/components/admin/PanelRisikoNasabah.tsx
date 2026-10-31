/**
 * Panel risiko nasabah (panel admin): GRADE sistem, rincian komponen berbobot,
 * dan override yang berjejak.
 *
 * Kenapa dipisah dari dialog detail: penilaian risiko punya aturan mainnya
 * sendiri — grade dihitung server dari riwayat + identitas, sedangkan override
 * adalah keputusan manusia yang WAJIB beralasan dan tidak pernah menghapus
 * riwayat. Menyatukannya ke dalam dialog besar membuat dua hal itu mudah
 * tertukar secara visual; di sini urutannya jelas: hitungan sistem dulu, lalu
 * keputusan petugas.
 *
 * Panel ini TIDAK mengubah plafon/pinjaman apa pun — hanya grade yang berlaku.
 */
import { useMutation } from "convex/react";
import { Loader2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChipSkorRisiko } from "@/components/penyediaDana/ChipSkorRisiko";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  GRADE_RISIKO,
  LABEL_GRADE_RISIKO,
  PANJANG_MIN_ALASAN_OVERRIDE,
  type GradeRisiko,
  type KomponenRisiko,
} from "@/lib/risikoNasabah";

import { formatDate } from "./admin-format";

type RingkasRisikoBaris = {
  gradeSistem: GradeRisiko;
  gradeEfektif: GradeRisiko;
  ditimpa: boolean;
};

type OverrideBaris = {
  gradeSistem: string;
  skorSistem: number;
  gradeOverride: string;
  alasan: string;
  olehLabel: string;
  dibuatPada: number;
};

/**
 * Lencana grade — MURNI, tanpa server (diuji di
 * `PanelRisikoNasabah.render.test.tsx`). A/B hijau, C kuning, D/E merah.
 */
export function LencanaGrade({
  grade,
  gradeSistem,
  ditimpa,
}: {
  grade: GradeRisiko;
  gradeSistem?: GradeRisiko;
  ditimpa?: boolean;
}) {
  const kelas =
    grade === "A"
      ? "border-success-border bg-success-soft text-success-foreground"
      : grade === "B"
        ? "border-success-border bg-success-soft text-success-foreground"
        : grade === "C"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-destructive/30 bg-destructive/10 text-destructive";
  return (
    <>
      <Badge className={kelas}>
        Grade {grade} · {LABEL_GRADE_RISIKO[grade]}
      </Badge>
      {ditimpa === true && gradeSistem !== undefined && (
        <Badge className="border-amber-200 bg-amber-50 text-amber-700">
          Ditimpa petugas (sistem: {gradeSistem})
        </Badge>
      )}
    </>
  );
}

/** Tabel rincian komponen berbobot — MURNI (tanpa server) dan dapat diuji. */
export function TabelKomponenRisiko({ komponen }: { komponen: KomponenRisiko[] }) {
  if (komponen.length === 0) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        Belum ada komponen penilaian — nasabah belum punya riwayat pinjaman.
      </p>
    );
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">
          Komponen penilaian risiko nasabah beserta bobot, nilai, dan kontribusinya
        </caption>
        <thead className="text-muted-foreground">
          <tr>
            <th scope="col" className="py-1 pr-2 font-medium">Komponen</th>
            <th scope="col" className="py-1 pr-2 text-right font-medium">Bobot</th>
            <th scope="col" className="py-1 pr-2 text-right font-medium">Nilai</th>
            <th scope="col" className="py-1 text-right font-medium">Kontribusi</th>
          </tr>
        </thead>
        <tbody>
          {komponen.map((k) => (
            <tr key={k.kunci} className="border-t border-slate-100">
              <td className="py-1 pr-2 text-slate-700">
                {k.label}
                <span className="block text-[10px] text-muted-foreground">{k.catatan}</span>
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">{k.bobot}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{Math.round(k.nilai * 100)}%</td>
              <td className="py-1 text-right tabular-nums">{k.kontribusi}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Daftar keputusan override — MURNI (tanpa server) dan dapat diuji. */
export function DaftarRiwayatRisiko({ riwayat }: { riwayat: OverrideBaris[] }) {
  if (riwayat.length === 0) {
    return (
      <p className="mt-1 text-[11px] text-muted-foreground">
        Belum ada override — grade yang berlaku sepenuhnya hasil perhitungan sistem.
      </p>
    );
  }
  return (
    <ul className="mt-1 space-y-1.5">
      {riwayat.map((r) => (
        <li key={`${r.dibuatPada}-${r.gradeOverride}`} className="text-[11px] text-slate-700">
          <b>
            {r.gradeSistem} → {r.gradeOverride}
          </b>{" "}
          (skor sistem {r.skorSistem}) · {formatDate(r.dibuatPada)} · {r.olehLabel}
          <span className="block text-muted-foreground">{r.alasan}</span>
        </li>
      ))}
    </ul>
  );
}

export function PanelRisikoNasabah({
  userId,
  dinilai,
  skor,
  komponen,
  risiko,
  riwayatOverride,
}: {
  userId: Id<"users">;
  dinilai: boolean;
  skor: number;
  komponen: KomponenRisiko[];
  risiko: RingkasRisikoBaris;
  riwayatOverride: OverrideBaris[];
}) {
  const override = useMutation(api.nasabah.overrideRisiko);
  const [grade, setGrade] = useState<GradeRisiko>("C");
  const [alasan, setAlasan] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alasanKurang = alasan.trim().length < PANJANG_MIN_ALASAN_OVERRIDE;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Penilaian risiko nasabah
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <LencanaGrade
            grade={risiko.gradeEfektif}
            gradeSistem={risiko.gradeSistem}
            ditimpa={risiko.ditimpa}
          />
        </div>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        Skor sistem: <ChipSkorRisiko skor={skor} />
        {dinilai ? "" : " · belum ada riwayat pinjaman, skor netral"}
      </p>

      <TabelKomponenRisiko komponen={komponen} />

      <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
        Grade dihitung server dari riwayat pinjaman, kelengkapan data diri, dan
        status KYC — bukan dari data yang dikirim peramban. Angka ini alat bantu
        peninjauan, bukan keputusan otomatis.
      </p>

      {/* ===== Override ===== */}
      <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold text-navy">
          Keputusan petugas atas grade
        </p>
        <p className="text-[11px] leading-4 text-muted-foreground">
          Override mengganti grade yang <b>berlaku</b> tanpa menghapus riwayat.
          Setiap keputusan wajib beralasan minimal {PANJANG_MIN_ALASAN_OVERRIDE}{" "}
          karakter dan tercatat di audit trail. Plafon dan pinjaman tidak berubah.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[180px] flex-1">
            <Label htmlFor="override-grade">Grade yang ditetapkan</Label>
            <Select value={grade} onValueChange={(v) => setGrade(v as GradeRisiko)}>
              <SelectTrigger id="override-grade" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRADE_RISIKO.map((g) => (
                  <SelectItem key={g} value={g}>
                    {LABEL_GRADE_RISIKO[g]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[220px] flex-[2]">
            <Label htmlFor="override-alasan">Alasan</Label>
            <Input
              id="override-alasan"
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder="mis. berkas penghasilan tambahan sudah diverifikasi"
            />
          </div>
          <Button
            type="button"
            disabled={busy || alasanKurang}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const hasil = await override({ userId, grade, alasan: alasan.trim() });
                toast.success(
                  `Grade sistem ${hasil.gradeSistem} → ${grade}. Keputusan tercatat di audit trail.`,
                );
                setAlasan("");
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Gagal menyimpan keputusan risiko.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Tetapkan grade
          </Button>
        </div>
        {alasanKurang && alasan.length > 0 && (
          <p className="text-[11px] text-amber-700">
            Alasan masih kurang {PANJANG_MIN_ALASAN_OVERRIDE - alasan.trim().length} karakter.
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </p>
        )}
      </div>

      {/* ===== Riwayat keputusan ===== */}
      <div className="mt-3">
        <p className="flex items-center gap-1 text-xs font-semibold text-navy">
          <ShieldAlert className="size-3.5 text-amber-600" /> Riwayat keputusan risiko
        </p>
        <DaftarRiwayatRisiko riwayat={riwayatOverride} />
        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
          Riwayat ini append-only: keputusan lama tidak dapat diubah atau dihapus,
          hanya ditambah keputusan baru.
        </p>
      </div>
    </section>
  );
}
