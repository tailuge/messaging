#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL_FILE="$SCRIPT_DIR/trigger_hook.url"

if [ -f "$URL_FILE" ]; then
    HOOK_URL=$(cat "$URL_FILE")
    echo "sleeping"
    sleep 5
    curl -s "$HOOK_URL"
    echo "done"
fi
