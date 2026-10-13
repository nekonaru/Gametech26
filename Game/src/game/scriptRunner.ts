import { gameState } from './state.js';
import { eventBus, GameEvents } from '../core/events.js';
import { i18n, t } from '../core/i18n.js';
import { saveManager } from '../core/save.js';
import { audioManager } from '../core/audio.js';
import { AUDIO_SAMPLES } from '../core/audioSamples.js';
import { collectChapterAudioKeys } from './audioKeys.js';
import { assetUrl } from '../core/paths.js';
import { journalManager } from './journal.js';
import { TransitionLayer } from '../ui/transitions.js';

export interface ChapterScript {
  id: string;
  hari: number;
  jam: string;
  pov: 'dimas' | 'raka';
  scene: string;
  onEnter: ScriptOperation[];
  interactables: Interactable[];
  dialogs: Record<string, DialogNode[]>;
  onExit?: ScriptOperation[];
  /**
   * Operasi pembuka yang dijalankan sekali saat bab dimulai segar: bukan
   * lanjutan save dan bukan `gotoScene` antar tempat. b01 memakainya untuk
   * animasi bangun: pemain spawn di kasur, kamera merebah lalu bangkit,
   * dan dialog pertama terbuka. Dijalankan `main.startChapter` sesudah kartu
   * bab, di balik layar hitam, supaya pose merebah tak terekspos sebagai
   * loncatan kamera.
   */
  onSpawn?: ScriptOperation[];
  /**
   * Titik masuk per lokasi di dalam satu bab. Satu bab boleh punya banyak
   * tempat (rumah, proyek, pasar) yang dijangkau lewat op `gotoScene`;
   * peta ini menyimpan spawn & hadap awal tiap tempat.
   */
  scenes?: Record<string, { spawn?: [number, number, number]; yaw?: number; label?: string; lighting?: string }>;
}

export interface ScriptOperation {
  op: string;
  [key: string]: any;
}

export interface Interactable {
  id: string;
  prompt: string;
  position?: [number, number, number];
  onUse: ScriptOperation[];
  condition?: string;
  once?: boolean;
  /**
   * Lokasi di dalam bab tempat interaktif ini hidup. Tanpa field ini berarti
   * berada di scene awal bab. Dipakai saat `gotoScene` memindahkan pemain
   * antar-tempat dalam satu bab.
   */
  scene?: string;
  /**
   * Penanda tujuan: `goal` menyala terus dan dilabeli, `flavor` redup dan
   * hanya muncul saat pemain mendekat/memandang. Ditentukan konten, bukan
   * tebakan mesin, supaya pembedaan tujuan vs interaksi biasa konsisten.
   */
  role?: 'goal' | 'flavor';
  /**
   * Label mengambang di atas penanda tujuan (kunci locale, mis.
   * `b01.obj.bangun`). Hanya tampil untuk role `goal`.
   */
  label?: string;
  /**
   * Objektif yang membuat interaktif ini menjadi tujuan. Penanda hanya menyala
   * selama objektif bab sedang ber salah satu id di daftar ini: jadi di awal
   * bab cuma kasur yang berpendar, sesudah dicek baru dapur/amplop/dompet, dan
   * pintu depan hanya menyala saat memang waktunya keluar. Tanpa field ini,
   * penanda memakai `role` statis.
   */
  goalFor?: string | string[];
  /**
   * Pembeda bentuk penanda interaksi (dipakai `createPropMesh`), bukan warna:
   * - `npc` orang yang sedang diajak bicara: ketupat di atas kepala tanpa
   *   pilar, supaya corong tidak menembus badan figur.
   * - `wall` objek terpasang di permukaan tegak (foto, kalender, spanduk):
   *   ketupat bersayap kiri-kanan, juga tanpa pilar karena pangkalnya jauh
   *   di atas lantai dan justru terlihat melayang aneh.
   * - `ground` objek di meja atau lantai (default): gaya penuh chevron +
   *   pilar cahaya yang jatuh ke permukaan di bawahnya.
   * Nilai asing ditolak validator, jadi JSON konten selalu tervalidasi.
   */
  surface?: 'npc' | 'wall' | 'ground';
}

export interface DialogNode {
  speaker?: string;
  text: string;
  choices?: DialogChoice[];
  autoNext?: string;
  onEnter?: ScriptOperation[];
  onExit?: ScriptOperation[];
}

export interface DialogChoice {
  text: string;
  next: string;
  condition?: string;
  onSelect?: ScriptOperation[];
  important?: boolean;
  once?: boolean;
}

