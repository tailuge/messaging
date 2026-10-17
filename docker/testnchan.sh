#!/bin/bash
# Nchan integration test script
set -uo pipefail

PROD_BASE_URL="https://billiards-network.onrender.com"
BASE_URL="http://localhost:80"
PRODUCTION=false

SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
DOCKER_NCHAN="$(realpath "$SCRIPT_DIR/../scripts/docker-nchan.sh")"

usage() {
	echo "Usage: $0 [-p]"
	echo "  -p: Production mode (skip Docker, use $PROD_BASE_URL)"
	exit 1
}

while getopts "p" opt; do
	case "$opt" in
	p) PRODUCTION=true ;;
	*) usage ;;
	esac
done

if [[ "$PRODUCTION" == "true" ]]; then
	BASE_URL="$PROD_BASE_URL"
fi

total=0
failed=0

run_test() {
	local name="$1"
	shift
	total=$((total + 1))
	if "$@"; then
		echo "PASS: $name"
	else
		echo "FAIL: $name"
		failed=$((failed + 1))
	fi
}

cleanup() {
	if [[ "$PRODUCTION" == "false" ]]; then
		"$DOCKER_NCHAN" stop >/dev/null 2>&1 || true
	fi
}

trap cleanup EXIT

if [[ "$PRODUCTION" == "false" ]]; then
	echo "--- Starting Nchan ---"
	"$DOCKER_NCHAN" start
fi

echo ""
echo "--- Testing: $BASE_URL ---"
echo ""

run_test "Health Check" curl -fsS --max-time 5 "$BASE_URL/basic_status"
run_test "Stats" curl -fsS --max-time 5 "$BASE_URL/nchan_stats"
run_test "Index" curl -fsS --max-time 5 "$BASE_URL/index.html"

run_test "Publish to Lobby" bash -c '
	curl -sS -i --max-time 5 -X POST -H "Origin: http://localhost" -d "{\"event\": \"test\"}" "http://localhost/publish/lobby/testchannel" | grep -q "X-Server-Time:"
'

run_test "Pub/Sub Demo" bash -c '
	curl -fsS --max-time 8 "http://localhost/subscribe/lobby/demo" >/tmp/nchan-sub.out &
	SUB_PID=$!
	sleep 1
	curl -fsS --max-time 5 -X POST -d "Hello from test" "http://localhost/publish/lobby/demo" >/dev/null
	wait $SUB_PID
	grep -q "Hello from test" /tmp/nchan-sub.out
'

run_test "WebSocket Handshake" bash -c '
	curl -sS -i -N --http1.1 --max-time 5 \
		-H "Connection: Upgrade" -H "Upgrade: websocket" -H "Host: localhost" \
		-H "Origin: http://localhost" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
		-H "Sec-WebSocket-Version: 13" "http://localhost/subscribe/lobby/handshake" | grep -qm1 "HTTP/1.1 101"
'

run_test "Publish to Presence" curl -fsS --max-time 5 -X POST \
	-d '{"userId":"user1","userName":"Alice","type":"join"}' "http://localhost/publish/presence/lobby"

run_test "Presence Pub/Sub" bash -c '
	curl -fsS --max-time 5 -X POST -d "{\"userId\":\"user1\",\"userName\":\"Alice\",\"type\":\"join\"}" "http://localhost/publish/presence/lobby" >/dev/null
	curl -fsS --max-time 5 "http://localhost/subscribe/presence/lobby" | grep -q "userId"
'

run_test "Publish to Table" curl -fsS --max-time 5 -X POST \
	-d '{"type": "accept", "tableId": "testtable", "userId": "player1", "userName": "Alice"}' "http://localhost/publish/table/testtable"

run_test "Table Pub/Sub" bash -c '
	curl -fsS --max-time 5 -X POST -d "{\"type\": \"accept\", \"tableId\": \"tabletest\", \"userId\": \"player1\", \"userName\": \"Alice\"}" "http://localhost/publish/table/tabletest" >/dev/null
	curl -fsS --max-time 5 "http://localhost/subscribe/table/tabletest" | grep -q "tableId"
'

run_test "Publish response: 2xx, empty body, CORS header" bash -c '
	tmp=$(mktemp)
	resp=$(curl -sS --max-time 5 -D - -o "$tmp" -w "%{http_code}" -X POST -H "Origin: http://localhost" -H "User-Agent: test-agent" -d "{\"messageType\":\"presence\",\"type\":\"leave\",\"userId\":\"probe\"}" "http://localhost/publish/presence/lobby")
	status=$(printf "%s\n" "$resp" | tail -n 1)
	bytes=$(wc -c < "$tmp" | tr -d "[:space:]")
	rm -f "$tmp"
	echo "status=$status body_bytes=$bytes"
	case "$status" in 2??) ;; *) echo "expected 2xx status"; exit 1 ;; esac
	[ "$bytes" = "0" ] || { echo "publish response body not empty ($bytes bytes)"; exit 1; }
	printf "%s\n" "$resp" | grep -qi "^access-control-allow-origin:"
'

