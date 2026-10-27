/**
 * Kartu "APK yang terbit" di panel Aplikasi Android.
 *
 * Panel itu mengatur splash dan logo, tetapi sampai sekarang tidak menjawab
 * pertanyaan yang lebih dulu ditanyakan admin: berkas mana yang sedang
 * disajikan, dan apakah versi itu sudah diumumkan ke pengguna. Kartu ini
 * menyatukan tiga sumber yang sudah ada tanpa menghitung ulang apa pun:
 *
 *  - `public/version.json` (lewat `muatInfoUnduhan`), berkas yang juga dibaca
 *    aplikasi dan halaman /aplikasi;
 *  - versi terakhir yang diumumkan (`pembaruanAplikasi.status`);
 *  - batas bawah versi yang masih boleh dipakai (`pembaruanAplikasi.wajib`).
 *
 * Murni presentasional: tidak memuat Convex, tidak membaca jam, sehingga
 * keadaannya bisa diuji lewat markup.
 */
import {
  CheckCircle2,
  CircleAlert,
  Download,
  ExternalLink,
  FileDown,
  Megaphone,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TAUTAN_UNDUH_CADANGAN,
  ukuranTerbaca,
  type InfoUnduhan,
} from "@/lib/unduhAplikasi";

export type VersiTerumumkan = {
  versiKode: number;
  versiNama: string;
  wajibDiperbarui: boolean;
};

export type PropsKartuApkTerbit = {
  status: "memuat" | "siap" | "gagal";
  info: InfoUnduhan | null;
  alasan: string | null;
  terumumkan: VersiTerumumkan | null;
  /** Versi minimum yang diwajibkan, null bila tidak ada yang diblokir. */
  versiMinimum: number | null;
  /** Alamat unduhan utuh; null bila asal halaman belum bisa dibaca. */
  alamatUnduh: string | null;
  onMuatUlang: () => void;
  /** Versi terbit lebih baru dari yang diumumkan dan tautannya siap dikirim. */
  bisaUmumkan: boolean;
  sedangUmumkan: boolean;
  galatUmumkan: string | null;
  onUmumkan: () => void;
};

type Nada = "tenang" | "perhatian" | "siap";

const NADA: Record<Nada, string> = {
  tenang: "border-slate-200 bg-slate-50/70 text-slate-700",
  perhatian: "border-amber-300/70 bg-amber-50 text-amber-900",
  siap: "border-emerald-700/25 bg-emerald-700/[0.05] text-emerald-900",
};

/** Satu baris fakta: label kecil di atas, nilai tebal di bawah. */
function Fakta({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-navy">{nilai}</dd>
    </div>
  );
}

