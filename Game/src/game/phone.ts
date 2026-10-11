import { eventBus } from '../core/events.js';
import { gameState } from './state.js';
import { audioManager } from '../core/audio.js';

export interface PhoneMessage {
  id: string;
  from: string;
  text: string;
  timestamp: number;
  read: boolean;
  choices?: Array<{ text: string; action: () => void }>;
  chapter: string;
}

export interface PhoneCall {
  id: string;
  from: string;
  timestamp: number;
  answered: boolean;
  transcript: string[];
  chapter: string;
}

export class PhoneManager {
  private messages: PhoneMessage[] = [];
  private calls: PhoneCall[] = [];
  private flashlightOn = false;
  private battery = 1;
  private batteryDrainRate = 0.0001;
  private signal = 1;
  private activeCall: PhoneCall | null = null;
  private callTimer: number | null = null;
  private radioPlaying = false;
  private radioFrequency = '88.5';

  constructor() {
    eventBus.on('phone:addMessage', this.addMessage.bind(this));
    eventBus.on('phone:addCall', this.addCall.bind(this));
    eventBus.on('phone:flashlight', this.onFlashlightToggle.bind(this));
    eventBus.on('phone:radio', this.onRadioTune.bind(this));
    eventBus.on('phone:open', this.openPhone.bind(this));
    eventBus.on('engine:update', this.update.bind(this));
  }

  private update(data: { deltaTime: number }): void {
    if (this.flashlightOn) {
      this.battery = Math.max(0, this.battery - this.batteryDrainRate * data.deltaTime * 60);
      if (this.battery <= 0) {
        this.flashlightOn = false;
        eventBus.emit('phone:flashlightState', { on: false, battery: 0 });
      } else {
        eventBus.emit('phone:flashlightState', { on: true, battery: this.battery });
      }
    }
  }

  addMessage(message: Omit<PhoneMessage, 'id' | 'timestamp' | 'read'>): void {
    const msg: PhoneMessage = {
      ...message,
      id: `msg_${Date.now()}`,
      timestamp: Date.now(),
      read: false
    };
    this.messages.unshift(msg);
    eventBus.emit('ui:phoneMessage', { message: msg });
    audioManager.playProcedural('blip', { category: 'sfx', volume: 0.3 });
  }

  addCall(call: Omit<PhoneCall, 'id' | 'timestamp' | 'answered' | 'transcript'>): void {
    const newCall: PhoneCall = {
      ...call,
      id: `call_${Date.now()}`,
      timestamp: Date.now(),
      answered: false,
      transcript: []
    };
    this.calls.unshift(newCall);
    this.startIncomingCall(newCall);
  }

  private startIncomingCall(call: PhoneCall): void {
    this.activeCall = call;
    eventBus.emit('ui:incomingCall', { call });
    audioManager.playProcedural('heartbeat', { category: 'sfx', volume: 0.5, loop: true });
  }

  answerCall(): void {
    if (this.activeCall) {
      this.activeCall.answered = true;
      this.activeCall.transcript.push(`${new Date().toLocaleTimeString()} - Call answered`);
      eventBus.emit('ui:callAnswered', { call: this.activeCall });
      audioManager.stopAll('sfx');
      this.startCallTimer();
    }
  }

  declineCall(): void {
    if (this.activeCall) {
      this.activeCall.answered = false;
      eventBus.emit('ui:callDeclined', { call: this.activeCall });
      audioManager.stopAll('sfx');
      this.activeCall = null;
    }
  }

  private startCallTimer(): void {
    let seconds = 0;
    this.callTimer = window.setInterval(() => {
      seconds++;
      if (this.activeCall) {
        this.activeCall.transcript.push(`${new Date().toLocaleTimeString()} - ${seconds}s`);
        eventBus.emit('ui:callTimer', { seconds });
      }
    }, 1000);
  }

