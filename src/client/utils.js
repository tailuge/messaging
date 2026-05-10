
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
export function getEmoji(origin = "", ruleType = "") {
  // 1. Check origin patterns
  if (origin.includes("github")) return { emoji: "🐙", title: "github" };
  if (origin.includes("vercel")) return { emoji: "👥", title: "vercel" };
  if (origin.includes("render")) return { emoji: "👤", title: "vercel" };
  if (origin.includes("localhost")) return { emoji: "🏠", title: "localhost" };

  // 2. Lookup for rule types
  const ruleMap = {
    spectator: { emoji: "🔭", title: "spectator" },
    replay: { emoji: "👀", title: "replay" },
    bot: { emoji: "🤖", title: "bot" },
    nineball: { emoji: "⑨", title: "nineball" },
    eightball: { emoji: "🎱", title: "eightball" },
    snooker: { emoji: "🔴", title: "snooker" },
    threecushion: { emoji: "③", title: "threecushion" },
  };

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
    if (g.url) return `${g.url}?clientId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName)}&lod=${lod}`;
    return appendOptions(
        `${BASE}?ruletype=${g.ruletype}&clientId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName)}&lod=${lod}`,
        g.options
    );
};

export const gameUrl = ({ tableId, userId, userName, ruleType, isFirst, options, bot, lod }) => {
    let url = `${BASE}?websocketserver=wss://billiards.onrender.com/ws`
        + `&tableId=${tableId}&userName=${encodeURIComponent(userName)}&clientId=${userId}&ruletype=${ruleType}`;
    if (isFirst) url += '&first=true';
    if (bot) url += `&bot=${encodeURIComponent(bot)}`;
    if (lod !== undefined) url += `&lod=${lod}`;
    return appendOptions(url, options);
};

export const ruleIcon = rule => ({ eightball: '🎱', snooker: '🔴', threecushion: '➂', nineball: '➈' }[rule] ?? '🎱');

export const renderTrophy = i => ['🏆','🥈','🥉','🎖️'][i] ?? '';