import { useMutation, useQuery } from "convex/react";
import { BellIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { NotifikasiList } from "@/components/notifications/notifikasi-list";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useStatusSinkron } from "@/hooks/use-status-sinkron";
import { hitungBelumDibaca, kunciBaru, pengumumanBaru, type NotifikasiItem } from "@/lib/notifikasi";
import { cn } from "@/lib/utils";

/** Kumpulan kunci kosong bersama — dipakai sebelum ada notifikasi baru. */
const TANPA_KUNCI: ReadonlySet<string> = new Set<string>();

/**
 * Lonceng notifikasi PINDAI.
 *
 * Sumber datanya `convex/notifikasi.daftar` — daftar yang dihitung dari catatan
 * nyata (pengingat jatuh tempo, peringatan pola koordinat, status bukti
 * pembayaran, pengumuman resmi). Komponen ini **tidak menambah** notifikasi dan
 * **tidak mengirim** apa pun; ia hanya menampilkan dan mencatat baca.
 *
 * Keputusan interaksi yang disengaja:
 *
 * - **Tanpa pembaruan optimistis.** Menandai dibaca menunggu server. Permintaan
 *   itu satu tulisan kecil, dan keadaan baca adalah milik server — menebaknya di
 *   klien lalu memutar balik saat gagal hanya menambah jalur yang bisa salah.
 *   Convex menyiarkan hasilnya kembali dalam milidetik, jadi UI tetap terasa
 *   langsung tanpa risiko keadaan palsu.
 * - **Animasi hanya untuk yang benar-benar BARU.** Kunci notifikasi dibandingkan
 *   dengan yang sudah pernah dilihat, sehingga penyegaran query biasa tidak
 *   membuat daftar bergerak atau berbunyi lagi.
 * - **Pengumuman pembaca layar secukupnya.** Hanya saat ada notifikasi baru
 *   (`role="status"`), bukan setiap render, dan jumlah belum dibaca juga tertulis
 *   di dalam label tombol lonceng — jadi tidak ada informasi yang HANYA bisa
 *   diperoleh dari pengumuman.
 * - **Keadaan galat nyata.** Panel menampilkan galat hanya karena sebab nyata:
 *   gagal menandai dibaca, atau sambungan ke server terputus (dengan jalan keluar
 *   "muat ulang"), bukan karena jeda sesaat.
 */
export function NotificationBell() {
  const { isAuthenticated, isAnonymous } = useAuth();
  const boleh = isAuthenticated && !isAnonymous;

  const hasil = useQuery(api.notifikasi.daftar, boleh ? {} : "skip");
  const tandaiDibaca = useMutation(api.notifikasi.tandaiDibaca);
  const tandaiSemuaDibaca = useMutation(api.notifikasi.tandaiSemuaDibaca);
  const { terputus } = useStatusSinkron();
  const navigate = useNavigate();

  const [terbuka, setTerbuka] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);

  // Kunci yang sudah pernah terlihat — dasar deteksi notifikasi baru.
  const dilihatRef = useRef<ReadonlySet<string> | null>(null);
  const [kunciBaruSet, setKunciBaruSet] = useState<ReadonlySet<string>>(TANPA_KUNCI);
  const [pengumuman, setPengumuman] = useState<string | null>(null);

  const item = hasil?.item ?? [];
  const belumDibaca = hitungBelumDibaca(item);

  useEffect(() => {
    if (hasil === undefined) return;
    const sebelumnya = dilihatRef.current;
    const sekarang = new Set(hasil.item.map((it) => it.kunci));
    dilihatRef.current = sekarang;
    // Muat pertama bukan "notifikasi baru": belum ada pembandingnya, dan pengguna
    // baru saja membuka halaman — tidak ada yang perlu diumumkan atau dianimasikan.
    const baru = sebelumnya === null ? TANPA_KUNCI : kunciBaru(sebelumnya, hasil.item);
    // Dijadwalkan sebagai microtask: setState langsung di badan efek dilarang
    // aturan react-hooks (pola yang sama dipakai praisi formulir pengajuan).
    // Convex hanya mengganti identitas hasil saat DATA berubah, jadi efek ini
    // berjalan tepat saat kumpulan notifikasi berubah — bukan setiap render.
    queueMicrotask(() => {
      setKunciBaruSet(baru);
      setPengumuman(pengumumanBaru(baru.size, hasil.belumDibaca));
    });
  }, [hasil]);

  if (!boleh) return null;

  const pesanGalat = (e: unknown, aksi: string) =>
    e instanceof Error ? e.message : `Gagal ${aksi}. Coba lagi.`;

  const bacaSatu = async (target: NotifikasiItem) => {
    if (target.dibaca) return;
    setSibuk(true);
    setGalatAksi(null);
    try {
      await tandaiDibaca({ kunci: target.kunci });
    } catch (e) {
      setGalatAksi(pesanGalat(e, "menandai notifikasi sebagai dibaca"));
    } finally {
      setSibuk(false);
    }
  };

  const bacaSemua = async () => {
    setSibuk(true);
    setGalatAksi(null);
    try {
      await tandaiSemuaDibaca({});
    } catch (e) {
      setGalatAksi(pesanGalat(e, "menandai semua notifikasi sebagai dibaca"));
    } finally {
      setSibuk(false);
    }
  };

  const labelLonceng =
    belumDibaca > 0 ? `Notifikasi, ${belumDibaca} belum dibaca` : "Notifikasi, tidak ada yang baru";

  return (
    <Popover open={terbuka} onOpenChange={setTerbuka}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative size-11 shrink-0 sm:size-9"
          aria-label={labelLonceng}
        >
          <BellIcon className="size-4" aria-hidden />
          {belumDibaca > 0 && (
            // `key` membuat lencana dipasang ulang saat jumlahnya berubah, dan
            // kelas `motion-scale` (bertoken) membuat perubahannya terbaca —
            // tidak ada angka yang melompat tanpa jejak gerak.
            <span
              key={belumDibaca}
              aria-hidden
              className={cn(
                "motion-scale absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center",
                "rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground",
              )}
            >
              {belumDibaca > 9 ? "9+" : belumDibaca}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        aria-label="Notifikasi"
        className="w-auto p-3"
      >
        {/* Pengumuman hanya saat ada yang benar-benar baru. */}
        <span role="status" aria-live="polite" className="sr-only">
          {pengumuman ?? ""}
        </span>
        <NotifikasiList
          item={item}
          memuat={hasil === undefined}
          galat={
            galatAksi ??
            (terputus
              ? "Koneksi ke server terputus; daftar ini mungkin belum segar. Menyambung ulang otomatis."
              : null)
          }
          onCoba={terputus ? () => window.location.reload() : undefined}
          kunciBaruSet={kunciBaruSet}
          sibuk={sibuk}
          onTandaiDibaca={(target) => void bacaSatu(target)}
          onTandaiSemuaDibaca={() => void bacaSemua()}
          onBuka={(target) => {
            // Buka detail terkait: tandai dibaca (server) lalu menuju tab terkait.
            void bacaSatu(target);
            setTerbuka(false);
            navigate(target.tautan);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
