import * as THREE from 'three';
import { SettingsManager } from '../core/settings.js';

const vertexShader = `
  varying vec2 vUv;
  uniform float uVertexJitter;
  uniform float uTime;
  void main() {
    vUv = uv;
    vec3 pos = position;
    if (uVertexJitter > 0.0) {
      float noise = sin(pos.x * 10.0 + uTime) * cos(pos.y * 10.0 + uTime) * sin(pos.z * 10.0 + uTime);
      pos += normal * noise * uVertexJitter * 0.01;
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform float uDithering;
  uniform float uColorQuantization;
  uniform float uBrightness;
  uniform float uFogDistance;
  uniform vec3 uFogColor;
  uniform float uVertexJitter;
  void main() {
    vec4 color = texture2D(uTexture, vUv);
    color.rgb *= uBrightness;

    if (uColorQuantization > 0.0) {
      color.rgb = floor(color.rgb * 32.0) / 32.0;
    }

    if (uDithering > 0.0) {
      vec2 ditherPos = gl_FragCoord.xy * 0.25;
      float dither = mod(ditherPos.x + ditherPos.y * 4.0, 16.0) / 16.0;
      color.rgb += (dither - 0.5) * 0.02 * uDithering;
    }

    float fogFactor = smoothstep(0.0, uFogDistance, gl_FragCoord.z);
    color.rgb = mix(color.rgb, uFogColor, fogFactor * 0.5);

    gl_FragColor = color;
  }
`;

export class PSXMaterialManager {
  private materials: Map<string, THREE.ShaderMaterial> = new Map();
  private settings: SettingsManager;
  private time = 0;
  private baseMaterial: THREE.ShaderMaterial | null = null;

  constructor(settings: SettingsManager) {
    this.settings = settings;
    this.createBaseMaterial();
  }

  private createBaseMaterial(): void {
    const gfx = this.settings.get('graphics');
    this.baseMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTexture: { value: null },
        uVertexJitter: { value: gfx.vertexJitter },
        uTime: { value: 0 },
        uDithering: { value: gfx.dithering ? 1.0 : 0.0 },
        uColorQuantization: { value: gfx.colorQuantization ? 1.0 : 0.0 },
        uBrightness: { value: gfx.brightness },
        uFogDistance: { value: gfx.fogDistance },
        uFogColor: { value: new THREE.Color(0x1a1a2e) }
      },
      transparent: false,
      depthWrite: true,
      depthTest: true
    });
  }

  getMaterial(texture: THREE.Texture | null, options: {
    vertexJitter?: number;
    dithering?: boolean;
    colorQuantization?: boolean;
    brightness?: number;
    fogDistance?: number;
    fogColor?: THREE.Color;
  } = {}): THREE.ShaderMaterial {
    const key = this.generateKey(texture, options);
    let material = this.materials.get(key);
    if (!material) {
      material = this.baseMaterial!.clone();
      material.uniforms.uTexture.value = texture;
      if (options.vertexJitter !== undefined) material.uniforms.uVertexJitter.value = options.vertexJitter;
      if (options.dithering !== undefined) material.uniforms.uDithering.value = options.dithering ? 1.0 : 0.0;
      if (options.colorQuantization !== undefined) material.uniforms.uColorQuantization.value = options.colorQuantization ? 1.0 : 0.0;
      if (options.brightness !== undefined) material.uniforms.uBrightness.value = options.brightness;
      if (options.fogDistance !== undefined) material.uniforms.uFogDistance.value = options.fogDistance;
      if (options.fogColor) material.uniforms.uFogColor.value = options.fogColor;
      this.materials.set(key, material);
    }
    return material;
  }

  private generateKey(texture: THREE.Texture | null, options: any): string {
    return `${texture?.uuid || 'none'}_${JSON.stringify(options)}`;
  }

  update(deltaTime: number): void {
    this.time += deltaTime;
    this.materials.forEach(material => {
      material.uniforms.uTime.value = this.time;
    });
  }

  updateSettings(): void {
    const gfx = this.settings.get('graphics');
    this.materials.forEach(material => {
      material.uniforms.uVertexJitter.value = gfx.vertexJitter;
      material.uniforms.uDithering.value = gfx.dithering ? 1.0 : 0.0;
      material.uniforms.uColorQuantization.value = gfx.colorQuantization ? 1.0 : 0.0;
      material.uniforms.uBrightness.value = gfx.brightness;
      material.uniforms.uFogDistance.value = gfx.fogDistance;
    });
  }

  createPS1Material(color: THREE.Color, options: {
    emissive?: THREE.Color;
    emissiveIntensity?: number;
    transparent?: boolean;
    opacity?: number;
  } = {}): THREE.MeshBasicMaterial {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1.0,
      depthWrite: !options.transparent,
      depthTest: true
    });
    return material;
  }

  createVertexColorMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      vertexColors: true,
      depthWrite: true,
      depthTest: true
    });
  }

  createUnlitMaterial(color: THREE.Color): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      depthWrite: true,
      depthTest: true
    });
  }

  dispose(): void {
    this.materials.forEach(m => m.dispose());
    this.materials.clear();
    this.baseMaterial?.dispose();
  }
}