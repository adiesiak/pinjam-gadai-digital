/**
 * Mesin adegan 3D landing page PINDAI — satu quad penuh layar dengan fragment
 * shader, ENAM preset visual berbeda.
 *
 * Kenapa WebGL mentah (tanpa Three.js/R3F/Drei): yang dibutuhkan hanya SATU
 * bidang penuh layar, lalu seluruh langit, bulan, gerbang, air, kisi digital,
 * cincin orbit, brankas, dan kota digambar di dalam satu draw call. Menambahkan
 * mesin scene 3D lengkap untuk itu berarti membawa geometri, material, dan
 * renderer yang tidak dipakai — bertentangan dengan aturan proyek (bundle
 * ringan, tanpa dependensi baru demi visual). Modul ini juga menggantikan
 * `lautScene.ts` lama: preset 0 di bawah ini adalah adegan laut malam yang sama,
 * kini menjadi salah satu dari enam template.
 *
 * Arsitektur:
 *  - `buatSceneTemplate(canvas, opsi)` mengembalikan `HandleTemplate`, atau
 *    `null` bila WebGL tidak ada / shader gagal / konteks gagal dibuat.
 *    Pemanggil WAJIB punya fallback CSS — tidak pernah ada layar kosong.
 *  - Preset dipilih dari ID template (`lib/landingTemplate.ts`) lewat
 *    `landingTemplatePreset()`, jadi hanya SATU scene yang hidup pada satu waktu
 *    (halaman publik memuat template aktif; panel admin hanya memuat yang
 *    sedang di-preview).
 *
 * Batas yang dijaga:
 *  - Tanpa React, tanpa akses DOM saat impor → aman dimuat malas & aman di
 *    Electron (semua pemakaian window/document ada di dalam fungsi).
 *  - Tanpa `setState` per frame: parallax, hover, dan riak ditulis sebagai uniform
 *    di dalam satu rAF internal yang ditutup `destroy()`.
 *  - Waktu naik dari delta frame (bukan jam dinding) supaya tidak melompat
 *    setelah tab dijeda.
 *  - `prefers-reduced-motion` → satu frame statis, tanpa loop.
 *  - `webglcontextlost`/`restored` → berhenti, biarkan pemanggil beralih ke
 *    fallback statis.
 *  - Mode ringan (mobile) mengurangi jumlah partikel/langkah loop lewat uniform
 *    `uRingan`, bukan dengan menurunkan kualitas visual utama.
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
 * nuansanya tetap satu keluarga: PINDAI Green.
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

const float HORIZON = 0.46;

/* Hijau PINDAI — dipakai semua preset supaya identitas merek konsisten. */
const vec3 GREEN_DEEP = vec3(0.004, 0.028, 0.024);
const vec3 GREEN_MID  = vec3(0.012, 0.075, 0.064);
const vec3 GREEN_RIM  = vec3(0.055, 0.230, 0.196);
const vec3 GREEN_GLOW = vec3(0.190, 0.560, 0.430);
const vec3 BRASS      = vec3(0.790, 0.660, 0.415);
const vec3 MOON       = vec3(0.740, 0.815, 0.985);

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
 * fwidth tidak dipakai sama sekali. Antialiasing kasar ditutup oleh peredaman di
 * pemanggilnya (lantai kisi hanya terlihat di dekat horizon).
 */
float grid(vec2 q, float w) {
  vec2 f = abs(fract(q) - 0.5);
  float garis = max(1.0 - smoothstep(0.0, w, f.x), 1.0 - smoothstep(0.0, w, f.y));
  return garis;
}

float waves(vec2 q, float t) {
  float w = 0.0;
  w += sin(q.x * 2.7 + q.y * 8.0 + t * 0.55) * 0.55;
  w += sin(q.x * 6.3 - q.y * 5.0 + t * 0.80) * 0.26;
  w += sin(q.x * 15.0 + q.y * 12.0 + t * 1.30) * 0.12;
  return w;
}

