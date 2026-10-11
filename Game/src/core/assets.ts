import * as THREE from 'three';
import { audioManager } from './audio.js';

export interface ModelAsset {
  url: string;
  type: 'gltf' | 'glb';
  scale?: number;
}

export interface TextureAsset {
  url: string;
  options?: {
    wrapS?: THREE.Wrapping;
    wrapT?: THREE.Wrapping;
    minFilter?: THREE.TextureFilter;
    magFilter?: THREE.TextureFilter;
    generateMipmaps?: boolean;
    colorSpace?: THREE.ColorSpace;
  };
}

export interface AudioAsset {
  url: string;
  category?: 'music' | 'sfx' | 'ambience' | 'dialogBlip';
}

export interface FontAsset {
  url: string;
  format: 'woff2' | 'woff' | 'ttf';
}

export class AssetManager {
  private models: Map<string, THREE.Group> = new Map();
  private textures: Map<string, THREE.Texture> = new Map();
  private audioBuffers: Map<string, AudioBuffer> = new Map();
  private fonts: Map<string, FontFace> = new Map();
  private loadingPromises: Map<string, Promise<any>> = new Map();
  private loadQueue: Array<{ id: string; promise: Promise<any> }> = [];
  private maxConcurrentLoads = 4;
  private activeLoads = 0;
  private listeners: Set<(progress: { loaded: number; total: number; current: string }) => void> = new Set();

  async loadModel(id: string, asset: ModelAsset): Promise<THREE.Group> {
    if (this.models.has(id)) return this.models.get(id)!;
    return this.queueLoad(id, async () => {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(asset.url);
      const model = gltf.scene;
      if (asset.scale) model.scale.setScalar(asset.scale);
      this.models.set(id, model);
      return model;
    });
  }

  async loadTexture(id: string, asset: TextureAsset): Promise<THREE.Texture> {
    if (this.textures.has(id)) return this.textures.get(id)!;
    return this.queueLoad(id, async () => {
      const { TextureLoader } = await import('three');
      const loader = new TextureLoader();
      const texture = await loader.loadAsync(asset.url);
      if (asset.options) {
        Object.assign(texture, asset.options);
      }
      texture.needsUpdate = true;
      this.textures.set(id, texture);
      return texture;
    });
  }

  async loadAudio(id: string, asset: AudioAsset): Promise<AudioBuffer> {
    if (this.audioBuffers.has(id)) return this.audioBuffers.get(id)!;
    return this.queueLoad(id, async () => {
      const response = await fetch(asset.url);
      const arrayBuffer = await response.arrayBuffer();
      // Impor statis: audio.ts juga di-import statis oleh modul lain, jadi
      // impor dinamis di sini hanya membuang-buang chunk (dan memicu warning
      // build) tanpa menunda apa pun.
      await audioManager.initialize();
      const ctx = audioManager.getAudioContext();
      if (!ctx) throw new Error('Audio context not initialized');
      const buffer = await ctx.decodeAudioData(arrayBuffer);
      this.audioBuffers.set(id, buffer);
      return buffer;
    });
  }

  async loadFont(id: string, asset: FontAsset): Promise<FontFace> {
    if (this.fonts.has(id)) return this.fonts.get(id)!;
    return this.queueLoad(id, async () => {
      const response = await fetch(asset.url);
      const buffer = await response.arrayBuffer();
      const fontFace = new FontFace(id, buffer);
      await fontFace.load();
      document.fonts.add(fontFace);
      this.fonts.set(id, fontFace);
      return fontFace;
    });
  }

  async loadBatch(assets: {
    models?: Record<string, ModelAsset>;
    textures?: Record<string, TextureAsset>;
    audio?: Record<string, AudioAsset>;
    fonts?: Record<string, FontAsset>;
  }): Promise<void> {
    const promises: Promise<any>[] = [];
    if (assets.models) {
      for (const [id, asset] of Object.entries(assets.models)) {
        promises.push(this.loadModel(id, asset));
      }
    }
    if (assets.textures) {
      for (const [id, asset] of Object.entries(assets.textures)) {
        promises.push(this.loadTexture(id, asset));
      }
    }
    if (assets.audio) {
      for (const [id, asset] of Object.entries(assets.audio)) {
        promises.push(this.loadAudio(id, asset));
      }
    }
    if (assets.fonts) {
      for (const [id, asset] of Object.entries(assets.fonts)) {
        promises.push(this.loadFont(id, asset));
      }
    }
    await Promise.all(promises);
  }

  private async queueLoad<T>(id: string, loader: () => Promise<T>): Promise<T> {
    if (this.loadingPromises.has(id)) {
      return this.loadingPromises.get(id) as Promise<T>;
    }

    const promise = new Promise<T>(async (resolve, reject) => {
      try {
        await this.waitForSlot();
        this.activeLoads++;
        this.notifyProgress(id);
        const result = await loader();
        this.activeLoads--;
        this.processQueue();
        this.notifyProgress(id);
        resolve(result);
      } catch (error) {
        this.activeLoads--;
        this.processQueue();
        this.loadingPromises.delete(id);
        reject(error);
      }
    });

    this.loadingPromises.set(id, promise);
    this.processQueue();
    return promise;
  }

  private waitForSlot(): Promise<void> {
    return new Promise(resolve => {
      if (this.activeLoads < this.maxConcurrentLoads) {
        resolve();
      } else {
        const check = () => {
          if (this.activeLoads < this.maxConcurrentLoads) {
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      }
    });
  }

  private processQueue(): void {
    while (this.activeLoads < this.maxConcurrentLoads && this.loadQueue.length > 0) {
      const task = this.loadQueue.shift();
      if (task) {
        // Queue hanya diisi masa lalu; promise-nya sudah berjalan saat dibuat,
        // di sini cukup ditandai sudah "diproses" tanpa efek samping.
        void task.promise;
      }
    }
  }

  private notifyProgress(currentId: string): void {
    const total = this.loadingPromises.size;
    let loaded = 0;
    this.loadingPromises.forEach((promise, _id) => {
      if (promise !== this.loadingPromises.get(currentId)) {
        loaded++;
      }
    });
    this.listeners.forEach(l => l({ loaded, total, current: currentId }));
  }

  getModel(id: string): THREE.Group | undefined {
    return this.models.get(id);
  }

  getTexture(id: string): THREE.Texture | undefined {
    return this.textures.get(id);
  }

  getAudioBuffer(id: string): AudioBuffer | undefined {
    return this.audioBuffers.get(id);
  }

  getFont(id: string): FontFace | undefined {
    return this.fonts.get(id);
  }

  cloneModel(id: string): THREE.Group | null {
    const model = this.models.get(id);
    return model ? model.clone(true) : null;
  }

  disposeModel(id: string): void {
    const model = this.models.get(id);
    if (model) {
      model.traverse((obj: THREE.Object3D) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m: THREE.Material) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      this.models.delete(id);
    }
  }

  disposeTexture(id: string): void {
    const texture = this.textures.get(id);
    if (texture) {
      texture.dispose();
      this.textures.delete(id);
    }
  }

  disposeAll(): void {
    this.models.forEach((_, id) => this.disposeModel(id));
    this.textures.forEach((_, id) => this.disposeTexture(id));
    this.audioBuffers.clear();
    this.fonts.clear();
  }

  subscribe(listener: (progress: { loaded: number; total: number; current: string }) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const assetManager = new AssetManager();