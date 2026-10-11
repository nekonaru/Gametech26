import * as THREE from 'three';
import { Engine, createEngine, getEngine } from '../core/engine.js';
import { eventBus, GameEvents } from '../core/events.js';
import { settingsManager } from '../core/settings.js';
import { achievementManager } from '../core/achievements.js';
import { i18n, t } from '../core/i18n.js';
import { saveManager } from '../core/save.js';
import { audioManager } from '../core/audio.js';
import { assetManager } from '../core/assets.js';
import { inputManager } from '../core/input.js';
import { FPSController } from '../render/camera.js';
import { LightingManager } from '../render/lighting.js';
import { ParticleSystem } from '../render/particles.js';
import { PostProcessManager } from '../render/postprocess.js';
import { sceneFactory, BuiltScene, updateFigures, updateDynamics, setDrawerOpen, setDrawerSenterVisible, animatePickup, hidePickupInstantly } from '../render/scenes.js';
import { getSoftDotTexture } from '../render/textures.js';
import { gameState } from './state.js';
import { scriptRunner } from './scriptRunner.js';
import { dialogueManager } from './dialogue.js';
import { interactionManager } from './interaction.js';
import { journalManager } from './journal.js';
import { phoneManager } from './phone.js';
import { chapterManager } from './chapter.js';
import { tensionDirector } from './tension.js';
import { endingManager } from './endings.js';
import { BootScreen, LanguageSelectScreen } from '../ui/boot.js';
import { confirmAction } from '../ui/base.js';
import { TransitionLayer } from '../ui/transitions.js';
import { MainMenuScreen } from '../ui/menu.js';
import { SettingsScreen } from '../ui/settingsUI.js';
import { LoadGameScreen, PauseMenu } from '../ui/loadUI.js';
import { HUD, DaySummaryScreen } from '../ui/hud.js';
import { JournalScreen, EvidenceBoardScreen } from '../ui/journal.js';
import { InventoryScreen } from '../ui/inventory.js';
import { PhoneScreen } from '../ui/phone.js';
import { DialogScreen } from '../ui/dialog.js';
import { GalleryScreen, ChapterSelectScreen } from '../ui/gallery.js';
import { PuzzleScreen } from '../ui/puzzleUI.js';
import { showControlsHint, maybeShowControlsOnce, hideControlsHint } from '../ui/controls.js';
import { EndingScreen } from '../ui/ending.js';
import { PrologueScreen } from '../ui/prologue.js';

type ScreenName =
  | 'boot' | 'language' | 'menu' | 'playing' | 'paused' | 'ending' | 'prologue';

/** Setengah sisi kubus penanda objek interaktif. */
const PROP_HALF = 0.28;

export class Game {
  private engine: Engine | null = null;
  private fpsController: FPSController | null = null;
  private lighting: LightingManager | null = null;
  private particles: ParticleSystem | null = null;
  private flashlight: THREE.SpotLight | null = null;

  private bootScreen: BootScreen | null = null;
  private languageScreen: LanguageSelectScreen | null = null;
  private mainMenu: MainMenuScreen | null = null;
  private settingsScreen: SettingsScreen | null = null;
  private loadScreen: LoadGameScreen | null = null;
  private pauseMenu: PauseMenu | null = null;
  private hud: HUD | null = null;
  private daySummary: DaySummaryScreen | null = null;
  private journalScreen: JournalScreen | null = null;
  private inventoryScreen: InventoryScreen | null = null;
  private evidenceBoard: EvidenceBoardScreen | null = null;
  private phoneScreen: PhoneScreen | null = null;
  private dialogScreen: DialogScreen | null = null;
  /**
   * Titik dunia sumber dialog terakhir (benda yang barusan ditekan pemain).
   * Saat lawan bicara bicara, kamera diputar halus menghadap titik ini -
   * Raka di balik pintu, mandor di dekat meja, pedagang di lapaknya.
   * Dibersihkan tiap pindah scene supaya tidak menoleh ke titik basi.
   */
  private dialogFaceTarget: THREE.Vector3 | null = null;
  private galleryScreen: GalleryScreen | null = null;
  private chapterSelect: ChapterSelectScreen | null = null;
  private puzzleScreen: PuzzleScreen | null = null;
  private endingScreen: EndingScreen | null = null;
  private prologueScreen: PrologueScreen | null = null;

  private currentScreen: string | null = null;
  private gameState: ScreenName = 'boot';
  private animationId: number | null = null;
  private lastTime = 0;
  private overlayActive = false;
  private nextChapterId: string | null = null;
  private pointerLocked = false;
  /**
   * Berapa lama (detik) gerbang "busy" dilaporkan macet tanpa layar terbuka.
   * Dipakai pemulihan otomatis: flag overlay yang nyangkut membuat WASD dan
   * menoleh mati total tanpa cara apa pun bagi pemain untuk membukanya lagi.
   */
  private controlGateStuckTime = 0;
  private controlGateWarned = false;
  private builtScene: BuiltScene | null = null;
  private propMeshes: THREE.Object3D[] = [];
  /** Vektor kerja updatePropPulse: dialokasikan sekali, bukan tiap frame. */
  private pulseCamPos = new THREE.Vector3();
  private pulseFwd = new THREE.Vector3();
  /** Kartu "Babak Selesai" baru saja tampil: jangan ulangi kartu intro. */
  private skipChapterIntroCard = false;
  private readonly propRaycaster = new THREE.Raycaster();

  async initialize(canvas: HTMLCanvasElement): Promise<void> {
    this.engine = createEngine(canvas);
    await this.engine.initialize();
    await endingManager.loadFromData();
    await journalManager.loadDefinitions();

    this.setupGameSystems();
    this.setupUI();
    this.setupEventListeners();
    this.startBootSequence();
  }

  private setupGameSystems(): void {
    if (!this.engine) return;

    this.fpsController = new FPSController(this.engine.camera, inputManager, settingsManager);
    this.fpsController.setPlayerHeight(1.72);
    this.engine.scene.add(this.fpsController.getYawObject());

    this.lighting = new LightingManager(this.engine.scene, settingsManager);
    this.particles = new ParticleSystem(this.engine.scene, settingsManager);

    // Senter: sinar lebih terang dan menjangkau lebih jauh dari versi lama
    // (intensitas 2,6 / jarak 16 / decay 1,3) supaya lorong gelap terbaca
    // tanpa pemain harus menempelkan hidung ke dinding.
    this.flashlight = new THREE.SpotLight(0xfff3da, 0, 26, Math.PI / 3.6, 0.42, 1.05);
    this.flashlight.position.set(0.18, -0.12, 0);
    this.flashlight.target.position.set(0.18, -0.12, -3);
    this.flashlight.visible = false;
    this.engine.camera.add(this.flashlight);
    this.engine.camera.add(this.flashlight.target);

    interactionManager.setCamera(this.engine.camera);
  }

  private setupUI(): void {
    this.bootScreen = new BootScreen(
      () => this.showLanguageScreen(),
      () => this.exitGame()
    );

    this.languageScreen = new LanguageSelectScreen(
      () => this.showMainMenu()
    );

    this.mainMenu = new MainMenuScreen({
      onStart: () => this.newGame(),
      onContinue: () => this.continueGame(),
      onLoad: () => this.showLoadScreen(),
      onChapters: () => this.showChapterSelect(),
      onSettings: () => this.showSettings(),
      onExit: () => this.exitGame(),
      onGallery: () => this.showGallery()
    });

    this.settingsScreen = new SettingsScreen(() => this.hideSettings());
    this.loadScreen = new LoadGameScreen(
      () => this.hideLoadScreen(),
      (slot) => this.loadGame(slot),
      { onSave: (slotId) => void this.saveToSlotFromUI(slotId) }
    );

    this.pauseMenu = new PauseMenu({
      onResume: () => this.resumeGame(),
      onSave: () => this.showSaveScreen(),
      onLoad: () => this.showLoadScreen(),
      onJournal: () => this.showJournal(),
      onInventory: () => this.showInventory(),
      onBoard: () => this.openEvidenceBoard(),
      onSettings: () => this.showSettings(),
      onControls: () => showControlsHint('manual'),
      onMainMenu: () => this.showMainMenu()
    });

    this.hud = new HUD();
    this.daySummary = new DaySummaryScreen(() => this.hideDaySummary());

    this.journalScreen = new JournalScreen(() => this.hideJournal());
    this.inventoryScreen = new InventoryScreen(() => this.returnFromOverlay());
    this.evidenceBoard = new EvidenceBoardScreen(
      () => this.hideEvidenceBoard(),
      (connections) => this.submitEvidenceBoard(connections)
    );

    this.phoneScreen = new PhoneScreen(() => this.hidePhone());
    this.dialogScreen = new DialogScreen(() => this.hideDialog());
    this.galleryScreen = new GalleryScreen(() => this.hideGallery());
    this.chapterSelect = new ChapterSelectScreen(
      () => this.hideChapterSelect(),
      (chapterId) => this.selectChapter(chapterId)
    );
    this.puzzleScreen = new PuzzleScreen();

    this.endingScreen = new EndingScreen(
      () => this.showMainMenu(),
      () => this.showGallery(),
      () => this.newGame()
    );
    this.prologueScreen = new PrologueScreen(() => this.endPrologue());
  }