/* ---------- 01 · MOONLIT PINDAI ---------- */
vec3 sceneMoonlit(vec2 uv, vec2 p, float aspect, float t) {
  vec3 moonCol = MOON;
  vec2 moonPos = vec2(0.17 * aspect, 0.34);

  float skyT = clamp((p.y + 0.1) / 0.8, 0.0, 1.0);
  vec3 skyTop = vec3(0.008, 0.030, 0.024);
  vec3 skyHor = vec3(0.034, 0.092, 0.078);
  vec3 col = mix(skyHor, skyTop, pow(skyT, 0.85));

  float md = length(p - moonPos);
  col += moonCol * exp(-md * md * 6.0) * 0.16;
  col += moonCol * (1.0 - smoothstep(0.058, 0.088, md)) * 0.6;

  if (p.y > 0.03) {
    vec2 sp = p * 22.0;
    float h = hash21(floor(sp));
    if (h > 0.956) {
      vec2 fp = fract(sp) - 0.5;
      float tw = 0.6 + 0.4 * sin(t * 1.6 + h * 40.0);
      float star = (1.0 - smoothstep(0.0, 0.42, length(fp))) * tw;
      col += vec3(0.75, 0.82, 1.0) * star * 0.55 * smoothstep(0.03, 0.30, p.y);
    }
  }

  /* Gerbang kuningan di horizon. */
  float gateX = -0.02 * aspect;
  float gateH = 0.40;
  float halfW = 0.145;
  float pw = 0.022;
  float lh = 0.030;
  float g = 1e9;
  g = min(g, sdBox(p - vec2(gateX - halfW, gateH * 0.5), vec2(pw * 0.5, gateH * 0.5)));
  g = min(g, sdBox(p - vec2(gateX + halfW, gateH * 0.5), vec2(pw * 0.5, gateH * 0.5)));
  g = min(g, sdBox(p - vec2(gateX, gateH - lh * 0.5), vec2(halfW + pw, lh * 0.5)));
  float hw2 = 0.088;
  float gh2 = 0.30;
  g = min(g, sdBox(p - vec2(gateX - hw2, gh2 * 0.5), vec2(pw * 0.34, gh2 * 0.5)));
  g = min(g, sdBox(p - vec2(gateX + hw2, gh2 * 0.5), vec2(pw * 0.34, gh2 * 0.5)));
  g = min(g, sdBox(p - vec2(gateX, gh2), vec2(hw2, lh * 0.38)));

  float gateMask = 1.0 - smoothstep(0.0, 0.007, g);
  float gateGlow = exp(-max(g, 0.0) * 24.0) * 0.30;
  vec3 brass = mix(BRASS * 0.5, BRASS, clamp(p.y / gateH, 0.0, 1.0));
  col = mix(col, brass * 0.92, gateMask * 0.88);
  col += brass * gateGlow * (0.45 + 0.55 * gateMask);

  /* Air + riak. */
  float d = HORIZON - uv.y;
  if (d > 0.0) {
    float persp = 1.0 / (d + 0.055);
    vec2 wq = vec2(p.x * persp * 0.30, persp);
    float h = waves(wq, t);

    float rippleH = 0.0;
    for (int i = 0; i < 6; i++) {
      if (i < uJumlahRipple) {
        vec3 r = uRipples[i];
        float age = uWaktu - r.z;
        if (age >= 0.0 && age <= 3.2) {
          vec2 rp = vec2((r.x - 0.5) * aspect, r.y - HORIZON);
          float dist = length(p - rp);
          float radius = age * 0.30;
          float tepi = (dist - radius) * 13.0;
          float ringR = exp(-tepi * tepi);
          rippleH += ringR * exp(-age * 1.1) * exp(-dist * 1.25);
        }
      }
    }

    float hTotal = h + rippleH * 2.4;
    vec3 water = mix(vec3(0.026, 0.072, 0.062), vec3(0.006, 0.024, 0.020), smoothstep(0.0, 0.5, d));
    water += vec3(0.016, 0.052, 0.046) * smoothstep(0.55, 1.0, hTotal * 0.5 + 0.5);

    float lane = exp(-abs(p.x - moonPos.x) * 1.9);
    float glitter = smoothstep(0.30, 1.0, sin(h * 7.0 + wq.y * 6.0 + t * 0.9) * 0.5 + 0.5);
    water += moonCol * lane * exp(-d * 3.0) * (0.10 + 0.85 * glitter) * 0.95;
    water += moonCol * rippleH * 0.95;

    col = mix(col, water, smoothstep(0.0, 0.012, d));
  }

  vec3 haze = mix(vec3(0.040, 0.096, 0.082), moonCol, 0.22);
  col = mix(col, haze, exp(-abs(p.y) * 6.0) * 0.55);
  return col;
}

