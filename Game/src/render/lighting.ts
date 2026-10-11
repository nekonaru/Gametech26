import * as THREE from 'three';
import { SettingsManager } from '../core/settings.js';

export interface LightPreset {
  ambient: { color: number; intensity: number };
  hemisphere: { skyColor: number; groundColor: number; intensity: number };
  directional?: { color: number; intensity: number; position: THREE.Vector3; target: THREE.Vector3; castShadow?: boolean };
  pointLights?: Array<{ color: number; intensity: number; position: THREE.Vector3; distance: number; decay: number }>;
  fog: { color: number; near: number; far: number };
  /**
   * Puncak kubah langit di atas kepala. Sisi bawah kubah selalu memakai warna
   * kabut, sehingga tanah yang berkabut menyatu dengan langit tanpa garis
   * pemisah yang janggal. `celestial` menambah matahari/bulan bercahaya
   * dengan halo lembut dan (untuk malam) hamparan bintang.
   */
  sky?: {
    top: number;
    celestial?: {
      color: number;
      /** Ukuran cakram dalam satuan radian (sudut dari pusat pengamat). */
      size: number;
      /** Kekuatan halo mengelilingi cakram. */
      glow: number;
      /** Arah benda langit; default mengikuti posisi cahaya matahari/bulan preset. */
      dir?: THREE.Vector3;
      /** Kepekatan bintang 0..1; hanya terasa di langit malam. */
      stars?: number;
    };
  };
}

