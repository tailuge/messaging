// Exit 0 when a frame published before a WebSocket subscriber connects is
// replayed from the channel buffer; exit 1 otherwise. Phase 1 deliberately
// leaves presence retention alone, so this guards the registry work from
// accidentally removing replay. A WebSocket is used because a long-poll GET
// returns only the oldest buffered message.
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
  process.exit(seen.some((message) => message.includes(marker)) ? 0 : 1);
}, 2000);
