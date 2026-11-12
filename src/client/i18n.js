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
 * Start-up order: `?locale=` query param, then the browser's preferred
 * languages, then English. A `?locale=` naming a locale we do not ship
 * resolves to English rather than falling through to the browser, so an override
 * is always under the tester's control. The choice is in-memory only and is
 * never persisted to localStorage, so a reload always falls back to the
 * default above. The resolved locale is mirrored to
 * `document.documentElement.lang` for assistive technology and for `:lang()`
 * styling hooks. A locale may carry an optional `htmlLang` when the code alone
 * is too coarse for that purpose — `zh` ships Traditional, so it advertises
 * `zh-Hant` and the browser picks Traditional glyphs rather than leaving Han
 * unification to chance.
 */

import { StoreElement } from './user-store.js';

export const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'ko', label: '한국어' },
  { code: 'ja', label: '日本語' },
  { code: 'tr', label: 'Türkçe' },
  // One Chinese locale, in Traditional characters, so every `zh-*` browser
  // matches it: detection strips the region subtag, which would otherwise send
  // zh-TW / zh-HK / zh-CN visitors to English. `zh-Hant` is advertised to the
  // document so the browser does not fall back to Simplified glyphs.
  { code: 'zh', label: '繁體中文', htmlLang: 'zh-Hant' },
];

