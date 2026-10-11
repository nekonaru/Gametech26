import * as THREE from 'three';
import { SettingsManager } from '../core/settings.js';
import { getSoftDotTexture } from './textures.js';

export class ParticleSystem {
  private scene: THREE.Scene;
  private settings: SettingsManager;
  private particles: Map<string, THREE.Points> = new Map();
  private geometries: Map<string, THREE.BufferGeometry> = new Map();
  private materials: Map<string, THREE.PointsMaterial> = new Map();
  private time = 0;

  constructor(scene: THREE.Scene, settings: SettingsManager) {
    this.scene = scene;
    this.settings = settings;
  }

  createParticleSystem(id: string, options: {
    count: number;
    size: number;
    color: THREE.Color | number;
    opacity: number;
    sizeAttenuation: boolean;
    position: THREE.Vector3;
    spread: THREE.Vector3;
    velocity?: THREE.Vector3;
    lifetime?: number;
    loop?: boolean;
    texture?: THREE.Texture;
    blending?: THREE.Blending;
    depthWrite?: boolean;
  }): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(options.count * 3);
    const sizes = new Float32Array(options.count);
    const lifetimes = new Float32Array(options.count);
    const initialLifetimes = new Float32Array(options.count);

    for (let i = 0; i < options.count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * options.spread.x + options.position.x;
      positions[i * 3 + 1] = (Math.random() - 0.5) * options.spread.y + options.position.y;
      positions[i * 3 + 2] = (Math.random() - 0.5) * options.spread.z + options.position.z;
      sizes[i] = options.size * (0.5 + Math.random() * 0.5);
      const life = options.lifetime ? options.lifetime * (0.5 + Math.random() * 0.5) : 10;
      lifetimes[i] = life;
      initialLifetimes[i] = life;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
    geometry.setAttribute('initialLifetime', new THREE.BufferAttribute(initialLifetimes, 1));

    const material = new THREE.PointsMaterial({
      size: options.size,
      color: options.color,
      transparent: true,
      opacity: options.opacity,
      sizeAttenuation: options.sizeAttenuation,
      depthWrite: options.depthWrite ?? false,
      blending: options.blending ?? THREE.AdditiveBlending,
      alphaTest: 0.01
    });
    // Default memakai bintik lembut: tanpa peta, `THREE.Points` menggambar
    // partikel sebagai kotak solid. `map: undefined` membuat Three.js
    // memunculkan peringatan material di konsol, jadi peta selalu diisi.
    material.map = options.texture ?? getSoftDotTexture();

    const points = new THREE.Points(geometry, material);
    points.userData = {
      velocity: options.velocity || new THREE.Vector3(),
      lifetime: options.lifetime || 10,
      loop: options.loop ?? false,
      initialPositions: positions.slice(),
      spread: options.spread,
      position: options.position.clone()
    };

    this.particles.set(id, points);
    this.geometries.set(id, geometry);
    this.materials.set(id, material);
    this.scene.add(points);

    return points;
  }

  createFogParticles(id: string, options: {
    count: number;
    color: THREE.Color | number;
    opacity: number;
    area: THREE.Box3;
    density: number;
    height?: number;
    /** Lebar kabut per partikel (dunia, meter). Default 1. */
    size?: number;
  }): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(options.count * 3);
    const sizes = new Float32Array(options.count);
    const alphas = new Float32Array(options.count);

