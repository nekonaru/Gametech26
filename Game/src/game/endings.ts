import { eventBus, GameEvents } from '../core/events.js';
import { gameState, GameVariables } from './state.js';
import { saveManager } from '../core/save.js';
import { i18n, t } from '../core/i18n.js';
import { assetUrl } from '../core/paths.js';

export interface EndingResult {
  id: string;
  name: string;
  description: string;
  dimasFate: string;
  rudiFate: string;
  joyFound: boolean;
  cukongInvestigated: boolean;
  epilog: string;
}

export class EndingManager {
  private endings: Map<string, EndingResult> = new Map();
  private currentEnding: string | null = null;
  private evaluated = false;
  private raw: any[] | null = null;

  constructor() {
    eventBus.on('ending:evaluate', this.evaluateEnding.bind(this));
    eventBus.on('ending:trigger', this.triggerEnding.bind(this));
    i18n.subscribe(() => {
      if (this.raw) this.buildFromRaw();
      else this.rebuildBuiltIn();
    });
  }

  async loadFromData(): Promise<void> {
    if (!this.raw) {
      try {
        const response = await fetch(assetUrl('data/endings.json'));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const list: any[] = Array.isArray(payload) ? payload : (payload?.endings ?? []);
        if (list.length) this.raw = list;
      } catch (error) {
        console.warn('Ending data unavailable, using built-in endings:', error);
      }
    }
    if (this.raw) this.buildFromRaw();
    else this.rebuildBuiltIn();
  }

  private rebuildBuiltIn(): void {
    this.endings.clear();
    this.initializeEndings();
  }

  private buildFromRaw(): void {
    const locale = i18n.getLocale();
    const pick = (item: any, base: string): string => {
      const primary = locale === 'en' ? item[`${base}_en`] : item[`${base}_id`];
      const fallback = locale === 'en' ? item[`${base}_id`] : item[`${base}_en`];
      return String(primary ?? fallback ?? '');
    };

    const built: EndingResult[] = (this.raw ?? []).map(item => ({
      id: String(item.id),
      name: pick(item, 'name'),
      description: pick(item, 'description'),
      dimasFate: pick(item, 'dimasFate'),
      rudiFate: pick(item, 'rudiFate'),
      joyFound: !!item.joyFound,
      cukongInvestigated: !!item.cukongInvestigated,
      epilog: pick(item, 'epilog')
    }));

    if (!built.length) return;
    this.endings.clear();
    built.forEach(ending => this.endings.set(ending.id, ending));
  }

  private initializeEndings(): void {
    this.endings.set('ending_1', {
      id: 'ending_1',
      name: t('ending.ending1'),
      description: 'Dimas menolak tawaran Rudi. Hidup sederhana tapi tenang.',
      dimasFate: 'Hidup, bebas dari utang pinjol',
      rudiFate: 'Menghilang dari desa',
      joyFound: true,
      cukongInvestigated: false,
      epilog: 'Dimas dan Raka makan malam bersama. Radio berita menyebut kebakaran di desa sebelah. Dunia tetap berputar.'
    });

    this.endings.set('ending_2', {
      id: 'ending_2',
      name: t('ending.ending2'),
      description: 'Konfrontasi dini tanpa bukti cukup. Dimas lari ke hutan dan tidak kembali.',
      dimasFate: 'Meninggal di hutan (ditemukan warga)',
      rudiFate: 'Tidak tersentuh',
      joyFound: false,
      cukongInvestigated: false,
      epilog: 'Raka berdiri di pemakaman. Warga bilang Dimas kelelahan dan terjebak kabut. Tidak ada yang tahu kebenarannya.'
    });

    this.endings.set('ending_3', {
      id: 'ending_3',
      name: t('ending.ending3'),
      description: 'Raka menyelamatkan Dimas dan melaporkan. Keadilan terlaksana tapi pahit.',
      dimasFate: 'Dipenjara',
      rudiFate: 'Dicari polisi setelah kesaksian Raka',
      joyFound: true,
      cukongInvestigated: false,
      epilog: 'Dimas di penjara. Raka mengunjungi. Jasad Joy ditemukan. Rudi kabur.'
    });

    this.endings.set('ending_4', {
      id: 'ending_4',
      name: t('ending.ending4'),
      description: 'Raka menyelamatkan Dimas tapi diam. Keduanya bersembunyi dalam rasa bersalah.',
      dimasFate: 'Hidup, bersembunyi',
      rudiFate: 'Lolos',
      joyFound: false,
      cukongInvestigated: false,
      epilog: 'Dimas dan Raka pergi ke kota lain. Setiap malam Dimas mimpi Joy. Raka tahu tapi diam.'
    });

    this.endings.set('ending_5', {
      id: 'ending_5',
      name: t('ending.ending5'),
      description: 'Raka memilih biarkan. Api memakan Dimas. Balas budi dari arwah Joy.',
      dimasFate: 'Meninggal dalam api',
      rudiFate: 'Lolos',
      joyFound: false,
      cukongInvestigated: false,
      epilog: 'Api ilusi memakan Dimas. Raka pulang sendirian. Senandung Joy berhenti.'
    });

    this.endings.set('ending_6', {
      id: 'ending_6',
      name: t('ending.ending6'),
      description: 'True Ending. Semua clue terkumpuk, empati penuh, nurani Dimas pulih. Penebusan.',
      dimasFate: 'Dipenjara, menebus (epilog kunjungan)',
      rudiFate: 'Ditangkap lewat kesaksian Dimas',
      joyFound: true,
      cukongInvestigated: true,
      epilog: 'Ruang kunjungan penjara. Ladang tumbuh kembali. Siluet Joy tersenyum lalu hilang. Koran: "Pemilik lahan diperiksa".'
    });

    this.endings.set('ending_7', {
      id: 'ending_7',
      name: t('ending.ending7'),
      description: 'Nurani Dimas pulih di patroli. Dia berhenti dan mengaku sendiri.',
      dimasFate: 'Dipenjara, mengaku sendiri',
      rudiFate: 'Disebut namanya oleh Dimas',
      joyFound: true,
      cukongInvestigated: false,
      epilog: 'Dimas mengakui segalanya di hadapan warga. Joy ditemukan. Rudi tertangkap.'
    });

    this.endings.set('ending_8', {
      id: 'ending_8',
      name: t('ending.ending8'),
      description: 'Keyakinan Raka rendah. Dia pulang ke kota tanpa tahu kebenaran.',
      dimasFate: 'Meninggal di hutan (kabar lewat telepon)',
      rudiFate: 'Lolos',
      joyFound: false,
      cukongInvestigated: false,
      epilog: 'Raka di kota dapat telepon. Dimas meninggal. Raka tidak pernah tahu mengapa.'
    });

    this.endings.set('ending_9', {
      id: 'ending_9',
      name: t('ending.ending9'),
      description: 'Raka percaya Rudi. Dimas dan Rudi kabur bersama di hari 6.',
      dimasFate: 'Kabur, nasib tidak pasti',
      rudiFate: 'Kabur bersama',
      joyFound: false,
      cukongInvestigated: false,
      epilog: 'Mobil Rudi melaju malam hari. Dimas di sampingnya. Raka menatap rearview mirror. Asap di ujung jalan.'
    });
  }

