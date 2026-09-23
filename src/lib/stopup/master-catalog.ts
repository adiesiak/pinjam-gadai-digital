/**
 * STOP-UP! — Master Katalog H2H
 *
 * Katalog acuan yang dipakai fitur "One-Click Catalog Sync". Bentuk datanya
 * meniru respons standar supplier H2H Indonesia (Digiflazz/Tripay): daftar SKU
 * dengan kode supplier, harga pokok, dan tipe pengiriman.
 *
 * CATATAN KEJUJURAN DATA: tanpa API key supplier, sync berjalan dalam **Mode
 * Simulasi** dan memakai katalog acuan ini apa adanya. UI selalu menandai
 * mode-nya sehingga operator tahu kapan katalog berasal dari supplier nyata.
 */

export type KategoriKode = "pulsa" | "data" | "ewallet" | "ppob" | "premium";
export type DeliveryType =
  | "INJECT_PHONE"
  | "INJECT_EMAIL"
  | "VOUCHER_CODE"
  | "PPOB_INQUIRY";
export type BrandKind = "OPERATOR" | "EWALLET" | "PPOB" | "PREMIUM";

export type MasterKategori = {
  code: KategoriKode;
  name: string;
  icon: string;
  sortOrder: number;
};

export type MasterBrand = {
  code: string;
  name: string;
  kind: BrandKind;
  icon: string;
  color: string;
  sortOrder: number;
  minDigit?: number;
  maxDigit?: number;
  contohId?: string;
  labelTarget?: string;
};

export type MasterProduk = {
  code: string;
  name: string;
  description?: string;
  categoryCode: KategoriKode;
  brandCode: string;
  hppPrice: number;
  sellPrice: number;
  discountPrice?: number;
  badgeLabel?: string;
  icon?: string;
  sortOrder: number;
  deliveryType: DeliveryType;
  supplierProductName?: string;
};

export const MASTER_KATEGORI: MasterKategori[] = [
  { code: "pulsa", name: "Pulsa", icon: "📱", sortOrder: 1 },
  { code: "data", name: "Paket Data", icon: "🌐", sortOrder: 2 },
  { code: "ewallet", name: "E-Wallet", icon: "💳", sortOrder: 3 },
  { code: "ppob", name: "PPOB & PLN", icon: "⚡", sortOrder: 4 },
  { code: "premium", name: "Apps Premium", icon: "✨", sortOrder: 5 },
];

/* ============================== BRAND ============================== */

/** Aturan target default untuk produk berbasis nomor HP (10–13 digit). */
const HP_10_13 = { minDigit: 10, maxDigit: 13, contohId: "081234567890" };

const OPERATOR: Array<{
  code: string;
  name: string;
  icon: string;
  color: string;
  labelTarget: string;
}> = [
  { code: "TSEL", name: "Telkomsel", icon: "🔴", color: "#e11d48", labelTarget: "Nomor HP Penerima" },
  { code: "ISAT", name: "Indosat Ooredoo", icon: "🟡", color: "#eab308", labelTarget: "Nomor HP Penerima" },
  { code: "XL", name: "XL Axiata", icon: "🔵", color: "#2563eb", labelTarget: "Nomor HP Penerima" },
  { code: "AXIS", name: "Axis", icon: "🟣", color: "#7c3aed", labelTarget: "Nomor HP Penerima" },
  { code: "TRI", name: "Tri (3)", icon: "🟠", color: "#f97316", labelTarget: "Nomor HP Penerima" },
  { code: "SMART", name: "Smartfren", icon: "🟢", color: "#16a34a", labelTarget: "Nomor HP Penerima" },
];