    for (let i = 0; i < options.count; i++) {
      positions[i * 3] = THREE.MathUtils.lerp(options.area.min.x, options.area.max.x, Math.random());
      positions[i * 3 + 1] = THREE.MathUtils.lerp(options.area.min.y, options.area.max.y, Math.random());
      positions[i * 3 + 2] = THREE.MathUtils.lerp(options.area.min.z, options.area.max.z, Math.random());
      sizes[i] = 0.5 + Math.random() * 2;
      alphas[i] = Math.random() * options.opacity;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    const material = new THREE.PointsMaterial({
      size: options.size ?? 1,
      color: options.color,
      transparent: true,
      // Harus `options.opacity`: nilai 1 membuat kabut selalu tampil terang
      // penuh berapa pun opacity yang diminta naskah. Atribut `alpha` per
      // partikel tidak dibaca PointsMaterial, jadi opasitas global inilah
      // satu-satunya pengatur.
      opacity: options.opacity,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexColors: false,
      alphaTest: 0.01,
      // Kabut tanpa peta tampil sebagai kotak 1 m yang menutupi layar.
      map: getSoftDotTexture()
    });

    const points = new THREE.Points(geometry, material);
    points.userData = { isFog: true, area: options.area, density: options.density };

    this.particles.set(id, points);
    this.geometries.set(id, geometry);
    this.materials.set(id, material);
    this.scene.add(points);

    return points;
  }

  createEmberParticles(id: string, options: {
    count: number;
    position: THREE.Vector3;
    spread: number;
    height: number;
    color1: THREE.Color;
    color2: THREE.Color;
  }): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(options.count * 3);
    const sizes = new Float32Array(options.count);
    const colors = new Float32Array(options.count * 3);
    const velocities = new Float32Array(options.count * 3);
    const lifetimes = new Float32Array(options.count);
    const initialLifetimes = new Float32Array(options.count);

    for (let i = 0; i < options.count; i++) {
      positions[i * 3] = options.position.x + (Math.random() - 0.5) * options.spread;
      positions[i * 3 + 1] = options.position.y;
      positions[i * 3 + 2] = options.position.z + (Math.random() - 0.5) * options.spread;
      sizes[i] = 0.05 + Math.random() * 0.1;
      const life = 2 + Math.random() * 3;
      lifetimes[i] = life;
      initialLifetimes[i] = life;
      velocities[i * 3] = (Math.random() - 0.5) * 0.5;
      velocities[i * 3 + 1] = 1 + Math.random() * 2;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.5;

      const t = Math.random();
      colors[i * 3] = THREE.MathUtils.lerp(options.color1.r, options.color2.r, t);
      colors[i * 3 + 1] = THREE.MathUtils.lerp(options.color1.g, options.color2.g, t);
      colors[i * 3 + 2] = THREE.MathUtils.lerp(options.color1.b, options.color2.b, t);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    geometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
    geometry.setAttribute('initialLifetime', new THREE.BufferAttribute(initialLifetimes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      // Bara tanpa peta tampil sebagai bintik persegi; bintik lembut
      // membuatnya terbaca sebagai percikan api.
      map: getSoftDotTexture()
    });

    const points = new THREE.Points(geometry, material);
    points.userData = { isEmber: true, basePosition: options.position.clone(), spread: options.spread, height: options.height };

    this.particles.set(id, points);
    this.geometries.set(id, geometry);
    this.materials.set(id, material);
    this.scene.add(points);

    return points;
  }

  update(deltaTime: number): void {
    this.time += deltaTime;

    this.particles.forEach((points, id) => {
      const geometry = this.geometries.get(id)!;
      const material = this.materials.get(id)!;
      const userData = points.userData;

      if (userData.isFog) {
        this.updateFogParticles(points, geometry, material, userData, deltaTime);
      } else if (userData.isEmber) {
        this.updateEmberParticles(points, geometry, material, userData, deltaTime);
      } else if (userData.isRain) {
        this.updateRain(points, geometry, userData, deltaTime);
      } else {
        this.updateStandardParticles(points, geometry, material, userData, deltaTime);
      }
    });
  }

