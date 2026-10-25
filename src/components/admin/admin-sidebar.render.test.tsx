/**
 * Uji render sidebar panel admin.
 * Run: bun src/components/admin/admin-sidebar.render.test.tsx
 *
 * Kontrak yang dijaga — semuanya bisa rusak diam-diam tanpa galat tipe:
 * - Dua keadaan lebar memakai kelas yang sama dengan geseran kolom konten:
 *   `lg:w-60`/`lg:pl-60` (240px) dan `lg:w-[4.5rem]`/`lg:pl-[4.5rem]` (72px).
 * - Menyempit TIDAK menghilangkan lencana angka, dan setiap ikon tetap punya
 *   nama lengkapnya (aria-label + tooltip) karena label teksnya hilang.
 * - Melebar menampilkan SELURUH menu sekaligus tanpa bantuan klik: tiap tombol
 *   harus bisa dijangkau Tab, jadi tidak boleh ada `tabindex="-1"`.
 * - Tombol buka/tutup memakai `aria-expanded` dan label "Tutup menu"/"Buka menu",
 *   dan ikonnya berputar mengikuti keadaan.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";

import { NILAI_MODUL_ADMIN } from "@/lib/admin-queue";

import { SidebarAdmin, type GrupSidebar, type ItemSidebar } from "./admin-sidebar";

let lulus = 0;
let gagal = 0;
function cek(nama: string, syarat: boolean, info?: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${nama}${info === undefined ? "" : ` — ${info}`}`);
  }
}
/** Cacah kemunculan — dipakai untuk memastikan SETIAP item, bukan satu saja. */
const cacah = (teks: string, jarum: string) => teks.split(jarum).length - 1;
/** Teks sebagaimana React menuliskannya di HTML — "&" jadi "&amp;". */
const teksHtml = (teks: string) => teks.replace(/&/g, "&amp;");

/** Judul seksi dan isinya, disalin dari daftar menu `admin-tabs.tsx`. */
const GRUP: Array<{ judul: string; modul: string[] }> = [
  {
    judul: "Operasional",
    modul: [
      "hari-ini",
      "konvensional",
      "syariah",
      "kyc",
      "alokasi",
      "undian",
      "rekonsiliasi",
      "kalender",
      "plafon",
      "akses",
    ],
  },
  { judul: "Pemantauan", modul: ["lokasi", "dpd", "lelang"] },
  {
    judul: "Konten",
    modul: [
      "template",
      "landing",
      "pendana",
      "pengumuman",
      "promo",
      "voucher",
      "whatsapp",
      "aplikasi",
    ],
  },
  {
    judul: "Sistem",
    modul: ["config", "bi", "backup", "pengembangan", "audit", "loglogin", "killswitch"],
  },
];

const LABEL: Record<string, string> = {
  "hari-ini": "Ringkasan",
  konvensional: "Pengajuan Konvensional",
  syariah: "Pengajuan Syariah",
  kyc: "Verifikasi KYC",
  alokasi: "Siap disalurkan",
  undian: "Doorprize & Antrean",
  rekonsiliasi: "Rekonsiliasi Angsuran",
  kalender: "Kalender Kas",
  plafon: "Plafon Nasabah",
  akses: "Nasabah & Pendana",
  lokasi: "Peta lokasi",
  dpd: "Jatuh Tempo",
  lelang: "Kalkulator Lelang",
  bi: "Kesehatan Sistem",
  template: "Template Website",
  landing: "Konten Beranda",
  pendana: "Halaman Pendana",
  pengumuman: "Banner & Pengumuman",
  promo: "Promo Pinjaman",
  voucher: "Voucher Nasabah",
  whatsapp: "WhatsApp",
  aplikasi: "Aplikasi Android",
  config: "Parameter Bisnis",
  backup: "Backup Database",
  pengembangan: "Peta Sistem",
  audit: "Audit Trail",
  loglogin: "Keamanan Login",
  killswitch: "Kill Switch",
};

/** Lencana contoh: satu angka pada menu yang memang menunggu tindakan. */
const BADGE: Record<string, string> = { konvensional: "3", dpd: "17" };

