
import { html } from 'lit';

export const CLIENTVERSION = 800;
export const formatVersion = (v) => `v${Math.floor(v / 100)}.${String(v % 100).padStart(2, '0')}`;


export const SCOREBOARD_URL = 'https://scoreboard-tailuge.vercel.app';
export const NCHANBASE = (typeof localStorage !== 'undefined' && localStorage.getItem('useProxy') === 'true')
    ? 'nchanproxy.tailuge.workers.dev'
    : 'billiards-network.onrender.com';
const _localhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
export const WS_SERVER = _localhost ? `ws://${window.location.hostname}:80` : `wss://${NCHANBASE}`;
export const ACTIVE_PAGE = _localhost ? './active.html' : 'https://billiards-network.onrender.com/active.html';
export const isVercel = typeof window !== 'undefined' && window.location.hostname.includes('vercel');

export const timeAgo = ts => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

export const INITIAL_STATE = {
    connected: false,
    users: [],
    challenges: {}, // indexed by other player's ID
    currentMatch: null // { tableId, ruleType, options, isFirst, opponentId, opponentName, opponentCustom }
};

export function reduce(state, action) {
    const C = { ...state.challenges };
    const other = m => m.challengerId === action.myId ? m.challengeeId : m.challengerId;

    switch (action.type) {
        case 'CONNECTED':
            return { ...state, connected: action.payload };
        case 'SETTLED':
            return { ...state, settled: action.payload };
        case 'USERS_UPDATE':
            return { ...state, users: action.payload };
        case 'CHALLENGE_SENT':
            return { ...state, challenges: { ...C, [action.payload.challengeeId]: { ...action.payload, status: 'pending' } } };
        case 'CHALLENGE_MSG': {
            const m = action.payload, id = other(m);
            if (m.type === 'offer') {
                if (state.currentMatch) return state;
                const existing = C[m.challengerId];
                // Tie-breaker for simultaneous offers:
                // If we already sent an offer to this user, the higher ID 'wins'.
                if (existing && existing.challengerId === action.myId && existing.status === 'pending') {
                    if (action.myId > m.challengerId) {
                        // We have higher ID: ignore their incoming offer, keep our sent one.
                        return state;
                    }
                }
                // We have lower ID (or no existing offer): yield and accept their offer as the active one.
                if (!C[m.challengerId] || C[m.challengerId].tableId !== m.tableId)
                    C[m.challengerId] = { ...m, status: 'pending' };
            } else if (m.type === 'accept' && !state.currentMatch) {
                const pending = C[id];
                // Only honour an accept if this session has a matching pending challenge for
                // this exact tableId. This prevents stale Nchan-buffered accepts from
                // redirecting a freshly-loaded lobby back into a finished game.
                if (!pending || pending.tableId !== m.tableId) return state;
                const options = m.options || pending.options;
                const nextTurnId = m.nextTurnId || pending.nextTurnId;
                const weAreChallenger = action.myId === m.challengerId;
                const opponentId = weAreChallenger ? m.challengeeId : m.challengerId;
                const opponentCustom = weAreChallenger ? (m.custom || {}) : (pending.custom || {});
                const opponentName = weAreChallenger ? pending.recipientName : pending.challengerName;
                delete C[id];
                return {
                    ...state, challenges: C,
                    currentMatch: {
                        tableId: m.tableId,
                        ruleType: m.ruleType,
                        options,
                        isFirst: (nextTurnId === m.challengerId || nextTurnId === m.challengeeId)
                            ? nextTurnId === action.myId
                            : m.challengerId === action.myId,
                        opponentId, opponentName, opponentCustom
                    }
                };
            } else if (m.type === 'decline') {
                if (C[m.challengeeId]) C[m.challengeeId] = { ...C[m.challengeeId], status: 'declined' };
            } else if (m.type === 'cancel') {
                delete C[other(m)];
            }
            return { ...state, challenges: C };
        }
        case 'CHALLENGE_DISMISS':
            delete C[action.payload];
            return { ...state, challenges: C };
        default:
            return state;
    }
}

/**
 * Returns an emoji and title based on origin or ruleType.
 * @param {string} origin 
 * @param {string} ruleType
 * @param {string} status
 * @param {Record<string, string|number|boolean>} options
 */
