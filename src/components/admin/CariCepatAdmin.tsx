/**
 * Palet pencarian cepat admin (Ctrl/Cmd+K).
 *
 * Dua jenis hasil dalam satu kotak: modul panel yang sudah ada, dan nasabah
 * (nama, email, kode peminjam, NIK, nomor WhatsApp) lewat query pencarian yang
 * sama dengan formulir pengajuan manual. Admin tidak perlu menebak modul mana
 * yang memuat satu nasabah.
 *
 * Pencarian nasabah ditunda 250 ms dan baru berjalan setelah dua huruf, supaya
 * mengetik tidak mengirim satu query per karakter. Server membatasi bacaannya
 * sendiri; bila jendela pencarian teks penuh, palet memberi tahu admin agar ia
 * mencari dengan identitas tepat alih-alih menyimpulkan nasabahnya tidak ada.
 */
import { useQuery } from "convex/react";
import { Search, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { api } from "@/convex/_generated/api";
import { pesanHasilTerpotong } from "@/lib/pencarianNasabah";
import type { Id } from "@/convex/_generated/dataModel";
import type { NilaiModulAdmin } from "@/lib/admin-queue";

type ModulCari = {
  value: NilaiModulAdmin;
  label: string;
  hint: string;
};

type GrupCari = {
  judul: string;
  items: readonly ModulCari[];
};

export function CariCepatAdmin({
  menu,
  onPilihModul,
  onOpenNasabah,
}: {
  menu: readonly GrupCari[];
  onPilihModul: (modul: NilaiModulAdmin) => void;
  /** Bila kosong, hasil nasabah tidak ditampilkan. */
  onOpenNasabah?: (userId: Id<"users">) => void;
}) {
  const [buka, setBuka] = useState(false);
  const [kueri, setKueri] = useState("");
  const [tertunda, setTertunda] = useState("");

  useEffect(() => {
    const tangani = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBuka((sebelumnya) => !sebelumnya);
      }
    };
    window.addEventListener("keydown", tangani);
    return () => window.removeEventListener("keydown", tangani);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setTertunda(kueri.trim()), 250);
    return () => clearTimeout(timer);
  }, [kueri]);

  const cariNasabah = tertunda.length >= 2 && onOpenNasabah !== undefined;
  const nasabah = useQuery(
    api.adminPengajuan.cariNasabah,
    cariNasabah ? { kueri: tertunda } : "skip",
  );

  const jarum = kueri.trim().toLowerCase();
  const cocok = (teks: string) => teks.toLowerCase().includes(jarum);
  const modul = menu
    .flatMap((grup) =>
      grup.items.map((item) => ({ ...item, grup: grup.judul })),
    )
    .filter(
      (item) =>
        jarum === "" ||
        cocok(item.label) ||
        cocok(item.hint) ||
        cocok(item.grup) ||
        cocok(item.value),
    )
    .slice(0, jarum === "" ? 8 : 12);

  const daftarNasabah =
    nasabah === undefined || nasabah === null ? [] : nasabah.hasil.slice(0, 6);

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="fixed bottom-4 right-4 z-40 hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-lg transition-colors hover:bg-slate-50 lg:flex"
        aria-label="Cari menu atau nasabah (Ctrl+K)"
      >
        <Search className="size-3.5" aria-hidden="true" />
        Cari cepat
        <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
          Ctrl K
        </kbd>
      </button>

      <CommandDialog open={buka} onOpenChange={setBuka} title="Cari cepat admin">
        <CommandInput
          value={kueri}
          onValueChange={setKueri}
          placeholder="Cari menu, nama nasabah, email, NIK, atau nomor WhatsApp…"
        />
        <CommandList className="max-h-[60dvh]">
          {daftarNasabah.length === 0 && modul.length === 0 && (
            <CommandEmpty>
              {cariNasabah && nasabah === undefined
                ? "Mencari nasabah…"
                : "Tidak ada menu atau nasabah yang cocok."}
            </CommandEmpty>
          )}

          {onOpenNasabah !== undefined && daftarNasabah.length > 0 && (
            <CommandGroup heading="Nasabah">
              {daftarNasabah.map((orang) => (
                <CommandItem
                  key={orang.userId}
                  value={`nasabah-${orang.userId}`}
                  onSelect={() => {
                    setBuka(false);
                    setKueri("");
                    onOpenNasabah(orang.userId);
                  }}
                  className="gap-2.5 px-3 py-2.5"
                >
                  <UserRound className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-medium">{orang.nama}</span>
                  <span className="truncate text-[11px] text-slate-500">
                    {orang.kodePeminjam ?? orang.email ?? ""}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {nasabah?.dibatasi === true && (
            <p className="px-3 py-2 text-[11px] leading-5 text-amber-700">
              {pesanHasilTerpotong(nasabah.jenis)}
            </p>
          )}

          {daftarNasabah.length > 0 && modul.length > 0 && <CommandSeparator />}

          {modul.length > 0 && (
            <CommandGroup heading="Menu">
              {modul.map((item) => (
                <CommandItem
                  key={item.value}
                  value={`menu-${item.value}`}
                  onSelect={() => {
                    setBuka(false);
                    setKueri("");
                    onPilihModul(item.value);
                  }}
                  className="gap-2.5 px-3 py-2.5"
                >
                  <Search className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                  <span className="shrink-0 text-[11px] text-slate-500">{item.grup}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
