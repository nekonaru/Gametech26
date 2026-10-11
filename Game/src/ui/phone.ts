import { UIElement } from './base.js';
import { i18n, t } from '../core/i18n.js';
import { settingsManager } from '../core/settings.js';
import { audioManager } from '../core/audio.js';
import { eventBus } from '../core/events.js';

export interface PhoneMessage {
  id: string;
  from: string;
  text: string;
  timestamp: number;
  read: boolean;
  choices?: { text: string; action: () => void }[];
}

export interface PhoneCall {
  id: string;
  from: string;
  duration: number;
  answered: boolean;
  transcript?: string[];
}

export class PhoneScreen implements UIElement {
  element: HTMLElement;
  private onClose: () => void;
  private currentTab: 'messages' | 'calls' | 'flashlight' | 'radio' = 'messages';
  private messages: PhoneMessage[] = [];
  private calls: PhoneCall[] = [];
  private flashlightOn = false;
  private battery = 1;
  private signal = 1;
  private activeMessage: PhoneMessage | null = null;
  private typingInterval: number | null = null;
  private offFlashlightState?: () => void;

  constructor(onClose: () => void) {
    this.onClose = onClose;
    this.element = this.createElement();
    this.updateText();
    i18n.subscribe(() => this.updateText());
  }

  private createElement(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'phone-screen';
    div.className = 'screen phone-screen';
    div.innerHTML = `
      <div class="phone-container">
        <header class="phone-header">
          <div class="phone-status">
            <span class="signal">📶</span>
            <span class="battery">🔋</span>
            <span class="time" id="phone-time"></span>
          </div>
          <h2 data-i18n="phone.title">Ponsel</h2>
          <button id="phone-close" class="ui-btn close-btn" data-i18n="ui.close"></button>
        </header>
        <nav class="phone-tabs">
          <button class="tab-btn active" data-tab="messages" data-i18n="phone.messages"></button>
          <button class="tab-btn" data-tab="calls" data-i18n="phone.calls"></button>
          <button class="tab-btn" data-tab="flashlight" data-i18n="phone.flashlight"></button>
          <button class="tab-btn" data-tab="radio" data-i18n="phone.radio"></button>
        </nav>
        <div class="phone-content">
          <div id="tab-messages" class="tab-panel">
            <div class="messages-list" id="messages-list"></div>
            <div class="message-view hidden" id="message-view">
              <div class="message-header">
                <span class="msg-from"></span>
                <span class="msg-time"></span>
              </div>
              <div class="message-body"></div>
              <div class="message-choices" id="message-choices"></div>
            </div>
          </div>
          <div id="tab-calls" class="tab-panel hidden">
            <div class="calls-list" id="calls-list"></div>
            <div class="call-active hidden" id="call-active">
              <div class="call-from"></div>
              <div class="call-timer">00:00</div>
              <div class="call-actions">
                <button class="ui-btn call-answer" data-i18n="ui.accept"></button>
                <button class="ui-btn call-decline danger" data-i18n="ui.decline"></button>
              </div>
            </div>
          </div>
          <div id="tab-flashlight" class="tab-panel hidden">
            <div class="flashlight-control">
              <button id="flashlight-toggle" class="ui-btn flashlight-btn" data-i18n="phone.flashlight"></button>
              <div class="battery-display">
                <div class="battery-bar"><div class="battery-fill"></div></div>
                <span class="battery-text">100%</span>
              </div>
            </div>
          </div>
          <div id="tab-radio" class="tab-panel hidden">
            <div class="radio-control">
              <div class="radio-display" id="radio-display">--.- FM</div>
              <div class="radio-buttons">
                <button class="ui-btn radio-btn" data-freq="88.5">88.5 FM</button>
                <button class="ui-btn radio-btn" data-freq="92.3">92.3 FM</button>
                <button class="ui-btn radio-btn" data-freq="98.7">98.7 FM</button>
                <button class="ui-btn radio-btn" data-freq="101.1">101.1 FM</button>
              </div>
              <button id="radio-power" class="ui-btn radio-power" data-i18n="ui.close"></button>
            </div>
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
    this.updateTime();
    this.renderMessages();
    this.renderCalls();
  }

  private updateTime(): void {
    const timeEl = this.element.querySelector('#phone-time');
    if (timeEl) {
      const now = new Date();
      timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }

  show(): void {
    this.element.style.display = 'flex';
    document.body.appendChild(this.element);
    this.setupListeners();
    this.startTimeUpdate();
  }

  hide(): void {
    this.element.style.display = 'none';
    this.removeListeners();
    this.stopTimeUpdate();
    if (this.typingInterval) {
      clearInterval(this.typingInterval);
      this.typingInterval = null;
    }
  }

  destroy(): void {
    this.removeListeners();
    this.stopTimeUpdate();
    if (this.typingInterval) clearInterval(this.typingInterval);
    this.element.remove();
  }

  private startTimeUpdate(): void {
    this.updateTime();
    setInterval(() => this.updateTime(), 1000);
  }

  private stopTimeUpdate(): void {
  }

  private setupListeners(): void {
    const closeBtn = this.element.querySelector('#phone-close');
    closeBtn?.addEventListener('click', this.onClose);

    this.element.querySelectorAll<HTMLElement>('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = (e.currentTarget as HTMLButtonElement).dataset.tab as PhoneScreen['currentTab'];
        this.showTab(tab);
      });
    });

    const flashlightBtn = this.element.querySelector('#flashlight-toggle');
    flashlightBtn?.addEventListener('click', () => this.toggleFlashlight());

    this.element.querySelectorAll<HTMLElement>('.radio-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const freq = (e.currentTarget as HTMLButtonElement).dataset.freq!;
        this.tuneRadio(freq);
      });
    });

    const radioPower = this.element.querySelector('#radio-power');
    radioPower?.addEventListener('click', () => this.turnOffRadio());

    // Sinkron dari manajer: senter bisa ditolak (barangnya belum ada di
    // inventaris) atau baterai berkurang selama layar ponsel terbuka -
    // tombol senter tidak boleh tertinggal dalam keadaan salah.
    this.offFlashlightState?.();
    this.offFlashlightState = eventBus.on(
      'phone:flashlightState',
      (data: { on: boolean; battery?: number }) => {
        this.setFlashlightState(!!data.on, typeof data.battery === 'number' ? data.battery : this.battery);
      }
    );
  }

  private removeListeners(): void {
    const closeBtn = this.element.querySelector('#phone-close');
    closeBtn?.removeEventListener('click', this.onClose);

    this.offFlashlightState?.();
    this.offFlashlightState = undefined;

    this.element.querySelectorAll<HTMLElement>('.tab-btn').forEach(btn => {
      btn.replaceWith(btn.cloneNode(true));
    });
  }

  private showTab(tab: PhoneScreen['currentTab']): void {
    this.currentTab = tab;
    this.element.querySelectorAll<HTMLElement>('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    this.element.querySelectorAll<HTMLElement>('.tab-panel').forEach(panel => {
      panel.classList.toggle('hidden', panel.id !== `tab-${tab}`);
    });
  }

  addMessage(message: PhoneMessage): void {
    this.messages.unshift(message);
    this.renderMessages();
  }

  addCall(call: PhoneCall): void {
    this.calls.unshift(call);
    this.renderCalls();
  }

  setFlashlightState(on: boolean, battery: number): void {
    this.flashlightOn = on;
    this.battery = battery;
    this.updateFlashlightUI();
  }

  setSignalStrength(signal: number): void {
    this.signal = signal;
    const signalEl = this.element.querySelector('.signal');
    if (signalEl) {
      const bars = Math.round(signal * 4);
      signalEl.textContent = '📶'.repeat(Math.max(1, bars));
    }
  }

  private toggleFlashlight(): void {
    this.flashlightOn = !this.flashlightOn;
    audioManager.playProcedural('blip', { category: 'sfx', volume: 0.3 });
    this.updateFlashlightUI();
    eventBus.emit('phone:flashlight', { on: this.flashlightOn });
  }

  private updateFlashlightUI(): void {
    const btn = this.element.querySelector('#flashlight-toggle') as HTMLButtonElement;
    const fill = this.element.querySelector('.battery-fill') as HTMLElement;
    const text = this.element.querySelector('.battery-text');

    if (btn) {
      btn.classList.toggle('active', this.flashlightOn);
      btn.textContent = this.flashlightOn ? t('phone.flashlight') + ' ON' : t('phone.flashlight');
    }
    if (fill) fill.style.width = `${this.battery * 100}%`;
    if (text) text.textContent = `${Math.round(this.battery * 100)}%`;
  }

  private tuneRadio(freq: string): void {
    const display = this.element.querySelector('#radio-display');
    if (display) display.textContent = `${freq} FM`;
    audioManager.playProcedural('static', { category: 'ambience', volume: 0.2, loop: true });
  }

  private turnOffRadio(): void {
    const display = this.element.querySelector('#radio-display');
    if (display) display.textContent = '--.- FM';
    audioManager.stopAll('ambience');
  }

  private renderMessages(): void {
    const list = this.element.querySelector('#messages-list') as HTMLElement;
    const view = this.element.querySelector('#message-view') as HTMLElement;

    if (this.activeMessage) {
      list?.classList.add('hidden');
      view?.classList.remove('hidden');
      this.renderMessageView();
    } else {
      list?.classList.remove('hidden');
      view?.classList.add('hidden');
      if (list) {
        list.innerHTML = this.messages.map(msg => `
          <div class="message-item ${msg.read ? 'read' : 'unread'}" data-msg-id="${msg.id}">
            <div class="msg-preview">
              <span class="msg-from">${msg.from}</span>
              <span class="msg-time">${this.formatTime(msg.timestamp)}</span>
            </div>
            <div class="msg-text">${msg.text.substring(0, 50)}...</div>
          </div>
        `).join('');

        list.querySelectorAll<HTMLElement>('.message-item').forEach(item => {
          item.addEventListener('click', () => {
            const id = item.dataset.msgId!;
            const msg = this.messages.find(m => m.id === id);
            if (msg) this.openMessage(msg);
          });
        });
      }
    }
  }

  private openMessage(msg: PhoneMessage): void {
    this.activeMessage = msg;
    msg.read = true;
    this.renderMessages();
    audioManager.playProcedural('blip', { category: 'sfx', volume: 0.2 });
  }

  private renderMessageView(): void {
    if (!this.activeMessage) return;

    const view = this.element.querySelector('#message-view') as HTMLElement;
    const from = view.querySelector('.msg-from');
    const time = view.querySelector('.msg-time');
    const body = view.querySelector('.message-body') as HTMLElement | null;
    const choices = view.querySelector('#message-choices') as HTMLElement;

    if (from) from.textContent = this.activeMessage.from;
    if (time) time.textContent = this.formatTime(this.activeMessage.timestamp);
    if (body) {
      body.textContent = '';
      this.typeText(body, this.activeMessage.text);
    }

    if (choices) {
      choices.innerHTML = '';
      if (this.activeMessage.choices) {
        this.activeMessage.choices.forEach(choice => {
          const btn = document.createElement('button');
          btn.className = 'ui-btn choice-btn';
          btn.textContent = choice.text;
          btn.addEventListener('click', () => {
            choice.action();
            this.closeMessage();
          });
          choices.appendChild(btn);
        });
      } else {
        const backBtn = document.createElement('button');
        backBtn.className = 'ui-btn back-btn';
        backBtn.textContent = t('ui.back');
        backBtn.addEventListener('click', () => this.closeMessage());
        choices.appendChild(backBtn);
      }
    }
  }

  private closeMessage(): void {
    this.activeMessage = null;
    this.renderMessages();
  }

  private typeText(element: HTMLElement, text: string): void {
    let i = 0;
    const speed = settingsManager.get('text').typeSpeed;
    this.typingInterval = window.setInterval(() => {
      if (i < text.length) {
        element.textContent += text[i++];
      } else {
        clearInterval(this.typingInterval!);
        this.typingInterval = null;
      }
    }, speed);
  }

  private renderCalls(): void {
    const list = this.element.querySelector('#calls-list') as HTMLElement;
    if (list) {
      list.innerHTML = this.calls.map(call => `
        <div class="call-item ${call.answered ? 'answered' : 'missed'}">
          <span class="call-from">${call.from}</span>
          <span class="call-time">${this.formatTime(call.duration * 1000)}</span>
          <span class="call-status">${call.answered ? t('ui.accept') : t('ui.decline')}</span>
        </div>
      `).join('');
    }
  }

  private formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}