import * as THREE from 'three';
import { InputManager } from '../core/input.js';
import { SettingsManager } from '../core/settings.js';

const _closestPoint = new THREE.Vector3();

class Capsule {
  start: THREE.Vector3;
  end: THREE.Vector3;
  radius: number;

  constructor(start: THREE.Vector3, end: THREE.Vector3, radius: number) {
    this.start = start;
    this.end = end;
    this.radius = radius;
  }

  translate(v: THREE.Vector3): void {
    this.start.add(v);
    this.end.add(v);
  }

  clone(): Capsule {
    return new Capsule(this.start.clone(), this.end.clone(), this.radius);
  }
}

export class FPSController {
  private camera: THREE.PerspectiveCamera;
  private input: InputManager;
  private settings: SettingsManager;

  private velocity = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private pitchObject = new THREE.Object3D();
  private yawObject = new THREE.Object3D();

  private moveSpeed = 4.0;
  private runSpeed = 7.0;
  private crouchSpeed = 2.0;
  private jumpSpeed = 8.0;
  private gravity = 20.0;
  private terminalVelocity = 30.0;
  private mouseSensitivity = 0.002;
  private touchSensitivity = 0.003;

  private canJump = false;
  private isCrouching = false;
  private isRunning = false;
  private playerHeight = 1.72;
  private crouchHeight = 1.0;
  private cameraHeight = 1.62;
  private crouchCameraHeight = 0.6;
  private cameraTargetY = 1.62;

  /**
   * Batas dunia tak terlihat: radius horizontal maksimum jelajah pemain.
   * Semua denah scene berada di dalam lantai 40x40 (sudut ±28,3); radius 34
   * memberi ruang longgar sekaligus menghalangi pemain menembus keluar
   * groundDisc menuju void tanpa dasar di kejauhan.
   */
  private worldRadius = 34;

  private collisionObjects: THREE.Object3D[] = [];
  private collisionBoxes: THREE.Box3[] = [];
  private playerCollider: Capsule;
  private onGround = false;
  /**
   * Posisi/rotasi terakhir yang pasti valid. Dipulihkan bila tabrakan atau
   * input menghasilkan NaN/Infinity.
   */
  private lastValidPosition = new THREE.Vector3(0, 0, 0);
  private lastValidYaw = 0;
  private lastValidPitch = 0;
  private sanitizeWarnedAt = 0;
  /**
   * Posisi terakhir saat pemain masih berpijak di tanah. Dipakai sebagai
   * jaring pengaman bila pemain terperosok di bawah batas aman (misalnya
   * koliider scene belum terpasang tepat waktu saat bab berganti).
   */
  private lastSafePosition = new THREE.Vector3(0, 0, 0);
  /** Batas bawah: di bawah nilai ini pemain dianggap jatuh ke bawah dunia. */
  private readonly fallFloorY = -6;
  /**
   * Hanya posisi berpijak yang cukup dekat permukaan tanah (≥ −1,5) yang
   * dicatat sebagai titik pulih, supaya posisi yang sedang tenggelam tidak
   * ikut tersimpan dan membatalkan pemulihan.
   */
  private readonly safeGroundY = -1.5;

  private headBobActive = true;
  private headBobTimer = 0;
  private headBobIntensity = 0.02;
  private headBobFrequency = 8;
  /**
   * Animasi pandangan sinematik (bangun dari kasur, merebah saat tidur,
   * menghadap lawan bicara). Maju lewat `updateView` yang dipanggil tiap
   * frame dari main: termasuk saat `update` nonaktif karena dialog
   * mengunci WASD dan menoleh, karena animasi justru berjalan di dalam dialog.
   */
  private viewAnim: {
    elapsed: number;
    duration: number;
    yawFrom: number;
    yawDelta: number;
    pitchFrom: number;
    pitchTo: number;
    yFrom: number;
    yTo: number;
  } | null = null;
  /**
   * FOV dasar dari pengaturan + nada "kick" halus saat berlari. Dihaluskan
   * tiap frame supaya perpindahan jalan <-> lari tidak membuat gambar
   * mendadak melompat (kesan pusing), tapi tetap memberi rasa kencang.
   */
  private fovKick = 0;
  private readonly fovKickRun = 6;

