// Exit 0 when a WebSocket disconnect publishes a compact auto-leave
// ({"m":"p","t":"l","u":"<uid>",...}) to the lobby channel; exit 1 otherwise.
// A WebSocket is used because nchan fires nchan_unsubscribe_request (-> presence_unsub)
// on WebSocket close; a long-poll GET returns only the oldest buffered message.
const base = "ws://localhost/subscribe/presence/lobby";

const probe = new WebSocket(`${base}?uid=autoprobe`);
probe.onerror = () => process.exit(1);
probe.onopen = () => setTimeout(() => probe.close(), 500);
probe.onclose = () => {
  const reader = new WebSocket(`${base}?uid=autoprobe-reader`);
  const seen = [];
  reader.onmessage = (e) => seen.push(String(e.data));
  setTimeout(() => {
    reader.close();
    const hit = seen.some((m) => m.includes('{"m":"p","t":"l","u":"autoprobe"'));
    process.exit(hit ? 0 : 1);
  }, 2000);
};
