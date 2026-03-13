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
    cache = (typeof ngx !== 'undefined' && ngx.shared && ngx.shared.ip_cache) ? ngx.shared.ip_cache : null;
  } catch (e) {
    cache = null;
  }

  if (cache) {
    const cached = cache.get(ip);
    if (cached) {
      country = cached;
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
      let data = JSON.parse(text);
      country = data.country || "XX";
    } catch (e) {
      country = "XX";
      console.log(`api error: ${e.message} for ip: ${ip}`);
    }
  

  if (cache) {
    try {
      // NJS shared dict timeout is in milliseconds (since 0.8.0)
      // 86400000 ms = 24 hours
      cache.set(ip, country, 86400000);
    } catch (e) {
      console.log(`failed to set cache: ${e.message}`);
    }
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
      const shared = (typeof ngx !== 'undefined' && ngx.shared) ? ngx.shared : null;
      const cache = (shared && shared.ip_cache) ? shared.ip_cache : null;
      const meta = shared ? (function () {
        try {
          const serialized = JSON.parse(JSON.stringify(shared));
          return serialized && serialized.ip_cache ? serialized.ip_cache : null;
        } catch (e) {
          return null;
        }
      })() : null;
      if (!cache) {
        return { note: "ip_cache unavailable", meta };
      }
      if (typeof cache.keys !== "function") {
        return { note: "ip_cache keys() not supported in this NJS build", meta };
      }
      const keys = cache.keys() || [];
      const entries = {};
      keys.forEach(k => {
        const value = cache.get(k);
        if (typeof value !== "undefined") {
          entries[k] = value;
        }
      });
      return { meta, entries };
    } catch (e) {
      return { error: e.message };
    }
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
