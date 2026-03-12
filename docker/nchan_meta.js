async function buildMeta(r) {
  const ip = r.remoteAddress;
  let country = "XX";
  let cache;

  try {
    cache = njs.shared && njs.shared.ip_cache;
  } catch (e) {
    cache = undefined;
  }

  if (cache) {
    country = cache.get(ip);

    if (!country) {
      try {
        let reply = await ngx.fetch(`https://api.country.is/${ip}`, { timeout: 2000 });
        let data = await reply.json();
        country = data.country || "XX";
        cache.set(ip, country, { timeout: 86400 });
      } catch (e) {
        country = "XX";
      }
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
      const cache = njs.shared && njs.shared.ip_cache;
      if (cache) {
        const keys = cache.keys ? cache.keys() : [];
        const data = {};
        keys.forEach(k => {
          data[k] = cache.get(k);
        });
        return data;
      }
    } catch (e) {
      return { error: e.message };
    }
    return null;
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