const EWALLET: Array<{
  code: string;
  name: string;
  icon: string;
  color: string;
  labelTarget: string;
}> = [
  { code: "DANA", name: "DANA", icon: "💙", color: "#118eea", labelTarget: "Nomor HP Akun DANA" },
  { code: "OVO", name: "OVO", icon: "💜", color: "#4c2a86", labelTarget: "Nomor HP Akun OVO" },
  { code: "GOPAY", name: "GoPay", icon: "💚", color: "#00aed6", labelTarget: "Nomor HP Akun GoPay" },
  { code: "SHOPEEPAY", name: "ShopeePay", icon: "🧡", color: "#ee4d2d", labelTarget: "Nomor HP Akun ShopeePay" },
  { code: "LINKAJA", name: "LinkAja", icon: "❤️", color: "#e02020", labelTarget: "Nomor HP Akun LinkAja" },
];

const PPOB: Array<
  MasterBrand & { labelTarget: string; minDigit: number; maxDigit: number; contohId: string }
> = [
  {
    code: "PLNTOKEN",
    name: "PLN Token Listrik",
    kind: "PPOB",
    icon: "⚡",
    color: "#facc15",
    sortOrder: 1,
    labelTarget: "No. Meter / ID Pelanggan",
    minDigit: 11,
    maxDigit: 12,
    contohId: "14012345678",
  },
  {
    code: "PLNPASCA",
    name: "PLN Pascabayar",
    kind: "PPOB",
    icon: "🏠",
    color: "#38bdf8",
    sortOrder: 2,
    labelTarget: "ID Pelanggan PLN",
    minDigit: 11,
    maxDigit: 12,
    contohId: "51234567890",
  },
  {
    code: "INDIHOME",
    name: "IndiHome",
    kind: "PPOB",
    icon: "📡",
    color: "#ef4444",
    sortOrder: 3,
    labelTarget: "Nomor IndiHome",
    minDigit: 12,
    maxDigit: 12,
    contohId: "122345678901",
  },
  {
    code: "BPJS",
    name: "BPJS Kesehatan",
    kind: "PPOB",
    icon: "🏥",
    color: "#10b981",
    sortOrder: 4,
    labelTarget: "Nomor Kartu BPJS",
    minDigit: 13,
    maxDigit: 16,
    contohId: "0001234567891",
  },
  {
    code: "PDAM",
    name: "PDAM",
    kind: "PPOB",
    icon: "💧",
    color: "#0ea5e9",
    sortOrder: 5,
    labelTarget: "Nomor Pelanggan PDAM",
    minDigit: 6,
    maxDigit: 13,
    contohId: "1234567890",
  },
];

const PREMIUM: Array<{
  code: string;
  name: string;
  icon: string;
  color: string;
  labelTarget: string;
}> = [
  { code: "NETFLIX", name: "Netflix", icon: "🎬", color: "#e50914", labelTarget: "Nomor HP Penerima Kode" },
  { code: "SPOTIFY", name: "Spotify", icon: "🎧", color: "#1db954", labelTarget: "Nomor HP Penerima Kode" },
  { code: "VIU", name: "Viu", icon: "📺", color: "#f7c600", labelTarget: "Email Aktivasi" },
  { code: "DISNEY", name: "Disney+ Hotstar", icon: "🏰", color: "#0f6ef0", labelTarget: "Email Aktivasi" },
  { code: "CANVA", name: "Canva Pro", icon: "🎨", color: "#00c4cc", labelTarget: "Email Aktivasi" },
  { code: "ZOOM", name: "Zoom Pro", icon: "🎥", color: "#2d8cff", labelTarget: "Email Aktivasi" },
  { code: "STEAM", name: "Steam Wallet", icon: "🎮", color: "#66c0f4", labelTarget: "Nomor HP Penerima Kode" },
  { code: "GPLAY", name: "Google Play", icon: "▶️", color: "#34a853", labelTarget: "Nomor HP Penerima Kode" },
  { code: "FF", name: "Free Fire", icon: "🔥", color: "#f97316", labelTarget: "Nomor HP Penerima Kode" },
  { code: "MLBB", name: "Mobile Legends", icon: "⚔️", color: "#2563eb", labelTarget: "Nomor HP Penerima Kode" },
];