export class ScriptRunner {
  private currentScript: ChapterScript | null = null;
  private operationQueue: ScriptOperation[] = [];
  private running = false;
  private waitingForInput = false;
  private currentDialogId: string | null = null;
  private dialogStack: string[] = [];
  /** Dinaikkan tiap bab berganti; loop dialog lama berhenti agar tidak macet. */
  private dialogEpoch = 0;
  private resolveContinue: (() => void) | null = null;
  private resolveChoice: ((c: string | null) => void) | null = null;
  /** Objektif aktif sekarang; penanda `goalFor` memakai id ini. */
  private objectiveId = '';
  private objectiveText = '';
  /**
   * Objektif yang sudah digantikan dalam bab berjalan.
   *
   * Percakapan dan interaktif bisa diulang pemain (memeriksa kasur lagi,
   * mengajak pedagang bicara kedua kalinya) dan banyak di antaranya menyetel
   * objektif lamanya tanpa syarat. Objektif bersifat maju: id yang pernah
   * ditinggalkan dianggap selesai, sehingga pengulangan tidak menarik
   * penanda tujuan mundur ke tahap sebelumnya.
   */
  private doneObjectives = new Set<string>();
  /**
   * Teks tiap id objektif yang pernah berlaku di bab ini. Disimpan supaya
   * layar misi (Tab) bisa menampilkan daftar langkah yang sudah selesai
   * dalam bahasa pemain, bukan hanya kumpulan id mentah.
   */
  private objectiveTexts = new Map<string, string>();
  /**
   * Kedalaman rantai operasi skrip yang sedang berjalan.
   *
   * Dihitung dari executeOperations (termasuk cabang bersarang `if` dan
   * `startDialog` rekursif). Selama angka ini > 0 skrip masih mengerjakan
   * sesuatu: animasi kamera, transisi scene, atau menunggu dialog: dan
   * interaktif lain tidak boleh menembak rantai baru.
   */
  private opDepth = 0;
  /**
   * Rantai `onSpawn` bab yang masih menunggu.
   *
   * Diisi `loadChapter` hanya untuk mulai segar, dijalankan oleh
   * `main.startChapter` (dan `main.selectChapter`) sesudah kartu bab.
   * Kalau tidak pernah dijalankan: save dipuat lewat jalur lain: timpaan
   * `loadChapter` berikutnya meleburnya, jadi tidak pernah menyusul di
   * tempat yang salah.
   */
  private pendingSpawnOps: ScriptOperation[] = [];

  getCurrentScript(): ChapterScript | null {
    return this.currentScript;
  }

  /** Objektif yang sedang berlaku, dipakai penanda tujuan & labelnya. */
  getObjective(): { id: string; text: string } {
    return { id: this.objectiveId, text: this.objectiveText };
  }

  /** Objektif yang sedang berjalan & daftar yang sudah selesai (teks + id). */
  getMissionLog(): { current: { id: string; text: string } | null; done: Array<{ id: string; text: string }> } {
    const done = [...this.doneObjectives]
      .map(id => ({ id, text: this.objectiveTexts.get(id) ?? '' }))
      .filter(entry => entry.text !== '');
    const current = this.objectiveText
      ? { id: this.objectiveId, text: this.objectiveText }
      : null;
    return { current, done };
  }

  /**
   * Objektif ikut disimpan di save: `loadChapter` meresetnya setiap bab, jadi
   * tanpa ini pemain yang menyimpan di tengah bab akan kembali ke objektif
   * pertama padahal penanda `goalFor` sudah menunjuk tempat lain.
   */
  serialize(): { objectiveId: string; objectiveText: string; doneObjectives: string[]; objectiveTexts: Record<string, string> } {
    return {
      objectiveId: this.objectiveId,
      objectiveText: this.objectiveText,
      doneObjectives: [...this.doneObjectives],
      objectiveTexts: Object.fromEntries(this.objectiveTexts)
    };
  }

  deserialize(data: {
    objectiveId?: string;
    objectiveText?: string;
    doneObjectives?: string[];
    objectiveTexts?: Record<string, string>;
  } | null | undefined): void {
    if (!data) return;
    this.objectiveId = typeof data.objectiveId === 'string' ? data.objectiveId : '';
    this.objectiveText = typeof data.objectiveText === 'string' ? data.objectiveText : '';
    this.doneObjectives = new Set(
      Array.isArray(data.doneObjectives) ? data.doneObjectives.filter((x): x is string => typeof x === 'string') : []
    );
    // Simpanan lama tidak punya peta teks: daftar misi hanya kehilangan
    // riwayat langkah lama, objektif berjalan tetap tampil normal.
    this.objectiveTexts = new Map(
      data.objectiveTexts && typeof data.objectiveTexts === 'object'
        ? Object.entries(data.objectiveTexts).filter((e): e is [string, string] => typeof e[1] === 'string')
        : []
    );
    if (this.objectiveText) {
      eventBus.emit('hud:objective', { id: this.objectiveId, text: this.objectiveText });
    }
  }

