# Laporan Pengujian Fungsi (E2E) — 2026-10-12

**Function Test Status: Active | Target: All Modules & Convex Backend**

**Metode.** Suite tes otomatis penuh (`bun run test`: 37 berkas / 362 tes vitest
plus seluruh tes render & logika pra-vitest, termasuk 37 berkas tes Convex) lalu
inspeksi kode untuk alur yang disebut checklist dan tidak punya tes langsung.
**Batas:** tidak ada browser/E2E harness di lingkungan ini, jadi tidak ada
klik-uji nyata, tidak ada penyimpanan cookie yang diamati, dan tidak ada
pengamatan update realtime secara langsung. Semua status "Pass" di bawah
bersandar pada tes otomatis dan inspeksi kode, bukan pada sesi interaktif.

---

## 1. Laporan Audit Fungsi (Pass / Fail / Warning)

### A. Autentikasi & Keamanan
| Item | Status | Bukti |
|---|---|---|
| Login/Logout semua peran | **Pass** | `otpWhatsapp.convex.test`, `admin-authz.convex.test` (23 tes), `auth-shared.render` (206), `authAdmin` (47), `session` (12). Logout memakai `signOut` Convex Auth (`Dashboard.tsx:177,182`, `use-session-guard.ts`) yang mencabut token sesi. |
| Protected routes | **Pass** | `RequireAuth` membungkus `/admin`, `/penyedia-dana`, `/promo`, `/dashboard` (`main.tsx:278-323`); tanpa sesi → `Navigate` ke `/auth?returnTo=…` (`RequireAuth.tsx`). |
| Meter kekuatan sandi | **Pass** | `MeterKekuatanSandi` (`auth-shared.tsx:322`) memakai `nilaiKekuatanSandi`; bersifat saran, bukan pengunci (komentar `:318`) — sesuai desain. |
| Countdown token & auto-trim 32 karakter | **Pass** | Timer token (`Auth.tsx:188,226`), penjaga panjang `adminOtp.length !== 32` (`Auth.tsx:1073`), trim otomatis + aturan huruf besar/kecil (`auth-shared.tsx:498`). |
| Session idle timeout | **Warning** | `useSessionGuard` melakukan **auto-logout 15 menit idle** lalu mengarahkan ke `/auth` — **tidak ada modal re-authentication**. Bila modal yang dimaksud memang wajib, fitur itu belum ada (lihat Bug B2). |

### B. Landing Page & Kalkulator
| Item | Status | Bukti |
|---|---|---|
| Perhitungan harian vs bulanan, potongan 2%, bunga flat | **Pass** | `hitungSimulasiBulanan` (`bulanan.ts:233`) + `quoteLoan`; tes `bulanan`, `kredit`, `gadai`, `financial`, `bunga.convex.test` lulus. |
| Angka berubah mengikuti nominal & tenor | **Pass** | `LiveCalculator` (`Landing.tsx:686-829`) memakai state `skema/amount/tenorBulan` + slider & tombol tenor. |
| CTA & navigasi ke route benar | **Pass** | Anchor `#biaya`, `#gadai`, `#kalkulator`, dll. semuanya ada (`id` nyata); CTA dashboard memakai `Link to="/dashboard"`. |
| Nilai skema harian mengikuti tenor | **Warning** | Tenor harian (7/15/30) **tidak mengubah** angka — memang begitu rumus produk (flat 30% + 2% di muka, tenor hanya lama waktu). Bukan bug, hanya potensi salah paham. |

### C. Form Pengajuan, KYC & Unggah Berkas
| Item | Status | Bukti |
|---|---|---|
| Validasi NIK 16 digit | **Pass** | `/^\d{16}$/` (`dataDiri.ts:137`); `dataDiri.test`. |
| Validasi WhatsApp | **Pass** | `/^62\d{8,13}$/` (`dataDiri.ts:141`). |
| Validasi Nomor Rekening | **Pass** | Batas `rekeningMin: 6`/`rekeningMaks: 30` (`dataDiri.ts:37-38`). |
| Validasi Penghasilan | **Pass** | `penghasilanDariTeks` + batas `penghasilanMaks` (`dataDiri.ts:84,159-164`). |
| Unggah/ganti/hapus berkas + JPG/PNG/WEBP | **Pass** | `UnggahDokumen` (pilih/ganti/hapus, `accept`), pemeriksaan magic bytes `berkasIdentitas.ts`; `unggahDokumen.test`, `UnggahDokumen.render.test`. |
| Auto-check KYC (Lulus/Belum pasti/Gagal) & Ajukan peninjauan | **Pass** | `KycPemeriksaanOtomatis` (label tiga status) + mutation `tinjauKyc` (`convex/kyc.ts:1785`); `kyc.convex.test`, `kycAdmin`, `kycAutoApproval`. |
| Stepper 1–7 tidak kehilangan data | **Pass** | Draft tersimpan lewat `useDraftKyc`/`lib/draftKyc` (`draftKyc.test`); state tahap di `kyc-views.tsx`. |

