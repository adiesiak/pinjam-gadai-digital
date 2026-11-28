/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as adminAuthz from "../adminAuthz.js";
import type * as adminPengajuan from "../adminPengajuan.js";
import type * as aksesBersama from "../aksesBersama.js";
import type * as akunUji from "../akunUji.js";
import type * as akunUjiInternal from "../akunUjiInternal.js";
import type * as alokasiDana from "../alokasiDana.js";
import type * as androidApp from "../androidApp.js";
import type * as angsuran from "../angsuran.js";
import type * as angsuranJadwal from "../angsuranJadwal.js";
import type * as angsuranPengingat from "../angsuranPengingat.js";
import type * as announcements from "../announcements.js";
import type * as auth from "../auth.js";
import type * as auth_adminPasswordOtp from "../auth/adminPasswordOtp.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as auth_enumerasi from "../auth/enumerasi.js";
import type * as auth_google from "../auth/google.js";
import type * as auth_nikOtp from "../auth/nikOtp.js";
import type * as auth_pratinjau from "../auth/pratinjau.js";
import type * as auth_whatsappOtp from "../auth/whatsappOtp.js";
import type * as backupDrive from "../backupDrive.js";
import type * as backupDriveAdmin from "../backupDriveAdmin.js";
import type * as backupDriveCrypto from "../backupDriveCrypto.js";
import type * as backupDriveData from "../backupDriveData.js";
import type * as bahasaPendana from "../bahasaPendana.js";
import type * as bannerPromo from "../bannerPromo.js";
import type * as berkas from "../berkas.js";
import type * as berkasIdentitas from "../berkasIdentitas.js";
import type * as berkasWaktu from "../berkasWaktu.js";
import type * as bi from "../bi.js";
import type * as botApi from "../botApi.js";
import type * as cicilanKredit from "../cicilanKredit.js";
import type * as contohKreditHp from "../contohKreditHp.js";
import type * as contohPendana from "../contohPendana.js";
import type * as crons from "../crons.js";
import type * as dataDiriProfil from "../dataDiriProfil.js";
import type * as dataSaya from "../dataSaya.js";
import type * as dataUji from "../dataUji.js";
import type * as doorprize from "../doorprize.js";
import type * as draftPinjaman from "../draftPinjaman.js";
import type * as duplikatNasabah from "../duplikatNasabah.js";
import type * as emailNotifikasi from "../emailNotifikasi.js";
import type * as gadai from "../gadai.js";
import type * as gerbangKirim from "../gerbangKirim.js";
import type * as hapusAkunTurunan from "../hapusAkunTurunan.js";
import type * as http from "../http.js";
import type * as idempotensi from "../idempotensi.js";
import type * as integrasiLedger from "../integrasiLedger.js";
import type * as jagaGatewayWa from "../jagaGatewayWa.js";
import type * as kalenderKas from "../kalenderKas.js";
import type * as katalog from "../katalog.js";
import type * as kesehatan from "../kesehatan.js";
import type * as klaimPeminjam from "../klaimPeminjam.js";
import type * as kontrakDigital from "../kontrakDigital.js";
import type * as kontrakPersetujuan from "../kontrakPersetujuan.js";
import type * as kredit from "../kredit.js";
import type * as kyc from "../kyc.js";
import type * as laporanPendana from "../laporanPendana.js";
import type * as laporanRisiko from "../laporanRisiko.js";
import type * as ledger from "../ledger.js";
import type * as loans from "../loans.js";
import type * as lokasi from "../lokasi.js";
import type * as matchingQueue from "../matchingQueue.js";
import type * as migrasiNasabah from "../migrasiNasabah.js";
import type * as minatPendana from "../minatPendana.js";
import type * as monitoring from "../monitoring.js";
import type * as nasabah from "../nasabah.js";
import type * as notifikasi from "../notifikasi.js";
import type * as notifikasiNasabah from "../notifikasiNasabah.js";
import type * as otpWhatsapp from "../otpWhatsapp.js";
import type * as paymentGuard from "../paymentGuard.js";
import type * as pembaruanAplikasi from "../pembaruanAplikasi.js";
import type * as peminjamCode from "../peminjamCode.js";
import type * as penagihan from "../penagihan.js";
import type * as pendanaKepemilikan from "../pendanaKepemilikan.js";
import type * as pengingatPendana from "../pengingatPendana.js";
import type * as pengingatVoucher from "../pengingatVoucher.js";
import type * as penyediaDana from "../penyediaDana.js";
import type * as perpanjanganPinjaman from "../perpanjanganPinjaman.js";
import type * as persetujuanRisiko from "../persetujuanRisiko.js";
import type * as ppob from "../ppob.js";
import type * as ppobH2h from "../ppobH2h.js";
import type * as ppobNotifikasi from "../ppobNotifikasi.js";
import type * as pratinjau from "../pratinjau.js";
import type * as profilNasabah from "../profilNasabah.js";
import type * as promoBunga from "../promoBunga.js";
import type * as promoPinjaman from "../promoPinjaman.js";
import type * as referral from "../referral.js";
import type * as restrukturisasi from "../restrukturisasi.js";
import type * as retensi from "../retensi.js";
import type * as rincianKirim from "../rincianKirim.js";
import type * as rincianPinjaman from "../rincianPinjaman.js";
import type * as saldoPendana from "../saldoPendana.js";
import type * as security from "../security.js";
import type * as siklusPendana from "../siklusPendana.js";
import type * as somasi from "../somasi.js";
import type * as syariahAkad from "../syariahAkad.js";
import type * as syariahPengajuan from "../syariahPengajuan.js";
import type * as system from "../system.js";
import type * as tautanStatus from "../tautanStatus.js";
import type * as tracking from "../tracking.js";
import type * as turnstile from "../turnstile.js";
import type * as users from "../users.js";
import type * as voucher from "../voucher.js";
import type * as waLaporUrl from "../waLaporUrl.js";
import type * as whatsapp from "../whatsapp.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  adminAuthz: typeof adminAuthz;
  adminPengajuan: typeof adminPengajuan;
  aksesBersama: typeof aksesBersama;
  akunUji: typeof akunUji;
  akunUjiInternal: typeof akunUjiInternal;
  alokasiDana: typeof alokasiDana;
  androidApp: typeof androidApp;
  angsuran: typeof angsuran;
  angsuranJadwal: typeof angsuranJadwal;
  angsuranPengingat: typeof angsuranPengingat;
  announcements: typeof announcements;
  auth: typeof auth;
  "auth/adminPasswordOtp": typeof auth_adminPasswordOtp;
  "auth/emailOtp": typeof auth_emailOtp;
  "auth/enumerasi": typeof auth_enumerasi;
  "auth/google": typeof auth_google;
  "auth/nikOtp": typeof auth_nikOtp;
  "auth/pratinjau": typeof auth_pratinjau;
  "auth/whatsappOtp": typeof auth_whatsappOtp;
  backupDrive: typeof backupDrive;
  backupDriveAdmin: typeof backupDriveAdmin;
  backupDriveCrypto: typeof backupDriveCrypto;
  backupDriveData: typeof backupDriveData;
  bahasaPendana: typeof bahasaPendana;
  bannerPromo: typeof bannerPromo;
  berkas: typeof berkas;
  berkasIdentitas: typeof berkasIdentitas;
  berkasWaktu: typeof berkasWaktu;
  bi: typeof bi;
  botApi: typeof botApi;
  cicilanKredit: typeof cicilanKredit;
  contohKreditHp: typeof contohKreditHp;
  contohPendana: typeof contohPendana;
  crons: typeof crons;
  dataDiriProfil: typeof dataDiriProfil;
  dataSaya: typeof dataSaya;
  dataUji: typeof dataUji;
  doorprize: typeof doorprize;
  draftPinjaman: typeof draftPinjaman;
  duplikatNasabah: typeof duplikatNasabah;
  emailNotifikasi: typeof emailNotifikasi;
  gadai: typeof gadai;
  gerbangKirim: typeof gerbangKirim;
  hapusAkunTurunan: typeof hapusAkunTurunan;
  http: typeof http;
  idempotensi: typeof idempotensi;
  integrasiLedger: typeof integrasiLedger;
  jagaGatewayWa: typeof jagaGatewayWa;
  kalenderKas: typeof kalenderKas;
  katalog: typeof katalog;
  kesehatan: typeof kesehatan;
  klaimPeminjam: typeof klaimPeminjam;
  kontrakDigital: typeof kontrakDigital;
  kontrakPersetujuan: typeof kontrakPersetujuan;
  kredit: typeof kredit;
  kyc: typeof kyc;
  laporanPendana: typeof laporanPendana;
  laporanRisiko: typeof laporanRisiko;
  ledger: typeof ledger;
  loans: typeof loans;
  lokasi: typeof lokasi;
  matchingQueue: typeof matchingQueue;
  migrasiNasabah: typeof migrasiNasabah;
  minatPendana: typeof minatPendana;
  monitoring: typeof monitoring;
  nasabah: typeof nasabah;
  notifikasi: typeof notifikasi;
  notifikasiNasabah: typeof notifikasiNasabah;
  otpWhatsapp: typeof otpWhatsapp;
  paymentGuard: typeof paymentGuard;
  pembaruanAplikasi: typeof pembaruanAplikasi;
  peminjamCode: typeof peminjamCode;
  penagihan: typeof penagihan;
  pendanaKepemilikan: typeof pendanaKepemilikan;
  pengingatPendana: typeof pengingatPendana;
  pengingatVoucher: typeof pengingatVoucher;
  penyediaDana: typeof penyediaDana;
  perpanjanganPinjaman: typeof perpanjanganPinjaman;
  persetujuanRisiko: typeof persetujuanRisiko;
  ppob: typeof ppob;
  ppobH2h: typeof ppobH2h;
  ppobNotifikasi: typeof ppobNotifikasi;
  pratinjau: typeof pratinjau;
  profilNasabah: typeof profilNasabah;
  promoBunga: typeof promoBunga;
  promoPinjaman: typeof promoPinjaman;
  referral: typeof referral;
  restrukturisasi: typeof restrukturisasi;
  retensi: typeof retensi;
  rincianKirim: typeof rincianKirim;
  rincianPinjaman: typeof rincianPinjaman;
  saldoPendana: typeof saldoPendana;
  security: typeof security;
  siklusPendana: typeof siklusPendana;
  somasi: typeof somasi;
  syariahAkad: typeof syariahAkad;
  syariahPengajuan: typeof syariahPengajuan;
  system: typeof system;
  tautanStatus: typeof tautanStatus;
  tracking: typeof tracking;
  turnstile: typeof turnstile;
  users: typeof users;
  voucher: typeof voucher;
  waLaporUrl: typeof waLaporUrl;
  whatsapp: typeof whatsapp;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
