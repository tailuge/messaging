/**
 * Minimal i18n for player-facing strings.
 *
 * Design: English strings ARE the keys. A language dictionary maps each
 * English key to its translation; `t()` falls back to the key itself, so
 * `en` needs no dictionary at all and a missing translation degrades to
 * English instead of rendering blank.
 *
 * Adding a language = one entry in LOCALES + one dictionary in TRANSLATIONS.
 *
 * The module is a singleton with a change subscription because the lobby is a
 * live Lit app: switching language re-renders subscribed components in place.
 *
 * Start-up order: `?locale=` query param, then localStorage, then the browser's
 * preferred languages, then English. A `?locale=` naming a locale we do not ship
 * resolves to English rather than falling through to the browser, so an override
 * is always under the tester's control; it is deliberately not persisted, so a
 * shared test link never overwrites a visitor's own choice. The resolved locale
 * is mirrored to `document.documentElement.lang` for assistive technology and
 * for `:lang()` styling hooks.
 */

import { StoreElement } from './user-store.js';

export const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'ko', label: '한국어' },
  { code: 'ja', label: '日本語' },
  { code: 'tr', label: 'Türkçe' },
];

const TRANSLATIONS = {
  ko: {
    'Play Solo': '혼자 플레이',
    'Challenge {name}': '{name}에게 대결 신청',
    PLAY: '플레이',
    Cancel: '취소',
    Accept: '수락',
    Decline: '거절',
    Challenge: '도전',
    'Challenge from {name}': '{name}님의 도전',
    'Waiting for {name} to accept.': '{name}님의 수락을 기다리는 중.',
    '{name} declined.': '{name}님이 거절했습니다.',
    'Accept challenge': '도전 수락',
    'Decline challenge': '도전 거절',
    Dismiss: '닫기',
    'Select game type': '게임 유형 선택',
    'Select game variant': '게임 변형 선택',
    'Game type': '게임 종류',
    '{game} variant': '{game} 변형',
    'Table:': '테이블:',
    'Full size': '전체 크기',
    Mini: '미니',
    'Shot time:': '샷 시간:',
    'Rule:': '규칙:',
    'Aim:': '조준:',
    Free: '자유',
    Assist: '보조',
    'Free aim': '자유 조준',
    'Aim assist': '조준 보조',
    'Send message': '메시지 보내기',
    Language: '언어',
    'Eight Ball': '에이트볼',
    'Nine Ball': '나인볼',
    Snooker: '스누커',
    'Three Cushion': '쓰리쿠션',
    Sagu: '사구',
    'Reds 3': '빨간공 3',
    'Reds 6': '빨간공 6',
    'Reds 10': '빨간공 10',
    'Reds 15': '빨간공 15',
    'Race to 7': '7점 선취',
    'Race to 15': '15점 선취',
    'Race to 25': '25점 선취',
    'Race to 5': '5점 선취',
    'Race to 11': '11점 선취',
    'Use these parameters': '이 설정으로 시작',
  },
  ja: {
    'Play Solo': 'ひとりでプレイ',
    'Challenge {name}': '{name}に挑戦',
    PLAY: 'プレイ',
    Cancel: 'キャンセル',
    Accept: '承認',
    Decline: '拒否',
    Challenge: '対戦申込み',
    'Challenge from {name}': '{name}からの挑戦',
    'Waiting for {name} to accept.': '{name}の承認待ちです。',
    '{name} declined.': '{name}が拒否しました。',
    'Accept challenge': '挑戦を承認',
    'Decline challenge': '挑戦を拒否',
    Dismiss: '閉じる',
    'Select game type': 'ゲームの種類を選択',
    'Select game variant': 'ゲームのバリアントを選択',
    'Game type': 'ゲームの種類',
    '{game} variant': '{game}のバリアント',
    'Table:': 'テーブル:',
    'Full size': 'フルサイズ',
    Mini: 'ミニ',
    'Shot time:': 'ショット時間:',
    'Rule:': 'ルール:',
    'Aim:': 'エイム:',
    Free: 'フリー',
    Assist: 'アシスト',
    'Free aim': 'フリーエイム',
    'Aim assist': 'エイムアシスト',
    'Send message': 'メッセージを送る',
    Language: '言語',
    'Eight Ball': 'エイトボール',
    'Nine Ball': 'ナインボール',
    Snooker: 'スヌーカー',
    'Three Cushion': 'スリークッション',
    Sagu: '四球',
    'Reds 3': '赤球 3',
    'Reds 6': '赤球 6',
    'Reds 10': '赤球 10',
    'Reds 15': '赤球 15',
    'Race to 7': '7点先取',
    'Race to 15': '15点先取',
    'Race to 25': '25点先取',
    'Race to 5': '5点先取',
    'Race to 11': '11点先取',
    'Use these parameters': 'この設定で開始',
  },
  tr: {
    'Play Solo': 'Tek Oyna',
    'Challenge {name}': '{name} ile Düello',
    PLAY: 'OYNA',
    Cancel: 'İptal',
    Accept: 'Kabul Et',
    Decline: 'Reddet',
    Challenge: 'Düello',
    'Challenge from {name}': '{name} düello teklif etti',
    'Waiting for {name} to accept.': '{name} kabul edene kadar bekleniyor.',
    '{name} declined.': '{name} reddetti.',
    'Accept challenge': 'Düelloyu kabul et',
    'Decline challenge': 'Düelloyu reddet',
    Dismiss: 'Kapat',
    'Select game type': 'Oyun türünü seç',
    'Select game variant': 'Oyun varyantı seç',
    'Game type': 'Oyun türü',
    '{game} variant': '{game} varyantı',
    'Table:': 'Masa:',
    'Full size': 'Tam boy',
    Mini: 'Mini',
    'Shot time:': 'Atış süresi:',
    'Rule:': 'Kural:',
    'Aim:': 'Nişan:',
    Free: 'Serbest',
    Assist: 'Yardımlı',
    'Free aim': 'Serbest nişan',
    'Aim assist': 'Nişan yardımı',
    'Send message': 'Mesaj gönder',
    Language: 'Dil',
    'Eight Ball': 'Sekiz Top',
    'Nine Ball': 'Dokuz Top',
    Snooker: 'Snooker',
    'Three Cushion': 'Üç Bant',
    Sagu: 'Sagu',
    'Reds 3': '3 Kırmızı',
    'Reds 6': '6 Kırmızı',
    'Reds 10': '10 Kırmızı',
    'Reds 15': '15 Kırmızı',
    'Race to 7': '7 Sayıya',
    'Race to 15': '15 Sayıya',
    'Race to 25': '25 Sayıya',
    'Race to 5': '5 Sayıya',
    'Race to 11': '11 Sayıya',
    'Use these parameters': 'Bu ayarlarla başla',
  },
};