run_test "Counters: compact presence leave increments presence_leave_total" bash -c '
	count() { curl -fsS --max-time 5 "http://localhost/api/stats" | grep -o "\"presence_leave_total\":[0-9]*" | cut -d: -f2; }
	before=$(count)
	curl -fsS --max-time 5 -X POST -d "{\"m\":\"p\",\"t\":\"l\",\"u\":\"probe\"}" "http://localhost/publish/presence/lobby" >/dev/null
	after=$(count)
	echo "presence_leave_total before=$before after=$after"
	[ -n "$before" ] && [ -n "$after" ] && [ "$after" -gt "$before" ]
'

# Server-generated leave on unsubscribe must use the compact form too.
# Uses a WebSocket: nchan fires nchan_unsubscribe_request (-> presence_unsub) on WebSocket close, not on long-poll drop.
run_test "Auto-leave on disconnect is compact" node "$SCRIPT_DIR/autoleave-check.mjs"

run_test "Meta: Subscribe receives meta in published message" bash -c '
	curl -fsS --max-time 5 "http://localhost/subscribe/presence/lobby" >/tmp/nchan-meta-sub.out &
	SUB_PID=$!
	sleep 1
	curl -fsS --max-time 5 -X POST -d "{\"messageType\":\"presence\",\"type\":\"join\",\"userId\":\"meta-probe\",\"userName\":\"Meta\"}" "http://localhost/publish/presence/lobby" >/dev/null
	wait $SUB_PID
	grep -q "\"meta\":" /tmp/nchan-meta-sub.out
'

# Compact wire form (payload.md P1): server meta uses short keys, so ts is "t" inside meta.
run_test "Meta: Subscribe receives compact ts in published message" bash -c '
	curl -fsS --max-time 5 "http://localhost/subscribe/presence/lobby" >/tmp/nchan-meta-ts.out &
	SUB_PID=$!
	sleep 1
	curl -fsS --max-time 5 -X POST -d "{\"messageType\":\"presence\",\"type\":\"join\",\"userId\":\"meta-probe\",\"userName\":\"Meta\"}" "http://localhost/publish/presence/lobby" >/dev/null
	wait $SUB_PID
	grep -q "\"meta\":{\"t\":" /tmp/nchan-meta-ts.out
'

run_test "API: Stats endpoint returns JSON" bash -c '
	curl -fsS --max-time 5 "http://localhost/api/stats" | grep -q "\"nginx\":"
'

run_test "API: Stats endpoint contains nchan data" bash -c '
	curl -fsS --max-time 5 "http://localhost/api/stats" | grep -q "\"nchan\":"
'

run_test "API: Stats endpoint contains ip_cache" bash -c '
	curl -fsS --max-time 5 "http://localhost/api/stats" | grep -q "\"ip_cache\":"
'

run_test "API: Stats endpoint contains system_stats" bash -c '
	curl -fsS --max-time 5 "http://localhost/api/stats" | grep -q "\"system_stats\":"
'

run_test "API: Stats endpoint contains access_logs" bash -c '
	curl -fsS --max-time 5 "http://localhost/api/stats" | grep -q "\"access_logs\":"
'

run_test "API: Stats endpoint contains error_logs" bash -c '
	curl -fsS --max-time 5 "http://localhost/api/stats" | grep -q "\"error_logs\":"
'

# CORS Tests
run_test "CORS: Health check contains Allow-Origin" bash -c '
	curl -sS -i --max-time 5 "http://localhost/health" | grep -qi "access-control-allow-origin: \*"
'

run_test "CORS: Publisher OPTIONS contains Allow-Origin" bash -c '
	curl -sS -i --max-time 5 -X OPTIONS -H "Origin: http://test.com" -H "Access-Control-Request-Method: POST" "http://localhost/publish/lobby/test" | grep -qi "access-control-allow-origin: \*"
'

run_test "CORS: Publisher POST contains Allow-Origin" bash -c '
	curl -sS -i --max-time 5 -X POST -H "Origin: http://test.com" -d "{}" "http://localhost/publish/lobby/test" | grep -qi "access-control-allow-origin: \*"
'

run_test "CORS: Subscriber GET contains Allow-Origin" bash -c '
	# Publish a message first so GET returns immediately
	curl -sS --max-time 5 -X POST -d "ping" "http://localhost/publish/lobby/cors-test" >/dev/null
	curl -sS -I --max-time 5 -H "Origin: http://test.com" "http://localhost/subscribe/lobby/cors-test" | grep -qi "access-control-allow-origin: \*"
'

run_test "CORS: Subscriber OPTIONS contains Allow-Origin" bash -c '
	curl -sS -i --max-time 5 -X OPTIONS -H "Origin: http://test.com" -H "Access-Control-Request-Method: GET" "http://localhost/subscribe/lobby/test" | grep -qi "access-control-allow-origin: \*"
'

run_test "CORS: Stats endpoint contains Allow-Origin" bash -c '
	curl -sS -I --max-time 5 "http://localhost/api/stats" | grep -qi "access-control-allow-origin: \*"
'

echo ""
echo "--- Result: $((total - failed))/$total passed ---"
[[ $failed -eq 0 ]]
