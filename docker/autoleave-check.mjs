// Exit 0 when a WebSocket disconnect publishes a compact auto-leave
// ({"m":"p","t":"l","u":"<uid>",...}) to the lobby channel; exit 1 otherwise.
// A WebSocket is used because nchan fires nchan_unsubscribe_request (-> presence_unsub)
// on WebSocket close. Presence retention is 0, so the reader must be subscribed
// live before the probe disconnects; it is not replayed afterwards.
const base = "ws://localhost/subscribe/presence/lobby";

const seen = [];
const reader = new WebSocket(`${base}?uid=autoprobe-reader`);
reader.onmessage = (e) => seen.push(String(e.data));
reader.onerror = () => process.exit(1);

reader.onopen = () => {
  const probe = new WebSocket(`${base}?uid=autoprobe`);
  probe.onerror = () => process.exit(1);
  probe.onopen = () => setTimeout(() => probe.close(), 500);
  probe.onclose = () => {
    setTimeout(() => {
      reader.close();
      const hit = seen.some((m) => m.includes('{"m":"p","t":"l","u":"autoprobe"'));
      process.exit(hit ? 0 : 1);
    }, 2000);
  };
};
