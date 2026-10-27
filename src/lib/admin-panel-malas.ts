/**
 * Panel admin yang dimuat sesuai permintaan (potongan terpisah).
 *
 * Kenapa ada berkas ini: seluruh panel admin dulu diimpor statis oleh
 * `admin-tabs.tsx`, jadi satu kunjungan ke Ringkasan memaksa peramban mengunduh
 * 28 layar sekaligus — termasuk peta Leaflet, panel sistem, dan CMS konten yang
 * belum tentu dibuka. Daftar di bawah memindahkan layar yang BUKAN jalur harian
 * ke potongan sendiri; Ringkasan, tiga antrean pengajuan, KYC, dan rekonsiliasi
 * tetap statis supaya layar pertama tidak punya jeda.
 *
 * Satu sumber untuk dua kebutuhan:
 *  - `admin-tabs.tsx` memakai komponen `malas` di sini sebagai isi tab;
 *  - menu admin memanggil `muatModulAdmin()` saat penunjuk/fokus menyentuh
 *    tombolnya, jadi potongannya sudah di jalan sebelum tombol diklik.
 *
 * Menambah modul baru: tambahkan satu entri `malas` + satu entri `PEMUAT`.
 * Modul tanpa entri tetap jalan — ia hanya dimuat statis.
 */
import { lazy } from "react";

import type { NilaiModulAdmin } from "./admin-queue";

export const PanelLanding = lazy(() =>
  import("@/components/admin/LandingCmsPanel").then((m) => ({
    default: m.LandingCmsPanel,
  })),
);
export const PanelPendana = lazy(() =>
  import("@/components/admin/KontenPendanaPanel").then((m) => ({
    default: m.KontenPendanaPanel,
  })),
);
export const PanelPengumuman = lazy(() =>
  import("@/components/admin/AnnouncementCms").then((m) => ({
    default: m.AnnouncementCms,
  })),
);
export const PanelPromo = lazy(() =>
  import("@/components/admin/PromoPinjamanPanel").then((m) => ({
    default: m.PromoPinjamanPanel,
  })),
);
export const PanelVoucher = lazy(() =>
  import("@/components/admin/VoucherPanel").then((m) => ({
    default: m.VoucherPanel,
  })),
);
export const PanelWhatsApp = lazy(() =>
  import("@/components/admin/WhatsAppPanel").then((m) => ({
    default: m.WhatsAppPanel,
  })),
);
export const PanelConfig = lazy(() =>
  import("@/components/admin/SystemConfigPanel").then((m) => ({
    default: m.SystemConfigPanel,
  })),
);
export const PanelTemplate = lazy(() =>
  import("@/components/admin/WebsiteTemplatePanel").then((m) => ({
    default: m.WebsiteTemplatePanel,
  })),
);
export const PanelAplikasi = lazy(() =>
  import("@/components/admin/AplikasiAndroidPanel").then((m) => ({
    default: m.AplikasiAndroidPanel,
  })),
);
export const PanelLogin = lazy(() =>
  import("@/components/admin/LoginSecurityPanel").then((m) => ({
    default: m.LoginSecurityPanel,
  })),
);
export const PanelKillSwitch = lazy(() =>
  import("@/components/admin/KillSwitchPanel").then((m) => ({
    default: m.KillSwitchPanel,
  })),
);
export const PanelBi = lazy(() =>
  import("@/components/admin/PanelBiKesehatan").then((m) => ({
    default: m.PanelBiKesehatan,
  })),
);
export const PanelAudit = lazy(() =>
  import("@/components/admin/AuditTrailPanel").then((m) => ({
    default: m.AuditTrailPanel,
  })),
);
export const PanelBackup = lazy(() =>
  import("@/components/admin/BackupPanel").then((m) => ({ default: m.BackupPanel })),
);
export const PanelPengembangan = lazy(() =>
  import("@/pages/admin/page-pengembangan").then((m) => ({
    default: m.PagePengembangan,
  })),
);
export const PanelPetaLokasi = lazy(() =>
  import("@/components/admin/LiveLocationMap").then((m) => ({
    default: m.LiveLocationMap,
  })),
);
export const PanelVerifikasiLokasi = lazy(() =>
  import("@/components/admin/VerifikasiLokasiPanel").then((m) => ({
    default: m.VerifikasiLokasiPanel,
  })),
);
export const PanelKalender = lazy(() =>
  import("@/components/admin/KalenderKasPanel").then((m) => ({
    default: m.KalenderKasPanel,
  })),
);
export const PanelUndian = lazy(() =>
  import("@/components/admin/UndianPanel").then((m) => ({
    default: m.UndianPanel,
  })),
);
export const PanelPlafon = lazy(() =>
  import("@/components/admin/PlafonPanel").then((m) => ({
    default: m.PlafonPanel,
  })),
);
export const PanelAkses = lazy(() =>
  import("@/components/admin/AksesPenyediaDanaPanel").then((m) => ({
    default: m.AksesPenyediaDanaPanel,
  })),
);

/**
 * Pemuat mentah per modul — dipakai untuk pramuat saat menu disorot.
 * Kuncinya nilai tab, nilainya janji impor yang sama dengan `lazy` di atas.
 */
const PEMUAT: Partial<Record<NilaiModulAdmin, () => Promise<unknown>>> = {
  landing: () => import("@/components/admin/LandingCmsPanel"),
  pendana: () => import("@/components/admin/KontenPendanaPanel"),
  pengumuman: () => import("@/components/admin/AnnouncementCms"),
  promo: () => import("@/components/admin/PromoPinjamanPanel"),
  voucher: () => import("@/components/admin/VoucherPanel"),
  whatsapp: () => import("@/components/admin/WhatsAppPanel"),
  config: () => import("@/components/admin/SystemConfigPanel"),
  template: () => import("@/components/admin/WebsiteTemplatePanel"),
  aplikasi: () => import("@/components/admin/AplikasiAndroidPanel"),
  loglogin: () => import("@/components/admin/LoginSecurityPanel"),
  killswitch: () => import("@/components/admin/KillSwitchPanel"),
  bi: () => import("@/components/admin/PanelBiKesehatan"),
  audit: () => import("@/components/admin/AuditTrailPanel"),
  backup: () => import("@/components/admin/BackupPanel"),
  pengembangan: () => import("@/pages/admin/page-pengembangan"),
  lokasi: () => import("@/components/admin/LiveLocationMap"),
  kalender: () => import("@/components/admin/KalenderKasPanel"),
  undian: () => import("@/components/admin/UndianPanel"),
  plafon: () => import("@/components/admin/PlafonPanel"),
  akses: () => import("@/components/admin/AksesPenyediaDanaPanel"),
};

/**
 * Mulai unduh potongan panel untuk satu modul. Aman dipanggil berkali-kali:
 * modul yang sudah diunduh tidak memicu permintaan baru (peramban menyimpan
 * modul ES yang sudah selesai), dan modul tanpa potongan diabaikan.
 *
 * Kegagalan jaringan di sini sengaja ditelan: pramuat hanya mempercepat, dan
 * `lazy` di atas akan mencoba lagi saat tab benar-benar dibuka.
 */
export function muatModulAdmin(value: NilaiModulAdmin): void {
  const muat = PEMUAT[value];
  if (muat === undefined) return;
  void muat().catch(() => undefined);
}
