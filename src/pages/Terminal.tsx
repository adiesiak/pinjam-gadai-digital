/**
 * STOP-UP! — Halaman Client Terminal (Touchscreen)
 *
 * Alur: Idle → Page 1 (nomor HP + numpad + auto-detect operator) →
 * Page 2 (tab layanan + smart routing katalog) → input target →
 * konfirmasi (+invoice WA yang bisa diubah) → QRIS → struk.
 *
 * Ergonomi: viewport terkunci, target sentuh >= 64px, tanpa scrollbar,
 * auto-reset saat idle, dan kunci shortcut browser (mode kiosk).
 */
import { useAction, useMutation, useQuery } from "convex/react";
import QRCodeLib from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  Printer,
  Send,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { IdleScreen } from "@/components/IdleScreen";
import { LogoStopUp } from "@/components/LogoStopUp";
import { Numpad } from "@/components/stopup/Numpad";
import { VirtualKeyboard } from "@/components/VirtualKeyboard";
import { useThermalPrinter } from "@/hooks/useThermalPrinter";
import { buildStrukBytes, formatStrukTeks, type DataStruk } from "@/utils/escpos";
import {
  maskEmail,
  maskIdPelanggan,
  maskNomorHp,
  normalisasiNomorHp,
  tautanWhatsApp,
} from "@/utils/masking";
import {
  deteksiOperator,
  validasiNomorHp,
  type Operator,
} from "@/lib/stopup/operator";
import { labelWaktuWib, sisaDetik } from "@/lib/stopup/waktu";

/* ============================== TIPE ============================== */

type Langkah =
  | "idle"
  | "nomor"
  | "katalog"
  | "target"
  | "konfirmasi"
  | "qris"
  | "struk";

type DeliveryType =
  | "INJECT_PHONE"
  | "INJECT_EMAIL"
  | "VOUCHER_CODE"
  | "PPOB_INQUIRY";

type Kategori = { id: string; code: string; name: string; icon: string };

type Brand = {
  id: string;
  code: string;
  name: string;
  icon: string;
  color: string;
  kind: string;
  labelTarget: string;
  minDigit: number;
  maxDigit: number;
  contohId: string;
};

type Produk = {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  iconUrl: string | null;
  badgeLabel: string | null;
  deliveryType: DeliveryType;
  harga: number;
  hargaCoret: number | null;
};

type InvoiceView = {
  invoiceId: string;
  status: string;
  targetNo: string;
  accountNameMasked: string | null;
  notifWhatsapp: string;
  sellPrice: number;
  voucherCode: string | null;
  snRef: string | null;
  catatanGagal: string | null;
  createdAt: number;
  produkNama: string;
  produkIcon: string;
  deliveryType: DeliveryType;
  brandNama: string;
  brandIcon: string;
  kategoriNama: string;
  terminalCode: string;
  terminalNama: string;
  pembayaran: {
    status: string;
    qrString: string;
    amount: number;
    expiresAt: number;
    paidAt: number | null;
  } | null;
};

type HasilInquiry = {
  namaMasked: string;
  sumber: "SUPPLIER" | "SIMULASI";
  label: string;
  tagihan: number | null;
};

const rupiah = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

/** Kategori yang memakai nomor HP Page 1 sebagai nomor tujuan. */
const PAKAI_NOMOR_HP: string[] = ["pulsa", "data", "ewallet"];

/* ============================ KOMPONEN ============================ */

/** QR code dari payload QRIS (EMVCo) — dirender ke canvas lokal. */
function KanvasQr({ teks, ukuran = 260 }: { teks: string; ukuran?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !teks) return;
    QRCodeLib.toCanvas(canvas, teks, {
      width: ukuran,
      margin: 1,
      errorCorrectionLevel: "M",
    }).catch((err) => console.warn("[STOP-UP!] Gagal render QR:", err));
  }, [teks, ukuran]);

  return (
    <canvas
      ref={ref}
      className="rounded-2xl bg-white p-2 shadow-[0_0_40px_-10px_rgba(56,189,248,0.7)]"
    />
  );
}

/** Tombol besar kiosk (min 64px, umpan balik tekan). */
function TombolKiosk({
  children,
  onClick,
  variasi = "utama",
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  variasi?: "utama" | "sekunder" | "bahaya";
  disabled?: boolean;
  className?: string;
}) {
  const gaya =
    variasi === "utama"
      ? "bg-sky-500 text-slate-950 hover:bg-sky-400 border-sky-300/60"
      : variasi === "sekunder"
        ? "bg-slate-800/80 text-slate-100 border-slate-500/40 hover:border-sky-400/60"
        : "bg-rose-500/20 text-rose-100 border-rose-400/50 hover:bg-rose-500/30";
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault();
        if (!disabled) onClick();
      }}
      className={`touch-key flex min-h-16 items-center justify-center gap-2 rounded-2xl border px-6 text-base font-bold shadow-lg disabled:opacity-40 ${gaya} ${className}`}
    >
      {children}
    </button>
  );
}

/* ============================== HALAMAN ============================== */

