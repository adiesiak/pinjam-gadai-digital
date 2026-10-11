/**
 * Mesin adegan 3D landing page PINDAI — satu quad penuh layar dengan fragment
 * shader, ENAM preset visual berbeda.
 *
 * Kenapa WebGL mentah (tanpa Three.js/R3F/Drei): yang dibutuhkan hanya SATU
 * bidang penuh layar, lalu seluruh ruang Deep Space Emerald, kartu premium,
 * brankas siber, maskot A.I., jaringan ledger, koin simulator, dan portal
 * digambar di dalam satu draw call. Menambahkan mesin scene 3D lengkap untuk itu
 * berarti membawa geometri, material, dan renderer yang tidak dipakai —
 * bertentangan dengan aturan proyek (bundle ringan, tanpa dependensi baru demi
 * visual). Mesin ini tetap lapisan yang sama seperti sebelumnya; yang berganti
 * adalah palet dan keenam adegannya.
 *
 * Arsitektur:
 *  - `buatSceneTemplate(canvas, opsi)` mengembalikan `HandleTemplate`, atau
 *    `null` bila WebGL tidak ada / shader gagal / konteks gagal dibuat.
 *    Pemanggil WAJIB punya fallback CSS — tidak pernah ada layar kosong.
 *  - Preset dipilih dari ID template (`lib/landingTemplate.ts`) lewat
 *    `landingTemplatePreset()`, jadi hanya SATU scene yang hidup pada satu waktu
 *    (halaman publik memuat template aktif; panel admin hanya memuat yang
 *    sedang di-preview).
 *  - Interaksi dokumen (kemajuan gulir halaman, nilai slider simulator) masuk
 *    sebagai uniform `uSkrol`/`uSlider` lewat `setSkrol`/`setSlider`.
 *
 * Batas yang dijaga:
 *  - Tanpa React, tanpa akses DOM saat impor → aman dimuat malas & aman di
 *    Electron (semua pemakaian window/document ada di dalam fungsi).
 *  - Tanpa `setState` per frame: parallax, hover, gulir, dan slider ditulis
 *    sebagai uniform di dalam satu rAF internal yang ditutup `destroy()`.
 *  - Waktu naik dari delta frame (bukan jam dinding) supaya tidak melompat
 *    setelah tab dijeda.
 *  - `prefers-reduced-motion` → satu frame statis, tanpa loop.
 *  - `webglcontextlost`/`restored` → berhenti, biarkan pemanggil beralih ke
 *    fallback statis.
 *  - Mode ringan (mobile) mengurangi jumlah partikel/langkah loop lewat uniform
 *    `uRingan`, bukan dengan menurunkan kualitas visual utama.
 *  - Kuningan (gold foil) hanya dipakai sebagai aksen tipis pada tepi/logo
 *    kartu dan tepi koin — bukan warna dominan adegan.
 */

export interface OpsiTemplate {
  /** Indeks preset dari `landingTemplatePreset()` (0..5). */
  preset: number;
  /** Hormati prefers-reduced-motion: gambar satu frame statis, tanpa loop. */
  reduceMotion: boolean;
  /** Rasio piksel perangkat yang sudah dibatasi pemanggil (1 - 2). */
  dpr: number;
  /** Perangkat kecil: kurangi partikel & langkah loop. */
  ringan: boolean;
}

export interface HandleTemplate {
  /** Pointer relatif pusat panggung, -1..1 (parallax lembut). */
  setPointer(nx: number, ny: number): void;
  /** Pointer berada di atas kartu — memicu respons halus (mis. vault membuka). */
  setHover(aktif: boolean): void;
  /** Titik sumber riak dalam koordinat uv (x 0..1 kiri→kanan, y 0..1 bawah→atas). */
  tambahRiak(x: number, y: number): void;
  /**
   * Kemajuan gulir halaman 0..1. Dipakai template yang berputar saat digulir
   * (3D Premium Card) dan untuk menggeser kedalaman kamera.
   */
  setSkrol(nilai: number): void;
  /**
   * Nilai slider simulator 0..1 (template 3D Interactive Loan Simulator).
   * Menggerakkan putaran koin & radius cincin kedalaman.
   */
  setSlider(nilai: number): void;
  /** Jeda/lanjutkan loop (dipakai saat hero keluar layar atau tab disembunyikan). */
  setAktif(aktif: boolean): void;
  /** Perbarui ukuran kanvas (dipanggil ResizeObserver). */
  setUkuran(lebarCss: number, tinggiCss: number): void;
  /** Batas uv air (untuk menaruh riak di laut, bukan di langit) — preset air saja. */
  readonly horizonUv: number;
  /** Preset yang sedang berjalan (0..5). */
  readonly preset: number;
  destroy(): void;
}

