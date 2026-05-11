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

function createMeta(r, country, city, since) {
  return {
    ts: Date.now(),
    ua: r.headersIn["user-agent"] || "",
    origin: r.headersIn.referer || r.headersIn.origin || "",
    country: country,
    city: city || "",
    since: since,
  };
}

async function buildMeta(r) {
  const ip = getClientIp(r);
  const obfuscatedIp = obfuscateIp(ip);
  const cache = ngx.shared.ip_cache;
  const origin = r.headersIn.origin || "";

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

    const since = parseInt(parts[4]) || Date.now();
    const newCount = count + 1;
    cache.set(obfuscatedIp, `${country}|${city}|${newCount}|${origins}|${since}`, 86400000);
    return createMeta(r, country, city, since);
  }

  // Fetch country and city from API
  let country = "XX";
  let city = "";
  try {
    const reply = await ngx.fetch(`https://api.country.is/${ip}?fields=city`, {
      timeout: 2000,
      headers: { "User-Agent": "Nginx-NJS-Messaging" },
    });
    const text = await reply.text();
    const data = JSON.parse(text);
    country = data.country || "XX";
    city = data.city || "";
  } catch (e) {
    console.log(`api error: ${e.message} for ip: ${ip.substring(0, 8)}`);
  }

  // Cache for 24 hours (86400000 ms) - use obfuscated IP as key
  const obfuscatedOrigin = origin ? obfuscateOrigin(origin) : "";
  const since = Date.now();
  cache.set(obfuscatedIp, `${country}|${city}|1|${obfuscatedOrigin}|${since}`, 86400000);

  return createMeta(r, country, city, since);
}

function mergeMeta(payload, meta) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    delete payload.meta;
    payload.meta = meta;
    return payload;
  }
  return { data: payload, meta: meta };
}

async function publish(r) {
  let parsed = null;
  let isJson = false;

  if (r.requestText && r.requestText.length > 0) {
    try {
      parsed = JSON.parse(r.requestText);
      isJson = true;
    } catch (e) {
      isJson = false;
    }
  }

  if (!isJson) {
    const res = await r.subrequest("/internal" + r.uri, {
      method: r.method,
      body: r.requestText || "",
    });
    r.return(res.status, res.responseText);
    return;
  }

  const meta = await buildMeta(r);
  const enriched = mergeMeta(parsed, meta);
  const body = JSON.stringify(enriched);

  const res = await r.subrequest("/internal" + r.uri, {
    method: r.method,
    body,
  });

  r.headersOut["Content-Type"] = "application/json";
  r.return(res.status, body);
}

function parseNginxStatus(text) {
  const lines = text.split("\n");
  const active = parseInt(lines[0].split(":")[1].trim());
  const serverMetrics = lines[2].trim().split(/\s+/);
  const accepts = parseInt(serverMetrics[0]);
  const handled = parseInt(serverMetrics[1]);
  const requests = parseInt(serverMetrics[2]);
  const readingMetrics = lines[3].trim().split(/\s+/);
  const reading = parseInt(readingMetrics[1]);
  const writing = parseInt(readingMetrics[3]);
  const waiting = parseInt(readingMetrics[5]);

  return { active, accepts, handled, requests, reading, writing, waiting };
}

function parseNchanStatus(text) {
  const stats = {};
  const lines = text.split("\n");
  lines.forEach((line) => {
    const parts = line.split(":");
    if (parts.length === 2) {
      const key = parts[0].trim().toLowerCase().replace(/\s+/g, "_");
      const value = parseInt(parts[1].trim());
      if (!isNaN(value)) {
        stats[key] = value;
      }
    }
  });
  return stats;
}

function getIpCache() {
    const cache = ngx.shared.ip_cache;
    const keys = cache.keys() || [];
    const entries = {};
    keys.forEach((k) => {
      const value = cache.get(k);
      if (typeof value !== "undefined") {
        entries[k] = value;
      }
    });
    return entries;
  }

  function getUptime() {
    try {
      const stats = ngx.shared.system_stats;
      let startTime = stats.get("start_time");

      if (!startTime) {
        try {
          const fs = require("fs");
          const content = fs.readFileSync("/var/log/nginx/njs_error.log", "utf8");
          const firstLine = content.split("\n")[0];
          const tsMatch = firstLine.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/);
          if (tsMatch) {
            const tsStr = tsMatch[1].replace(/\//g, "-").replace(" ", "T");
            startTime = new Date(tsStr).getTime().toString();
            stats.set("start_time", startTime);
          }
        } catch (e) {
          // fallback to now
        }
      }

      if (!startTime) {
        startTime = Date.now().toString();
        stats.set("start_time", startTime);
      }

      const diff = Date.now() - parseInt(startTime);
      const seconds = Math.floor(diff / 1000);
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return { seconds, days, hours, mins };
    } catch (e) {
      return null;
    }
  }

  function getLastLines(path, maxLines) {
    const fs = require("fs");
    try {
      if (!fs.existsSync(path)) return [];
      const content = fs.readFileSync(path, "utf8");
      const lines = content.trim().split("\n");
      return lines.slice(-maxLines);
    } catch (e) {
      return ["Error reading " + path + ": " + e.message];
    }
  }

  async function stats(r) {
    const nginxRes = await r.subrequest("/basic_status", { method: "GET" });
    const nginx = nginxRes.status === 200 ? parseNginxStatus(nginxRes.responseText) : null;

    const nchanRes = await r.subrequest("/nchan_stats", { method: "GET" });
    const nchan = nchanRes.status === 200 ? parseNchanStatus(nchanRes.responseText) : null;

    const data = {
      nginx,
      nchan,
      ip_cache: getIpCache(),
      uptime: getUptime(),
      njs_logs: getLastLines("/var/log/nginx/njs_error.log", 50),
      error_logs: getLastLines("/var/log/nginx/error_file.log", 100),
      ts: new Date().toISOString(),
    };

    r.headersOut["Content-Type"] = "application/json";
    r.return(200, JSON.stringify(data));
  }

export default { publish, stats };