  private setupEventListeners(): void {
    // Autosave per bab: chapter manager hanya memicu event ini; penulisan
    // state penuh (bab + naskah + jurnal + inventori) dilakukan di sini supaya
    // hasilnya selalu bisa dilanjutkan, lengkap dengan indikator singkat.
    eventBus.on('save:auto', () => { void this.performAutoSave(); });
    eventBus.on<any>('hud:objective', (data) => {
      if (data && typeof data.text === 'string') {
        this.hud?.setObjective(t(data.text));
        // Label mengambang pada penanda `goalFor` selalu menampilkan objektif
        // yang sedang berlaku, jadi ikut diperbarui setiap kali berganti.
        this.refreshGoalLabels(data.text);
      }
    });
    eventBus.on<any>('hud:interactionPrompt', (data) => {
      if (!data) return;
      this.hud?.setInteractionPrompt(
        data.show ? t(String(data.text)) : '',
        !!data.show,
        !!data.goal
      );
    });
    eventBus.on('ui:openJournal', () => this.showJournal());
    eventBus.on('ui:openEvidenceBoard', () => this.openEvidenceBoard());
    // Tombol kontrol layar sentuh (HUD). Memakai penjaga yang sama persis
    // dengan pintasan keyboard supaya tidak ada jalur alternatif yang bisa
    // membuka overlay saat dialog/teka-teki sedang menutup layar.
    eventBus.on<any>('hud:touchAction', (data) => {
      const action = String(data?.action ?? '');
      const playing = this.gameState === 'playing';
      if (action === 'run') {
        // Sakelar lari diizinkan di luar dialog (gerak bebas saat bermain).
        if (playing && !gameState.get('inDialog')) {
          this.hud?.setTouchRunActive(inputManager.toggleTouchRun());
        }
        return;
      }
      if (action === 'pause') {
        if (playing && !gameState.get('inDialog') && !this.isModalOpen()) this.pauseGame();
        return;
      }
      if (!playing || gameState.get('inDialog') || this.isModalOpen()) return;
      switch (action) {
        case 'journal':
          this.showJournal();
          break;
        case 'phone':
          this.showPhone();
          break;
        case 'inventory':
          // Tombol yang sama membuka dan menutup, seperti pintasan I.
          if (this.currentScreen === 'InventoryScreen' && this.overlayActive) this.hideInventory();
          else this.showInventory();
          break;
        case 'flashlight':
          eventBus.emit('phone:flashlight', { on: !phoneManager.getFlashlightState().on });
          break;
        case 'interact':
          inputManager.queueInteract();
          break;
      }
    });
    eventBus.on<any>('achievement:unlocked', (data) => {
      if (data && typeof data.id === 'string') this.showAchievementToast(data.id);
    });
    eventBus.on('ui:incomingCall', () => this.showPhone());
    eventBus.on('ui:openPhone', () => this.showPhone());
    eventBus.on<any>('player:flashlight', (data) => this.setFlashlight(!!data.on));
    eventBus.on<any>('player:teleport', (data) => this.fpsController?.teleport(new THREE.Vector3(...data.pos), data.yaw));
    eventBus.on<any>('camera:anim', (data) => {
      this.fpsController?.startViewAnim({
        kind: data?.kind,
        duration: data?.duration,
        eyeHeight: data?.eyeHeight,
        pitch: data?.pitch
      });
    });
    eventBus.on<any>('chapter:complete', (data) => this.completeChapter(data.chapterId));
    eventBus.on<any>('puzzle:start', (data) => this.startPuzzle(data.id, data.config));
    // Barang baru masuk inventaris: konfirmasi singkat lewat toast, supaya
    // pemain tahu benda puzzle barusan masuk tas. Prop benda di dunia 3D ikut
    // mengecil dan hilang (animasi pickup), penanda menyelanya ikut padam.
    eventBus.on<any>('inventory:added', (data) => {
      if (!data || typeof data.id !== 'string') return;
      const key = `item.${data.id}.name`;
      const name = i18n.hasKey(key) ? t(key) : data.id;
      this.showToast(t('inventory.baru'), name);
      this.hideLootedProp(data.id, true);
      this.syncHotbar();
      // Barang baru bisa membuka tombol kontekstual (mis. senter = F).
      this.refreshKeyHints();
    });
    // Puzzle dibatalkan pemain (tombol Batal / Esc): tutup layar teka-teki
    // tanpa solve maupun skip: timer berhenti di hide(), interaktif yang sama
    // bisa membuka ulang puzzle nanti, tidak ada progres yang hilang.
    eventBus.on<any>('puzzle:cancelled', () => {
      const el = this.puzzleScreen?.element;
      if (el && el.getClientRects().length > 0) this.returnFromOverlay();
    });
    // Senter ditolak karena barangnya belum ada: beri tahu caranya.
    eventBus.on('flashlight:missing', () => {
      this.showToast(t('inventory.title'), t('inventory.noSenter'));
    });
    eventBus.on<any>('ending:reached', (data) => this.showEnding(data.ending));
    eventBus.on<any>('lighting:preset', (data) => {
      if (data && typeof data.preset === 'string') {
        this.lighting?.applyPreset(data.preset, data.transition || 0);
        this.maybeDarkHint(data.preset);
      }
    });
    eventBus.on(GameEvents.SCENE_LOAD_START, () => {
      // Bab sedang berpindah: buang target interaksi lama supaya pemain tidak
      // bisa memicu dialog bab sebelumnya selama transisi.
      interactionManager.clear();
      interactionManager.setEnabled(false);
      this.hud?.setInteractionPrompt('', false);
      // Titik menghadap lawan bicara juga basi setelah pindah scene.
      this.dialogFaceTarget = null;
      // Petunjuk gelap diperbolehkan muncul lagi di scene berikutnya.
      this.darkHintShown = false;
    });
    eventBus.on(GameEvents.SCENE_LOAD_COMPLETE, () => {
      this.buildSceneForCurrentChapter();
      // Sinkron visual laci dengan naskah bab: chestOfDrawers selalu lahir
      // tertutup, jadi bab yang sudah mengambil isinya perlu langsung terbuka
      // tanpa animasi (auto-play masuk-keluar scene berulang).
      this.syncDrawerState();
      // Hotbar ikut disegarkan: impor simpanan memulihkan inventaris tanpa
      // mengeluarkan event, dan penanda barang yang sudah diambil disinkronkan
      // oleh registerInteractables().
      this.syncHotbar();
      this.refreshKeyHints();
      // Aktifkan lagi interaksi; kalau tidak, permainan tetap nonaktif sampai
      // frame berikutnya (dan tidak ada frame sama sekali bila tab tersembunyi).
      interactionManager.setEnabled(!this.overlayActive && !gameState.get('inDialog'));
    });
    // Interaktif naskah dipakai (baik oleh pemain maupun penggerak otomatis):
    // pintu scene di dekat titik itu ikut terbuka: pintu depan berayun saat
    // seseorang "keluar rumah", bukan membuka dialog di balik daun yang buntu.
    eventBus.on<any>('interactable:used', (data) => {
      if (data && typeof data.id === 'string') this.openDoorForUse(data.id);
      // Telusuri laci setelah isinya diambil: senter baru hilang dari bak di
      // momen pemain memeriksanya: konsisten dengan dialog "laci kosong",
      // sementara sebelum itu pemain masih bisa melihat barangnya di dalam
      // laci yang terbuka (bayangan janji "senter di dalam menunggu").
      if (data && data.id === 'laci' && gameState.hasInventory('senter')) {
        setDrawerSenterVisible(false);
      }
      // Tandai penanda objek yang sudah dipakai: setelah objektif pindah,
      // penanda itu tak lagi kandidat penanda utama sehingga hanya meredup,
      // bukan tetap menyala kuning penuh di antara tujuan yang lain.
      if (data && typeof data.id === 'string') {
        for (const prop of this.propMeshes) {
          if (prop.userData.interactableId === data.id) prop.userData.goalUsed = true;
        }
      }
    });
    // Laci ruang tengah hanya meluncur terbuka setelah kunci angka dipecahkan
    // (b01: dial 0705 dari jam dinding; b04: dial kwitansi): persis seperti
    // narasinya: "kunci sudah terpasang, tapi tutupnya dijaga empat angka".
    eventBus.on<any>('puzzle:solved', (data) => {
      if (!data || typeof data.id !== 'string') return;
      const chapter = gameState.get('currentChapter');
      const fromDrawer = (chapter === 'b01' && data.id === 'b01_laci') ||
        (chapter === 'b04' && data.id === 'p1');
      if (fromDrawer) setDrawerOpen(true);
    });
    eventBus.on<any>(GameEvents.DIALOG_START, (data) => {
      // Dialog TIDAK melepas kunci kursor lagi: seluruh kontrol dialog memakai
      // keyboard (Spasi lanjut, Esc lewati, W/S + Spasi memilih, 1-4 langsung,
      // H riwayat, P auto-play). Kursor tetap terkunci supaya kamera tidak
      // mendadak bebas saat narasi berjalan; rekam keadaannya untuk kunci ulang.
      this.dialogPointerWasLocked = inputManager.isPointerLocked();
      interactionManager.setEnabled(false);
      this.hud?.setInteractionPrompt('', false);
      this.refreshPointerHint();
      this.faceSpeakerIfNeeded(data);
    });
    eventBus.on(GameEvents.DIALOG_END, () => {
      interactionManager.setEnabled(!this.overlayActive && !gameState.get('inDialog'));
      // Kunci ulang kursor hanya kalau saat dialog dimulai kuncinya masih
      // terpasang: kalau pemain sengaja membuka kursor (tombol `), biarkan.
      if (this.dialogPointerWasLocked) {
        inputManager.requestPointerLockIfActivated();
        this.dialogPointerWasLocked = false;
      }
      this.refreshPointerHint();
    });
    eventBus.on<any>('engine:update', (data) => this.updateGameSystems(data.deltaTime));

    // Percikan horor dari TensionDirector sebelumnya menguap begitu saja
    // karena tidak ada pendengar. Sekarang diterjemahkan jadi umpan balik
    // visual singkat di HUD supaya tegangan terasa oleh pemain.
    eventBus.on<any>('ui:sensoryText', (data) => {
      if (data && typeof data.text === 'string') this.hud?.showSensoryText(data.text);
    });
    eventBus.on<any>('horror:flicker', (data) => this.hud?.flashHorror(0.55, data?.duration || 900));
    eventBus.on<any>('horror:breath', (data) => this.hud?.flashHorror(0.8, data?.duration || 1200));
    eventBus.on<any>('horror:temperature', (data) => this.hud?.flashHorror(0.4, data?.duration || 1500));
    eventBus.on<any>('horror:jumpscare', (data) => this.hud?.flashHorror(1, Math.min(data?.duration || 700, 900)));
    eventBus.on<any>('horror:whisper', (data) => {
      if (data && typeof data.text === 'string') {
        this.hud?.showSensoryText(data.text, data.duration || 4000);
      }
      this.hud?.flashHorror(0.35, 700);
    });
    eventBus.on<any>('horror:shadow', () => this.hud?.flashHorror(0.45, 800));
    eventBus.on<any>('horror:footsteps', () => this.hud?.flashHorror(0.3, 700));
    eventBus.on<any>('horror:door', () => this.hud?.flashHorror(0.35, 700));

    // Kamera desktop hanya bergerak saat pointer terkunci; beri petunjuk bila
    // kuncinya lepas (Esc, alt-tab, klik di luar canvas, dst).
    inputManager.onPointerLockChange((locked) => {
      this.pointerLocked = locked;
      this.refreshPointerHint();
    });

    window.addEventListener('keydown', this.handleGlobalKeys.bind(this));
    // Setelan DOM (petunjuk tombol, skala teks, kontras, latar teks) ikut
    // merespons perubahan pemain di Pengaturan tanpa memuat ulang permainan.
    settingsManager.subscribe(() => {
      this.refreshKeyHints();
      this.applyDomSettings();
    });
    this.applyDomSettings();
  }

  /**
   * Terapkan setelan yang berwujud di DOM: skala ukuran teks, latar kotak
   * dialog, kontras tinggi, dan palet ramah buta warna. Semua lewat kelas/var
   * di <html> supaya CSS murni yang menerapkannya.
   */
  private applyDomSettings(): void {
    const text = settingsManager.get('text');
    const acc = settingsManager.get('accessibility');
    const root = document.documentElement;
    const scale = Math.max(0.85, Math.min(1.6, text.fontSize / 16));
    root.style.setProperty('--text-scale', String(scale));
    root.classList.toggle('no-text-bg', !text.textBackground);
    root.classList.toggle('high-contrast', !!acc.highContrast);
    root.classList.toggle('cb-friendly', !!acc.colorBlindFriendly);
  }

  /**
   * Petunjuk senter di tempat gelap: sekali per scene, hanya kalau pemain
   * sudah punya senter dan senter sedang mati. Memakai kanal teks sensory
   * supaya terbaca di tengah layar tanpa menutupi permainan.
   */
  private maybeDarkHint(preset: string): void {
    if (this.darkHintShown) return;
    const dark = preset === 'malam_rumah' || preset === 'hutan_malam' || preset === 'teror';
    if (!dark) return;
    if (!gameState.hasInventory('senter')) return;
    if (phoneManager.getFlashlightState().on) return;
    this.darkHintShown = true;
    this.hud?.showSensoryText(t('ui.darkHint'), 5000);
  }

  /**
   * Petunjuk tombol kontekstual di HUD: hanya tombol yang benar-benar bisa
   * dipakai saat itu (F senter hanya tampil setelah barangnya ada). Bisa
   * dimatikan lewat Pengaturan > Kontrol > "Tampilkan petunjuk tombol".
   */
  private refreshKeyHints(): void {
    if (this.gameState !== 'playing') {
      this.hud?.setKeyHints(null);
      return;
    }
    if (!settingsManager.get('controls').showKeyHints) {
      this.hud?.setKeyHints(null);
      return;
    }
    // Layar sentuh: label keyboard (E/Q/I/Tab) tidak ada artinya dan hanya
    // membanjiri layar sempit. Kendali setara tersedia lewat tombol sentuh.
    if (!this.coarsePointer && typeof matchMedia === 'function') {
      this.coarsePointer = matchMedia('(pointer: coarse)');
    }
    if (this.coarsePointer?.matches) {
      this.hud?.setKeyHints(null);
      return;
    }
    const items = [
      { key: 'E', label: t('ui.keys.interact') },
      { key: 'Q', label: t('ui.keys.phone') },
      { key: 'I', label: t('ui.keys.inventory') },
      { key: 'Tab', label: t('ui.keys.journal') },
      { key: '`', label: t('ui.keys.lock') },
      { key: 'Esc', label: t('ui.keys.pause') }
    ];
    if (gameState.hasInventory('senter')) items.unshift({ key: 'F', label: t('ui.keys.flashlight') });
    this.hud?.setKeyHints(items);
  }

  private coarsePointer: MediaQueryList | null = null;
  /** Apakah kunci kursor masih terpasang saat dialog terakhir dimulai. */
  private dialogPointerWasLocked = false;
  /** Petunjuk "gelap, pakai senter" hanya muncul sekali per scene. */
  private darkHintShown = false;

  private refreshPointerHint(): void {
    // Satu sumber keadaan "apakah permainan sedang menelan input menoleh".
    // Delta yang terkumpul saat overlay menutup layar harus dibuang, bukan
    // ditumpuk dan dilepas sekaligus begitu overlay ditutup.
    const active = this.gameState === 'playing'
      && !this.overlayActive
      && !gameState.get('inDialog')
      && !gameState.get('inPuzzle');
    inputManager.setLookEnabled(active);

    // MediaQueryList dibuat sekali; properti .matches-nya ikut berubah bila
    // perangkat berpindah mouse <-> sentuh, tanpa membuat objek baru tiap frame.
    if (!this.coarsePointer && typeof matchMedia === 'function') {
      this.coarsePointer = matchMedia('(pointer: coarse)');
    }
    const show = !this.coarsePointer?.matches && !this.pointerLocked && active;
    this.hud?.setPointerHint(show);
    // Tombol aksi layar sentuh: hanya saat benar-benar bermain dan tidak ada
    // overlay/dialog yang menutup layar (penjaga sama dengan pointer-hint).
    this.hud?.setTouchControlsVisible(!!this.coarsePointer?.matches && active);
  }

  private startBootSequence(): void {
    this.gameState = 'boot';
    const accepted = localStorage.getItem('contentWarningAccepted');
    if (!accepted) {
      this.showScreen(this.bootScreen!);
      return;
    }
    // Bahasa sudah pernah dipilih pada sesi sebelumnya: langsung ke menu.
    // Tanpa ini pemain disuruh memilih bahasa lagi setiap kali membuka game
    // padahal pilihannya sudah tersimpan di pengaturan.
    if (localStorage.getItem('languageChosen')) {
      this.showMainMenu();
      return;
    }
    this.showLanguageScreen();
  }

  private showLanguageScreen(): void {
    this.gameState = 'language';
    this.showScreen(this.languageScreen!);
  }

  private showMainMenu(): void {
    this.gameState = 'menu';
    this.overlayActive = false;
    // Quitting from the pause menu has to actually tear gameplay down, otherwise
    // the 3D scene keeps rendering (and chapter ambience keeps looping) behind
    // the menu for as long as the tab stays open.
    this.engine?.stop();
    inputManager.exitPointerLock();
    inputManager.setLookEnabled(false);
    interactionManager.setEnabled(false);
    this.hud?.setPointerHint(false);
    this.hud?.setInteractionPrompt('', false);
    audioManager.stopAll();
    this.mainMenu?.refresh();
    this.showScreen(this.mainMenu!);
  }