/* ---------- 02 · FLOATING GREEN CARD ---------- */
vec3 sceneFloating(vec2 uv, vec2 p, float aspect, float t) {
  vec3 col = mix(GREEN_MID * 0.6, GREEN_DEEP, clamp(uv.y * 1.2, 0.0, 1.0));

  /* Sorot kartu melayang sebagai focal point (naik sedikit saat hover). */
  vec2 card = vec2(0.12 * aspect, -0.06 + uHover * 0.035);
  float cd = length((p - card) * vec2(1.0, 1.15));
  float halo = exp(-cd * cd * 9.0);
  col += GREEN_GLOW * halo * (0.30 + 0.30 * uHover);

  /* Sisi kartu: glow lebih tajam dari lighting pointer. */
  vec2 light = vec2(-0.22 * aspect, 0.20);
  float ld = length(p - light);
  col += GREEN_GLOW * exp(-ld * ld * 22.0) * 0.55;
  col += GREEN_RIM * exp(-length(p - card) * 5.0) * 0.22;

  /* Partikel halus naik perlahan (jumlah dikurangi di mode ringan). */
  float langkah = mix(14.0, 7.0, uRingan);
  vec2 sp = p * 9.0;
  sp.y += t * 0.45;
  vec2 sel = floor(sp);
  float h = hash21(sel);
  if (h > 0.62) {
    vec2 fp = fract(sp) - 0.5 - vec2(0.0, (h - 0.5) * 0.6);
    float part = 1.0 - smoothstep(0.0, 0.16, length(fp));
    float tw = 0.55 + 0.45 * sin(t * 1.3 + h * 30.0);
    col += GREEN_GLOW * part * tw * 0.35;
  }
  col += GREEN_RIM * 0.02 * langkah;

  /* Lapisan kedalaman: pita gelap tipis memberi kesan ruang, bukan dinding. */
  float band = sin(p.y * 12.0 + t * 0.25) * 0.5 + 0.5;
  col *= 0.94 + 0.06 * band;
  return col;
}

