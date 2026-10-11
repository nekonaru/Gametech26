import { UIElement, confirmAction } from './base.js';
import { i18n, t } from '../core/i18n.js';
import { settingsManager } from '../core/settings.js';
import { audioManager } from '../core/audio.js';
import { eventBus } from '../core/events.js';
import { assetUrl } from '../core/paths.js';

/** Help unlocks after two minutes without progress, per the design document. */
const HELP_DELAY_MS = 120000;

export interface PuzzleConfig {
  id: string;
  type: 'dial' | 'jigsaw' | 'calendar' | 'evidence' | 'navigation' | 'timing';
  title: string;
  description: string;
  data: any;
  onSolve: (result: any) => void;
  onSkip: () => void;
  onHelp: () => void;
}

export class PuzzleScreen implements UIElement {
  element: HTMLElement;
  private config: PuzzleConfig | null = null;
  private solveStartTime = 0;
  private helpShown = false;

  constructor() {
    this.element = this.createElement();
    this.updateText();
    i18n.subscribe(() => this.updateText());
  }

  private createElement(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'puzzle-screen';
    div.className = 'screen puzzle-screen';
    div.innerHTML = `
      <div class="puzzle-container">
        <header class="puzzle-header">
          <h2 class="puzzle-title"></h2>
          <p class="puzzle-description"></p>
          <div class="puzzle-timer">00:00</div>
        </header>
        <div class="puzzle-content" id="puzzle-content"></div>
        <div class="puzzle-actions">
          <button id="puzzle-cancel" class="ui-btn secondary" data-i18n="puzzle.cancel"></button>
          <button id="puzzle-help" class="ui-btn secondary" data-i18n="puzzle.help"></button>
          <button id="puzzle-skip" class="ui-btn danger" data-i18n="puzzle.skip"></button>
        </div>
        <div class="puzzle-help-modal hidden" id="puzzle-help-modal">
          <div class="help-content">
            <h3 data-i18n="puzzle.help"></h3>
            <p class="help-text"></p>
            <button class="ui-btn" id="help-close" data-i18n="ui.close"></button>
          </div>
        </div>
      </div>
    `;
    return div;
  }

