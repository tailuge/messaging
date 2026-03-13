function getClientIp(r) {
  const xff = r.headersIn["x-forwarded-for"];
  if (xff && typeof xff === "string") {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  return (
    r.headersIn["cf-connecting-ip"] ||
    r.headersIn["x-real-ip"] ||
    r.remoteAddress
  );
}


async function buildMeta(r) {
  const ip = getClientIp(r);
  let country = "XX";
  let cache = null;

  try {
    // Log njs info once
    if (typeof njs !== 'undefined' && !njs._logged) {
      console.log(`njs version: ${njs.version}, shared exists: ${!!njs.shared}, keys: ${Object.keys(njs).join(', ')}`);
      njs._logged = true;
    }
    cache = njs.shared && njs.shared.ip_cache;
  } catch (e) {
    cache = null;
    console.log(`cache error: ${e.message}`);
  }

  if (!cache) {
    console.log(`cache is not available (njs.shared exists: ${!!(njs && njs.shared)}, ip_cache exists: ${!!(njs && njs.shared && njs.shared.ip_cache)})`);
  } else {
    const cached = cache.get(ip);
    if (cached) {
      country = cached;
      console.log(`country from cache: ${country}`);
      return {
        ts: new Date().toISOString(),
        origin: r.headersIn.origin || "",
        locale: r.headersIn["accept-language"] || "",
        ua: r.headersIn["user-agent"] || "",
        host: r.headersIn.host || "",
        path: r.uri,
        country: country
      };
    }
  }

 
    try {
      let reply = await ngx.fetch(`https://api.country.is/${ip}`, {
        timeout: 3000,
        headers: { "User-Agent": "Nginx-NJS-Messaging" }
      });
      let text = await reply.text();
      console.log(`api response for ${ip}: ${text}`);
      let data = JSON.parse(text);
      country = data.country || "XX";
    } catch (e) {
      country = "XX";
      console.log(`api error: ${e.message} for ip: ${ip}`, e);
    }
  

  if (cache) {
    cache.set(ip, country, { timeout: 86400000 });
    console.log(`country cached: ${country}`);
  }

  return {
    ts: new Date().toISOString(),
    origin: r.headersIn.origin || "",
    locale: r.headersIn["accept-language"] || "",
    ua: r.headersIn["user-agent"] || "",
    host: r.headersIn.host || "",
    path: r.uri,
    country: country
  };
}

function mergeMeta(payload, meta) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    // Delete any client-provided _meta to prevent tampering
    delete payload._meta;
    payload._meta = meta;
    return payload;
  }

  return { data: payload, _meta: meta };
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
      body: r.requestText || ""
    });
    r.return(res.status, res.responseText);
    return;
  }

  const meta = await buildMeta(r);
  const enriched = mergeMeta(parsed, meta);
  const body = JSON.stringify(enriched);

  const res = await r.subrequest("/internal" + r.uri, {
    method: r.method,
    body
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

  return {
    active,
    accepts,
    handled,
    requests,
    reading,
    writing,
    waiting
  };
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
    try {
      const cache = njs.shared && njs.shared.ip_cache;
      if (cache) {
        if (typeof cache.keys !== "function") {
          return { note: "ip_cache keys() not supported in this NJS build" };
        }
        const keys = cache.keys();
        const data = {};
        keys.forEach(k => {
          data[k] = cache.get(k);
        });
        return data;
      }
    } catch (e) {
      return { error: e.message };
    }
    return { note: "ip_cache unavailable" };
  }

  function sendResponse(nginx, nchan) {
    const data = {
      nginx,
      nchan,
      ip_cache: getIpCache(),
      ts: new Date().toISOString()
    };
    r.headersOut["Content-Type"] = "application/json";
    r.return(200, JSON.stringify(data));
  }

  try {
    r.subrequest("/basic_status", { method: "GET" }, function(nginxRes) {
      const nginx = nginxRes.status === 200 ? parseNginxStatus(nginxRes.responseText) : null;
      r.subrequest("/nchan_stats", { method: "GET" }, function(nchanRes) {
        const nchan = nchanRes.status === 200 ? parseNchanStatus(nchanRes.responseText) : null;
        sendResponse(nginx, nchan);
      });
    });
  } catch (e) {
    r.return(500, JSON.stringify({ error: e.message }));
  }
}

export default { publish, stats };
