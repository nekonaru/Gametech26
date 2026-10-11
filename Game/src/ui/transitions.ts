import { t } from '../core/i18n.js';
import { escapeHtml } from './base.js';

/**
 * Lapisan transisi layar: fade hitam dan kartu babak.
 *
 * Perpindahan bab sebelumnya terjadi "serta-merta": layar langsung berpindah
 * tempat tanpa jeda sehingga pemain kehilangan orientasi. Dengan fade pendek
 * plus kartu judul, perpindahan terbaca sebagai satu babak yang selesai dan
 * babak berikutnya yang mulai: penyelesaian scene jelas tanpa memutus alur.
 */
export class TransitionLayer {
  private static fadeEl: HTMLElement | null = null;
  private static cardEl: HTMLElement | null = null;

  /** Pastikan node dasar sudah ada (dipanggil sekali, aman diulang). */
  private static ensure(): void {
    if (!this.fadeEl || !this.fadeEl.isConnected) {
      this.fadeEl = document.getElementById('scene-fade') ?? document.createElement('div');
      this.fadeEl.id = 'scene-fade';
      this.fadeEl.className = 'scene-fade';
      if (!this.fadeEl.isConnected) document.body.appendChild(this.fadeEl);
    }
    if (!this.cardEl || !this.cardEl.isConnected) {
      this.cardEl = document.getElementById('chapter-card') ?? document.createElement('div');
      this.cardEl.id = 'chapter-card';
      this.cardEl.className = 'chapter-card hidden';
      if (!this.cardEl.isConnected) document.body.appendChild(this.cardEl);
    }
  }

  /**
   * Redupkan layar ke hitam. Idempoten: kalau sudah hitam, langsung selesai
   * tanpa menambah penghitung: tanpa itu "pending" bisa tersangkut dan
   * layar tetap tertutup hitam selamanya (pemain buta tapi permainan jalan).
   */
  static fadeOut(durationMs = 550): Promise<void> {
    this.ensure();
    const el = this.fadeEl!;
    if (el.classList.contains('visible')) return Promise.resolve();
    el.style.transitionDuration = `${durationMs}ms`;
    el.classList.add('visible');
    return new Promise(resolve => window.setTimeout(resolve, durationMs));
  }

  /** Angkat kembali redupan hitam. Juga idempoten. */
  static fadeIn(durationMs = 700): Promise<void> {
    this.ensure();
    const el = this.fadeEl!;
    if (!el.classList.contains('visible')) return Promise.resolve();
    el.style.transitionDuration = `${durationMs}ms`;
    el.classList.remove('visible');
    return new Promise(resolve => window.setTimeout(resolve, durationMs));
  }

  /**
   * Tampilkan kartu penanda babak di atas layar hitam:
   * "Babak Selesai" (penyelesaian scene) atau judul bab yang baru mulai.
   */
  static async showChapterCard(options: {
    kicker: string;
    title: string;
    subtitle?: string;
    holdMs?: number;
  }): Promise<void> {
    this.ensure();
    const card = this.cardEl!;
    card.innerHTML = `
      <div class="chapter-card-kicker">${escapeHtml(options.kicker)}</div>
      <div class="chapter-card-title">${escapeHtml(options.title)}</div>
      ${options.subtitle ? `<div class="chapter-card-subtitle">${escapeHtml(options.subtitle)}</div>` : ''}
    `;
    card.classList.remove('hidden');
    // Reset animasi: lepas kelas dulu lalu paksa reflow sebelum menampilkan.
    card.classList.remove('chapter-card-in');
    void card.offsetWidth;
    card.classList.add('chapter-card-in');

    await new Promise(resolve => window.setTimeout(resolve, options.holdMs ?? 2200));

    card.classList.add('chapter-card-out');
    await new Promise(resolve => window.setTimeout(resolve, 600));
    card.classList.add('hidden');
    card.classList.remove('chapter-card-in', 'chapter-card-out');
  }

  /**
   * Gabungan paling umum: fade out → kartu babak → fade in.
   * Dipakai saat bab selesai dan saat bab baru dimulai.
   */
  static async chapterBreak(options: {
    kicker: string;
    title: string;
    subtitle?: string;
    holdMs?: number;
  }): Promise<void> {
    await this.fadeOut(500);
    await this.showChapterCard(options);
    await this.fadeIn(800);
  }

  /** Judul kartu penyelesaian babak dari data bab yang baru selesai. */
  static async showChapterComplete(params: {
    chapterId: string;
    chapterTitle: string;
    day: number;
    nextTitle?: string;
  }): Promise<void> {
    const subtitle = params.nextTitle
      ? `${t('ui.nextChapter')}: ${params.nextTitle}`
      : undefined;
    await this.chapterBreak({
      kicker: t('ui.chapterComplete'),
      title: params.chapterTitle,
      subtitle: subtitle ?? `${t('ui.day')} ${params.day}`,
      holdMs: 2400
    });
  }
}