export const MASTER_BRAND: MasterBrand[] = [
  ...OPERATOR.map((b, i) => ({
    ...b,
    ...HP_10_13,
    kind: "OPERATOR" as BrandKind,
    sortOrder: i + 1,
  })),
  ...EWALLET.map((b, i) => ({
    ...b,
    ...HP_10_13,
    kind: "EWALLET" as BrandKind,
    sortOrder: i + 1,
  })),
  ...PPOB,
  ...PREMIUM.map((b, i) => ({
    ...b,
    ...HP_10_13,
    kind: "PREMIUM" as BrandKind,
    sortOrder: i + 1,
  })),
];

/* ============================== TARIF ============================== */

/** Nominal pulsa + harga pokok (HPP) + harga jual standar pasar. */
const TARIF_PULSA = [
  { nominal: 5_000, hpp: 5_350, sell: 6_000 },
  { nominal: 10_000, hpp: 10_250, sell: 11_000, promo: 10_500 },
  { nominal: 25_000, hpp: 24_900, sell: 26_000 },
  { nominal: 50_000, hpp: 49_650, sell: 51_000 },
  { nominal: 100_000, hpp: 99_100, sell: 101_000, badge: "BEST SELLER" },
];

const TARIF_DATA = [
  { nama: "1 GB / 30 Hari", kode: "1GB", hpp: 9_500, sell: 11_000 },
  { nama: "3 GB / 30 Hari", kode: "3GB", hpp: 18_500, sell: 21_000 },
  { nama: "5 GB / 30 Hari", kode: "5GB", hpp: 27_500, sell: 30_500, badge: "BEST SELLER" },
  { nama: "10 GB / 30 Hari", kode: "10GB", hpp: 47_500, sell: 52_000 },
  { nama: "25 GB / 30 Hari", kode: "25GB", hpp: 87_500, sell: 95_000, promo: 92_500 },
];

const TARIF_EWALLET = [
  { nominal: 10_000, hpp: 10_100, sell: 11_000 },
  { nominal: 20_000, hpp: 20_100, sell: 21_000 },
  { nominal: 25_000, hpp: 25_100, sell: 26_000 },
  { nominal: 50_000, hpp: 50_100, sell: 51_000, badge: "BEST SELLER" },
  { nominal: 100_000, hpp: 100_100, sell: 101_000 },
  { nominal: 200_000, hpp: 200_100, sell: 201_000 },
  { nominal: 500_000, hpp: 500_100, sell: 501_000 },
];

const TARIF_TOKEN = [
  { nominal: 20_000, hpp: 20_300, sell: 21_500 },
  { nominal: 50_000, hpp: 50_300, sell: 51_500, badge: "BEST SELLER" },
  { nominal: 100_000, hpp: 100_300, sell: 101_500 },
  { nominal: 200_000, hpp: 200_300, sell: 202_000 },
  { nominal: 500_000, hpp: 500_300, sell: 503_000 },
  { nominal: 1_000_000, hpp: 1_000_300, sell: 1_004_000 },
];

/** Biaya layanan PPOB pascabayar (booking fee agen). */
const BIAYA_LAYANAN = 2_500;

const rupiahKode = (n: number) => n.toString().replace(/000$/, "K");

/* ============================== PRODUK ============================== */

function produkPulsa(): MasterProduk[] {
  const out: MasterProduk[] = [];
  for (const op of OPERATOR) {
    TARIF_PULSA.forEach((t, i) => {
      out.push({
        code: `PULSA-${op.code}-${t.nominal}`,
        name: `Pulsa ${op.name} ${t.nominal.toLocaleString("id-ID")}`,
        description: `Pulsa reguler semua operator ${op.name}, masuk otomatis < 10 detik.`,
        categoryCode: "pulsa",
        brandCode: op.code,
        hppPrice: t.hpp,
        sellPrice: t.sell,
        discountPrice: t.promo,
        badgeLabel: t.badge,
        icon: "📲",
        sortOrder: i + 1,
        deliveryType: "INJECT_PHONE",
        supplierProductName: `${op.code.toUpperCase()}-${rupiahKode(t.nominal)}`,
      });
    });
  }
  return out;
}

