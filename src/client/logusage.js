export function logUsage(key) {
  if (["localhost", "127.0.0.1"].includes(globalThis.location?.hostname)) {
    console.log("Skipping usage fetch for localhost.")
    return
  }

  const url = `https://scoreboard-tailuge.vercel.app/api/usage/${key}`

  fetch(url, { method: "PUT", mode: "cors" })
    .then((r) => { if (!r.ok) console.error("HTTP error:", r.status, r.statusText) })
    .catch((e) => console.error("Fetch error for", url, e))
}