  private async newGame(): Promise<void> {
    gameState.reset();
    // Jangan tulis autosave di sini: state masih tanpa bab, dan autosave begitu
    // akan menimpa progres lama sekaligus membuat "Lanjutkan" memuat dunia
    // kosong. Autosave pertama ditulis saat bab pertama dimulai.
    this.gameState = 'prologue';
    this.showScreen(this.prologueScreen!);
  }

  private async endPrologue(): Promise<void> {
    await this.startChapter('b01');
  }

  private async continueGame(): Promise<void> {
    // Sumber yang sama dengan label tombol di menu utama.
    const latest = await saveManager.getContinueSave();
    if (latest) {
      await this.loadSaveData(latest.data);
    } else {
      await this.newGame();
    }
  }

  private showLoadScreen(): void {
    this.loadScreen?.setMode('load');
    this.loadScreen?.refresh();
    this.showScreen(this.loadScreen!);
  }

  private showSaveScreen(): void {
    this.loadScreen?.setMode('save');
    this.loadScreen?.refresh();
    this.showScreen(this.loadScreen!);
  }

  private async saveToSlotFromUI(slotId: string): Promise<void> {
    try {
      await saveManager.saveToSlot(slotId, this.buildSaveData());
      this.showToast(t('ui.save'), t('ui.gameSaved'));
      this.returnFromOverlay();
    } catch (err) {
      console.error('[game] save to slot gagal', err);
      this.showToast(t('ui.save'), t('ui.saveFailed'));
    }
  }

  private showSettings(): void {
    this.showScreen(this.settingsScreen!);
  }

  private hideSettings(): void {
    this.returnFromOverlay();
  }

  private hideLoadScreen(): void {
    this.returnFromOverlay();
  }

  private async loadGame(slot: any): Promise<void> {
    await this.loadSaveData(slot.data);
  }

