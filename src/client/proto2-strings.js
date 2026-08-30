/**
 * Minimal i18n for the Proto2 variant-selection modal.
 *
 * Design: English strings ARE the keys. A language dictionary maps each
 * English key to its translation; `t()` falls back to the key itself, so
 * `en` needs no dictionary at all and a missing translation degrades to
 * English instead of rendering blank.
 *
 * Adding a language = one entry in LANGUAGES + one dictionary in TRANSLATIONS.
 */

export const LANGUAGES = [
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
    'Select game variant': '게임 변형 선택',
    'Game type': '게임 종류',
    '{game} variant': '{game} 변형',
    'Table:': '테이블:',
    'Full size': '전체 크기',
    Mini: '미니',
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
  },
  ja: {
    'Play Solo': 'ひとりでプレイ',
    'Challenge {name}': '{name}に挑戦',
    PLAY: 'プレイ',
    Cancel: 'キャンセル',
    'Select game variant': 'ゲームのバリアントを選択',
    'Game type': 'ゲームの種類',
    '{game} variant': '{game}のバリアント',
    'Table:': 'テーブル:',
    'Full size': 'フルサイズ',
    Mini: 'ミニ',
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
  },
  tr: {
    'Play Solo': 'Tek Oyna',
    'Challenge {name}': '{name} ile Düello',
    PLAY: 'OYNA',
    Cancel: 'İptal',
    'Select game variant': 'Oyun varyantı seç',
    'Game type': 'Oyun türü',
    '{game} variant': '{game} varyantı',
    'Table:': 'Masa:',
    'Full size': 'Tam boy',
    Mini: 'Mini',
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
  },
};

const STORAGE_KEY = 'proto2_lang';

function detectLanguage() {
  // 1) Explicit user choice from a previous visit.
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LANGUAGES.some(l => l.code === stored)) return stored;
  } catch { /* localStorage unavailable */ }

  // 2) Browser language preference (prefix match, e.g. "ko-KR" -> "ko").
  const candidates = typeof navigator !== 'undefined' && navigator.languages?.length
    ? navigator.languages
    : typeof navigator !== 'undefined' && navigator.language
      ? [navigator.language]
      : [];
  for (const tag of candidates) {
    const base = String(tag).toLowerCase().split('-')[0];
    const match = LANGUAGES.find(l => l.code === base);
    if (match) return match.code;
  }

  // 3) English fallback (identity keys, no dictionary needed).
  return 'en';
}

export class Proto2Strings {
  #lang = 'en';
  #listeners = new Set();

  constructor() {
    this.#lang = detectLanguage();
  }

  get lang() {
    return this.#lang;
  }

  get languages() {
    return LANGUAGES;
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
    if (!LANGUAGES.some(l => l.code === lang) || lang === this.#lang) return;
    this.#lang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch { /* ignore */ }
    for (const listener of this.#listeners) listener(lang);
  }

  /** Subscribe to language changes; returns an unsubscribe function. */
  onChange(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

export const proto2Strings = new Proto2Strings();
