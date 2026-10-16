import { API_BASE } from './utils.js'

export function logUsage(key) {
  // Local development never records usage counts, and does so silently: a log
  // line here would be noise on every page load.
  if (["localhost", "127.0.0.1"].includes(globalThis.location?.hostname)) return

  // Absolute URL: the client is served from several origins (workers.dev,
  // vercel), but the counters live in this deployment's Upstash sorted sets.
  const url = `${API_BASE}/api/usage/${key}`

  fetch(url, { method: "PUT", mode: "cors" })
    .then((r) => { if (!r.ok) console.error("HTTP error:", r.status, r.statusText) })
    .catch((e) => console.error("Fetch error for", url, e))
}