  private updateText(): void {
    this.element.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });
  }

  show(): void {
    this.element.style.display = 'flex';
    document.body.appendChild(this.element);
    this.setupListeners();
  }

  hide(): void {
    this.element.style.display = 'none';
    this.removeListeners();
    this.stopTimer();
  }

  destroy(): void {
    this.removeListeners();
    this.stopTimer();
    this.element.remove();
  }

  startPuzzle(config: PuzzleConfig): void {
    // Bersihkan sisa timer/interval puzzle sebelumnya (bila layar ini sudah
    // tampil dan langsung dipakai ulang tanpa lewat hide()).
    this.stopTimer();
    this.config = config;
    this.solveStartTime = Date.now();
    this.helpShown = false;

    const title = this.element.querySelector('.puzzle-title');
    const desc = this.element.querySelector('.puzzle-description');
    const content = this.element.querySelector('#puzzle-content') as HTMLElement;

    if (title) title.textContent = config.title;
    if (desc) desc.textContent = config.description;
    if (content) content.innerHTML = '';

    this.renderPuzzle(config);
    this.updateText();

    // Mode Naratif: timer disembunyikan (tetap berjalan untuk data statistik,
    // tapi tak menekan pemain yang datang demi cerita) dan petunjuk langsung
    // terbuka sejak detik pertama. Tingkat petunjuk puzzle (Pengaturan >
    // Aksesibilitas) mengatur seberapa cepat tombol bantuan terbuka:
    // none = disembunyikan, low = lama, medium = lebih cepat, high = langsung.
    const timerEl = this.element.querySelector('.puzzle-timer') as HTMLElement | null;
    const acc = settingsManager.get('accessibility');
    const narrative = acc?.narrativeMode === true;
    const hintLevel = acc?.puzzleHintLevel ?? 'medium';
    if (timerEl) timerEl.style.display = narrative ? 'none' : '';
    const helpBtn = this.element.querySelector('#puzzle-help') as HTMLButtonElement | null;
    if (helpBtn) helpBtn.style.display = '';
    this.startTimer();
    if (narrative || hintLevel === 'high') {
      this.unlockHelpNow();
    } else if (hintLevel === 'none') {
      if (helpBtn) helpBtn.style.display = 'none';
    } else {
      this.scheduleHelpUnlock(hintLevel === 'low' ? HELP_DELAY_MS : HELP_DELAY_MS / 2);
    }
  }

  /** Mode Naratif: buka kunci tombol petunjuk tanpa menunggu HELP_DELAY_MS. */
  private unlockHelpNow(): void {
    if (this.helpTimer) {
      window.clearTimeout(this.helpTimer);
      this.helpTimer = null;
    }
    const button = this.element.querySelector('#puzzle-help') as HTMLButtonElement | null;
    if (!button) return;
    button.disabled = false;
    button.classList.remove('help-locked');
  }

  private scheduleHelpUnlock(delayMs: number = HELP_DELAY_MS): void {
    const button = this.element.querySelector('#puzzle-help') as HTMLButtonElement | null;
    if (!button) return;
    if (this.helpTimer) window.clearTimeout(this.helpTimer);
    button.disabled = true;
    button.classList.add('help-locked');
    this.helpTimer = window.setTimeout(() => {
      this.helpTimer = null;
      button.disabled = false;
      button.classList.remove('help-locked');
    }, delayMs);
  }

  private renderPuzzle(config: PuzzleConfig): void {
    const content = this.element.querySelector('#puzzle-content') as HTMLElement;
    if (!content) return;

    switch (config.type) {
      case 'dial':
        this.renderDialPuzzle(content, config);
        break;
      case 'jigsaw':
        this.renderJigsawPuzzle(content, config);
        break;
      case 'calendar':
        this.renderCalendarPuzzle(content, config);
        break;
      case 'evidence':
        this.renderEvidencePuzzle(content, config);
        break;
      case 'navigation':
        this.renderNavigationPuzzle(content, config);
        break;
      case 'timing':
        this.renderTimingPuzzle(content, config);
        break;
    }
  }

  private renderDialPuzzle(container: HTMLElement, config: PuzzleConfig): void {
    const { digits = 4, hints = [] } = config.data;
    container.innerHTML = `
      <div class="dial-puzzle">
        <div class="dial-display">
          ${Array.from({ length: digits }, (_, i) => `<span class="dial-digit" data-index="${i}">0</span>`).join('')}
        </div>
        <div class="dial-controls">
          ${Array.from({ length: digits }, (_, i) => `
            <div class="dial-column">
              <button class="ui-btn dial-up" data-index="${i}" data-dir="up">▲</button>
              <button class="ui-btn dial-down" data-index="${i}" data-dir="down">▼</button>
            </div>
          `).join('')}
        </div>
        <div class="dial-hints">
          ${hints.map((h: any) => `<p>${h}</p>`).join('')}
        </div>
        <button class="ui-btn primary dial-submit" data-i18n="ui.confirm"></button>
      </div>
    `;

    const digits_el = container.querySelectorAll<HTMLElement>('.dial-digit');
    const values = Array(digits).fill(0);

    container.querySelectorAll<HTMLElement>('.dial-up').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index!);
        values[idx] = (values[idx] + 1) % 10;
        this.updateDialDisplay(digits_el, values);
        audioManager.playProcedural('blip', { category: 'sfx', volume: 0.2 });
      });
    });

    container.querySelectorAll<HTMLElement>('.dial-down').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index!);
        values[idx] = (values[idx] + 9) % 10;
        this.updateDialDisplay(digits_el, values);
        audioManager.playProcedural('blip', { category: 'sfx', volume: 0.2 });
      });
    });

    container.querySelector('.dial-submit')?.addEventListener('click', (ev) => {
      const code = values.join('');
      const solution = typeof config.data?.solution === 'string' ? config.data.solution : null;
      if (solution && code !== solution) {
        this.wrongFeedback(ev.currentTarget as HTMLElement);
        return;
      }
      config.onSolve({ code, values, correct: true });
    });
  }

  private wrongFeedback(button: HTMLElement | null): void {
    audioManager.playProcedural('static', { category: 'sfx', volume: 0.35 });
    if (!button) return;
    button.textContent = t('puzzle.failed');
    if (this.wrongTimer) clearTimeout(this.wrongTimer);
    this.wrongTimer = window.setTimeout(() => {
      this.wrongTimer = null;
      this.updateText();
    }, 1500);
  }

  private wrongTimer: number | null = null;

  private updateDialDisplay(digits: NodeListOf<Element>, values: number[]): void {
    digits.forEach((el, i) => {
      el.textContent = values[i].toString();
    });
  }

  private renderJigsawPuzzle(container: HTMLElement, config: PuzzleConfig): void {
    const { pieces = [], gridSize = { cols: 3, rows: 3 } } = config.data;
    const shuffled = [...pieces].sort(() => Math.random() - 0.5);

    container.innerHTML = `
      <div class="jigsaw-puzzle">
        <div class="jigsaw-board" style="grid-template-columns: repeat(${gridSize.cols}, 1fr); grid-template-rows: repeat(${gridSize.rows}, 1fr);">
          ${Array.from({ length: gridSize.cols * gridSize.rows }, (_, i) => `
            <div class="jigsaw-slot" data-slot="${i}"></div>
          `).join('')}
        </div>
        <div class="jigsaw-pieces">
          ${shuffled.map((piece, i) => `
            <div class="jigsaw-piece" draggable="true" data-piece="${piece.id}" data-index="${i}" style="background-image: url(${assetUrl(piece.image)}); transform: rotate(${piece.rotation || 0}deg);">
              <button class="rotate-btn" data-piece="${piece.id}">↻</button>
            </div>
          `).join('')}
        </div>
        <button class="ui-btn primary jigsaw-submit" data-i18n="ui.confirm"></button>
      </div>
    `;

    const rotations: Record<string, number> = {};
    pieces.forEach((p: any) => rotations[p.id] = p.rotation || 0);

    const pieces_el = container.querySelectorAll<HTMLElement>('.jigsaw-piece');
    const slots = container.querySelectorAll<HTMLElement>('.jigsaw-slot');
    const tray = container.querySelector('.jigsaw-pieces') as HTMLElement;
    let draggedPiece: HTMLElement | null = null;
    let selectedPiece: HTMLElement | null = null;

    const setSelected = (piece: HTMLElement | null): void => {
      if (selectedPiece) selectedPiece.classList.remove('selected');
      selectedPiece = piece;
      if (selectedPiece) selectedPiece.classList.add('selected');
    };

    // Pindahkan potongan ke slot. Slot yang sudah terisi harus dikembalikan ke
    // baki dulu: kalau node-nya dibuang (innerHTML = ''), potongan itu hilang
    // dari DOM dan puzzle tidak akan pernah bisa diselesaikan.
    const placePiece = (slot: HTMLElement, piece: HTMLElement | null): void => {
      if (!piece) return;
      const occupant = Array.from(slot.children)
        .find((c): c is HTMLElement => c.classList.contains('jigsaw-piece') && c !== piece);
      if (occupant) tray.appendChild(occupant);
      slot.appendChild(piece);
      piece.classList.remove('dragging');
      piece.style.transform = `rotate(${rotations[piece.dataset.piece!] || 0}deg)`;
    };

    pieces_el.forEach(piece => {
      piece.addEventListener('dragstart', (e) => {
        draggedPiece = piece as HTMLElement;
        (e as DragEvent).dataTransfer!.setData('text/plain', piece.dataset.piece!);
        piece.classList.add('dragging');
      });
      piece.addEventListener('dragend', () => {
        if (draggedPiece) draggedPiece.classList.remove('dragging');
        draggedPiece = null;
      });

      // Ketuk/klik: pilih potongan supaya bisa dipindahkan lewat sentuhan
      // (HTML5 drag & drop tidak pernah terjadi di perangkat layar sentuh).
      piece.addEventListener('click', (e) => {
        if (e.target instanceof HTMLElement && e.target.closest('.rotate-btn')) return;
        setSelected(selectedPiece === piece ? null : piece);
      });

      piece.querySelector('.rotate-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const pid = (e.target as HTMLElement).dataset.piece!;
        rotations[pid] = (rotations[pid] + 90) % 360;
        piece.style.transform = `rotate(${rotations[pid]}deg)`;
        audioManager.playProcedural('blip', { category: 'sfx', volume: 0.2 });
      });
    });

    slots.forEach(slot => {
      slot.addEventListener('dragover', (e) => e.preventDefault());
      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        const pid = (e as DragEvent).dataTransfer!.getData('text/plain');
        const piece = draggedPiece || (pid ? container.querySelector<HTMLElement>(`.jigsaw-piece[data-piece="${CSS.escape(pid)}"]`) : null);
        if (piece) {
          placePiece(slot, piece);
          setSelected(null);
          draggedPiece = null;
        }
      });
      slot.addEventListener('click', () => {
        if (selectedPiece && selectedPiece.parentElement !== slot) {
          placePiece(slot, selectedPiece);
          setSelected(null);
        }
      });
    });

    // Klik baki untuk mengembalikan potongan terpilih ke tempat awal.
    tray.addEventListener('click', (e) => {
      if (e.target !== tray || !selectedPiece) return;
      tray.appendChild(selectedPiece);
      selectedPiece.style.transform = `rotate(${rotations[selectedPiece.dataset.piece!] || 0}deg)`;
      setSelected(null);
    });

    container.querySelector('.jigsaw-submit')?.addEventListener('click', (ev) => {
      const order: string[] = Array.isArray(config.data?.solution)
        ? config.data.solution
        : pieces.map((p: any) => p.id);

      let correct = true;
      let filled = 0;
      slots.forEach((slot, i) => {
        const piece = slot.querySelector('.jigsaw-piece') as HTMLElement | null;
        if (!piece) {
          correct = false;
          return;
        }
        filled++;
        const pieceId = piece.dataset.piece!;
        if (pieceId !== order[i]) correct = false;
        if (((rotations[pieceId] % 360) + 360) % 360 !== 0) correct = false;
      });

      if (filled < slots.length || !correct) {
        this.wrongFeedback(ev.currentTarget as HTMLElement);
        return;
      }
      config.onSolve({ solution: order, rotations, correct: true });
    });
  }

  private renderCalendarPuzzle(container: HTMLElement, config: PuzzleConfig): void {
    const { dates = [], events = [] } = config.data;

    container.innerHTML = `
      <div class="calendar-puzzle">
        <div class="calendar-events">
          ${events.map((evt: any, i: number) => `
            <div class="event-card" draggable="true" data-event="${i}">
              <span class="event-title">${evt.title}</span>
              <span class="event-desc">${evt.description}</span>
            </div>
          `).join('')}
        </div>
        <div class="calendar-grid">
          ${dates.map((date: any, i: number) => `
            <div class="calendar-day" data-date="${date}" data-index="${i}">
              <span class="day-number">${date.day}</span>
              <span class="day-month">${date.month}</span>
              <div class="day-dropzone"></div>
            </div>
          `).join('')}
        </div>
        <button class="ui-btn primary calendar-submit" data-i18n="ui.confirm"></button>
      </div>
    `;

    const eventCards = container.querySelectorAll<HTMLElement>('.event-card');
    const dayDropzones = container.querySelectorAll<HTMLElement>('.day-dropzone');
    const tray = container.querySelector('.calendar-events') as HTMLElement;
    let draggedEvent: HTMLElement | null = null;
    let selectedEvent: HTMLElement | null = null;

    const setSelected = (card: HTMLElement | null): void => {
      if (selectedEvent) selectedEvent.classList.remove('selected');
      selectedEvent = card;
      if (selectedEvent) selectedEvent.classList.add('selected');
    };

    // Baki dulu, baru tempel: kartu yang sudah terisi harus dikembalikan ke
    // daftar peristiwa, jangan dibuang (innerHTML = '' membuatnya hilang dan
    // puzzle tak pernah bisa selesai).
    const placeEvent = (zone: HTMLElement, card: HTMLElement | null): void => {
      if (!card) return;
      const occupant = Array.from(zone.children)
        .find((c): c is HTMLElement => c.classList.contains('event-card') && c !== card);
      if (occupant) tray.appendChild(occupant);
      zone.appendChild(card);
      card.classList.remove('dragging');
    };

    eventCards.forEach(card => {
      card.addEventListener('dragstart', (e) => {
        draggedEvent = card as HTMLElement;
        (e as DragEvent).dataTransfer!.setData('text/plain', card.dataset.event!);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => {
        if (draggedEvent) draggedEvent.classList.remove('dragging');
        draggedEvent = null;
      });
      card.addEventListener('click', () => {
        setSelected(selectedEvent === card ? null : card);
      });
    });

    const dropOn = (zone: HTMLElement, getData: () => string): void => {
      const idx = parseInt(getData());
      const card = draggedEvent
        || (!isNaN(idx) ? container.querySelector<HTMLElement>(`.event-card[data-event="${idx}"]`) : null);
      const dayIdx = parseInt((zone.closest('.calendar-day') as HTMLElement)!.dataset.index!);
      if (!isNaN(dayIdx) && card) {
        placeEvent(zone, card);
        setSelected(null);
        draggedEvent = null;
      }
    };

    dayDropzones.forEach(zone => {
      zone.addEventListener('dragover', (e) => e.preventDefault());
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropOn(zone, () => (e as DragEvent).dataTransfer!.getData('text/plain'));
      });
      zone.addEventListener('click', () => {
        if (selectedEvent && selectedEvent.parentElement !== zone) {
          placeEvent(zone, selectedEvent);
          setSelected(null);
        }
      });
    });

    tray.addEventListener('click', (e) => {
      if (e.target !== tray || !selectedEvent) return;
      tray.appendChild(selectedEvent);
      setSelected(null);
    });

    container.querySelector('.calendar-submit')?.addEventListener('click', (ev) => {
      const order: number[] = Array.isArray(config.data?.solution)
        ? config.data.solution
        : dates.map((_: any, i: number) => i);

      // Baca penempahan dari DOM, bukan dari catatan yang menumpuk: begitu
      // kartu dipindah, catatan lama ikut usang dan bisa membuat jawaban benar
      // dianggap salah.
      const assignments: Record<number, number> = {};
      events.forEach((_: any, i: number) => {
        const card = container.querySelector<HTMLElement>(`.event-card[data-event="${i}"]`);
        const day = card?.closest('.calendar-day') as HTMLElement | null;
        if (day) assignments[i] = parseInt(day.dataset.index!, 10);
      });

      const complete = events.every((_: any, i: number) => Number.isInteger(assignments[i]));
      const correct = complete && events.every((_: any, i: number) => assignments[i] === order[i]);

      if (!correct) {
        this.wrongFeedback(ev.currentTarget as HTMLElement);
        return;
      }
      config.onSolve({ assignments, dates, events, correct: true });
    });
  }

  private renderEvidencePuzzle(container: HTMLElement, config: PuzzleConfig): void {
    const { clues = [], categories = [] } = config.data;

    container.innerHTML = `
      <div class="evidence-puzzle">
        <div class="evidence-clues">
          ${clues.map((clue: any) => `
            <div class="evidence-clue" draggable="true" data-clue="${clue.id}">
              <span>${clue.name}</span>
            </div>
          `).join('')}
        </div>
        <div class="evidence-board">
          ${categories.map((cat: any) => `
            <div class="evidence-category" data-category="${cat.id}">
              <h4 data-i18n="journal.categories.${cat.id}">${cat.name}</h4>
              <div class="evidence-slots">
                ${Array.from({ length: cat.slots || 3 }, (_, i) => `
                  <div class="evidence-slot" data-category="${cat.id}" data-slot="${i}"></div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        <button class="ui-btn primary evidence-submit" data-i18n="ui.confirm"></button>
      </div>
    `;

    const clues_el = container.querySelectorAll<HTMLElement>('.evidence-clue');
    const slots = container.querySelectorAll<HTMLElement>('.evidence-slot');
    const tray = container.querySelector('.evidence-clues') as HTMLElement;
    let draggedClue: HTMLElement | null = null;
    let selectedClue: HTMLElement | null = null;

    const setSelected = (clue: HTMLElement | null): void => {
      if (selectedClue) selectedClue.classList.remove('selected');
      selectedClue = clue;
      if (selectedClue) selectedClue.classList.add('selected');
    };

    const placeClue = (slot: HTMLElement, clue: HTMLElement | null): void => {
      if (!clue) return;
      const occupant = Array.from(slot.children)
        .find((c): c is HTMLElement => c.classList.contains('evidence-clue') && c !== clue);
      if (occupant) tray.appendChild(occupant);
      slot.appendChild(clue);
      clue.classList.remove('dragging');
    };

    clues_el.forEach(clue => {
      clue.addEventListener('dragstart', (e) => {
        draggedClue = clue as HTMLElement;
        (e as DragEvent).dataTransfer!.setData('text/plain', clue.dataset.clue!);
        clue.classList.add('dragging');
      });
      clue.addEventListener('dragend', () => {
        if (draggedClue) draggedClue.classList.remove('dragging');
        draggedClue = null;
      });
      clue.addEventListener('click', () => {
        setSelected(selectedClue === clue ? null : clue);
      });
    });

    slots.forEach(slot => {
      slot.addEventListener('dragover', (e) => e.preventDefault());
      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        const clueId = (e as DragEvent).dataTransfer!.getData('text/plain');
        const clue = draggedClue
          || (clueId ? container.querySelector<HTMLElement>(`.evidence-clue[data-clue="${CSS.escape(clueId)}"]`) : null);
        if (clue) {
          placeClue(slot, clue);
          setSelected(null);
          draggedClue = null;
        }
      });
      slot.addEventListener('click', () => {
        if (selectedClue && selectedClue.parentElement !== slot) {
          placeClue(slot, selectedClue);
          setSelected(null);
        }
      });
    });

    tray.addEventListener('click', (e) => {
      if (e.target !== tray || !selectedClue) return;
      tray.appendChild(selectedClue);
      setSelected(null);
    });

    container.querySelector('.evidence-submit')?.addEventListener('click', (ev) => {
      const solution: Record<string, string> | undefined = config.data?.solution;

      // Bangun ulang dari DOM: catatan penempatan yang menumpuk menyimpan
      // bekas kategori lama, sehingga jawaban benar bisa dianggap salah.
      const placements: Record<string, string[]> = {};
      slots.forEach(slot => {
        const clue = slot.querySelector<HTMLElement>('.evidence-clue');
        if (!clue) return;
        const category = slot.dataset.category!;
        (placements[category] ||= []).push(clue.dataset.clue!);
      });

      let correct = true;
      if (solution) {
        clues.forEach((clue: any) => {
          const category = Object.keys(placements).find(cat => placements[cat].includes(clue.id));
          if (!category || solution[clue.id] !== category) correct = false;
        });
      } else {
        correct = clues.every((clue: any) =>
          Object.keys(placements).some(cat => placements[cat].includes(clue.id))
        );
      }

      if (!correct) {
        this.wrongFeedback(ev.currentTarget as HTMLElement);
        return;
      }
      config.onSolve({ placements, clues, categories, correct: true });
    });
  }

  private renderNavigationPuzzle(container: HTMLElement, config: PuzzleConfig): void {
    const { landmarks = [], instructions = [] } = config.data;
    let currentStep = 0;
    let orientation = 0;

    container.innerHTML = `
      <div class="navigation-puzzle">
        <div class="nav-compass">
          <div class="compass-needle" style="transform: rotate(${orientation}deg)"></div>
          <div class="compass-markers">
            <span class="marker north" data-dir="0">N</span>
            <span class="marker east" data-dir="90">E</span>
            <span class="marker south" data-dir="180">S</span>
            <span class="marker west" data-dir="270">W</span>
          </div>
        </div>
        <div class="nav-instruction">${instructions[currentStep] || ''}</div>
        <div class="nav-landmarks">
          ${landmarks.map((lm: any, i: number) => `
            <button class="ui-btn landmark-btn ${i === 0 ? 'active' : ''}" data-landmark="${i}">
              ${lm.name} (${lm.direction}°)
            </button>
          `).join('')}
        </div>
        <div class="nav-controls">
          <button class="ui-btn nav-turn" data-dir="left">◄</button>
          <button class="ui-btn nav-turn" data-dir="right">►</button>
          <button class="ui-btn primary nav-move" data-i18n="ui.confirm">Move</button>
        </div>
      </div>
    `;

    const instruction = container.querySelector('.nav-instruction');
    const landmarks_el = container.querySelectorAll<HTMLElement>('.landmark-btn');
    const needle = container.querySelector('.compass-needle') as HTMLElement;

    const showStep = (index: number): void => {
      landmarks_el.forEach(b => b.classList.remove('active'));
      landmarks_el[index]?.classList.add('active');
      if (instruction && instructions[index]) instruction.textContent = instructions[index];
    };

    container.querySelectorAll<HTMLElement>('.nav-turn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dir = btn.dataset.dir!;
        orientation = (orientation + (dir === 'left' ? -45 : 45) + 360) % 360;
        if (needle) needle.style.transform = `rotate(${orientation}deg)`;
        audioManager.playProcedural('blip', { category: 'sfx', volume: 0.2 });
      });
    });

    landmarks_el.forEach((btn, i) => {
      btn.addEventListener('click', () => {
        // Tombol landmark hanya pratinjau arah & instruksinya. Sasaran tetap
        // currentStep, kalau tidak pemain bisa melompat ke landmark terakhir
        // dan menyelesaikan puzzle tanpa navigasi apa pun.
        landmarks_el.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (instruction && instructions[i]) instruction.textContent = instructions[i];
      });
    });

    container.querySelector('.nav-move')?.addEventListener('click', () => {
      const landmark = landmarks[currentStep];
      if (!landmark) return;
      // Selisih lingkaran terkecil: rumus lama (|o - d| mod 360) gagal saat
      // salah satu nilai melewati 0°, mis. arah 10° sementara orientasi 350°.
      const delta = Math.abs(((orientation - landmark.direction) % 360 + 540) % 360 - 180);
      if (delta <= 22.5) {
        currentStep++;
        if (currentStep >= landmarks.length) {
          config.onSolve({ success: true, path: landmarks.map((l: any) => l.name) });
        } else {
          showStep(currentStep);
        }
      } else {
        audioManager.playProcedural('static', { category: 'sfx', volume: 0.3 });
      }
    });
  }

  private renderTimingPuzzle(container: HTMLElement, config: PuzzleConfig): void {
    const { rings = 3, speeds = [2000, 3000, 4000] } = config.data;
    let activeRing = 0;
    // Posisi disimpan sebagai (basis, waktu mulai) dan dihitung dari waktu
    // nyata. Rumus lama menambah "16ms" setiap tick, padahal browser bisa
    // men-throttle/membekukan interval saat tab tidak aktif: cincin berhenti
    // berputar dan puzzle jadi mustahil diselesaikan.
    const ringBase: number[] = Array(rings).fill(0);
    const ringStart: number[] = Array(rings).fill(0);
    const ringPositions: number[] = Array(rings).fill(0);
    const ringIntervals: number[] = [];

    const posOf = (index: number): number => {
      if (!ringStart[index]) return ringPositions[index];
      const speed = speeds[index] || 2000;
      const elapsed = performance.now() - ringStart[index];
      return (((ringBase[index] + (elapsed * 360) / speed) % 360) + 360) % 360;
    };

    container.innerHTML = `
      <div class="timing-puzzle">
        <div class="timing-rings">
          ${Array.from({ length: rings }, (_, i) => `
            <div class="timing-ring" data-ring="${i}">
              <div class="ring-track">
                <div class="ring-gap" style="--gap-size: ${360 / 8}deg;"></div>
              </div>
              <div class="ring-indicator"></div>
            </div>
          `).join('')}
        </div>
        <div class="timing-controls">
          <button class="ui-btn primary timing-act" data-i18n="ui.confirm">Act</button>
        </div>
        <div class="timing-hint" data-i18n="puzzle.hint"></div>
      </div>
    `;

    const rings_el = container.querySelectorAll<HTMLElement>('.timing-ring');
    const actBtn = container.querySelector('.timing-act') as HTMLButtonElement;

    const paint = (index: number): void => {
      const pos = posOf(index);
      ringPositions[index] = pos;
      const ring = rings_el[index] as HTMLElement;
      if (ring) ring.style.setProperty('--rotation', `${pos}deg`);
    };

    const startRing = (index: number): void => {
      // Samakan dengan posisi terkini dulu: interval bisa saja sempat dibekukan.
      if (ringStart[index]) ringPositions[index] = posOf(index);
      ringBase[index] = ringPositions[index];
      ringStart[index] = performance.now();
      if (ringIntervals[index]) clearInterval(ringIntervals[index]);
      paint(index);
      ringIntervals[index] = window.setInterval(() => paint(index), 16);
    };

    rings_el.forEach((_, i) => startRing(i));
    rings_el[0]?.classList.add('active');
    this.puzzleCleanup = () => ringIntervals.forEach(id => clearInterval(id));

    actBtn?.addEventListener('click', () => {
      const pos = posOf(activeRing);
      ringPositions[activeRing] = pos;
      const gapCenter = 0;
      const tolerance = 22.5;
      const diff = Math.min((pos - gapCenter + 360) % 360, (gapCenter - pos + 360) % 360);

      if (diff <= tolerance) {
        clearInterval(ringIntervals[activeRing]);
        const ring = rings_el[activeRing];
        ring?.classList.add('completed');
        ring?.classList.remove('active');
        activeRing++;
        if (activeRing >= rings) {
          config.onSolve({ success: true, rings });
        } else {
          // Sorot cincin berikutnya supaya pemain tahu harus mengincar yang mana.
          rings_el[activeRing]?.classList.add('active');
          startRing(activeRing);
        }
      } else {
        audioManager.playProcedural('static', { category: 'sfx', volume: 0.3 });
      }
    });
  }

  private startTimer(): void {
    const timerEl = this.element.querySelector('.puzzle-timer');
    const update = () => {
      const elapsed = Date.now() - this.solveStartTime;
      const m = Math.floor(elapsed / 60000);
      const s = Math.floor((elapsed % 60000) / 1000);
      if (timerEl) timerEl.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };
    update();
    this.timerInterval = window.setInterval(update, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.helpTimer) {
      clearTimeout(this.helpTimer);
      this.helpTimer = null;
    }
    if (this.wrongTimer) {
      clearTimeout(this.wrongTimer);
      this.wrongTimer = null;
    }
    if (this.puzzleCleanup) {
      this.puzzleCleanup();
      this.puzzleCleanup = null;
    }
  }

  private timerInterval: number | null = null;
  private helpTimer: number | null = null;
  private puzzleCleanup: (() => void) | null = null;

  private abortController: AbortController | null = null;

  private setupListeners(): void {
    if (this.abortController) this.abortController.abort();
    const signal = (this.abortController = new AbortController()).signal;

    const helpBtn = this.element.querySelector('#puzzle-help');
    const skipBtn = this.element.querySelector('#puzzle-skip');
    const cancelBtn = this.element.querySelector('#puzzle-cancel');
    const helpModal = this.element.querySelector('#puzzle-help-modal');
    const helpClose = this.element.querySelector('#help-close');

    // Batal: tutup puzzle tanpa menyelesaikan/melewati. Timer dan bantuan
    // di-reset oleh hide() -> stopTimer(), jadi pemain bebas membuka ulang
    // puzzle dari interaktif yang sama nanti: tidak ada progres yang hilang
    // dan tidak ada prestasi yang tercatat.
    cancelBtn?.addEventListener('click', () => {
      eventBus.emit('puzzle:cancelled', { id: this.config?.id ?? null });
    }, { signal });

    helpBtn?.addEventListener('click', () => {
      this.helpShown = true;
      helpModal?.classList.remove('hidden');
      this.config?.onHelp();
    }, { signal });

    skipBtn?.addEventListener('click', () => {
      void confirmAction(t('puzzle.skipConfirm'), {
        title: t('ui.skip'),
        confirmLabel: t('ui.yes'),
        cancelLabel: t('ui.no')
      }).then(ok => {
        if (ok) this.config?.onSkip();
      });
    }, { signal });

    helpClose?.addEventListener('click', () => {
      helpModal?.classList.add('hidden');
    }, { signal });
  }

  private removeListeners(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  setHelpText(text: string): void {
    const helpText = this.element.querySelector('.help-text');
    if (helpText) helpText.textContent = text;
  }

  showSolved(): void {
    const content = this.element.querySelector('#puzzle-content') as HTMLElement;
    if (content) {
      content.innerHTML = `<div class="puzzle-solved"><h3>${t('puzzle.solved')}</h3></div>`;
    }
  }

  showFailed(): void {
    const content = this.element.querySelector('#puzzle-content') as HTMLElement;
    if (content) {
      content.innerHTML = `<div class="puzzle-failed"><h3>${t('puzzle.failed')}</h3><p>${t('puzzle.hint')}</p></div>`;
    }
  }
}