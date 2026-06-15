
import { html } from 'lit';

export const CLIENTVERSION = 377;
export const formatVersion = (v) => `v${Math.floor(v / 100)}.${String(v % 100).padStart(2, '0')}`;

export const genId = () => 'user-' + Math.random().toString(36).slice(2, 7);

export const SCOREBOARD_URL = 'https://scoreboard-tailuge.vercel.app';
export const NCHANBASE = (typeof localStorage !== 'undefined' && localStorage.getItem('useProxy') === 'true')
    ? 'nchanproxy.tailuge.workers.dev'
    : 'billiards-network.onrender.com';
const _localhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
export const WS_SERVER = _localhost ? `ws://${window.location.hostname}:80` : `wss://${NCHANBASE}`;
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
    currentMatch: null // { tableId, ruleType, isFirst }
};

export function reduce(state, action) {
    const C = { ...state.challenges };
    const other = m => m.challengerId === action.myId ? m.challengeeId : m.challengerId;

    switch (action.type) {
        case 'CONNECTED':
            return { ...state, connected: action.payload };
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
                delete C[id];
                return {
                    ...state, challenges: C,
                    currentMatch: {
                        tableId: m.tableId,
                        ruleType: m.ruleType,
                        options,
                        isFirst: m.nextTurnId ? m.nextTurnId === action.myId : m.challengerId === action.myId
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
        case 'MATCH_SET':
            return { ...state, currentMatch: action.payload };
        case 'MATCH_LEAVE':
            return { ...state, currentMatch: null };
        default:
            return state;
    }
}

/**
 * Returns an emoji and title based on origin or ruleType.
 * @param {string} origin 
 * @param {string} ruleType 
 */
export function getEmoji(origin = "", ruleType = "", status = "") {
  const ruleMap = {
    bot: { emoji: "🤖", title: "bot" },
    nineball: { emoji: "⑨", title: "nineball" },
    eightball: { emoji: "🎱", title: "eightball" },
    snooker: { emoji: "🔴", title: "snooker" },
    threecushion: { emoji: "③", title: "threecushion" },
  };

    const mapped = ruleMap[ruleType]
    
  // 1. Check user status first
  if (status === "spectating") return { emoji: "🔭", title: "spectator" };
  if (status === "playing") return mapped ?? { emoji: "🎮", title: "playing" };
  if (status === "available" &&ruleType === "replay") return { emoji: "👀", title: "replay" };


    
  if (mapped) {
      if (origin.includes("veli")) return { emoji: "🎓", title: "study" };
      if (origin.includes("github")) return { emoji: mapped.emoji+"🐙", title: "github" };
      if (origin.includes("localhost")) return { emoji: mapped.emoji+"🏠", title: "localhost" };
      return mapped;
  }

  if (ruleType.includes("-bot")) {
	const botmap = ruleMap[ruleType.replace("-bot","")];
	return { emoji: botmap.emoji+"🤖", title: "bot" };
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

export const soloUrl = (g, userId, userName, lod, flip) => {
    if (g.absolute) return g.url;
    let url = g.url ? `${g.url}?userId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName)}&lod=${lod}`
                    : `${BASE}?ruletype=${g.ruletype}&userId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName)}&lod=${lod}`;
    if (flip) url += '&flip=true';
    return g.url ? url : appendOptions(url, g.options);
};

export const gameUrl = ({ tableId, userId, userName, ruleType, isFirst, options, bot, lod, flip }) => {
    let url = `${BASE}?websocketserver=${WS_SERVER}`
        + `&userName=${encodeURIComponent(userName)}&userId=${userId}&ruletype=${ruleType}`;
    if (!bot) url += `&tableId=${tableId}`;
    if (isFirst) url += '&first=true';
    if (bot) url += `&bot=${encodeURIComponent(bot)}`;
    if (lod !== undefined) url += `&lod=${lod}`;
    if (flip) url += '&flip=true';
    return appendOptions(url, options);
};

export const spectateUrl = ({ tableId, userId, userName, ruleType }) =>
    `${BASE}?websocketserver=${WS_SERVER}`
    + `&tableId=${tableId}&userName=${encodeURIComponent(userName)}&userId=${userId}&ruletype=${ruleType}&spectator=true`;

const RULE_ASSETS = { eightball: 'eightball', snooker: 'snooker', threecushion: 'threecushion', nineball: 'nineball' };
export const ruleIcon = rule => {
    const name = RULE_ASSETS[rule];
    return name
        ? html`<img src="assets/${name}.png" alt="${rule}" title="${rule}" width="18" height="18" style="vertical-align:middle">`
        : html`🎱`;
};

export const renderTrophy = i => ['🏆','🥈','🥉','🎖️'][i] ?? '';

export const replayUrl = (base, userId, userName) =>
    `${base}&userId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName)}`;
