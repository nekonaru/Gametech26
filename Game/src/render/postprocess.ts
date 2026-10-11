import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SettingsManager } from '../core/settings.js';
import { setVertexJitterAmount } from './snap.js';

const ditherShader = {
  uniforms: {
    tDiffuse: { value: null },
    uDithering: { value: 1.0 },
    uColorQuantization: { value: 1.0 },
    uScanlines: { value: 0.0 },
    uScanlineIntensity: { value: 0.1 },
    uGrain: { value: 1.0 },
    uGrainIntensity: { value: 0.03 },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(640, 360) }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uDithering;
    uniform float uColorQuantization;
    uniform float uScanlines;
    uniform float uScanlineIntensity;
    uniform float uGrain;
    uniform float uGrainIntensity;
    uniform float uTime;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    // Matriks Bayer 4x4 (0..1). Dipakai untuk menyebarkan kesalahan kuantisasi.
    float bayer4x4(vec2 p) {
      vec2 f = floor(mod(p, 4.0));
      float x0 = mod(f.x, 2.0);
      float x1 = floor(f.x * 0.5);
      float y0 = mod(f.y, 2.0);
      float y1 = floor(f.y * 0.5);
      float b3 = mod(x0 + y0, 2.0);
      float b1 = mod(x1 + y1, 2.0);
      float idx = b3 * 8.0 + y0 * 4.0 + b1 * 2.0 + y1;
      return (idx + 0.5) / 16.0;
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      if (uColorQuantization > 0.0) {
        // PS1 cuma punya 15-bit warna (32 tingkat per kanal). Kuantisasi polos
        // floor(c*64)/64 memotong gradasi jadi pita kasar: itulah yang
        // membuat gambar terasa "kotor". Dither Bayer 4x4 menyebarkan selisihnya
        // ke piksel sekitar, jadi palet tetap pendek ala PS1 tapi gradasi tetap
        // halus dan tidak menyakiti mata.
        float d = bayer4x4(gl_FragCoord.xy);
        color.rgb = floor(color.rgb * 31.0 + d) / 31.0;
      }

      if (uDithering > 0.0) {
        vec2 ditherCoord = gl_FragCoord.xy / 4.0;
        float dither = mod(ditherCoord.x + ditherCoord.y * 4.0, 16.0) / 16.0;
        color.rgb += (dither - 0.5) * 0.015 * uDithering;
      }

      if (uScanlines > 0.0) {
        float scanline = sin(gl_FragCoord.y * 3.14159 * 2.0) * uScanlineIntensity;
        color.rgb += scanline * uScanlines;
      }

      if (uGrain > 0.0) {
        float grain = (rand(vUv * uResolution + uTime) - 0.5) * uGrainIntensity;
        color.rgb += grain * uGrain;
      }

      gl_FragColor = color;
    }
  `
};

const vignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0.5 },
    uSmoothness: { value: 0.6 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    uniform float uSmoothness;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 center = vUv - 0.5;
      float dist = length(center * 2.0);
      float vignette = smoothstep(uSmoothness, 1.0, dist) * uIntensity;
      color.rgb *= (1.0 - vignette);
      gl_FragColor = color;
    }
  `
};

