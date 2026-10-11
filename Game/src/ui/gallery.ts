import { UIManager, UIElement } from './base.js';
import { i18n, t } from '../core/i18n.js';
import { achievementManager } from '../core/achievements.js';
import { settingsManager } from '../core/settings.js';

export interface EndingData {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  playthroughDate?: string;
  stats?: {
    playtime: number;
    cluesFound: number;
    ending: string;
  };
}

export class GalleryScreen implements UIElement {
  element: HTMLElement;
  private onBack: () => void;
  private endings: EndingData[] = [];
  private currentEnding: EndingData | null = null;

  constructor(onBack: () => void) {
    this.onBack = onBack;
    this.element = this.createElement();
    this.updateText();
    i18n.subscribe(() => this.updateText());
  }

  private createElement(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'gallery-screen';
    div.className = 'screen gallery-screen';
    div.innerHTML = `
      <div class="gallery-container">
        <header class="gallery-header">
          <h2 data-i18n="ending.gallery"></h2>
          <div class="gallery-progress">
            <span class="unlocked-count">0</span> / <span class="total-count">9</span>
            <span data-i18n="ending.unlocked"></span>
          </div>
          <button id="gallery-back" class="ui-btn back-btn" data-i18n="ui.back"></button>
        </header>
        <div class="gallery-grid" id="gallery-grid"></div>
        <section class="gallery-achievements" id="gallery-achievements">
          <h3 data-i18n="achievements.title"></h3>
          <div class="achievement-list" id="achievement-list"></div>
        </section>
        <div class="gallery-detail hidden" id="gallery-detail">
          <div class="detail-content">
            <h3 class="detail-name"></h3>
            <p class="detail-description"></p>
            <div class="detail-stats hidden">
              <h4 data-i18n="ui.playtime"></h4>
              <div class="stats-grid">
                <div class="stat"><span class="stat-label" data-i18n="ui.playtime"></span><span class="stat-value playtime"></span></div>
                <div class="stat"><span class="stat-label" data-i18n="journal.clues"></span><span class="stat-value clues"></span></div>
                <div class="stat"><span class="stat-label" data-i18n="ending.ending"></span><span class="stat-value ending"></span></div>
                <div class="stat"><span class="stat-label" data-i18n="ui.date"></span><span class="stat-value date"></span></div>
              </div>
            </div>
            <button class="ui-btn" id="detail-back" data-i18n="ui.back"></button>
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
    this.renderEndings();
    this.renderAchievements();
  }

  show(): void {
    this.element.style.display = 'flex';
    document.body.appendChild(this.element);
    this.setupListeners();
    this.renderEndings();
    this.renderAchievements();
  }

  private renderAchievements(): void {
    const list = this.element.querySelector('#achievement-list');
    if (!list) return;
    const items = achievementManager.getAll();
    list.innerHTML = items.map(item => `
      <div class="achievement-item ${item.unlocked ? 'unlocked' : 'locked'}">
        <span class="achievement-icon">${item.unlocked ? '🏆' : '🔒'}</span>
        <div class="achievement-text">
          <span class="achievement-name">${item.unlocked ? t(item.nameKey) : '???'}</span>
          <span class="achievement-desc">${item.unlocked ? t(item.descKey) : t('achievements.locked')}</span>
        </div>
      </div>
    `).join('');
  }

  hide(): void {
    this.element.style.display = 'none';
    this.removeListeners();
  }

  destroy(): void {
    this.removeListeners();
    this.element.remove();
  }

  private onDetailBack = (): void => this.showGrid();

  private setupListeners(): void {
    const backBtn = this.element.querySelector('#gallery-back');
    const detailBack = this.element.querySelector('#detail-back');
    backBtn?.addEventListener('click', this.onBack);
    detailBack?.addEventListener('click', this.onDetailBack);
  }

  private removeListeners(): void {
    const backBtn = this.element.querySelector('#gallery-back');
    const detailBack = this.element.querySelector('#detail-back');
    backBtn?.removeEventListener('click', this.onBack);
    detailBack?.removeEventListener('click', this.onDetailBack);
  }

  setEndings(endings: EndingData[]): void {
    this.endings = endings;
    this.renderEndings();
  }

  private renderEndings(): void {
    const grid = this.element.querySelector('#gallery-grid') as HTMLElement;
    const unlockedCount = this.element.querySelector('.unlocked-count');
    const totalCount = this.element.querySelector('.total-count');

    if (unlockedCount) unlockedCount.textContent = this.endings.filter(e => e.unlocked).length.toString();
    if (totalCount) totalCount.textContent = this.endings.length.toString();

    if (!grid) return;

    grid.innerHTML = this.endings.map((ending, index) => `
      <div class="ending-card ${ending.unlocked ? 'unlocked' : 'locked'}" data-ending="${ending.id}">
        <div class="ending-number">${index + 1}</div>
        <div class="ending-icon">${ending.unlocked ? '🏆' : '🔒'}</div>
        <div class="ending-name">${ending.unlocked ? ending.name : '???'}</div>
        <div class="ending-status">${ending.unlocked ? t('ending.unlocked') : t('ending.locked')}</div>
      </div>
    `).join('');

    grid.querySelectorAll<HTMLElement>('.ending-card.unlocked').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.ending!;
        const ending = this.endings.find(e => e.id === id);
        if (ending) this.showDetail(ending);
      });
    });
  }

  private showDetail(ending: EndingData): void {
    this.currentEnding = ending;
    const grid = this.element.querySelector('#gallery-grid') as HTMLElement;
    const detail = this.element.querySelector('#gallery-detail') as HTMLElement;
    const name = detail.querySelector('.detail-name');
    const desc = detail.querySelector('.detail-description');
    const stats = detail.querySelector('.detail-stats') as HTMLElement;
    const playtime = detail.querySelector('.stat-value.playtime');
    const clues = detail.querySelector('.stat-value.clues');
    const endingName = detail.querySelector('.stat-value.ending');
    const date = detail.querySelector('.stat-value.date');

    grid?.classList.add('hidden');
    detail?.classList.remove('hidden');

    if (name) name.textContent = ending.name;
    if (desc) desc.textContent = ending.description;

    if (ending.stats) {
      stats?.classList.remove('hidden');
      if (playtime) playtime.textContent = this.formatTime(ending.stats.playtime);
      if (clues) clues.textContent = `${ending.stats.cluesFound}/7`;
      if (endingName) endingName.textContent = ending.stats.ending;
      if (date) date.textContent = ending.playthroughDate || '-';
    } else {
      stats?.classList.add('hidden');
    }
  }

  private showGrid(): void {
    const grid = this.element.querySelector('#gallery-grid') as HTMLElement;
    const detail = this.element.querySelector('#gallery-detail') as HTMLElement;
    grid?.classList.remove('hidden');
    detail?.classList.add('hidden');
    this.currentEnding = null;
  }

  private formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
}

export class ChapterSelectScreen implements UIElement {
  element: HTMLElement;
  private onBack: () => void;
  private onSelect: (chapterId: string) => void;
  private chapters: Array<{ id: string; name: string; hari: number; jam: string; pov: string; completed: boolean; clues: number }> = [];

  constructor(onBack: () => void, onSelect: (chapterId: string) => void) {
    this.onBack = onBack;
    this.onSelect = onSelect;
    this.element = this.createElement();
    this.updateText();
    i18n.subscribe(() => this.updateText());
  }

  private createElement(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'chapter-select';
    div.className = 'screen chapter-select';
    div.innerHTML = `
      <div class="chapter-container">
        <header class="chapter-header">
          <h2 data-i18n="ending.chapterSelect"></h2>
          <button id="chapter-back" class="ui-btn back-btn" data-i18n="ui.back"></button>
        </header>
        <div class="chapter-list" id="chapter-list"></div>
      </div>
    `;
    return div;
  }

  private updateText(): void {
    this.element.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });
    this.renderChapters();
  }

  show(): void {
    this.element.style.display = 'flex';
    document.body.appendChild(this.element);
    this.setupListeners();
    this.renderChapters();
  }

  hide(): void {
    this.element.style.display = 'none';
    this.removeListeners();
  }

  destroy(): void {
    this.removeListeners();
    this.element.remove();
  }

  private setupListeners(): void {
    const backBtn = this.element.querySelector('#chapter-back');
    backBtn?.addEventListener('click', this.onBack);
  }

  private removeListeners(): void {
    const backBtn = this.element.querySelector('#chapter-back');
    backBtn?.removeEventListener('click', this.onBack);
  }

  setChapters(chapters: ChapterSelectScreen['chapters']): void {
    this.chapters = chapters;
    this.renderChapters();
  }

  private renderChapters(): void {
    const list = this.element.querySelector('#chapter-list') as HTMLElement;
    if (!list) return;

    list.innerHTML = this.chapters.map(chapter => `
      <div class="chapter-item ${chapter.completed ? 'completed' : ''}" data-chapter="${chapter.id}">
        <div class="chapter-info">
          <div class="chapter-name">${chapter.name}</div>
          <div class="chapter-meta">
            <span>${t('ui.day')} ${chapter.hari} - ${chapter.jam}</span>
            <span>${chapter.pov}</span>
            <span>${chapter.clues}/7 clues</span>
          </div>
        </div>
        <div class="chapter-status">
          ${chapter.completed ? '✓' : '▶'}
        </div>
      </div>
    `).join('');

    list.querySelectorAll<HTMLElement>('.chapter-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.chapter!;
        this.onSelect(id);
      });
    });
  }
}