function getClientIp(r) {
  const xff = r.headersIn["x-forwarded-for"];
  if (xff && typeof xff === "string") {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  return r.headersIn["cf-connecting-ip"] || r.headersIn["x-real-ip"] || r.remoteAddress;
}

function createMeta(r, country, city) {
  return {
    ts: new Date().toISOString(),
    ua: r.headersIn["user-agent"] || "",
    origin: r.headersIn.origin || "",
    country: country,
    city: city || "",
  };
}

async function buildMeta(r) {
  const ip = getClientIp(r);
  const cache = ngx.shared.ip_cache;

  const cached = cache.get(ip);
  if (cached) {
    const parts = cached.split("|");
    const country = parts[0];
    const city = parts[1] || "";
    console.log(`using cached location: ${country}, ${city} for ip: ${ip}`);
    return createMeta(r, country, city);
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
    console.log(`fetched location: ${country}, ${city} for ip: ${ip}`);
  } catch (e) {
    console.log(`api error: ${e.message} for ip: ${ip}`);
  }

  // Cache for 1 hour (3600000 ms)
  cache.set(ip, `${country}|${city}`, 3600000);

  return createMeta(r, country, city);
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

async function stats(r) {
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

  const nginxRes = await r.subrequest("/basic_status", { method: "GET" });
  const nginx = nginxRes.status === 200 ? parseNginxStatus(nginxRes.responseText) : null;

  const nchanRes = await r.subrequest("/nchan_stats", { method: "GET" });
  const nchan = nchanRes.status === 200 ? parseNchanStatus(nchanRes.responseText) : null;

  const data = {
    nginx,
    nchan,
    ip_cache: getIpCache(),
    ts: new Date().toISOString(),
  };

  r.headersOut["Content-Type"] = "application/json";
  r.return(200, JSON.stringify(data));
}

export default { publish, stats };