const menu: GrupSidebar[] = GRUP.map((grup) => ({
  judul: grup.judul,
  items: grup.modul.map((value) => ({
    value: value as ItemSidebar["value"],
    label: LABEL[value] ?? value,
    hint: `Petunjuk ${LABEL[value] ?? value}`,
    badge: BADGE[value] ?? null,
    hitung: "menunggu" as const,
    Icon: () => null,
  })),
}));

const semuaModul = menu.flatMap((grup) => grup.items.map((item) => item.value));
cek(
  "0a seluruh modul admin terwakili di fixture",
  semuaModul.length === NILAI_MODUL_ADMIN.length &&
    NILAI_MODUL_ADMIN.every((modul) => semuaModul.includes(modul)),
  `fixture ${semuaModul.length} modul, daftar ${NILAI_MODUL_ADMIN.length}`,
);

const gambar = (terbuka: boolean, drawerTerbuka = false) =>
  renderToStaticMarkup(
    <SidebarAdmin
      menu={menu}
      activeTab="hari-ini"
      onPilih={() => {}}
      terbuka={terbuka}
      onToggle={() => {}}
      drawerTerbuka={drawerTerbuka}
      onUbahDrawer={() => {}}
    />,
  );

// ===== 1. Keadaan terbuka: 240px, ikon + label =====
{
  const html = gambar(true);
  cek("1a lebar 240px", html.includes("lg:w-60") && html.includes("lg:px-3"));
  cek("1b kelas transisi lebar terpasang", html.includes("sidebar-admin"));
  cek(
    "1c lambang & nama aplikasi di puncak sidebar",
    html.includes("PINDAI") && html.includes("Panel admin"),
  );
  cek(
    "1d tombol tutup sejajar nama aplikasi, dengan aria-expanded",
    html.includes('aria-label="Tutup menu"') &&
      html.includes('aria-expanded="true"') &&
      html.includes('title="Tutup menu (Ctrl+B)"'),
  );
  cek("1e ikon tidak berputar saat terbuka", !html.includes("rotate-180"));

  // Setiap menu tampil dengan labelnya sendiri.
  for (const modul of semuaModul) {
    cek(`1f tombol ${modul} punya id sasaran fokus`, html.includes(`id="tab-${modul}"`));
    cek(
      `1g tombol ${modul} menunjuk panelnya`,
      html.includes(`aria-controls="panel-${modul}"`),
    );
  }
  cek(
    "1h label setiap menu terbaca",
    Object.values(LABEL).every((label) => html.includes(teksHtml(label))),
    Object.values(LABEL).find((label) => !html.includes(teksHtml(label))),
  );
  cek("1i petunjuk menu tetap tersedia sebagai tooltip", html.includes("title="));
  cek(
    "1j seluruh menu bisa dijangkau Tab (tidak ada tabindex -1)",
    !html.includes('tabindex="-1"'),
  );
  cek(
    "1k tepat satu menu ditandai aktif",
    cacah(html, 'aria-current="page"') === 1,
  );
  cek(
    "1l tiap seksi punya judul berlabel",
    GRUP.every((grup) => html.includes(`aria-label="${grup.judul.replace("&", "&amp;")}"`)),
  );
  cek(
    "1m judul seksi bergaya kecil-kapital redup",
    cacah(html, "px-3 pb-1 text-[10px] font-semibold uppercase") === GRUP.length,
  );
  cek(
    "1n lencana angka tetap tampil di menu yang menunggu tindakan",
    html.includes(">3<") && html.includes(">17<"),
  );
  cek(
    "1o menu aktif memakai latar hijau tua dengan ikon putih",
    html.includes("gradient-primary text-white"),
  );
  cek(
    "1p setiap tombol menu punya cincin fokus saat dilewati keyboard",
    // Cincin yang sama dipakai tombol buka/tutup, jadi hitungannya 21 menu + 1.
    cacah(html, "focus-visible:ring-2") === semuaModul.length + 1,
  );
  cek("1q tanpa NaN", !html.includes("NaN"));
  cek("1r tanpa undefined", !html.includes("undefined"));
}