  endCall(): void {
    if (this.callTimer) {
      clearInterval(this.callTimer);
      this.callTimer = null;
    }
    if (this.activeCall) {
      this.activeCall.transcript.push(`${new Date().toLocaleTimeString()} - Call ended`);
      this.activeCall = null;
    }
    eventBus.emit('ui:callEnded', {});
  }

  private onFlashlightToggle(data: { on: boolean }): void {
    // Senter ada di inventaris: tanpa senter lampu tidak boleh menyala -
    // pemain diajak mengambilnya lewat rantai barang di bab pertama.
    // Lampu padam tetap boleh (misal baterai habis) tanpa syarat apa pun.
    if (data.on && !gameState.hasInventory('senter')) {
      this.flashlightOn = false;
      eventBus.emit('phone:flashlightState', { on: false, battery: this.battery });
      eventBus.emit('player:flashlight', { on: false });
      eventBus.emit('flashlight:missing', {});
      return;
    }
    this.flashlightOn = data.on;
    if (!data.on) {
      this.battery = 1;
    }
    eventBus.emit('phone:flashlightState', { on: data.on, battery: this.battery });
    eventBus.emit('player:flashlight', { on: data.on });
  }

  private onRadioTune(data: { frequency: string }): void {
    this.radioFrequency = data.frequency;
    this.radioPlaying = true;
    eventBus.emit('ambience:radio', { frequency: data.frequency });
  }

  turnOffRadio(): void {
    this.radioPlaying = false;
    eventBus.emit('ambience:radio', { frequency: null });
  }

  setSignalStrength(signal: number): void {
    this.signal = Math.max(0, Math.min(1, signal));
  }

  getMessages(): PhoneMessage[] {
    return [...this.messages];
  }

  getCalls(): PhoneCall[] {
    return [...this.calls];
  }

  getUnreadCount(): number {
    return this.messages.filter(m => !m.read).length;
  }

  markAsRead(messageId: string): void {
    const msg = this.messages.find(m => m.id === messageId);
    if (msg) msg.read = true;
  }

  getFlashlightState(): { on: boolean; battery: number } {
    return { on: this.flashlightOn, battery: this.battery };
  }

  getRadioState(): { playing: boolean; frequency: string } {
    return { playing: this.radioPlaying, frequency: this.radioFrequency };
  }

  private openPhone(): void {
    eventBus.emit('ui:openPhone', {
      messages: this.getMessages(),
      calls: this.getCalls(),
      flashlight: this.getFlashlightState(),
      radio: this.getRadioState(),
      signal: this.signal
    });
  }

  simulateDebtCalls(chapter: string): void {
    const debtMessages = [
      { from: 'Pinjol Cepat', text: 'Mas Dimas, pembayaran minggu ini belum masuk. Bunga naik 5% besok.', chapter },
      { from: 'Kredit Aman', text: 'Peringatan terakhir. Jika tidak bayar, kami akan ke kantor/rusun.', chapter },
      { from: 'Rudi', text: 'Bro, ada kerjaan. Uang muka 5jt. Malam ini di kedai kopi.', chapter }
    ];

    debtMessages.forEach((msg, i) => {
      setTimeout(() => {
        this.addMessage(msg);
      }, i * 2000);
    });
  }

  simulateRudiMessages(chapter: string): void {
    const messages = [
      { from: 'Rudi', text: 'Gue udah siapin semuanya. Cuma butuh lo satu malam.', chapter },
      { from: 'Rudi', text: 'Jangan mikir panjang. Ini jalan satu-satunya.', chapter }
    ];

    messages.forEach((msg, i) => {
      setTimeout(() => {
        this.addMessage(msg);
      }, i * 3000);
    });
  }

  serialize(): any {
    return {
      messages: this.messages,
      calls: this.calls,
      flashlightOn: this.flashlightOn,
      battery: this.battery,
      signal: this.signal
    };
  }

  deserialize(data: any): void {
    this.messages = data.messages || [];
    this.calls = data.calls || [];
    this.flashlightOn = data.flashlightOn || false;
    this.battery = data.battery || 1;
    this.signal = data.signal || 1;
  }
}

export const phoneManager = new PhoneManager();