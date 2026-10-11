import * as THREE from 'three';
import { eventBus, GameEvents } from '../core/events.js';
import { gameState } from './state.js';
import { audioManager } from '../core/audio.js';
import { scriptRunner } from './scriptRunner.js';

export interface InteractableObject {
  id: string;
  /**
   * Penanda di dunia 3D. Bisa berupa Group (cincin + inti) maupun Mesh biasa;
   * hanya posisi, parent, dan userData yang dipakai mesin interaksi.
   */
  mesh: THREE.Object3D;
  prompt: string;
  description?: string;
  descriptionDimas?: string;
  descriptionRaka?: string;
  onInteract: () => Promise<void> | void;
  condition?: () => boolean;
  once?: boolean;
  distance?: number;
  /**
   * True untuk tujuan cerita: prompt-nya disorot (emas) supaya pemain tahu
   * ini yang menggerakkan alur. Interaksi biasa memakai prompt netral.
   *
   * Bisa berupa fungsi supaya statusnya menyesuaikan objektif yang sedang
   * berlaku (penanda `goalFor` hanya menyala saat waktunya tiba).
   */
  goal?: boolean | (() => boolean);
}

export class InteractionManager {
  private interactables: Map<string, InteractableObject> = new Map();
  private raycaster = new THREE.Raycaster();
  private camera: THREE.Camera | null = null;
  private worldObjects: THREE.Object3D[] = [];
  private currentTarget: InteractableObject | null = null;
  private currentGoal = false;
  private currentPrompt = '';
  private interactionDistance = 3;
  private enabled = true;

  // Kerucut pandang: objek yang berada dalam sudut ini dari arah pandang
  // kamera bisa dijadikan target. Lebih longgar daripada raycast tengah
  // layar karena objek interaktif sering berada di lantai/bawah layar.
  private readonly aimConeCos = Math.cos(THREE.MathUtils.degToRad(45));

  // Vektor sementara, dibuat sekali agar tidak ada alokasi tiap frame.
  private readonly tmpOrigin = new THREE.Vector3();
  private readonly tmpTarget = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpForward = new THREE.Vector3();
  /** Daun kerja untuk occlusion: dunia minus proxy yang sedang dimatikan. */
  private readonly tmpOccluders: THREE.Object3D[] = [];

  constructor() {
    eventBus.on('interactable:register', this.registerInteractable.bind(this));
    eventBus.on('interactable:unregister', this.unregisterInteractable.bind(this));
    eventBus.on('interaction:check', this.checkInteraction.bind(this));
    eventBus.on('interaction:use', this.useInteractable.bind(this));
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  setWorldObjects(objects: THREE.Object3D[]): void {
    this.worldObjects = objects;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.currentTarget) {
      this.currentTarget = null;
      eventBus.emit('hud:interactionPrompt', { text: '', show: false });
    }
  }

  registerInteractable(data: InteractableObject | any): void {
    if (data.mesh) {
      const interactable: InteractableObject = {
        id: data.id,
        mesh: data.mesh,
        prompt: data.prompt,
        description: data.description,
        descriptionDimas: data.descriptionDimas,
        descriptionRaka: data.descriptionRaka,
        onInteract: data.onInteract || (async () => {}),
        condition: data.condition,
        once: data.once,
        distance: data.distance || this.interactionDistance,
        goal: typeof data.goal === 'function' ? data.goal : !!data.goal
      };
      this.interactables.set(data.id, interactable);
      data.mesh.userData.interactableId = data.id;
    }
  }

  unregisterInteractable(id: string): void {
    const interactable = this.interactables.get(id);
    if (interactable) {
      interactable.mesh.userData.interactableId = undefined;
      interactable.mesh.removeFromParent();
      this.interactables.delete(id);
      if (this.currentTarget === interactable) {
        this.currentTarget = null;
        eventBus.emit('hud:interactionPrompt', { text: '', show: false });
      }
    }
  }