  /**
   * Hujan: setiap butir jatuh lurus ke bawah dan muncul kembali di puncak
   * kotak begitu menyentuh tanah, supaya hujan terus turun tanpa kedip
   * lifetime. Vises kecil antar butir membuat gerakannya tidak seragam.
   */
  private updateRain(points: THREE.Points, geometry: THREE.BufferGeometry, userData: any, deltaTime: number): void {
    const positions = geometry.getAttribute('position');
    const velocities = geometry.getAttribute('velocity');
    const area: THREE.Box3 = userData.area;
    for (let i = 0; i < positions.count; i++) {
      positions.array[i * 3 + 1] -= velocities.array[i] * deltaTime;
      if (positions.array[i * 3 + 1] < area.min.y) {
        positions.array[i * 3] = THREE.MathUtils.lerp(area.min.x, area.max.x, Math.random());
        positions.array[i * 3 + 1] = area.max.y;
        positions.array[i * 3 + 2] = THREE.MathUtils.lerp(area.min.z, area.max.z, Math.random());
      }
    }
    positions.needsUpdate = true;
  }

  /** Hujan lebat: butir jatuh vertikal dan terus-menerus dari puncak area. */
  createRain(id: string, options: {
    count: number;
    area: THREE.Box3;
    color?: THREE.Color | number;
    speed?: number;
    size?: number;
    opacity?: number;
  }): THREE.Points {
    const area = options.area;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(options.count * 3);
    const velocities = new Float32Array(options.count);
    for (let i = 0; i < options.count; i++) {
      positions[i * 3] = THREE.MathUtils.lerp(area.min.x, area.max.x, Math.random());
      positions[i * 3 + 1] = THREE.MathUtils.lerp(area.min.y, area.max.y, Math.random());
      positions[i * 3 + 2] = THREE.MathUtils.lerp(area.min.z, area.max.z, Math.random());
      velocities[i] = (options.speed ?? 9) * (0.7 + Math.random() * 0.6);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
    const material = new THREE.PointsMaterial({
      size: options.size ?? 0.12,
      color: options.color ?? 0x9fb4c8,
      transparent: true,
      opacity: options.opacity ?? 0.5,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      alphaTest: 0.01
    });
    material.map = getSoftDotTexture();
    const points = new THREE.Points(geometry, material);
    points.userData = { isRain: true, area };
    this.particles.set(id, points);
    this.geometries.set(id, geometry);
    this.materials.set(id, material);
    this.scene.add(points);
    return points;
  }

  private updateStandardParticles(points: THREE.Points, geometry: THREE.BufferGeometry, material: THREE.PointsMaterial, userData: any, deltaTime: number): void {
    const positions = geometry.getAttribute('position');
    const lifetimes = geometry.getAttribute('lifetime');
    const initialLifetimes = geometry.getAttribute('initialLifetime');
    const count = positions.count;

    for (let i = 0; i < count; i++) {
      lifetimes.array[i] -= deltaTime;

      if (lifetimes.array[i] <= 0) {
        if (userData.loop) {
          lifetimes.array[i] = initialLifetimes.array[i];
          positions.array[i * 3] = (Math.random() - 0.5) * userData.spread.x + userData.position.x;
          positions.array[i * 3 + 1] = (Math.random() - 0.5) * userData.spread.y + userData.position.y;
          positions.array[i * 3 + 2] = (Math.random() - 0.5) * userData.spread.z + userData.position.z;
        } else {
          positions.array[i * 3 + 1] = -1000;
        }
      } else {
        positions.array[i * 3] += userData.velocity.x * deltaTime;
        positions.array[i * 3 + 1] += userData.velocity.y * deltaTime;
        positions.array[i * 3 + 2] += userData.velocity.z * deltaTime;
      }
    }

    positions.needsUpdate = true;
    lifetimes.needsUpdate = true;
  }

  private updateFogParticles(points: THREE.Points, geometry: THREE.BufferGeometry, material: THREE.PointsMaterial, userData: any, deltaTime: number): void {
    const positions = geometry.getAttribute('position');
    const alphas = geometry.getAttribute('alpha');
    const count = positions.count;
    const area = userData.area;

    for (let i = 0; i < count; i++) {
      positions.array[i * 3 + 1] += 0.01 * deltaTime * 60;
      if (positions.array[i * 3 + 1] > area.max.y) {
        positions.array[i * 3] = THREE.MathUtils.lerp(area.min.x, area.max.x, Math.random());
        positions.array[i * 3 + 1] = area.min.y;
        positions.array[i * 3 + 2] = THREE.MathUtils.lerp(area.min.z, area.max.z, Math.random());
        alphas.array[i] = Math.random() * material.opacity;
      }
      alphas.array[i] *= 0.999;
      if (alphas.array[i] < 0.01) {
        alphas.array[i] = Math.random() * material.opacity;
      }
    }

    positions.needsUpdate = true;
    alphas.needsUpdate = true;
  }

  private updateEmberParticles(points: THREE.Points, geometry: THREE.BufferGeometry, material: THREE.PointsMaterial, userData: any, deltaTime: number): void {
    const positions = geometry.getAttribute('position');
    const lifetimes = geometry.getAttribute('lifetime');
    const initialLifetimes = geometry.getAttribute('initialLifetime');
    const velocities = geometry.getAttribute('velocity');
    const sizes = geometry.getAttribute('size');
    const count = positions.count;

    for (let i = 0; i < count; i++) {
      lifetimes.array[i] -= deltaTime;

      if (lifetimes.array[i] <= 0) {
        lifetimes.array[i] = initialLifetimes.array[i];
        positions.array[i * 3] = userData.basePosition.x + (Math.random() - 0.5) * userData.spread;
        positions.array[i * 3 + 1] = userData.basePosition.y;
        positions.array[i * 3 + 2] = userData.basePosition.z + (Math.random() - 0.5) * userData.spread;
        velocities.array[i * 3] = (Math.random() - 0.5) * 0.5;
        velocities.array[i * 3 + 1] = 1 + Math.random() * 2;
        velocities.array[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
        sizes.array[i] = 0.05 + Math.random() * 0.1;
      } else {
        positions.array[i * 3] += velocities.array[i * 3] * deltaTime;
        positions.array[i * 3 + 1] += velocities.array[i * 3 + 1] * deltaTime;
        positions.array[i * 3 + 2] += velocities.array[i * 3 + 2] * deltaTime;
        sizes.array[i] = sizes.array[i] * 0.99;
      }
    }

    positions.needsUpdate = true;
    lifetimes.needsUpdate = true;
    sizes.needsUpdate = true;
    velocities.needsUpdate = true;
  }

  remove(id: string): void {
    const points = this.particles.get(id);
    if (points) {
      this.scene.remove(points);
      const geometry = this.geometries.get(id);
      const material = this.materials.get(id);
      if (geometry) geometry.dispose();
      if (material) material.dispose();
      this.particles.delete(id);
      this.geometries.delete(id);
      this.materials.delete(id);
    }
  }

  get(id: string): THREE.Points | undefined {
    return this.particles.get(id);
  }

  setVisible(id: string, visible: boolean): void {
    const points = this.particles.get(id);
    if (points) points.visible = visible;
  }

  dispose(): void {
    this.particles.forEach((_, id) => this.remove(id));
  }
}

export function createAshParticles(scene: THREE.Scene, position: THREE.Vector3, count: number): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);
  const rotations = new Float32Array(count);
  const rotationSpeeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = position.x + (Math.random() - 0.5) * 2;
    positions[i * 3 + 1] = position.y + Math.random() * 3;
    positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 2;
    sizes[i] = 0.02 + Math.random() * 0.03;
    alphas[i] = 0.3 + Math.random() * 0.4;
    rotations[i] = Math.random() * Math.PI * 2;
    rotationSpeeds[i] = (Math.random() - 0.5) * 2;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setAttribute('rotation', new THREE.BufferAttribute(rotations, 1));
  geometry.setAttribute('rotationSpeed', new THREE.BufferAttribute(rotationSpeeds, 1));

  const material = new THREE.PointsMaterial({
    size: 0.05,
    color: 0x221100,
    transparent: true,
    opacity: 1,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexColors: false,
    alphaTest: 0.01,
    map: getSoftDotTexture()
  });

  const points = new THREE.Points(geometry, material);
  points.userData = { isAsh: true, basePosition: position.clone() };
  scene.add(points);

  return points;
}