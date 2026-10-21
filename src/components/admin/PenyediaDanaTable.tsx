import { useMutation, useQuery } from "convex/react";
import { IdCard, Loader2, MoreHorizontal, UserCheck, UserRoundCog } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SkeletonBarisDaftar } from "@/components/ui/loading";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";

import { TombolMasukSebagai } from "./MasukSebagaiDialog";
import { TombolUbahAkunPendana } from "./UbahAkunPendanaDialog";

/**
 * DAFTAR AKUN PENDANA & PEMANTAU — satu tabel, tanpa pengulangan.
 *
 * Hanya menampilkan akun beserta peran, status akses, dan tindakannya;
 * pemberian akses lewat email, pembuatan pendana baru, dan kode akses bersama
 * dikelola di kartu lain pada tab "Manajemen Akun & Hak Akses". Sakelar per
 * baris memanggil mutation `penyediaDana.ubahAkses` yang sama — memberi atau
 * mencabut akses lihat-saja tanpa menyentuh catatan pengajuan, dan tercatat di
 * Audit Trail.
 *
 * Kolom Tindakan memuat dua pekerjaan yang hanya boleh dilakukan Super Admin:
 *  - `penyediaDana.ubahAkunPendana` — isi/perbaiki nama & email login akun;
 *  - pratinjau "masuk sebagai" — sesi nyata akun itu, lihat
 *    `components/admin/MasukSebagaiDialog.tsx`.
 *
 * Keduanya diringkas menjadi satu menu "Kelola", pola yang sama dengan tombol
 * Kelola di Plafon Nasabah: dua tombol lebar per baris mendorong kolom lain
 * sampai terpotong di layar 1366, sedangkan isinya tetap sama.
 *
 * Akun pemantau bersama (peran `pengamat`) tidak punya sakelar maupun tindakan:
 * masa berlakunya ditentukan oleh kode akses bersama (terbit/nonaktif), bukan
 * per akun, dan sesinya terikat perangkat sehingga tidak dapat dipratinjau.
 *
 * Bagian tampilan (`TabelAkunPendana`) tetap MURNI — tindakannya datang lewat
 * prop `renderAksi`, jadi tabel ini masih bisa dirender & diuji tanpa Convex.
 */

/**
 * Bentuk minimal baris yang dibaca tabel ini — sengaja lebih kecil dari baris
 * `daftarInvestor` supaya bagian tampilan bisa dirender & diuji tanpa Convex.
 */
export type BarisAkunTampil = {
  userId: string;
  nama: string;
  email: string | null;
  peran: string | null;
  peranLegacy: boolean;
  akunBersama: boolean;
  aksesAktif: boolean;
};

/** Kelas kartu bersama panel ini. */
const KARTU = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";

/** Inisial 1–2 huruf untuk avatar akun. */
function inisial(nama: string): string {
  const bagian = nama.trim().split(/\s+/).filter((b) => b !== "");
  const depan = bagian[0] ?? "";
  const belakang = bagian[bagian.length - 1] ?? "";
  const hasil = (depan.charAt(0) + belakang.charAt(0)).toUpperCase();
  return hasil === "" ? "?" : hasil;
}

/** Label + gaya lencana peran akun ([Pendana] / [Pengamat]). */
function labelPeran(r: BarisAkunTampil): { label: string; kelas: string } {
  if (r.akunBersama) {
    return { label: "Pengamat", kelas: "border-0 bg-slate-100 text-slate-700 hover:bg-slate-100" };
  }
  if (r.peranLegacy) {
    return {
      label: "Pendana (lama)",
      kelas: "border-0 bg-amber-50 text-amber-800 hover:bg-amber-50",
    };
  }
  return {
    label: "Pendana",
    kelas: "border-0 bg-emerald-50 text-emerald-800 hover:bg-emerald-50",
  };
}

/**
 * Bagian tampilan MURNI: kartu + tabel daftar akun. `baris === undefined`
 * berarti masih dimuat (rangka daftar). Dipakai uji render.
 */