/* ---------- 03 · DIGITAL GATE ---------- */
vec3 sceneGate(vec2 uv, vec2 p, float aspect, float t) {
  vec3 col = mix(vec3(0.008, 0.040, 0.034), GREEN_DEEP, clamp(uv.y, 0.0, 1.0));

  /* Lantai kisi dengan perspektif. */
  float d = HORIZON - uv.y;
  if (d > 0.0) {
    vec2 gq = vec2(p.x / max(d + 0.05, 0.02), 1.0 / max(d + 0.05, 0.02));
    float g = grid(gq * vec2(0.45, 0.30), 0.05);
    col += GREEN_GLOW * g * 0.22 * smoothstep(0.0, 0.10, d);
  }

  /* Gerbang: rangka bercahaya yang bergeser mengikuti pointer (gate response). */
  vec2 gatePos = vec2(uPointer.x * 0.035, uPointer.y * 0.020);
  vec2 gp = p - gatePos;
  float w = 0.185;
  float h = 0.240;
  float frame = sdBox(gp, vec2(w, h)) - 0.006;
  float dalam = sdBox(gp, vec2(w - 0.022, h - 0.022));
  float tepiGerbang = (1.0 - smoothstep(0.0, 0.006, abs(frame))) * 0.9;
  tepiGerbang += (1.0 - smoothstep(0.0, 0.005, abs(dalam))) * 0.55;
  col += GREEN_GLOW * tepiGerbang;

  /* Kabut di dalam gerbang + garis pemindai naik. */
  float maskDalam = 1.0 - smoothstep(-0.010, 0.004, dalam);
  col += GREEN_RIM * maskDalam * 0.35;
  float scan = fract(uv.y * 1.4 - t * 0.16);
  col += GREEN_GLOW * maskDalam * exp(-scan * 34.0) * 0.55;

  /* Jalur cahaya horizontal melintas. */
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float jalur = fract(t * (0.10 + fi * 0.035) + fi * 0.27);
    float y = -0.45 + jalur * 1.10;
    float tebal = 1.0 - smoothstep(0.0, 0.0035 + fi * 0.001, abs(p.y - y));
    float panjang = exp(-abs(p.x + uPointer.x * 0.06) * 1.4);
    col += GREEN_GLOW * tebal * panjang * (0.55 - fi * 0.08) * (1.0 - 0.6 * uRingan);
  }

  /* Partikel kisi halus. */
  vec2 sp = (p + gatePos) * 11.0;
  float hh = hash21(floor(sp));
  if (hh > 0.93) {
    vec2 fp = fract(sp) - 0.5;
    col += GREEN_GLOW * (1.0 - smoothstep(0.0, 0.3, length(fp))) * 0.30;
  }

  col = mix(col, vec3(0.012, 0.058, 0.048), exp(-abs(p.y) * 5.0) * 0.35);
  return col;
}

/* ---------- 04 · PINDAI ORBIT ---------- */
vec3 sceneOrbit(vec2 uv, vec2 p, float aspect, float t) {
  vec3 col = GREEN_DEEP * 1.15;
  col += GREEN_RIM * exp(-length(p) * 2.6) * 0.22;

  /* Kartu sebagai focal utama — bukan cincin. */
  col += GREEN_GLOW * exp(-dot(p, p) * 16.0) * (0.34 + 0.16 * uHover);

  /* Dua cincin orbit dengan kedalaman berbeda. */
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float rot = t * (0.055 + fi * 0.045) + fi * 1.7;
    float ca = cos(rot);
    float sa = sin(rot);
    vec2 q = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);
    /* Cincin elips tipis dengan radius berbeda, respons pointer dibedakan. */
    vec2 skala = vec2(1.0, 0.42 + fi * 0.10);
    float dd = length(q * skala);
    float r = 0.30 + fi * 0.115;
    float cincin = ring(dd, r, 0.0022 + fi * 0.0012);
    vec3 warna = mix(GREEN_GLOW, BRASS, fi * 0.35);
    col += warna * cincin * (0.55 - fi * 0.12) * (1.0 - 0.35 * uRingan);

    /* Node digital di cincin: parallax mengikuti pointer per kedalaman. */
    float langkahNode = mix(10.0, 6.0, uRingan);
    float sudut = atan(q.y, q.x);
    float slot = floor((sudut / 6.2831853 + 0.5) * langkahNode);
    float hn = hash21(vec2(slot, fi));
    if (hn > 0.42) {
      float sudutNode = (slot / langkahNode + 0.5 / langkahNode - 0.5) * 6.2831853 + rot;
      vec2 npos = vec2(cos(sudutNode) * r / skala.x, sin(sudutNode) * r / skala.y);
      npos += uPointer * (0.014 + fi * 0.010);
      float nd = length(p - npos);
      float pulse = 0.55 + 0.45 * sin(t * 1.9 + hn * 25.0);
      col += mix(GREEN_GLOW, BRASS, fi * 0.5) * (1.0 - smoothstep(0.0, 0.013, nd)) * pulse;
    }
  }

  col += GREEN_GLOW * (1.0 - smoothstep(0.0, 0.030, length(p))) * 0.55;
  return col;
}

