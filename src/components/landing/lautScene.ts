/**
 * Adegan laut malam PINDAI — satu quad penuh layar dengan fragment shader.
 *
 * Color grading mengikuti identitas hijau PINDAI: langit, horizon, air, dan
 * kabut bernuansa hijau emerald (`#0f3d3a` / `#1f6a62`). Biru hanya tersisa
 * pada cahaya bulan dan bintang sebagai suasana malam, bukan warna dominan.
 *
 * Kenapa WebGL mentah (tanpa Three.js/R3F): yang dibutuhkan hanya SATU bidang
 * untuk langit + bulan + gerbang brass + refleksi air, lalu semua digambar di
 * dalam satu draw call. Menambahkan library 3D untuk itu berarti membawa mesin
 * scene, geometri, dan material yang tidak dipakai — bertentangan dengan aturan
 * proyek (bundle ringan, tanpa dependensi baru demi visual).
 *
 * Modul ini SENGAJA tanpa React dan tanpa akses DOM saat impor, supaya bisa
 * dimuat malas (dynamic import) dari komponen hero, dan aman di Electron
 * (semua pemakaian window/document ada di dalam fungsi, bukan di top-level).
 *
 * Batas yang dijaga:
 *  - Semua kegagalan (WebGL tidak ada, shader gagal, context hilang) mengembalikan
 *    `null` — pemanggil WAJIB punya fallback CSS. Tidak pernah melempar error.
 *  - Tidak ada setState/animation frame dari React; satu rAF loop internal yang
 *    ditutup oleh `destroy()`.
 *  - Waktu diambil dari jam internal (bukan jam dinding) supaya tidak melompat
 *    setelah tab di-pause.
 */

export interface OpsiLaut {
  /** Hormati prefers-reduced-motion: gambar satu frame statis, tanpa loop. */
  reduceMotion: boolean;
  /** Rasio piksel perangkat yang sudah dibatasi pemanggil (1 - 2). */
  dpr: number;
}

export interface HandleLaut {
  /** Pointer relatif pusat hero, -1..1 (parallax lembut). */
  setPointer(nx: number, ny: number): void;
  /** Titik sumber riak dalam koordinat uv (x 0..1 kiri→kanan, y 0..1 bawah→atas). */
  tambahRiak(x: number, y: number): void;
  /** Jeda/lanjutkan loop (dipakai saat hero keluar layar atau tab disembunyikan). */
  setAktif(aktif: boolean): void;
  /** Perbarui ukuran kanvas (dipanggil ResizeObserver). */
  setUkuran(lebarCss: number, tinggiCss: number): void;
  /** Batas uv air (untuk menaruh riak di laut, bukan di langit). */
  readonly horizonUv: number;
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

const FRAG = `
precision highp float;

varying vec2 vUv;

uniform vec2  uResolusi;
uniform float uWaktu;
uniform vec2  uPointer;
uniform vec3  uRipples[6];
uniform int   uJumlahRipple;
uniform float uReduce;

const float HORIZON = 0.46;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float waves(vec2 q, float t) {
  float w = 0.0;
  w += sin(q.x * 2.7 + q.y * 8.0 + t * 0.55) * 0.55;
  w += sin(q.x * 6.3 - q.y * 5.0 + t * 0.80) * 0.26;
  w += sin(q.x * 15.0 + q.y * 12.0 + t * 1.30) * 0.12;
  return w;
}

void main() {
  float aspect = uResolusi.x / max(uResolusi.y, 1.0);
  vec2 uv = vUv;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - HORIZON);
  p += uPointer * 0.022;

  float t = uWaktu * (1.0 - 0.82 * uReduce);

  vec3 moonCol = vec3(0.72, 0.80, 0.98);
  vec2 moonPos = vec2(0.17 * aspect, 0.34);

  // ---------- LANGIT ----------
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

  // ---------- GERBANG BRASS DI HORIZON ----------
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
  vec3 brass = mix(vec3(0.40, 0.30, 0.15), vec3(0.86, 0.71, 0.41), clamp(p.y / gateH, 0.0, 1.0));
  col = mix(col, brass * 0.92, gateMask * 0.88);
  col += brass * gateGlow * (0.45 + 0.55 * gateMask);

  // ---------- AIR ----------
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
          float ring = exp(-tepi * tepi);
          rippleH += ring * exp(-age * 1.1) * exp(-dist * 1.25);
        }
      }
    }

    float hTotal = h + rippleH * 2.4;

    vec3 waterDeep = vec3(0.006, 0.024, 0.020);
    vec3 waterRim = vec3(0.026, 0.072, 0.062);
    vec3 water = mix(waterRim, waterDeep, smoothstep(0.0, 0.5, d));

    float shade = hTotal * 0.5 + 0.5;
    water += vec3(0.016, 0.052, 0.046) * smoothstep(0.55, 1.0, shade);

    float lane = exp(-abs(p.x - moonPos.x) * 1.9);
    float glitter = smoothstep(0.30, 1.0, sin(h * 7.0 + wq.y * 6.0 + t * 0.9) * 0.5 + 0.5);
    water += moonCol * lane * exp(-d * 3.0) * (0.10 + 0.85 * glitter) * 0.95;
    water += moonCol * rippleH * 0.95;

    col = mix(col, water, smoothstep(0.0, 0.012, d));
  }

  // ---------- KABUT DI HORIZON ----------
  vec3 haze = mix(vec3(0.040, 0.096, 0.082), moonCol, 0.22);
  col = mix(col, haze, exp(-abs(p.y) * 6.0) * 0.55);

  // ---------- VIGNETTE + GRAIN ----------
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
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Bangun adegan laut. Mengembalikan `null` bila WebGL tidak tersedia, shader
 * gagal dikompilasi, atau konteks tidak bisa dibuat — pemanggil harus memakai
 * fallback CSS dan tetap menampilkan seluruh konten hero.
 */
export function buatLautScene(
  canvas: HTMLCanvasElement,
  opsi: OpsiLaut,
): HandleLaut | null {
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
  const uRipples = gl.getUniformLocation(prog, "uRipples");
  const uJumlahRipple = gl.getUniformLocation(prog, "uJumlahRipple");
  const uReduce = gl.getUniformLocation(prog, "uReduce");

  const pointerTujuan = { x: 0, y: 0 };
  const pointerKini = { x: 0, y: 0 };
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
    gl.uniform3fv(uRipples, ripples);
    gl.uniform1i(uJumlahRipple, Math.min(jumlahRipple, 6));
    gl.uniform1f(uReduce, opsi.reduceMotion ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  let langkahTerakhir = performance.now();

  const langkah = (sekarang: number) => {
    if (mati) return;
    // Waktu naik dari delta frame, dibatasi agar lonjakan tidak terlihat.
    const dt = Math.min(0.05, Math.max(0, sekarang - langkahTerakhir) / 1000);
    langkahTerakhir = sekarang;
    waktu += dt;

    // Pointer diredam (lerp) supaya parallax tidak menghentak.
    pointerKini.x += (pointerTujuan.x - pointerKini.x) * 0.06;
    pointerKini.y += (pointerTujuan.y - pointerKini.y) * 0.06;

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
    setPointer(nx, ny) {
      pointerTujuan.x = Math.max(-1, Math.min(1, nx));
      pointerTujuan.y = Math.max(-1, Math.min(1, ny));
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