export function KartuApkTerbit({
  status,
  info,
  alasan,
  terumumkan,
  versiMinimum,
  alamatUnduh,
  onMuatUlang,
  bisaUmumkan,
  sedangUmumkan,
  galatUmumkan,
  onUmumkan,
}: PropsKartuApkTerbit) {
  // Pengumuman menyentuh semua akun, jadi butuh dua ketukan. Penandaan wajib
  // diperbarui sengaja tidak ikut: itu keputusan terpisah di panel Pengingat.
  const [konfirmasi, setKonfirmasi] = useState(false);
  // Penilaian keadaan hanya butuh dua kode versi; tidak ada kesimpulan yang
  // diambil saat berkas versi belum terbaca.
  let nada: Nada = "tenang";
  let pesan = "Membaca berkas versi aplikasi…";
  if (status === "gagal") {
    nada = "perhatian";
    pesan = `Berkas versi tidak terbaca (${alasan ?? "tanpa alasan"}). Unduhan tetap tersedia di halaman /aplikasi.`;
  } else if (status === "siap" && info !== null) {
    if (terumumkan === null) {
      nada = "perhatian";
      pesan = `Kode ${info.versiKode} belum diumumkan, jadi pengguna belum ditawari pembaruan apa pun.`;
    } else if (terumumkan.versiKode < info.versiKode) {
      nada = "perhatian";
      pesan = `APK kode ${info.versiKode} sudah terbit, tetapi yang diumumkan baru kode ${terumumkan.versiKode}. Pengguna belum ditawari versi ini.`;
    } else if (terumumkan.versiKode > info.versiKode) {
      nada = "perhatian";
      pesan = `Versi yang diumumkan (kode ${terumumkan.versiKode}) lebih baru dari berkas yang disajikan (kode ${info.versiKode}). Periksa berkas APK di server.`;
    } else {
      nada = "siap";
      pesan = `Versi terbit sama dengan yang diumumkan: PINDAI ${info.versiNama}, kode ${info.versiKode}.`;
    }
    if (versiMinimum !== null && versiMinimum > info.versiKode) {
      nada = "perhatian";
      pesan = `Batas wajib kode ${versiMinimum} lebih tinggi dari berkas yang disajikan (kode ${info.versiKode}). Setiap APK baru langsung diminta memperbarui.`;
    }
  }

  const ukuran = ukuranTerbaca(info?.ukuranByte ?? null);
  // Saat berkas versi gagal dibaca, tautan cadangan /pindai.apk tetap dipakai:
  // berkas terakhir masih tersedia, dan halaman /aplikasi melakukan hal sama.
  const tautanUnduh = alamatUnduh ?? info?.tautan ?? TAUTAN_UNDUH_CADANGAN;

  return (
    <section
      aria-labelledby="kartu-apk-terbit"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id="kartu-apk-terbit"
            className="flex items-center gap-2 text-sm font-semibold text-navy"
          >
            <FileDown className="size-4" aria-hidden="true" />
            APK yang terbit
          </h3>
          <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
            Berkas yang disajikan halaman /aplikasi dan dibaca aplikasi saat memeriksa pembaruan.
            Angka di sini bukan pengaturan, hanya keadaan berkas yang sedang terpasang di server.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status === "siap" && info !== null ? (
            <Badge variant="outline" className="text-[11px] tabular-nums">
              kode {info.versiKode} · {info.versiNama}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[11px]">
              {status === "memuat" ? "membaca versi" : "versi tidak terbaca"}
            </Badge>
          )}
          {versiMinimum !== null && (
            <Badge variant="outline" className="border-amber-300 text-[11px] text-amber-800">
              wajib minimal kode {versiMinimum}
            </Badge>
          )}
        </div>
      </div>

      <dl className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fakta
          label="Versi terbit"
          nilai={
            status === "siap" && info !== null
              ? `${info.versiNama} (kode ${info.versiKode})`
              : "Belum terbaca"
          }
        />
        <Fakta
          label="Berkas"
          nilai={`${info?.tautan ?? "/pindai.apk"}${ukuran === null ? "" : ` · ${ukuran}`}`}
        />
        <Fakta
          label="Diumumkan"
          nilai={
            terumumkan === null
              ? "Belum ada"
              : `${terumumkan.versiNama} (kode ${terumumkan.versiKode})`
          }
        />
        <Fakta
          label="Wajib diperbarui"
          nilai={versiMinimum === null ? "Tidak ada" : `Di bawah kode ${versiMinimum}`}
        />
      </dl>

      <p
        role="status"
        className={cn(
          "mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-5",
          NADA[nada],
        )}
      >
        {nada === "perhatian" ? (
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        )}
        <span>{pesan}</span>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline" className="rounded-full">
          <Link to="/aplikasi">
            <ExternalLink className="mr-1.5 size-3.5" aria-hidden="true" />
            Halaman unduh
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="rounded-full">
          <a href={tautanUnduh} download="PINDAI.apk">
            <Download className="mr-1.5 size-3.5" aria-hidden="true" />
            Unduh berkas
          </a>
        </Button>
        <Button asChild size="sm" variant="ghost" className="rounded-full">
          <Link to="/promo#aset-android">Aset ikon untuk build</Link>
        </Button>
        {status === "gagal" && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-full"
            onClick={onMuatUlang}
          >
            Coba baca lagi
          </Button>
        )}
        {bisaUmumkan && (
          <Button
            type="button"
            size="sm"
            variant={konfirmasi ? "default" : "secondary"}
            className="rounded-full"
            disabled={sedangUmumkan}
            onClick={() => {
              if (!konfirmasi) {
                setKonfirmasi(true);
                return;
              }
              setKonfirmasi(false);
              onUmumkan();
            }}
          >
            <Megaphone className="mr-1.5 size-3.5" aria-hidden="true" />
            {sedangUmumkan
              ? "Mengumumkan…"
              : konfirmasi
                ? `Klik lagi: umumkan kode ${info?.versiKode ?? ""}`
                : `Umumkan kode ${info?.versiKode ?? ""}`}
          </Button>
        )}
      </div>

      {bisaUmumkan && (
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
          Mengumumkan menaruh satu notifikasi di pusat notifikasi semua akun bahwa versi ini
          tersedia. Pesan WhatsApp tetap dikirim terpisah dari panel Pengingat, dan penandaan wajib
          diperbarui juga di sana.
        </p>
      )}

      {galatUmumkan !== null && (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{galatUmumkan}</span>
        </p>
      )}
    </section>
  );
}