export const LIGHT_PRESETS: Record<string, LightPreset> = {
  pagi_desa: {
    ambient: { color: 0xffeedd, intensity: 0.4 },
    hemisphere: { skyColor: 0xfff8e7, groundColor: 0x887755, intensity: 0.6 },
    directional: { color: 0xfff0d0, intensity: 1.2, position: new THREE.Vector3(50, 100, 50), target: new THREE.Vector3(0, 0, 0), castShadow: false },
    fog: { color: 0xe8e0d0, near: 30, far: 150 },
    sky: { top: 0x7ba7d4, celestial: { color: 0xfff3d0, size: 0.030, glow: 1.25, stars: 0 } }
  },
  sore: {
    ambient: { color: 0x443322, intensity: 0.3 },
    hemisphere: { skyColor: 0xff8844, groundColor: 0x442211, intensity: 0.5 },
    directional: { color: 0xff6622, intensity: 0.8, position: new THREE.Vector3(-50, 60, -50), target: new THREE.Vector3(0, 0, 0), castShadow: false },
    fog: { color: 0x332211, near: 20, far: 100 },
    sky: { top: 0x7a4a6a, celestial: { color: 0xffb469, size: 0.040, glow: 1.7, dir: new THREE.Vector3(-0.75, 0.20, -0.63), stars: 0 } }
  },
  malam_rumah: {
    ambient: { color: 0x111122, intensity: 0.2 },
    hemisphere: { skyColor: 0x111133, groundColor: 0x0a0a15, intensity: 0.3 },
    pointLights: [
      { color: 0xffcc88, intensity: 0.8, position: new THREE.Vector3(0, 2.5, 0), distance: 8, decay: 2 },
      { color: 0xffaa44, intensity: 0.5, position: new THREE.Vector3(2, 1.5, -1), distance: 5, decay: 2 }
    ],
    fog: { color: 0x050510, near: 5, far: 40 },
    sky: { top: 0x0b1024, celestial: { color: 0xdbe6f8, size: 0.026, glow: 0.85, dir: new THREE.Vector3(0.42, 0.55, -0.72), stars: 1 } }
  },
  hutan_malam: {
    // Bulan dingin: gelap tetap gelap, tapi siluet pohon, penanda tujuan,
    // dan jarak tempuh masih terbaca tanpa lampu senter.
    ambient: { color: 0x16202b, intensity: 0.3 },
    hemisphere: { skyColor: 0x223346, groundColor: 0x0a0f13, intensity: 0.3 },
    directional: { color: 0x8fa6c4, intensity: 0.38, position: new THREE.Vector3(-45, 70, 35), target: new THREE.Vector3(0, 0, 0), castShadow: false },
    fog: { color: 0x0a1017, near: 8, far: 55 },
    sky: { top: 0x0d1a28, celestial: { color: 0xcddcf2, size: 0.024, glow: 0.7, stars: 0.85 } }
  },
  api: {
    ambient: { color: 0x331100, intensity: 0.3 },
    hemisphere: { skyColor: 0x331100, groundColor: 0x110500, intensity: 0.2 },
    pointLights: [
      { color: 0xff4400, intensity: 2.0, position: new THREE.Vector3(0, 1, 0), distance: 15, decay: 2 },
      { color: 0xff8800, intensity: 1.0, position: new THREE.Vector3(2, 0.5, 1), distance: 10, decay: 2 },
      { color: 0xffaa00, intensity: 0.5, position: new THREE.Vector3(-1, 1, -2), distance: 8, decay: 2 }
    ],
    fog: { color: 0x1a0a00, near: 5, far: 40 },
    sky: { top: 0x1c0c07, celestial: { color: 0xff8a3d, size: 0.05, glow: 1.1, dir: new THREE.Vector3(0.15, 0.20, -0.97), stars: 0.1 } }
  },
  flashback: {
    ambient: { color: 0xddccaa, intensity: 0.5 },
    hemisphere: { skyColor: 0xeeccaa, groundColor: 0xaa8866, intensity: 0.6 },
    directional: { color: 0xfff0d0, intensity: 1.0, position: new THREE.Vector3(30, 80, 30), target: new THREE.Vector3(0, 0, 0), castShadow: false },
    fog: { color: 0xddccaa, near: 40, far: 200 },
    sky: { top: 0xf6e3bd, celestial: { color: 0xfff0d0, size: 0.032, glow: 1.15, stars: 0 } }
  },
  teror: {
    ambient: { color: 0x1a0a1a, intensity: 0.2 },
    hemisphere: { skyColor: 0x1a0a1a, groundColor: 0x0a050a, intensity: 0.2 },
    directional: { color: 0x331133, intensity: 0.05, position: new THREE.Vector3(0, 30, 0), target: new THREE.Vector3(0, 0, 0), castShadow: false },
    fog: { color: 0x0a020a, near: 2, far: 20 },
    sky: { top: 0x140614, celestial: { color: 0x66223a, size: 0.045, glow: 0.7, dir: new THREE.Vector3(0, 0.30, -0.95), stars: 0 } }
  },
  // Ruang mimpi b14: kabut ungu lebih tipis daripada `teror` supaya lorong
  // pintu dan bulan buatan tetap terlihat, arah cahaya dari bulan menjaga
  // nuansa tidak wajar, dan intensitas cukup tinggi karena material mimpi
  // memang sangat gelap (lantai near-hitam).
  mimpi: {
    ambient: { color: 0x342c56, intensity: 0.55 },
    hemisphere: { skyColor: 0x4a4280, groundColor: 0x191430, intensity: 0.65 },
    directional: { color: 0x9aa6e8, intensity: 0.55, position: new THREE.Vector3(-30, 50, -60), target: new THREE.Vector3(0, 0, 0), castShadow: false },
    fog: { color: 0x191436, near: 8, far: 52 },
    sky: { top: 0x201a3e, celestial: { color: 0xcdb8ff, size: 0.032, glow: 1.15, stars: 0.5 } }
  },
  ending_true: {
    ambient: { color: 0xffeedd, intensity: 0.5 },
    hemisphere: { skyColor: 0xfff8e7, groundColor: 0x88aa88, intensity: 0.7 },
    directional: { color: 0xfff0d0, intensity: 1.5, position: new THREE.Vector3(50, 100, 50), target: new THREE.Vector3(0, 0, 0), castShadow: false },
    fog: { color: 0xcceecc, near: 50, far: 300 },
    sky: { top: 0x9fd4ff, celestial: { color: 0xfff8e0, size: 0.032, glow: 1.35, stars: 0 } }
  }
};