export function TabelAkunPendana({
  baris,
  busy,
  terpotong = false,
  batas,
  onUbahAkses,
  renderAksi,
}: {
  baris: readonly BarisAkunTampil[] | undefined;
  busy: string | null;
  terpotong?: boolean;
  batas?: number;
  onUbahAkses: (r: BarisAkunTampil, aktif: boolean) => void;
  /** Kolom Tindakan; tidak dirender bila tidak diberikan. */
  renderAksi?: (r: BarisAkunTampil) => ReactNode;
}) {
  const jumlahAkses = baris === undefined ? 0 : baris.filter((r) => r.aksesAktif).length;

  return (
    <section className={KARTU}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
            <UserCheck className="size-4" />
          </span>
          <div>
            <h3 className="font-bold text-slate-900">Daftar Akun Pendana &amp; Pemantau</h3>
            <p className="text-xs text-muted-foreground">
              Sakelar memberi atau mencabut akses lihat-saja ke ruang pendana.
            </p>
          </div>
        </div>
        {baris !== undefined && (
          <Badge variant="outline" className="border-slate-200 text-slate-600">
            {baris.length} akun · {jumlahAkses} aktif
          </Badge>
        )}
      </header>

      {baris === undefined ? (
        <div className="mt-4">
          <SkeletonBarisDaftar baris={4} />
        </div>
      ) : baris.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center text-xs text-muted-foreground">
          Belum ada akun pendana atau pemantau. Buat pendana baru atau beri akses pada kartu di atas.
        </p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <Table className="[&_td]:whitespace-normal [&_td]:align-middle">
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                {[
                  "Akun",
                  "Peran",
                  "Status",
                  "Akses",
                  ...(renderAksi === undefined ? [] : ["Tindakan"]),
                ].map((kolom) => (
                  <TableHead
                    key={kolom}
                    className={`text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 ${
                      kolom === "Akses" || kolom === "Tindakan" ? "text-right" : ""
                    }`}
                  >
                    {kolom}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {baris.map((r) => {
                const peran = labelPeran(r);
                return (
                  <TableRow key={r.userId}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-800">
                          {inisial(r.nama)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{r.nama}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {r.email ?? "tanpa email"}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={peran.kelas}>{peran.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          r.aksesAktif
                            ? "border-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                            : "border-0 bg-slate-100 text-slate-600 hover:bg-slate-100"
                        }
                      >
                        {r.aksesAktif ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.akunBersama ? (
                        <span className="text-[11px] text-muted-foreground">via kode bersama</span>
                      ) : r.email === null ? (
                        <span className="text-[11px] text-muted-foreground">tanpa email</span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          {busy === r.userId && (
                            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                          )}
                          <Switch
                            checked={r.aksesAktif}
                            disabled={busy === r.userId}
                            aria-label={`${r.aksesAktif ? "Cabut" : "Beri"} akses untuk ${r.nama}`}
                            onCheckedChange={(v) => onUbahAkses(r, v)}
                          />
                        </span>
                      )}
                    </TableCell>
                    {renderAksi !== undefined && (
                      <TableCell className="text-right">
                        {renderAksi(r)}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {baris !== undefined && terpotong && (
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          Menampilkan {batas ?? 0} akun pertama. Gunakan pencarian bila akun yang dicari tidak tampil.
        </p>
      )}
    </section>
  );
}

/**
 * Satu menu aksi per akun pendana.
 *
 * Isinya dua pekerjaan yang sebelumnya tampil sebagai dua tombol terpisah.
 * Dialognya tetap komponen yang sama; menu hanya menjadi pemicunya, jadi alur
 * konfirmasi, pemulihan sesi, dan pesan gagal tidak bercabang. Tiap baris punya
 * instance sendiri, sehingga state dialog tidak berpindah antar akun.
 */
function MenuKelolaPendana({
  targetId,
  nama,
  email,
}: {
  targetId: string;
  nama: string;
  email: string | null;
}) {
  const [ubahTerbuka, setUbahTerbuka] = useState(false);
  const [masukTerbuka, setMasukTerbuka] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1.5 rounded-lg bg-emerald-700 px-2.5 text-xs text-white hover:bg-emerald-800"
            aria-label={`Kelola ${nama}`}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
            Kelola
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onSelect={() => setUbahTerbuka(true)}
            className="gap-2 py-2"
          >
            <IdCard
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            {email === null ? "Isi data login" : "Ubah data login"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setMasukTerbuka(true)}
            className="gap-2 py-2"
          >
            <UserRoundCog
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            Masuk sebagai
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TombolUbahAkunPendana
        targetId={targetId}
        nama={nama}
        email={email}
        terbuka={ubahTerbuka}
        onTerbukaChange={setUbahTerbuka}
        tampilkanTombol={false}
      />
      <TombolMasukSebagai
        targetId={targetId}
        nama={nama}
        tujuan="ruang pendana"
        terbuka={masukTerbuka}
        onTerbukaChange={setMasukTerbuka}
        tampilkanTombol={false}
      />
    </>
  );
}

export function PenyediaDanaTable() {
  const daftar = useQuery(api.penyediaDana.daftarInvestor, {});
  const ubahAkses = useMutation(api.penyediaDana.ubahAkses);
  const [busy, setBusy] = useState<string | null>(null);

  const ubah = async (r: BarisAkunTampil, aktif: boolean) => {
    if (r.email === null) {
      toast.error("Akun ini tidak punya email — akses tidak bisa diubah dari sini.");
      return;
    }
    setBusy(r.userId);
    try {
      const hasil = await ubahAkses({
        email: r.email,
        aktif,
        alasan: `Ubah akses dari daftar akun (${aktif ? "aktif" : "nonaktif"}).`,
      });
      toast.success(
        hasil.sudahSesuai
          ? `Akses ${r.email} sudah ${aktif ? "aktif" : "nonaktif"}.`
          : `${aktif ? "Akses diberikan ke" : "Akses dicabut dari"} ${r.email}.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah akses.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <TabelAkunPendana
      baris={daftar?.rows}
      busy={busy}
      terpotong={daftar?.terpotong}
      batas={daftar?.batas}
      onUbahAkses={(r, aktif) => void ubah(r, aktif)}
      renderAksi={(r) =>
        r.akunBersama ? (
          <span className="text-[11px] text-muted-foreground">—</span>
        ) : (
          <MenuKelolaPendana
            targetId={r.userId}
            nama={r.nama}
            email={r.email}
          />
        )
      }
    />
  );
}
