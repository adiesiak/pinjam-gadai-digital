import { useMutation, useQuery } from "convex/react";
import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";

/**
 * Preferensi pengingat WhatsApp milik nasabah.
 *
 * Yang diatur hanya pesan pengingat tagihan. Notifikasi di aplikasi tetap
 * tersedia, dan OTP atau pesan keamanan tidak pernah dimatikan oleh sakelar
 * ini. Sakelar global PINDAI tetap bisa menahan pengiriman untuk semua akun;
 * keadaan itu ditampilkan terpisah agar nasabah tidak mengira pilihannya rusak.
 */
export function KartuPengingatWhatsapp({
  aktif,
  efektif,
  globalAktif,
  nomorWhatsapp,
  sibuk,
  galat,
  onUbah,
}: {
  aktif: boolean;
  efektif: boolean;
  globalAktif: boolean;
  nomorWhatsapp: string | null;
  sibuk: boolean;
  galat: string | null;
  onUbah: (aktif: boolean) => void;
}) {
  const status = !globalAktif
    ? "PINDAI sedang mematikan pengingat WhatsApp untuk semua akun. Pilihan Anda disimpan dan berlaku saat pengingat dinyalakan lagi."
    : !aktif
      ? "Pengingat tagihan lewat WhatsApp nonaktif. Notifikasi di aplikasi tetap masuk."
      : nomorWhatsapp === null
        ? "Nomor WhatsApp belum lengkap. Lengkapi di Data Diri agar pengingat bisa dikirim."
        : efektif
          ? "Pengingat tagihan lewat WhatsApp aktif."
          : "Pengingat belum dapat dikirim. Periksa pengaturan PINDAI.";

  return (
    <section
      aria-labelledby="judul-pengingat-whatsapp"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
          <MessageCircle className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="judul-pengingat-whatsapp" className="text-sm font-semibold text-navy">
            Pengingat WhatsApp
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
            Pesan pengingat tagihan dan jatuh tempo lewat WhatsApp. Notifikasi di
            aplikasi tetap tersedia, dan kode OTP tetap dikirim.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">Pengingat tagihan lewat WhatsApp</p>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
            {nomorWhatsapp ?? "Nomor WhatsApp belum ada di Data Diri."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="text-[11px] font-medium text-slate-600">
            {aktif ? "Aktif" : "Nonaktif"}
          </span>
          <Switch
            checked={aktif}
            disabled={sibuk}
            onCheckedChange={onUbah}
            aria-label="Pengingat tagihan lewat WhatsApp"
            aria-describedby="status-pengingat-whatsapp"
          />
        </div>
      </div>

      <p
        id="status-pengingat-whatsapp"
        className={`mt-2 text-[11px] leading-5 ${
          efektif
            ? "text-emerald-800"
            : !globalAktif || aktif
              ? "text-amber-800"
              : "text-slate-600"
        }`}
      >
        {status}
      </p>

      <p role="status" aria-live="polite" className="mt-1 min-h-4 text-[11px] text-slate-500">
        {sibuk ? "Menyimpan pilihan…" : ""}
      </p>
      {galat !== null && (
        <p role="alert" className="mt-1 text-[11px] font-medium text-red-700">
          {galat}
        </p>
      )}
    </section>
  );
}

/** Pembungkus data untuk preferensi pengingat WhatsApp nasabah. */
export function PreferensiNotifikasiWhatsapp() {
  const data = useQuery(api.notifikasiNasabah.preferensiSaya);
  const simpan = useMutation(api.notifikasiNasabah.simpanPreferensiSaya);
  const [pilihanLokal, setPilihanLokal] = useState<boolean | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  if (data === undefined) {
    return (
      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <span className="sr-only">Memuat pengaturan pengingat WhatsApp…</span>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    );
  }

  const aktif = pilihanLokal ?? data.whatsapp;

  const ubah = async (baru: boolean) => {
    setPilihanLokal(baru);
    setSibuk(true);
    setGalat(null);
    try {
      await simpan({ whatsapp: baru });
      toast.success(
        baru ? "Pengingat WhatsApp diaktifkan." : "Pengingat WhatsApp dinonaktifkan.",
      );
      setPilihanLokal(null);
    } catch (error) {
      setPilihanLokal(null);
      setGalat(
        error instanceof Error
          ? error.message
          : "Pilihan pengingat WhatsApp gagal disimpan. Coba lagi.",
      );
    } finally {
      setSibuk(false);
    }
  };

  return (
    <KartuPengingatWhatsapp
      aktif={aktif}
      efektif={data.globalWhatsapp && aktif}
      globalAktif={data.globalWhatsapp}
      nomorWhatsapp={data.nomorWhatsapp}
      sibuk={sibuk}
      galat={galat}
      onUbah={(baru) => void ubah(baru)}
    />
  );
}