const STORAGE_KEY = 'locale';
// Keys written by earlier versions of this module; still honoured so a returning
// visitor keeps the language they already picked.
const LEGACY_STORAGE_KEYS = ['lang', 'selector_lang'];
const URL_PARAM = 'locale';

const isKnown = (code) => LOCALES.some(l => l.code === code);

/** Raw `?locale=` value, if present. Not validated — caller decides the fallback. */
function fromUrl() {
  if (typeof location === 'undefined') return undefined;
  return new URLSearchParams(location.search).get(URL_PARAM)?.trim().toLowerCase() || undefined;
}

/** Locale the visitor last chose, read from localStorage. */
function fromStorage() {
  try {
    for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
      const stored = localStorage.getItem(key);
      if (stored && isKnown(stored)) return stored;
    }
    return undefined;
  } catch {
    return undefined; // localStorage unavailable
  }
}

/** First shipped locale in the browser's preference list ("ko-KR" -> "ko"). */
function fromBrowser() {
  if (typeof navigator === 'undefined') return undefined;
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of tags) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (isKnown(base)) return base;
  }
  return undefined;
}

/** Resolve the starting locale (see the order documented at the top). */
function detectLanguage() {
  const requested = fromUrl();
  if (requested) return isKnown(requested) ? requested : 'en';
  return fromStorage() ?? fromBrowser() ?? 'en';
}

export class I18n {
  #lang = detectLanguage();
  #listeners = new Set();

  constructor() {
    this.#applyDocumentLang();
  }

  /** Current locale code, e.g. `'en'` or `'ko'`. */
  get lang() {
    return this.#lang;
  }

  /** Shipped locales, for rendering a language picker. */
  get languages() {
    return LOCALES;
  }

  /** Translate an English key. Fallback = the key itself (English). */
  t(key, params) {
    let text = TRANSLATIONS[this.#lang]?.[key] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  }

  /** Switch language; persisted and broadcast to every subscriber. */
  set(lang) {
    if (!isKnown(lang) || lang === this.#lang) return;
    this.#lang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch { /* ignore */ }
    this.#applyDocumentLang();
    for (const listener of this.#listeners) listener(lang);
  }

  /** Subscribe to language changes; returns an unsubscribe function. */
  onChange(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #applyDocumentLang() {
    if (typeof document !== 'undefined') document.documentElement.lang = this.#lang;
  }
}

export const i18n = new I18n();

/**
 * Lit base class for components whose render() goes through `i18n.t`, so they
 * pick up a language change without a reload. It extends `StoreElement`, so a
 * component that needs both — most of the lobby panels read `userStore` and
 * translate their labels — gets userStore and language re-renders from one base
 * class. Components that are not Lit can subscribe with `i18n.onChange` directly.
 */
export class I18nElement extends StoreElement {
  connectedCallback() {
    super.connectedCallback();
    this._i18nUnsub = i18n.onChange(() => this.requestUpdate());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._i18nUnsub?.();
  }
}