/* ---------- 05 · PINDAI VAULT ---------- */
vec3 sceneVault(vec2 uv, vec2 p, float aspect, float t) {
  vec3 col = GREEN_DEEP;
  /* Parallax kamera: seluruh ruang bergeser halus bersama pointer. */
  vec2 q = p - uPointer * 0.020;

  col += GREEN_RIM * exp(-dot(q, q) * 3.4) * 0.30;

  /* Cincin mekanis berlapis. uHover membuka sedikit celah antar cincin. */
  float buka = uHover * 0.022;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float r = 0.245 + fi * 0.095 + buka * (1.0 + fi * 0.25);
    float dd = length(q);
    float tebal = 0.0026 + fi * 0.0011;
    float arah = (mod(fi, 2.0) < 0.5) ? 1.0 : -1.0;
    float putar = t * (0.055 / (1.0 + fi * 0.4)) * arah;

    /* Segmen: cincin terputus-putus seperti roda mekanis. */
    float sudut = atan(q.y, q.x) + putar;
    float segmen = smoothstep(0.24, 0.42, abs(fract(sudut / 6.2831853 * (10.0 + fi * 6.0)) - 0.5));
    float cincin = ring(dd, r, tebal) * segmen;
    vec3 warna = mix(GREEN_GLOW, BRASS, 0.20 + fi * 0.18);
    col += warna * cincin * (0.85 - fi * 0.13) * (1.0 - 0.30 * uRingan);

    /* Spoke pendek antar cincin untuk kesan mekanis (bukan brankas klasik). */
    if (fi < 2.0) {
      float spokeA = sudut * (6.0 + fi * 4.0);
      float spoke = (1.0 - smoothstep(0.0, 0.06, abs(fract(spokeA / 3.1415927) - 0.5)));
      float antar = (1.0 - smoothstep(0.0, 0.20, abs(dd - (r + 0.048)))) * (dd > r ? 1.0 : 0.0);
      col += GREEN_RIM * spoke * antar * 0.32;
    }
  }

  /* Ruang dalam: semakin terang saat hover, kartu di pusat tetap focal. */
  col += GREEN_GLOW * exp(-dot(q, q) * 26.0) * (0.34 + 0.55 * uHover);
  col += BRASS * exp(-dot(q, q) * 60.0) * 0.30;

  /* Pintu area dalam — dua daun yang menyempit saat hover (membuka sedikit). */
  float daun = sdBox(q, vec2(0.075 - uHover * 0.016, 0.115));
  float tepiDaun = 1.0 - smoothstep(0.0, 0.005, abs(daun));
  col += GREEN_GLOW * tepiDaun * 0.35;

  /* Partikel debu ruang. */
  vec2 sp = (q + uPointer * 0.01) * 13.0;
  float h = hash21(floor(sp));
  if (h > 0.955) {
    col += GREEN_GLOW * (1.0 - smoothstep(0.0, 0.3, length(fract(sp) - 0.5))) * 0.28;
  }
  return col;
}

