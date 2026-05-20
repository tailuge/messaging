async function fetchStats() {
  const dashboard = document.querySelector(".dashboard");
  // dashboard.classList.add('loading'); // Optional: show loading state

  try {
    // Use relative URL to fetch stats from the same origin
    const response = await fetch("/api/stats");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log("Stats received:", data);
    updateUI(data);

    const now = new Date();
    document.getElementById("last-update").textContent =
      `Last update: ${now.toLocaleTimeString()}`;
  } catch (error) {
    console.error("Error fetching stats:", error);
    document.getElementById("last-update").textContent = "Error fetching stats";
  } finally {
    // dashboard.classList.remove('loading');
  }
}

function updateUI(data) {
  if (data.nginx) {
    document.getElementById("stat-active-conns").textContent = data.nginx.active;
    document.getElementById("ngx-accepts").textContent = data.nginx.accepts;
    document.getElementById("ngx-handled").textContent = data.nginx.handled;
    document.getElementById("ngx-requests").textContent = data.nginx.requests;
  }

  if (data.uptime) {
    const up = data.uptime;
    document.getElementById("ngx-uptime").textContent = `${up.days}d ${up.hours}h ${up.mins}m`;
  }

  if (data.nchan) {
    document.getElementById("stat-total-channels").textContent =
      data.nchan.total_channels || 0;
    document.getElementById("stat-stored-messages").textContent = data.nchan.messages || 0;
    document.getElementById("stat-mem-used").textContent = formatBytes(
      data.nchan.shared_memory_used || 0,
    );
    document.getElementById("nch-published").textContent =
      data.nchan.total_published_messages || 0;
    document.getElementById("nch-subscribed").textContent =
      data.nchan.total_subscribed_messages || 0;
  }

  if (data.system_stats) {
    document.getElementById("nch-presence-leaves").textContent =
      data.system_stats.presence_leave_total || 0;
    document.getElementById("nch-presence-unsubs").textContent =
      data.system_stats.presence_unsubscribe_total || 0;
  }

   const ipCacheTableBody = document.querySelector("#ip-cache-table tbody");
   const ipCacheMeta = document.getElementById("ip-cache-meta");
   const ipCacheEntries = data.ip_cache && typeof data.ip_cache === "object" ? data.ip_cache : null;
   ipCacheMeta.textContent = "";

    ipCacheTableBody.textContent = '';
    if (ipCacheEntries && Object.keys(ipCacheEntries).length > 0) {
      Object.entries(ipCacheEntries)
        .sort((a, b) => {
          const partsA = a[1].split("|");
          const partsB = b[1].split("|");
          const hitsA = parseInt(partsA[2]) || 0;
          const hitsB = parseInt(partsB[2]) || 0;
          return hitsB - hitsA;
        })
        .forEach(([ip, value]) => {
          const parts = value.split("|");
          const country = parts[0] || "-";
          const city = parts[1] || "";
          const hits = parts[2] || "1";
          const origins = parts[3] || "-";
          const location = city ? city : "-";
          const sinceTs = parseInt(parts[4]);
          const since = sinceTs ? new Date(sinceTs).toLocaleString() : "-";

          const tr = document.createElement('tr');
          [ip, country, location, hits, origins, since].forEach(text => {
            const td = document.createElement('td');
            td.textContent = text;
            tr.appendChild(td);
          });
          ipCacheTableBody.appendChild(tr);
        });
    } else {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.style.textAlign = 'center';
      td.style.color = 'var(--secondary-color)';
      td.textContent = 'No cache data available.';
      tr.appendChild(td);
      ipCacheTableBody.appendChild(tr);
    }

  const njsLogsTableBody = document.querySelector("#njs-logs-table tbody");
  const njsLogsMeta = document.getElementById("njs-logs-meta");
  const njsLogs = Array.isArray(data.njs_logs) ? data.njs_logs : null;
  njsLogsMeta.textContent = "";
  njsLogsTableBody.textContent = '';

  if (njsLogs && njsLogs.length > 0) {
    njsLogs.forEach((logLine) => {
        const isError = logLine.toLowerCase().includes("api error");
        const tr = document.createElement('tr');
        if (isError) tr.classList.add('log-error');

        const match = logLine.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/);
        const timestamp = match ? match[1] : "";
        const message = logLine.replace(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})\s*\[.*?\]\s*/, "");

        const tdTime = document.createElement('td');
        tdTime.textContent = timestamp;
        const tdMsg = document.createElement('td');
        tdMsg.textContent = message;

        tr.appendChild(tdTime);
        tr.appendChild(tdMsg);
        njsLogsTableBody.appendChild(tr);
      });
  } else {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 2;
    td.style.textAlign = 'center';
    td.style.color = 'var(--secondary-color)';
    td.textContent = 'No logs available.';
    tr.appendChild(td);
    njsLogsTableBody.appendChild(tr);
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

fetchStats();