  /**
   * Tandai tiap interaktif sebagai `goal` (tujuan cerita) atau `flavor`
   * (interaksi biasa) berdasarkan isi naskahnya.
   *
   * Suatu interaktif dianggap tujuan kalau rantai onUse-nya (termasuk dialog,
   * cabang if, dan pilihan) menyetel flag yang dipakai sebagai syarat di
   * tempat lain dalam bab, atau memicu operasi progres seperti `objective`,
   * `chapterEnd`, `gotoScene`, dan `giveClue`. Sisanya: pemeriksaan benda,
   * obrolan sanda: adalah flavor: penandanya redup dan hanya muncul saat
   * didekati, supaya pemain bisa membedakan mana yang menggerakkan cerita.
   *
   * Konten boleh menulis `role` sendiri; kalau sudah ada, keputusan di sini
   * tidak menggantikannya.
   */
  private assignInteractableRoles(script: ChapterScript): void {
    // Flag yang dipakai sebagai syarat di bab ini = gerbang progres.
    const gateFlags = new Set<string>();
    const PROGRESS_OPS = new Set([
      'objective', 'chapterEnd', 'gotoScene', 'loadScene',
      'startPuzzle', 'ending', 'giveClue'
    ]);

    const conditions: string[] = [];
    const gatherConditions = (node: any): void => {
      if (Array.isArray(node)) { node.forEach(gatherConditions); return; }
      if (!node || typeof node !== 'object') return;
      if (typeof node.condition === 'string') conditions.push(node.condition);
      for (const value of Object.values(node)) gatherConditions(value);
    };
    gatherConditions(script);
    for (const cond of conditions) {
      for (const m of cond.matchAll(/flags\.(\w+)/g)) gateFlags.add(m[1]);
    }

    const visitedDialogs = new Set<string>();
    let hitsProgress = false;
    let firstObjective: string | null = null;

    const walkOps = (ops: ScriptOperation[] | undefined): void => {
      if (!Array.isArray(ops)) return;
      for (const op of ops) {
        if (!op || typeof op !== 'object') continue;
        if (op.op === 'setFlag' && typeof op.flag === 'string' && gateFlags.has(op.flag)) {
          hitsProgress = true;
        }
        if (op.op === 'objective' && typeof op.text === 'string' && !firstObjective) {
          firstObjective = op.text;
        }
        if (PROGRESS_OPS.has(op.op)) hitsProgress = true;
        if (op.op === 'dialog' && typeof op.node === 'string') walkDialog(op.node);
        if (op.op === 'if') { walkOps(op.then); walkOps(op.else); }
        if (op.op === 'choice' && Array.isArray(op.options)) {
          for (const opt of op.options) walkOps(opt?.onSelect);
        }
        if (op.op === 'startPuzzle' && op.config) {
          walkOps(op.config.onSolve);
          walkOps(op.config.onSkip);
          walkOps(op.config.onHelp);
        }
      }
    };

    const walkDialog = (nodeId: string): void => {
      if (visitedDialogs.has(nodeId)) return;
      visitedDialogs.add(nodeId);
      const nodes = script.dialogs[nodeId];
      if (!Array.isArray(nodes)) return;
      for (const node of nodes) {
        walkOps(node.onEnter);
        walkOps(node.onExit);
        if (node.autoNext) walkDialog(node.autoNext);
        for (const choice of node.choices || []) {
          walkOps(choice.onSelect);
          if (choice.next) walkDialog(choice.next);
        }
      }
    };

    for (const inter of script.interactables || []) {
      hitsProgress = false;
      firstObjective = null;
      visitedDialogs.clear();
      walkOps(inter.onUse);
      if (!inter.role) inter.role = hitsProgress ? 'goal' : 'flavor';
      // Tujuan statis (tanpa goalFor) memakai teks objektif pertama dari
      // rantainya sebagai label mengambang; kalau `goalFor` ada, labelnya
      // mengikuti objektif aktif secara dinamis.
      if (inter.role === 'goal' && !inter.goalFor && !inter.label && firstObjective) {
        inter.label = firstObjective;
      }
    }
  }