const brightnessShader = {
  uniforms: {
    tDiffuse: { value: null },
    uBrightness: { value: 1.0 },
    uContrast: { value: 1.0 },
    uGamma: { value: 1.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uBrightness;
    uniform float uContrast;
    uniform float uGamma;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      color.rgb *= uBrightness;
      color.rgb = (color.rgb - 0.5) * uContrast + 0.5;
      color.rgb = pow(color.rgb, vec3(1.0 / uGamma));
      gl_FragColor = color;
    }
  `
};

/**
 * Tinggi render internal dalam piksel. `0` = seukuran tampilan (tajam, 1:1),
 * nilai lain hanya menurunkan resolusi untuk GPU yang lebih lemah.
 */
export type InternalResolution = 0 | 240 | 360 | 480 | 720 | 1080;

export class PostProcessManager {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private settings: SettingsManager;
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private ditherPass: ShaderPass;
  private vignettePass: ShaderPass;
  private brightnessPass: ShaderPass;
  private internalWidth = 1280;
  private internalHeight = 720;
  private canvasWidth = 0;
  private canvasHeight = 0;
  private resolution: InternalResolution = 0;
  private renderTarget: THREE.WebGLRenderTarget;
  private time = 0;
  /** Salinan pengaturan "Jarak Kabut"; 0 = tanpa batas buatan. */
  private fogDistance = 0;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, settings: SettingsManager) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.settings = settings;

    this.renderTarget = new THREE.WebGLRenderTarget(this.internalWidth, this.internalHeight, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.SRGBColorSpace
    });

    this.composer = new EffectComposer(this.renderer, this.renderTarget);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.ditherPass = new ShaderPass(ditherShader);
    this.composer.addPass(this.ditherPass);

    this.vignettePass = new ShaderPass(vignetteShader);
    this.composer.addPass(this.vignettePass);

    this.brightnessPass = new ShaderPass(brightnessShader);
    this.composer.addPass(this.brightnessPass);

    this.applySettings();
  }

  private applySettings(): void {
    const gfx = this.settings.get('graphics');
    this.ditherPass.uniforms.uDithering.value = gfx.dithering ? 1.0 : 0.0;
    this.ditherPass.uniforms.uColorQuantization.value = gfx.colorQuantization ? 1.0 : 0.0;
    this.ditherPass.uniforms.uScanlines.value = gfx.scanlines ? 1.0 : 0.0;
    this.ditherPass.uniforms.uGrain.value = gfx.grain ? 1.0 : 0.0;
    this.brightnessPass.uniforms.uBrightness.value = gfx.brightness;
  }

  setSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
    // Hitung ulang dari setelan, jangan menimpanya. Kalau `composer.setSize`
    // dipanggil langsung dengan ukuran kanvas, setelan "Resolusi Internal"
    // tidak akan pernah berlaku dan tiap resize mengubah tampilan diam-diam.
    this.setResolution(this.resolution);
  }

  /**
   * Tinggi render internal. `0` berarti seukuran tampilan (tajam, 1:1);
   * nilai lain hanya dipakai untuk menurunkan beban GPU.
   */
  setResolution(resolution: InternalResolution): void {
    this.resolution = resolution;
    const cw = this.canvasWidth || this.renderer.domElement.clientWidth || 1280;
    const ch = this.canvasHeight || this.renderer.domElement.clientHeight || 720;
    const aspect = ch > 0 ? cw / ch : 16 / 9;

    // Jangan pernah render di atas ukuran layar: hasilnya justru di-downsample,
    // jadi gambar sama saja tapi GPU bekerja dua kali lipat.
    const targetH = Math.max(1, resolution > 0 ? Math.min(resolution, ch) : ch);
    const targetW = Math.max(1, Math.round(targetH * aspect));

    this.internalWidth = targetW;
    this.internalHeight = targetH;

    // `setSize` di WebGLRenderTarget mengalokasikan ulang hanya bila ukuran
    // berubah, jadi tidak ada texture/fbo yang bocor di sini.
    this.renderTarget.setSize(targetW, targetH);
    this.composer.setSize(targetW, targetH);
    this.ditherPass.uniforms.uResolution.value.set(targetW, targetH);
  }

  setVertexJitter(value: number): void {
    // Penyimpangan verteks dikerjakan di dalam shader tiap material
    // (lihat render/snap.ts). Tugas metode ini hanya meneruskan nilai
    // pengaturan supaya perubahan slider langsung terasa tanpa reload.
    setVertexJitterAmount(value);
  }

  setDithering(enabled: boolean): void {
    this.ditherPass.uniforms.uDithering.value = enabled ? 1.0 : 0.0;
  }

  setColorQuantization(enabled: boolean): void {
    this.ditherPass.uniforms.uColorQuantization.value = enabled ? 1.0 : 0.0;
  }

  setScanlines(enabled: boolean): void {
    this.ditherPass.uniforms.uScanlines.value = enabled ? 1.0 : 0.0;
  }

  setGrain(enabled: boolean): void {
    this.ditherPass.uniforms.uGrain.value = enabled ? 1.0 : 0.0;
  }

  /**
   * "Jarak Kabut" dari Pengaturan.
   *
   * LightingManager menulis jarak mentah tiap preset; fungsi ini hanya
   * memotongnya supaya pilihan pemain menang tanpa menimpa warna dan jarak
   * dasar yang sudah diatur preset.
   */
  setFogDistance(distance: number): void {
    this.fogDistance = Number.isFinite(distance) && distance > 0 ? distance : 0;
    this.applyFogDistance();
  }

  private applyFogDistance(): void {
    const fog = this.scene.fog;
    if (!fog || this.fogDistance <= 0) return;
    // FogExp2 tidak punya near/far; hanya Fog linear yang bisa dipotong.
    if (!(fog instanceof THREE.Fog)) return;
    fog.far = Math.min(fog.far, this.fogDistance);
    // Jangan sampai near >= far: kabutnya jadi transparan total.
    if (fog.near > fog.far * 0.9) fog.near = Math.max(0, fog.far * 0.9);
  }

  setBrightness(value: number): void {
    this.brightnessPass.uniforms.uBrightness.value = value;
  }

  setScene(scene: THREE.Scene): void {
    this.scene = scene;
    this.renderPass.scene = scene;
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
    this.renderPass.camera = camera;
  }

  render(): void {
    this.time += 1/60;
    this.ditherPass.uniforms.uTime.value = this.time;
    // LightingManager menulis jarak kabut preset saat ganti bab; potong lagi
    // tiap frame supaya setelan pemain selalu menang tanpa perlu langkah ekstra.
    this.applyFogDistance();
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
    this.renderTarget.dispose();
  }

  getComposer(): EffectComposer {
    return this.composer;
  }

  getRenderTarget(): THREE.WebGLRenderTarget {
    return this.renderTarget;
  }
}