const TRANSLATIONS = {
  es: {
    'Play Solo': 'Jugar solo',
    'Play Online': 'Jugar en línea',
    'Solo Practice': 'Práctica en solitario',
    Spectate: 'Observar',
    'Challenge {name}': 'Desafiar a {name}',
    PLAY: 'JUGAR',
    Cancel: 'Cancelar',
    Accept: 'Aceptar',
    Decline: 'Rechazar',
    Challenge: 'Desafío',
    'Challenge from {name}': 'Desafío de {name}',
    'Waiting for {name} to accept.': 'Esperando a que {name} acepte.',
    '{name} declined.': '{name} rechazó el desafío.',
    'Accept challenge': 'Aceptar desafío',
    'Decline challenge': 'Rechazar desafío',
    Dismiss: 'Cerrar',
    'Select game type': 'Seleccionar tipo de juego',
    'Select game variant': 'Seleccionar variante de juego',
    'Game type': 'Tipo de juego',
    '{game} variant': 'Variante de {game}',
    'Table:': 'Mesa:',
    'Full size': 'Tamaño completo',
    Mini: 'Mini',
    'Shot time:': 'Tiempo de tiro:',
    'Rule:': 'Regla:',
    'Aim:': 'Puntería:',
    Free: 'Libre',
    Assist: 'Asistida',
    'Free aim': 'Puntería libre',
    'Aim assist': 'Puntería asistida',
    'Send message': 'Enviar mensaje',
    Language: 'Idioma',
    'Eight Ball': 'Bola 8',
    'Nine Ball': 'Bola 9',
    Snooker: 'Snooker',
    'Three Cushion': 'Tres bandas',
    Sagu: 'Sagu',
    Libre: 'Libre',
    'Snooker 6r': 'Snooker 6r',
    '3-Cushion 5ft': 'Tres bandas 5ft',
    '3-Cushion (7)': 'Tres bandas (7)',
    '3-Cushion (30)': 'Tres bandas (30)',
    '3-Cushion analysis': 'Análisis de tres bandas',
    'Sagu Challenge': 'Desafío Sagu',
    'Sagu (5)': 'Sagu (5)',
    'Billiard collections': 'Colecciones de billar',
    Speedrun: 'Contrarreloj',
    Trickshot: 'Fantasía',
    Research: 'Investigación',
    Exam: 'Examen',
    'Reds 3': 'Rojas 3',
    'Reds 6': 'Rojas 6',
    'Reds 10': 'Rojas 10',
    'Reds 15': 'Rojas 15',
    '3 reds': 'Rojas 3',
    '6 reds': 'Rojas 6',
    '10 reds': 'Rojas 10',
    '15 reds': 'Rojas 15',
    'Race to 7': 'A 7 puntos',
    'Race to 15': 'Carrera a 15',
    'Race to 25': 'A 25 puntos',
    'Race to 5': 'Carrera a 5',
    'Race to 11': 'Carrera a 11',
    'Use these parameters': 'Usar estos parámetros',
    'Click to change name': 'Clic para cambiar el nombre',
    'Customise settings': 'Personalizar ajustes',
    Settings: 'Ajustes',
    Preferences: 'Preferencias',
    Graphics: 'Gráficos',
    Customise: 'Personalizar',
    Links: 'Enlaces',
    'Recent visitors': 'Visitantes recientes',
    HiScore: 'Récord',
    Rankings: 'Clasificación',
    'Trophy Cabinet': 'Vitrina de trofeos',
    'Small Table (15)': 'Mesa pequeña (15)',
    'Small Table (11)': 'Mesa pequeña (11)',
    'Small Table (5)': 'Mesa pequeña (5)',
    'Collaboration (15)': 'Cooperativo (15)',
    'Race to 15 (Free Aim)': 'A 15 puntos (Tiro libre)',
    'Free Aim (5)': 'Puntería libre (5)',
    'Eight Ball (Free Aim)': 'Bola 8 (Puntería libre)',
    'Eight Ball Mini (Free Aim)': 'Bola 8 Mini (Puntería libre)',
    'Nine Ball (Free Aim)': 'Bola 9 (Puntería libre)',
    'Nine Ball Mini (Free Aim)': 'Bola 9 Mini (Puntería libre)',
    '6 reds (Free Aim)': 'Rojas 6 (Puntería libre)',
    'Traditional (10)': 'Tradicional (10)',
    Handicap: 'Puntuación personalizada',
  },
  ko: {
    'Play Solo': '혼자 플레이',
    'Play Online': '온라인 플레이',
    'Solo Practice': '혼자 연습',
    Spectate: '관전',
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
    Libre: '리브레',
    'Snooker 6r': '스누커 6r',
    '3-Cushion 5ft': '쓰리쿠션 5ft',
    '3-Cushion (7)': '쓰리쿠션 (7)',
    '3-Cushion (30)': '쓰리쿠션 (30)',
    '3-Cushion analysis': '쓰리쿠션 분석',
    'Sagu Challenge': '사구 도전',
    'Sagu (5)': '사구 (5)',
    'Billiard collections': '당구 컬렉션',
    Speedrun: '스피드런',
    Trickshot: '트릭샷',
    Research: '연구',
    Exam: '시험',
    'Reds 3': '빨간공 3',
    'Reds 6': '빨간공 6',
    'Reds 10': '빨간공 10',
    'Reds 15': '빨간공 15',
    '3 reds': '빨간공 3',
    '6 reds': '빨간공 6',
    '10 reds': '빨간공 10',
    '15 reds': '빨간공 15',
    'Race to 7': '7점 선취',
    'Race to 15': '15점 선취',
    'Race to 25': '25점 선취',
    'Race to 5': '5점 선취',
    'Race to 11': '11점 선취',
    'Use these parameters': '이 설정으로 시작',
    'Click to change name': '클릭하여 이름 변경',
    'Customise settings': '설정 변경',
    Settings: '설정',
    Preferences: '환경설정',
    Graphics: '그래픽',
    Customise: '사용자 지정',
    Links: '링크',
    'Recent visitors': '최근 방문자',
    HiScore: '하이스코어',
    Rankings: '랭킹',
    'Trophy Cabinet': '트로피 진열장',
    'Small Table (15)': '미니 테이블 (15)',
    'Small Table (11)': '미니 테이블 (11)',
    'Small Table (5)': '미니 테이블 (5)',
    'Collaboration (15)': '협력전 (15)',
    'Race to 15 (Free Aim)': '15점 선취 (자유 조준)',
    'Free Aim (5)': '자유 조준 (5)',
    'Eight Ball (Free Aim)': '에이트볼 (자유 조준)',
    'Eight Ball Mini (Free Aim)': '에이트볼 미니 (자유 조준)',
    'Nine Ball (Free Aim)': '나인볼 (자유 조준)',
    'Nine Ball Mini (Free Aim)': '나인볼 미니 (자유 조준)',
    '6 reds (Free Aim)': '빨간공 6 (자유 조준)',
    'Traditional (10)': '정식 규칙 (10)',
    Handicap: '핸디캡',
  },
  ja: {
    'Play Solo': 'ひとりでプレイ',
    'Play Online': 'オンラインでプレイ',
    'Solo Practice': 'ソロ練習',
    Spectate: '観戦',
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
    Libre: 'リブレ',
    'Snooker 6r': 'スヌーカー 6r',
    '3-Cushion 5ft': 'スリークッション 5ft',
    '3-Cushion (7)': 'スリークッション (7)',
    '3-Cushion (30)': 'スリークッション (30)',
    '3-Cushion analysis': 'スリークッション分析',
    'Sagu Challenge': '四つ球チャレンジ',
    'Sagu (5)': '四球 (5)',
    'Billiard collections': 'ビリヤードコレクション',
    Speedrun: 'スピードラン',
    Trickshot: 'トリックショット',
    Research: '研究',
    Exam: '検定',
    'Reds 3': '赤球 3',
    'Reds 6': '赤球 6',
    'Reds 10': '赤球 10',
    'Reds 15': '赤球 15',
    '3 reds': '赤球 3',
    '6 reds': '赤球 6',
    '10 reds': '赤球 10',
    '15 reds': '赤球 15',
    'Race to 7': '7点先取',
    'Race to 15': '15点先取',
    'Race to 25': '25点先取',
    'Race to 5': '5点先取',
    'Race to 11': '11点先取',
    'Use these parameters': 'この設定で開始',
    'Click to change name': 'クリックして名前を変更',
    'Customise settings': '設定をカスタマイズ',
    Settings: '設定',
    Preferences: '環境設定',
    Graphics: 'グラフィックス',
    Customise: 'カスタマイズ',
    Links: 'リンク',
    'Recent visitors': '最近の訪問者',
    HiScore: 'ハイスコア',
    Rankings: 'ランキング',
    'Trophy Cabinet': 'トロフィーキャビネット',
    'Small Table (15)': 'ミニテーブル (15)',
    'Small Table (11)': 'ミニテーブル (11)',
    'Small Table (5)': 'ミニテーブル (5)',
    'Collaboration (15)': '協力戦 (15)',
    'Race to 15 (Free Aim)': '15点先取（フリーエイム）',
    'Free Aim (5)': 'フリーエイム (5)',
    'Eight Ball (Free Aim)': 'エイトボール（フリーエイム）',
    'Eight Ball Mini (Free Aim)': 'エイトボール ミニ（フリーエイム）',
    'Nine Ball (Free Aim)': 'ナインボール（フリーエイム）',
    'Nine Ball Mini (Free Aim)': 'ナインボール ミニ（フリーエイム）',
    '6 reds (Free Aim)': '赤球 6（フリーエイム）',
    'Traditional (10)': '通常ルール (10)',
    Handicap: '目標点数設定',
  },
  tr: {
    'Play Solo': 'Tek Oyna',
    'Play Online': 'Çevrimiçi Oyna',
    'Solo Practice': 'Solo Pratik',
    Spectate: 'İzle',
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
    Libre: 'Serbest',
    'Snooker 6r': 'Snooker 6r',
    '3-Cushion 5ft': 'Üç Bant 5ft',
    '3-Cushion (7)': 'Üç Bant (7)',
    '3-Cushion (30)': 'Üç Bant (30)',
    '3-Cushion analysis': 'Üç Bant analizi',
    'Sagu Challenge': 'Sagu Challenge',
    'Sagu (5)': 'Sagu (5)',
    'Billiard collections': 'Bilardo koleksiyonları',
    Speedrun: 'Speedrun',
    Trickshot: 'Trickshot',
    Research: 'Araştırma',
    Exam: 'Sınav',
    'Reds 3': '3 Kırmızı',
    'Reds 6': '6 Kırmızı',
    'Reds 10': '10 Kırmızı',
    'Reds 15': '15 Kırmızı',
    '3 reds': '3 Kırmızı',
    '6 reds': '6 Kırmızı',
    '10 reds': '10 Kırmızı',
    '15 reds': '15 Kırmızı',
    'Race to 7': '7 Sayıya Ulaş',
    'Race to 15': '15 Sayıya',
    'Race to 25': '25 Sayıya Ulaş',
    'Race to 5': '5 Sayıya',
    'Race to 11': '11 Sayıya',
    'Use these parameters': 'Bu ayarlarla başla',
    'Click to change name': 'İsmi değiştirmek için tıklayın',
    'Customise settings': 'Ayarları özelleştir',
    Settings: 'Ayarlar',
    Preferences: 'Tercihler',
    Graphics: 'Grafikler',
    Customise: 'Özelleştir',
    Links: 'Bağlantılar',
    'Recent visitors': 'Son ziyaretçiler',
    HiScore: 'Rekor',
    Rankings: 'Sıralama',
    'Trophy Cabinet': 'Kupa Dolabı',
    'Small Table (15)': 'Küçük Masa (15)',
    'Small Table (11)': 'Küçük Masa (11)',
    'Small Table (5)': 'Küçük Masa (5)',
    'Collaboration (15)': 'İşbirliği (15)',
    'Race to 15 (Free Aim)': '15 Sayıya Ulaş (Serbest Nişan)',
    'Free Aim (5)': 'Serbest Nişan (5)',
    'Eight Ball (Free Aim)': 'Sekiz Top (Serbest Nişan)',
    'Eight Ball Mini (Free Aim)': 'Sekiz Top Mini (Serbest Nişan)',
    'Nine Ball (Free Aim)': 'Dokuz Top (Serbest Nişan)',
    'Nine Ball Mini (Free Aim)': 'Dokuz Top Mini (Serbest Nişan)',
    '6 reds (Free Aim)': '6 Kırmızı (Serbest Nişan)',
    'Traditional (10)': 'Geleneksel (10)',
    Handicap: 'Hedef Puanı',
  },
  zh: {
    'Play Solo': '單人練習',
    'Play Online': '線上對戰',
    'Solo Practice': '單人練習',
    Spectate: '觀戰',
    'Challenge {name}': '挑戰 {name}',
    PLAY: '開始',
    Cancel: '取消',
    Accept: '接受',
    Decline: '拒絕',
    Challenge: '挑戰',
    'Challenge from {name}': '{name} 的挑戰',
    'Waiting for {name} to accept.': '等待 {name} 接受。',
    '{name} declined.': '{name} 拒絕了。',
    'Accept challenge': '接受挑戰',
    'Decline challenge': '拒絕挑戰',
    Dismiss: '關閉',
    'Select game type': '選擇球類',
    'Select game variant': '選擇玩法',
    'Game type': '球類',
    '{game} variant': '{game} 玩法',
    'Table:': '球桌：',
    'Full size': '標準桌',
    Mini: '迷你',
    'Shot time:': '出桿時間：',
    'Rule:': '規則：',
    'Aim:': '瞄準：',
    Free: '自由',
    Assist: '輔助',
    'Free aim': '自由瞄準',
    'Aim assist': '瞄準輔助',
    'Send message': '傳送訊息',
    Language: '語言',
    'Eight Ball': '八號球',
    'Nine Ball': '九號球',
    Snooker: '斯諾克',
    'Three Cushion': '三顆星',
    Sagu: '四球',
    Libre: '自由球',
    'Snooker 6r': '斯諾克 6r',
    '3-Cushion 5ft': '三顆星 5ft',
    '3-Cushion (7)': '三顆星 (7)',
    '3-Cushion (30)': '三顆星 (30)',
    '3-Cushion analysis': '三顆星分析',
    'Sagu Challenge': '四球挑戰',
    'Sagu (5)': '四球 (5)',
    'Billiard collections': '撞球收藏',
    Speedrun: '速通',
    Trickshot: '花式擊球',
    Research: '研究',
    Exam: '檢定',
    'Reds 3': '紅球 3',
    'Reds 6': '紅球 6',
    'Reds 10': '紅球 10',
    'Reds 15': '紅球 15',
    '3 reds': '紅球 3',
    '6 reds': '紅球 6',
    '10 reds': '紅球 10',
    '15 reds': '紅球 15',
    'Race to 7': '搶 7 分',
    'Race to 15': '搶 15',
    'Race to 25': '搶 25 分',
    'Race to 5': '搶 5',
    'Race to 11': '搶 11',
    'Use these parameters': '使用這些設定',
    'Click to change name': '點擊修改名稱',
    'Customise settings': '自訂設定',
    Settings: '設定',
    Preferences: '偏好設定',
    Graphics: '圖形',
    Customise: '自訂',
    Links: '連結',
    'Recent visitors': '最近訪客',
    HiScore: '最高分',
    Rankings: '排名',
    'Trophy Cabinet': '獎盃櫃',
    'Small Table (15)': '迷你球桌 (15)',
    'Small Table (11)': '迷你球桌 (11)',
    'Small Table (5)': '迷你球桌 (5)',
    'Collaboration (15)': '合作模式 (15)',
    'Race to 15 (Free Aim)': '搶 15 分（自由瞄準）',
    'Free Aim (5)': '自由瞄準 (5)',
    'Eight Ball (Free Aim)': '八號球（自由瞄準）',
    'Eight Ball Mini (Free Aim)': '八號球 迷你（自由瞄準）',
    'Nine Ball (Free Aim)': '九號球（自由瞄準）',
    'Nine Ball Mini (Free Aim)': '九號球 迷你（自由瞄準）',
    '6 reds (Free Aim)': '紅球 6（自由瞄準）',
    'Traditional (10)': '標準規則 (10)',
    Handicap: '讓分制',
  },
};