// ===== 2. Keadaan tertutup: 72px, hanya ikon rata tengah =====
{
  const html = gambar(false);
  cek("2a lebar 72px", html.includes("lg:w-[4.5rem]") && html.includes("lg:px-2"));
  cek(
    "2b tombol buka dengan aria-expanded=false dan ikon berputar",
    html.includes('aria-label="Buka menu"') &&
      html.includes('aria-expanded="false"') &&
      html.includes("rotate-180"),
  );
  cek("2c rata tengah", html.includes("flex flex-col items-center"));
  cek(
    "2d setiap ikon tetap membawa nama modulnya",
    semuaModul.every(
      (modul) =>
        html.includes(`id="tab-ikon-${modul}"`) &&
        html.includes(`aria-label="${(LABEL[modul] ?? modul).replace("&", "&amp;")}"`),
    ),
  );
  cek(
    "2e keterangan tiap ikon tersedia lewat tooltip (hover + fokus keyboard)",
    cacah(html, 'data-slot="tooltip-trigger"') === semuaModul.length,
  );
  cek(
    "2f label teks tidak dirender saat menyempit (namanya pindah ke aria-label)",
    !html.includes("whitespace-normal break-words"),
  );
  cek(
    "2g lencana angka tetap terlihat di pojok kanan atas ikon",
    html.includes(">3<") && html.includes("-right-0.5 -top-0.5"),
  );
  cek(
    "2h judul seksi diganti garis pemisah tipis",
    cacah(html, "border-t border-slate-100") === GRUP.length - 1 &&
      !html.includes("px-3 pb-1 text-[10px] font-semibold uppercase"),
  );
  cek("2i tanpa NaN", !html.includes("NaN"));
  cek("2j tanpa undefined", !html.includes("undefined"));
}

// ===== 3. Laci ponsel: tertutup secara bawaan, dibuka dari kiri =====
{
  const html = gambar(true, false);
  cek(
    "3a laci tidak dirender selama tertutup",
    !html.includes('id="menu-panel-admin"') && !html.includes("laci-hari-ini"),
  );

  // Isi laci hidup di dalam portal Radix, jadi kontraknya diperiksa di sumber:
  // sisi kiri, selalu ikon + label, dan id tombolnya tidak bentrok dengan kolom
  // tetap yang dirender bersamaan.
  const sumber = readFileSync(
    fileURLToPath(new URL("./admin-sidebar.tsx", import.meta.url)),
    "utf8",
  );
  cek("3b laci dibuka dari kiri", sumber.includes('side="left"'));
  cek("3c laci punya judul untuk pembaca layar", sumber.includes("Menu panel admin"));
  cek(
    "3d laci selalu melebar (ikon + label), apa pun pilihan di layar lebar",
    /tertutup=\{false\}[\s\S]{0,120}awalanId="laci"/.test(sumber),
  );
  cek(
    "3e laci memakai sasaran sentuh 44px",
    sumber.includes('ukuranTombol="size-11"'),
  );
  cek("3f kait CSS laci terpasang", sumber.includes('className="laci-admin '));
  cek(
    "3g id tombol laci berbeda dari kolom tetap",
    sumber.includes('awalanId="tab"') && sumber.includes("${awalanId}-${value}"),
  );
}

// ===== 4. Gerak: transisi lebar 200ms, dan semuanya mati saat gerak diminta berhenti =====
{
  // Lebarnya dianimasikan CSS (bukan JS), jadi kontraknya diperiksa di stylesheet.
  const css = readFileSync(fileURLToPath(new URL("../../index.css", import.meta.url)), "utf8");
  cek(
    "4a lebar sidebar dan geseran konten memakai tempo gerak 200ms",
    /\.sidebar-admin \{[^}]*transition: width var\(--motion-normal\)/.test(css) &&
      /\.kolom-admin \{[^}]*transition: padding-left var\(--motion-normal\)/.test(css),
  );
  cek(
    "4b prefers-reduced-motion mematikan transisi lebar, tooltip, dan geseran laci",
    /\.sidebar-admin,[\s\S]{0,80}\.kolom-admin \{[\s\S]{0,60}transition: none/.test(css) &&
      /\[data-slot="tooltip-content"\],[\s\S]{0,40}\.laci-admin \{[\s\S]{0,40}animation: none/.test(css),
  );
}

console.log(`admin-sidebar.render: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
