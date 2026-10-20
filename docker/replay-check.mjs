// Exit 0 when a frame published before a WebSocket subscriber connects is NOT
// replayed from the channel buffer (presence retention is 0; the lobby gets
// initial state from GET /api/online/presence instead); exit 1 otherwise. A
// WebSocket is used because a long-poll GET would hide buffered messages.
const marker = `replay-${Date.now()}`;

const publish = await fetch("http://localhost/publish/presence/lobby", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ m: "p", t: "h", u: marker, n: "Replay Probe" }),
});
if (!publish.ok) process.exit(1);

const seen = [];
const reader = new WebSocket("ws://localhost/subscribe/presence/lobby?uid=replay-probe-reader");
reader.onmessage = (event) => seen.push(String(event.data));
reader.onerror = () => process.exit(1);

setTimeout(() => {
  reader.close();
  process.exit(seen.some((message) => message.includes(marker)) ? 1 : 0);
}, 2000);