  evaluateConditionPublic(condition: string): boolean {
    return this.evaluateCondition(condition);
  }

  async loadChapter(chapterId: string): Promise<void> {
    try {
      // Bab baru dimuat: hentikan loop dialog lama supaya promise yang masih
      // menunggu input tidak pernah diselesaikan (permainan macet).
      this.abortDialog();

      eventBus.emit(GameEvents.SCENE_LOAD_START, { sceneId: chapterId });

      const response = await fetch(assetUrl(`data/chapters/${chapterId}.json`));
      if (!response.ok) throw new Error(`Failed to load chapter: ${chapterId}`);

      const script: ChapterScript = await response.json();
      this.currentScript = script;
      this.assignInteractableRoles(script);

      // Lazy-load audio bab: minta rekaman playSound bab ini di latar TANPA
      // menahan pemuatan bab. Boot hanya memuat SFX reaktif kecil; ambience,
      // musik, dan SFX bab menyusul di sini. Selama file belum tiba, play()
      // memakai sintesis prosedural lalu otomatis memakai rekaman berikutnya.
      void audioManager
        .ensureAudio(collectChapterAudioKeys(script), AUDIO_SAMPLES)
        .catch(() => undefined);

      await this.loadChapterLocale(chapterId);

      // Objektif ikut direset; kalau bab memanggil `objective` di onEnter,
      // nilainya kembali terisi tepat setelah ini. Riwayat objektif selesai
      // juga dibuang supaya bab baru boleh memakai id yang sama.
      this.objectiveId = '';
      this.objectiveText = '';
      this.doneObjectives.clear();
      this.objectiveTexts.clear();

      // Lokasi tersimpan dipertahankan kalau pemain melanjutkan bab yang sama
      // di tempat lain (b01 punya rumah/proyek/pasar). Bab baru, pilih ulang
      // bab dari menu, atau lokasi yang tidak dikenal = mulai dari scene awal.
      const savedLoc = gameState.get('location');
      const sameChapter = gameState.get('currentChapter') === script.id;
      const knownScene = !!savedLoc &&
        (savedLoc.sceneId === script.scene ||
          !!(script.scenes && script.scenes[savedLoc.sceneId]));
      const entry = script.scenes?.[script.scene];
      const resumeLoc = sameChapter && savedLoc && knownScene ? savedLoc : null;
      const location = resumeLoc ?? {
        sceneId: script.scene,
        pos: (entry?.spawn ?? [0, 0, 0]) as [number, number, number],
        yaw: entry?.yaw ?? 0
      };

      // Mulai segar = rangkaian `onSpawn` (animasi bangun) menunggu sampai
      // startChapter selesai menampilkan kartu bab; jalur lanjutan save
      // tidak boleh mengulang pembuka bab.
      this.pendingSpawnOps = resumeLoc ? [] : (script.onSpawn ?? []);

      gameState.update({
        currentChapter: script.id,
        hari: script.hari,
        jam: script.jam,
        pov: script.pov,
        location
      });

      // Senter adalah kunci cahaya bab-bab gelap: bab setelah b01 selalu
      // punya senter walau rantai b01 dilewati: pemain yang memilih bab
      // langsung atau memuat save lama tidak pernah terjebak tanpa cahaya.
      if (script.id !== 'b01' && !gameState.hasInventory('senter')) {
        gameState.addInventory('senter');
      }

      await this.executeOperations(script.onEnter);
      this.setupInteractables(script.interactables);

      eventBus.emit(GameEvents.SCENE_LOAD_COMPLETE, { sceneId: chapterId });
      eventBus.emit(GameEvents.CHAPTER_START, { chapterId: script.id });

    } catch (error) {
      console.error('Error loading chapter:', error);
    }
  }

  /**
   * Jalankan rangkaian `onSpawn` bab yang masih menunggu (mulai segar).
   *
   * Dipanggil `main.startChapter` sesudah kartu bab dan sebelum fade-in:
   * pose merebah ("bangun dari kasur") terjadi di balik layar hitam, lalu
   * pemain melihat kamera bangkit ketika layar menyala. Sengaja tidak
   * ditunggu pemanggilnya: rantai berujung dialog yang menunggu input
   * pemain, sementara `opDepth` menjaga penggerak otomatis tetap menunggu
   * sampai tuntas. Kalau ada rantai lain yang sedang berjalan (penggerak
   * otomatis menembak kasur lebih dulu semasa kartu bab), rantai ini
   * dilewatkan supaya dua pembuka tidak tumpang tindih.
   */
  async runPendingSpawnOps(): Promise<void> {
    if (!this.pendingSpawnOps.length) return;
    if (this.isOpsBusy() || gameState.get('inDialog')) return;
    const ops = this.pendingSpawnOps;
    this.pendingSpawnOps = [];
    await this.executeOperations(ops);
  }