export default function Terminal() {
  const [langkah, setLangkah] = useState<Langkah>("idle");
  const [nomorHp, setNomorHp] = useState("");
  const [kategoriCode, setKategoriCode] = useState<string>("");
  const [brandCode, setBrandCode] = useState<string>("");
  const [produk, setProduk] = useState<Produk | null>(null);
  const [targetNo, setTargetNo] = useState("");
  const [email, setEmail] = useState("");
  const [notifWa, setNotifWa] = useState("");
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [inquiry, setInquiry] = useState<HasilInquiry | null>(null);
  const [memproses, setMemproses] = useState(false);
  const [pesanGalat, setPesanGalat] = useState<string | null>(null);
  const [strukPending, setStrukPending] = useState(false);
  const [peringatan, setPeringatan] = useState<number | null>(null);
  const bootstrapRef = useRef(false);
  const menungguSejak = useRef<number | null>(null);

  const printer = useThermalPrinter();

  /* ---------------------------- Data server ---------------------------- */
  const terminal = useQuery(api.stopup.terminals.terminalDefault);
  const pengaturan = useQuery(api.stopup.settings.pengaturanPublik);
  const kategoriList = useQuery(api.stopup.catalog.listCategories);
  const brandList = useQuery(
    api.stopup.catalog.listBrands,
    kategoriCode ? { categoryCode: kategoriCode } : "skip",
  );
  const produkList = useQuery(
    api.stopup.catalog.listProducts,
    kategoriCode && brandCode ? { categoryCode: kategoriCode, brandCode } : "skip",
  );
  const invoice = useQuery(
    api.stopup.transactions.getInvoice,
    invoiceId ? { invoiceId } : "skip",
  );

  const bootstrap = useMutation(api.stopup.suppliers.bootstrap);
  const heartbeat = useMutation(api.stopup.terminals.heartbeat);
  const logPrinter = useMutation(api.stopup.terminals.logPrinter);
  const createInvoice = useMutation(api.stopup.transactions.createInvoice);
  const markPaid = useMutation(api.stopup.transactions.markPaid);
  const batalkanInvoice = useMutation(api.stopup.transactions.batalkanInvoice);
  const tandaiStrukViaWhatsapp = useMutation(api.stopup.transactions.tandaiStrukViaWhatsapp);
  const inquiryPelanggan = useAction(api.stopup.supplierActions.inquiryPelanggan);

  const operator: Operator | null = useMemo(() => deteksiOperator(nomorHp), [nomorHp]);
  const brandTerpilih: Brand | null = useMemo(
    () => brandList?.find((b) => b.code === brandCode) ?? null,
    [brandList, brandCode],
  );
  const penundaan = pengaturan?.supplierTimeoutDetik ?? 25;

  /* ------------------ Provisioning sekali untuk DB kosong ------------------ */
  useEffect(() => {
    if (bootstrapRef.current) return;
    if (kategoriList === undefined) return;
    if (kategoriList.length > 0) return;
    bootstrapRef.current = true;
    void bootstrap({}).catch(() => {
      bootstrapRef.current = false;
    });
  }, [kategoriList, bootstrap]);

  /* ------------------------- Heartbeat & perangkat ------------------------- */
  useEffect(() => {
    const kode = terminal?.code;
    if (!kode) return;
    const kirim = () => {
      // Bila perangkat ini memang tidak punya integrasi printer (browser tanpa
      // Web Serial), JANGAN dilaporkan sebagai printer rusak/kertas habis —
      // perangkat itu hanya belum bagian dari terminal berprinter.
      const printerTersedia = !printer.didukung || printer.siap;
      void heartbeat({
        code: kode,
        version: "1.0.0",
        paperStatus: printerTersedia ? "OK" : "LOW",
        printerConnected: printerTersedia,
      }).catch(() => undefined);
    };
    kirim();
    const t = window.setInterval(kirim, 60_000);
    return () => window.clearInterval(t);
  }, [terminal?.code, printer.siap, heartbeat]);

  /* ------------------------ Auto-reload harian (03.00 WIB) ------------------------ */
  useEffect(() => {
    const jam = pengaturan?.autoReloadJamWib ?? 3;
    const t = window.setInterval(() => {
      if (langkah !== "idle") return;
      const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
      if (wib.getUTCHours() === jam && wib.getUTCMinutes() < 5) {
        window.location.reload();
      }
    }, 60_000);
    return () => window.clearInterval(t);
  }, [langkah, pengaturan?.autoReloadJamWib]);

  /* --------------------------- Mode kiosk lockdown --------------------------- */
  useEffect(() => {
    const cegahMenu = (e: Event) => e.preventDefault();
    const cegahTombol = (e: KeyboardEvent) => {
      const k = e.key.toUpperCase();
      if (
        k === "F12" ||
        (e.ctrlKey && (k === "W" || k === "R" || k === "P" || k === "N")) ||
        (e.ctrlKey && e.shiftKey && (k === "I" || k === "J" || k === "C")) ||
        (e.altKey && k === "TAB")
      ) {
        e.preventDefault();
      }
    };
    document.addEventListener("contextmenu", cegahMenu);
    document.addEventListener("keydown", cegahTombol);
    return () => {
      document.removeEventListener("contextmenu", cegahMenu);
      document.removeEventListener("keydown", cegahTombol);
    };
  }, []);

  /* ---------------------------- Auto reset idle ---------------------------- */
  const resetKeIdle = useCallback(() => {
    setLangkah("idle");
    setNomorHp("");
    setKategoriCode("");
    setBrandCode("");
    setProduk(null);
    setTargetNo("");
    setEmail("");
    setNotifWa("");
    setInvoiceId(null);
    setInquiry(null);
    setPesanGalat(null);
    setStrukPending(false);
    setPeringatan(null);
    menungguSejak.current = null;
  }, []);

  useEffect(() => {
    if (langkah === "idle") {
      setPeringatan(null);
      return;
    }
    const batas = (pengaturan?.idleResetDetik ?? 45) * 1000;
    let timer: number;
    const pasang = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setPeringatan(pengaturan?.idleWarningDetik ?? 15), batas);
    };
    const aktif = () => {
      setPeringatan(null);
      pasang();
    };
    pasang();
    const even = ["pointerdown", "keydown", "pointermove"] as const;
    even.forEach((e) => window.addEventListener(e, aktif, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      even.forEach((e) => window.removeEventListener(e, aktif));
    };
  }, [langkah, pengaturan?.idleResetDetik, pengaturan?.idleWarningDetik]);

  // Hitung mundur popup peringatan → reset otomatis.
  useEffect(() => {
    if (peringatan === null) return;
    if (peringatan <= 0) {
      resetKeIdle();
      return;
    }
    const t = window.setTimeout(() => setPeringatan((n) => (n === null ? null : n - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [peringatan, resetKeIdle]);

  /* ------------------------- Pantau status invoice ------------------------- */
  useEffect(() => {
    if (!invoice || !invoiceId) return;
    if (invoice.status === "SUCCESS" || invoice.status === "FAILED") {
      setStrukPending(false);
      setLangkah("struk");
      return;
    }
    if (invoice.status === "EXPIRED") {
      setPesanGalat("Waktu pembayaran habis. Silakan ulangi transaksi.");
      setInvoiceId(null);
      setLangkah("katalog");
    }
  }, [invoice, invoiceId]);

  // Batas tunggu supplier di layar 25 detik → struk sementara (pending).
  useEffect(() => {
    if (langkah !== "qris") {
      menungguSejak.current = null;
      return;
    }
    if (invoice?.status === "PROCESSING" && menungguSejak.current === null) {
      menungguSejak.current = Date.now();
    }
    const t = window.setInterval(() => {
      if (menungguSejak.current && Date.now() - menungguSejak.current > penundaan * 1000) {
        setStrukPending(true);
        setLangkah("struk");
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [langkah, invoice?.status, penundaan]);

  /* ---------------------------- Smart routing ---------------------------- */
  // Pulsa/Paket Data langsung difilter ke operator dari nomor HP Page 1.
  useEffect(() => {
    if (langkah !== "katalog") return;
    if (!PAKAI_NOMOR_HP.includes(kategoriCode)) return;
    if (!brandList || brandList.length === 0) return;
    if (brandCode && brandList.some((b) => b.code === brandCode)) return;
    const cocok =
      operator && brandList.find((b) => b.code === operator.kode) ? operator.kode : brandList[0].code;
    setBrandCode(cocok);
  }, [langkah, kategoriCode, brandList, brandCode, operator]);

  /* ------------------------------ Aksi alur ------------------------------ */

  const mulaiDariIdle = () => {
    setLangkah("nomor");
    setNotifWa(nomorHp || "");
  };

  const lanjutKeKatalog = () => {
    const cek = validasiNomorHp(nomorHp);
    if (!cek.valid) {
      setPesanGalat(cek.pesan ?? "Nomor tidak valid.");
      return;
    }
    setPesanGalat(null);
    setNotifWa((n) => n || nomorHp);
    if (!kategoriCode) setKategoriCode("pulsa");
    setLangkah("katalog");
  };

  const pilihProduk = (p: Produk) => {
    setProduk(p);
    setPesanGalat(null);
    if (PAKAI_NOMOR_HP.includes(kategoriCode)) {
      setTargetNo(nomorHp);
      void keKonfirmasi(nomorHp, p);
      return;
    }
    setLangkah("target");
  };

  const keKonfirmasi = async (target: string, p: Produk) => {
    setMemproses(true);
    setInquiry(null);
    try {
      // Produk e-wallet & PPOB butuh nama pemilik akun (partial masking).
      if (p.deliveryType === "PPOB_INQUIRY" || kategoriCode === "ewallet") {
        const hasil = (await inquiryPelanggan({
          brandCode: brandTerpilih?.code ?? "PLNTOKEN",
          targetNo: target,
        })) as HasilInquiry;
        setInquiry(hasil);
      }
      if (!notifWa) setNotifWa(nomorHp);
      setLangkah("konfirmasi");
    } catch (err) {
      setPesanGalat(err instanceof Error ? err.message : "Gagal mengambil data pelanggan.");
    } finally {
      setMemproses(false);
    }
  };

  const lanjutDariTarget = () => {
    if (!produk) return;
    if (produk.deliveryType === "INJECT_EMAIL") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
        setPesanGalat("Format email belum benar (contoh: nama@gmail.com).");
        return;
      }
      setTargetNo(email.trim());
      void keKonfirmasi(email.trim(), produk);
      return;
    }
    if (!brandTerpilih) return;
    const digit = targetNo.replace(/\D/g, "");
    if (digit.length < brandTerpilih.minDigit || digit.length > brandTerpilih.maxDigit) {
      const rentang =
        brandTerpilih.minDigit === brandTerpilih.maxDigit
          ? `${brandTerpilih.minDigit}`
          : `${brandTerpilih.minDigit}–${brandTerpilih.maxDigit}`;
      setPesanGalat(`${brandTerpilih.labelTarget} harus ${rentang} digit.`);
      return;
    }
    setPesanGalat(null);
    void keKonfirmasi(digit, produk);
  };

  const bayarSekarang = async () => {
    if (!produk || !terminal) return;
    setMemproses(true);
    setPesanGalat(null);
    try {
      const hasil = await createInvoice({
        terminalCode: terminal.code,
        productId: produk.id as never,
        targetNo,
        notifWhatsapp: notifWa || nomorHp,
        buyerPhone: nomorHp,
        accountNameMasked: inquiry?.namaMasked,
      });
      setInvoiceId(hasil.invoiceId);
      menungguSejak.current = null;
      setLangkah("qris");
    } catch (err) {
      setPesanGalat(err instanceof Error ? err.message : "Gagal membuat tagihan.");
    } finally {
      setMemproses(false);
    }
  };

  const simulasiBayar = async () => {
    if (!invoiceId) return;
    try {
      await markPaid({ invoiceId, simulasi: true });
    } catch (err) {
      setPesanGalat(err instanceof Error ? err.message : "Gagal menandai pembayaran.");
    }
  };

  const batalkan = async () => {
    if (invoiceId) await batalkanInvoice({ invoiceId }).catch(() => undefined);
    setInvoiceId(null);
    setLangkah("katalog");
  };

  /** Susun data struk dari invoice (dipakai cetak & WhatsApp). */
  const dataStruk = useCallback((): DataStruk | null => {
    if (!invoice) return null;
    return {
      namaMerchant: pengaturan?.namaMerchantStruk ?? "STOP-UP! DIGITAL",
      alamat: pengaturan?.alamatStruk ?? "Terminal STOP-UP!",
      terminal: invoice.terminalCode,
      invoiceId: invoice.invoiceId,
      waktu: labelWaktuWib(invoice.createdAt),
      item: {
        nama: invoice.produkNama,
        tujuan: invoice.targetNo,
        harga: invoice.sellPrice,
      },
      total: invoice.sellPrice,
      metode: "QRIS",
      status: invoice.status,
      snRef: invoice.snRef,
      voucherCode: invoice.voucherCode,
      namaPelangganMasked: invoice.accountNameMasked,
      footer: pengaturan?.footerStruk,
      pending: strukPending || invoice.status === "PROCESSING",
    };
  }, [invoice, pengaturan, strukPending]);

  const cetakStruk = async () => {
    const data = dataStruk();
    if (!data) return;
    const hasil = await printer.cetak(buildStrukBytes(data));
    if (!hasil.sukses) {
      // Kertas habis / printer terputus → bukti bayar dialihkan ke WhatsApp.
      await logPrinter({
        code: terminal?.code ?? "SU-01",
        paperStatus: "EMPTY",
        printerConnected: false,
        catatan: hasil.pesan ?? "Cetak gagal",
      }).catch(() => undefined);
      await tandaiStrukViaWhatsapp({
        invoiceId: data.invoiceId,
        catatan: hasil.pesan,
      }).catch(() => undefined);
      kirimWhatsapp(true);
      return;
    }
  };

  const kirimWhatsapp = (gantiStruk = false) => {
    const data = dataStruk();
    if (!data) return;
    const pesan =
      (gantiStruk
        ? "⚠️ Printer terminal tidak dapat mencetak struk. Berikut bukti pembayaran digital Anda:\n\n"
        : "Bukti pembayaran STOP-UP!:\n\n") + formatStrukTeks(data);
    window.open(tautanWhatsApp(invoice?.notifWhatsapp ?? nomorHp, pesan), "_blank", "noopener");
  };

  /* ------------------------------- Render ------------------------------- */

  if (langkah === "idle") {
    return (
      <IdleScreen
        onMulai={mulaiDariIdle}
        namaTerminal={terminal?.name}
        promo={[
          "Cashback pulsa Telkomsel & Indosat hari ini",
          "Token PLN bebas biaya admin",
          "Top-up e-wallet instan, langsung masuk",
        ]}
      />
    );
  }

  const judulLangkah =
    langkah === "nomor"
      ? "Masukkan Nomor HP"
      : langkah === "katalog"
        ? "Pilih Layanan"
        : langkah === "target"
          ? brandTerpilih?.labelTarget ?? "Nomor Tujuan"
          : langkah === "konfirmasi"
            ? "Konfirmasi Pesanan"
            : langkah === "qris"
              ? "Pembayaran QRIS"
              : "Struk";

  return (
    <div className="kiosk-viewport kiosk-night kiosk-skyline relative flex flex-col">
      {/* ---------------- Header kiosk ---------------- */}
      <header className="flex shrink-0 items-center justify-between border-b border-slate-700/40 px-5 py-3">
        <div className="flex items-center gap-4">
          <LogoStopUp size={26} />
          <span className="hidden text-xs uppercase tracking-[0.28em] text-slate-500 sm:inline">
            {terminal?.code ?? "SU-01"} · {terminal?.location ?? "Lokasi belum diatur"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full border border-slate-600/40 px-3 py-1.5 text-[11px] text-slate-300">
            <ShieldCheck className="size-3.5 text-emerald-300" />
            {printer.siap ? "Printer siap" : "Printer standby"}
          </span>
          <span className="font-mono text-xs text-slate-400">
            {labelWaktuWib(Date.now())}
          </span>
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              resetKeIdle();
            }}
            className="touch-key flex min-h-11 items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/15 px-4 text-xs font-bold text-rose-100"
          >
            <X className="size-3.5" /> BATAL
          </button>
        </div>
      </header>

      {/* ---------------- Judul langkah ---------------- */}
      <div className="flex shrink-0 items-center gap-3 px-5 pt-4">
        {langkah !== "nomor" ? (
          <button
            type="button"
            aria-label="Kembali"
            onPointerDown={(e) => {
              e.preventDefault();
              if (langkah === "katalog") setLangkah("nomor");
              else if (langkah === "target") setLangkah("katalog");
              else if (langkah === "konfirmasi") setLangkah("katalog");
              else resetKeIdle();
            }}
            className="touch-key flex size-12 items-center justify-center rounded-2xl border border-slate-600/40 bg-slate-800/70 text-slate-200"
          >
            <ArrowLeft className="size-5" />
          </button>
        ) : null}
        <div>
          <h1 className="text-xl font-black tracking-wide text-slate-50">{judulLangkah}</h1>
          <p className="text-xs text-slate-400">
            {langkah === "nomor"
              ? "Nomor ini dipakai untuk pengiriman produk & invoice WhatsApp"
              : langkah === "katalog"
                ? "Sentuh tab layanan, lalu pilih produk"
                : "Periksa data sebelum membayar"}
          </p>
        </div>
      </div>

      {pesanGalat ? (
        <div className="mx-5 mt-3 flex items-center gap-2 rounded-2xl border border-rose-400/40 bg-rose-500/15 px-4 py-3 text-sm text-rose-100">
          <TriangleAlert className="size-4 shrink-0" />
          {pesanGalat}
        </div>
      ) : null}

      {/* ---------------- Konten langkah ---------------- */}
      <main className="kiosk-scroll flex-1 px-5 py-4">
        {langkah === "nomor" ? (
          <LangkahNomor
            nomor={nomorHp}
            operator={operator}
            onAngka={(d) => setNomorHp((n) => normalisasiNomorHp(n + d))}
            onHapus={() => setNomorHp((n) => n.slice(0, -1))}
            onBersihkan={() => setNomorHp("")}
            onLanjut={lanjutKeKatalog}
          />
        ) : null}

        {langkah === "katalog" ? (
          <LangkahKatalog
            kategori={kategoriList ?? []}
            kategoriCode={kategoriCode}
            onKategori={setKategoriCode}
            brand={brandList ?? []}
            brandCode={brandCode}
            onBrand={setBrandCode}
            produk={produkList ?? []}
            operator={operator}
            onPilih={pilihProduk}
          />
        ) : null}

        {langkah === "target" ? (
          <LangkahTarget
            produk={produk}
            brand={brandTerpilih}
            email={email}
            setEmail={setEmail}
            targetNo={targetNo}
            setTargetNo={setTargetNo}
            onLanjut={lanjutDariTarget}
            memproses={memproses}
          />
        ) : null}

        {langkah === "konfirmasi" && produk ? (
          <LangkahKonfirmasi
            produk={produk}
            brand={brandTerpilih}
            kategoriCode={kategoriCode}
            nomorHp={nomorHp}
            targetNo={targetNo}
            inquiry={inquiry}
            notifWa={notifWa}
            setNotifWa={setNotifWa}
            memproses={memproses}
            onBayar={bayarSekarang}
          />
        ) : null}

        {langkah === "qris" && invoice ? (
          <LangkahQris
            invoice={invoice}
            penundaan={penundaan}
            onSimulasi={simulasiBayar}
            onBatalkan={batalkan}
          />
        ) : null}

        {langkah === "struk" && invoice ? (
          <LangkahStruk
            invoice={invoice}
            pending={strukPending || invoice.status === "PROCESSING"}
            printerSiap={printer.siap}
            printerDidukung={printer.didukung}
            onSambungkanPrinter={printer.sambungkan}
            onCetak={cetakStruk}
            onWhatsapp={() => kirimWhatsapp(false)}
            onSelesai={resetKeIdle}
          />
        ) : null}
      </main>

      {/* ---------------- Popup peringatan idle ---------------- */}
      {peringatan !== null ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md">
          <div className="kiosk-surface w-[min(92vw,460px)] rounded-3xl p-7 text-center">
            <Clock className="mx-auto size-10 text-amber-300" />
            <h2 className="mt-4 text-lg font-black text-slate-50">
              Masih di sana?
            </h2>
            <p className="mt-1.5 text-sm text-slate-300">
              Sesi akan direset otomatis dalam{" "}
              <span className="font-mono text-lg font-bold text-amber-200">{peringatan}</span>{" "}
              detik.
            </p>
            <TombolKiosk className="mt-6 w-full" onClick={() => setPeringatan(null)}>
              LANJUTKAN TRANSAKSI
            </TombolKiosk>
            <TombolKiosk
              variasi="sekunder"
              className="mt-3 w-full"
              onClick={resetKeIdle}
            >
              SELESAI &amp; KEMBALI KE AWAL
            </TombolKiosk>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ============================ SUB-LANGKAH ============================ */

function LangkahNomor({
  nomor,
  operator,
  onAngka,
  onHapus,
  onBersihkan,
  onLanjut,
}: {
  nomor: string;
  operator: Operator | null;
  onAngka: (digit: string) => void;
  onHapus: () => void;
  onBersihkan: () => void;
  onLanjut: () => void;
}) {
  const cek = validasiNomorHp(nomor);
  const cukup = nomor.length >= 4;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        {/* Display nomor */}
        <div className="kiosk-surface rounded-3xl p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Nomor Handphone</p>
          <p className="mt-3 font-mono text-4xl font-black tracking-wider text-slate-50 sm:text-5xl">
            {nomor || <span className="text-slate-600">08xxxxxxxxxx</span>}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-slate-600/40 px-3 py-1 font-mono text-xs text-slate-400">
              {nomor.length} / 13 digit
            </span>
            {cukup && operator ? (
              <span
                className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold"
                style={{
                  borderColor: `${operator.warna}80`,
                  color: operator.warna,
                  boxShadow: `0 0 18px -6px ${operator.warna}`,
                }}
              >
                <span>{operator.icon}</span> {operator.nama}
              </span>
            ) : null}
            {cukup && !operator ? (
              <span className="rounded-full border border-amber-400/40 px-3 py-1 text-xs text-amber-200">
                Prefix belum dikenali
              </span>
            ) : null}
          </div>
        </div>

        {/* Catatan validasi */}
        <div className="kiosk-surface rounded-3xl p-5">
          <p className="text-sm font-semibold text-slate-200">Syarat nomor</p>
          <ul className="mt-2 space-y-1 text-xs text-slate-400">
            <li>• Panjang 10 – 13 digit dan diawali <span className="font-mono">08</span>.</li>
            <li>• Menulis <span className="font-mono">62</span> / <span className="font-mono">+62</span> otomatis menjadi <span className="font-mono">08</span>.</li>
            <li>• Operator dideteksi otomatis dari 4 digit pertama.</li>
          </ul>
          <p className="mt-3 text-xs text-rose-200">{cek.valid ? "" : cek.pesan}</p>
        </div>

        <TombolKiosk className="w-full" onClick={onLanjut} disabled={!cek.valid}>
          LANJUT PILIH LAYANAN
        </TombolKiosk>
      </div>

      <div className="kiosk-surface rounded-3xl p-4">
        <Numpad onAngka={onAngka} onHapus={onHapus} onBersihkan={onBersihkan} />
        <p className="mt-3 text-center text-[11px] text-slate-500">
          Bisa juga mengetik langsung dari keyboard
        </p>
      </div>
    </div>
  );
}

function LangkahKatalog({
  kategori,
  kategoriCode,
  onKategori,
  brand,
  brandCode,
  onBrand,
  produk,
  operator,
  onPilih,
}: {
  kategori: Kategori[];
  kategoriCode: string;
  onKategori: (code: string) => void;
  brand: Brand[];
  brandCode: string;
  onBrand: (code: string) => void;
  produk: Produk[];
  operator: Operator | null;
  onPilih: (p: Produk) => void;
}) {
  const kategoriAktif = kategori.find((k) => k.code === kategoriCode);
  const brandAktif = brand.find((b) => b.code === brandCode);
  const urutOperator = PAKAI_NOMOR_HP.includes(kategoriCode) && operator;

  return (
    <div className="space-y-4">
      {/* Tab layanan */}
      <div className="flex flex-wrap gap-2.5">
        {kategori.map((k) => {
          const aktif = k.code === kategoriCode;
          return (
            <button
              key={k.code}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                onKategori(k.code);
              }}
              className={`touch-key flex min-h-16 items-center gap-2.5 rounded-2xl border px-5 text-sm font-bold ${
                aktif
                  ? "border-sky-300/70 bg-sky-500/90 text-slate-950 shadow-[0_0_28px_-8px_rgba(56,189,248,0.9)]"
                  : "kiosk-surface border-slate-600/40 text-slate-200"
              }`}
            >
              <span className="text-xl">{k.icon}</span>
              {k.name}
            </button>
          );
        })}
      </div>

      {kategori.length === 0 ? (
        <div className="kiosk-surface rounded-3xl p-8 text-center text-sm text-slate-400">
          Katalog belum tersedia. Mencoba menyiapkan katalog awal…
        </div>
      ) : null}

      {/* Filter brand */}
      {brand.length > 0 ? (
        <div className="kiosk-surface rounded-3xl p-4">
          <p className="mb-3 text-xs uppercase tracking-[0.28em] text-slate-500">
            {kategoriAktif?.name ?? "Provider"} — pilih brand
          </p>
          <div className="flex flex-wrap gap-2">
            {brand.map((b) => {
              const aktif = b.code === brandCode;
              const disarankan = urutOperator && operator?.kode === b.code;
              return (
                <button
                  key={b.code}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onBrand(b.code);
                  }}
                  className={`touch-key flex min-h-14 items-center gap-2 rounded-2xl border px-4 text-sm font-bold ${
                    aktif
                      ? "border-transparent text-slate-950"
                      : "border-slate-600/40 bg-slate-800/60 text-slate-200"
                  }`}
                  style={aktif ? { backgroundColor: b.color } : undefined}
                >
                  <span className="text-lg">{b.icon}</span>
                  {b.name}
                  {disarankan ? (
                    <span className="rounded-full bg-slate-950/40 px-2 py-0.5 text-[10px] font-bold text-slate-100">
                      OTOMATIS
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Grid produk */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {produk.map((p) => (
          <button
            key={p.id}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              onPilih(p);
            }}
            className="kiosk-surface kiosk-surface-hover touch-key relative min-h-[104px] rounded-3xl p-4 text-left"
          >
            {p.badgeLabel ? (
              <span className="absolute right-3 top-3 rounded-full bg-amber-400/90 px-2.5 py-1 text-[10px] font-black tracking-wide text-slate-900">
                {p.badgeLabel}
              </span>
            ) : null}
            <div className="flex items-start gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-slate-700/60 text-2xl">
                {p.iconUrl ? (
                  <img src={p.iconUrl} alt="" className="size-8 object-contain" />
                ) : (
                  p.icon
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-50">{p.name}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-400">
                  {p.description}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-end justify-between">
              <span className="font-mono text-lg font-black text-emerald-300">
                {rupiah(p.harga)}
              </span>
              {p.hargaCoret ? (
                <span className="font-mono text-xs text-slate-500 line-through">
                  {rupiah(p.hargaCoret)}
                </span>
              ) : null}
            </div>
          </button>
        ))}
      </div>

      {brandAktif && produk.length === 0 ? (
        <div className="kiosk-surface rounded-3xl p-8 text-center text-sm text-slate-400">
          Tidak ada produk aktif untuk {brandAktif.name}.
        </div>
      ) : null}
    </div>
  );
}

function LangkahTarget({
  produk,
  brand,
  email,
  setEmail,
  targetNo,
  setTargetNo,
  onLanjut,
  memproses,
}: {
  produk: Produk | null;
  brand: Brand | null;
  email: string;
  setEmail: (v: string) => void;
  targetNo: string;
  setTargetNo: (v: string) => void;
  onLanjut: () => void;
  memproses: boolean;
}) {
  if (!produk) return null;
  const butuhEmail = produk.deliveryType === "INJECT_EMAIL";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="kiosk-surface rounded-3xl p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
          {butuhEmail ? "Email Pembeli" : brand?.labelTarget ?? "Nomor Tujuan"}
        </p>
        <p className="mt-2.5 font-mono text-2xl font-black break-all text-slate-50 sm:text-3xl">
          {butuhEmail ? email || <span className="text-slate-600">nama@domain.com</span> : targetNo || <span className="text-slate-600">{brand?.contohId || "000000000000"}</span>}
        </p>
        <p className="mt-3 text-xs text-slate-400">
          {butuhEmail
            ? "Produk ini dikirim dengan cara injeksi ke email pembeli. Pastikan email aktif."
            : `Produk ${produk.name} membutuhkan ${
                brand?.minDigit === brand?.maxDigit
                  ? `${brand?.minDigit}`
                  : `${brand?.minDigit}–${brand?.maxDigit}`
              } digit.`}
        </p>

        {butuhEmail ? (
          /* Input teks tetap aktif — keyboard fisik boleh dipakai. */
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value.toLowerCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") onLanjut();
            }}
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            placeholder="nama@domain.com"
            className="mt-4 h-16 w-full rounded-2xl border border-slate-600/50 bg-slate-900/70 px-4 font-mono text-lg text-slate-50 outline-none focus:border-sky-400"
          />
        ) : null}

        <TombolKiosk className="mt-5 w-full" onClick={onLanjut} disabled={memproses}>
          {memproses ? "MEMERIKSA DATA…" : "LANJUT KE KONFIRMASI"}
        </TombolKiosk>
      </div>

      <div className="kiosk-surface rounded-3xl p-4">
        {butuhEmail ? (
          <VirtualKeyboard
            onKey={(k) => setEmail(`${email}${k}`.toLowerCase())}
            onBackspace={() => setEmail(email.slice(0, -1))}
            onClear={() => setEmail("")}
            onEnter={onLanjut}
            labelEnter="LANJUT"
          />
        ) : (
          <>
            <Numpad
              onAngka={(d) => setTargetNo(`${targetNo}${d}`)}
              onHapus={() => setTargetNo(targetNo.slice(0, -1))}
              onBersihkan={() => setTargetNo("")}
            />
            <p className="mt-3 text-center text-[11px] text-slate-500">
              {brand?.labelTarget ?? "Nomor Tujuan"} · contoh {brand?.contohId || "000000000000"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function LangkahKonfirmasi({
  produk,
  brand,
  kategoriCode,
  nomorHp,
  targetNo,
  inquiry,
  notifWa,
  setNotifWa,
  memproses,
  onBayar,
}: {
  produk: Produk;
  brand: Brand | null;
  kategoriCode: string;
  nomorHp: string;
  targetNo: string;
  inquiry: HasilInquiry | null;
  notifWa: string;
  setNotifWa: (v: string) => void;
  memproses: boolean;
  onBayar: () => void;
}) {
  const butuhEmail = produk.deliveryType === "INJECT_EMAIL";
  const targetTampil = butuhEmail
    ? maskEmail(targetNo)
    : PAKAI_NOMOR_HP.includes(kategoriCode)
      ? maskNomorHp(targetNo)
      : maskIdPelanggan(targetNo);
  const total = produk.harga + (inquiry?.tagihan ?? 0);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="kiosk-surface rounded-3xl p-6">
        <div className="flex items-start gap-4">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-slate-700/60 text-3xl">
            {produk.icon}
          </span>
          <div>
            <p className="text-lg font-black text-slate-50">{produk.name}</p>
            <p className="text-xs text-slate-400">
              {brand?.name} · {produk.deliveryType.replace("_", " ")}
            </p>
          </div>
        </div>

        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-400">Nomor tujuan</dt>
            <dd className="font-mono text-slate-100">{targetTampil}</dd>
          </div>
          {inquiry ? (
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-400">{inquiry.label}</dt>
              <dd className="flex items-center gap-2">
                <span className="font-bold text-slate-100">{inquiry.namaMasked}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                    inquiry.sumber === "SUPPLIER"
                      ? "bg-emerald-400/20 text-emerald-200"
                      : "bg-amber-400/20 text-amber-200"
                  }`}
                >
                  {inquiry.sumber}
                </span>
              </dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-400">Nomor WhatsApp invoice</dt>
            <dd className="font-mono text-slate-100">{maskNomorHp(notifWa || nomorHp)}</dd>
          </div>
          {inquiry?.tagihan ? (
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-400">Tagihan (dari supplier)</dt>
              <dd className="font-mono text-slate-100">{rupiah(inquiry.tagihan)}</dd>
            </div>
          ) : null}
        </dl>

        {/* Target invoice fleksibel — boleh diubah sebelum bayar */}
        <div className="mt-5 rounded-2xl border border-slate-600/40 bg-slate-900/60 p-4">
          <label className="text-xs uppercase tracking-[0.24em] text-slate-500">
            Kirim invoice ke nomor WhatsApp lain
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              value={notifWa}
              onChange={(e) => setNotifWa(normalisasiNomorHp(e.target.value))}
              inputMode="numeric"
              className="h-14 flex-1 rounded-xl border border-slate-600/50 bg-slate-950/60 px-4 font-mono text-base text-slate-50 outline-none focus:border-sky-400"
              placeholder="08xxxxxxxxxx"
            />
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                setNotifWa(nomorHp);
              }}
              className="touch-key h-14 rounded-xl border border-slate-600/40 px-4 text-xs font-bold text-slate-200"
            >
              Pakai nomor saya
            </button>
          </div>
        </div>
      </div>

      <div className="kiosk-surface flex flex-col rounded-3xl p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Total Bayar</p>
        <p className="mt-2 font-mono text-4xl font-black text-emerald-300">
          {rupiah(total)}
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Pembayaran QRIS — bisa dipindai semua aplikasi bank &amp; e-wallet.
        </p>

        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-xs text-emerald-100">
          <ShieldCheck className="size-4 shrink-0" />
          Produk dikirim otomatis setelah pembayaran terverifikasi.
        </div>

        <TombolKiosk className="mt-auto w-full" onClick={onBayar} disabled={memproses}>
          <CreditCard className="size-5" />
          {memproses ? "MEMBUAT TAGIHAN…" : "BAYAR DENGAN QRIS"}
        </TombolKiosk>
      </div>
    </div>
  );
}

function LangkahQris({
  invoice,
  penundaan,
  onSimulasi,
  onBatalkan,
}: {
  invoice: InvoiceView;
  penundaan: number;
  onSimulasi: () => void;
  onBatalkan: () => void;
}) {
  const [sisa, setSisa] = useState(() =>
    invoice.pembayaran ? sisaDetik(invoice.pembayaran.expiresAt) : 0,
  );
  const [lewat, setLewat] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => {
      if (invoice.pembayaran) setSisa(sisaDetik(invoice.pembayaran.expiresAt));
      if (invoice.status === "PROCESSING" || invoice.status === "PENDING") {
        setLewat((n) => n + 1);
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [invoice.pembayaran, invoice.status]);

  const menit = Math.floor(sisa / 60);
  const detik = String(sisa % 60).padStart(2, "0");

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className="kiosk-surface flex flex-col items-center rounded-3xl p-6">
        {invoice.pembayaran ? (
          <KanvasQr teks={invoice.pembayaran.qrString} ukuran={248} />
        ) : null}
        <p className="mt-4 font-mono text-3xl font-black text-slate-50">
          {rupiah(invoice.pembayaran?.amount ?? invoice.sellPrice)}
        </p>
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
          <Clock className="size-3.5" />
          Berlaku <span className="font-mono text-amber-200">{menit}:{detik}</span>
        </div>
        <p className="mt-2 font-mono text-[11px] text-slate-500">{invoice.invoiceId}</p>
      </div>

      <div className="space-y-4">
        <div className="kiosk-surface rounded-3xl p-6">
          <p className="text-lg font-black text-slate-50">
            Pindai QR dengan aplikasi bank / e-wallet
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
            <li>1. Buka aplikasi pembayaran pilihan Anda.</li>
            <li>2. Pilih menu <span className="font-semibold">QRIS / Scan QR</span>.</li>
            <li>3. Arahkan kamera ke QR di layar ini.</li>
            <li>4. Periksa nominal, lalu konfirmasi pembayaran.</li>
          </ul>
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-xs text-sky-100">
            <ShieldCheck className="size-4 shrink-0" />
            Status pembayaran otomatis terdeteksi — struk tercetak sendiri.
          </div>
        </div>

        <div className="kiosk-surface rounded-3xl p-6">
          <p className="text-sm font-bold text-slate-100">Status</p>
          <p className="mt-1 text-sm text-slate-300">
            {invoice.status === "PENDING"
              ? "Menunggu pembayaran…"
              : invoice.status === "PROCESSING"
                ? `Pembayaran diterima. Menunggu konfirmasi supplier… (${lewat}s / ${penundaan}s)`
                : invoice.status}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-700/60">
            <div
              className="h-full rounded-full bg-sky-400 transition-all"
              style={{
                width: `${
                  invoice.status === "PENDING"
                    ? 30
                    : Math.min(100, Math.round((lewat / Math.max(1, penundaan)) * 100))
                }%`,
              }}
            />
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <TombolKiosk className="flex-1" onClick={onSimulasi}>
              SIMULASI PEMBAYARAN
            </TombolKiosk>
            <TombolKiosk variasi="bahaya" className="sm:w-48" onClick={onBatalkan}>
              BATALKAN
            </TombolKiosk>
          </div>
          <p className="mt-3 text-[11px] leading-4 text-slate-500">
            Tombol simulasi hanya untuk pengujian tanpa payment gateway. Pada
            produksi, status berubah dari callback QRIS bertanda tangan HMAC.
          </p>
        </div>
      </div>
    </div>
  );
}

function LangkahStruk({
  invoice,
  pending,
  printerSiap,
  printerDidukung,
  onSambungkanPrinter,
  onCetak,
  onWhatsapp,
  onSelesai,
}: {
  invoice: InvoiceView;
  pending: boolean;
  printerSiap: boolean;
  printerDidukung: boolean;
  onSambungkanPrinter: () => void;
  onCetak: () => void;
  onWhatsapp: () => void;
  onSelesai: () => void;
}) {
  const gagal = invoice.status === "FAILED";
  const warna = gagal
    ? "text-rose-300"
    : pending
      ? "text-amber-300"
      : "text-emerald-300";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="kiosk-surface rounded-3xl p-7 text-center">
        {gagal ? (
          <TriangleAlert className="mx-auto size-12 text-rose-300" />
        ) : (
          <CheckCircle2 className={`mx-auto size-12 ${warna}`} />
        )}
        <h2 className={`mt-3 text-2xl font-black ${warna}`}>
          {gagal
            ? "Transaksi Gagal"
            : pending
              ? "Pembayaran Berhasil — Produk Sedang Diproses"
              : "Pembayaran Berhasil"}
        </h2>
        <p className="mt-1.5 text-sm text-slate-300">
          {gagal
            ? invoice.catatanGagal ?? "Produk tidak dapat diproses supplier."
            : pending
              ? "Bukti sementara dicetak. Update status dikirim ke WhatsApp Anda."
              : "Produk sudah dikirim dan struk siap dicetak."}
        </p>

        <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
          <InfoBaris label="Invoice" nilai={invoice.invoiceId} mono />
          <InfoBaris label="Produk" nilai={invoice.produkNama} />
          <InfoBaris label="Tujuan" nilai={invoice.targetNo} mono />
          <InfoBaris label="Total" nilai={rupiah(invoice.sellPrice)} mono />
          {invoice.snRef ? <InfoBaris label="Serial Number" nilai={invoice.snRef} mono /> : null}
          {invoice.voucherCode ? (
            <InfoBaris label="Kode Voucher" nilai={invoice.voucherCode} mono tebal />
          ) : null}
        </div>
      </div>

      {invoice.voucherCode ? (
        <div className="kiosk-surface rounded-3xl border-amber-300/40 p-6 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-200/80">
            Redeem Key — simpan kode ini
          </p>
          <p className="mt-3 font-mono text-3xl font-black tracking-widest text-amber-200">
            {invoice.voucherCode}
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {!printerDidukung ? (
          <div className="kiosk-surface rounded-2xl p-4 text-xs text-slate-400 sm:col-span-3">
            Browser ini tidak mendukung Web Serial, jadi struk dialihkan 100% ke
            WhatsApp. Gunakan Chrome/Edge pada perangkat terminal untuk mencetak.
          </div>
        ) : printerSiap ? (
          <TombolKiosk variasi="sekunder" onClick={onCetak}>
            <Printer className="size-5" /> CETAK STRUK
          </TombolKiosk>
        ) : (
          <TombolKiosk variasi="sekunder" onClick={onSambungkanPrinter}>
            <Printer className="size-5" /> SAMBUNGKAN PRINTER
          </TombolKiosk>
        )}
        <TombolKiosk variasi="sekunder" onClick={onWhatsapp}>
          <Send className="size-5" /> KIRIM WHATSAPP
        </TombolKiosk>
        <TombolKiosk onClick={onSelesai}>SELESAI</TombolKiosk>
      </div>

      <p className="text-center text-[11px] text-slate-500">
        Kertas habis? Bukti bayar otomatis dialihkan ke WhatsApp saat tombol cetak
        ditekan.
      </p>
    </div>
  );
}

function InfoBaris({
  label,
  nilai,
  mono,
  tebal,
}: {
  label: string;
  nilai: string;
  mono?: boolean;
  tebal?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-900/50 px-4 py-3">
      <p className="text-[11px] uppercase tracking-widest text-slate-500">{label}</p>
      <p
        className={`mt-1 break-all text-sm ${mono ? "font-mono" : ""} ${
          tebal ? "font-black text-amber-200" : "text-slate-100"
        }`}
      >
        {nilai}
      </p>
    </div>
  );
}