/* ---------- 06 · PINDAI CITY ---------- */
vec3 sceneCity(vec2 uv, vec2 p, float aspect, float t) {
  vec3 col = mix(vec3(0.014, 0.062, 0.052), GREEN_DEEP, clamp(uv.y * 1.1, 0.0, 1.0));
  float dasar = -0.30;

  /* Dua lapis skyline: lapis depan bergeser lebih banyak (parallax kedalaman). */
  for (int lapis = 0; lapis < 2; lapis++) {
    float fl = float(lapis);
    vec2 q = p + uPointer * (0.012 + fl * 0.026);
    float tinggiLapis = 0.30 - fl * 0.10;
    float kolom = floor(q.x * (7.0 + fl * 4.0));
    float h = hash21(vec2(kolom, fl * 3.7));
    float lebar = 0.030 + h * 0.020;
    float tinggi = 0.045 + h * tinggiLapis;
    float cx = (kolom + 0.5) / (7.0 + fl * 4.0);
    float dx = abs(q.x - cx) - lebar * 0.5;
    float dy = abs(q.y - (dasar + tinggi * 0.5)) - tinggi * 0.5;
    float blok = sdBox(vec2(dx, dy), vec2(0.0));
    float gedung = 1.0 - smoothstep(0.0, 0.0016, blok);

    vec3 warna = mix(GREEN_RIM * 0.55, GREEN_MID * 1.6, fl * 0.7);
    col = mix(col, warna, gedung * (0.72 - fl * 0.16));

    /* Jendela menyala — hanya gedung, hanya sebagian kecil. */
    if (blok < 0.0) {
      vec2 jendela = q * vec2(34.0, 26.0);
      float j = hash21(floor(jendela) + vec2(kolom, fl * 11.0));
      if (j > 0.72) {
        float nyala = 0.55 + 0.45 * sin(t * 0.9 + j * 40.0);
        col += mix(GREEN_GLOW, BRASS, 0.25) * (1.0 - smoothstep(0.0, 0.36, length(fract(jendela) - 0.5))) * nyala * 0.55;
      }
    }
  }

  /* Jalan + jalur cahaya jaringan (rumah → toko → node → PINDAI → kota). */
  float jalan = 1.0 - smoothstep(0.0, 0.0035, abs(p.y - (dasar + 0.004)));
  col += GREEN_GLOW * jalan * 0.28;

  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float y0 = dasar + 0.03 + fi * 0.085;
    float x0 = -0.62 + fi * 0.30;
    float x1 = 0.34 + fi * 0.16;
    float laju = 0.16 + fi * 0.07;
    float jalanX = mix(x0, x1, fract(t * laju + fi * 0.33));

    /* Garis jaringan tipis. */
    float seg = 1.0 - smoothstep(0.0, 0.0030, abs(p.y - y0));
    float batas = step(x0 - 0.02, p.x) * step(p.x, x1 + 0.02);
    col += GREEN_RIM * seg * batas * 0.42;

    /* Titik cahaya berjalan di sepanjang garis. */
    float titik = 1.0 - smoothstep(0.0, 0.016, length(p - vec2(jalanX, y0)));
    col += GREEN_GLOW * titik * batas * 1.15;
    float titik2 = 1.0 - smoothstep(0.0, 0.013, length(p - vec2(mix(x1, x0, fract(t * laju + fi * 0.33 + 0.5)), y0)));
    col += BRASS * titik2 * batas * 0.75;
  }

  /* Node pusat PINDAI — focal point tetap stabil di tengah. */
  vec2 node = vec2(0.06 * aspect, dasar + 0.22);
  float nd = length(p - node);
  float denyut = 0.62 + 0.38 * sin(t * 1.5);
  col += GREEN_GLOW * exp(-nd * nd * 46.0) * (0.55 + 0.45 * uHover) * denyut;
  col += BRASS * ring(nd, 0.085, 0.0035) * 0.55;

  /* Rumah & toko kecil sebagai asal jaringan (kiri bawah, tetap sederhana). */
  float rumah = 1.0 - smoothstep(0.0, 0.0016, sdBox(p - vec2(-0.56, dasar + 0.055), vec2(0.032, 0.030)));
  col = mix(col, GREEN_RIM * 0.75, rumah * 0.75);
  float toko = 1.0 - smoothstep(0.0, 0.0016, sdBox(p - vec2(-0.28, dasar + 0.070), vec2(0.040, 0.045)));
  col = mix(col, GREEN_RIM * 0.9, toko * 0.75);

  col = mix(col, vec3(0.020, 0.070, 0.058), exp(-abs(p.y - dasar) * 4.0) * 0.30);
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
    col = sceneMoonlit(uv, p, aspect, t);
  } else if (uPreset == 1) {
    col = sceneFloating(uv, p, aspect, t);
  } else if (uPreset == 2) {
    col = sceneGate(uv, p, aspect, t);
  } else if (uPreset == 3) {
    col = sceneOrbit(uv, p, aspect, t);
  } else if (uPreset == 4) {
    col = sceneVault(uv, p, aspect, t);
  } else {
    col = sceneCity(uv, p, aspect, t);
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

  const pointerTujuan = { x: 0, y: 0 };
  const pointerKini = { x: 0, y: 0 };
  let hoverTujuan = 0;
  let hoverKini = 0;
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