const URL_PARAM = 'locale';
// Earlier versions persisted the choice under these keys. They are removed on
// load so no locale lingers in localStorage; the choice is in-memory only.
const STALE_STORAGE_KEYS = ['locale', 'selector_lang'];
try {
  for (const key of STALE_STORAGE_KEYS) localStorage.removeItem(key);
} catch { /* localStorage unavailable — nothing to clean up */ }

const isKnown = (code) => LOCALES.some(l => l.code === code);

/** Raw `?locale=` value, if present. Not validated — caller decides the fallback. */
function fromUrl() {
  if (typeof location === 'undefined') return undefined;
  return new URLSearchParams(location.search).get(URL_PARAM)?.trim().toLowerCase() || undefined;
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
  return fromBrowser() ?? 'en';
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

  /** Switch language for this page load only; broadcast to every subscriber. */
  set(lang) {
    if (!isKnown(lang) || lang === this.#lang) return;
    this.#lang = lang;
    this.#applyDocumentLang();
    for (const listener of this.#listeners) listener(lang);
  }

  /** Subscribe to language changes; returns an unsubscribe function. */
  onChange(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #applyDocumentLang() {
    if (typeof document === 'undefined') return;
    const { htmlLang } = LOCALES.find(l => l.code === this.#lang) ?? {};
    document.documentElement.lang = htmlLang ?? this.#lang;
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
