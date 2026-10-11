import { assetUrl } from './paths.js';

export type Locale = 'id' | 'en';

export interface LocalizationData {
  [key: string]: string | LocalizationData;
}

export class I18nManager {
  private currentLocale: Locale = 'id';
  private locales: Map<Locale, LocalizationData> = new Map();
  private fallbackLocale: Locale = 'id';
  private listeners: Set<(locale: Locale) => void> = new Set();
  private readyPromise: Promise<void> | null = null;

  async loadLocale(locale: Locale): Promise<void> {
    if (this.locales.has(locale)) return;
    try {
      const response = await fetch(assetUrl(`locales/${locale}.json`));
      if (response.ok) {
        const data = await response.json();
        this.locales.set(locale, data);
      } else {
        console.warn(`Failed to load locale: ${locale}`);
      }
    } catch (error) {
      console.error(`Error loading locale ${locale}:`, error);
    }
  }

  async initialize(defaultLocale: Locale = 'id'): Promise<void> {
    this.readyPromise = (async () => {
      await Promise.all([
        this.loadLocale('id'),
        this.loadLocale('en')
      ]);
      this.setLocale(defaultLocale);
    })();
    return this.readyPromise;
  }

  register(locale: Locale, data: LocalizationData): void {
    const existing = this.locales.get(locale) || {};
    this.locales.set(locale, this.deepMerge(existing, data));
    this.listeners.forEach(l => l(locale));
  }

  private deepMerge(target: LocalizationData, source: LocalizationData): LocalizationData {
    const result: LocalizationData = { ...target };
    for (const key of Object.keys(source)) {
      const a = result[key];
      const b = source[key];
      if (a && b && typeof a === 'object' && typeof b === 'object') {
        result[key] = this.deepMerge(a as LocalizationData, b as LocalizationData);
      } else {
        result[key] = b;
      }
    }
    return result;
  }

  async setLocale(locale: Locale): Promise<void> {
    if (this.readyPromise) await this.readyPromise;
    if (!this.locales.has(locale)) {
      await this.loadLocale(locale);
    }
    if (this.locales.has(locale)) {
      this.currentLocale = locale;
      this.listeners.forEach(l => l(locale));
    }
  }

  getLocale(): Locale {
    return this.currentLocale;
  }

  t(key: string, params?: Record<string, string | number>): string {
    const localeData = this.locales.get(this.currentLocale) || this.locales.get(this.fallbackLocale) || {};
    let result = this.getNestedValue(localeData, key);

    if (result === undefined) {
      console.warn(`Missing translation for key: ${key} in locale: ${this.currentLocale}`);
      return key;
    }

    if (params && typeof result === 'string') {
      result = result.replace(/\{(\w+)\}/g, (match, paramKey) => {
        return params[paramKey]?.toString() || match;
      });
    }

    return result;
  }

  private getNestedValue(obj: LocalizationData, key: string): string | undefined {
    const keys = key.split('.');
    let current: any = obj;
    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        return undefined;
      }
    }
    return typeof current === 'string' ? current : undefined;
  }

  hasKey(key: string): boolean {
    const localeData = this.locales.get(this.currentLocale) || this.locales.get(this.fallbackLocale) || {};
    return this.getNestedValue(localeData, key) !== undefined;
  }

  subscribe(listener: (locale: Locale) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getAvailableLocales(): Locale[] {
    return Array.from(this.locales.keys());
  }
}

export const i18n = new I18nManager();

export function t(key: string, params?: Record<string, string | number>): string {
  return i18n.t(key, params);
}