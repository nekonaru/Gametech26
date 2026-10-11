import { UIManager, UIElement, escapeHtml } from './base.js';
import { i18n, t } from '../core/i18n.js';
import { settingsManager } from '../core/settings.js';
import { eventBus } from '../core/events.js';

export class JournalScreen implements UIElement {
  element: HTMLElement;
  private onClose: () => void;
  private currentTab: 'missions' | 'clues' | 'notes' = 'missions';
  private clues: Map<string, { id: string; title: string; description: string; chapter: string; discovered: boolean }> = new Map();
  private notes: string[] = [];
  /** Data tab Misi: tujuan berjalan + langkah yang sudah selesai di bab ini. */
  private missions: {
    chapterTitle: string;
    hari: number | null;
    current: { id: string; text: string } | null;
    done: Array<{ id: string; text: string }>;
  } | null = null;

  constructor(onClose: () => void) {
    this.onClose = onClose;
    this.element = this.createElement();
    this.updateText();
    i18n.subscribe(() => this.updateText());
  }

  private createElement(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'journal-screen';
    div.className = 'screen journal-screen';
    div.innerHTML = `
      <div class="journal-container">
        <header class="journal-header">
          <h2 data-i18n="journal.title"></h2>
          <button id="journal-board" class="ui-btn secondary" data-i18n="journal.evidenceBoard"></button>
          <button id="journal-close" class="ui-btn close-btn" data-i18n="ui.close"></button>
        </header>
        <nav class="journal-tabs">
          <button class="tab-btn active" data-tab="missions" data-i18n="journal.missions"></button>
          <button class="tab-btn" data-tab="clues" data-i18n="journal.clues"></button>
          <button class="tab-btn" data-tab="notes" data-i18n="journal.notes"></button>
        </nav>
        <div class="journal-content">
          <div id="tab-missions" class="tab-panel">
            <div class="missions-meta" id="missions-meta"></div>
            <div class="missions-current" id="missions-current"></div>
            <h3 class="missions-heading" data-i18n="journal.missionsDone"></h3>
            <div class="missions-list" id="missions-list"></div>
          </div>
          <div id="tab-clues" class="tab-panel hidden">
            <div class="clues-list" id="clues-list"></div>
            <div class="clue-detail hidden" id="clue-detail">
              <h3 class="detail-title"></h3>
              <p class="detail-desc"></p>
              <p class="detail-chapter"></p>
            </div>
          </div>
          <div id="tab-notes" class="tab-panel hidden">
            <div class="notes-list" id="notes-list"></div>
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
    this.renderMissions();
    this.renderClues();
    this.renderNotes();
  }

  show(): void {
    this.element.style.display = 'flex';
    document.body.appendChild(this.element);
    this.setupListeners();
  }

  hide(): void {
    this.element.style.display = 'none';
    this.removeListeners();
  }

  destroy(): void {
    this.removeListeners();
    this.element.remove();
  }

  private onOpenBoard = (): void => eventBus.emit('evidenceBoard:open', {});

  private setupListeners(): void {
    const closeBtn = this.element.querySelector('#journal-close');
    closeBtn?.addEventListener('click', this.onClose);
    this.element.querySelector('#journal-board')?.addEventListener('click', this.onOpenBoard);

    this.element.querySelectorAll<HTMLElement>('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = (e.currentTarget as HTMLButtonElement).dataset.tab as 'missions' | 'clues' | 'notes';
        this.showTab(tab);
      });
    });
  }

  private removeListeners(): void {
    const closeBtn = this.element.querySelector('#journal-close');
    closeBtn?.removeEventListener('click', this.onClose);
    this.element.querySelector('#journal-board')?.removeEventListener('click', this.onOpenBoard);

    this.element.querySelectorAll<HTMLElement>('.tab-btn').forEach(btn => {
      btn.replaceWith(btn.cloneNode(true));
    });
  }

  private showTab(tab: 'missions' | 'clues' | 'notes'): void {
    this.currentTab = tab;
    this.element.querySelectorAll<HTMLElement>('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    this.element.querySelectorAll<HTMLElement>('.tab-panel').forEach(panel => {
      panel.classList.toggle('hidden', panel.id !== `tab-${tab}`);
    });
  }

  /** Isi data tab Misi (dipanggil main tiap journa dibuka). */
  setMissions(data: {
    chapterTitle: string;
    hari: number | null;
    current: { id: string; text: string } | null;
    done: Array<{ id: string; text: string }>;
  }): void {
    this.missions = data;
    this.renderMissions();
  }

  private renderMissions(): void {
    const meta = this.element.querySelector('#missions-meta') as HTMLElement | null;
    const current = this.element.querySelector('#missions-current') as HTMLElement | null;
    const list = this.element.querySelector('#missions-list') as HTMLElement | null;
    if (!meta || !current || !list) return;
    if (!this.missions) {
      meta.textContent = '';
      current.textContent = '';
      list.innerHTML = '';
      return;
    }
    const parts: string[] = [];
    if (this.missions.hari) parts.push(`${t('ui.day')} ${this.missions.hari}`);
    if (this.missions.chapterTitle) parts.push(this.missions.chapterTitle);
    meta.textContent = parts.join(' • ');
    if (this.missions.current) {
      current.innerHTML = `<span class="mission-now-tag" data-i18n="journal.missionNow"></span>`
        + `<span class="mission-now-text">${escapeHtml(t(this.missions.current.text))}</span>`;
    } else {
      current.textContent = '';
    }
    list.innerHTML = this.missions.done.length
      ? this.missions.done.map(entry =>
          `<div class="mission-done">✓ <span>${escapeHtml(t(entry.text))}</span></div>`
        ).join('')
      : `<div class="mission-empty" data-i18n="journal.missionsNone"></div>`;
  }

  addClue(id: string, title: string, description: string, chapter: string): void {
    this.clues.set(id, { id, title, description, chapter, discovered: true });
    this.renderClues();
  }

  removeClue(id: string): void {
    this.clues.delete(id);
    this.renderClues();
  }

  addNote(note: string): void {
    this.notes.push(note);
    this.renderNotes();
  }

  setNotes(notes: string[]): void {
    this.notes = [...notes];
    this.renderNotes();
  }

  private renderClues(): void {
    const list = this.element.querySelector('#clues-list') as HTMLElement;
    if (!list) return;

    list.innerHTML = '';
    this.clues.forEach(clue => {
      const item = document.createElement('div');
      item.className = `clue-item ${clue.discovered ? 'discovered' : 'locked'}`;
      item.dataset.clueId = clue.id;
      item.innerHTML = `
        <div class="clue-icon">${clue.discovered ? '📝' : '🔒'}</div>
        <div class="clue-info">
          <span class="clue-title">${clue.title}</span>
          <span class="clue-chapter">${clue.chapter}</span>
        </div>
      `;
      item.addEventListener('click', () => this.showClueDetail(clue));
      list.appendChild(item);
    });
  }

  private showClueDetail(clue: { id: string; title: string; description: string; chapter: string; discovered: boolean }): void {
    const detail = this.element.querySelector('#clue-detail') as HTMLElement;
    const title = detail.querySelector('.detail-title');
    const desc = detail.querySelector('.detail-desc');
    const chapter = detail.querySelector('.detail-chapter');

    if (title) title.textContent = clue.title;
    if (desc) desc.textContent = clue.description;
    if (chapter) chapter.textContent = `${t('journal.chapter')}: ${clue.chapter}`;

    detail.classList.remove('hidden');
  }

  private renderNotes(): void {
    const list = this.element.querySelector('#notes-list') as HTMLElement;
    if (!list) return;

    list.innerHTML = this.notes.map((note, i) => `
      <div class="note-item">
        <span class="note-number">${i + 1}.</span>
        <span class="note-text">${note}</span>
      </div>
    `).join('');
  }
}

export class EvidenceBoardScreen implements UIElement {
  element: HTMLElement;
  private onClose: () => void;
  private onSolve: (connections: Map<string, string[]>) => void;
  private clues: string[] = [];
  private clueTitles: Map<string, string> = new Map();
  private categories = ['motive', 'time', 'location', 'victim', 'physicalEvidence'];
  private connections: Map<string, string[]> = new Map();
  private selectedClue: string | null = null;
  private dropzonesBound = false;

  constructor(onClose: () => void, onSolve: (connections: Map<string, string[]>) => void) {
    this.onClose = onClose;
    this.onSolve = onSolve;
    this.element = this.createElement();
    this.updateText();
    i18n.subscribe(() => this.updateText());
  }

  private createElement(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'evidence-board';
    div.className = 'screen evidence-board';
    div.innerHTML = `
      <div class="board-container">
        <header class="board-header">
          <h2 data-i18n="journal.evidenceBoard"></h2>
          <p class="board-hint" data-i18n="journal.connectClues"></p>
          <button id="board-close" class="ui-btn close-btn" data-i18n="ui.close"></button>
        </header>
        <div class="board-content">
          <div class="clues-pool" id="clues-pool"></div>
          <div class="board-grid" id="board-grid">
            ${this.categories.map(cat => `
              <div class="category-slot" data-category="${cat}">
                <h3 data-i18n="journal.categories.${cat}"></h3>
                <div class="slot-dropzone" data-category="${cat}"></div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="board-actions">
          <button id="board-solve" class="ui-btn primary" data-i18n="ui.confirm"></button>
          <button id="board-reset" class="ui-btn secondary" data-i18n="ui.cancel"></button>
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
    this.render();
  }

  hide(): void {
    this.element.style.display = 'none';
    this.removeListeners();
  }

  destroy(): void {
    this.removeListeners();
    this.element.remove();
  }

  setClues(clues: string[], resolveTitle?: (id: string) => string): void {
    this.clues = clues;
    this.clueTitles.clear();
    clues.forEach(id => this.clueTitles.set(id, resolveTitle ? resolveTitle(id) : id));
    // Petunjuk yang tidak lagi dimiliki pemain (mis. setelah muat save lama)
    // jangan sampai tersisa di papan sebagai koneksi yatim.
    this.connections.forEach(list => {
      for (let i = list.length - 1; i >= 0; i--) {
        if (!clues.includes(list[i])) list.splice(i, 1);
      }
    });
    this.selectedClue = null;
    this.render();
  }

  private onSolveClick = (): void => {
    this.selectedClue = null;
    this.updateSelection();
    this.onSolve(this.connections);
  };
  private onResetClick = (): void => this.resetBoard();

  private setupListeners(): void {
    const closeBtn = this.element.querySelector('#board-close');
    const solveBtn = this.element.querySelector('#board-solve');
    const resetBtn = this.element.querySelector('#board-reset');

    closeBtn?.addEventListener('click', this.onClose);
    solveBtn?.addEventListener('click', this.onSolveClick);
    resetBtn?.addEventListener('click', this.onResetClick);
  }

  private removeListeners(): void {
    const closeBtn = this.element.querySelector('#board-close');
    const solveBtn = this.element.querySelector('#board-solve');
    const resetBtn = this.element.querySelector('#board-reset');

    closeBtn?.removeEventListener('click', this.onClose);
    solveBtn?.removeEventListener('click', this.onSolveClick);
    resetBtn?.removeEventListener('click', this.onResetClick);
  }

  private resetBoard(): void {
    this.connections.clear();
    this.selectedClue = null;
    this.render();
  }

  private render(): void {
    const pool = this.element.querySelector('#clues-pool') as HTMLElement;
    const placed = new Set<string>();
    this.connections.forEach(list => list.forEach(c => placed.add(c)));

    // Petunjuk yang sudah ditempel pindah dari kolam ke papan, supaya satu
    // petunjuk tidak bisa berdiri di dua kategori sekaligus.
    const available = this.clues.filter(clue => !placed.has(clue));
    pool.innerHTML = available.length > 0
      ? available.map(clue => `
          <div class="clue-card" draggable="true" data-clue="${clue}">
            <span class="clue-name">${this.clueTitles.get(clue) || clue}</span>
          </div>
        `).join('')
      : `<p class="board-empty">${t('ui.boardNoClues')}</p>`;

    this.categories.forEach(cat => {
      const dropzone = this.element.querySelector(`.slot-dropzone[data-category="${cat}"]`) as HTMLElement;
      const connected = this.connections.get(cat) || [];
      dropzone.innerHTML = connected.map(clue => `
        <div class="placed-clue" data-clue="${clue}" data-category="${cat}">
          <span>${this.clueTitles.get(clue) || clue}</span>
          <button class="remove-clue" aria-label="${t('ui.close')}">×</button>
        </div>
      `).join('');
    });

    this.updateSelection();
    this.setupDragDrop();
  }

  private updateSelection(): void {
    this.element.querySelectorAll<HTMLElement>('.clue-card, .placed-clue').forEach(el => {
      el.classList.toggle('selected', !!this.selectedClue && el.dataset.clue === this.selectedClue);
    });
  }

  private select(clue: string | null): void {
    this.selectedClue = this.selectedClue === clue ? null : clue;
    this.updateSelection();
  }

  /** Tempelkan petunjuk ke kategori, mencabutnya dulu dari kategori lain. */
  private placeClue(clue: string | null, category: string): void {
    if (!clue || !category) return;
    this.connections.forEach(list => {
      const idx = list.indexOf(clue);
      if (idx >= 0) list.splice(idx, 1);
    });
    if (!this.connections.has(category)) this.connections.set(category, []);
    const list = this.connections.get(category)!;
    if (!list.includes(clue)) list.push(clue);
    this.selectedClue = null;
    this.render();
  }

  private setupDragDrop(): void {
    const cards = this.element.querySelectorAll<HTMLElement>('.clue-card');
    const placedCards = this.element.querySelectorAll<HTMLElement>('.placed-clue');
    const dropzones = this.element.querySelectorAll<HTMLElement>('.slot-dropzone');

    cards.forEach(card => {
      card.addEventListener('dragstart', (e) => {
        (e as DragEvent).dataTransfer!.setData('text/plain', card.dataset.clue || '');
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      // Ketuk/klik: drag & drop HTML5 tidak pernah terjadi di layar sentuh.
      card.addEventListener('click', () => this.select(card.dataset.clue || null));
    });

    placedCards.forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target instanceof HTMLElement && e.target.closest('.remove-clue')) return;
        this.select(el.dataset.clue || null);
      });
    });

    // .slot-dropzone hidup selama layar ini ada (bukan dibuat ulang tiap
    // render), jadi pasang listenernya sekali saja: kalau tidak, setiap
    // render menumpukkan listener baru di elemen yang sama.
    if (!this.dropzonesBound) {
      this.dropzonesBound = true;
      dropzones.forEach(zone => {
        zone.addEventListener('dragover', (e) => e.preventDefault());
        zone.addEventListener('drop', (e) => {
          e.preventDefault();
          const clue = (e as DragEvent).dataTransfer!.getData('text/plain');
          this.placeClue(clue, zone.dataset.category!);
        });
        zone.addEventListener('click', (e) => {
          // Klik petunjuk yang sudah tertempel harus MEMILIH, bukan langsung
          // menempelkannya lagi: tanpa guard ini event-nya ter-bubble ke
          // dropzone miliknya sendiri, seleksi langsung dibatalkan, dan
          // petunjuk tidak bisa dipindah (apalagi lewat sentuhan).
          if (e.target instanceof HTMLElement && e.target.closest('.placed-clue')) return;
          if (this.selectedClue) this.placeClue(this.selectedClue, zone.dataset.category!);
        });
      });
    }

    this.element.querySelectorAll<HTMLElement>('.remove-clue').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const placed = (e.target as HTMLElement).closest('.placed-clue') as HTMLElement;
        const clue = placed.dataset.clue!;
        const category = placed.dataset.category!;
        const arr = this.connections.get(category) || [];
        const idx = arr.indexOf(clue);
        if (idx >= 0) arr.splice(idx, 1);
        this.selectedClue = null;
        this.render();
      });
    });
  }
}