  update(): void {
    if (!this.enabled || !this.camera) return;

    const camera = this.camera;
    camera.updateWorldMatrix(true, false);
    this.tmpOrigin.setFromMatrixPosition(camera.matrixWorld);
    const forward = this.tmpForward.set(0, 0, -1).transformDirection(camera.matrixWorld);

    let closest: InteractableObject | null = null;
    let closestScore = Infinity;

    for (const interactable of this.interactables.values()) {
      if (interactable.condition && !interactable.condition()) continue;

      const mesh = interactable.mesh;
      if (!mesh.parent) continue;

      mesh.getWorldPosition(this.tmpTarget);
      const distance = this.tmpOrigin.distanceTo(this.tmpTarget);
      const maxDistance = interactable.distance ?? this.interactionDistance;
      if (distance < 0.05 || distance > maxDistance) continue;

      // Arahkan sedikit di atas pusat objek agar permukaan yang menopangnya
      // (meja/lantai) tidak dihitung sebagai penghalang.
      this.tmpDir.set(
        this.tmpTarget.x - this.tmpOrigin.x,
        this.tmpTarget.y + 0.12 - this.tmpOrigin.y,
        this.tmpTarget.z - this.tmpOrigin.z
      ).normalize();

      const alignment = forward.dot(this.tmpDir);
      if (alignment < this.aimConeCos) continue;
      if (this.isOccluded(this.tmpDir, distance)) continue;

      // Pilih yang paling dekat dengan pusat layar, lalu yang paling dekat.
      const score = (1 - alignment) * 10 + distance * 0.01;
      if (score < closestScore) {
        closestScore = score;
        closest = interactable;
      }
    }

    if (closest !== this.currentTarget) {
      this.currentTarget = closest;
      if (closest) {
        this.currentGoal = this.goalOf(closest);
        this.currentPrompt = closest.prompt;
        eventBus.emit('hud:interactionPrompt', {
          text: closest.prompt,
          show: true,
          goal: this.currentGoal
        });
      } else {
        this.currentGoal = false;
        this.currentPrompt = '';
        eventBus.emit('hud:interactionPrompt', { text: '', show: false });
      }
    } else if (closest) {
      // Objektif bisa berganti sementara pemain sedang menatap penanda
      // (mis. setelah menutup dialog): prompt ikut diperbarui. Prompt ikut
      // dipantau karena label pintu berganti Buka ⇄ Tutup tanpa target
      // berganti (daun berputar tetap di titik yang sama).
      const goal = this.goalOf(closest);
      if (goal !== this.currentGoal || closest.prompt !== this.currentPrompt) {
        this.currentGoal = goal;
        this.currentPrompt = closest.prompt;
        eventBus.emit('hud:interactionPrompt', {
          text: closest.prompt,
          show: true,
          goal
        });
      }
    }
  }

  /** Status tujuan terkini; `goal` boleh berupa callback dinamis. */
  private goalOf(target: InteractableObject): boolean {
    return typeof target.goal === 'function' ? !!target.goal() : !!target.goal;
  }

  /** True bila ada geometry dunia yang menutupi garis pandang ke objek. */
  private isOccluded(direction: THREE.Vector3, distance: number): boolean {
    if (!this.worldObjects.length) return false;
    // Saring proxy yang sedang dimatikan (pintu terbuka): lorong yang baru
    // dibuka tidak boleh tetap dianggap tertutup hanya karena box ambangnya
    // masih terdaftar di dunia.
    const list = this.tmpOccluders;
    list.length = 0;
    for (const obj of this.worldObjects) {
      if (obj.userData.colliderEnabled !== false) list.push(obj);
    }
    if (!list.length) return false;
    this.raycaster.set(this.tmpOrigin, direction);
    this.raycaster.near = 0;
    this.raycaster.far = Math.max(0.05, distance - 0.35);
    return this.raycaster.intersectObjects(list, false).length > 0;
  }

  async interact(): Promise<void> {
    if (!this.enabled) return;
    const target = this.currentTarget;
    if (!target) return;
    // Jangan jalankan percakapan baru di tengah dialog yang masih berjalan;
    // dua loop dialog yang tumpang tindih membuat status inDialog macet.
    if (gameState.get('inDialog')) return;
    // Rantai operasi skrip (animasi kamera, transisi, wait) juga sedang
    // berjalan: menembak interaktif kedua menumpuk dua rantai: dialog
    // saling menimpa dan objective bisa mendarat terbalik. Sama persis
    // dengan gerbang yang dipakai penggerak otomatis.
    if (scriptRunner.isOpsBusy()) return;

    audioManager.playProcedural('blip', { category: 'sfx', volume: 0.3 });
    await target.onInteract();

    // Target bisa saja sudah berganti saat await di atas (dialog terbuka),
    // jadi jangan membaca this.currentTarget yang mungkin sudah null.
    if (target.once) {
      this.unregisterInteractable(target.id);
    }
  }

  private checkInteraction(): void {
    this.update();
  }

  private async useInteractable(id: string): Promise<void> {
    const interactable = this.interactables.get(id);
    if (interactable) {
      await interactable.onInteract();
    }
  }

  getCurrentTarget(): InteractableObject | null {
    return this.currentTarget;
  }

  getInteractable(id: string): InteractableObject | undefined {
    return this.interactables.get(id);
  }

  createInteractableFromMesh(mesh: THREE.Mesh, id: string, prompt: string, onInteract: () => Promise<void> | void, options: Partial<InteractableObject> = {}): void {
    this.registerInteractable({
      id,
      mesh,
      prompt,
      onInteract,
      ...options
    });
  }

  clear(): void {
    this.interactables.clear();
    this.currentTarget = null;
  }
}

export const interactionManager = new InteractionManager();