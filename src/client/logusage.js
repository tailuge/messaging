import { API_BASE } from './utils.js'

export function logUsage(key) {
  if (["localhost", "127.0.0.1"].includes(globalThis.location?.hostname)) {
    console.log("Skipping usage fetch for localhost.")
    return
  }

  // Absolute URL: the client is served from several origins (workers.dev,
  // vercel), but the counters live in this deployment's Upstash sorted sets.
  const url = `${API_BASE}/api/usage/${key}`

  fetch(url, { method: "PUT", mode: "cors" })
    .then((r) => { if (!r.ok) console.error("HTTP error:", r.status, r.statusText) })
    .catch((e) => console.error("Fetch error for", url, e))
}