  /**
   * Pindah tempat di dalam bab yang sama (mis. rumah → proyek → pasar).
   *
   * Berbeda dengan `loadScene` (ganti bab), method ini tidak menyentuh naskah:
   * hanya lokasi, scene 3D, dan penanda interaktif yang diperbarui. Layar
   * diredupkan dulu supaya pergantian tempat terasa seperti berjalan keluar,
   * bukan teleport, lalu kartu lokasi singkat memberi tahu pemain di mana ia
   * berada sekarang.
   */
  private async gotoScene(op: ScriptOperation): Promise<void> {
    const script = this.currentScript;
    const sceneId = typeof op.scene === 'string' ? op.scene : '';
    if (!script || !sceneId) return;

    const entry = script.scenes?.[sceneId];
    const spawn = (Array.isArray(op.spawn) ? op.spawn : entry?.spawn ?? [0, 0, 0]) as [number, number, number];
    const yaw = typeof op.yaw === 'number' ? op.yaw : entry?.yaw ?? 0;
    const labelKey = typeof op.label === 'string' ? op.label : entry?.label;

    await TransitionLayer.fadeOut(420);

    // Bersihkan target interaksi lama sebelum scene dibongkar; kalau tidak,
    // prompt E bisa tertinggal mengarah ke objek yang sudah tidak ada.
    eventBus.emit(GameEvents.SCENE_LOAD_START, { sceneId });
    gameState.update({ location: { sceneId, pos: spawn, yaw } });
    eventBus.emit(GameEvents.SCENE_LOAD_COMPLETE, { sceneId });

    // Opsi pencahayaan khusus lokasi (mis. pasar lebih terang dari rumah).
    // Sumbernya boleh op `lighting` eksplisit atau field `lighting` pada peta
    // scenes: yang terakhir juga dipakai saat save dipuat ulang di tempat
    // ini, supaya pencahayaannya identik dengan saat disimpan.
    const lightingPreset = typeof op.lighting === 'string' ? op.lighting : entry?.lighting;
    if (lightingPreset) {
      eventBus.emit('lighting:preset', { preset: lightingPreset, transition: op.transition ?? 1.5 });
    }

    if (labelKey && op.card !== false) {
      await TransitionLayer.showChapterCard({
        kicker: t('ui.arrivedAt'),
        title: t(labelKey),
        holdMs: 1300
      });
    }

    await TransitionLayer.fadeIn(650);
  }

  private async loadChapterLocale(chapterId: string): Promise<void> {
    try {
      const response = await fetch(assetUrl(`locales/chapters/${chapterId}.json`));
      if (!response.ok) return;
      const data = await response.json();
      if (data && typeof data === 'object') {
        if (data.id) i18n.register('id', data.id);
        if (data.en) i18n.register('en', data.en);
      }
    } catch {
      // locale for chapter is optional
    }
  }

  private setupInteractables(interactables: Interactable[]): void {
    interactables.forEach(interactable => {
      if (interactable.condition) {
        const condition = this.evaluateCondition(interactable.condition);
        if (!condition) return;
      }
      eventBus.emit('interactable:register', interactable);
    });
  }

  async executeOperations(operations: ScriptOperation[]): Promise<void> {
    // Penanda rantai operasi yang sedang berjalan. Sampai sekarang tidak ada
    // cara melihat dari luar apakah skrip masih mengerjakan `cameraAnim`,
    // `gotoScene`, atau `wait` yang belum membuka dialog: pemanggil non-dialog
    // (harness auto-play) menembak interaktif lain dan memicu beberapa rantai
    // sekaligus, sehingga objective bisa mendarat terbalik.
    this.opDepth++;
    try {
      for (const op of operations) {
        try {
          await this.executeOperation(op);
        } catch (error) {
          // Satu operasi gagal hanya menghentikan operasi itu. Kalau errornya
          // merambat ke pemanggil, promise startDialog() ditolak tanpa pernah
          // menutup dialog: inDialog tetap true, WASD dan menoleh mati selamanya.
          console.error('[script] operasi skrip gagal:', op, error);
        }
        if (this.waitingForInput) break;
      }
    } finally {
      this.opDepth--;
    }
  }

  /** true selama ada rantai operasi skrip yang belum tuntas (termasuk dialog). */
  isOpsBusy(): boolean {
    return this.opDepth > 0;
  }

