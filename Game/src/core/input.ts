export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
  crouch: boolean;
  interact: boolean;
  flashlight: boolean;
  phone: boolean;
  journal: boolean;
  pause: boolean;
  mouseDeltaX: number;
  mouseDeltaY: number;
  touchDeltaX: number;
  touchDeltaY: number;
  pointerLocked: boolean;
}

export type InputAction =
  | 'forward' | 'backward' | 'left' | 'right'
  | 'run' | 'crouch'
  | 'interact' | 'flashlight' | 'phone' | 'journal' | 'pause';

const ALL_ACTIONS: InputAction[] = [
  'forward', 'backward', 'left', 'right',
  'run', 'crouch',
  'interact', 'flashlight', 'phone', 'journal', 'pause'
];

export class InputManager {
  private state: InputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    run: false,
    crouch: false,
    interact: false,
    flashlight: false,
    phone: false,
    journal: false,
    pause: false,
    mouseDeltaX: 0,
    mouseDeltaY: 0,
    touchDeltaX: 0,
    touchDeltaY: 0,
    pointerLocked: false
  };

  private previousState: InputState = { ...this.state };
  private keyBindings: Record<string, InputAction> = {};
  /** Pengait asli (aksi → kode tombol) sebelum dibalik; dipakai rebind(). */
  private rawKeyBindings: Record<string, string> = {};
  /** Tombol yang dipegang keyboard/mouse/touch. */
  private actionPressed: Set<InputAction> = new Set();
  /**
   * Tombol yang dipegang gamepad. Dipisah dari actionPressed supaya polling
   * gamepad tidak pernah menimpa input keyboard/mouse: kalau dicampur,
   * stik yang diam di tengah akan menuliskan false ke state tiap frame dan
   * WASD jadi mati total begitu kunci mouse aktif.
   */
  private gamepadPressed: Set<InputAction> = new Set();
  private actionJustPressed: Set<InputAction> = new Set();
  private actionJustReleased: Set<InputAction> = new Set();
  private touchStartX = 0;
  private touchStartY = 0;
  private touchActive = false;
  private joystickActive = false;
  private joystickCenterX = 0;
  private joystickCenterY = 0;
  private joystickDX = 0;
  private joystickDY = 0;
  private joystickRadius = 60;

  /**
   * Ukuran joystick sentuh dari Pengaturan (diameter piksel 80-200).
   * Radius sentuh = setengah diameter, dibatasi supaya tetap terasa.
   */
  setJoystickSize(size: number): void {
    this.joystickRadius = Math.max(40, Math.min(100, size / 2));
  }
  private touchStartTime = 0;
  private touchMoved = 0;
  private tapQueued = false;
  private tapRelease = false;
  private listeners: Set<(state: InputState) => void> = new Set();
  private lockChangeListeners: Set<(locked: boolean) => void> = new Set();
  private canvas: HTMLCanvasElement | null = null;
  private runToggle = false;
  /**
   * Fallback "tarik untuk menoleh": aktif selama tombol kiri ditekan di atas
   * canvas saat kunci pointer tidak/j belum berhasil. Tanpa ini, kalau browser
   * menolak requestPointerLock (mis. masih dalam cooldown setelah Esc) kamera
   * sama sekali tidak bisa digerakkan.
   */
  private dragLook = false;
  /**
   * Batas waktu sampai kunci pointer dikonfirmasi browser. Dipakai untuk
   * membedakan "klik untuk mengunci kursor" dari "klik untuk berinteraksi".
   */
  private lockRequestPendingUntil = 0;
  /**
   * Sampai kapan klik kiri diperlakukan sebagai "klik untuk mengunci" setelah
   * browser menolak pointer lock. Mencegah klik terus-menerus ditelan dan
   * pemain kehilangan interaksi dengan mouse sepenuhnya.
   */
  private lockDeniedUntil = 0;
  /** Apakah permintaan kunci terakhir berasal dari klik kiri pemain. */
  private lockRequestFromClick = false;
  /**
   * Apakah permainan sedang menelan input menoleh. Saat dialog/teka-teki/menu
   * menutup layar, fpsController tidak berjalan sehingga delta mouse menumpuk;
   * begitu overlay ditutup kamera langsung menyentak. main.ts mematikan flag ini
   * lewat refreshPointerHint() di setiap transisi layar.
   */
  private lookEnabled = true;
  private boundListeners: Array<[EventTarget, string, EventListener, unknown]> = [];

  /**
   * Handler di-binding sekali di sini supaya referensinya sama persis saat
   * dilepas; removeEventListener dengan .bind() baru selalu gagal diam-diam.
   */
  private listen(
    target: EventTarget,
    type: string,
    fn: (event: never) => void,
    options?: unknown,
  ): void {
    const bound = fn.bind(this) as unknown as EventListener;
    target.addEventListener(type, bound, options as AddEventListenerOptions | undefined);
    this.boundListeners.push([target, type, bound, options]);
  }

  initialize(canvas: HTMLCanvasElement, keyBindings: Record<string, string>, runToggle = false): void {
    // Idempoten: initialize kedua kali tidak boleh menduplikasi listener.
    this.dispose();
    this.canvas = canvas;
    this.keyBindings = this.invertBindings(keyBindings);
    this.rawKeyBindings = { ...keyBindings };
    // Checkbox "lari sekali tekan" di layar Pengaturan tersimpan pada
    // controls.runToggle; tanpa menyambungkannya ke sini pilihannya hanya
    // hiasan dan Shift selalu harus ditahan untuk lari.
    this.runToggle = runToggle || keyBindings.run === 'toggle';

    this.listen(canvas, 'mousedown', this.onMouseDown);
    // mousemove/mouseup di window: kunci pointer mengirim event ke elemen yang
    // terkunci, tapi tarikan yang keluar area canvas (dan pelepasan tombol di
    // atas UI) tetap harus tercatat, kalau tidak state.interact nyangkut.
    this.listen(window, 'mousemove', this.onMouseMove);
    this.listen(window, 'mouseup', this.onMouseUp);
    this.listen(canvas, 'wheel', this.onWheel, { passive: false });
    this.listen(canvas, 'touchstart', this.onTouchStart, { passive: false });
    this.listen(canvas, 'touchmove', this.onTouchMove, { passive: false });
    this.listen(canvas, 'touchend', this.onTouchEnd);
    // touchcancel tidak pernah dipegang sebelumnya: begitu browser membatalkan
    // gesture (ambil alih scroll, kunci pointer, dll) joystickActive tetap true
    // dan getMovementVector() mengabaikan keyboard selamanya.
    this.listen(canvas, 'touchcancel', this.onTouchEnd);
    this.listen(canvas, 'contextmenu', this.onContextMenu);

    this.listen(window, 'keydown', this.onKeyDown);
    this.listen(window, 'keyup', this.onKeyUp);

    this.listen(document, 'pointerlockchange', this.handlePointerLockChange);
    this.listen(document, 'pointerlockerror', this.onPointerLockError);
    this.listen(document, 'fullscreenchange', this.onFullscreenChange);
    this.listen(document, 'visibilitychange', this.onVisibilityChange);
    this.listen(window, 'blur', this.onWindowBlur);

    this.listen(window, 'gamepadconnected', this.onGamepadConnected);
    this.listen(window, 'gamepaddisconnected', this.onGamepadDisconnected);
  }

  /** Ubah mode lari (tahan / sekali tekan) tanpa perlu restart permainan. */
  setRunToggle(runToggle: boolean): void {
    if (this.runToggle === runToggle) return;
    this.runToggle = runToggle;
    // Latch lari harus dilepas saat mode berganti: kalau dibiarkan, state.run
    // tetap true tanpa tombol yang ditekan dan karakter lari terus menerus.
    this.actionPressed.delete('run');
    if (this.state.run) {
      this.state.run = false;
      this.actionJustReleased.add('run');
    }
  }

  /**
   * Terapkan pengait tombol baru tanpa memasang ulang listener. Tanpa ini
   * perubahan di layar Pengaturan baru berlaku setelah reload, dan tombol lama
   * yang sedang ditekan bisa tersangkut selamanya karena keyup-nya tidak lagi
   * punya pemetaan (karakter jalan terus tanpa tombol ditekan).
   */
  rebind(keyBindings: Record<string, string>): void {
    const prev = this.rawKeyBindings;
    const next = { ...keyBindings };
    for (const action of ALL_ACTIONS) {
      if (prev[action] === next[action]) continue;
      // Petaan berubah/hilang: aksi yang sedang dipegang dilepas dulu, kalau
      // tidak keyup-nya tidak lagi dikenali dan state[action] nyangkut.
      this.actionPressed.delete(action);
      if (this.gamepadPressed.has(action)) continue;
      if (this.state[action]) {
        this.state[action] = false;
        this.actionJustReleased.add(action);
      }
    }
    this.rawKeyBindings = next;
    this.keyBindings = this.invertBindings(next);
  }

  private invertBindings(bindings: Record<string, string>): Record<string, InputAction> {
    const inverted: Record<string, InputAction> = {};
    for (const [action, key] of Object.entries(bindings)) {
      inverted[key] = action as InputAction;
    }
    return inverted;
  }

  update(): void {
    this.updateGamepad();

    // Tap singkat pada layar sentuh diubah jadi satu tekan interaksi.
    if (this.tapQueued) {
      this.tapQueued = false;
      if (!this.isHeld('interact')) {
        this.state.interact = true;
        this.tapRelease = true;
      }
    } else if (this.tapRelease && !this.isHeld('interact')) {
      this.state.interact = false;
      this.tapRelease = false;
    }

    const prev = this.previousState;
    this.actionJustPressed.clear();
    this.actionJustReleased.clear();

    for (const action of ALL_ACTIONS) {
      const now = this.state[action];
      const before = prev[action];
      if (now && !before) {
        this.actionJustPressed.add(action);
      } else if (!now && before) {
        this.actionJustReleased.add(action);
      }
    }

    this.previousState = { ...this.state };

    this.listeners.forEach(l => l(this.state));
  }

  private updateGamepad(): void {
    let gamepad: Gamepad | null = null;
    try {
      gamepad = navigator.getGamepads?.()[0] ?? null;
    } catch {
      gamepad = null;
    }

    if (!gamepad || gamepad.connected === false) {
      // Lepaskan semuanya supaya tombol yang sempat tertekan tidak nyangkut
      // setelah kontrol dicabut.
      if (this.gamepadPressed.size) {
        for (const action of Array.from(this.gamepadPressed)) {
          this.setGamepadAction(action, false);
        }
      }
      return;
    }

    const deadzone = 0.15;
    const axes = gamepad.axes ?? [];
    const stickX = axes[0] || 0;
    const stickY = axes[1] || 0;

    this.setGamepadAction('left', stickX < -deadzone);
    this.setGamepadAction('right', stickX > deadzone);
    this.setGamepadAction('forward', stickY < -deadzone);
    this.setGamepadAction('backward', stickY > deadzone);

    const buttons = gamepad.buttons ?? [];
    this.setGamepadAction('interact', buttons[0]?.pressed ?? false);
    // Mode toggle disimpan di state.run oleh keyboard; gamepad tidak boleh
    // menuliskan false ke sana tiap frame karena akan membatalkan latch-nya.
    if (!this.runToggle) {
      this.setGamepadAction('run', buttons[7]?.pressed ?? false);
    }
    this.setGamepadAction('crouch', buttons[6]?.pressed ?? false);
    this.setGamepadAction('flashlight', buttons[3]?.pressed ?? false);
    this.setGamepadAction('journal', buttons[4]?.pressed ?? false);
    this.setGamepadAction('pause', buttons[9]?.pressed ?? false);

    if (buttons[2]?.pressed) {
      this.requestPointerLock();
    }
  }

  /** Apakah aksi sedang dipegang oleh perangkat mana pun (keyboard/mouse/touch/gamepad). */
  private isHeld(action: InputAction): boolean {
    return this.actionPressed.has(action) || this.gamepadPressed.has(action);
  }

  private setAction(action: InputAction, pressed: boolean): void {
    if (pressed) this.actionPressed.add(action);
    else this.actionPressed.delete(action);
    this.syncAction(action);
  }

  private setGamepadAction(action: InputAction, pressed: boolean): void {
    if (pressed) this.gamepadPressed.add(action);
    else this.gamepadPressed.delete(action);
    this.syncAction(action);
  }

  /**
   * Gabungkan kedua sumber input ke state. Menulis false dari satu sumber tidak
   * lagi mematikan aksi yang masih dipegang sumber lain.
   */
  private syncAction(action: InputAction): void {
    const on = this.isHeld(action);
    const was = this.state[action];
    if (on && !was) {
      this.state[action] = true;
      this.actionJustPressed.add(action);
    } else if (!on && was) {
      this.state[action] = false;
      this.actionJustReleased.add(action);
    }
  }

  /**
   * Lepas semua input yang dipegang keyboard/mouse/touch. Dipanggil saat window
   * kehilangan fokus: kalau keyup tidak pernah sampai (alt-tab, ganti window),
   * tombol akan nyangkut dan karakter jalan terus tanpa diperintah.
   */
  private releaseDeviceActions(): void {
    for (const action of ALL_ACTIONS) {
      const latchedRun = action === 'run' && this.runToggle && this.state.run;
      if (!this.actionPressed.has(action) && !latchedRun) continue;
      this.actionPressed.delete(action);
      if (this.gamepadPressed.has(action)) continue;
      if (this.state[action]) {
        this.state[action] = false;
        this.actionJustReleased.add(action);
      }
    }
  }

  isPressed(action: InputAction): boolean {
    return this.state[action];
  }

  isJustPressed(action: InputAction): boolean {
    return this.actionJustPressed.has(action);
  }

  isJustReleased(action: InputAction): boolean {
    return this.actionJustReleased.has(action);
  }

  getMouseDelta(): [number, number] {
    const delta: [number, number] = [this.state.mouseDeltaX, this.state.mouseDeltaY];
    this.state.mouseDeltaX = 0;
    this.state.mouseDeltaY = 0;
    return delta;
  }

  getTouchDelta(): [number, number] {
    const delta: [number, number] = [this.state.touchDeltaX, this.state.touchDeltaY];
    this.state.touchDeltaX = 0;
    this.state.touchDeltaY = 0;
    return delta;
  }

  getMovementVector(): [number, number] {
    // Keyboard/gamepad didahulukan: joystick virtual yang tersangkut (gesture
    // dibatalkan browser, jari terangkat di luar layar) tidak boleh membuat
    // WASD diam-diam mati total.
    let x = 0;
    let z = 0;
    if (this.state.forward) z -= 1;
    if (this.state.backward) z += 1;
    if (this.state.left) x -= 1;
    if (this.state.right) x += 1;
    if (x !== 0 || z !== 0) {
      const len = Math.hypot(x, z);
      return [x / len, z / len];
    }

    // Joystick virtual (layar sentuh) memakai nilai analog.
    if (this.joystickActive) {
      const nx = this.joystickDX / this.joystickRadius;
      const nz = this.joystickDY / this.joystickRadius;
      if (Math.hypot(nx, nz) < 0.15) return [0, 0];
      return [Math.max(-1, Math.min(1, nx)), Math.max(-1, Math.min(1, nz))];
    }

    return [0, 0];
  }

  isRunning(): boolean {
    // state.run sudah dibalik oleh onKeyDown pada mode "sekali tekan". Membalik
    // lagi di frame tekanan membuat frame pertama justru dihitung berjalan -
    // lari mati tepat saat baru diaktifkan.
    return this.state.run;
  }

  requestPointerLock(fromClick = false): void {
    if (!this.canvas || this.state.pointerLocked) return;
    // Hanya kegagalan atas klik kiri yang menunda percobaan mengunci berikutnya.
    // Kalau semua kegagalan menunda, permintaan otomatis saat bab dimulai akan
    // membuat klik pertama pemain berubah jadi interaksi.
    this.lockRequestFromClick = fromClick;
    try {
      const result = this.canvas.requestPointerLock() as unknown;
      if (result && typeof (result as Promise<void>).catch === 'function') {
        // Chrome memakai Promise; tanpa ini kegagalan hanya ditekan diam-diam
        // dan "klik untuk mengunci" tidak pernah diketahui sudah ditolak.
        (result as Promise<void>).catch(() => { this.onPointerLockError(); });
      }
    } catch {
      this.onPointerLockError();
    }
  }

  /**
   * requestPointerLock() hanya diterima Chrome bila dipanggil dari gesture
   * pengguna ( transient activation ). Dipanggil sesudah await: saat bab
   * selesai dimuat atau resumeGame(): pasti ditolak dan memicu
   * pointerlockerror. Lewati saja: hint "klik untuk melihat" tetap mengajak
   * pemain mengklik canvas, dan klik itulah yang benar-benar mengunci kursor.
   */
  requestPointerLockIfActivated(): void {
    const nav = navigator as Navigator & { userActivation?: { isActive: boolean } };
    if (nav.userActivation && !nav.userActivation.isActive) return;
    this.requestPointerLock();
  }

  exitPointerLock(): void {
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  isPointerLocked(): boolean {
    return this.state.pointerLocked;
  }

  /**
   * Aktif/nonaktifkan akumulasi delta menoleh. Saat dimatikan, delta yang sudah
   * menumpuk langsung dibuang supaya tidak jadi lompatan kamera nanti.
   */
  setLookEnabled(enabled: boolean): void {
    if (this.lookEnabled === enabled) return;
    this.lookEnabled = enabled;
    if (!enabled) {
      this.state.mouseDeltaX = 0;
      this.state.mouseDeltaY = 0;
      this.state.touchDeltaX = 0;
      this.state.touchDeltaY = 0;
    }
  }

  isLookEnabled(): boolean {
    return this.lookEnabled;
  }

  getState(): Readonly<InputState> {
    return this.state;
  }

  subscribe(listener: (state: InputState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onPointerLockChange(listener: (locked: boolean) => void): () => void {
    this.lockChangeListeners.add(listener);
    return () => this.lockChangeListeners.delete(listener);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.repeat) return;
    const action = this.keyBindings[event.code];
    if (action) {
      event.preventDefault();
      if (action === 'run' && this.runToggle) {
        this.state.run = !this.state.run;
        this.actionJustPressed.add('run');
      } else {
        this.setAction(action, true);
      }
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    const action = this.keyBindings[event.code];
    if (action) {
      event.preventDefault();
      if (action !== 'run' || !this.runToggle) {
        this.setAction(action, false);
      }
    }
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.button === 0) {
      // Sambil menunggu kunci pointer (atau bila ditolak browser), tarik dulu
      // untuk menoleh supaya kamera tidak pernah macet total.
      this.dragLook = true;

      if (!this.state.pointerLocked) {
        const now = performance.now();
        // Masih menunggu keputusan browser: klik ini bagian dari gestur yang
        // sama, jangan diproses lebih lanjut.
        if (now < this.lockRequestPendingUntil) return;
        if (now >= this.lockDeniedUntil) {
          // Klik kiri murni untuk menoleh/mengunci kursor. Interaksi sengaja
          // TIDAK dipetakan ke klik: kalau tidak, klik yang mengunci kursor
          // sekaligus memakai objek di depan pemain, skrip/dialog terbuka, dan
          // begitu inDialog aktif WASD plus menoleh mati semua: persis
          // keluhan "kunci mouse kok malah nggak bisa gerak".
          this.lockRequestPendingUntil = now + 800;
          this.requestPointerLock(true);
          return;
        }
      }
    }

    // Aksi: klik kiri = menoleh, klik kanan = senter. Interaksi hanya lewat
    // tombol E (atau tap di layar sentuh).
    const actionMap: Record<number, InputAction> = {
      2: 'flashlight'
    };
    const action = actionMap[event.button];
    if (action) this.setAction(action, true);
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.lookEnabled) return;
    if (!this.state.pointerLocked && !this.dragLook) return;
    // Delta mentah dalam piksel; sensitivitas diterapkan oleh FPSController
    // supaya slider "Sensitivitas Mouse" di pengaturan berpengaruh.
    this.state.mouseDeltaX += event.movementX;
    this.state.mouseDeltaY += event.movementY;
  }

  private onMouseUp(event: MouseEvent): void {
    if (event.button === 0) this.dragLook = false;
    const actionMap: Record<number, InputAction> = {
      2: 'flashlight'
    };
    const action = actionMap[event.button];
    if (action) this.setAction(action, false);
  }

  private onContextMenu(event: Event): void {
    event.preventDefault();
  }

  private onPointerLockError(): void {
    const now = performance.now();
    this.lockRequestPendingUntil = 0;
    const fromClick = this.lockRequestFromClick;
    this.lockRequestFromClick = false;

    if (fromClick) {
      // Setelah ditolak, tunda 1,5 detik sebelum mencoba mengunci lagi supaya
      // tidak membanjiri browser dengan permintaan pointer lock.
      const fresh = now >= this.lockDeniedUntil;
      this.lockDeniedUntil = now + 1500;
      if (fresh) console.warn('[input] pointer lock ditolak browser: memakai mode tarik-menoleh');
    } else {
      // Bukan fatal: mode tarik-menoleh tetap jalan dan hint mengajak pemain
      // mengklik kanvas, yang justru mengunci kursor.
      console.warn('[input] pointer lock otomatis ditolak: klik kanvas untuk mengunci');
    }
  }

  private onVisibilityChange(): void {
    if (document.hidden) this.releaseDeviceActions();
  }

  private onWindowBlur(): void {
    this.releaseDeviceActions();
    // Kunci pointer otomatis lepas saat window kehilangan fokus; jaga agar
    // flag di state ikut sinkron walau event-nya terlewat.
    if (this.state.pointerLocked && document.pointerLockElement !== this.canvas) {
      this.handlePointerLockChange();
    }
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
  }

  private onTouchStart(event: TouchEvent): void {
    event.preventDefault();
    const touch = event.touches[0];
    if (!touch || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    this.touchStartTime = performance.now();
    this.touchMoved = 0;

    if (x < rect.width / 2) {
      // Separuh kiri: joystick virtual untuk bergerak.
      this.joystickActive = true;
      this.joystickCenterX = x;
      this.joystickCenterY = y;
      this.joystickDX = 0;
      this.joystickDY = 0;
    } else {
      // Separuh kanan: usap untuk memutar kamera.
      this.touchActive = true;
      this.touchStartX = x;
      this.touchStartY = y;
    }
  }

  private onTouchMove(event: TouchEvent): void {
    event.preventDefault();
    const touch = event.touches[0];
    if (!touch || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    if (this.joystickActive) {
      const dx = x - this.joystickCenterX;
      const dy = y - this.joystickCenterY;
      const dist = Math.hypot(dx, dy);
      if (dist > this.joystickRadius) {
        const angle = Math.atan2(dy, dx);
        this.joystickDX = Math.cos(angle) * this.joystickRadius;
        this.joystickDY = Math.sin(angle) * this.joystickRadius;
      } else {
        this.joystickDX = dx;
        this.joystickDY = dy;
      }
      this.touchMoved = Math.max(this.touchMoved, dist);
    } else if (this.touchActive) {
      // Delta mentah dalam piksel; FPSController yang menerapkan sensitivitas.
      const dx = x - this.touchStartX;
      const dy = y - this.touchStartY;
      if (this.lookEnabled) {
        this.state.touchDeltaX += dx;
        this.state.touchDeltaY += dy;
      }
      this.touchMoved = Math.max(this.touchMoved, Math.hypot(dx, dy));
      this.touchStartX = x;
      this.touchStartY = y;
    }
  }

  private onTouchEnd(event: TouchEvent): void {
    if (this.joystickActive) {
      this.joystickActive = false;
      this.joystickDX = 0;
      this.joystickDY = 0;
      this.setAction('forward', false);
      this.setAction('backward', false);
      this.setAction('left', false);
      this.setAction('right', false);
    }
    if (this.touchActive) {
      // Tap cepat tanpa geser = interaksi (pengganti tombol E).
      const quickTap = performance.now() - this.touchStartTime < 300 && this.touchMoved < 12;
      if (quickTap) this.tapQueued = true;
      this.touchActive = false;
      this.state.touchDeltaX = 0;
      this.state.touchDeltaY = 0;
    }
  }

  private handlePointerLockChange(): void {
    this.state.pointerLocked = document.pointerLockElement === this.canvas;
    // Kunci sudah diputuskan browser (berhasil atau lepas): masa tenggang
    // "klik untuk mengunci" berakhir sehingga klik berikutnya kembali normal.
    this.lockRequestPendingUntil = 0;
    this.lockDeniedUntil = 0;
    this.lockRequestFromClick = false;
    this.lockChangeListeners.forEach(l => l(this.state.pointerLocked));
  }

  private onFullscreenChange(): void {
    if (!document.fullscreenElement && this.state.pointerLocked) {
      this.exitPointerLock();
    }
  }

  private onGamepadConnected(event: GamepadEvent): void {
    console.log('Gamepad connected:', event.gamepad.id);
  }

  private onGamepadDisconnected(event: GamepadEvent): void {
    console.log('Gamepad disconnected:', event.gamepad.id);
  }

  dispose(): void {
    for (const [target, type, fn, options] of this.boundListeners) {
      target.removeEventListener(type, fn, options as EventListenerOptions | boolean | undefined);
    }
    this.boundListeners = [];
    this.releaseDeviceActions();
    this.gamepadPressed.clear();
    this.dragLook = false;
    this.lockRequestPendingUntil = 0;
    this.lockDeniedUntil = 0;
    this.lockRequestFromClick = false;
    this.joystickActive = false;
    this.touchActive = false;
  }
}

export const inputManager = new InputManager();