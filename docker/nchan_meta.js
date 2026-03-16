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
    ts: Date.now(),
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
  } catch (e) {
    r.error(`api error: ${e.message} for ip: ${ip}`);
  }

  // Cache for 1 hour
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
  let body = r.requestText || "";
  let isJson = false;
  let enrichedBody = body;

  try {
    const parsed = JSON.parse(body);
    const meta = await buildMeta(r);
    const enriched = mergeMeta(parsed, meta);
    enrichedBody = JSON.stringify(enriched);
    isJson = true;
  } catch (e) {
    // Not JSON
  }

  const res = await r.subrequest("/internal" + r.uri, {
    method: r.method,
    body: enrichedBody,
  });

  if (isJson) {
    r.headersOut["Content-Type"] = "application/json";
    r.return(res.status, enrichedBody);
  } else {
    r.return(res.status, res.responseText);
  }
}

async function stats(r) {
  const cache = ngx.shared.ip_cache;
  const keys = cache.keys() || [];
  const ip_cache = {};

  keys.forEach((k) => {
    const val = cache.get(k);
    if (val) ip_cache[k] = val;
  });

  const data = {
    ip_cache,
    ts: new Date().toISOString(),
  };

  r.headersOut["Content-Type"] = "application/json";
  r.return(200, JSON.stringify(data));
}

export default { publish, stats };