  async executeOperation(op: ScriptOperation): Promise<void> {
    switch (op.op) {
      case 'dialog':
        await this.startDialog(op.node);
        break;
      case 'choice':
        this.showChoices(op.options);
        break;
      case 'setFlag':
        gameState.addFlag(op.flag, op.value !== false);
        break;
      case 'addVar':
        gameState.setVariable(op.name, op.value);
        break;
      case 'if':
        if (this.evaluateCondition(op.condition)) {
          await this.executeOperations(op.then || []);
        } else if (op.else) {
          await this.executeOperations(op.else);
        }
        break;
      case 'giveClue':
        gameState.addClue(op.id);
        eventBus.emit(GameEvents.CLUE_FOUND, { id: op.id });
        gameState.setVariable('investigasi', journalManager.getInvestigasiPoints());
        break;
      case 'giveItem':
        // Hanya barang baru yang dikabarkan: giveItem bisa diulang oleh
        // interaktif yang idempoten, toast tidak boleh ikut berulang.
        if (!gameState.hasInventory(op.id)) {
          gameState.addInventory(op.id);
          eventBus.emit('inventory:added', { id: op.id });
        }
        break;
      case 'removeItem':
        gameState.removeInventory(op.id);
        break;
      case 'objective': {
        const id = typeof op.id === 'string' ? op.id : '';
        const text = typeof op.text === 'string' ? op.text : '';
        // Objektif maju ke depan: id yang sudah pernah digantikan dianggap
        // selesai dan diabaikan saat muncul lagi dari interaktif yang bisa
        // diulang pemain. Tanpa ini, memeriksa benda lama di tengah bab
        // menarik penanda tujuan mundur dan pemain disuruh mengulang langkah.
        if (id && id !== this.objectiveId && this.doneObjectives.has(id)) break;
        if (this.objectiveId && this.objectiveId !== id) this.doneObjectives.add(this.objectiveId);
        if (id && text) this.objectiveTexts.set(id, text);
        this.objectiveId = id;
        this.objectiveText = text;
        eventBus.emit('hud:objective', { id: op.id, text: op.text });
        break;
      }
      case 'chapterEnd':
        this.endChapter();
        break;
      case 'loadScene':
        await this.loadChapter(op.scene);
        break;
      case 'gotoScene':
        await this.gotoScene(op);
        break;
      case 'cutscene':
        await this.playCutscene(op.scene);
        break;
      case 'playSound':
        audioManager.play(op.key, op.options);
        break;
      case 'setLighting':
        eventBus.emit('lighting:preset', { preset: op.preset, transition: op.transition });
        break;
      case 'wait':
        await this.wait(op.duration);
        break;
      case 'cameraAnim': {
        // Animasi pandangan di dalam game: bangun dari kasur (kind 'wake',
        // langsung berbaring lalu bangkit) atau merebah tidur. Kamera dikunci
        // oleh FPSController selama animasi, jadi aman dipakai sebelum dialog.
        const duration = Number.isFinite(op.duration) && op.duration > 0 ? op.duration : 2000;
        eventBus.emit('camera:anim', {
          kind: op.kind,
          duration,
          eyeHeight: op.eyeHeight,
          pitch: op.pitch
        });
        await this.wait(duration);
        break;
      }
      case 'checkpoint':
        await this.saveCheckpoint(op.id);
        break;
      case 'startPuzzle':
        eventBus.emit('puzzle:start', { id: op.id, config: op.config });
        break;
      case 'echo':
        this.handleEcho(op);
        break;
      case 'ending':
        this.triggerEnding(op.id);
        break;
      case 'setPOV':
        gameState.set('pov', op.pov);
        break;
      case 'setTime':
        gameState.set('jam', op.jam);
        gameState.set('hari', op.hari);
        break;
      case 'teleport':
        gameState.update({ location: { ...gameState.get('location'), pos: op.pos, yaw: op.yaw } });
        eventBus.emit('player:teleport', { pos: op.pos, yaw: op.yaw });
        break;
      case 'setEcho':
        gameState.setEcho(op.key, op.value);
        break;
      case 'addEmpati':
        gameState.setVariable('empatiPoin', Math.max(0, Math.min(3, gameState.getVariable('empatiPoin') + (op.value || 1))));
        break;
      case 'addNurani':
        gameState.setVariable('nurani', Math.max(0, Math.min(4, gameState.getVariable('nurani') + (op.value || 1))));
        break;
      case 'modifyPercayaDimas':
        gameState.setVariable('percayaDimas', Math.max(0, Math.min(5, gameState.getVariable('percayaDimas') + (op.value || 0))));
        break;
      case 'modifyPercayaRudi':
        gameState.setVariable('percayaRudi', op.value);
        break;
      case 'setKonfrontasiDini':
        gameState.setVariable('konfrontasiDini', op.value);
        break;
      case 'setEmpatiB15':
        gameState.setVariable('empatiB15', op.value);
        break;
      case 'setJoyDitemui':
        gameState.setVariable('joyDitemui', op.value);
        break;
      case 'setB20Pilihan':
        gameState.setVariable('b20Pilihan', op.value);
        break;
      case 'calculateKeyakinan':
        this.calculateKeyakinan();
        break;
      default:
        console.warn(`Unknown operation: ${op.op}`);
    }
  }