### D. Dashboard Nasabah & Penyedia Dana
| Item | Status | Bukti |
|---|---|---|
| Ringkasan limit/tagihan/progres akurat dari Convex | **Pass** | `SummaryCards` + `loans.myLoanSummary`/`myLoanCreditHistory`/`myLoanSchedule`; `summary-cards`, `klaim-views.render`. |
| Loading (skeleton/spinner) | **Pass** | `RingkasanMemuat` skeleton di `Dashboard.tsx`. |
| Empty state jelas | **Pass** | `pages/dashboard/empty-state.tsx` dipakai modul; tes render dashboard lulus. |

### E. Portal Admin & Audit Trail
| Item | Status | Bukti |
|---|---|---|
| Pencarian, filter, pagination tabel | **Pass** | `lib/paginasi.ts` (+`paginasi.test`), `saringModul` (`lib/admin-queue.ts:241`, `admin-queue.test`), chip filter status pada picker modul/antrean. |
| Approval: Terima / Tolak / Minta perbaikan (realtime) | **Pass** | `approveLoan`/`rejectLoan` (`loans.ts:1120,1137`), `approvePawn`/`rejectPawn` (`:1335,1353`), `tinjauKyc` (`kyc.ts:1785`); query Convex reaktif. Diuji `adminPengajuan.convex.test`, `admin-authz.convex.test`. |
| Log audit trail (siapa, kapan, apa) | **Pass** | `auditLog` schema + `lib/auditHapus.ts`, `lib/auditTimeline.ts` (+ tes `auditHapus.test`, `auditTimeline.test`). |

---

## 2. Daftar Bug / Breakage Log

- **B1 — Kunci peran salah (FIXED).** `dashboard-header.tsx` dan
  `dashboard-sidebar.tsx` mencocokkan `role === "penyedia-dana"`, padahal nilai
  peran yang benar-benar tersimpan adalah `"dana"` (`ROLES.DANA` di `schema.ts`;
  `RoleDashboardMenu.tsx` sudah memakai `"dana"`). Akibat: akun pendana yang
  membuka `/dashboard` diberi label "Dashboard Peminjam", dan (sebelum perbaikan
  sesi ini) menerima kotak "Menu khusus" kosong. **Diperbaiki** — lihat §3.
- **B2 — Sesi habis tanpa modal re-auth (WARNING / deviasi).** Idle timeout
  mengakhiri sesi dan mengalihkan ke `/auth` (`use-session-guard.ts`); tidak ada
  modal re-authentication seperti yang diminta checklist. Bila modal itu
  diwajibkan, perlu implementasi baru (bukan perbaikan satu baris).
- **B3 — Tenor harian tidak mengubah angka (INFO).** Sesuai rumus produk, bukan
  cacat; dicatat agar tidak dilaporkan sebagai bug di kemudian hari.

Tidak ditemukan: tombol mati pada alur utama, error handler yang hilang, atau
logika backend yang terputus pada modul di atas.

---

## 3. Ringkasan Perbaikan Logika Kode

- `src/pages/dashboard/dashboard-header.tsx` — label ruang kini menerima peran
  `dana` (selain `penyedia-dana`) sehingga akun pendana tidak salah dilabeli
  "Dashboard Peminjam".
- `src/pages/dashboard/dashboard-sidebar.tsx` — `ROLE_LINKS` mendapat entri
  `dana`; kotak "Menu khusus" hanya dirender bila pintasannya benar-benar ada
  (menutup kotak kosong untuk peran yang tidak terpetakan).
- (Sesi yang sama, dari audit-004) kartu hero responsif, footer dashboard
  berpoin, stepper KYC `no-scrollbar`, checklist KYC `flex-col sm:flex-row`,
  pembersihan em dash terpilih, dan label kontras `text-slate-600`.

---

## 4. Delivery Gate Check

- **Schema Convex tidak berubah**: tidak ada suntingan pada `src/convex/*` pada
  giliran ini, jadi tidak ada risiko migrasi/schema.
- **Typecheck**: `bun tsc -b --noEmit` → **EXIT=0**.
- **Test**: `bun run test` → **EXIT=0**: 37 berkas / 362 tes vitest lulus; seluruh
  tes render & logika pra-vitest lulus (0 gagal). Dijalankan **setelah** perbaikan
  B1.
- **Error console**: tidak dapat diperiksa tanpa browser (batas lingkungan).
- **Yang tidak terverifikasi**: klik-uji nyata, penghapusan cookie saat logout,
  dan update realtime alur approval — diverifikasi lewat tes otomatis/inspeksi,
  bukan sesi peramban.
