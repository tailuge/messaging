function getClientIp(r) {
  const xff = r.headersIn["x-forwarded-for"];
  if (xff && typeof xff === "string") {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  return r.headersIn["cf-connecting-ip"] || r.headersIn["x-real-ip"] || r.remoteAddress;
}

function obfuscateIp(ip) {
  if (ip.includes(":")) {
    return ip.replace(/[0-9a-f](?=:)/gi, "x");
  }
  return ip.replace(/\d(?=\.)/g, "x");
}

function obfuscateOrigin(origin) {
  var protoEnd = origin.indexOf("://");
  if (protoEnd === -1) return origin;

  var proto = origin.substring(0, protoEnd + 3);
  var rest = origin.substring(protoEnd + 3);
  var queryStart = rest.search(/[?&]/);
  if (queryStart !== -1) rest = rest.substring(0, queryStart);
  var pathStart = rest.indexOf("/");
  var hostPart = pathStart === -1 ? rest : rest.substring(0, pathStart);
  var pathPart = pathStart === -1 ? "" : rest.substring(pathStart);

  return proto + obfuscateIp(hostPart) + pathPart;
}

function parseUA(ua) {
  var os = "Unknown";
  var browser = "Unknown";

  if (ua) {
    if (/Tauri/i.test(ua)) { os = "Tauri"; browser = "Tauri"; }
    else if (/Android/i.test(ua)) os = "Android";
    else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
    else if (/Windows NT/i.test(ua)) os = "Windows";
    else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
    else if (/Linux/i.test(ua)) os = "Linux";

    if (browser === "Unknown") {
      if (/Edg\//i.test(ua)) browser = "Edge";
      else if (/OPR\//i.test(ua) || /Opera\//i.test(ua)) browser = "Opera";
      else if (/SamsungBrowser\//i.test(ua)) browser = "Samsung Internet";
      else if (/Chrome\//i.test(ua) || /CriOS\//i.test(ua)) browser = "Chrome";
      else if (/Firefox\//i.test(ua) || /FxiOS\//i.test(ua)) browser = "Firefox";
      else if (/Safari\//i.test(ua)) browser = "Safari";
    }
  }

  return { os: os, browser: browser };
}

function reduceUA(ua) {
  if (!ua) return "";
  var parsed = parseUA(ua);
  var summary = [parsed.os, parsed.browser]
    .filter(function (value) { return value !== "Unknown"; })
    .join(" ");
  return summary || ua;
}

function reduceOrigin(origin) {
  if (!origin) return "";
  if (origin.startsWith("https://billiards.tailuge.workers.dev") || origin.startsWith("http://billiards.tailuge.workers.dev")) {
    var path = origin.replace(/^https?:\/\/billiards\.tailuge\.workers\.dev/, "");
    return path.length > 0 ? path : "/";
  }
  return origin;
}

function createMessageId() {
  return "xxxxxx".replace(/x/g, function () {
    return Math.floor(Math.random() * 16).toString(16);
  });
}

// Meta keys are the compact wire names (payload.md §3.4, phase P1). The client
// decodes them back to canonical names in src/wire.ts.
function createMeta(r, country, city) {
  return {
    t: Date.now(),
    i: createMessageId(),
    u: reduceUA(r.headersIn["user-agent"] || ""),
    o: reduceOrigin(r.headersIn.origin || ""),
    c: country,
    y: city || "",
  };
}

async function buildMeta(r) {
  const ip = getClientIp(r);
  const obfuscatedIp = obfuscateIp(ip);
  const cache = ngx.shared.ip_cache;
  const origin = reduceOrigin(r.headersIn.origin || "");
  const parsedUA = parseUA(r.headersIn["user-agent"] || "");
  const cached = cache.get(obfuscatedIp);

  if (cached) {
    const parts = cached.split("|");
    const country = parts[0];
    const city = parts[1] || "";
    const count = parseInt(parts[2]) || 0;
    let origins = parts[3] || "";
    const originsArr = origins ? origins.split(",") : [];
    const obfuscatedOrigin = origin ? obfuscateOrigin(origin) : "";
    if (obfuscatedOrigin && originsArr.indexOf(obfuscatedOrigin) === -1) {
      originsArr.push(obfuscatedOrigin);
      origins = originsArr.join(",");
    }
    cache.set(obfuscatedIp, `${country}|${city}|${count + 1}|${origins}|${parsedUA.os}|${parsedUA.browser}`, 86400000);
    return createMeta(r, country, city);
  }

  let country = "XX";
  let city = "";
  try {
    const reply = await ngx.fetch(`https://api.country.is/${ip}?fields=city`, {
      timeout: 2000,
      headers: { "User-Agent": "Nginx-NJS-Messaging" },
    });
    const data = JSON.parse(await reply.text());
    country = data.country || "XX";
    city = data.city || "";
  } catch (e) {
    ngx.log(ngx.WARN, `api error: ${e.message} for ip: ${ip.substring(0, 8)}`);
  }

  const obfuscatedOrigin = origin ? obfuscateOrigin(origin) : "";
  cache.set(obfuscatedIp, `${country}|${city}|1|${obfuscatedOrigin}|${parsedUA.os}|${parsedUA.browser}`, 86400000);
  return createMeta(r, country, city);
}

// Matches the version inside the message's own flat `meta` object only, so a
// `v`/`version` key in opaque options/custom payloads is ignored (payload.md §7.2).
function extractClientVersion(rawText) {
  if (!rawText) return null;
  const metaBody = rawText.match(/"meta"\s*:\s*\{([^{}]*)\}/);
  if (!metaBody) return null;
  const version = metaBody[1].match(/"(?:v|version)"\s*:\s*"([^"]+)"/);
  return version ? version[1] : null;
}

function injectMetaString(rawText, meta) {
  const metaStr = JSON.stringify(meta);
  const trimmed = rawText.trim();
  if (/"meta"\s*:\s*\{/.test(trimmed)) {
    // Replace existing top-level "meta": { ... }
    const metaIdx = trimmed.indexOf('"meta"');
    if (metaIdx !== -1) {
      const startBrace = trimmed.indexOf('{', metaIdx);
      if (startBrace !== -1) {
        let depth = 0;
        let endIdx = -1;
        for (let i = startBrace; i < trimmed.length; i++) {
          if (trimmed[i] === '{') depth++;
          else if (trimmed[i] === '}') {
            depth--;
            if (depth === 0) { endIdx = i; break; }
          }
        }
        if (endIdx !== -1) {
          return trimmed.substring(0, metaIdx) + `"meta":${metaStr}` + trimmed.substring(endIdx + 1);
        }
      }
    }
  }
  // Inject into JSON object
  const lastBrace = trimmed.lastIndexOf('}');
  if (lastBrace === -1) return rawText;
  const content = trimmed.substring(1, lastBrace).trim();
  if (content.length === 0) {
    return `{"meta":${metaStr}}`;
  }
  return trimmed.substring(0, lastBrace) + `,"meta":${metaStr}}`;
}

function incrementStat(key, delta) {
  if (typeof delta === "undefined") delta = 1;
  const stats = ngx.shared.system_stats;
  const current = parseInt(stats.get(key) || "0", 10) || 0;
  stats.set(key, String(current + delta));
}

function getStatsSnapshot(keys) {
  const stats = ngx.shared.system_stats;
  const snapshot = {};
  keys.forEach((key) => { snapshot[key] = parseInt(stats.get(key) || "0", 10) || 0; });
  return snapshot;
}

async function publish(r) {
  const reqText = r.requestText || "";
  const isJson = reqText.length > 0 && reqText.trim().startsWith("{");
  if (!isJson) {
    const res = await r.subrequest("/internal" + r.uri, { method: r.method, body: reqText });
    r.return(res.status, res.responseText);
    return;
  }
  const meta = await buildMeta(r);
  const clientVersion = extractClientVersion(reqText);
  if (clientVersion) {
    meta.v = clientVersion;
  }
  const body = injectMetaString(reqText, meta);
  incrementStat("publish_requests_total");
  // Legacy (canonical) and compact (P1) key forms are both counted.
  // Compact P2a values ("m":"p", "t":"l") and canonical words are both counted.
  const isPresence = reqText.includes('"m":"p"') || reqText.includes('"messageType":"presence"');
  if (isPresence) {
    incrementStat("presence_publish_total");
    if (reqText.includes('"t":"l"') || reqText.includes('"type":"leave"')) incrementStat("presence_leave_total");
  }
  const res = await r.subrequest("/internal" + r.uri, { method: r.method, body: body });
  // Publishers never read the body (NchanClient.publish checks response.ok
  // only), so return the status alone instead of echoing the enriched message
  // back — that echo was ~4-5 MB/day of dead response body (payload.md §7.7).
  r.return(res.status, "");
}

function presence_sub(r) {
  try {
    const userId = r.headersIn['X-User-Id'] || 'unknown';
    ngx.log(ngx.WARN, `presence_sub.. ${userId}`);
    if (userId !== 'unknown') ngx.shared.online_users.set(userId, "1");
    const referrer = r.headersIn['X-Referrer'];
    if (referrer && referrer.length > 0) {
      const sanitized = referrer.replace(/\|/g, '');
      const decoded = decodeURIComponent(sanitized);
      const stripped = decoded.replace(/[?#].*$/, '').replace(/\|/g, '');
      const value = encodeURIComponent(stripped);
      const ip = getClientIp(r);
      const obfuscatedIp = obfuscateIp(ip);
      const cache = ngx.shared.ip_cache;
      const rrefKey = `rref:${obfuscatedIp}`;
      const existing = cache.get(rrefKey);
      if (existing) {
        const entries = existing.split(",");
        let found = false;
        for (let i = 0; i < entries.length; i++) {
          const pair = entries[i].split("|");
          if (pair[1] === value) {
            pair[0] = String(parseInt(pair[0]) + 1);
            entries[i] = pair.join("|");
            found = true;
            break;
          }
        }
        if (!found) entries.push(`1|${value}`);
        cache.set(rrefKey, entries.join(","), 86400000);
      } else cache.set(rrefKey, `1|${value}`, 86400000);
    }
    r.return(200);
  } catch (e) {
    r.error(`presence_sub error: ${e.message}`);
    r.return(500);
  }
}

// `compact` selects the compact wire form (payload.md P1/P2a): short meta keys.
// Table leaves stay canonical (table channel is out of scope, §2.2).
async function publish_auto_leave(r, publishPath, payload, ua, compact) {
  const meta = compact
    ? { t: Date.now(), i: createMessageId(), u: ua, o: "internal" }
    : { ts: Date.now(), ua: ua, origin: "internal", msgId: createMessageId() };
  const enriched = Object.assign({}, payload, { meta: meta });
  await r.subrequest(publishPath, { method: "POST", body: JSON.stringify(enriched) });
}

function table_sub(r) {
  try {
    const userId = r.headersIn['X-User-Id'] || 'unknown';
    const tableId = r.headersIn['X-Nchan-Channel-Id'];
    ngx.log(ngx.WARN, `table_sub ${userId} to table ${tableId}`);
    r.return(200);
  } catch (e) {
    r.error(`table_sub error: ${e.message}`);
    r.return(500);
  }
}

async function table_unsub(r) {
  try {
    const userId = r.headersIn['X-User-Id'] || 'unknown';
    const tableId = r.headersIn['X-Nchan-Channel-Id'];
    ngx.log(ngx.WARN, `table_unsub ${userId} from table ${tableId}`);
    if (userId !== 'unknown' && tableId) {
      const isSpectator = r.args.spectator === "1";
      await publish_auto_leave(r, `/internal/publish/table/${tableId}`, { type: "table:leave", senderId: userId, data: isSpectator ? { isSpectator: true } : {} }, "nchan-auto-table-leave");
    }
    r.return(204);
  } catch (e) {
    r.error(`table_unsub error: ${e.message}`);
    r.return(500);
  }
}

async function publish_leave(r, userId) {
  await publish_auto_leave(r, "/internal/publish/presence/lobby", { m: "p", t: "l", u: userId }, "nchan-auto-leave", true);
}

async function presence_unsub(r) {
  try {
    const userId = r.headersIn['X-User-Id'] || 'unknown';
    incrementStat("presence_unsubscribe_total");
    incrementStat("presence_unsubscribe_websocket_total");
    ngx.log(ngx.WARN, `presence_unsub ${userId}`);
    if (userId !== 'unknown') {
      ngx.shared.online_users.delete(userId);
      await publish_leave(r, userId);
    }
    r.return(204);
  } catch (e) {
    r.error(`presence_unsub error: ${e.message}`);
    r.return(500);
  }
}

function parseNginxStatus(text) {
  const lines = text.split("\n");
  const active = parseInt(lines[0].split(":")[1].trim());
  const serverMetrics = lines[2].trim().split(/\s+/);
  const accepts = parseInt(serverMetrics[0]);
  const handled = parseInt(serverMetrics[1]);
  const requests = parseInt(serverMetrics[2]);
  const readingMetrics = lines[3].trim().split(/\s+/);
  return { active: active, accepts: accepts, handled: handled, requests: requests, reading: parseInt(readingMetrics[1]), writing: parseInt(readingMetrics[3]), waiting: parseInt(readingMetrics[5]) };
}

function parseNchanStatus(text) {
  const stats = {};
  text.split("\n").forEach((line) => {
    const parts = line.split(":");
    if (parts.length === 2) {
      const key = parts[0].trim().toLowerCase().replace(/\s+/g, "_");
      const value = parseInt(parts[1].trim());
      if (!isNaN(value)) stats[key] = value;
    }
  });
  return stats;
}

function getIpCache() {
  const cache = ngx.shared.ip_cache;
  const entries = {};
  (cache.keys() || []).forEach((k) => {
    if (k.startsWith("ref:") || k.startsWith("rref:")) return;
    const value = cache.get(k);
    if (typeof value !== "undefined") entries[k] = value;
  });
  return entries;
}

function getReferrerCache() {
  const cache = ngx.shared.ip_cache;
  const entries = {};
  (cache.keys() || []).forEach((k) => {
    if (!k.startsWith("rref:")) return;
    const value = cache.get(k);
    if (typeof value !== "undefined") entries[k] = value;
  });
  return entries;
}

function getOnlineUsers() { return ngx.shared.online_users.keys() || []; }

function getUptime() {
  try {
    const stats = ngx.shared.system_stats;
    let startTime = stats.get("start_time");
    if (!startTime) {
      try {
        const fs = require("fs");
        startTime = fs.statSync("/proc/1").mtime.getTime().toString();
        stats.set("start_time", startTime);
      } catch (e) {}
    }
    if (!startTime) { startTime = Date.now().toString(); stats.set("start_time", startTime); }
    const seconds = Math.floor((Date.now() - parseInt(startTime)) / 1000);
    return { seconds: seconds, days: Math.floor(seconds / 86400), hours: Math.floor((seconds % 86400) / 3600), mins: Math.floor((seconds % 3600) / 60) };
  } catch (e) { return null; }
}

function getLastLines(path, maxLines) {
  const fs = require("fs");
  try {
    if (!fs.existsSync(path)) return [];
    const content = fs.readFileSync(path, "utf8");
    return content.trim().split("\n").slice(-maxLines);
  } catch (e) { return ["Error reading " + path + ": " + e.message]; }
}

function getNjsLogs() {
  return getLastLines("/var/log/nginx/njs_error.log", 1000);
}

async function stats(r) {
  r.warn("Stats data");
  const nginxRes = await r.subrequest("/basic_status", { method: "GET" });
  const nginx = nginxRes.status === 200 ? parseNginxStatus(nginxRes.responseText) : null;
  const nchanRes = await r.subrequest("/nchan_stats", { method: "GET" });
  const nchan = nchanRes.status === 200 ? parseNchanStatus(nchanRes.responseText) : null;
  const data = {
    nginx: nginx,
    nchan: nchan,
    system_stats: getStatsSnapshot(["publish_requests_total", "presence_publish_total", "presence_leave_total", "presence_unsubscribe_total", "presence_unsubscribe_websocket_total"]),
    ip_cache: getIpCache(),
    referrer_cache: getReferrerCache(),
    online_users: getOnlineUsers(),
    uptime: getUptime(),
    njs_logs: getNjsLogs(),
    ts: new Date().toISOString(),
  };
  r.headersOut["Content-Type"] = "application/json";
  r.return(200, JSON.stringify(data));
}

async function online_users_api(r) {
  const users = getOnlineUsers();
  r.headersOut["Content-Type"] = "application/json";
  r.return(200, JSON.stringify(users));
}

export default { publish, presence_sub, presence_unsub, stats, online_users_api, table_unsub, table_sub };