  private evaluateCondition(condition: string): boolean {
    try {
      const vars = gameState.get('variables');
      const flags = gameState.get('flags');
      const clues = gameState.get('clues');
      const inventory = gameState.get('inventory');

      // `inventory` disuntikkan sebagai parameter keempat supaya syarat seperti
      // `!inventory.includes('obeng')` bisa dipakai di `condition`: baik saat
      // interaktif didaftarkan maupun saat op `if` dijalankan.
      const func = new Function('vars', 'flags', 'clues', 'inventory', `return ${condition};`);
      return func(vars, flags, clues, inventory);
    } catch (e) {
      console.warn('Condition evaluation failed:', condition, e);
      return false;
    }
  }

  private async startDialog(nodeId: string): Promise<void> {
    if (!this.currentScript) return;

    const epoch = this.dialogEpoch;
    this.currentDialogId = nodeId;
    const dialogData = this.currentScript.dialogs[nodeId];
    if (!dialogData) {
      // Node tidak ditemukan (typo konten, atau bab sudah berganti di tengah
      // dialog). Tanpa penanganan ini inDialog tetap true padahal tidak ada
      // lagi yang menunggu input, sehingga permainan macet total.
      console.warn(`Dialog node tidak ditemukan: ${nodeId} (bab ${this.currentScript.id})`);
      this.currentDialogId = null;
      if (gameState.get('inDialog')) {
        gameState.set('inDialog', false);
        gameState.set('currentDialog', null);
        eventBus.emit(GameEvents.DIALOG_END, {});
      }
      return;
    }

    gameState.set('inDialog', true);
    gameState.set('currentDialog', nodeId);

    try {
      for (const node of dialogData) {
        if (epoch !== this.dialogEpoch) return; // bab berganti di tengah dialog

        if (node.onEnter) {
          await this.executeOperations(node.onEnter);
        }
        if (epoch !== this.dialogEpoch) return;

        eventBus.emit(GameEvents.DIALOG_START, {
          speaker: node.speaker,
          text: t(node.text),
          choices: node.choices
        });

        await this.waitForDialogContinue();
        if (epoch !== this.dialogEpoch) return;

        if (node.choices && node.choices.length > 0) {
          const shown = this.showChoices(node.choices);
          if (shown.length) {
            const choice = await this.waitForChoice();
            if (epoch !== this.dialogEpoch) return;
            if (choice) {
              const choiceNode = node.choices.find(c => c.next === choice);
              if (choiceNode?.onSelect) {
                await this.executeOperations(choiceNode.onSelect);
              }
              if (choiceNode?.next) {
                await this.startDialog(choiceNode.next);
                return;
              }
            }
          }
        } else if (node.autoNext) {
          await this.startDialog(node.autoNext);
          return;
        }

        if (node.onExit) {
          await this.executeOperations(node.onExit);
        }
      }
    } finally {
      // inDialog adalah gerbang WASD + menoleh di updateGameSystems. Kalau
      // ditinggal true (exception di tengah dialog, promise ditolak, bab
      // berganti), pemain tidak akan bisa bergerak lagi dan tidak ada yang
      // melepasnya. finally menutup pintu di semua jalur keluar.
      if (gameState.get('inDialog')) {
        gameState.set('inDialog', false);
        gameState.set('currentDialog', null);
        this.currentDialogId = null;
        eventBus.emit(GameEvents.DIALOG_END, {});
      }
    }
  }

  private showChoices(choices: DialogChoice[]): DialogChoice[] {
    this.waitingForInput = true;
    const validChoices = choices.filter(c => !c.condition || this.evaluateCondition(c.condition));
    if (!validChoices.length) {
      // Semua pilihan ter-filter kondisinya: jangan menunggu input yang tidak
      // pernah datang (macet).
      this.waitingForInput = false;
      return [];
    }
    eventBus.emit('dialog:choices', { choices: validChoices });
    return validChoices;
  }