  private async loadSaveData(data: any): Promise<void> {
    if (!data) return;
    if (!data.currentChapter) {
      // Save lama tanpa bab (autosave sisa "permainan baru"). Memuatnya akan
      // menaruh pemain dalam status bermain tanpa naskah: objektif basi,
      // chapterEnd langsung memicu ending. Kembalikan ke alur permainan baru.
      console.warn('[game] save tanpa bab: memulai permainan baru');
      await this.newGame();
      return;
    }
    try {
      gameState.deserialize(JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to deserialize save:', error);
    }
    if (data.chapterManager) chapterManager.deserialize(data.chapterManager);
    if (data.journal) journalManager.deserialize(data.journal);
    await scriptRunner.loadChapter(data.currentChapter);
    // loadChapter mereset objektif; pulihkan dari save supaya tujuan yang sedang
    // berjalan (dan penandanya) tetap sama seperti saat permainan disimpan.
    scriptRunner.deserialize(data.scriptRunner);
    if (!gameState.get('currentChapter')) {
      // loadChapter menelan errornya sendiri; kalau bab gagal dimuat jangan
      // berpura-pura sedang bermain.
      console.warn('[game] gagal memuat bab', data.currentChapter, '- memulai permainan baru');
      await this.newGame();
      return;
    }
    this.startPlaying();
  }

  /** Autosave per bab (awal & akhir): state penuh ke slot `autosave`. */
  private async performAutoSave(): Promise<void> {
    try {
      await saveManager.autoSave(this.buildSaveData());
      this.showToast(t('ui.autosave'), t('ui.autosaved'), 2500);
    } catch (err) {
      console.warn('[game] autosave gagal', err);
    }
  }

  /** Generic transient toast (save confirmations, warnings, …). */
  private showToast(label: string, message: string, durationMs = 3000): void {
    const toast = document.createElement('div');
    toast.className = 'achievement-toast save-toast';
    const labelEl = document.createElement('div');
    labelEl.className = 'achievement-toast-label';
    labelEl.textContent = label;
    const msgEl = document.createElement('div');
    msgEl.className = 'achievement-toast-name';
    msgEl.textContent = message;
    toast.append(labelEl, msgEl);
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), durationMs);
  }

  private buildSaveData(): any {
    return {
      ...gameState.getState(),
      chapterManager: chapterManager.serialize(),
      journal: journalManager.serialize(),
      scriptRunner: scriptRunner.serialize(),
      savedAt: Date.now()
    };
  }

  private exitGame(): void {
    void confirmAction(t('ui.exitConfirm'), {
      title: t('ui.quit'),
      confirmLabel: t('ui.yes'),
      cancelLabel: t('ui.no')
    }).then(ok => {
      if (!ok) return;
      window.close();
      // Browsers refuse window.close() for tabs they did not open themselves, so
      // tell the player how to leave instead of silently doing nothing.
      window.setTimeout(() => {
        if (!window.closed) this.showToast(t('ui.quit'), t('ui.exitFallback'), 6000);
      }, 400);
    });
  }

  private showGallery(): void {
    this.galleryScreen?.setEndings(this.getEndingGalleryData());
    this.showScreen(this.galleryScreen!);
  }

  private hideGallery(): void {
    this.showMainMenu();
  }

  private getEndingGalleryData(): any[] {
    const endings = endingManager.getAllEndings();
    return endings.map(e => ({
      id: e.id,
      name: e.name,
      description: e.description,
      unlocked: gameState.hasEnding(e.id),
      playthroughDate: undefined,
      stats: undefined
    }));
  }

  private async startChapter(chapterId: string): Promise<void> {
    // Layar diredupkan dulu supaya pindah tempat tidak terasa "loncat":
    // pemain melihat hitam sejenak, lalu kartu babak muncul di atasnya.
    await TransitionLayer.fadeOut(450);
    await scriptRunner.loadChapter(chapterId);
    if (gameState.get('currentChapter') !== chapterId) {
      // loadChapter menelan errornya sendiri; jangan masuk mode bermain tanpa
      // naskah (objektif basi, tanpa interaktif, chapterEnd memicu ending).
      console.error('[game] gagal memuat bab', chapterId, '- kembali ke menu');
      await TransitionLayer.fadeIn(600);
      this.showMainMenu();
      return;
    }
    this.startPlaying();

    // Kartu judul bab: penanda bahwa babak lama sudah tuntas dan tempat baru
    // dimulai. Dilewati kalau baru saja menampilkan kartu "Babak Selesai"
    // supaya pemain tidak disuguhi dua kartu berturut-turut.
    if (!this.skipChapterIntroCard) {
      await this.showChapterIntroCard(chapterId);
    }
    this.skipChapterIntroCard = false;
    // Rangkaian `onSpawn` (animasi bangun b01) dijalankan di balik layar
    // hitam ini, bukan sesudah fade-in: pose merebah harus terjadi saat
    // layar masih gelap, dan startChapter tidak boleh menunggu dialog yang
    // justru menunggu pemain. Fire-and-forget; opDepth-nya yang menjaga
    // penggerak otomatis menunggu sampai pembuka tuntas.
    void scriptRunner.runPendingSpawnOps();
    await TransitionLayer.fadeIn(800);
  }

  /** Naskah + lokasi bab untuk kartu judul (fallback ke nama dari data). */
  private chapterDisplayTitle(chapterId: string): { title: string; subtitle: string } {
    const chapter = chapterManager.getChapters().find(c => c.id === chapterId);
    const titleKey = `${chapterId}.title`;
    const title = i18n.hasKey(titleKey) ? t(titleKey) : (chapter?.name ?? chapterId);
    const day = chapter?.hari ?? gameState.get('hari');
    const pov = (chapter?.pov ?? gameState.get('pov')).toUpperCase();
    return { title, subtitle: `${t('ui.day')} ${day} · ${pov}` };
  }

  private async showChapterIntroCard(chapterId: string): Promise<void> {
    const { title, subtitle } = this.chapterDisplayTitle(chapterId);
    await TransitionLayer.showChapterCard({
      kicker: t('ui.chapter'),
      title,
      subtitle,
      holdMs: 2000
    });
  }

  private startPlaying(): void {
    this.gameState = 'playing';
    this.hideAllScreens();
    this.overlayActive = false;
    this.hud?.show();
    this.updateDayIndicator();
    this.engine?.start();
    this.lastTime = performance.now();
    interactionManager.setEnabled(!gameState.get('inDialog'));
    inputManager.requestPointerLockIfActivated();
    this.refreshPointerHint();
    this.syncHotbar();
    this.refreshKeyHints();
    // Petunjuk tombol tampil sekali di awal permainan (non-modal, menutup
    // diri begitu pemain menekan tombol apa saja).
    maybeShowControlsOnce();
  }

  /**
   * Isi hotbar (baris kotak item di bawah layar) = inventaris sekarang.
   * Dipanggil saat masuk permainan, tiap ganti scene (impor simpan tidak
   * mengeluarkan event), dan tiap barang baru masuk.
   */
  private syncHotbar(): void {
    this.hud?.setHotbar(gameState.get('inventory') ?? []);
  }

  private updateDayIndicator(): void {
    const chapter = chapterManager.getChapters().find(c => c.id === gameState.get('currentChapter'));
    if (!chapter) return;
    const titleKey = `${chapter.id}.title`;
    const babak = i18n.hasKey(titleKey) ? t(titleKey) : chapter.name;
    this.hud?.setDayIndicator(gameState.get('hari'), babak, gameState.get('pov').toUpperCase());
  }

  private updateGameSystems(deltaTime: number): void {
    if (this.gameState !== 'playing') return;

    this.recoverStuckControlGate(deltaTime);
    // Dihitung ulang tiap frame dari state yang selalu ada di sini, supaya
    // "kamera tidak bisa menoleh" tidak pernah bisa tersangkut sampai ada
    // perubahan state yang lupa memanggilnya (geser kunci Esc, tutup dialog,
    // lalu lanjut berjalan). Murah: ketiga pemeriksaannya bawa early-return.
    this.refreshPointerHint();

    const busy = this.overlayActive || gameState.get('inDialog');
    interactionManager.setEnabled(!busy);

    // Animasi pandangan (bangun, menghadap lawan bicara) maju tanpa syarat:
    // momen itu justru terjadi saat dialog mengunci WASD dan menoleh.
    this.fpsController?.updateView(deltaTime);

    if (!busy) {
      this.fpsController?.update(deltaTime);
      if (inputManager.isJustPressed('interact')) {
        void interactionManager.interact();
      }
      interactionManager.update();
      // Retikel harus bereaksi terhadap target: pemain melihat titik tengah
      // berubah ketika ada benda yang bisa dijangkau dengan tombol interaksi.
      this.hud?.setCrosshairTarget(interactionManager.getCurrentTarget() !== null);
    } else {
      this.hud?.setCrosshairTarget(false);
    }

    this.particles?.update(deltaTime);
    this.lighting?.update(deltaTime);
    tensionDirector.update(deltaTime);
    this.updatePropPulse();
    // Figur warga bernapas, mengayun lengan, dan sesekali menoleh: adegan
    // terasa berpenghuni tanpa gerakan kaku. Registri dibersihkan tiap
    // ganti scene oleh SceneFactory.build.
    updateFigures(performance.now() / 1000);
    // Tick dinamis scene: daun pintu yang berayun, awan yang melintas,
    // pohon yang menggoyang tajuk, burung yang menyeberang jendela.
    updateDynamics(performance.now() / 1000);
  }

  private isAnyScreenVisible(): boolean {
    return Array.from(document.querySelectorAll<HTMLElement>('.screen'))
      .some(el => el.getClientRects().length > 0);
  }

  /**
   * overlayActive/inDialog adalah satu-satunya yang menonaktifkan fpsController
   * (WASD, lari, dan menoleh). Kalau keduanya tersangkut true padahal tidak ada
   * layar sama sekali yang tampil, pemain terkunci di tempat tanpa tombol
   * apa pun yang bisa memulihkannya. Tidak ada layar + flag sibuk = pasti
   * nyangkut, jadi lepas otomatis setelah tenggang 1,5 detik.
   */
  /**
   * Kamera menghadap lawan bicara selama dialog. Speaker ≠ POV → putar
   * pandangan halus ke sumber dialog (benda yang barusan ditekan pemain:
   * pintu saat Raka mengetuk, meja saat mandor bicara). Speaker = POV atau
   * tanpa sumber → diam; pemain sudah menghadap benda yang diperiksa.
   */
  private faceSpeakerIfNeeded(data?: { speaker?: string }): void {
    const speaker = typeof data?.speaker === 'string' ? data.speaker.trim() : '';
    if (!speaker || !this.dialogFaceTarget) return;
    const pov = String(gameState.get('pov') ?? 'dimas').toLowerCase();
    if (speaker.toLowerCase() === pov) return;
    this.fpsController?.faceToward(this.dialogFaceTarget, 0.55);
  }

  private recoverStuckControlGate(deltaTime: number): void {
    const inDialog = gameState.get('inDialog');
    if (!this.overlayActive && !inDialog) {
      this.controlGateStuckTime = 0;
      this.controlGateWarned = false;
      return;
    }
    if (this.isAnyScreenVisible()) {
      this.controlGateStuckTime = 0;
      this.controlGateWarned = false;
      return;
    }

    this.controlGateStuckTime += deltaTime;
    if (!this.controlGateWarned && this.controlGateStuckTime > 1) {
      this.controlGateWarned = true;
      console.warn('[game] gerbang kontrol sibuk tanpa layar terbuka', {
        overlayActive: this.overlayActive,
        inDialog
      });
    }
    if (this.controlGateStuckTime < 1.5) return;

    console.warn('[game] gerbang kontrol dilepas otomatis: input pemain dikembalikan');
    this.overlayActive = false;
    if (gameState.get('inDialog')) {
      gameState.set('inDialog', false);
      gameState.set('currentDialog', null);
      eventBus.emit(GameEvents.DIALOG_END, {});
    }
    this.controlGateStuckTime = 0;
    this.controlGateWarned = false;
    this.hud?.show();
    interactionManager.setEnabled(true);
    this.refreshPointerHint();
  }

  private handleGlobalKeys(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.gameState === 'playing' && this.isModalOpen()
        && (this.puzzleScreen?.element.getClientRects().length ?? 0) > 0) {
        // Puzzle terbuka: Esc membatalkan (bukan pause, bukan skip): tutup
        // tanpa menyelesaikan, bisa dibuka ulang dari interaktif yang sama.
        eventBus.emit('puzzle:cancelled', {});
      } else if (this.gameState === 'playing' && !gameState.get('inDialog')) {
        this.pauseGame();
      } else if (this.gameState === 'paused') {
        this.resumeGame();
      }
    } else if (event.code === 'Backquote') {
      // Toggle manual kunci kursor (tombol `): pemain bisa membebaskan kursor
      // (memilih item hotbar lewat angka, menekan tombol UI) lalu mengunci
      // ulang tanpa keluar permainan. Berlaku juga saat dialog berjalan karena
      // semua kontrol dialog tetap bisa dipakai lewat keyboard.
      if (this.gameState === 'playing' && !this.overlayActive && !gameState.get('inPuzzle')) {
        event.preventDefault();
        if (inputManager.isPointerLocked()) inputManager.exitPointerLock();
        else inputManager.requestPointerLock();
        this.refreshPointerHint();
      }
    } else if (event.key === 'Tab') {
      event.preventDefault();
      if (this.gameState === 'playing' && !gameState.get('inDialog') && !this.isModalOpen()) {
        this.showJournal();
      }
    } else if (event.code === 'KeyQ') {
      if (this.gameState === 'playing' && !gameState.get('inDialog') && !this.isModalOpen()) {
        this.showPhone();
      }
    } else if (event.code === 'KeyF') {
      if (this.gameState === 'playing') {
        eventBus.emit('phone:flashlight', { on: !phoneManager.getFlashlightState().on });
      }
    } else if (event.code === 'KeyI') {
      event.preventDefault();
      // I membuka inventaris; tombol yang sama menutupnya kembali ke permainan.
      if (this.currentScreen === 'InventoryScreen' && this.overlayActive) {
        this.hideInventory();
      } else if (this.gameState === 'playing' && !gameState.get('inDialog') && !this.isModalOpen()) {
        this.showInventory();
      }
    } else if (event.code.startsWith('Digit')) {
      // Tombol angka 1-9: pilih slot hotbar dan tampilkan keterangan fungsi
      // item sebagai popup beberapa detik. Saat dialog berjalan, angka tetap
      // dipakai untuk memilih opsi (ditangani oleh dialog.ts).
      if (this.gameState === 'playing' && !gameState.get('inDialog') && !this.isModalOpen()) {
        const digit = parseInt(event.code.slice('Digit'.length), 10);
        if (digit >= 1 && digit <= 9) {
          event.preventDefault();
          this.hud?.selectHotbarSlot(digit - 1);
        }
      }
    }
  }

  private setFlashlight(on: boolean): void {
    if (this.flashlight) {
      this.flashlight.visible = on;
      this.flashlight.intensity = on ? 4.6 : 0;
    }
    const state = phoneManager.getFlashlightState();
    this.hud?.setFlashlightVisible(on, state.battery);
    if (on) {
      audioManager.playProcedural('static', { category: 'sfx', volume: 0.35 });
    }
  }

  /**
   * Layar modal (dialog, ringkasan hari, teka-teki) sedang menutup permainan.
   * Saat terbuka, Escape/tab jurnal tidak boleh membuka overlay lain:
   * showScreen() menyembunyikan layar aktif dan resumeGame() tidak
   * mengembalikannya: ringkasan hari kehilangan rantai bab berikutnya,
   * dan teka-teki yang sedang dikerjakan hilang begitu saja.
   */
  private isModalOpen(): boolean {
    const shown = (el?: HTMLElement | null) => !!el && el.getClientRects().length > 0;
    return shown(this.dialogScreen?.element)
      || shown(this.daySummary?.element)
      || shown(this.puzzleScreen?.element);
  }

  private pauseGame(): void {
    if (this.gameState !== 'playing') return;
    if (this.isModalOpen()) return;
    this.gameState = 'paused';
    this.engine?.stop();
    inputManager.exitPointerLock();
    interactionManager.setEnabled(false);
    this.hud?.setInteractionPrompt('', false);
    this.showScreen(this.pauseMenu!);
  }

  private resumeGame(): void {
    if (this.gameState !== 'paused') return;
    this.gameState = 'playing';
    this.hideAllScreens();
    this.overlayActive = false;
    this.hud?.show();
    this.engine?.start();
    this.lastTime = performance.now();
    inputManager.requestPointerLockIfActivated();
    this.refreshPointerHint();
  }

  private showJournal(): void {
    const screen = this.journalScreen;
    if (screen) {
      journalManager.getAllClues().forEach(clue => {
        screen.addClue(clue.id, clue.title, clue.description, clue.chapter);
      });
      screen.setNotes(journalManager.getNotes().map(note => note.text));
      // Tab "Misi": tujuan berjalan, langkah selesai, identitas bab/hari.
      // Tombol Tab selalu membuka tab ini lebih dulu supaya pemain langsung
      // melihat apa yang harus dikerjakan.
      const chapterId = gameState.get('currentChapter');
      const chapter = chapterManager.getChapters().find(c => c.id === chapterId);
      screen.setMissions({
        chapterTitle: chapter ? this.chapterDisplayTitle(chapter.id).title : '',
        hari: gameState.get('hari'),
        ...scriptRunner.getMissionLog()
      });
      this.showScreen(screen);
    }
  }

  private hideJournal(): void {
    this.returnFromOverlay();
  }

  private showInventory(): void {
    const screen = this.inventoryScreen;
    if (screen) {
      screen.setItems(gameState.get('inventory') ?? []);
      this.showScreen(screen);
    }
  }

  private hideInventory(): void {
    this.returnFromOverlay();
  }

  private showAchievementToast(id: string): void {
    const def = achievementManager.get(id);
    if (!def) return;
    const toast = document.createElement('div');
    toast.className = 'achievement-toast';
    toast.innerHTML = `
      <div class="achievement-toast-label">${t('ui.achievements')}</div>
      <div class="achievement-toast-name">${t(def.nameKey)}</div>
      <div class="achievement-toast-desc">${t(def.descKey)}</div>
    `;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 5000);
  }

  private showEvidenceBoard(): void {
    const clues = journalManager.getAllClues().map(c => c.id);
    this.evidenceBoard?.setClues(clues, id => journalManager.getClue(id)?.title || id);
    this.showScreen(this.evidenceBoard!);
  }

  /** Papan buka hanya kalau ada petunjuk: papan kosong membingungkan pemain. */
  private openEvidenceBoard(): void {
    if (journalManager.getAllClues().length === 0) {
      this.showToast(t('journal.evidenceBoard'), t('ui.boardEmpty'));
      return;
    }
    this.showEvidenceBoard();
  }

  private hideEvidenceBoard(): void {
    this.returnFromOverlay();
  }

  private submitEvidenceBoard(connections: Map<string, string[]>): void {
    let correct = 0;
    let placed = 0;
    connections.forEach((clueIds, category) => {
      clueIds.forEach(clueId => {
        placed++;
        if (journalManager.getClue(clueId)?.category === category) correct++;
      });
    });
    const total = journalManager.getAllClues().length;
    const complete = total > 0 && placed === total && correct === total;

    eventBus.emit('evidenceBoard:submit', { connections, correct, placed, total, complete });

    if (total > 0) {
      const message = complete
        ? t('ui.boardComplete')
        : t('ui.boardProgress', { correct, total });
      this.showToast(t('journal.evidenceBoard'), message, complete ? 5000 : 4000);
    }
    this.returnFromOverlay();
  }

  private showPhone(): void {
    this.showScreen(this.phoneScreen!);
  }

  private hidePhone(): void {
    this.returnFromOverlay();
  }

  private hideDialog(): void {
    this.returnFromOverlay();
  }

  private showDaySummary(): void {
    const data = {
      hari: gameState.get('hari'),
      cluesFound: journalManager.getInvestigasiPoints(),
      cluesTotal: journalManager.getPointsTotal(),
      cluesMissed: journalManager.getUndiscoveredClues().map(id => journalManager.getClueTitle(id)),
      importantNotes: journalManager.getNotes().slice(-3).map(n => n.text)
    };
    this.daySummary?.setData(data);
    this.showScreen(this.daySummary!);
  }

  private hideDaySummary(): void {
    this.nextChapter();
  }

  private async nextChapter(): Promise<void> {
    const target = this.nextChapterId;
    this.nextChapterId = null;
    if (target) {
      await this.startChapter(target);
      return;
    }
    // The day summary is only ever opened with a pending target chapter. If it is
    // missing the state was reset underneath us (load / chapter select / reload),
    // so fall back to playing instead of forcing an ending on the player.
    console.warn('[game] day summary closed without a pending chapter: resuming play');
    if (this.gameState === 'playing') this.startPlaying();
  }

  private showChapterSelect(): void {
    this.chapterSelect?.setChapters(chapterManager.getChapterSelectData());
    this.showScreen(this.chapterSelect!);
  }

  private hideChapterSelect(): void {
    this.showMainMenu();
  }

  private async selectChapter(chapterId: string): Promise<void> {
    // Redup dulu: memilih bab dari layar menu memotong langsung ke dunia 3D,
    // dan kalau bab ini mulai segar rangkaian `onSpawn` (pose merebah di
    // kasur) harus terjadi di balik layar hitam: bukan sebagai loncatan
    // kamera yang terekspos pemain.
    await TransitionLayer.fadeOut(450);
    await chapterManager.selectChapter(chapterId);
    if (gameState.get('currentChapter') !== chapterId) {
      console.error('[game] gagal memuat bab', chapterId, '- kembali ke menu');
      await TransitionLayer.fadeIn(600);
      this.showMainMenu();
      return;
    }
    this.startPlaying();
    void scriptRunner.runPendingSpawnOps();
    await TransitionLayer.fadeIn(800);
  }

  private startPuzzle(puzzleId: string, config: any): void {
    if (!config || typeof config !== 'object') return;

    const cfg: any = { ...config, id: puzzleId, onSkip: () => {}, onSolve: () => {}, onHelp: () => {} };
    if (config.data && typeof config.data === 'object') {
      // translate on a copy so replaying the same puzzle never double translates
      cfg.data = JSON.parse(JSON.stringify(config.data));
    }
    const runOps = (ops: any): void => {
      if (Array.isArray(ops)) void scriptRunner.executeOperations(ops);
    };
    const originalSolve = config.onSolve;
    const originalSkip = config.onSkip;
    const originalHelp = config.onHelp;

    cfg.onSolve = (result: any) => {
      runOps(originalSolve);
      achievementManager.markPuzzleSolved(puzzleId);
      eventBus.emit('puzzle:solved', { id: puzzleId, result });
      this.returnFromOverlay();
    };
    cfg.onSkip = () => {
      runOps(originalSkip);
      achievementManager.markPuzzleSkipped(puzzleId);
      // "Lewati" menyelesaikan puzzle lewat jalur onSkip: kabarkan juga
      // supaya efek samping yang mendengar `puzzle:solved` (laci meluncur
      // terbuka) tetap jalan: prestasi tetap tercatat sebagai dilewati.
      eventBus.emit('puzzle:solved', { id: puzzleId, skipped: true });
      this.returnFromOverlay();
    };
    cfg.onHelp = () => runOps(originalHelp);

    if (typeof cfg.title === 'string') cfg.title = t(cfg.title);
    if (typeof cfg.description === 'string') cfg.description = t(cfg.description);
    if (cfg.data && Array.isArray(cfg.data.hints)) {
      cfg.data.hints = cfg.data.hints.map((h: any) => t(String(h)));
    }
    this.translatePuzzleData(cfg);

    // Tampilkan layarnya DULU, baru mulai puzzle. Urutan terbalik membuat
    // showScreen() -> hideAllScreens() -> puzzle.hide() -> stopTimer()
    // mematikan timer teka-teki, hitung mundur bantuan, dan interval cincin
    // tepat setelah dijalankan: puzzle terlihat jalan tapi diam/terkunci.
    // Puzzle adalah layar kursor: lepas kunci kursor supaya pemain bisa
    // menggerakkan mouse ke tombol dan potongan puzzle.
    inputManager.exitPointerLock();
    this.showScreen(this.puzzleScreen!);
    this.puzzleScreen?.startPuzzle(cfg);
    const hints = cfg.data && Array.isArray(cfg.data.hints) ? cfg.data.hints : [];
    if (hints.length) this.puzzleScreen?.setHelpText(hints.map((h: any) => String(h)).join('\n'));
  }

  private translatePuzzleData(config: any): void {
    const data = config?.data;
    if (!data) return;
    const tr = (value: any): any => (typeof value === 'string' && i18n.hasKey(value) ? t(value) : value);

    if (Array.isArray(data.dates)) {
      data.dates.forEach((date: any) => {
        if (date) date.month = tr(date.month);
      });
    }
    if (Array.isArray(data.events)) {
      data.events.forEach((event: any) => {
        if (!event) return;
        event.title = tr(event.title);
        event.description = tr(event.description);
      });
    }
    if (Array.isArray(data.clues)) {
      data.clues.forEach((clue: any) => {
        if (clue && clue.id) clue.name = journalManager.getClueTitle(clue.id) || clue.name;
      });
    }
    if (Array.isArray(data.categories)) {
      data.categories.forEach((category: any) => {
        if (!category) return;
        const key = `journal.categories.${category.id}`;
        category.name = i18n.hasKey(key) ? t(key) : tr(category.name);
      });
    }
    if (Array.isArray(data.landmarks)) {
      data.landmarks.forEach((landmark: any) => {
        if (landmark) landmark.name = tr(landmark.name);
      });
    }
    if (Array.isArray(data.instructions)) {
      data.instructions = data.instructions.map((step: any) => tr(String(step)));
    }
  }

  private showEnding(ending: any): void {
    if (this.gameState === 'ending') return;
    const id = typeof ending === 'string' ? ending : ending?.id;
    if (!id) return;

    const view = typeof ending === 'string'
      ? endingManager.getEnding(ending)
      : ending;
    if (!view) return;

    const isNew = !gameState.hasEnding(id);
    gameState.unlockEnding(id);

    this.gameState = 'ending';
    this.engine?.stop();
    inputManager.exitPointerLock();
    interactionManager.setEnabled(false);
    this.hideAllScreens();
    audioManager.stopAll();

    this.endingScreen?.setEnding(view as any, isNew);
    this.endingScreen?.show();
    this.refreshPointerHint();
  }

  private completeChapter(chapterId: string): void {
    if (this.gameState !== 'playing') return;

    const chapters = chapterManager.getChapters();
    const index = chapters.findIndex(c => c.id === chapterId);
    if (index < 0) {
      this.evaluateEnding();
      return;
    }

    const current = chapters[index];
    // Bab linear berikutnya: bab cabang (branch) dilewati supaya bab terakhir
    // tidak salah lanjut ke bab cabang yang justru mengakhiri cerita.
    const next = chapterManager.getNextChapterAfter(chapterId);
    this.nextChapterId = next ? next.id : null;

    // Kartu "Babak Selesai" + fade: penyelesaian scene harus terbaca jelas
    // sebagai satu babak yang tuntas, bukan potongan alur yang mendadak
    // berpindah tempat.
    void this.announceChapterComplete(current, next);
  }

  private async announceChapterComplete(
    current: { id: string; name: string; hari: number },
    next: { id: string; name: string; hari: number } | undefined
  ): Promise<void> {
    const { title } = this.chapterDisplayTitle(current.id);
    const nextDisplay = next ? this.chapterDisplayTitle(next.id).title : undefined;

    await TransitionLayer.fadeOut(500);
    await TransitionLayer.showChapterCard({
      kicker: t('ui.chapterComplete'),
      title,
      subtitle: nextDisplay ? `${t('ui.nextChapter')}: ${nextDisplay}` : `${t('ui.day')} ${current.hari}`,
      holdMs: 2400
    });

    // Kartu intro bab berikutnya tidak diulang: pemain baru saja membaca
    // kartu penyelesaian yang sudah menyebutkan judul bab berikutnya.
    this.skipChapterIntroCard = true;

    if (next && next.hari !== current.hari) {
      await TransitionLayer.fadeIn(700);
      this.showDaySummary();
    } else if (next) {
      this.nextChapterId = null;
      await this.startChapter(next.id);
    } else {
      this.nextChapterId = null;
      // Layar diredupkan dulu oleh kartu; angkat sebelum layar ending supaya
      // tidak ada layar hitam yang tertinggal menutupi penutup cerita.
      await TransitionLayer.fadeIn(700);
      this.evaluateEnding();
    }
  }

  private evaluateEnding(): void {
    const ending = endingManager.evaluateEnding();
    this.showEnding(ending ?? endingManager.getEnding('ending_8') ?? { id: 'ending_8' });
  }

  private buildSceneForCurrentChapter(): void {
    if (!this.engine) return;

    const sceneId = gameState.get('location')?.sceneId || 'rumah_dimas';

    if (this.builtScene) {
      this.engine.scene.remove(this.builtScene.group);
      this.disposeObject(this.builtScene.group);
      this.builtScene = null;
      this.propMeshes = [];
    }

    const built = sceneFactory.build(sceneId);
    this.engine.scene.add(built.group);
    this.builtScene = built;

    this.fpsController?.setCollisionObjects(built.colliders);
    interactionManager.setWorldObjects(built.colliders);
    this.registerInteractables(built);

    const location = gameState.get('location');
    const pos = location?.pos ?? [0, 0, 0];
    this.fpsController?.teleport(
      new THREE.Vector3(pos[0], pos[1] ?? 0, pos[2]),
      location?.yaw ?? 0
    );

    const lighting = this.currentLighting();
    this.lighting?.applyPreset(lighting.preset, lighting.transition);
    this.maybeDarkHint(lighting.preset);
    this.setupSceneParticles(sceneId);
  }

  /**
   * Sinkronkan visual laci ruang tengah dengan keadaan naskah bab.
   *
   * `chestOfDrawers` dibangun selalu tertutup (state modul direset tiap
   * scene), jadi bab yang sudah mengambil isinya perlu diset terbuka tanpa
   * animasi di sini. Senter hanya tampil di bak laci b01 yang belum diambil -
   * bab lain dan b04 (isi laci = kwitansi) memakai laci polos.
   */
  private syncDrawerState(): void {
    const chapter = gameState.get('currentChapter');
    if (chapter === 'b01') {
      const looted = gameState.getFlag('b01_senter') || gameState.hasInventory('senter');
      setDrawerOpen(looted, true);
      setDrawerSenterVisible(!looted);
    } else if (chapter === 'b04') {
      setDrawerOpen(gameState.get('clues').includes('c1'), true);
      setDrawerSenterVisible(false);
    } else {
      setDrawerOpen(false, true);
      setDrawerSenterVisible(false);
    }
  }

  /**
   * Buka pintu scene yang berdekatan dengan interaktif naskah yang baru
   * dipakai. Titiknya diambil dari penanda interaktif (bila ada) atau anchor
   * scene; semua pintu dalam jarak 3 m ikut terbuka. Pintu keluar tidak punya
   * interaktif sendiri (naskah bab yang menguasainya), jadi inilah satu-satunya
   * cara daun pintu ikut berayun saat pemain menekan E untuk keluar.
   */
  private openDoorForUse(id: string): void {
    const built = this.builtScene;
    if (!built || !built.doors.length) return;
    let at: THREE.Vector3 | null = null;
    const marker = this.propMeshes.find(m => m.userData.interactableId === id);
    if (marker) {
      at = marker.getWorldPosition(new THREE.Vector3());
    } else {
      const a = built.anchors[id];
      if (a) at = new THREE.Vector3(a[0], a[1], a[2]);
    }
    if (!at) return;
    // Rumah kini punya dua pintu kamar yang berjarak hanya 2,8 m, jadi
    // membuka "semua pintu dalam 3 m" akan ikut mengayun pintu sebelahnya.
    // Cukup pintu terdekat saja yang dibuka: benang tanpa efek samping.
    let best: { door: (typeof built.doors)[number]; dist: number } | null = null;
    for (const door of built.doors) {
      // Pintu depan adalah properti tetap rumah: daunnya tidak pernah dibuka
      // atau ditutup oleh logika buka-tutup pintu umum (baik pemain keluar
      // maupun interaktif lain terpakai di dekatnya). Hanya pintu dalam yang
      // bisa dimainkan (pintu kamar) yang ikut bergerak.
      if (door.id === 'pintu_depan') continue;
      const dist = door.center.distanceTo(at);
      if (dist < 3 && (!best || dist < best.dist)) best = { door, dist };
    }
    best?.door.open();
  }

  /**
   * Partikel per scene. Sistem partikel selama ini dibuat sekali lalu tidak
   * pernah dipakai sama sekali: udara berdebu, kabut rendah, dan bara api
   * kini hidup mengikuti tempatnya, dan dibersihkan saat pindah scene supaya
   * tidak menumpuk.
   */
  private setupSceneParticles(sceneId: string): void {
    const particles = this.particles;
    if (!particles) return;
    particles.dispose();

    const box = (min: number[], max: number[]): THREE.Box3 => new THREE.Box3(
      new THREE.Vector3(min[0], min[1], min[2]),
      new THREE.Vector3(max[0], max[1], max[2])
    );

    switch (sceneId) {
      case 'rumah_dimas':
        particles.createParticleSystem('dust', {
          count: 90, size: 0.035, color: 0xd8cbb4, opacity: 0.35,
          sizeAttenuation: true,
          position: new THREE.Vector3(0, 1.4, 0),
          spread: new THREE.Vector3(16, 2.6, 16),
          velocity: new THREE.Vector3(0.012, 0.008, 0.01),
          lifetime: 14, loop: true
        });
        break;

      case 'hutan_kecil':
      case 'tepi_hutan':
      case 'hutan_berputar':
        particles.createFogParticles('ground-mist', {
          // Kabut malam harus lebih gelap dari tanahnya, bukan putih menyala:
          // warna terang pada material tak-terang cahaya menumpuk menjadi
          // kubah-kubah terang saat partikel bertumpuk.
          count: 170, color: 0x4a565e, opacity: 0.22,
          area: box([-40, 0.15, -40], [40, 1.0, 40]),
          density: 0.4, height: 1.0, size: 1.5
        });
        particles.createParticleSystem('spores', {
          count: 70, size: 0.05, color: 0xcfe0c8, opacity: 0.4,
          sizeAttenuation: true,
          position: new THREE.Vector3(0, 1.6, 0),
          spread: new THREE.Vector3(34, 3, 34),
          velocity: new THREE.Vector3(0.02, 0.014, 0.015),
          lifetime: 18, loop: true
        });
        break;

      case 'hutan_api':
        particles.createEmberParticles('embers', {
          count: 260,
          position: new THREE.Vector3(0, 0.4, 0),
          spread: 46, height: 9,
          color1: new THREE.Color(0xffb257),
          color2: new THREE.Color(0xa8321a)
        });
        particles.createFogParticles('smoke', {
          count: 160, color: 0x4a423d, opacity: 0.5,
          area: box([-34, 0.2, -34], [34, 7, 34]),
          density: 0.7, height: 7
        });
        break;

      case 'jalan_desa':
      case 'ladang_joy':
      case 'ladang_joy_pondok':
        particles.createParticleSystem('pollen', {
          count: 110, size: 0.04, color: 0xe8dcae, opacity: 0.45,
          sizeAttenuation: true,
          position: new THREE.Vector3(0, 1.5, 0),
          spread: new THREE.Vector3(44, 3, 44),
          velocity: new THREE.Vector3(0.03, 0.01, 0.02),
          lifetime: 16, loop: true
        });
        break;

      case 'pasar':
      case 'terminal':
      case 'proyek':
        particles.createParticleSystem('dust-out', {
          count: 120, size: 0.045, color: 0xc9bda6, opacity: 0.3,
          sizeAttenuation: true,
          position: new THREE.Vector3(0, 1.2, 0),
          spread: new THREE.Vector3(48, 2.4, 48),
          velocity: new THREE.Vector3(0.025, 0.012, 0.02),
          lifetime: 15, loop: true
        });
        break;

      case 'mimpi':
        particles.createFogParticles('dream-mist', {
          count: 260, color: 0x7b6f8f, opacity: 0.45,
          area: box([-30, 0.1, -30], [30, 5, 30]),
          density: 0.6, height: 5
        });
        break;

      default:
        // Ruang dalam (kedai, warung, balai, gubuk, bus, penjara): debu
        // tipis supaya udaranya terasa berat tanpa menutupi properti.
        particles.createParticleSystem('dust', {
          count: 70, size: 0.03, color: 0xd8cbb4, opacity: 0.28,
          sizeAttenuation: true,
          position: new THREE.Vector3(0, 1.5, 0),
          spread: new THREE.Vector3(14, 2.4, 14),
          velocity: new THREE.Vector3(0.01, 0.007, 0.008),
          lifetime: 14, loop: true
        });
        break;
    }

    // Lapisan cuaca luar ruang menyesuaikan babak: awal cerah berdebu,
    // pertengahan hujan, akhir berkabut tebal. Forest tetap berkabut.
    this.applySceneWeather(particles, sceneId);
  }

  /**
   * Cuaca luar ruang yang menyesuaikan vibes babak. Peta cuaca ringkas:
   * bab awal (b01-b04) cerah/berdebu, pertengahan (b05-b08) hujan, dan bab
   * akhir (b09+) berkabut tebal yang menekan jarak pandang. Hutan tetap
   * berkabut sejak awal karena memang tempat angker. Semua partikel jatuh
   * lurus dan terus-menerus sehingga tidak mengganggu pergerakan pemain.
   */
  private applySceneWeather(particles: ParticleSystem, sceneId: string): void {
    const outdoor = [
      'jalan_desa', 'ladang_joy', 'ladang_joy_pondok', 'pasar', 'terminal', 'proyek',
      'hutan_kecil', 'tepi_hutan', 'hutan_berputar'
    ];
    if (!outdoor.includes(sceneId)) return;

    const chapterId = gameState.get('currentChapter') ?? '';
    const num = parseInt(chapterId.replace('b', ''), 10) || 1;
    const isForest = sceneId.startsWith('hutan') || sceneId === 'tepi_hutan';

    const box = (min: number[], max: number[]): THREE.Box3 => new THREE.Box3(
      new THREE.Vector3(min[0], min[1], min[2]),
      new THREE.Vector3(max[0], max[1], max[2])
    );
    const area = box([-45, 0, -45], [45, 22, 45]);

    // Peta vibes: hutan selalu berkabut; lahan terbuka bab awal cerah,
    // pertengahan hujan, akhir kabut. Kabut di sini memakai butir dingin
    // bergerak pelan, bukan layar penuh, supaya jarak pandang tetap jelas.
    if (isForest || num >= 9) {
      particles.createFogParticles('weather-mist', {
        count: 150, color: 0x53606a, opacity: 0.2,
        area: box([-40, 0.2, -40], [40, 2.2, 40]),
        density: 0.35, height: 2.2, size: 1.8
      });
    }
    if (num >= 5 && num < 9) {
      particles.createRain('weather-rain', {
        // Butir 0.16 dengan opacity 0.55: hujan sempat terlalu samar di
        // scene malam (0.11/0.42 nyaris tak terbaca di layar gelap).
        count: 420, area, color: 0xa8c4dd, speed: 11, size: 0.16, opacity: 0.55
      });
    }
  }

  /**
   * Ambil preset pencahayaan dari naskah bab, lengkap dengan durasi
   * transisinya. Sebelumnya `transition` dibuang sehingga semua perpindahan
   * terjadi mendadak meski naskah minta perlahan 2–3 detik.
   */
  private currentLighting(): { preset: string; transition: number } {
    const script = scriptRunner.getCurrentScript();
    // Tempat dalam satu bab boleh membawa preset sendiri (ruang mimpi b14
    // memakai `mimpi`, bukan `teror` kamar). SCENE_LOAD_COMPLETE membangun
    // ulang scene setelah naskah berjalan: termasuk saat save dipuat ulang -
    // jadi sumber kebenaran pencahayaan harus memperhitungkan lokasi ini,
    // bukan hanya setLighting onEnter bab.
    const sceneId = gameState.get('location')?.sceneId;
    const sceneEntry = sceneId ? script?.scenes?.[sceneId] : undefined;
    if (sceneEntry && typeof sceneEntry.lighting === 'string') {
      return { preset: sceneEntry.lighting, transition: 1 };
    }
    const op = script?.onEnter?.find(o => o.op === 'setLighting');
    const preset = (op && typeof op.preset === 'string') ? op.preset : 'pagi_desa';
    const transition = (op && typeof op.transition === 'number') ? op.transition : 0;
    return { preset, transition };
  }

  private currentLightingPreset(): string {
    return this.currentLighting().preset;
  }

  private registerInteractables(built: BuiltScene): void {
    const script = scriptRunner.getCurrentScript();
    if (!script) return;

    interactionManager.clear();
    this.propMeshes = [];

    built.group.updateMatrixWorld(true);

    const occluders = built.colliders;
    const boxes = occluders
      .map(c => new THREE.Box3().setFromObject(c))
      .filter(b => Number.isFinite(b.min.x) && Number.isFinite(b.max.x));
    const spawn = gameState.get('location')?.pos ?? [0, 0, 0];
    const eye = new THREE.Vector3(spawn[0] ?? 0, (spawn[1] ?? 0) + 1.5, spawn[2] ?? 0);

    // Satu bab bisa punya banyak tempat (rumah, proyek, pasar). Hanya
    // interaktif milik lokasi sekarang yang didaftarkan; sisanya menunggu
    // sampai pemain gotoScene ke tempatnya. Interaktif tanpa `scene` berarti
    // milik scene awal bab.
    const homeScene = script.scene;
    const currentScene = gameState.get('location')?.sceneId ?? homeScene;
    const visible = script.interactables.filter(inter => {
      if ((inter.scene ?? homeScene) !== currentScene) return false;
      if (!inter.condition) return true;
      return scriptRunner.evaluateConditionPublic(inter.condition);
    });

    visible.forEach((inter, index) => {
      // Scene builder menanamkan anchors tepat di atas prop aslinya (kursi,
      // meja, pintu). Anchor diprioritaskan karena sudah pasti bebas hambatan;
      // posisi dari naskah tetap jadi fallback untuk babak lama.
      const authored = inter.position ?? this.defaultSlot(index, visible.length);
      const anchorPos = built.anchors[inter.id];
      const desired = anchorPos ?? authored;
      const pos = anchorPos
        ? this.sanitizeAnchor(anchorPos, PROP_HALF, boxes, occluders, eye)
        : this.resolvePropPosition(authored, PROP_HALF, boxes, occluders, eye);
      const role = inter.role === 'flavor' && !inter.goalFor ? 'flavor' : 'goal';
      // `goalFor` = tujuan dinamis: penanda ini hanya menyala selama objektif
      // sedang berlaku cocok dengan daftarnya, dan labelnya selalu berisi
      // teks objektif tersebut. Tanpa itu, tujuan/flavor bersifat statis.
      const goalFor = Array.isArray(inter.goalFor) ? inter.goalFor
        : typeof inter.goalFor === 'string' ? [inter.goalFor]
        : null;
      const dynamicLabel = !!goalFor && !inter.label;
      const labelKey = dynamicLabel
        ? (scriptRunner.getObjective().text || undefined)
        : inter.label;
      const mesh = this.createPropMesh(index, pos, role, labelKey, dynamicLabel);
      mesh.userData.interactableId = inter.id;
      mesh.userData.goalFor = goalFor;
      mesh.userData.staticGoal = role === 'goal';
      // Belum disinkronkan: frame pertama updatePropPulse akan menerapkan
      // gaya (warna + label) sesuai status tujuan yang sebenarnya.
      mesh.userData.goalActive = null;
      built.group.add(mesh);
      mesh.updateMatrixWorld(true);
      this.propMeshes.push(mesh);

      interactionManager.registerInteractable({
        id: inter.id,
        mesh,
        prompt: typeof inter.prompt === 'string' && inter.prompt ? inter.prompt : 'ui.interact',
        distance: 3.5,
        once: inter.once,
        goal: () => this.isMarkerGoal(mesh),
        onInteract: async () => {
          // Sumber dialog untuk kamera menghadap lawan bicara.
          this.dialogFaceTarget = mesh.getWorldPosition(new THREE.Vector3());
          scriptRunner.handleInteractableUse(inter.id);
          if (inter.once) {
            this.unregisterPropMesh(mesh);
          }
        }
      });

      // Barang yang sudah diambil pemain (impor simpanan / pulang dari scene
      // lain) tidak boleh muncul lagi: prop-nya disembunyikan tanpa animasi dan
      // penandanya padam. Interaktifnya tetap terdaftar: dialog periksa ulang
      // ("sudah kubawa") masih bisa dipanggil dengan mengarah ke titik itu.
      for (const loot of this.collectGiveItems(inter.onUse)) {
        if (gameState.hasInventory(loot)) this.hideLootedProp(loot, false);
      }
    });

    // Pintu milik scene (mis. pintu kamar yang menutup celah partisi) ikut
    // didaftarkan sebagai interaktif E: asalkan naskah belum memakai id itu.
    // Prompt mengikuti state: Buka saat tertutup, Tutup saat terbuka.
    for (const door of built.doors) {
      if (!door.interactive || interactionManager.getInteractable(door.id)) continue;
      interactionManager.registerInteractable({
        id: door.id,
        mesh: door.target,
        prompt: door.isOpen() ? 'ui.close' : 'ui.open',
        distance: 2.6,
        goal: false,
        onInteract: () => {
          door.toggle();
          const registered = interactionManager.getInteractable(door.id);
          if (registered) registered.prompt = door.isOpen() ? 'ui.close' : 'ui.open';
        }
      });
    }
  }

  private unregisterPropMesh(mesh: THREE.Object3D): void {
    mesh.removeFromParent();
    this.propMeshes = this.propMeshes.filter(m => m !== mesh);
  }

  /**
   * Semua id barang yang bisa diberikan oleh rantai operasi `onUse` interaktif
   * (termasuk cabang if/then/else). Pemindaian berhenti di sini: jalur yang
   * melewati dialog/puzzle sengaja tidak diikuti supaya wadah seperti laci
   * tidak ikut "terambil" bersama isinya.
   */
  private collectGiveItems(ops: any[] | undefined, out: Set<string> = new Set()): Set<string> {
    if (!Array.isArray(ops)) return out;
    for (const op of ops) {
      if (!op || typeof op !== 'object') continue;
      if (op.op === 'giveItem' && typeof op.id === 'string') out.add(op.id);
      else if (op.op === 'if') {
        this.collectGiveItems(op.then, out);
        this.collectGiveItems(op.else, out);
      }
    }
    return out;
  }

  /**
   * Cari interaktif yang memberikan `itemId` lewat onUse langsungnya, untuk
   * memetakan barang ke prop dunia 3D-nya. Wadah (kotak sekring menyimpan
   * kunci, kompor menghidangkan nasi, laci berisi segalanya) masuk daftar
   * pengecualian: yang hilang hanya isinya, bukan bendanya sendiri.
   */
  private findLootSource(itemId: string): string | null {
    const script = scriptRunner.getCurrentScript();
    if (!script) return null;
    const CONTAINERS = new Set(['kotak_sekring', 'kompor', 'laci']);
    for (const inter of script.interactables as any[]) {
      if (!this.collectGiveItems(inter.onUse).has(itemId)) continue;
      if (inter.id === itemId) return inter.id;
      if (CONTAINERS.has(inter.id)) return null;
      return inter.id;
    }
    return null;
  }

  /**
   * Prop kecil yang berada tepat di sekitar anchor interaktif: benda yang
   * diberikan selalu digambar pembuat scene di bawah/near titik jangkarnya.
   * Ukuran dibatasi agar dinding, meja, dan perabot besar tidak pernah ikut;
   * penanda interaksi (ring/marker) dikecualikan lewat silsilah `userData`.
   */
  private collectPickupMeshes(built: BuiltScene, anchorId: string): THREE.Object3D[] {
    const a = built.anchors[anchorId];
    if (!a) return [];
    built.group.updateMatrixWorld(true);
    const target = new THREE.Vector3(a[0], a[1], a[2]);
    const tmp = new THREE.Vector3();
    const out: THREE.Object3D[] = [];
    built.group.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.userData.noPickupHide) return;
      for (let p: THREE.Object3D | null = mesh; p; p = p.parent) {
        if (p.userData.interactableId) return; // penanda, bukan prop
      }
      const geo = mesh.geometry;
      if (!geo) return;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const scale = Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z);
      if ((geo.boundingSphere?.radius ?? 99) * scale > 0.45) return;
      mesh.getWorldPosition(tmp);
      if (tmp.distanceTo(target) > 0.55) return;
      out.push(mesh);
    });
    return out;
  }

  /**
   * Sembunyikan prop dunia 3D milik `itemId` dan padamkan penandanya.
   * `animate=true` (pemain baru mengambil) memakai animasi mengecil-terangkat;
   * `animate=false` (sinkronisasi awal scene) langsung hilang tanpa animasi.
   * Interaktifnya TIDAK di-unregister: dialog periksa ulang tetap hidup, hanya
   * visualnya yang kosong.
   */
  private hideLootedProp(itemId: string, animate: boolean): void {
    const built = this.builtScene;
    if (!built) return;
    const sourceId = this.findLootSource(itemId);
    if (!sourceId) return;
    const marker = this.propMeshes.find(m => m.userData.interactableId === sourceId);
    if (marker?.userData.looted) return; // sudah disembunyikan
    if (marker) marker.userData.looted = true;
    const meshes = this.collectPickupMeshes(built, sourceId);
    if (!meshes.length) return;
    if (animate) animatePickup(meshes);
    else hidePickupInstantly(meshes);
  }

  /**
   * Anchor dari scene builder dipercaya apa adanya, tapi tetap diperiksa:
   * kalau titiknya justru berada di dalam benda padat (misal anchor terlalu
   * dekat ke dinding), naikkan ke permukaan teratas agar penanda tidak
   * tenggelam di dalam model.
   */
  private sanitizeAnchor(
    anchorPos: [number, number, number],
    half: number,
    boxes: THREE.Box3[],
    occluders: THREE.Object3D[],
    eye: THREE.Vector3
  ): [number, number, number] {
    let [x, y, z] = anchorPos;
    // Uji dengan titik tengah saja. Dulu kotak penanda (±half) dipakai untuk
    // uji, akibatnya penanda yang cuma berdekatan dengan dinding: bukan
    // berada di dalamnya: ikut terangkat sampai plafon.
    const point = new THREE.Vector3();
    const inside = (): THREE.Box3[] => {
      point.set(x, y, z);
      return boxes.filter(box => box.containsPoint(point));
    };
    for (let i = 0; i < 3; i++) {
      const hits = inside();
      if (!hits.length) break;
      y = Math.max(...hits.map(b => b.max.y)) + half;
    }
    if (y > 3.2) {
      const moved = this.resolvePropPosition([x, y, z], half, boxes, occluders, eye);
      return moved;
    }
    return [x, y, z];
  }

  /**
   * Posisi authored untuk hotspot sering menabrak dinding, tertimbun di
   * lantai, atau berada di belakang tembok sehingga tidak bisa dijangkau.
   * Fungsi ini menaruh prop di permukaan terdekat yang bebas hambatan dan
   * masih terlihat dari titik spawn pemain.
   */
  private resolvePropPosition(
    desired: [number, number, number],
    half: number,
    boxes: THREE.Box3[],
    occluders: THREE.Object3D[],
    eye: THREE.Vector3
  ): [number, number, number] {
    const REACH = 2.1;
    const dx = desired[0] ?? 0;
    const dy = desired[1] ?? 0;
    const dz = desired[2] ?? 0;

    const propBox = (x: number, y: number, z: number): THREE.Box3 => new THREE.Box3(
      new THREE.Vector3(x - half, y - half, z - half),
      new THREE.Vector3(x + half, y + half, z + half)
    );

    const clearLineOfSight = (x: number, y: number, z: number): boolean => {
      if (!occluders.length) return true;
      const target = new THREE.Vector3(x, y + 0.1, z);
      const dir = target.clone().sub(eye);
      const distance = dir.length();
      if (distance < 0.05) return true;
      dir.divideScalar(distance);
      this.propRaycaster.set(eye, dir);
      this.propRaycaster.near = 0;
      this.propRaycaster.far = Math.max(0.05, distance - 0.3);
      return this.propRaycaster.intersectObjects(occluders, false).length === 0;
    };

    const placeAt = (x: number, z: number, y0: number): [number, number, number] | null => {
      let y = Math.max(y0, half);
      for (let i = 0; i < 4; i++) {
        const hits = boxes.filter(b => b.intersectsBox(propBox(x, y, z)));
        if (!hits.length) break;
        const top = Math.max(...hits.map(b => b.max.y));
        const nextY = Math.max(top + half, y + 0.05);
        if (nextY > REACH) return null; // menabrak benda tinggi/tembok
        y = nextY;
      }
      if (boxes.some(b => b.intersectsBox(propBox(x, y, z)))) return null;
      if (y > REACH || y < half * 0.5) return null;
      if (!clearLineOfSight(x, y, z)) return null;
      return [x, y, z];
    };

    const direct = placeAt(dx, dz, dy);
    if (direct) return direct;

    // Mundur ke arah pemain sampai bebas hambatan. Ini menolong posisi yang
    // tertutup dinding atau berada di belakang tembok (misalnya pintu keluar)
    // agar tetap muncul di ruangan dan bisa dilihat pemain.
    const toEyeX = eye.x - dx;
    const toEyeZ = eye.z - dz;
    const toEyeLength = Math.hypot(toEyeX, toEyeZ);
    if (toEyeLength > 0.5) {
      const stepX = (toEyeX / toEyeLength) * 0.15;
      const stepZ = (toEyeZ / toEyeLength) * 0.15;
      const maxSteps = Math.min(Math.floor((toEyeLength - 0.8) / 0.15), 32);
      let x = dx;
      let z = dz;
      for (let i = 0; i < maxSteps; i++) {
        x += stepX;
        z += stepZ;
        const placed = placeAt(x, z, dy);
        if (placed) return placed;
      }
    }

    // Cari posisi terdekat yang bebas, berputar dari posisi yang diinginkan.
    for (let r = 0.4; r <= 3.001; r += 0.4) {
      const steps = Math.max(12, Math.round(r * 16));
      let best: [number, number, number] | null = null;
      let bestDistance = Infinity;
      for (let s = 0; s < steps; s++) {
        const angle = (s / steps) * Math.PI * 2;
        const x = dx + Math.cos(angle) * r;
        const z = dz + Math.sin(angle) * r;
        const placed = placeAt(x, z, dy);
        if (!placed) continue;
        const d = (x - dx) * (x - dx) + (z - dz) * (z - dz);
        if (d < bestDistance) {
          bestDistance = d;
          best = placed;
        }
      }
      if (best) return best;
    }

    // Posisi terakhir: minimal tidak tertimbun di bawah lantai.
    return [dx, Math.max(dy, half), dz];
  }

  private defaultSlot(index: number, total: number): [number, number, number] {
    const spread = Math.min(0.55, 2.6 / Math.max(total, 1));
    const angle = -Math.PI / 2 + (index - (total - 1) / 2) * spread;
    const radius = 2.6;
    return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
  }

  /**
   * Penanda interaktif.
   *
   * - `goal` (tujuan cerita): cincin emas besar, denyut terang, opsional
   *   label mengambang berisi teks objektif supaya pemain tahu harus ke mana.
   * - `flavor` (interaksi biasa): cincin kecil, warna dingin, redup: hanya
   *   terlihat saat didekati (lihat updatePropPulse), sehingga ruangan tidak
   *   dipenuhi penanda sekaligus.
   */
  private createPropMesh(
    index: number,
    pos: [number, number, number],
    role: 'goal' | 'flavor' = 'goal',
    labelKey?: string,
    dynamicLabel = false
  ): THREE.Group {
    const group = new THREE.Group();
    const isGoal = role === 'goal';

    // Cincin penunjuk selalu menghadap kamera (billboard) supaya terbaca dari
    // arah mana pun: seperti retikel interaksi pada game aksi, bukan kotak
    // debug yang mengambang.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(
        isGoal ? 0.2 : 0.13,
        isGoal ? 0.27 : 0.175,
        20
      ),
      new THREE.MeshBasicMaterial({
        color: isGoal ? 0xffd9a0 : 0x9fb6cc,
        transparent: true,
        opacity: isGoal ? 0.5 : 0.22,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    group.add(ring);

    // Inti: gumpalan cahaya lembut (sprite radial), pengganti oktahedron
    // yang terlihat seperti geometri debug. Warna mengikuti peran: emas
    // hangat untuk tujuan, biru pucat untuk interaksi biasa.
    const core = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getSoftDotTexture(),
        color: isGoal ? 0xffd9a0 : 0x9fb6cc,
        transparent: true,
        opacity: isGoal ? 0.55 : 0.3,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    const coreScale = isGoal ? 0.46 : 0.26;
    core.scale.setScalar(coreScale);
    group.add(core);

    // Label tujuan: teks objektif melayang di atas penanda emas.
    if (isGoal && labelKey) {
      const sprite = this.makeMarkerLabel(t(labelKey));
      if (sprite) {
        sprite.position.y = 0.5;
        group.add(sprite);
        group.userData.label = sprite;
      }
    }

    group.position.set(pos[0], pos[1], pos[2]);
    group.name = `prop_${index}`;
    group.userData.baseY = pos[1];
    group.userData.role = role;
    group.userData.ring = ring;
    group.userData.core = core;
    group.userData.coreBase = coreScale;
    // Label dinamis mengganti isinya tiap objektif berganti.
    group.userData.dynamicLabel = dynamicLabel;
    return group;
  }

  /**
   * Apakah penanda ini sedang berperan sebagai tujuan?
   *
   * Penanda `goalFor` menyala hanya selama objektif aktif cocok dengan
   * daftarnya; selain itu memakai peran statis dari naskah.
   */
  private isMarkerGoal(marker: THREE.Object3D): boolean {
    const goalFor = marker.userData.goalFor as string[] | null | undefined;
    if (goalFor) return goalFor.includes(scriptRunner.getObjective().id);
    return marker.userData.staticGoal !== false;
  }

  /** Ganti warna penanda ketika status tujuan/biasanya berubah. */
  private applyMarkerGoalStyle(marker: THREE.Object3D, isGoal: boolean): void {
    const ring = marker.userData.ring as THREE.Mesh | undefined;
    if (ring) {
      (ring.material as THREE.MeshBasicMaterial).color.setHex(isGoal ? 0xffd9a0 : 0x9fb6cc);
    }
    const core = marker.userData.core as THREE.Sprite | undefined;
    if (core) {
      const coreMat = core.material as THREE.SpriteMaterial;
      coreMat.color.setHex(isGoal ? 0xffd9a0 : 0x9fb6cc);
    }
  }

  /**
   * Pilih penanda utama: satu-satunya yang menyala kuning penuh dan menjadi
   * sasaran pip kompas. Prioritas: (1) interaktif yang sedang diarahkan selama
   * ia tujuan cerita, (2) penanda `goalFor` objektif aktif terdekat, (3)
   * tujuan statis terdekat yang interaktifnya belum pernah dipakai. Objek
   * yang sudah diinteraksi tersingkir dari daftar, jadi setelah objektif
   * berpindah penandanya hanya tinggal meredup.
   */
  private findPrimaryMarker(targetId: string | null, camPos: THREE.Vector3): number {
    if (targetId !== null) {
      const idx = this.propMeshes.findIndex(m =>
        !m.userData.looted && !!m.parent && m.userData.interactableId === targetId && this.isMarkerGoal(m));
      if (idx >= 0) return idx;
    }

    const objectiveId = scriptRunner.getObjective().id;
    const dist2 = (m: THREE.Object3D) =>
      (m.position.x - camPos.x) ** 2 + (m.position.z - camPos.z) ** 2;

    let primary = -1;
    let best = Number.POSITIVE_INFINITY;
    // Tahap 1: penanda yang terikat pada objektif yang sedang berlaku.
    for (let i = 0; i < this.propMeshes.length; i++) {
      const m = this.propMeshes[i];
      if (m.userData.looted || !m.parent) continue;
      const goalFor = m.userData.goalFor as string[] | null | undefined;
      if (!goalFor || !goalFor.includes(objectiveId)) continue;
      const d = dist2(m);
      if (d < best) { best = d; primary = i; }
    }
    if (primary >= 0) return primary;

    // Tahap 2: tujuan statis terdekat yang belum pernah dipakai.
    for (let i = 0; i < this.propMeshes.length; i++) {
      const m = this.propMeshes[i];
      if (m.userData.looted || !m.parent) continue;
      if (m.userData.goalFor) continue;
      if (m.userData.staticGoal === false) continue;
      if (m.userData.goalUsed) continue;
      const d = dist2(m);
      if (d < best) { best = d; primary = i; }
    }
    return primary;
  }

  /**
   * Kompas HUD: kepala pita = arah pandang, pip emas = penanda utama. Relasi
   * dipakai (bukan bearing absolut) karena pita sudah digulir oleh heading;
   * pip jadi elemen terpisah agar tetap di posisinya walau arah tak berubah.
   */
  private updateCompass(fwd: THREE.Vector3, camPos: THREE.Vector3, marker: THREE.Object3D | null): void {
    const heading = Math.atan2(fwd.x, -fwd.z);
    let goalRel: number | null = null;
    if (marker) {
      const dx = marker.position.x - camPos.x;
      const dz = marker.position.z - camPos.z;
      if (dx * dx + dz * dz > 0.04) {
        const bearing = Math.atan2(dx, -dz);
        let rel = bearing - heading;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        goalRel = rel;
      }
    }
    this.hud?.setCompass(heading, goalRel);
  }

  /**
   * Perbarui label mengambang pada semua penanda tujuan dinamis agar selalu
   * menampilkan objektif yang baru saja ditetapkan.
   */
  private refreshGoalLabels(objectiveText: string): void {
    const key = typeof objectiveText === 'string' ? objectiveText : '';
    for (const marker of this.propMeshes) {
      if (!marker.userData.dynamicLabel) continue;
      const group = marker as THREE.Group;
      let label = group.userData.label as THREE.Sprite | undefined;
      if (!label) {
        if (!key) continue;
        const sprite = this.makeMarkerLabel(t(key));
        if (!sprite) continue;
        sprite.position.y = 0.5;
        group.add(sprite);
        group.userData.label = sprite;
        continue;
      }
      if (!key) {
        label.visible = false;
        continue;
      }
      const canvas = this.renderLabelCanvas(t(key));
      if (!canvas) continue;
      const material = label.material as THREE.SpriteMaterial;
      material.map?.dispose();
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      material.map = texture;
      material.needsUpdate = true;
      const scale = 0.0042;
      label.scale.set(canvas.width * scale, 64 * scale, 1);
      label.userData.baseScale = { w: canvas.width * scale, h: 64 * scale };
    }
  }

  /** Teks label kecil di atas penanda tujuan (sprite billboard). */
  private makeMarkerLabel(text: string): THREE.Sprite | null {
    const canvas = this.renderLabelCanvas(text);
    if (!canvas) return null;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    const scale = 0.0042;
    sprite.scale.set(canvas.width * scale, 64 * scale, 1);
    sprite.userData.baseScale = { w: canvas.width * scale, h: 64 * scale };
    sprite.renderOrder = 20;
    return sprite;
  }

  /** Gambar teks label ke kanvas pil berbingkai emas. */
  private renderLabelCanvas(text: string): HTMLCanvasElement | null {
    if (!text) return null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Teks objektif bisa panjang; perkecil huruf dulu sebelum memotong.
    const maxW = 460;
    const pad = 44;
    let size = 34;
    let w = 0;
    for (; size >= 16; size -= 2) {
      ctx.font = `600 ${size}px system-ui, sans-serif`;
      w = Math.ceil(ctx.measureText(text).width) + pad;
      if (w <= maxW) break;
    }
    w = Math.min(maxW, w);

    const font = `600 ${size}px system-ui, sans-serif`;
    canvas.width = w;
    canvas.height = 64;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Latar pil gelap agar teks tetap terbaca di atas tekstur ramai.
    const r = 26;
    ctx.fillStyle = 'rgba(8, 7, 7, 0.82)';
    ctx.beginPath();
    ctx.roundRect(2, 6, w - 4, 52, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 205, 120, 0.75)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffe9bd';
    ctx.fillText(text, w / 2, 33);
    return canvas;
  }

  /**
   * Animasi penanda: denyut, melayang, dan sorotan ketika sedang diarahkan.
   *
   * Hanya SATU penanda yang menyala kuning penuh tiap waktu (penanda
   * utama, lihat findPrimaryMarker): objektif yang sedang berlaku. Penanda
   * tujuan lain yang warnanya tetap kuning dibuat meredup, dan objek yang
   * sudah diinteraksi ikut meredup begitu objektif berpindah. Interaksi
   * biasa (flavor) tetap samar dan baru muncul saat pemain mendekat atau
   * memandang ke arahnya.
   */
  private updatePropPulse(): void {
    const now = performance.now();
    const targetId = interactionManager.getCurrentTarget()?.id ?? null;
    const camQuat = this.engine?.camera.quaternion;
    const cam = this.engine?.camera;
    // Posisi dunia: camera.position selalu [0,0,0] lokal, nilai sebenarnya
    // ada di matriks dunia (turunan yawObject).
    const camPos = this.pulseCamPos;
    if (cam) {
      cam.updateWorldMatrix(true, false);
      camPos.setFromMatrixPosition(cam.matrixWorld);
    }
    const fwd = this.pulseFwd;
    if (cam) cam.getWorldDirection(fwd);

    // Tanpa penanda di scene, kompas tetap diperbarui (mata angin saja).
    if (!this.propMeshes.length) {
      this.updateCompass(fwd, camPos, null);
      return;
    }

    // Hanya satu label yang tampil tiap frame, dan harus benar-benar terlihat:
    // milik target yang sedang diarahkan, atau tujuan terdekat yang ada di
    // depan kamera. Kalau semua penanda menulis teksnya sekaligus, beberapa
    // label dengan objektif sama berdempetan dan saling menutupi: sementara
    // tujuan di belakang pemain tidak ada gunanya ditampilkan.
    let labelIdx = -1;
    let labelScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.propMeshes.length; i++) {
      const marker = this.propMeshes[i];
      if (marker.userData.looted) continue;
      if (!marker.parent || !marker.userData.label) continue;
      if (!this.isMarkerGoal(marker)) continue;
      const active = targetId !== null && marker.userData.interactableId === targetId;
      const dx = marker.position.x - camPos.x;
      const dz = marker.position.z - camPos.z;
      const dist = cam ? Math.hypot(dx, dz) : Number.POSITIVE_INFINITY;
      if (!active && dist >= 9) continue;
      // Penanda yang sudah sangat dekat (≤1,3 m: termasuk yang di-cull
      // karena pemain berdiri tepat di atasnya) tak boleh terpilih: teks di
      // depan mata menutupi pandangan, dan penandanya sendiri justru tak
      // tampil di layar.
      if (dist < 1.3) continue;
      // Bidang pandang horizontal kamera ±88° (fov 75°). Uji tanda semata
      // masih lolos untuk sudut 89°: label jadi terpasang untuk penanda
      // yang ada di luar bingkai. Kini harus benar-benar tampak di layar.
      if (!active && cam && dist > 0) {
        const cosView = (fwd.x * dx + fwd.z * dz) / dist;
        if (cosView < 0.68) continue;
      }
      const score = active ? -1 : dist;
      if (score < labelScore) { labelScore = score; labelIdx = i; }
    }

    // Penanda utama: satu-satunya yang menyala kuning penuh dan menjadi
    // sasaran pip kompas HUD.
    const primaryIdx = this.findPrimaryMarker(targetId, camPos);
    this.updateCompass(fwd, camPos, primaryIdx >= 0 ? this.propMeshes[primaryIdx] : null);

    for (let i = 0; i < this.propMeshes.length; i++) {
      const marker = this.propMeshes[i];
      // Penanda barang yang sudah diambil: padam permanen (interaktifnya
      // masih bisa dipakai untuk dialog periksa ulang, tapi tidak menyala).
      if (marker.userData.looted) {
        if (marker.visible) marker.visible = false;
        const lootedLabel = marker.userData.label as THREE.Sprite | undefined;
        if (lootedLabel && lootedLabel.visible) lootedLabel.visible = false;
        continue;
      }
      if (!marker.parent) continue;

      const active = targetId !== null && marker.userData.interactableId === targetId;
      const isGoal = this.isMarkerGoal(marker);
      // Hanya penanda utama yang menyala penuh; tujuan lain tetap berwarna
      // kuning tapi redup supaya mata hanya tertuju ke satu objektif.
      const bright = i === primaryIdx;
      const dist = cam
        ? Math.hypot(marker.position.x - camPos.x, marker.position.z - camPos.z)
        : Number.POSITIVE_INFINITY;

      // Berdiri tepat di atas tujuan (spawn di kasur, singgah di ambang):
      // penanda berjarak ~0 menempel di wajah kamera dan inti sprite-nya
      // berskala jarak menutupi seluruh layar. Sembunyikan sampai pemain
      // menjauh: objektif tetap terbaca dari teks HUD dan prompt E.
      if (dist < 1.3) {
        if (marker.visible) marker.visible = false;
        const nearLabel = marker.userData.label as THREE.Sprite | undefined;
        if (nearLabel && nearLabel.visible) nearLabel.visible = false;
        continue;
      }

      // Status tujuan bisa berubah kapan saja (objektif baru): gaya disegarkan
      // hanya saat berubah agar tidak menulis material tiap frame.
      if (marker.userData.goalActive !== isGoal) {
        marker.userData.goalActive = isGoal;
        this.applyMarkerGoalStyle(marker, isGoal);
      }

      // Non-tujuan (termasuk `goalFor` yang sedang tidak berlaku): samar dan
      // baru muncul saat pemain mendekat atau memandang ke arahnya.
      if (!isGoal && cam && !active) {
        const visible = dist < 7;
        if (marker.visible !== visible) marker.visible = visible;
        if (!visible) {
          // Label ikut disembunyikan: blok pembaruan label ada di bawah dan
          // tidak tercapai kalau penandanya sudah hilang dari layar.
          const hidden = marker.userData.label as THREE.Sprite | undefined;
          if (hidden && hidden.visible) hidden.visible = false;
          continue;
        }
      } else if (!marker.visible) {
        marker.visible = true;
      }

      const baseY = marker.userData.baseY as number;
      marker.position.y = baseY + Math.sin(now * 0.0021 + i * 1.7) * (bright ? 0.05 : 0.03);
      const scale = (active ? 1.3 + Math.sin(now * 0.006) * 0.05 : 1) * (bright ? 1 : 0.72);
      marker.scale.setScalar(scale);

      const ring = marker.userData.ring as THREE.Mesh | undefined;
      if (ring) {
        if (camQuat) ring.quaternion.copy(camQuat);
        const ringMat = ring.material as THREE.MeshBasicMaterial;
        if (bright) {
          // Denyut halus: tujuan terasa "hidup" tanpa berkedip agresif.
          const pulse = 0.55 + Math.sin(now * 0.003 + i) * 0.18;
          ringMat.opacity = active ? 0.95 : pulse;
        } else {
          // Tujuan yang meredup tetap terbaca sebagai kuning (bukan biru
          // netral), hanya dengan intensitas yang jauh lebih rendah.
          ringMat.opacity = active ? 0.75 : isGoal ? 0.32 : 0.22;
        }
      }

      const core = marker.userData.core as THREE.Sprite | undefined;
      if (core) {
        const coreMat = core.material as THREE.SpriteMaterial;
        // Nafas cahaya: kepadatan sprite berdenyut pelan. Sprite radial tidak
        // perlu diputar: putaran hanya memutar gradasinya dan tak terlihat.
        const coreBase = marker.userData.coreBase as number;
        coreMat.opacity = active
          ? 0.9
          : (bright ? 0.5 + Math.sin(now * 0.003 + i) * 0.16 : isGoal ? 0.34 : 0.3);
        core.scale.setScalar(coreBase * (active ? 1.18 : 1 + Math.sin(now * 0.0024 + i) * 0.05));
      }

      // Label tujuan ikut melayang; hanya tampil untuk tujuan yang sedang
      // menyala, dan tetap dibatasi jarak supaya ruangan tidak dipenuhi teks
      // dari penanda yang jauh.
      const label = marker.userData.label as THREE.Sprite | undefined;
      if (label) {
        const show = i === labelIdx;
        if (label.visible !== show) label.visible = show;
        if (show) {
          const mat = label.material as THREE.SpriteMaterial;
          // Lebar layar dijaga tetap: sprite berskala dunia, jadi tanpa
          // penyusutan label 1,9 m menutupi seluruh layar ketika marker
          // tinggal di depan pemain: dan memudar sebelum menutupi pandangan.
          const base = label.userData.baseScale as { w: number; h: number } | undefined;
          if (base) {
            const shrink = Math.min(1, Math.max(0.34, dist / 3.2));
            label.scale.set(base.w * shrink, base.h * shrink, 1);
          }
          const fade = Math.min(1, Math.max(0, (dist - 0.9) / 0.9));
          mat.opacity = (active ? 1 : 0.82) * fade;
          label.position.y = 0.5 + Math.sin(now * 0.0018 + i) * 0.03;
        }
      }
    }
  }

  private disposeObject(root: THREE.Object3D): void {
    // Geometri & material ber-cache (scenes.ts) dipakai bersama oleh scene
    // berikutnya: membuangnya tiap ganti scene memaksa upload ulang GPU yang
    // tidak perlu. Tanda `userData.cached` dipasang oleh helper cache-nya.
    root.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry && !mesh.geometry.userData.cached) mesh.geometry.dispose();
      const material: any = mesh.material;
      const skip = (m: any) => m && !m.userData?.cached && typeof m.dispose === 'function' && m.dispose();
      if (Array.isArray(material)) {
        material.forEach(skip);
      } else if (material && typeof material.dispose === 'function') {
        skip(material);
      }
    });
  }

  private returnFromOverlay(): void {
    if (this.gameState === 'playing') {
      hideControlsHint();
      this.hideAllScreens();
      this.overlayActive = false;
      this.hud?.show();
      this.updateDayIndicator();
      this.engine?.start();
      interactionManager.setEnabled(!gameState.get('inDialog'));
      // Overlay ditutup lewat klik tombol (gesture pengguna): kunci ulang
      // kursor otomatis, terutama setelah puzzle selesai/dibatalkan. Bila
      // browser menolak, hint "klik untuk mengunci" tetap menuntun pemain.
      inputManager.requestPointerLockIfActivated();
      this.refreshPointerHint();
    } else if (this.gameState === 'paused') {
      this.showScreen(this.pauseMenu!);
    } else {
      this.showMainMenu();
    }
  }

  private showScreen(screen: any): void {
    hideControlsHint(); // panel petunjuk jangan menumpuk di bawah layar lain
    this.hideAllScreens();
    screen?.show();
    this.overlayActive = true;
    this.currentScreen = screen?.constructor?.name ?? 'screen';
    this.refreshPointerHint();
  }

  private hideAllScreens(): void {
    this.bootScreen?.hide();
    this.languageScreen?.hide();
    this.mainMenu?.hide();
    this.settingsScreen?.hide();
    this.loadScreen?.hide();
    this.pauseMenu?.hide();
    this.hud?.hide();
    this.daySummary?.hide();
    this.journalScreen?.hide();
    this.inventoryScreen?.hide();
    this.evidenceBoard?.hide();
    this.phoneScreen?.hide();
    this.dialogScreen?.hide();
    this.galleryScreen?.hide();
    this.chapterSelect?.hide();
    this.puzzleScreen?.hide();
    this.endingScreen?.hide();
    this.prologueScreen?.hide();
    this.overlayActive = true;
    this.currentScreen = null;
  }

  async dispose(): Promise<void> {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    this.engine?.stop();
    await this.engine?.dispose();
  }
}

let gameInstance: Game | null = null;

export async function createGame(canvas: HTMLCanvasElement): Promise<Game> {
  gameInstance = new Game();
  await gameInstance.initialize(canvas);
  // Debug handle for console/QA scripting. Always on in dev; opt-in in a build
  // via localStorage.setItem('asap-debug', '1') before the game boots.
  const debugEnabled = (import.meta as any).env?.DEV
    || (typeof localStorage !== 'undefined' && localStorage.getItem('asap-debug') === '1');
  if (typeof window !== 'undefined' && debugEnabled) {
    (window as any).__asap = {
      game: gameInstance,
      eventBus,
      gameState,
      scriptRunner,
      interactionManager,
      saveManager,
      journalManager,
      chapterManager,
      endingManager,
      achievementManager
    };
  }
  return gameInstance;
}

export function getGame(): Game | null {
  return gameInstance;
}