  evaluateEnding(): EndingResult | null {
    if (this.evaluated) return this.getCurrentEnding();

    const vars = gameState.get('variables');
    const flags = gameState.get('flags');
    let ending: EndingResult | null = null;

    if (!vars.terimaRudi) {
      ending = this.endings.get('ending_1')!;
    } else if (vars.konfrontasiDini && vars.investigasi < 4) {
      ending = this.endings.get('ending_2')!;
    } else if (flags.percayaRudi && vars.percayaDimas <= 1) {
      ending = this.endings.get('ending_9')!;
    } else if (vars.nurani >= 2 && flags.b17_confess) {
      ending = this.endings.get('ending_7')!;
    } else {
      const keyakinan = vars.keyakinan;
      if (keyakinan < 4 && flags.b18_goHome) {
        ending = this.endings.get('ending_8')!;
      } else {
        switch (vars.b20Pilihan) {
          case 'biarkan':
            ending = this.endings.get('ending_5')!;
            break;
          case 'diam':
            ending = this.endings.get('ending_4')!;
            break;
          case 'selamatkan_lapor':
            if (vars.terimaRudi && vars.investigasi === 7 && vars.empatiB15 && vars.nurani >= 3) {
              ending = this.endings.get('ending_6')!;
            } else {
              ending = this.endings.get('ending_3')!;
            }
            break;
        }
      }
    }

    if (ending) {
      this.currentEnding = ending.id;
      this.evaluated = true;
      gameState.unlockEnding(ending.id);
      eventBus.emit(GameEvents.ENDING_REACHED, { ending: ending });
    }

    return ending;
  }

  private triggerEnding(endingId: string): void {
    const ending = this.endings.get(endingId);
    if (ending) {
      this.currentEnding = endingId;
      gameState.unlockEnding(endingId);
      eventBus.emit(GameEvents.ENDING_REACHED, { ending });
    }
  }

  getCurrentEnding(): EndingResult | null {
    if (this.currentEnding) {
      return this.endings.get(this.currentEnding) || null;
    }
    return null;
  }

  getEnding(id: string): EndingResult | undefined {
    return this.endings.get(id);
  }

  getAllEndings(): EndingResult[] {
    return Array.from(this.endings.values());
  }

  getUnlockedEndings(): EndingResult[] {
    return this.getAllEndings().filter(e => gameState.hasEnding(e.id));
  }

  reset(): void {
    this.currentEnding = null;
    this.evaluated = false;
  }

  serialize(): any {
    return {
      currentEnding: this.currentEnding,
      evaluated: this.evaluated
    };
  }

  deserialize(data: any): void {
    this.currentEnding = data.currentEnding || null;
    this.evaluated = data.evaluated || false;
  }
}

export const endingManager = new EndingManager();