import * as THREE from 'three';
import { EventBus, GameEvents, eventBus } from './events.js';
import { SettingsManager, SettingsManager as _SM, settingsManager, DEFAULT_SETTINGS } from './settings.js';
import { I18nManager, i18n } from './i18n.js';
import { SaveManager, saveManager } from './save.js';
import { AudioManager, audioManager } from './audio.js';
import { AssetManager, assetManager } from './assets.js';
import { InputManager, inputManager } from './input.js';
import { PostProcessManager } from '../render/postprocess.js';
import { PSXMaterialManager } from '../render/psx-material.js';

export class Engine {
  public readonly canvas: HTMLCanvasElement;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly clock: THREE.Clock;
  public readonly eventBus: EventBus;
  public readonly settings: SettingsManager;
  public readonly i18n: I18nManager;
  public readonly save: SaveManager;
  public readonly audio: AudioManager;
  public readonly assets: AssetManager;
  public readonly input: InputManager;
  public readonly postProcess: PostProcessManager;
  public readonly psxMaterials: PSXMaterialManager;

  private animationId: number | null = null;
  private running = false;

  isRunning(): boolean {
    return this.running;
  }

  private fixedTimeStep = 1 / 60;
  private maxSubSteps = 3;
  private lastTime = 0;
  private lastRenderedTime = 0;
  private frameCount = 0;
  private fps = 0;
  private fpsUpdateTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.eventBus = eventBus;
    this.settings = settingsManager;
    this.i18n = i18n;
    this.save = saveManager;
    this.audio = audioManager;
    this.assets = assetManager;
    this.input = inputManager;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      DEFAULT_SETTINGS.graphics.fov,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      500
    );
    this.clock = new THREE.Clock();

    this.postProcess = new PostProcessManager(this.renderer, this.scene, this.camera, this.settings);
    this.psxMaterials = new PSXMaterialManager(this.settings);
  }

  async initialize(): Promise<void> {
    await this.i18n.initialize(this.settings.get('language'));
    await this.save.initialize();
    await this.audio.initialize();

    this.setupRenderer();
    this.setupCamera();
    this.setupEventListeners();
    this.input.initialize(
      this.canvas,
      this.settings.get('controls').keyBindings,
      this.settings.get('controls').runToggle
    );
    this.settings.subscribe(() => this.onSettingsChanged());
    this.save.startPlaytimeTracking();
  }

  private setupRenderer(): void {
    const gfx = this.settings.get('graphics');
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = true;
    this.renderer.shadowMap.enabled = false;

    this.postProcess.setResolution(gfx.internalResolution);
    this.postProcess.setVertexJitter(gfx.vertexJitter);
    this.postProcess.setDithering(gfx.dithering);
    this.postProcess.setColorQuantization(gfx.colorQuantization);
    this.postProcess.setScanlines(gfx.scanlines);
    this.postProcess.setGrain(gfx.grain);
    this.postProcess.setFogDistance(gfx.fogDistance);
    this.postProcess.setBrightness(gfx.brightness);
  }

  private setupCamera(): void {
    const gfx = this.settings.get('graphics');
    this.camera.fov = gfx.fov;
    this.camera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera.updateProjectionMatrix();
  }

  private setupEventListeners(): void {
    window.addEventListener('resize', this.onResize.bind(this));
    window.addEventListener('beforeunload', this.onBeforeUnload.bind(this));
  }

  private onResize(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.postProcess.setSize(width, height);
  }

  private onBeforeUnload(): void {
    this.save.stopPlaytimeTracking();
  }

  private onSettingsChanged(): void {
    const gfx = this.settings.get('graphics');
    const audio = this.settings.get('audio');
    const controls = this.settings.get('controls');

    // Berlaku langsung, tanpa reload: mode lari dan pengait tombol yang diubah
    // di layar Pengaturan harus dipakai frame berikutnya juga.
    this.input.setRunToggle(controls.runToggle);
    this.input.rebind(controls.keyBindings);
    this.input.setJoystickSize(controls.joystickSize);

    this.camera.fov = gfx.fov;
    this.camera.updateProjectionMatrix();

    this.postProcess.setResolution(gfx.internalResolution);
    this.postProcess.setVertexJitter(gfx.vertexJitter);
    this.postProcess.setDithering(gfx.dithering);
    this.postProcess.setColorQuantization(gfx.colorQuantization);
    this.postProcess.setScanlines(gfx.scanlines);
    this.postProcess.setGrain(gfx.grain);
    this.postProcess.setFogDistance(gfx.fogDistance);
    this.postProcess.setBrightness(gfx.brightness);

    this.audio.setMasterVolume(audio.master);
    this.audio.setCategoryVolume('music', audio.music);
    this.audio.setCategoryVolume('sfx', audio.sfx);
    this.audio.setCategoryVolume('ambience', audio.ambience);
    this.audio.setCategoryVolume('dialogBlip', audio.dialogBlip);
    this.audio.setMuteOnBlur(audio.muteOnBlur);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.animate();
  }

  stop(): void {
    this.running = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private animate(): void {
    if (!this.running) return;
    this.animationId = requestAnimationFrame(this.animate.bind(this));

    // Jaring pengaman: frame berikutnya sudah dijadwalkan di baris atas, jadi
    // satu error di tengah frame hanya membuat satu frame terlewat: bukan
    // membekukan permainan selamanya (gejala "kunci mouse lalu semua macet").
    try {
      const currentTime = performance.now();
      // Batas FPS (Pengaturan > Grafis > Maks FPS): frame dilewati bila
      // terlalu cepat; lastTime tidak disentuh supaya akumulasi delta pada
      // frame yang benar-benar jalan tetap utuh.
      const maxFps = this.settings.get('graphics').maxFps;
      if (maxFps > 0 && currentTime - this.lastRenderedTime < 1000 / maxFps - 4) return;
      this.lastRenderedTime = currentTime;
      const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
      this.lastTime = currentTime;

      this.frameCount++;
      this.fpsUpdateTime += deltaTime;
      if (this.fpsUpdateTime >= 1) {
        this.fps = this.frameCount;
        this.frameCount = 0;
        this.fpsUpdateTime = 0;
      }

      this.fixedUpdate(deltaTime);
      this.update(deltaTime);
      this.render();
    } catch (error) {
      this.reportFrameError(error);
    }
  }

  private frameErrors = 0;
  private lastFrameErrorLog = 0;

  private reportFrameError(error: unknown): void {
    this.frameErrors++;
    const now = performance.now();
    if (now - this.lastFrameErrorLog < 2000) return;
    this.lastFrameErrorLog = now;
    console.error(
      `[engine] frame #${this.frameErrors} gagal: frame dilewati, permainan tetap berjalan:`,
      error
    );
  }

  private fixedUpdate(deltaTime: number): void {
    let accumulator = deltaTime;
    let steps = this.maxSubSteps;
    while (accumulator >= this.fixedTimeStep && steps-- > 0) {
      this.eventBus.emit('engine:fixedUpdate', { deltaTime: this.fixedTimeStep });
      accumulator -= this.fixedTimeStep;
    }
  }

  update(deltaTime: number): void {
    this.input.update();
    this.psxMaterials.update(deltaTime);
    this.eventBus.emit('engine:update', { deltaTime });
  }

  render(): void {
    this.postProcess.render();
  }

  getFPS(): number {
    return this.fps;
  }

  getDeltaTime(): number {
    return this.clock.getDelta();
  }

  getElapsedTime(): number {
    return this.clock.getElapsedTime();
  }

  setScene(scene: THREE.Scene): void {
    this.scene.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    this.scene.clear();
    Object.assign(this.scene, scene);
    this.postProcess.setScene(this.scene);
  }

  async loadScene(sceneId: string): Promise<THREE.Scene> {
    this.eventBus.emit(GameEvents.SCENE_LOAD_START, { sceneId });
    // Scene loading logic will be implemented in game module
    this.eventBus.emit(GameEvents.SCENE_LOAD_COMPLETE, { sceneId });
    return this.scene;
  }

  async dispose(): Promise<void> {
    this.stop();
    window.removeEventListener('resize', this.onResize.bind(this));
    window.removeEventListener('beforeunload', this.onBeforeUnload.bind(this));
    this.input.dispose();
    await this.audio.dispose();
    this.assets.disposeAll();
    this.postProcess.dispose();
    this.renderer.dispose();
    this.eventBus.clear();
  }
}

let engineInstance: Engine | null = null;

export function createEngine(canvas: HTMLCanvasElement): Engine {
  engineInstance = new Engine(canvas);
  return engineInstance;
}

export function getEngine(): Engine | null {
  return engineInstance;
}