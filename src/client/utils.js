
import { html } from 'lit';

export const SCOREBOARD_URL = 'https://scoreboard-tailuge.vercel.app';

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
                if (!C[m.challengerId] || C[m.challengerId].tableId !== m.tableId)
                    C[m.challengerId] = { ...m, status: 'pending' };
            } else if (m.type === 'accept' && !state.currentMatch) {
                const pending = C[id];
                const options = m.options || (pending?.tableId === m.tableId ? pending.options : undefined);
                delete C[id];
                return {
                    ...state, challenges: C,
                    currentMatch: { tableId: m.tableId, ruleType: m.ruleType, options, isFirst: m.challengerId === action.myId }
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
    spectator: { emoji: "🔭", title: "spectator" },
    replay: { emoji: "👀", title: "replay" },
    bot: { emoji: "🤖", title: "bot" },
    nineball: { emoji: "⑨", title: "nineball" },
    eightball: { emoji: "🎱", title: "eightball" },
    snooker: { emoji: "🔴", title: "snooker" },
    threecushion: { emoji: "③", title: "threecushion" },
  };

  // 1. Check user status first
  if (status === "spectating") return { emoji: "🔭", title: "spectator" };
  if (status === "playing") return ruleMap[ruleType] ?? { emoji: "🎮", title: "playing" };

  // 2. Check origin patterns
  if (origin.includes("github")) return { emoji: "🐙", title: "github" };
  if (origin.includes("vercel")) return { emoji: "👥", title: "vercel" };
  if (origin.includes("render")) return { emoji: "👤", title: "vercel" };
  if (origin.includes("localhost")) return { emoji: "🏠", title: "localhost" };

  return ruleMap[ruleType] ?? { emoji: "🎮", title: "external" };
};

export const flag = (code) => code === 'BOT'
    ? '🤖'
    : code
        ? [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))).join('')
        : '🌐';

const BASE = 'https://billiards.tailuge.workers.dev/';
const appendOptions = (url, options) => options
    ? Object.entries(options).reduce((u, [k, v]) => u + `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`, url)
    : url;

export const soloUrl = (g, userId, userName, lod) => {
    if (g.url) return `${g.url}?userId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName)}&lod=${lod}`;
    return appendOptions(
        `${BASE}?ruletype=${g.ruletype}&userId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName)}&lod=${lod}`,
        g.options
    );
};

export const gameUrl = ({ tableId, userId, userName, ruleType, isFirst, options, bot, lod, rematch }) => {
    let url = `${BASE}?websocketserver=wss://billiards.onrender.com/ws`
        + `&tableId=${tableId}&userName=${encodeURIComponent(userName)}&userId=${userId}&ruletype=${ruleType}`;
    if (isFirst) url += '&first=true';
    if (bot) url += `&bot=${encodeURIComponent(bot)}`;
    if (lod !== undefined) url += `&lod=${lod}`;
    if (rematch) url += `&rematch=${rematch}`;
    return appendOptions(url, options);
};

export const spectateUrl = ({ tableId, userId, userName, ruleType }) =>
    `${BASE}?websocketserver=wss://billiards.onrender.com/ws`
    + `&tableId=${tableId}&userName=${encodeURIComponent(userName)}&userId=${userId}&ruletype=${ruleType}&spectator=true`;

const RULE_ASSETS = { eightball: 'eightball', snooker: 'snooker', threecushion: 'threecushion', nineball: 'nineball' };
export const ruleIcon = rule => {
    const name = RULE_ASSETS[rule];
    return name
        ? html`<img src="assets/${name}.png" alt="${rule}" title="${rule}" width="18" height="18" style="vertical-align:middle">`
        : html`🎱`;
};

export const renderTrophy = i => ['🏆','🥈','🥉','🎖️'][i] ?? '';