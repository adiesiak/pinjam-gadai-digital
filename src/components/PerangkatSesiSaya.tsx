/**
 * Perangkat & Sesi — kontrol keamanan milik nasabah sendiri.
 *
 * Sebelum ini, daftar perangkat dan sesi hanya terlihat di panel admin
 * (`LoginSecurityPanel`). Padahal yang paling perlu tahu adalah pemiliknya:
 * perangkat native yang hilang/dijual menyimpan TOKEN yang bisa mengirim titik
 * lokasi tanpa login. Tanpa layar ini, nasabah tidak punya cara mencabutnya
 * selain menghubungi tim PINDAI.
 *
 * Prinsip yang dijaga:
 *  - Token perangkat TIDAK pernah ditampilkan (hanya ada/tidak ada). Kredensial
 *    tidak boleh tercetak di layar yang bisa difoto orang lain.
 *  - IP sesi disamarkan (hanya bagian awal) — cukup untuk mengenali "ini saya",
 *    tidak cukup untuk membocorkan alamat bila layarnya terlihat orang lain.
 *  - Pencabutan selalu lewat konfirmasi dua langkah dan hasilnya berasal dari
 *    server (daftar di layar reaktif), bukan tebakan UI.
 */
import { useMutation, useQuery } from "convex/react";
import { Laptop, Loader2, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getSessionId, samarkanIp } from "@/lib/session";

import { formatDate } from "@/pages/dashboard/shared";

type PerangkatBaris = {
  _id: Id<"perangkat">;
  deviceId: string;
  platform: string;
  versiApp: string;
  terdaftarPada: number;
  terakhirDilihat: number;
  aktif: boolean;
  punyaToken: boolean;
};

type SesiBaris = {
  _id: Id<"sessions">;
  perangkat: string;
  ip: string;
  waktuMulai: number;
  sessionId: string;
};

/**
 * Baris satu perangkat — MURNI (tanpa server) supaya dapat diuji dengan render
 * statis, dan supaya aturan "token tidak pernah ditampilkan" bisa diverifikasi
 * lewat keluaran HTML.
 */
export function BarisPerangkat({
  perangkat,
  sibuk,
  onCabut,
}: {
  perangkat: PerangkatBaris;
  sibuk: boolean;
  onCabut: () => void;
}) {
  const Ikon = perangkat.platform === "android" || perangkat.platform === "ios" ? Smartphone : Laptop;
  return (
    <li className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Ikon className="mt-0.5 size-4 shrink-0 text-slate-500" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-navy">
              {perangkat.platform} · versi {perangkat.versiApp}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Terdaftar {formatDate(perangkat.terdaftarPada)} · terakhir terlihat{" "}
              {formatDate(perangkat.terakhirDilihat)}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              ID perangkat: {perangkat.deviceId.slice(0, 8)}…
              {perangkat.punyaToken
                ? " · boleh mengirim lokasi dari layanan latar"
                : " · tanpa token lokasi"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            className={
              perangkat.aktif
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-100 text-slate-600"
            }
          >
            {perangkat.aktif ? "Aktif" : "Tidak aktif"}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 sm:min-h-0"
            disabled={sibuk}
            onClick={onCabut}
          >
            {sibuk ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 size-4" />
            )}
            Cabut
          </Button>
        </div>
      </div>
    </li>
  );
}

/** Satu baris sesi aktif — MURNI, IP disamarkan pemanggil. */
export function BarisSesi({ sesi, iniPerangkatIni }: { sesi: SesiBaris; iniPerangkatIni: boolean }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-navy">
            {sesi.perangkat}
            {iniPerangkatIni ? " · perangkat ini" : ""}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Mulai {formatDate(sesi.waktuMulai)} · IP {sesi.ip}
          </p>
        </div>
        {iniPerangkatIni && (
          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Sedang dipakai</Badge>
        )}
      </div>
    </li>
  );
}

export function PerangkatSesiSaya() {
  const perangkat = useQuery(api.lokasi.perangkatSaya, {});
  const sesi = useQuery(api.security.mySessions, {});
  const cabut = useMutation(api.lokasi.cabutPerangkat);
  const keluarkanLain = useMutation(api.security.revokeOtherSessions);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [konfirmasi, setKonfirmasi] = useState<string | null>(null);
  const sessionIdIni = getSessionId();

  const jalankan = async (kunci: string, aksi: () => Promise<unknown>, pesan: string) => {
    setSibuk(kunci);
    try {
      await aksi();
      toast.success(pesan);
      setKonfirmasi(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tindakan gagal dijalankan.");
    } finally {
      setSibuk(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-navy">
        <ShieldCheck className="size-4 text-primary" /> Perangkat &amp; Sesi
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Perangkat aplikasi yang boleh mengirim lokasi tanpa membuka aplikasi memakai token
        tersendiri. Bila perangkat hilang atau dijual, cabut di sini — tokennya langsung mati dan
        pengiriman lokasi dari perangkat itu ditolak sampai aplikasi didaftarkan ulang.
      </p>

      <div className="mt-4">
        <p className="text-xs font-semibold text-navy">Perangkat aplikasi</p>
        {perangkat === undefined ? (
          <p role="status" className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Memuat perangkat…
          </p>
        ) : perangkat.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Belum ada perangkat aplikasi terdaftar untuk akun ini.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {perangkat.map((p) => (
              <div key={p._id}>
                <BarisPerangkat
                  perangkat={p}
                  sibuk={sibuk === `perangkat-${p._id}`}
                  onCabut={() => {
                    if (konfirmasi !== p._id) {
                      setKonfirmasi(p._id);
                      return;
                    }
                    void jalankan(
                      `perangkat-${p._id}`,
                      () => cabut({ perangkatId: p._id }),
                      "Perangkat dicabut. Token lokasinya sudah tidak berlaku.",
                    );
                  }}
                />
                {konfirmasi === p._id && (
                  <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
                    Tekan <b>Cabut</b> sekali lagi untuk memastikan. Perangkat ini harus membuka
                    aplikasi dan mendaftar ulang agar bisa mengirim lokasi lagi.
                  </p>
                )}
              </div>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-navy">Sesi aktif</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 sm:min-h-0"
            disabled={sibuk !== null || (sesi?.length ?? 0) <= 1}
            onClick={() =>
              void jalankan(
                "sesi",
                () => keluarkanLain({ sessionId: sessionIdIni }),
                "Sesi di perangkat lain sudah diakhiri.",
              )
            }
          >
            Keluarkan perangkat lain
          </Button>
        </div>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          PINDAI hanya mengizinkan satu sesi aktif: masuk di perangkat baru otomatis mengakhiri sesi
          lama. Tombol di atas berguna bila Anda menemukan sisa sesi yang tidak dikenal.
        </p>
        {sesi === undefined ? (
          <p role="status" className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Memuat sesi…
          </p>
        ) : sesi.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Tidak ada sesi aktif tercatat.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {(sesi as unknown as SesiBaris[]).map((s) => (
              <BarisSesi
                key={s._id}
                sesi={{ ...s, ip: samarkanIp(s.ip) }}
                iniPerangkatIni={s.sessionId === sessionIdIni}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