  constructor(camera: THREE.PerspectiveCamera, input: InputManager, settings: SettingsManager) {
    this.camera = camera;
    this.input = input;
    this.settings = settings;

    this.pitchObject.add(this.camera);
    this.yawObject.add(this.pitchObject);
    this.yawObject.position.set(0, 0, 0);
    this.pitchObject.position.set(0, this.cameraHeight, 0);
    this.camera.position.set(0, 0, 0);
    this.cameraTargetY = this.cameraHeight;

    this.playerCollider = new Capsule(
      new THREE.Vector3(0, 0.4, 0),
      new THREE.Vector3(0, 1.3, 0),
      0.3
    );

    this.updateSettings();
    this.settings.subscribe(() => this.updateSettings());
  }

  private updateSettings(): void {
    const controls = this.settings.get('controls');
    // Nilai tersimpan yang cacat (bukan angka) membuat delta mouse jadi NaN;
    // NaN di rotasi kamera merusak matriks MVP dan tidak ada segitiga yang
    // bisa digambar: layar terlihat membeku padahal game tetap berjalan.
    this.mouseSensitivity = Number.isFinite(controls.mouseSensitivity)
      ? controls.mouseSensitivity
      : 0.002;
    this.touchSensitivity = Number.isFinite(controls.touchSensitivity)
      ? controls.touchSensitivity
      : 1.0;
    this.headBobActive = !this.settings.get('accessibility').reduceCameraShake;
  }

  getYawObject(): THREE.Object3D {
    return this.yawObject;
  }

  getPitchObject(): THREE.Object3D {
    return this.pitchObject;
  }

  setCollisionObjects(objects: THREE.Object3D[]): void {
    this.collisionObjects = objects;

    // Box3.setFromObject hanya memperbarui matriks dunia objek itu sendiri,
    // bukan induknya. Saat scene baru dibangun (sebelum render pertama) grup
    // induk masih ber-matriks identitas, sehingga proxy collider di dalam
    // sub-grup (figur warga, lemari, kulkas) dihitung di koordinat lokalnya
    // sendiri: menumpuk tepat di [0,0,0], tempat pemain spawn. Pemain yang
    // berdiri di dalam kotak itu terus didorong keluar tiap frame dan tenggelam
    // menembus tanah. Perbarui rantai induk tiap objek sebelum menghitung box.
    objects.forEach(obj => obj.updateWorldMatrix(true, false));

    // Hitung satu kali karena scene statis; menghitung tiap frame mahal.
    this.collisionBoxes = objects.map(obj => new THREE.Box3().setFromObject(obj));
  }

  setPlayerHeight(height: number): void {
    this.playerHeight = height;
    this.cameraHeight = height - 0.1;
    this.crouchHeight = height * 0.6;
    this.crouchCameraHeight = height * 0.55;
    this.cameraTargetY = this.isCrouching ? this.crouchCameraHeight : this.cameraHeight;
    this.pitchObject.position.y = this.cameraTargetY;
    this.updateCollider();
  }

  update(deltaTime: number): void {
    const dt = Math.min(Math.max(deltaTime, 0), 0.1);
    this.handleRotation(dt);
    this.handleMovement(dt);
    this.applyGravity(dt);
    this.resolveCollisions(dt);
    this.enforceWorldBounds();
    this.syncTransformFromCollider();
    this.updateCameraPosition(dt);
    this.handleHeadBob(dt);
    this.updateFovKick(dt);
    this.sanitizeTransform();
  }