function produkData(): MasterProduk[] {
  const out: MasterProduk[] = [];
  for (const op of OPERATOR) {
    TARIF_DATA.forEach((t, i) => {
      out.push({
        code: `DATA-${op.code}-${t.kode}`,
        name: `Paket Data ${op.name} ${t.nama}`,
        description: `Kuota internet ${op.name} ${t.nama}, aktif otomatis tanpa registrasi.`,
        categoryCode: "data",
        brandCode: op.code,
        hppPrice: t.hpp,
        sellPrice: t.sell,
        discountPrice: t.promo,
        badgeLabel: t.badge,
        icon: "🌐",
        sortOrder: i + 1,
        deliveryType: "INJECT_PHONE",
        supplierProductName: `DATA-${op.code}-${t.kode}`,
      });
    });
  }
  return out;
}

function produkEwallet(): MasterProduk[] {
  const out: MasterProduk[] = [];
  for (const w of EWALLET) {
    TARIF_EWALLET.forEach((t, i) => {
      out.push({
        code: `EWALLET-${w.code}-${t.nominal}`,
        name: `Saldo ${w.name} ${t.nominal.toLocaleString("id-ID")}`,
        description: `Top-up saldo ${w.name} ke nomor terdaftar, tanpa biaya admin.`,
        categoryCode: "ewallet",
        brandCode: w.code,
        hppPrice: t.hpp,
        sellPrice: t.sell,
        badgeLabel: t.badge,
        icon: w.icon,
        sortOrder: i + 1,
        deliveryType: "INJECT_PHONE",
        supplierProductName: `${w.code}-${rupiahKode(t.nominal)}`,
      });
    });
  }
  return out;
}

function produkPpob(): MasterProduk[] {
  const out: MasterProduk[] = [];

  TARIF_TOKEN.forEach((t, i) => {
    out.push({
      code: `PPOB-PLNTOKEN-${t.nominal}`,
      name: `Token Listrik ${t.nominal.toLocaleString("id-ID")}`,
      description: "Token PLN prabayar 20 digit — dicetak di struk & dikirim ke WhatsApp.",
      categoryCode: "ppob",
      brandCode: "PLNTOKEN",
      hppPrice: t.hpp,
      sellPrice: t.sell,
      badgeLabel: t.badge,
      icon: "⚡",
      sortOrder: i + 1,
      deliveryType: "PPOB_INQUIRY",
      supplierProductName: `PLN${rupiahKode(t.nominal)}`,
    });
  });

  const pascabayar: Array<{ brand: string; nama: string }> = [
    { brand: "PLNPASCA", nama: "PLN Pascabayar" },
    { brand: "INDIHOME", nama: "IndiHome" },
    { brand: "BPJS", nama: "BPJS Kesehatan" },
    { brand: "PDAM", nama: "PDAM" },
  ];

  pascabayar.forEach((p, i) => {
    out.push({
      code: `PPOB-${p.brand}-ADMIN`,
      name: `Biaya Layanan Tagihan ${p.nama}`,
      description:
        "Biaya layanan pembayaran tagihan. Cek nama & tagihan lewat inquiry supplier sebelum bayar.",
      categoryCode: "ppob",
      brandCode: p.brand,
      hppPrice: 1_500,
      sellPrice: BIAYA_LAYANAN,
      icon: "🧾",
      sortOrder: 100 + i,
      deliveryType: "PPOB_INQUIRY",
      supplierProductName: `ADMIN-${p.brand}`,
    });
  });

  return out;
}