export function getEmoji(origin = "", ruleType = "", status = "", options = {}) {
  const ruleMap = {
    bot: { emoji: "🤖", title: "bot" },
    nineball: { emoji: "⑨", title: "nineball" },
    eightball: { emoji: "🎱", title: "eightball" },
    snooker: { emoji: "🔴", title: "snooker" },
    threecushion: { emoji: "③", title: "threecushion" },
    sagu: { emoji: "④", title: "sagu" },
  };

    const mapped = ruleMap[ruleType];
    const isMini = ["5", "6"].includes(String(options?.tableSize));
    const isFreeaim = Boolean(options?.freeaim);
    const decorate = result => {
      if (!isMini && !isFreeaim) return result;
      const emoji = result.emoji + (isMini ? "🍼" : "") + (isFreeaim ? "⌖" : "");
      const title = [isMini && "mini", isFreeaim && "freeaim"].filter(Boolean).join(" ");
      return { emoji, title };
    };
    
  // 1. Check user status first
  if (status === "spectating") return { emoji: "🔭", title: "spectator" };
  if (status === "playing") return decorate(mapped ?? { emoji: "🎮", title: "playing" });
  if (status === "available" &&ruleType === "replay") return { emoji: "👀", title: "replay" };


    
  if (mapped) {
      if (origin.includes("veli")) return decorate({ emoji: "🎓", title: "study" });
      if (origin.includes("github")) return decorate({ emoji: mapped.emoji+"🐙", title: "github" });
      if (origin.includes("localhost")) return decorate({ emoji: mapped.emoji+"🏠", title: "localhost" });
      return decorate(mapped);
  }

  if (ruleType.includes("-bot")) {
	const botmap = ruleMap[ruleType.replace("-bot","")];
	if (botmap) return decorate({ emoji: botmap.emoji+"🤖", title: "bot" });
  }

  if (ruleType.includes("-exam")) {
	const exammap = ruleMap[ruleType.replace("-exam","")];
	if (exammap) return decorate({ emoji: exammap.emoji+"📜", title: "exam" });
  }

  if (ruleType.includes("-speedrun")) {
	const speedmap = ruleMap[ruleType.replace("-speedrun","")];
	if (speedmap) return decorate({ emoji: speedmap.emoji+"👟", title: "speedrun" });
  }


  // 2. Check origin patterns

    if (origin.includes("github")) return { emoji: "🐙", title: "github" };
    if (origin.includes("vercel")) return { emoji: "👥", title: "vercel" };
    if (origin.includes("workers")) return { emoji: "👤", title: "vercel" };
    if (origin.includes("localhost")) return { emoji: "🏠", title: "localhost" };

  return ruleMap[ruleType] ?? { emoji: "🎮", title: "external" };
};

export const flag = (code) => {
    if (code === 'BOT') return { emoji: '🤖', title: 'BOT' };
    if (!code) return { emoji: '🌐', title: '' };
    const upper = code.toUpperCase();
    const emoji = [...upper].map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))).join('');
    return { emoji, title: upper };
};

const BASE = _localhost ? `http://${window.location.hostname}:8080/` : 'https://billiards.tailuge.workers.dev/';
const appendOptions = (url, options) => options
    ? Object.entries(options).reduce((u, [k, v]) => u + `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`, url)
    : url;

// Recursively flatten a customisation object into dot-notation URL params.
// { cue: { colour: 'red', length: '57' }, skin: 'blue' } →
//   custom.cue.colour=red&custom.cue.length=57&custom.skin=blue
const flattenCustom = (obj, prefix, out) => {
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${encodeURIComponent(k)}` : encodeURIComponent(k);
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            flattenCustom(v, key, out);
        } else if (v !== undefined && v !== null) {
            out.push(`${key}=${encodeURIComponent(v)}`);
        }
    }
    return out;
};

const appendCustom = (url, custom, prefix) => custom && typeof custom === 'object'
    ? flattenCustom(custom, prefix, []).reduce((u, p) => u + `&${p}`, url)
    : url;

export const soloUrl = (g, userId, userName, lod, flip, custom) => {
    if (g.absolute) return g.url;
    let url = g.url ? `${g.url}?userId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName)}&lod=${lod}`
                    : `${BASE}?ruletype=${g.ruletype}&userId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName)}&lod=${lod}`;
    if (_localhost) {
        url += `&lobbyUrl=${WS_SERVER}`;
    }
    if (flip) url += '&flip=true';
    url = appendCustom(url, custom, 'custom');
    return g.url ? url : appendOptions(url, g.options);
};

export const gameUrl = ({ tableId, userId, userName, ruleType, isFirst, options, bot, lod, flip, custom, opponent }) => {
    let url = `${BASE}?websocketserver=${WS_SERVER}`
        + `&userName=${encodeURIComponent(userName)}&userId=${userId}&ruletype=${ruleType}`;
    if (!bot) url += `&tableId=${tableId}`;
    if (isFirst) url += '&first=true';
    if (bot) url += `&bot=${encodeURIComponent(bot)}`;
    if (lod !== undefined) url += `&lod=${lod}`;
    if (flip) url += '&flip=true';
    url = appendOptions(url, options);
    url = appendCustom(url, custom, 'custom');
    if (opponent?.userId) {
        url += `&opponent.userId=${encodeURIComponent(opponent.userId)}&opponent.userName=${encodeURIComponent(opponent.userName || '')}`;
        url = appendCustom(url, opponent.custom, 'opponent.custom');
    }
    return url;
};

export const spectateUrl = ({ tableId, userId, userName, ruleType, options }) => {
    const url = `${BASE}?websocketserver=${WS_SERVER}`
        + `&tableId=${tableId}&userName=${encodeURIComponent(userName)}&userId=${userId}&ruletype=${ruleType}&spectator=true`;
    return appendOptions(url, options);
};

const RULE_ASSETS = { eightball: 'eightball', snooker: 'snooker', threecushion: 'threecushion', nineball: 'nineball', sagu: 'sagu' };
export const ruleIcon = rule => {
    const name = RULE_ASSETS[rule];
    return name
        ? html`<img src="assets/${name}.png" alt="${rule}" title="${rule}" width="18" height="18" style="vertical-align:middle">`
        : html`🎱`;
};

export const renderTrophy = i => ['🏆','🥈','🥉','🎖️'][i] ?? '';

// Text shown in the small red badge on a game/rule icon.
// `freeaim` is rendered as a symbol rather than the literal "true".
// Uses ⊕ (circled plus) instead of ⌖ because it renders larger/clearer at small sizes.
export const badgeText = (options) =>
    options?.freeaim ? '⊕' : Object.values(options || {})[0];

export const replayUrl = (base, userId, userName) =>
    `${base}&userId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName)}`;