  /**
   * Nada pandang melebar pelan saat berlari lalu kembali ketika berjalan -
   * umpan balik kecepatan yang halus. Selalu dihitung dari FOV dasar
   * pengaturan sehingga pemain yang mengubah FOV tidak kehilangan pilihannya.
   */
  private updateFovKick(dt: number): void {
    const baseFov = this.settings.get('graphics').fov;
    const moving = Math.abs(this.velocity.x) + Math.abs(this.velocity.z) > 0.6;
    const target = (this.isRunning && moving && this.headBobActive) ? this.fovKickRun : 0;
    // Lerp simetris (basis e) supaya frame rate tinggi/rendah terasa sama.
    const k = 1 - Math.exp(-8 * dt);
    this.fovKick += (target - this.fovKick) * k;

    const next = baseFov + this.fovKick;
    if (Number.isFinite(next) && Math.abs(this.camera.fov - next) > 0.01) {
      this.camera.fov = next;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Pagar dunia tak terlihat: pemain yang menembus radius batas ditarik kembali
   * ke tepi peta, dan komponen kecepatan yang menabrak batas dibuang supaya
   * terasa seperti pagar sungguhan (menyusuri batas dengan halus), bukan
   * teleport tersentak atau jalan ke void tanpa dasar.
   */
  private enforceWorldBounds(): void {
    const s = this.playerCollider.start;
    const e = this.playerCollider.end;
    const r = Math.hypot(s.x, s.z);
    if (r <= this.worldRadius || r === 0) return;
    const nx = s.x / r;
    const nz = s.z / r;
    // Bagian kecepatan menjauhi batas dibuang; yang menyusuri batas tetap
    // dibiarkan agar gerakan terasa alami saat menempel pagar.
    const outward = this.velocity.x * nx + this.velocity.z * nz;
    if (outward > 0) {
      this.velocity.x -= nx * outward;
      this.velocity.z -= nz * outward;
    }
    const k = this.worldRadius / r;
    s.x *= k; s.z *= k;
    e.x *= k; e.z *= k;
  }

  /**
   * Jaring akhir frame. Nilai NaN/Infinity pada posisi atau rotasi merusak
   * matriks kamera: tidak ada satu pun segitiga yang tergambar, tidak ada
   * tabrakan yang bisa lolos, dan pemain mengira permainan membeku padahal
   * loop render tetap berjalan. Nilai cacat selalu dipulihkan ke posisi terakhir
   * yang pasti valid.
   */
  private sanitizeTransform(): void {
    const p = this.yawObject.position;
    const ok =
      Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) &&
      Number.isFinite(this.yawObject.rotation.y) &&
      Number.isFinite(this.pitchObject.rotation.x) &&
      Number.isFinite(this.velocity.x) &&
      Number.isFinite(this.velocity.y) &&
      Number.isFinite(this.velocity.z);

    if (ok) {
      this.lastValidPosition.copy(p);
      this.lastValidYaw = this.yawObject.rotation.y;
      this.lastValidPitch = this.pitchObject.rotation.x;
      // Catat posisi berpijak sebagai titik pulih jatuh.
      if (this.onGround && p.y > this.safeGroundY) {
        this.lastSafePosition.copy(p);
      }
      // Jaring pengaman jatuh: pemain yang terperosok jauh di bawah tanah
      // (koliider belum siap, lantai terlewat satu frame) langsung dikembalikan
      // ke posisi aman terakhir, bukan tenggelam tak berujung sampai layar hitam.
      if (p.y < this.fallFloorY) {
        p.copy(this.lastSafePosition);
        this.velocity.set(0, 0, 0);
        this.updateCollider();
        const now = performance.now();
        if (now - this.sanitizeWarnedAt > 2000) {
          this.sanitizeWarnedAt = now;
          console.warn('[player] pemain jatuh di bawah dunia: dikembalikan ke posisi aman');
        }
      }
      return;
    }

    p.copy(this.lastValidPosition);
    this.yawObject.rotation.y = this.lastValidYaw;
    this.pitchObject.rotation.x = this.lastValidPitch;
    this.velocity.set(0, 0, 0);
    this.updateCollider();

    const now = performance.now();
    if (now - this.sanitizeWarnedAt > 2000) {
      this.sanitizeWarnedAt = now;
      console.warn('[player] transformasi pemain NaN/Infinity: dikembalikan ke posisi aman terakhir');
    }
  }

  /**
   * Posisi pemain disimpan di capsule (untuk tabrakan), sementara kamera
   * adalah child dari yawObject. Tanpa sinkronisasi ini kamera tidak pernah
   * ikut bergerak sehingga pemain seolah tidak bisa berjalan.
   */
  private syncTransformFromCollider(): void {
    const start = this.playerCollider.start;
    const end = this.playerCollider.end;
    const pos = this.yawObject.position;
    pos.x = (start.x + end.x) * 0.5;
    pos.z = (start.z + end.z) * 0.5;
    pos.y = Math.min(start.y, end.y) - this.playerCollider.radius;
  }

  private handleRotation(deltaTime: number): void {
    // Deltas mentah dari InputManager, sensitivitas diterapkan di sini
    // supaya slider pengaturan bekerja untuk mouse dan touch.
    const [mouseDeltaX, mouseDeltaY] = this.input.getMouseDelta();
    const [touchDeltaX, touchDeltaY] = this.input.getTouchDelta();

    // Pandangan sedang dianimasikan (bangun / menghadap lawan bicara): delta
    // tetap dibuang supaya tidak menumpuk dan melompat setelah animasi selesai.
    if (this.viewAnim) return;

    const touchScale = 0.003 * this.touchSensitivity;
    let deltaX = mouseDeltaX * this.mouseSensitivity + touchDeltaX * touchScale;
    let deltaY = mouseDeltaY * this.mouseSensitivity + touchDeltaY * touchScale;

    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;

    if (this.settings.get('controls').invertY) {
      deltaY = -deltaY;
    }

    const yaw = this.yawObject.rotation.y - deltaX;
    const pitch = this.pitchObject.rotation.x - deltaY;

    // Satu NaN pada rotasi merusak matriks kamera selamanya: tidak ada satu
    // pun objek yang tergambar dan pemain mengira permainan membeku.
    this.yawObject.rotation.y = Number.isFinite(yaw) ? yaw : 0;
    this.pitchObject.rotation.x = Number.isFinite(pitch)
      ? Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch))
      : 0;
  }

  private handleMovement(deltaTime: number): void {
    // Animasi pandangan (bangun dari kasur / merebah tidur): kunci posisi,
    // pemain hanya menonton. Tanpa ini dia bisa melangkah sambil berbaring.
    if (this.viewAnim) {
      this.direction.set(0, 0, 0);
      this.velocity.x = 0;
      this.velocity.z = 0;
      return;
    }

    const speed = this.isRunning ? this.runSpeed : (this.isCrouching ? this.crouchSpeed : this.moveSpeed);
    const [moveX, moveZ] = this.input.getMovementVector();

    this.direction.set(0, 0, 0);
    if (moveZ !== 0) this.direction.z = moveZ;
    if (moveX !== 0) this.direction.x = moveX;

    // Normalisasi untuk diagonal keyboard, tapi pertahankan magnitudo
    // supaya joystick analog bisa bergerak pelan-pelan.
    const magnitude = this.direction.length();
    if (magnitude > 1e-4) {
      this.direction.normalize().multiplyScalar(Math.min(1, magnitude));
    }

    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yawObject.rotation.y, 0));
    this.direction.applyQuaternion(quaternion);

    const targetVelocity = this.direction.clone().multiplyScalar(speed);
    this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetVelocity.x, 10 * deltaTime);
    this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetVelocity.z, 10 * deltaTime);

    this.isRunning = this.input.isRunning();
    const crouchPressed = this.input.isJustPressed('crouch');
    if (crouchPressed) {
      this.setCrouch(!this.isCrouching);
    }

    if (this.input.isJustPressed('forward') || this.input.isJustPressed('backward') ||
        this.input.isJustPressed('left') || this.input.isJustPressed('right')) {
      // Movement started
    }
  }

  private setCrouch(crouch: boolean): void {
    this.isCrouching = crouch;
    this.cameraTargetY = crouch ? this.crouchCameraHeight : this.cameraHeight;
    this.updateCollider();
  }

  private applyGravity(deltaTime: number): void {
    this.velocity.y -= this.gravity * deltaTime;
    this.velocity.y = Math.max(this.velocity.y, -this.terminalVelocity);
  }

  private resolveCollisions(deltaTime: number): void {
    const delta = this.velocity.clone().multiplyScalar(deltaTime);

    // Pecah perpindahan menjadi langkah kecil agar tidak menembus
    // dinding tipis saat kecepatan tinggi (jatuh/lari).
    const maxStep = 0.2;
    const distance = delta.length();
    const steps = Math.max(1, Math.min(8, Math.ceil(distance / maxStep)));
    const step = delta.divideScalar(steps);

    let collided = false;
    this.onGround = false;
    for (let i = 0; i < steps; i++) {
      this.playerCollider.translate(step);
      for (let b = 0; b < this.collisionBoxes.length; b++) {
        // Proxy yang dimatikan (pintu terbuka) tidak memblokir langkah.
        // Box3 tetap disimpan apa adanya karena scene dianggap statis -
        // pintu hanya menonaktifkan/mengaktifkan kembali box miliknya.
        if (this.collisionObjects[b]?.userData.colliderEnabled === false) continue;
        const box = this.collisionBoxes[b];
        if (this.checkCapsuleBoxCollision(this.playerCollider, box)) {
          collided = true;
          this.resolveCapsuleBox(this.playerCollider, box);
        }
      }
    }

    if (!collided) {
      this.onGround = false;
    }
  }

  private checkCapsuleBoxCollision(capsule: Capsule, box: THREE.Box3): boolean {
    return this.sphereTouchingBox(capsule.start, capsule.radius, box)
      || this.sphereTouchingBox(capsule.end, capsule.radius, box);
  }

  private sphereTouchingBox(p: THREE.Vector3, radius: number, box: THREE.Box3): boolean {
    const closest = _closestPoint.set(
      THREE.MathUtils.clamp(p.x, box.min.x, box.max.x),
      THREE.MathUtils.clamp(p.y, box.min.y, box.max.y),
      THREE.MathUtils.clamp(p.z, box.min.z, box.max.z)
    );
    // Sedikit toleransi supaya posisi diam di lantai tetap dianggap menyentuh.
    return closest.distanceToSquared(p) <= (radius + 0.001) * (radius + 0.001);
  }

  /**
   * Dorong capsule keluar dari kotak. Versi lama menghitung penetrasi dari
   * pusat capsule terhadap pusat kotak sehingga ada "zona mati" (penetrasi
   * nol) yang membuat pemain jatuh menembus lantai.
   */
  private resolveCapsuleBox(capsule: Capsule, box: THREE.Box3): void {
    let landed = false;
    let best: { normal: THREE.Vector3; depth: number } | null = null;

    for (const point of [capsule.start, capsule.end]) {
      const contact = this.sphereBoxContact(point, capsule.radius, box);
      if (!contact) continue;

      if (!best || contact.depth > best.depth) best = contact;
      if (contact.normal.y > 0.7) landed = true;
    }

    // Kapsul adalah tubuh kaki: dorong SEMUA titiknya dengan koreksi terdalam.
    // Versi lama mendorong hanya ujung yang menyentuh, sehingga ujung lain
    // terus meluncur maju tiap frame: rata-rata kedua ujung (posisi kamera)
    // merayap menembus benda pendek seperti meja, kursi, dan kasur yang hanya
    // menyanggah bola bawah.
    if (best) {
      capsule.translate(best.normal.multiplyScalar(best.depth + 0.001));
    }

    if (landed) {
      this.onGround = true;
      this.canJump = true;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }
  }

  private sphereBoxContact(
    p: THREE.Vector3,
    radius: number,
    box: THREE.Box3
  ): { normal: THREE.Vector3; depth: number } | null {
    const cx = THREE.MathUtils.clamp(p.x, box.min.x, box.max.x);
    const cy = THREE.MathUtils.clamp(p.y, box.min.y, box.max.y);
    const cz = THREE.MathUtils.clamp(p.z, box.min.z, box.max.z);
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dz = p.z - cz;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq > radius * radius) return null;

    if (distSq > 1e-10) {
      const dist = Math.sqrt(distSq);
      return {
        normal: new THREE.Vector3(dx / dist, dy / dist, dz / dist),
        depth: radius - dist
      };
    }

    // Titik berada di dalam kotak: dorong lewat sumbu dengan penetrasi
    // terkecil supaya tidak pernah terjebak di tengah.
    const left = p.x - box.min.x;
    const right = box.max.x - p.x;
    const top = box.max.y - p.y;
    const back = p.z - box.min.z;
    const front = box.max.z - p.z;
    // Sisi dasar (bawah) sengaja tidak menjadi kandidat keluar: semua furnitur
    // berpijak di lantai, jadi mendorong ke bawah justru menembus lantai dan
    // menjatuhkan pemain ke bawah dunia. Keluar lewat sisi atau atas saja.
    const min = Math.min(left, right, top, back, front);

    if (min === left) return { normal: new THREE.Vector3(-1, 0, 0), depth: left + radius };
    if (min === right) return { normal: new THREE.Vector3(1, 0, 0), depth: right + radius };
    if (min === top) return { normal: new THREE.Vector3(0, 1, 0), depth: top + radius };
    if (min === back) return { normal: new THREE.Vector3(0, 0, -1), depth: back + radius };
    return { normal: new THREE.Vector3(0, 0, 1), depth: front + radius };
  }

  private updateCollider(): void {
    const pos = this.yawObject.position;
    const r = this.playerCollider.radius;
    this.playerCollider.start.set(pos.x, pos.y + r, pos.z);
    this.playerCollider.end.set(pos.x, pos.y + this.playerHeight - r, pos.z);
  }

  private updateCameraPosition(deltaTime: number): void {
    // Faktor lerp independen frame-rate (10 kali per detik).
    const blend = 1 - Math.exp(-10 * deltaTime);
    // Saat animasi pandangan berjalan, tinggi ditentukan animasi: lerp ke
    // cameraTargetY justru akan menarik kamera keluar dari pose berbaring.
    if (!this.viewAnim) {
      this.pitchObject.position.y = THREE.MathUtils.lerp(this.pitchObject.position.y, this.cameraTargetY, blend);
    }
    this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 0, blend);
  }

  private handleHeadBob(deltaTime: number): void {
    if (!this.headBobActive) return;

    const moving = Math.abs(this.velocity.x) > 0.1 || Math.abs(this.velocity.z) > 0.1;
    const grounded = this.onGround;

    if (moving && grounded) {
      this.headBobTimer += deltaTime * (this.isRunning ? this.headBobFrequency * 1.5 : this.headBobFrequency);
      const bobX = Math.sin(this.headBobTimer) * this.headBobIntensity * (this.isRunning ? 1.5 : 1);
      const bobY = Math.sin(this.headBobTimer * 2) * this.headBobIntensity * 0.5;
      this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, bobX, 10 * deltaTime);
      this.camera.position.y = bobY;
    } else {
      this.headBobTimer = 0;
      this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, 0, 10 * deltaTime);
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 0, 10 * deltaTime);
    }
  }

  /**
   * Animasi pandangan naratif. `kind: 'wake'` langsung merebahkan kamera
   * (pandang ke langit-langit, mata belum fokus) lalu bangkit pelan ke
   * posisi berdiri: dipakai saat pemain "bangun dari kasur". Selain itu
   * kamera bergerak dari pose sekarang ke `eyeHeight`/`pitch` (mis. merebah
   * saat tidur). Durasi milidetik, sama seperti op `wait`.
   */
  startViewAnim(opts: { kind?: string; duration?: number; eyeHeight?: number; pitch?: number } = {}): void {
    const duration = Math.max(
      0.3,
      Number.isFinite(opts.duration as number) ? (opts.duration as number) / 1000 : 2
    );
    if (opts.kind === 'wake') {
      // Snap ke pose berbaring lebih dulu: pemain "tertidur" sebelum animasi,
      // jadi kejutan pose awal terbaca sebagai kilas bangun, bukan glitch.
      this.pitchObject.position.y = 0.5;
      this.pitchObject.rotation.x = 0.55;
      this.viewAnim = {
        elapsed: 0,
        duration,
        yawFrom: this.yawObject.rotation.y,
        yawDelta: 0,
        pitchFrom: 0.55,
        pitchTo: 0,
        yFrom: 0.5,
        yTo: this.cameraHeight
      };
      return;
    }
    const eyeTo = Number.isFinite(opts.eyeHeight as number) ? (opts.eyeHeight as number) : this.cameraHeight;
    const pitchTo = Number.isFinite(opts.pitch as number)
      ? (opts.pitch as number)
      : this.pitchObject.rotation.x;
    this.viewAnim = {
      elapsed: 0,
      duration,
      yawFrom: this.yawObject.rotation.y,
      yawDelta: 0,
      pitchFrom: this.pitchObject.rotation.x,
      pitchTo,
      yFrom: this.pitchObject.position.y,
      yTo: eyeTo
    };
  }

  /**
   * Putar pandangan halus menuju titik dunia (lawan bicara / benda yang
   * sedang dibicarakan). Hanya yaw dan sedikit pitch, posisi tidak berubah.
   * Dipanggil saat dialog mulai supaya kamera benar-benar "menghadap" lawan.
   */
  faceToward(target: THREE.Vector3, duration = 0.5): void {
    const dx = target.x - this.yawObject.position.x;
    const dz = target.z - this.yawObject.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.35) return; // terlalu dekat: arah tidak bermakna
    // Kamera memandang -Z; yaw = atan2(-dx, -dz) mengarahkan pandang ke titik.
    const yawTo = Math.atan2(-dx, -dz);
    let delta = yawTo - this.yawObject.rotation.y;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const eyeY = this.yawObject.position.y + this.pitchObject.position.y;
    const pitchTo = Math.max(-0.35, Math.min(0.35, Math.atan2(target.y - eyeY, dist)));
    this.viewAnim = {
      elapsed: 0,
      duration: Math.max(0.2, duration),
      yawFrom: this.yawObject.rotation.y,
      yawDelta: delta,
      pitchFrom: this.pitchObject.rotation.x,
      pitchTo,
      yFrom: this.pitchObject.position.y,
      yTo: this.pitchObject.position.y
    };
  }

  /**
   * Majukan animasi pandangan tiap frame. Dipanggil dari main tanpa syarat
   * sibuk/tidak, karena animasi bangun dan menghadap lawan bicara terjadi
   * tepat saat dialog mengunci kontrol.
   */
  updateView(deltaTime: number): void {
    const a = this.viewAnim;
    if (!a) return;
    a.elapsed += Math.min(Math.max(deltaTime, 0), 0.1);
    const t = Math.min(1, a.elapsed / a.duration);
    // easeInOutCubic: lembut saat mulai dan mendarat, tanpa hentakan.
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    this.yawObject.rotation.y = a.yawFrom + a.yawDelta * e;
    this.pitchObject.rotation.x = a.pitchFrom + (a.pitchTo - a.pitchFrom) * e;
    this.pitchObject.position.y = a.yFrom + (a.yTo - a.yFrom) * e;
    if (t >= 1) {
      // Pose akhir dipertahankan: setelah merebah tidur kamera harus tetap
      // rendah sampai pindah scene, bukan ditarik berdiri oleh lerp berikutnya.
      this.cameraTargetY = a.yTo;
      this.viewAnim = null;
    }
  }

  teleport(position: THREE.Vector3, yaw?: number): void {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) return;
    // Pindah tempat membatalkan animasi pandangan: yaw/pose baru dari
    // tujuan tidak boleh ditimpa sisa animasi lama, dan tinggi mata kembali
    // normal (mis. setelah merebah tidur, pemain berdiri lagi di tempat baru).
    this.viewAnim = null;
    this.cameraTargetY = this.isCrouching ? this.crouchCameraHeight : this.cameraHeight;
    const y = Number.isFinite(position.y) ? position.y : 0;
    this.yawObject.position.x = position.x;
    this.yawObject.position.z = position.z;
    this.yawObject.position.y = y;
    if (yaw !== undefined && Number.isFinite(yaw)) {
      this.yawObject.rotation.y = yaw;
    }
    this.updateCollider();
    this.velocity.set(0, 0, 0);
    // Titik aman baru: setelah teleport inilah pemain harus pulih kalau ada
    // nilai cacat di frame berikutnya.
    this.lastValidPosition.copy(this.yawObject.position);
    this.lastValidYaw = this.yawObject.rotation.y;
    this.lastValidPitch = this.pitchObject.rotation.x;
    this.lastSafePosition.copy(this.yawObject.position);
  }

  getPosition(): THREE.Vector3 {
    return this.yawObject.position.clone();
  }

  getDirection(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.yawObject.quaternion);
  }

  getYaw(): number {
    return this.yawObject.rotation.y;
  }

  setYaw(yaw: number): void {
    this.yawObject.rotation.y = yaw;
  }

  dispose(): void {
  }
}