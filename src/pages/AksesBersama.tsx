import { useMutation } from "convex/react";
import { ArrowRight, Eye, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";

/**
 * Halaman publik: masuk dengan kode akses bersama penyedia dana.
 *
 * Alur: sesi tamu dibuka (Anonymous) lalu kode diverifikasi di server
 * (`aksesBersama.masukDenganKodeBersama`) yang mengubah sesi ini menjadi peran
 * `pengamat` — hanya baca. Setiap orang memakai sesi tamunya sendiri, jadi satu
 * kode bisa dipakai beberapa orang bersamaan tanpa saling menendang sesi.
 *
 * Kode TIDAK pernah disimpan di URL/penyimpanan browser: ia hanya hidup di
 * state form sampai dikirim sekali ke server.
 */
export default function AksesBersama() {
  const { isAuthenticated, isLoading: authLoading, signIn, user } = useAuth();
  const navigate = useNavigate();
  const masuk = useMutation(api.aksesBersama.masukDenganKodeBersama);

  const [kode, setKode] = useState("");
  const [pesan, setPesan] = useState<string | null>(null);
  const [mengirim, setMengirim] = useState(false);
  const [siapKirim, setSiapKirim] = useState(false);
  const sudahDikirim = useRef(false);

  const role = user?.role;

  // Akun yang sudah punya akses pemantau tidak perlu memakai kode lagi.
  useEffect(() => {
    if (siapKirim || role === undefined) return;
    if (role === "pengamat" || role === "dana" || role === "admin") {
      navigate("/penyedia-dana", { replace: true });
    }
  }, [role, siapKirim, navigate]);

  // Kirim kode hanya setelah sesi tamu benar-benar siap (menghindari balapan
  // dengan `signIn("anonymous")`).
  useEffect(() => {
    if (!siapKirim || !isAuthenticated || sudahDikirim.current) return;
    sudahDikirim.current = true;
    let dibatalkan = false;
    void (async () => {
      try {
        const hasil = await masuk({ kode });
        if (dibatalkan) return;
        if (!hasil.ok) {
          setPesan(hasil.pesan);
          setSiapKirim(false);
          sudahDikirim.current = false;
          setMengirim(false);
          return;
        }
        navigate("/penyedia-dana", { replace: true });
      } catch (err) {
        if (dibatalkan) return;
        setPesan(
          err instanceof Error ? err.message : "Gagal memakai kode akses bersama.",
        );
        setSiapKirim(false);
        sudahDikirim.current = false;
        setMengirim(false);
      }
    })();
    return () => {
      dibatalkan = true;
    };
  }, [siapKirim, isAuthenticated, kode, masuk, navigate]);

  const kirim = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPesan(null);
    if (kode.trim().length < 10) {
      setPesan("Masukkan kode akses bersama lengkap yang dikirim admin.");
      return;
    }
    setMengirim(true);
    try {
      // Sesi tamu dulu — kode bersama mengaktifkan sesi tamu, bukan akun email.
      if (!isAuthenticated) await signIn("anonymous");
      setSiapKirim(true);
    } catch (err) {
      setPesan(err instanceof Error ? err.message : "Gagal membuka sesi tamu.");
      setMengirim(false);
    }
  };

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_20%_0%,#edf4f0_0%,transparent_45%),linear-gradient(135deg,#fbfaf6_0%,#ffffff_55%,#f5f1e8_100%)] px-4 py-10 text-slate-900 sm:px-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
              P
            </span>
            <span className="text-sm font-semibold tracking-[0.14em]">PINDAI</span>
          </Link>
          <p className="mt-2 text-xs text-muted-foreground">
            Ruang pantau penyedia dana · lihat saja
          </p>
        </div>

        <Card className="animate-masuk mt-8 gap-6 rounded-2xl border-border/60 shadow-sm">
          <CardHeader className="text-center">
            <div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <KeyRound className="size-5" />
            </div>
            <CardTitle className="mt-1 text-xl">Masuk dengan kode akses bersama</CardTitle>
            <CardDescription>
              Satu kode untuk tim pemantau. Setiap orang memakai perangkat sendiri.
            </CardDescription>
          </CardHeader>

          <form onSubmit={kirim}>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="kode-bersama" className="text-xs text-muted-foreground">
                  Kode akses bersama
                </Label>
                <Input
                  id="kode-bersama"
                  name="kode"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                  className="mt-1.5 font-mono tracking-[0.14em]"
                  value={kode}
                  onChange={(e) => setKode(e.target.value.toUpperCase())}
                  disabled={mengirim}
                  required
                />
              </div>

              {pesan !== null && (
                <p role="alert" className="text-sm text-destructive">
                  {pesan}
                </p>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-muted-foreground">
                <p className="flex items-center gap-1.5 font-medium text-slate-700">
                  <Eye className="size-3.5 text-primary" /> Hanya baca
                </p>
                <p className="mt-1">
                  Akses ini membuka daftar pengajuan (pinjaman, gadai, kredit barang) tanpa
                  kemampuan mengubah data. Nama pemohon ditampilkan; NIK, nomor rekening,
                  nomor WhatsApp, alamat, dan dokumen tidak ditampilkan.
                </p>
              </div>
            </CardContent>

            <CardFooter className="flex-col gap-2">
              <Button type="submit" className="w-full" disabled={mengirim}>
                {mengirim ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Memeriksa kode…
                  </>
                ) : (
                  <>
                    Buka ruang pemantau <ArrowRight className="ml-2 size-4" />
                  </>
                )}
              </Button>
              <Button type="button" variant="ghost" className="w-full text-xs" asChild>
                <Link to="/auth">Masuk dengan email atau sebagai tamu</Link>
              </Button>
            </CardFooter>
          </form>
        </Card>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="gap-1 border-slate-200 font-normal">
            <ShieldCheck className="size-3" /> Kode diverifikasi di server
          </Badge>
          <span>Kode tidak disimpan di peramban.</span>
        </div>

        {role === "peminjam" && (
          <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
            Anda sedang masuk dengan akun email sebagai Peminjam. Kode bersama hanya berlaku
            untuk sesi tamu — keluar dulu bila ingin memakainya di perangkat ini.
          </p>
        )}
      </div>
    </main>
  );
}