const lerpHex = (a: number, b: number, t: number): number =>
  new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

/**
 * Kubah langit bergradasi milik adegan.
 *
 * Sebelumnya `scene.background` tidak pernah diisi sehingga langit terbaca
 * hitam pekat di luar ruangan: seperti bermain di dalam kotak. Kubah ini
 * mengikuti pemandangan: puncak memakai warna preset, dasar memakai warna
 * kabut supaya cakrawala menyatu tanpa jahitan.
 */
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  // x = batas cos sudut cakram (dihitung dari ukuran radian), y = kekuatan halo.
  uniform vec2 uSun;
  uniform float uStars;
  varying vec3 vDir;

  // Hash langit-langit sederhana: titik bintang stabil antar frame.
  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y, -1.0, 1.0);
    // Gradasi tiga perhentian: cakrawala hangat -> pita udara -> puncak
    // paling pekat, sehingga langit terasa beratapi, bukan satu blok warna.
    float low = smoothstep(-0.02, 0.28, h);
    float high = smoothstep(0.18, 0.75, h);
    vec3 color = mix(mix(uHorizon, uTop, low), uTop, high * 0.65);

    // Matahari/bulan: cakram tegas dikelilingi halo lembut.
    float d = dot(dir, uSunDir);
    float disc = smoothstep(uSun.x, uSun.x + 0.0015, d);
    float halo = pow(max(d, 0.0), 96.0) * uSun.y;
    color += uSunColor * (disc * 1.05 + halo);

    // Bintang: titik hash di sel langit, hanya di atas cakrawala, hanya
    // saat preset menentukan langit malam (uStars > 0).
    if (uStars > 0.001 && h > 0.04) {
      vec3 cell = floor(dir * 220.0);
      float star = step(0.9975, hash13(cell));
      float twinkle = 0.75 + 0.25 * hash13(cell + 7.0);
      color += vec3(0.9, 0.93, 1.0) * star * twinkle * uStars * smoothstep(0.04, 0.25, h);
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;

export class LightingManager {
  private scene: THREE.Scene;
  private settings: SettingsManager;
  private lights: Map<string, THREE.Light> = new Map();
  private currentPreset: string | null = null;
  private fog: THREE.Fog | null = null;

  private skyMesh: THREE.Mesh | null = null;
  private skyMaterial: THREE.ShaderMaterial | null = null;

  /**
   * Transisi berjalan, dimajukan oleh `update()`: bukan requestAnimationFrame
   * sendiri. Dengan begitu preset lama tidak pernah berebutan dengan preset
   * baru (dua loop yang saling menimpa), dan pergantian bab saat game dijeda
   * tidak meninggalkan animasi yang terus berjalan di belakang layar.
   */
  private transition: { from: LightPreset; to: LightPreset; elapsed: number; duration: number } | null = null;

  constructor(scene: THREE.Scene, settings: SettingsManager) {
    this.scene = scene;
    this.settings = settings;
    this.fog = new THREE.Fog(0x000000, 10, 100);
    this.scene.fog = this.fog;
    this.createSky();
    // "Jarak Kabut" berubah di layar Pengaturan: tulis ulang nilai mentah
    // preset supaya potongan pengaturan tidak pernah menumpuk pada nilai lama.
    settings.subscribe(() => this.refreshFog());
  }

  private createSky(): void {
    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uTop: { value: new THREE.Color(0x101018) },
        uHorizon: { value: new THREE.Color(0x101018) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(0xffffff) },
        uSun: { value: new THREE.Vector2(0.9996, 0) },
        uStars: { value: 0 }
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), this.skyMaterial);
    this.skyMesh.renderOrder = -1000;
    this.skyMesh.frustumCulled = false;
    this.scene.add(this.skyMesh);
  }

  applyPreset(presetName: string, transitionTime = 0): void {
    const preset = LIGHT_PRESETS[presetName];
    if (!preset) {
      console.warn(`Light preset not found: ${presetName}`);
      return;
    }

    // Transisi menuju preset yang sama sedang berjalan: biarkan selesai.
    // Panggilan kedua ini datang dari pembangunan adegan setelah onEnter bab
    // sudah menyalakan transisinya, dan mengulanginya dari nol akan membuat
    // perubahan cahaya tersentak-sentak.
    if (this.transition && this.currentPreset === presetName && this.transition.to === preset) {
      return;
    }

    const from = this.currentPreset ? LIGHT_PRESETS[this.currentPreset] : null;
    if (transitionTime > 0 && from && from !== preset) {
      this.ensureLights(from, preset);
      this.transition = { from, to: preset, elapsed: 0, duration: transitionTime };
      this.applyTransition(0);
    } else {
      this.transition = null;
      this.setPresetImmediate(preset);
    }
    this.currentPreset = presetName;
  }

  /**
   * Buat lampu yang dibutuhkan salah satu sisi transisi. Lampu yang tidak ada
   * di preset asal mulai dari intensitas 0 supaya tidak mendadak menyala di
   * tengah perpindahan.
   */
  private ensureLights(from: LightPreset, to: LightPreset): void {
    const needAmbient = from.ambient || to.ambient;
    if (needAmbient && !this.lights.has('ambient')) {
      const light = new THREE.AmbientLight(to.ambient.color, 0);
      this.scene.add(light);
      this.lights.set('ambient', light);
    }
    if ((from.hemisphere || to.hemisphere) && !this.lights.has('hemisphere')) {
      const light = new THREE.HemisphereLight(to.hemisphere.skyColor, to.hemisphere.groundColor, 0);
      this.scene.add(light);
      this.lights.set('hemisphere', light);
    }
    if ((from.directional || to.directional) && !this.lights.has('directional')) {
      const cfg = to.directional ?? from.directional!;
      const dir = new THREE.DirectionalLight(cfg.color, from.directional ? cfg.intensity : 0);
      dir.position.copy(cfg.position);
      dir.target.position.copy(cfg.target);
      dir.castShadow = cfg.castShadow ?? false;
      this.scene.add(dir);
      this.scene.add(dir.target);
      this.lights.set('directional', dir);
    }

    const count = Math.max(from.pointLights?.length ?? 0, to.pointLights?.length ?? 0);
    for (let i = 0; i < count; i++) {
      const key = `point_${i}`;
      if (this.lights.has(key)) continue;
      const cfg = to.pointLights?.[i] ?? from.pointLights![i];
      const point = new THREE.PointLight(cfg.color, from.pointLights?.[i] ? cfg.intensity : 0, cfg.distance, cfg.decay);
      point.position.copy(cfg.position);
      this.scene.add(point);
      this.lights.set(key, point);
    }
  }

  private setPresetImmediate(preset: LightPreset): void {
    this.clearLights();

    const ambient = new THREE.AmbientLight(preset.ambient.color, preset.ambient.intensity);
    this.scene.add(ambient);
    this.lights.set('ambient', ambient);

    const hemisphere = new THREE.HemisphereLight(preset.hemisphere.skyColor, preset.hemisphere.groundColor, preset.hemisphere.intensity);
    this.scene.add(hemisphere);
    this.lights.set('hemisphere', hemisphere);

    if (preset.directional) {
      const dir = new THREE.DirectionalLight(preset.directional.color, preset.directional.intensity);
      dir.position.copy(preset.directional.position);
      dir.target.position.copy(preset.directional.target);
      dir.castShadow = preset.directional.castShadow ?? false;
      this.scene.add(dir);
      this.scene.add(dir.target);
      this.lights.set('directional', dir);
    }

    if (preset.pointLights) {
      preset.pointLights.forEach((pl, i) => {
        const point = new THREE.PointLight(pl.color, pl.intensity, pl.distance, pl.decay);
        point.position.copy(pl.position);
        this.scene.add(point);
        this.lights.set(`point_${i}`, point);
      });
    }

    this.applyFog(preset.fog);
    this.applySky(preset, 1);
  }

  private applyFog(fogPreset: LightPreset['fog']): void {
    if (!this.fog) return;
    this.fog.color.setHex(fogPreset.color);
    this.fog.near = fogPreset.near;
    this.fog.far = fogPreset.far;
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.setHex(fogPreset.color);
    }
  }

  private applySky(preset: LightPreset, t: number, from?: LightPreset): void {
    if (!this.skyMaterial) return;
    const u = this.skyMaterial.uniforms;
    const horizonColor = preset.fog.color;
    const topColor = preset.sky?.top ?? preset.hemisphere.skyColor;
    const fromTop = from ? (from.sky?.top ?? from.hemisphere.skyColor) : topColor;
    const fromHorizon = from ? from.fog.color : horizonColor;
    (u.uTop.value as THREE.Color).setHex(lerpHex(fromTop, topColor, t));
    (u.uHorizon.value as THREE.Color).setHex(lerpHex(fromHorizon, horizonColor, t));

    // Benda langit: matahari/bulan ikut berpindah halus saat preset berganti.
    const cel = preset.sky?.celestial;
    const fromCel = from?.sky?.celestial;
    const dirTo = this.celestialDir(preset, cel?.dir);
    const dirFrom = from ? this.celestialDir(from, fromCel?.dir) : dirTo;
    (u.uSunDir.value as THREE.Vector3).lerpVectors(dirFrom, dirTo, t).normalize();
    (u.uSunColor.value as THREE.Color).setHex(
      lerpHex(fromCel?.color ?? cel?.color ?? 0xffffff, cel?.color ?? 0xffffff, t)
    );
    // Ukuran cakram disimpan sebagai batas cos sudut; glow & bintang ikut lerp.
    const sizeTo = cel?.size ?? 0.03;
    const sizeFrom = fromCel?.size ?? sizeTo;
    u.uSun.value.set(
      Math.cos(THREE.MathUtils.lerp(sizeFrom, sizeTo, t)),
      THREE.MathUtils.lerp(fromCel?.glow ?? 0, cel?.glow ?? 0, t)
    );
    u.uStars.value = THREE.MathUtils.lerp(fromCel?.stars ?? 0, cel?.stars ?? 0, t);
  }

  /**
   * Arah benda langit sebuah preset: ditentukan langsung lewat `sky.celestial.dir`
   * (bulan malam, matahari terbenam), atau diturunkan dari posisi cahaya
   * matahari/bulan preset itu sendiri supaya piringan langit selalu searah
   * dengan penerangan yang menerangi tanah.
   */
  private celestialDir(preset: LightPreset, override?: THREE.Vector3): THREE.Vector3 {
    if (override) return override.clone().normalize();
    const pos = preset.directional?.position ?? new THREE.Vector3(0.4, 0.5, -0.75);
    return pos.clone().normalize();
  }

  /** Transisi dijalankan di sini (dipanggil tiap frame saat game bermain). */
  private applyTransition(t: number): void {
    const { from, to } = this.transition!;
    const eased = t * t * (3 - 2 * t);

    const ambient = this.lights.get('ambient') as THREE.AmbientLight | undefined;
    if (ambient) {
      ambient.color.setHex(lerpHex(from.ambient.color, to.ambient.color, eased));
      ambient.intensity = THREE.MathUtils.lerp(from.ambient.intensity, to.ambient.intensity, eased);
    }

    const hemisphere = this.lights.get('hemisphere') as THREE.HemisphereLight | undefined;
    if (hemisphere) {
      hemisphere.color.setHex(lerpHex(from.hemisphere.skyColor, to.hemisphere.skyColor, eased));
      hemisphere.groundColor.setHex(lerpHex(from.hemisphere.groundColor, to.hemisphere.groundColor, eased));
      hemisphere.intensity = THREE.MathUtils.lerp(from.hemisphere.intensity, to.hemisphere.intensity, eased);
    }

    if (from.directional && to.directional) {
      const dir = this.lights.get('directional') as THREE.DirectionalLight | undefined;
      if (dir) {
        dir.color.setHex(lerpHex(from.directional.color, to.directional.color, eased));
        dir.intensity = THREE.MathUtils.lerp(from.directional.intensity, to.directional.intensity, eased);
        dir.position.lerpVectors(from.directional.position, to.directional.position, eased);
        dir.target.position.lerpVectors(from.directional.target, to.directional.target, eased);
      }
    } else {
      // Salah satu sisi tidak punya cahaya matahari: peredupan pelan.
      const one = from.directional ?? to.directional;
      const dir = this.lights.get('directional') as THREE.DirectionalLight | undefined;
      if (dir && one) {
        const start = from.directional ? one.intensity : 0;
        const end = to.directional ? one.intensity : 0;
        dir.intensity = THREE.MathUtils.lerp(start, end, eased);
      }
    }

    const pointCount = Math.max(from.pointLights?.length ?? 0, to.pointLights?.length ?? 0);
    for (let i = 0; i < pointCount; i++) {
      const fromPl = from.pointLights?.[i];
      const toPl = to.pointLights?.[i];
      const light = this.lights.get(`point_${i}`) as THREE.PointLight | undefined;
      if (!light) continue;
      light.intensity = THREE.MathUtils.lerp(fromPl?.intensity ?? 0, toPl?.intensity ?? 0, eased);
      const base = toPl ?? fromPl;
      if (base) {
        light.color.setHex(lerpHex(fromPl?.color ?? base.color, toPl?.color ?? base.color, eased));
        light.position.lerpVectors(fromPl?.position ?? base.position, toPl?.position ?? base.position, eased);
      }
    }

    this.applyFog({
      color: lerpHex(from.fog.color, to.fog.color, eased),
      near: THREE.MathUtils.lerp(from.fog.near, to.fog.near, eased),
      far: THREE.MathUtils.lerp(from.fog.far, to.fog.far, eased)
    });
    this.applySky(to, eased, from);
  }

  addDynamicLight(id: string, light: THREE.Light): void {
    this.scene.add(light);
    this.lights.set(id, light);
  }

  removeLight(id: string): void {
    const light = this.lights.get(id);
    if (light) {
      this.scene.remove(light);
      this.lights.delete(id);
    }
  }

  getLight(id: string): THREE.Light | undefined {
    return this.lights.get(id);
  }

  setFog(color: number, near: number, far: number): void {
    this.applyFog({ color, near, far });
  }

  getFog(): THREE.Fog | null {
    return this.fog;
  }

  clearLights(): void {
    this.lights.forEach(light => {
      this.scene.remove(light);
      if (light instanceof THREE.DirectionalLight) {
        this.scene.remove(light.target);
      }
    });
    this.lights.clear();
  }

  /** Tulis ulang nilai mentah preset aktif (dipanggil saat pengaturan berubah). */
  private refreshFog(): void {
    const preset = this.currentPreset ? LIGHT_PRESETS[this.currentPreset] : null;
    if (!preset) return;
    if (this.transition) {
      this.applyTransition(Math.min(1, this.transition.elapsed / this.transition.duration));
    } else {
      this.applyFog(preset.fog);
    }
  }

  update(deltaTime: number): void {
    if (!this.transition) return;
    this.transition.elapsed += deltaTime;
    const t = Math.min(this.transition.elapsed / this.transition.duration, 1);
    this.applyTransition(t);
    if (t >= 1) {
      const done = this.transition.to;
      this.transition = null;
      // Bereskan lampu yang tidak dipakai preset tujuan (mis. titik lama yang
      // sudah diredupkan ke nol) supaya tidak menumpuk antar babak.
      this.setPresetImmediate(done);
    }
  }

  dispose(): void {
    this.clearLights();
    if (this.skyMesh) {
      this.scene.remove(this.skyMesh);
      this.skyMesh.geometry.dispose();
      this.skyMaterial?.dispose();
      this.skyMesh = null;
      this.skyMaterial = null;
    }
  }
}
