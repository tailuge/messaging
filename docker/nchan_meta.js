function buildMeta(r) {
  return {
    ts: new Date().toISOString(),
    origin: r.headersIn.origin || "",
    locale: r.headersIn["accept-language"] || "",
    ua: r.headersIn["user-agent"] || "",
    host: r.headersIn.host || "",
    path: r.uri
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

  const meta = buildMeta(r);
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
  try {
    const [nginxRes, nchanRes] = await Promise.all([
      r.subrequest("/basic_status"),
      r.subrequest("/nchan_stats")
    ]);

    const nginx =
      nginxRes.status === 200 ? parseNginxStatus(nginxRes.responseText) : null;
    const nchan =
      nchanRes.status === 200 ? parseNchanStatus(nchanRes.responseText) : null;

    let channel = null;
    const channelId = r.args.channel;
    if (channelId) {
      const chanRes = await r.subrequest("/internal/channel/" + channelId);
      if (chanRes.status === 200) {
        try {
          channel = JSON.parse(chanRes.responseText);
        } catch (e) {
          channel = { error: "Failed to parse channel info" };
        }
      } else {
        channel = { status: chanRes.status, error: "Channel not found or error" };
      }
    }

    const data = {
      nginx,
      nchan,
      channel,
      ts: new Date().toISOString()
    };

    r.headersOut["Content-Type"] = "application/json";
    r.return(200, JSON.stringify(data));
  } catch (e) {
    r.return(500, JSON.stringify({ error: e.message }));
  }
}

export default { publish, stats };