  private waitForChoice(): Promise<string | null> {
    return new Promise(resolve => {
      const handler = (data: any) => {
        const choice = data?.choice ?? null;
        eventBus.off('dialog:choice', handler);
        if (this.resolveChoice === wrapped) this.resolveChoice = null;
        this.waitingForInput = false;
        resolve(choice);
      };
      const wrapped = handler;
      eventBus.on('dialog:choice', handler);
      this.resolveChoice = wrapped;
    });
  }

  private waitForDialogContinue(): Promise<void> {
    return new Promise(resolve => {
      const handler = () => {
        eventBus.off('dialog:continue', handler);
        if (this.resolveContinue === wrapped) this.resolveContinue = null;
        resolve();
      };
      const wrapped = handler;
      eventBus.on('dialog:continue', handler);
      this.resolveContinue = wrapped;
    });
  }

  private async wait(duration: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, duration));
  }

  private async saveCheckpoint(id: string): Promise<void> {
    const state = gameState.getState();
    await saveManager.saveToSlot(`checkpoint-${id}`, {
      ...state,
      location: state.location,
      vars: state.variables,
      flags: state.flags,
      clues: state.clues,
      inventory: state.inventory,
      echo: state.echo,
      endingsUnlocked: state.endingsUnlocked,
      playtimeSec: state.playtime
    } as any);
  }

  private handleEcho(op: ScriptOperation): void {
    const echoKey = `echo_${op.from}_${op.to}`;
    gameState.setEcho(echoKey, true);
    eventBus.emit('echo:trigger', { from: op.from, to: op.to, data: op.data });
  }

  private calculateKeyakinan(): void {
    const vars = gameState.get('variables');
    const keyakinan = vars.investigasi + (vars.buktiKalung ? 1 : 0) + (vars.buktiCukong ? 1 : 0);
    gameState.setVariable('keyakinan', keyakinan);
  }

  private async playCutscene(scene: string): Promise<void> {
    eventBus.emit('cutscene:play', { scene });
    await this.wait(1000);
  }

  private triggerEnding(endingId: string): void {
    gameState.unlockEnding(endingId);
    eventBus.emit(GameEvents.ENDING_REACHED, { ending: endingId });
  }

  private endChapter(): void {
    const chapterId = this.currentScript?.id ?? gameState.get('currentChapter');
    if (!chapterId) return;
    eventBus.emit(GameEvents.CHAPTER_COMPLETE, {
      chapterId,
      cluesFound: gameState.get('clues').length
    });
  }

  /**
   * Hentikan semua dialog yang sedang berjalan. Dipanggil saat bab berganti
   * supaya promise lama tidak menunggu input yang tidak akan datang lagi.
   */
  private abortDialog(): void {
    this.dialogEpoch++;
    this.waitingForInput = false;
    this.currentDialogId = null;

    const hadDialog = gameState.get('inDialog');
    this.resolveContinue?.();
    this.resolveContinue = null;
    this.resolveChoice?.(null);
    this.resolveChoice = null;

    if (hadDialog) {
      gameState.set('inDialog', false);
      gameState.set('currentDialog', null);
      eventBus.emit(GameEvents.DIALOG_END, {});
    }
  }

  handleInteractableUse(interactableId: string): void {    if (!this.currentScript) return;
    const interactable = this.currentScript.interactables.find(i => i.id === interactableId);
    if (interactable) {
      // Kabarkan pemakaian sebelum naskah dijalankan: main.ts membuka pintu
      // scene yang berdekatan (pintu depan ikut berayun saat pemain "keluar"),
      // baik dipicu pemain maupun penggerak otomatis.
      eventBus.emit('interactable:used', { id: interactableId });
      if (interactable.once) {
        eventBus.emit('interactable:unregister', interactableId);
      }
      this.executeOperations(interactable.onUse);
    }
  }

  handleDialogContinue(): void {
    eventBus.emit('dialog:continue', {});
  }

  handleDialogChoice(choice: string): void {
    eventBus.emit('dialog:choice', { choice });
  }

  handlePuzzleComplete(puzzleId: string, _result: any): void {
    if (this.currentScript) {
      const puzzleOp = this.currentScript.onEnter.find(op => op.op === 'startPuzzle' && op.id === puzzleId);
      if (puzzleOp?.onComplete) {
        this.executeOperations(puzzleOp.onComplete);
      }
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}

export const scriptRunner = new ScriptRunner();