function produkPremium(): MasterProduk[] {
  const tarif: Array<{
    brand: string;
    nama: string;
    hpp: number;
    sell: number;
    promo?: number;
    badge?: string;
    delivery: DeliveryType;
  }> = [
    { brand: "NETFLIX", nama: "Netflix Gift Card 1 Bulan", hpp: 54_000, sell: 59_000, badge: "BEST SELLER", delivery: "VOUCHER_CODE" },
    { brand: "NETFLIX", nama: "Netflix Gift Card 3 Bulan", hpp: 162_000, sell: 175_000, delivery: "VOUCHER_CODE" },
    { brand: "SPOTIFY", nama: "Spotify Premium 1 Bulan", hpp: 54_900, sell: 59_900, delivery: "VOUCHER_CODE" },
    { brand: "SPOTIFY", nama: "Spotify Premium 3 Bulan", hpp: 149_000, sell: 159_000, promo: 155_000, delivery: "VOUCHER_CODE" },
    { brand: "VIU", nama: "Viu Premium 1 Bulan", hpp: 25_000, sell: 29_000, delivery: "INJECT_EMAIL" },
    { brand: "DISNEY", nama: "Disney+ Hotstar 1 Bulan", hpp: 39_000, sell: 45_000, delivery: "INJECT_EMAIL" },
    { brand: "CANVA", nama: "Canva Pro 1 Tahun", hpp: 95_000, sell: 109_000, badge: "PROMO", delivery: "INJECT_EMAIL" },
    { brand: "ZOOM", nama: "Zoom Pro 1 Bulan", hpp: 210_000, sell: 229_000, delivery: "INJECT_EMAIL" },
    { brand: "STEAM", nama: "Steam Wallet 12.000", hpp: 13_500, sell: 15_000, delivery: "VOUCHER_CODE" },
    { brand: "STEAM", nama: "Steam Wallet 60.000", hpp: 63_000, sell: 67_000, delivery: "VOUCHER_CODE" },
    { brand: "GPLAY", nama: "Google Play 20.000", hpp: 21_000, sell: 23_000, delivery: "VOUCHER_CODE" },
    { brand: "GPLAY", nama: "Google Play 50.000", hpp: 51_500, sell: 55_000, delivery: "VOUCHER_CODE" },
    { brand: "FF", nama: "Free Fire 70 Diamond", hpp: 9_500, sell: 11_000, delivery: "VOUCHER_CODE" },
    { brand: "FF", nama: "Free Fire 355 Diamond", hpp: 47_000, sell: 51_000, delivery: "VOUCHER_CODE" },
    { brand: "MLBB", nama: "Mobile Legends 86 Diamond", hpp: 22_000, sell: 25_000, delivery: "VOUCHER_CODE" },
    { brand: "MLBB", nama: "Mobile Legends 257 Diamond", hpp: 66_000, sell: 71_000, delivery: "VOUCHER_CODE" },
  ];

  return tarif.map((t, i) => ({
    code: `PREMIUM-${t.brand}-${i + 1}`,
    name: t.nama,
    description:
      t.delivery === "INJECT_EMAIL"
        ? "Aktivasi langsung ke email pembeli — pastikan email aktif."
        : "Kode lisensi dicetak di struk dan dikirim ke WhatsApp.",
    categoryCode: "premium" as KategoriKode,
    brandCode: t.brand,
    hppPrice: t.hpp,
    sellPrice: t.sell,
    discountPrice: t.promo,
    badgeLabel: t.badge,
    icon: "✨",
    sortOrder: i + 1,
    deliveryType: t.delivery,
    supplierProductName: `PREMIUM-${t.brand}-${i + 1}`,
  }));
}

export const MASTER_PRODUK: MasterProduk[] = [
  ...produkPulsa(),
  ...produkData(),
  ...produkEwallet(),
  ...produkPpob(),
  ...produkPremium(),
];

/** Ringkasan katalog — dipakai layar konfirmasi sync di admin. */
export function ringkasanKatalog() {
  return {
    kategori: MASTER_KATEGORI.length,
    brand: MASTER_BRAND.length,
    produk: MASTER_PRODUK.length,
    perKategori: MASTER_KATEGORI.map((k) => ({
      code: k.code,
      name: k.name,
      jumlah: MASTER_PRODUK.filter((p) => p.categoryCode === k.code).length,
    })),
  };
}