const VERT = `
attribute vec2 aPosisi;
varying vec2 vUv;
void main() {
  vUv = aPosisi * 0.5 + 0.5;
  gl_Position = vec4(aPosisi, 0.0, 1.0);
}
`;

/**
 * Satu shader untuk enam scene. `uPreset` memilih cabangnya; semua preset
 * berbagi prolog (aspect, parallax pointer, waktu, vignette, grain) supaya
 * nuansanya tetap satu keluarga: Deep Space Emerald.
 */
const FRAG = `
precision highp float;

varying vec2 vUv;

uniform vec2  uResolusi;
uniform float uWaktu;
uniform vec2  uPointer;
uniform float uHover;
uniform vec3  uRipples[6];
uniform int   uJumlahRipple;
uniform float uReduce;
uniform int   uPreset;
uniform float uRingan;
/* Interaksi dokumen: kemajuan gulir halaman (0..1) & nilai slider simulator. */
uniform float uSkrol;
uniform float uSlider;

const float HORIZON = 0.46;

/*
 * Palet Deep Space Emerald — identitas PINDAI Green.
 *   SPACE_DEEP   #021E17  ruang paling gelap (latar)
 *   EMERALD      #064E3B  bidang utama (emerald pekat)
 *   EMERALD_MID  #10B981  rim & cahaya
 *   EMERALD_LT   #6EE7B7  glow partikel
 *   GOLD_FOIL    #C9A86A  AKSEN TIPIS saja (tepi/logo/koin)
 */
const vec3 SPACE_DEEP  = vec3(0.008, 0.118, 0.090);
const vec3 EMERALD     = vec3(0.024, 0.306, 0.231);
const vec3 EMERALD_MID = vec3(0.063, 0.725, 0.506);
const vec3 EMERALD_LT  = vec3(0.431, 0.906, 0.718);
const vec3 GOLD_FOIL   = vec3(0.788, 0.659, 0.416);

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

/** Cincin tipis pada jarak r dengan lebar w. */
float ring(float d, float r, float w) {
  return 1.0 - smoothstep(0.0, w, abs(d - r));
}

/**
 * Garis kisi: 1 tepat di garis, 0 jauh dari garis. Lebar garis diberikan
 * dalam satuan q (bukan lebar piksel) supaya shader tetap dapat dikompilasi
 * di WebGL1 tanpa ekstensi turunan standar (GL_OES_standard_derivatives) —
 * fwidth tidak dipakai sama sekali.
 */
float grid(vec2 q, float w) {
  vec2 f = abs(fract(q) - 0.5);
  float garis = max(1.0 - smoothstep(0.0, w, f.x), 1.0 - smoothstep(0.0, w, f.y));
  return garis;
}

/**
 * Debu emerald halus: bintik cahaya hijau yang melayang naik perlahan.
 * Mengembalikan intensitas 0..1. Dipakai semua scene supaya atmosfer
 * "emerald dust" konsisten; jumlahnya berkurang di mode ringan.
 */
float debuEmerald(vec2 q, float t, float ambang, float ringan) {
  float skala = mix(8.0, 5.0, ringan);
  vec2 sp = vec2(q.x * skala, q.y * skala + t * 0.45);
  vec2 sel = floor(sp);
  float h = hash21(sel);
  if (h < ambang) return 0.0;
  vec2 fp = fract(sp) - 0.5;
  float bintik = 1.0 - smoothstep(0.0, 0.17, length(fp));
  float tw = 0.55 + 0.45 * sin(t * 1.3 + h * 30.0);
  return bintik * tw;
}

/**
 * Light trail digital samar: pita cahaya horizontal tipis yang bergeser
 * perlahan. Sengaja sangat redup — ia memberi kedalaman, bukan menjadi subjek.
 */
float jalurCahaya(vec2 p, float t, float baris) {
  float y = sin(p.x * 1.6 + t * 0.35 + baris * 2.1) * 0.42 + baris * 0.28 - 0.28;
  return exp(-abs(p.y - y) * 22.0);
}

/* ---------- 01 · 3D PREMIUM CARD (TILT & SCROLL) ---------- */
vec3 scenePremiumCard(vec2 uv, vec2 p, float aspect, float t) {
  vec3 col = mix(EMERALD * 0.55, SPACE_DEEP, clamp(uv.y * 1.15, 0.0, 1.0));

  /* Scroll rotation: kartu miring mengikuti kemajuan gulir halaman. */
  float gulir = uSkrol * 1.0 + uPointer.x * 0.16;
  vec2 q = p - vec2(0.0, -0.02 + uHover * 0.030);
  float ca = cos(gulir * 0.9);
  float sa = sin(gulir * 0.9);
  q = vec2(q.x * ca - q.y * sa, q.x * sa + q.y * ca);
  q.y /= max(0.40, cos(gulir * 0.55));

  vec2 setengah = vec2(0.172 * aspect, 0.112);
  float sd = sdBox(q, setengah) - 0.014;
  float badan = 1.0 - smoothstep(0.0, 0.0022, sd);
  float tepi = 1.0 - smoothstep(0.0, 0.0026, abs(sd));

  /* Material emerald matte: warna dasar + gradien cahaya dari pointer. */
  float cahaya = clamp(0.5 - (q.y / 0.112) * 0.5, 0.0, 1.0);
  vec3 matte = mix(EMERALD * 0.70, EMERALD * 1.18, cahaya);
  col = mix(col, matte, badan * 0.94);

  /* Gold foil: HANYA garis tepi tipis + satu strip, sesuai aturan aksen. */
  col += GOLD_FOIL * tepi * 0.50;
  col += GOLD_FOIL * (1.0 - smoothstep(0.0, 0.0016, abs(q.y + 0.052))) * badan * 0.20;

  /* Rim light emerald dari tepi kartu. */
  col += EMERALD_MID * exp(-max(sd, 0.0) * 26.0) * (0.30 + 0.45 * uHover);
  col += EMERALD_LT * exp(-dot(p, p) * 30.0) * 0.10;

  /* Atmosfer: debu emerald + jalur cahaya digital samar. */
  col += EMERALD_LT * debuEmerald(p, t, 0.86, uRingan) * 0.26 * (1.0 - 0.4 * uRingan);
  col += EMERALD_MID * jalurCahaya(p, t, 0.0) * 0.09;
  col += EMERALD_MID * jalurCahaya(p, t, 1.0) * 0.06;

  return col;
}

/* ---------- 02 · 3D CYBER VAULT & ASSET SECURITY ---------- */
vec3 sceneCyberVault(vec2 uv, vec2 p, float aspect, float t) {
  vec3 col = SPACE_DEEP;
  /* Parallax kamera: seluruh ruang bergeser halus bersama pointer. */
  vec2 q = p - uPointer * 0.022;

  col += EMERALD * exp(-dot(q, q) * 3.0) * 0.60;
  col += EMERALD_MID * exp(-dot(q, q) * 4.2) * 0.22;

  /* Cincin mekanis berlapis; uHover membuka sedikit celah antar cincin. */
  float buka = uHover * 0.024;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float r = 0.245 + fi * 0.095 + buka * (1.0 + fi * 0.25);
    float dd = length(q);
    float tebal = 0.0024 + fi * 0.0010;
    float arah = (mod(fi, 2.0) < 0.5) ? 1.0 : -1.0;
    float putar = t * (0.060 / (1.0 + fi * 0.4)) * arah;

    /* Segmen: cincin terputus-putus seperti roda mekanis. */
    float sudut = atan(q.y, q.x) + putar;
    float segmen = smoothstep(0.22, 0.42, abs(fract(sudut / 6.2831853 * (10.0 + fi * 6.0)) - 0.5));
    float cincin = ring(dd, r, tebal) * segmen;
    vec3 warna = mix(EMERALD_MID, EMERALD_LT, 0.15 + fi * 0.18);
    col += warna * cincin * (0.90 - fi * 0.14) * (1.0 - 0.30 * uRingan);
  }

  /* Inti brankas: pendar emerald berdenyut — jaminan terkunci & terpantau. */
  float denyut = 0.62 + 0.38 * sin(t * 1.4);
  col += EMERALD_MID * exp(-dot(q, q) * 26.0) * (0.30 + 0.55 * uHover) * denyut;
  col += EMERALD_LT * exp(-dot(q, q) * 70.0) * 0.35;

  /* Pintu area dalam — dua daun yang menyempit saat hover (membuka sedikit). */
  float daun = sdBox(q, vec2(0.075 - uHover * 0.016, 0.115));
  col += EMERALD_LT * (1.0 - smoothstep(0.0, 0.005, abs(daun))) * 0.40;

  /* Debu emerald ruang. */
  col += EMERALD_LT * debuEmerald(q, t * 1.1, 0.94, uRingan) * 0.24;
  return col;
}

/* ---------- 03 · 3D CYBER MASCOT (A.I. ASSISTANT) ---------- */
vec3 sceneAiMascot(vec2 uv, vec2 p, float aspect, float t) {
  vec3 col = mix(EMERALD * 0.45, SPACE_DEEP, clamp(uv.y * 1.20, 0.0, 1.0));

  /* Maskot melayang: naik-turun pelan seperti bernapas. */
  float napas = sin(t * 1.1) * 0.008;
  vec2 m = vec2(0.02 * aspect + uPointer.x * 0.030, -0.02 + napas + uPointer.y * 0.020);
  vec2 q = (p - m) / vec2(1.0, 0.92);

  float kepala = length(q);
  float badan = 1.0 - smoothstep(0.085, 0.090, kepala);
  float tepi = 1.0 - smoothstep(0.0, 0.0035, abs(kepala - 0.088));

  vec3 matte = mix(EMERALD * 0.55, EMERALD * 1.05, clamp(0.5 - q.y * 3.0, 0.0, 1.0));
  col = mix(col, matte, badan * 0.92);
  col += EMERALD_LT * tepi * (0.55 + 0.25 * uHover);

  /* Visor: pita gelap di depan kepala. */
  float visor = 1.0 - smoothstep(0.0, 0.0026, abs(sdBox(q - vec2(0.0, 0.012), vec2(0.062, 0.020))));
  col = mix(col, SPACE_DEEP * 0.55, visor * badan);

  /* Mata mengikuti kursor — inti interaksi maskot. */
  vec2 sorot = vec2(uPointer.x * 0.016, uPointer.y * 0.008);
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float arahX = (fi < 0.5) ? -1.0 : 1.0;
    vec2 mata = vec2(arahX * 0.026 + sorot.x, 0.014 + sorot.y);
    float d = length(q - mata);
    float kelopak = 0.55 + 0.45 * sin(t * 0.9 + fi * 3.1);
    col += EMERALD_LT * exp(-d * d * 2600.0) * (0.85 + 0.15 * uHover);
    col += EMERALD_MID * exp(-d * d * 420.0) * 0.35 * kelopak;
  }

  /* Antena tipis di atas kepala. */
  float antena = (1.0 - smoothstep(0.0, 0.0030, abs(q.x))) *
    smoothstep(0.088, 0.100, kepala) * (1.0 - smoothstep(0.130, 0.140, kepala));
  col += EMERALD_MID * antena * 0.60;

  /* Orbit partikel mengelilingi maskot (elips = kedalaman). */
  float orbitR = 0.145 + 0.006 * sin(t * 1.3);
  float sudut = atan(q.y, q.x) + t * 0.25;
  float slot = floor((sudut / 6.2831853 + 0.5) * 12.0);
  float hs = hash21(vec2(slot, 7.0));
  if (hs > 0.45) {
    float sa2 = (slot / 12.0 + 0.5 / 12.0 - 0.5) * 6.2831853 + t * 0.25;
    vec2 npos = vec2(cos(sa2) * orbitR * 1.25, sin(sa2) * orbitR * 0.58);
    float nd = length(p - (m + npos));
    float pulse = 0.55 + 0.45 * sin(t * 2.1 + hs * 20.0);
    col += EMERALD_LT * (1.0 - smoothstep(0.0, 0.010, nd)) * pulse * 0.70;
  }

  col += EMERALD_LT * debuEmerald(p, t * 0.9, 0.90, uRingan) * 0.22;
  return col;
}

/* ---------- 04 · 3D LEDGER MATRIX & NODE NETWORK ---------- */
vec3 sceneLedgerMatrix(vec2 uv, vec2 p, float aspect, float t) {
  vec3 col = SPACE_DEEP;
  vec2 q = p - uPointer * 0.018;

  /* Lantai kisi perspektif: dasar "matrix" ledger internal. */
  float d = HORIZON - uv.y;
  if (d > 0.0) {
    vec2 gq = vec2(q.x / max(d + 0.05, 0.02), 1.0 / max(d + 0.05, 0.02));
    col += EMERALD_MID * grid(gq * vec2(0.50, 0.34), 0.045) * 0.16 * smoothstep(0.0, 0.10, d);
  }

  /* Balok 3D transparan + node berdenyut, dalam tiga baris kedalaman. */
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float y = -0.14 + fi * 0.14;
    float kolom = 5.0 + fi;
    float geser = uPointer.x * (0.006 + fi * 0.004);
    for (int j = 0; j < 5; j++) {
      float fj = float(j);
      if (fj < kolom) {
        float x = (fj / (kolom - 1.0) - 0.5) * 0.92 * aspect;
        vec2 node = vec2(x, y) - vec2(geser, uPointer.y * (0.004 + fi * 0.003));
        float bd = sdBox(q - node, vec2(0.028, 0.020));

        /* Balok tembus pandang + tepi bercahaya. */
        col += EMERALD * (1.0 - smoothstep(0.0, 0.0018, bd)) * 0.30;
        col += EMERALD_MID * (1.0 - smoothstep(0.0, 0.0018, abs(bd))) * 0.55;

        /* Titik node berdenyut. */
        float hs = hash21(vec2(fi * 5.0 + fj, 3.0));
        float pulse = 0.5 + 0.5 * sin(t * 1.7 + hs * 30.0);
        float nd = length(q - node);
        col += EMERALD_LT * exp(-nd * nd * 5200.0) * (0.5 + 0.5 * pulse) * (0.7 + 0.3 * uHover);
      }
    }
  }

  /* Pulse transaksi: jalur cahaya yang melintas di tiap baris. */
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float y = -0.14 + fk * 0.14;
    float jalan = fract(t * (0.14 + fk * 0.05) + fk * 0.31);
    float x = (-0.5 + jalan) * aspect;
    col += EMERALD_LT * (1.0 - smoothstep(0.0, 0.014, length(q - vec2(x, y)))) * 1.05;
  }

  /* Light trails samar + debu emerald. */
  col += EMERALD_MID * jalurCahaya(p, t, 1.0) * 0.10;
  col += EMERALD_LT * debuEmerald(q, t * 0.8, 0.93, uRingan) * 0.20;
  col = mix(col, EMERALD * 0.50, exp(-abs(p.y) * 5.0) * 0.30);
  return col;
}

/* ---------- 05 · 3D INTERACTIVE LOAN SIMULATOR ---------- */
vec3 sceneLoanSimulator(vec2 uv, vec2 p, float aspect, float t) {
  vec3 col = mix(EMERALD * 0.50, SPACE_DEEP, clamp(uv.y * 1.20, 0.0, 1.0));
  vec2 q = p - uPointer * 0.016;

  /* Cincin kedalaman: radius mengikuti nilai slider (tenor). */
  float r0 = 0.20 + uSlider * 0.10;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float r = r0 + fi * 0.055;
    float dd = length(q * vec2(1.0, 0.72));
    col += EMERALD_MID * ring(dd, r, 0.0026 + fi * 0.0012) * (0.55 - fi * 0.13);
  }

  /* Koin 3D: lebar menyusut mengikuti putaran → terasa berputar. */
  float putar = t * 0.6 + uSlider * 6.2831853;
  float lebar = 0.115 * abs(cos(putar)) + 0.010;
  vec2 c = vec2(0.0, 0.02 + uHover * 0.020);
  vec2 setengahKoin = vec2(lebar, 0.115);
  float koin = 1.0 - smoothstep(0.0, 0.0018, sdBox(q - c, setengahKoin));
  vec3 koinWarna = mix(EMERALD * 0.85, EMERALD_MID, clamp(0.5 - (q.y - c.y) * 4.0, 0.0, 1.0));
  col = mix(col, koinWarna, koin * 0.95);

  float tepiKoin = 1.0 - smoothstep(0.0, 0.0026, abs(sdBox(q - c, setengahKoin)));
  col += EMERALD_LT * tepiKoin * 0.75;
  col += GOLD_FOIL * tepiKoin * 0.20;

  /* Muka koin: cincin dalam berdenyut. */
  float dalam = 1.0 - smoothstep(0.0, 0.0022, abs(sdBox(q - c, vec2(lebar * 0.62, 0.072))));
  col += EMERALD_LT * dalam * 0.35 * (0.6 + 0.4 * sin(t * 2.0));

  /* Garis skala di bawah koin: menandai nilai slider bergerak. */
  float skalaY = -0.20;
  float tanda = 1.0 - smoothstep(0.0, 0.0022, abs(q.y - skalaY));
  float batas = step(-0.24, q.x) * step(q.x, 0.24);
  col += EMERALD_MID * tanda * batas * 0.35;
  float penunjuk = 1.0 - smoothstep(0.0, 0.0040, length(q - vec2(-0.24 + uSlider * 0.48, skalaY)));
  col += EMERALD_LT * penunjuk * 0.90;

  col += EMERALD_LT * debuEmerald(q, t * 1.2, 0.92, uRingan) * 0.22;
  return col;
}

/* ---------- 06 · 3D GATEWAY & QUANTUM PORTAL ---------- */
vec3 sceneQuantumPortal(vec2 uv, vec2 p, float aspect, float t) {
  vec3 col = SPACE_DEEP;
  vec2 q = p - uPointer * 0.030;

  /* Cakram portal: lubang energi emerald. */
  float dd = length(q);
  col += EMERALD * exp(-dd * dd * 2.6) * 0.55;

  /* Geometri berputar: dua lapis poligon bersudut. */
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float arah = (mod(fi, 2.0) < 0.5) ? 1.0 : -1.0;
    float putar = t * (0.18 + fi * 0.10) * arah;
    float sudut = atan(q.y, q.x) + putar;
    float sisi = 6.0 + fi * 3.0;
    float seg = floor((sudut / 6.2831853 + 0.5) * sisi) / sisi;
    float sudutSeg = seg * 6.2831853;
    float rp = 0.30 * (0.86 + fi * 0.14) / max(cos(sudut - sudutSeg), 0.55);
    float tepi = ring(dd, rp, 0.0030);
    col += mix(EMERALD_MID, EMERALD_LT, fi * 0.5) * tepi * (0.85 - fi * 0.20) * (1.0 - 0.30 * uRingan);
  }

  /* Kabut dalam portal + garis pindai naik. */
  float dalam = 1.0 - smoothstep(0.0, 0.30, dd);
  col += EMERALD_MID * dalam * 0.18;
  float scan = fract(uv.y * 1.5 - t * 0.18);
  col += EMERALD_LT * dalam * exp(-scan * 30.0) * 0.55;

  /* Partikel melayang keluar dari portal (jumlah diturunkan di mode ringan). */
  float langkah = mix(26.0, 14.0, uRingan);
  vec2 sp = vec2(q.x * 9.0, q.y * 9.0 - t * 0.55);
  vec2 sel = floor(sp);
  float h = hash21(sel);
  if (h > 0.72) {
    vec2 fp = fract(sp) - 0.5;
    float part = 1.0 - smoothstep(0.0, 0.18, length(fp));
    float tw = 0.5 + 0.5 * sin(t * 1.6 + h * 33.0);
    col += EMERALD_LT * part * tw * 0.42 * (1.0 - 0.5 * uRingan);
  }
  col += EMERALD_MID * 0.02 * langkah;

  /* Lantai jaringan tipis sebagai dasar portal. */
  float d = HORIZON - uv.y;
  if (d > 0.0) {
    vec2 gq = vec2(q.x / max(d + 0.05, 0.02), 1.0 / max(d + 0.05, 0.02));
    col += EMERALD_MID * grid(gq * vec2(0.42, 0.30), 0.05) * 0.18 * smoothstep(0.0, 0.10, d);
  }

  col = mix(col, SPACE_DEEP + EMERALD * 0.25, exp(-abs(p.y) * 4.0) * 0.25);
  return col;
}

void main() {
  float aspect = uResolusi.x / max(uResolusi.y, 1.0);
  vec2 uv = vUv;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - HORIZON);
  p += uPointer * 0.022;

  float t = uWaktu * (1.0 - 0.82 * uReduce);

  vec3 col;
  if (uPreset == 0) {
    col = scenePremiumCard(uv, p, aspect, t);
  } else if (uPreset == 1) {
    col = sceneCyberVault(uv, p, aspect, t);
  } else if (uPreset == 2) {
    col = sceneAiMascot(uv, p, aspect, t);
  } else if (uPreset == 3) {
    col = sceneLedgerMatrix(uv, p, aspect, t);
  } else if (uPreset == 4) {
    col = sceneLoanSimulator(uv, p, aspect, t);
  } else {
    col = sceneQuantumPortal(uv, p, aspect, t);
  }

  col *= 1.0 - 0.42 * length(uv - vec2(0.5));
  col += (hash21(uv * uResolusi + fract(uWaktu) * 91.0) - 0.5) * 0.012;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/** Horizon dalam koordinat uv (y dari bawah) — sama dengan konstanta shader. */
const HORIZON_UV = 0.46;

function kompilasi(
  gl: WebGLRenderingContext,
  tipe: number,
  sumber: string,
): WebGLShader | null {
  const shader = gl.createShader(tipe);
  if (shader === null) return null;
  gl.shaderSource(shader, sumber);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    // Detail galat dibiarkan terbaca di konsol perangkat yang gagal saja.
    console.warn(gl.getShaderInfoLog(shader) ?? "Shader gagal dikompilasi");
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Bangun adegan template. Mengembalikan `null` bila WebGL tidak tersedia,
 * shader gagal dikompilasi, atau konteks tidak bisa dibuat — pemanggil WAJIB
 * memakai fallback CSS dan tetap menampilkan seluruh konten hero.
 */
export function buatSceneTemplate(
  canvas: HTMLCanvasElement,
  opsi: OpsiTemplate,
): HandleTemplate | null {
  let gl: WebGLRenderingContext | null = null;
  try {
    const opsiKonteks: WebGLContextAttributes = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
      failIfMajorPerformanceCaveat: false,
    };
    gl =
      (canvas.getContext("webgl2", opsiKonteks) as WebGLRenderingContext | null) ??
      (canvas.getContext("webgl", opsiKonteks) as WebGLRenderingContext | null) ??
      (canvas.getContext("experimental-webgl", opsiKonteks) as WebGLRenderingContext | null);
  } catch {
    return null;
  }
  if (gl === null) return null;

  const vs = kompilasi(gl, gl.VERTEX_SHADER, VERT);
  const fs = kompilasi(gl, gl.FRAGMENT_SHADER, FRAG);
  if (vs === null || fs === null) return null;

  const prog = gl.createProgram();
  if (prog === null) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  gl.useProgram(prog);

  // Satu quad penuh layar sebagai triangle strip — tidak ada geometri lain.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const locPosisi = gl.getAttribLocation(prog, "aPosisi");
  gl.enableVertexAttribArray(locPosisi);
  gl.vertexAttribPointer(locPosisi, 2, gl.FLOAT, false, 0, 0);

  const uResolusi = gl.getUniformLocation(prog, "uResolusi");
  const uWaktu = gl.getUniformLocation(prog, "uWaktu");
  const uPointer = gl.getUniformLocation(prog, "uPointer");
  const uHover = gl.getUniformLocation(prog, "uHover");
  const uRipples = gl.getUniformLocation(prog, "uRipples");
  const uJumlahRipple = gl.getUniformLocation(prog, "uJumlahRipple");
  const uReduce = gl.getUniformLocation(prog, "uReduce");
  const uPreset = gl.getUniformLocation(prog, "uPreset");
  const uRinganUniform = gl.getUniformLocation(prog, "uRingan");
  const uSkrolUniform = gl.getUniformLocation(prog, "uSkrol");
  const uSliderUniform = gl.getUniformLocation(prog, "uSlider");

  const pointerTujuan = { x: 0, y: 0 };
  const pointerKini = { x: 0, y: 0 };
  let hoverTujuan = 0;
  let hoverKini = 0;
  let skrolTujuan = 0;
  let skrolKini = 0;
  let sliderTujuan = 0;
  let sliderKini = 0;
  const ripples = new Float32Array(6 * 3);
  ripples.fill(-999);
  let jumlahRipple = 0;
  let ripplesDitulis = 0;
  let waktu = 0;
  let frame = 0;
  let aktif = true;
  let mati = false;

  const perbaruiUkuran = (lebarCss: number, tinggiCss: number) => {
    const w = Math.max(1, Math.floor(lebarCss * opsi.dpr));
    const h = Math.max(1, Math.floor(tinggiCss * opsi.dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl!.viewport(0, 0, w, h);
  };

  const gambar = () => {
    if (gl === null) return;
    gl.uniform2f(uResolusi, canvas.width, canvas.height);
    gl.uniform1f(uWaktu, waktu);
    gl.uniform2f(uPointer, pointerKini.x, pointerKini.y);
    gl.uniform1f(uHover, hoverKini);
    gl.uniform3fv(uRipples, ripples);
    gl.uniform1i(uJumlahRipple, Math.min(jumlahRipple, 6));
    gl.uniform1f(uReduce, opsi.reduceMotion ? 1 : 0);
    gl.uniform1i(uPreset, opsi.preset);
    gl.uniform1f(uRinganUniform, opsi.ringan ? 1 : 0);
    gl.uniform1f(uSkrolUniform, skrolKini);
    gl.uniform1f(uSliderUniform, sliderKini);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  let langkahTerakhir = performance.now();

  const langkah = (sekarang: number) => {
    if (mati) return;
    // Waktu naik dari delta frame, dibatasi agar lonjakan tidak terlihat.
    const dt = Math.min(0.05, Math.max(0, sekarang - langkahTerakhir) / 1000);
    langkahTerakhir = sekarang;
    waktu += dt;

    // Pointer & hover diredam (lerp) supaya gerak tidak menghentak.
    pointerKini.x += (pointerTujuan.x - pointerKini.x) * 0.06;
    pointerKini.y += (pointerTujuan.y - pointerKini.y) * 0.06;
    hoverKini += (hoverTujuan - hoverKini) * 0.08;
    skrolKini += (skrolTujuan - skrolKini) * 0.06;
    sliderKini += (sliderTujuan - sliderKini) * 0.05;

    gambar();
    if (aktif) frame = requestAnimationFrame(langkah);
  };

  perbaruiUkuran(canvas.clientWidth || 1, canvas.clientHeight || 1);
  // Reduced motion: gambar satu frame statis, tanpa loop animasi.
  if (opsi.reduceMotion) {
    gambar();
  } else {
    frame = requestAnimationFrame(langkah);
  }

  const onKonteksHilang = (e: Event) => {
    e.preventDefault();
    mati = true;
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
  };
  const onKonteksDipulihkan = () => {
    // Konteks baru: tidak ada state yang dipertahankan → berhenti saja dan
    // biarkan pemanggil (komponen) beralih ke fallback CSS.
    mati = true;
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
  };
  canvas.addEventListener("webglcontextlost", onKonteksHilang, false);
  canvas.addEventListener("webglcontextrestored", onKonteksDipulihkan, false);

  return {
    horizonUv: HORIZON_UV,
    preset: opsi.preset,
    setPointer(nx, ny) {
      pointerTujuan.x = Math.max(-1, Math.min(1, nx));
      pointerTujuan.y = Math.max(-1, Math.min(1, ny));
    },
    setHover(aktifHover) {
      hoverTujuan = aktifHover ? 1 : 0;
    },
    tambahRiak(x, y) {
      const i = ripplesDitulis % 6;
      ripples[i * 3] = x;
      ripples[i * 3 + 1] = y;
      ripples[i * 3 + 2] = waktu;
      ripplesDitulis += 1;
      jumlahRipple = Math.min(6, jumlahRipple + 1);
    },
    setSkrol(nilai) {
      skrolTujuan = Math.max(0, Math.min(1, nilai));
    },
    setSlider(nilai) {
      sliderTujuan = Math.max(0, Math.min(1, nilai));
    },
    setAktif(nilai) {
      if (nilai === aktif) return;
      aktif = nilai;
      if (aktif && !mati) {
        langkahTerakhir = performance.now();
        frame = requestAnimationFrame(langkah);
      } else if (frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    },
    setUkuran: perbaruiUkuran,
    destroy() {
      if (mati) return;
      mati = true;
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      canvas.removeEventListener("webglcontextlost", onKonteksHilang);
      canvas.removeEventListener("webglcontextrestored", onKonteksDipulihkan);
      try {
        gl.deleteBuffer(buffer);
        gl.deleteProgram(prog);
        const ext = gl.getExtension("WEBGL_lose_context");
        ext?.loseContext();
      } catch {
        // Konteks bisa sudah hilang; tidak ada yang perlu dibersihkan lagi.
      }
    },
  };
}
