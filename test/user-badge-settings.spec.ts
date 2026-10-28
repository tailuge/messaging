// Mock window & navigator before importing modules that reference window.location
if (typeof window === 'undefined') {
  (globalThis as any).window = {
    location: { search: '', hostname: 'localhost', href: 'http://localhost/' },
    self: 1,
    top: 1,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
if (typeof navigator === 'undefined') {
  (globalThis as any).navigator = { userAgent: 'Node', languages: ['en-US'], language: 'en-US' };
}
if (typeof localStorage === 'undefined') {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
}

// Mock lit for Jest node environment
jest.mock("lit", () => ({
  html: (strings: any, ...values: any[]) => ({ strings, values }),
  css: (strings: any, ..._values: any[]) => strings[0],
  LitElement: class {
    connectedCallback() {}
    disconnectedCallback() {}
    requestUpdate() {}
  },
}));

import { isAnonymousName } from '../src/client/user-store.js';
import { i18n } from '../src/client/i18n.js';

describe('User Badge and Settings i18n / Anon detection', () => {
  afterEach(() => {
    i18n.set('en');
  });

  describe('isAnonymousName', () => {
    it('returns true for names starting with "Anon"', () => {
      expect(isAnonymousName('Anon')).toBe(true);
      expect(isAnonymousName('Anon-US')).toBe(true);
      expect(isAnonymousName('Anon-한')).toBe(true);
      expect(isAnonymousName('Anon123')).toBe(true);
    });

    it('returns false for non-Anon names', () => {
      expect(isAnonymousName('John')).toBe(false);
      expect(isAnonymousName('Alice')).toBe(false);
      expect(isAnonymousName('anon')).toBe(false); // Case-sensitive
      expect(isAnonymousName('User-123')).toBe(false);
      expect(isAnonymousName('')).toBe(false);
    });
  });

  describe('i18n translations for new tooltip phrases', () => {
    it('translates "Click to change name" across locales', () => {
      i18n.set('en');
      expect(i18n.t('Click to change name')).toBe('Click to change name');

      i18n.set('ko');
      expect(i18n.t('Click to change name')).toBe('클릭하여 이름 변경');

      i18n.set('ja');
      expect(i18n.t('Click to change name')).toBe('クリックして名前を変更');

      i18n.set('tr');
      expect(i18n.t('Click to change name')).toBe('İsmi değiştirmek için tıklayın');

      i18n.set('zh');
      expect(i18n.t('Click to change name')).toBe('點擊修改名稱');
    });

    it('translates "Customise settings" across locales', () => {
      i18n.set('en');
      expect(i18n.t('Customise settings')).toBe('Customise settings');

      i18n.set('ko');
      expect(i18n.t('Customise settings')).toBe('설정 맞춤설정');

      i18n.set('ja');
      expect(i18n.t('Customise settings')).toBe('設定をカスタマイズ');

      i18n.set('tr');
      expect(i18n.t('Customise settings')).toBe('Ayarları özelleştir');

      i18n.set('zh');
      expect(i18n.t('Customise settings')).toBe('自訂設定');
    });
  });
});
