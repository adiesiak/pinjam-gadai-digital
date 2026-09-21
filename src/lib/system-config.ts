/** Konfigurasi sistem PINDAI — tipe + default bersama (server & client). */
export type SystemConfig = {
  killSwitch: boolean;
  maintenanceMode: boolean;
  persenAdmin: number;
  persenPlatform: number;
  persenBunga: number;
  maxLtvPersen: number;
  sessionTimeoutMenit: number;
  vaultLat: number;
  vaultLng: number;
  gpsMismatchKm: number;
  pencairanMaxKm: number;
};

export const DEFAULT_CONFIG: SystemConfig = {
  killSwitch: false,
  maintenanceMode: false,
  persenAdmin: 3,
  persenPlatform: 2,
  persenBunga: 30,
  maxLtvPersen: 70,
  sessionTimeoutMenit: 30,
  vaultLat: -6.249511,
  vaultLng: 106.830711,
  gpsMismatchKm: 50,
  pencairanMaxKm: 75,
};
