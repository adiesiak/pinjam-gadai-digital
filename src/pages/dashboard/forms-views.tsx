import { useMutation } from "convex/react";
import { ArrowRight, Loader2, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { KYC_FILES, MAX_FILE_BYTES, validateKycInput, type KycFileKey } from "@/lib/kyc";
import {
  LOAN_LIMITS,
  LOAN_PURPOSE_OPTIONS,
  quoteLoan,
  TENOR_OPTIONS,
} from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import {
  COLLATERAL_CATEGORIES,
  LTV_HINTS,
  type CollateralCategory,
} from "@/lib/pawn";

/** Form pengajuan pinjaman (KYC + GPS + tanda tangan canvas). */
export function LoanForm({ onCreated }: { onCreated: (ref: string) => void }) {
  const [pokok, setPokok] = useState<number>(LOAN_LIMITS.maxPokok);
  const [tenorHari, setTenorHari] = useState<string>("30");
  const [tujuan, setTujuan] = useState<string>("");
  const [namaLengkap, setNamaLengkap] = useState("");
  const [nomorRekening, setNomorRekening] = useState("");
  const [catatanPeminjam, setCatatanPeminjam] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ===== Tanda tangan canvas =====
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePad(canvas, {
      backgroundColor: "rgba(255,255,255,0)",
      penColor: "#1c1a15",
      minWidth: 1.2,
      maxWidth: 2.4,
    });
    padRef.current = pad;
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = pad.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.clear();
      pad.fromData(data);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      pad.off();
    };
  }, []);

  // ===== KYC =====
  const [nik, setNik] = useState("");
  const [nomorWhatsApp, setNomorWhatsApp] = useState("");
  const [penghasilan, setPenghasilan] = useState<number>(5_000_000);
  const [sumberPenghasilan, setSumberPenghasilan] = useState("");
  const [dok, setDok] = useState<
    Record<KycFileKey, { id: Id<"_storage"> | null; name: string; busy: boolean }>
  >({
    ktp: { id: null, name: "", busy: false },
    selfie: { id: null, name: "", busy: false },
    slip: { id: null, name: "", busy: false },
  });

  // ===== Lokasi real (GPS) =====
  const [lokasi, setLokasi] = useState<{
    lat: number;
    lng: number;
    akurasi: number;
    waktu: number;
  } | null>(null);
  const [lokBusy, setLokBusy] = useState(false);

  const createLoan = useMutation(api.loans.createLoanApplication);
  const generateUploadUrl = useMutation(api.loans.generateKycUploadUrl);

  const captureLokasi = () => {
    if (!("geolocation" in navigator)) {
      setError("Perangkat Anda tidak mendukung GPS.");
      return;
    }
    setLokBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLokasi({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          akurasi: pos.coords.accuracy,
          waktu: Date.now(),
        });
        setLokBusy(false);
      },
      (err) => {
        setError(`Gagal mengambil lokasi: ${err.message}. Izinkan akses lokasi di browser.`);
        setLokBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  // Minta izin GPS otomatis saat form dibuka. Dijadwalkan sebagai microtask
  // agar tidak memanggil setState langsung di dalam tubuh efek.
  useEffect(() => {
    queueMicrotask(captureLokasi);
  }, []);

  const handleFile = async (key: KycFileKey, label: string, file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError(`${label} maksimal 5 MB.`);
      return;
    }
    setDok((p) => ({ ...p, [key]: { ...p[key], busy: true, name: file.name } }));
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      const json = (await res.json()) as { storageId?: Id<"_storage"> };
      if (!res.ok || !json.storageId) throw new Error(`Unggah ${label} gagal.`);
      setDok((p) => ({ ...p, [key]: { id: json.storageId ?? null, name: file.name, busy: false } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unggah ${label} gagal.`);
      setDok((p) => ({ ...p, [key]: { ...p[key], busy: false } }));
    }
  };

  const q = quoteLoan(pokok);
  // Batas pinjaman tunai (LOAN_LIMITS): Rp 100.000–Rp 1.000.000, tenor maks 30 hari.
  const MIN = LOAN_LIMITS.minPokok;
  const MAX = LOAN_LIMITS.maxPokok;
  const STEP = 50_000;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (pokok < MIN || pokok > MAX || !Number.isInteger(pokok)) {
      setError(
        `Nominal pinjaman harus antara ${formatRupiah(MIN)} dan ${formatRupiah(MAX)} (rupiah bulat) dengan tenor maksimal ${LOAN_LIMITS.maxTenorHari} hari.`,
      );
      return;
    }
    if (!tenorHari) {
      setError("Pilih tenor pinjaman.");
      return;
    }
    if (!tujuan) {
      setError("Pilih keperluan pinjaman.");
      return;
    }
    if (namaLengkap.trim().length < 3) {
      setError("Nama lengkap wajib diisi (minimal 3 karakter).");
      return;
    }
    if (!/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, ""))) {
      setError("Nomor rekening harus 6–20 digit angka.");
      return;
    }
    const kycError = validateKycInput({
      nik,
      nomorWhatsApp,
      penghasilanBulanan: penghasilan,
      sumberPenghasilan,
    });
    if (kycError) {
      setError(kycError);
      return;
    }
    if (!dok.ktp.id || !dok.selfie.id || !dok.slip.id) {
      setError("Unggah ketiga dokumen: KTP, selfie dengan KTP, dan slip gaji.");
      return;
    }
    if (lokasi === null) {
      setError("Lokasi belum terkunci — izinkan akses GPS lalu klik 'Ambil lokasi'.");
      return;
    }

    setSubmitting(true);
    try {
      const ttdDataUrl = padRef.current && !padRef.current.isEmpty()
        ? padRef.current.toDataURL("image/png")
        : undefined;
      const result = await createLoan({
        pokokPinjaman: pokok,
        tenorHari: Number(tenorHari),
        tujuan,
        namaLengkap,
        nomorRekening,
        catatanPeminjam: catatanPeminjam.trim() ? catatanPeminjam : undefined,
        tandaTangan: ttdDataUrl,
        nik: nik.replace(/\s+/g, ""),
        nomorWhatsApp: nomorWhatsApp.replace(/[\s+-]/g, ""),
        penghasilanBulanan: penghasilan,
        sumberPenghasilan,
        dokKtpId: dok.ktp.id,
        dokSelfieKtpId: dok.selfie.id,
        dokSlipGajiId: dok.slip.id,
        lokasiAjukan: lokasi,
      });
      onCreated(result.nomorReferensi);
      setTujuan("");
      setNamaLengkap("");
      setNomorRekening("");
      setCatatanPeminjam("");
      padRef.current?.clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim pengajuan.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Slider nominal */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <Label>Nominal pinjaman</Label>
          <span className="text-lg font-semibold tabular-nums text-primary">{formatRupiah(pokok)}</span>
        </div>
        <Slider
          className="mt-4"
          value={[pokok]}
          min={MIN}
          max={MAX}
          step={STEP}
          onValueChange={(v) => setPokok(v[0] ?? MIN)}
        />
        <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
          <span>{formatRupiah(MIN)}</span>
          <span>{formatRupiah(MAX)}</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Pinjaman tunai dibatasi {formatRupiah(LOAN_LIMITS.minPokok)}–
          {formatRupiah(LOAN_LIMITS.maxPokok)} dengan tenor maksimal{" "}
          {LOAN_LIMITS.maxTenorHari} hari.
        </p>

        {/* Live financial breakdown */}
        <dl className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
          {[
            ["Potongan Admin (3%)", `- ${formatRupiah(q.biayaAdmin)}`],
            ["Potongan Platform (2%)", `- ${formatRupiah(q.biayaPlatform)}`],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between bg-white px-3 py-2 text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between bg-emerald-50 px-3 py-2.5 text-sm">
            <dt className="font-semibold text-emerald-800">Dana Bersih (95%)</dt>
            <dd className="font-semibold tabular-nums text-emerald-700">{formatRupiah(q.danaBersihDitransfer)}</dd>
          </div>
          <div className="flex items-baseline justify-between bg-white px-3 py-2 text-sm">
            <dt className="text-muted-foreground">Bunga (30%)</dt>
            <dd className="tabular-nums">{formatRupiah(q.bunga)}</dd>
          </div>
          <div className="flex items-baseline justify-between bg-slate-50 px-3 py-2.5 text-sm">
            <dt className="font-semibold">Total Kewajiban (130%)</dt>
            <dd className="font-semibold tabular-nums">{formatRupiah(q.totalKewajibanPelunasan)}</dd>
          </div>
        </dl>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Tenor pinjaman</Label>
          <Select value={tenorHari} onValueChange={setTenorHari} disabled={submitting}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pilih tenor" />
            </SelectTrigger>
            <SelectContent>
              {TENOR_OPTIONS.map((t) => (
                <SelectItem key={t} value={String(t)}>
                  {t} hari
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Keperluan</Label>
          <Select value={tujuan} onValueChange={setTujuan} disabled={submitting}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pilih keperluan pinjaman" />
            </SelectTrigger>
            <SelectContent>
              {LOAN_PURPOSE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nama">Nama lengkap (sesuai KTP)</Label>
          <Input id="nama" value={namaLengkap} onChange={(e) => setNamaLengkap(e.target.value)} placeholder="Nama sesuai identitas" disabled={submitting} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rekening">Nomor rekening tujuan</Label>
          <Input id="rekening" inputMode="numeric" value={nomorRekening} onChange={(e) => setNomorRekening(e.target.value)} placeholder="1234567890" className="tabular-nums" disabled={submitting} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="catatan">Catatan untuk reviewer (opsional)</Label>
        <Textarea id="catatan" value={catatanPeminjam} onChange={(e) => setCatatanPeminjam(e.target.value)} placeholder="Jelaskan singkat rencana penggunaan dana…" rows={2} disabled={submitting} />
      </div>

      {/* Tanda tangan canvas */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Tanda tangan digital (canvas)
        </p>
        <canvas
          ref={canvasRef}
          className="mt-2 h-24 w-full touch-none rounded-xl border border-dashed border-slate-300 bg-white"
        />
        <div className="mt-2 flex justify-end">
          <Button type="button" size="sm" variant="ghost" onClick={() => padRef.current?.clear()}>
            Bersihkan
          </Button>
        </div>
      </div>

      {/* KYC */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Verifikasi identitas (wajib)
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="nik">NIK (16 digit)</Label>
            <Input id="nik" inputMode="numeric" maxLength={16} value={nik} onChange={(e) => setNik(e.target.value.replace(/\D/g, ""))} placeholder="3204xxxxxxxxxxxx" className="tabular-nums" disabled={submitting} />
          </div>
          <div>
            <Label htmlFor="wa">Nomor WhatsApp</Label>
            <Input id="wa" inputMode="numeric" value={nomorWhatsApp} onChange={(e) => setNomorWhatsApp(e.target.value.replace(/[^\d+]/g, ""))} placeholder="6281234567890" className="tabular-nums" disabled={submitting} />
          </div>
          <div>
            <Label>Penghasilan per bulan</Label>
            <Slider
              className="mt-3"
              value={[penghasilan]}
              min={500_000}
              max={100_000_000}
              step={100_000}
              onValueChange={(v) => setPenghasilan(v[0] ?? 500_000)}
            />
            <p className="mt-1 text-sm font-semibold tabular-nums text-primary">
              {formatRupiah(penghasilan)}
            </p>
          </div>
          <div>
            <Label htmlFor="sumber">Sumber penghasilan</Label>
            <Input id="sumber" value={sumberPenghasilan} onChange={(e) => setSumberPenghasilan(e.target.value)} placeholder="Gaji, usaha, dll." disabled={submitting} />
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {KYC_FILES.map(({ key, label, accept }) => (
            <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label htmlFor={`dok-${key}`}>{label}</Label>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {dok[key].busy ? "Mengunggah…" : dok[key].name ? dok[key].name : "Maks. 5 MB — gambar atau PDF"}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" disabled={submitting || dok[key].busy} onClick={() => document.getElementById(`dok-${key}`)?.click()}>
                  {dok[key].busy ? <Loader2 className="size-3.5 animate-spin" /> : "Pilih file"}
                </Button>
              </div>
              <input
                id={`dok-${key}`}
                type="file"
                accept={accept}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  void handleFile(key, label, f);
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Lokasi real */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Lokasi saat pengajuan (GPS wajib)
            </p>
            {lokasi ? (
              <p className="mt-1 text-sm tabular-nums">
                <MapPin className="mr-1 inline size-4 text-emerald-600" />
                {lokasi.lat.toFixed(5)}, {lokasi.lng.toFixed(5)} · ±{Math.round(lokasi.akurasi)} m
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                {lokBusy ? "Mengunci posisi GPS…" : "Belum terkunci — izinkan akses lokasi di browser."}
              </p>
            )}
          </div>
          <Button type="button" variant="outline" disabled={lokBusy || submitting} onClick={captureLokasi}>
            {lokBusy ? <Loader2 className="size-4 animate-spin" /> : "Ambil lokasi"}
          </Button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" /> Mengirim…
          </>
        ) : (
          <>
            Kirim Pengajuan <ArrowRight className="ml-1 size-4" />
          </>
        )}
      </Button>
      <p className="text-center text-xs leading-5 text-muted-foreground">
        Dengan mengirim, Anda menyatakan data benar dan menyetujui biaya: potongan 5%,
        bunga 30%, total kewajiban 130%. Batas pinjaman {formatRupiah(LOAN_LIMITS.maxPokok)}
        dengan tenor maksimal {LOAN_LIMITS.maxTenorHari} hari.
      </p>
    </form>
  );
}

/** Form pengajuan gadai (barang + jadwal pemeriksaan). */
export function PawnForm({ onCreated }: { onCreated: () => void }) {
  const [deskripsiBarang, setDeskripsiBarang] = useState("");
  const [kategori, setKategori] = useState<string>("");
  const [alamatPenilaian, setAlamatPenilaian] = useState("");
  const [namaLengkap, setNamaLengkap] = useState("");
  const [nomorRekening, setNomorRekening] = useState("");
  const [catatanPeminjam, setCatatanPeminjam] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createPawn = useMutation(api.loans.createPawnApplication);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (deskripsiBarang.trim().length < 10) {
      setError("Deskripsi barang wajib diisi (minimal 10 karakter).");
      return;
    }
    if (!kategori) {
      setError("Pilih kategori barang.");
      return;
    }
    if (alamatPenilaian.trim().length < 10) {
      setError("Alamat lokasi barang wajib diisi untuk penjadwalan pemeriksaan.");
      return;
    }
    if (namaLengkap.trim().length < 3) {
      setError("Nama lengkap wajib diisi (minimal 3 karakter).");
      return;
    }
    if (!/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, ""))) {
      setError("Nomor rekening harus 6–20 digit angka.");
      return;
    }
    setSubmitting(true);
    try {
      await createPawn({
        deskripsiBarang,
        kategori,
        alamatPenilaian,
        namaLengkap,
        nomorRekening,
        catatanPeminjam: catatanPeminjam.trim() ? catatanPeminjam : undefined,
      });
      onCreated();
      setDeskripsiBarang("");
      setKategori("");
      setAlamatPenilaian("");
      setNamaLengkap("");
      setNomorRekening("");
      setCatatanPeminjam("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim pengajuan gadai.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="barang">Deskripsi barang</Label>
        <Textarea id="barang" value={deskripsiBarang} onChange={(e) => setDeskripsiBarang(e.target.value)} placeholder="Contoh: iPhone 14 Pro 256 GB, warna titanium, dus lengkap…" rows={3} disabled={submitting} />
      </div>
      <div className="space-y-2">
        <Label>Kategori</Label>
        <Select value={kategori} onValueChange={setKategori} disabled={submitting}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Pilih kategori barang" />
          </SelectTrigger>
          <SelectContent>
            {COLLATERAL_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {kategori && (
          <p className="text-xs text-muted-foreground">
            Perkiraan plafon dana: {LTV_HINTS[kategori as CollateralCategory]}.
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="alamat">Alamat lokasi barang</Label>
        <Textarea id="alamat" value={alamatPenilaian} onChange={(e) => setAlamatPenilaian(e.target.value)} placeholder="Alamat lengkap tempat barang berada saat pemeriksaan…" rows={2} disabled={submitting} />
        <p className="text-xs leading-5 text-muted-foreground">
          Pemeriksaan dilakukan petugas di lokasi dengan pencatatan lokasi langsung
          (live location).
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nama-gadai">Nama lengkap (sesuai KTP)</Label>
          <Input id="nama-gadai" value={namaLengkap} onChange={(e) => setNamaLengkap(e.target.value)} placeholder="Nama sesuai identitas" disabled={submitting} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rekening-gadai">Nomor rekening tujuan</Label>
          <Input id="rekening-gadai" inputMode="numeric" value={nomorRekening} onChange={(e) => setNomorRekening(e.target.value)} placeholder="1234567890" className="tabular-nums" disabled={submitting} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="catatan-gadai">Catatan tambahan (opsional)</Label>
        <Textarea id="catatan-gadai" value={catatanPeminjam} onChange={(e) => setCatatanPeminjam(e.target.value)} placeholder="Kondisi barang, kelengkapan, atau jadwal yang sesuai…" rows={2} disabled={submitting} />
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" /> Mengirim…
          </>
        ) : (
          <>
            Kirim pengajuan gadai <ArrowRight className="ml-1 size-4" />
          </>
        )}
      </Button>
      <p className="text-center text-xs leading-5 text-muted-foreground">
        Nilai taksiran ditetapkan petugas saat pemeriksaan. Barang tersimpan aman
        hingga pelunasan.
      </p>
    </form>
  );
}
