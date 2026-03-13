#!/bin/bash
# Docker management script for nchan

set -euo pipefail

CONTAINER_NAME="nchan-test-client"
DOCKER_IMAGE="tailuge/billiards-network"
PORT=80
NCHAN_DIR="$(dirname "$0")/../docker"
PROJECT_ROOT="$(dirname "$0")/.."

start() {
    echo "Building example client..."
    (cd "$PROJECT_ROOT" && npm run build:example)

    echo "Building nchan image..."
    docker build -t "$DOCKER_IMAGE:latest" -t "$DOCKER_IMAGE:3.0.0" "$NCHAN_DIR"

    echo "Starting nchan container..."
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker run -d --user root -p "$PORT":8080 --name "$CONTAINER_NAME" "$DOCKER_IMAGE"

    echo "Waiting for nchan to be ready..."
    local attempt=1
    local max_attempts=30
    while [[ $attempt -le $max_attempts ]]; do
        if curl -fsS --max-time 2 "http://localhost:$PORT/basic_status" >/dev/null 2>&1; then
            echo "Nchan is ready!"
            return 0
        fi
        sleep 1
        attempt=$((attempt + 1))
    done

    echo "Failed to start nchan"
    docker logs "$CONTAINER_NAME"
    exit 1
}

stop() {
    echo "Stopping nchan container..."
    docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
    echo "Nchan stopped"
}

status() {
    if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
        echo "Nchan is running"
        return 0
    else
        echo "Nchan is not running"
        return 1
    fi
}

build() {
    echo "Building example client..."
    (cd "$PROJECT_ROOT" && npm run build:example)

    echo "Syncing example to docker/html..."
    rm -rf "$NCHAN_DIR/html/example"
    cp -r "$PROJECT_ROOT/example" "$NCHAN_DIR/html/example"

    echo "Building nchan image..."
    docker build -t "$DOCKER_IMAGE:latest" -t "$DOCKER_IMAGE:3.0.0" "$NCHAN_DIR"
    echo "Build complete."
}

logs() {
    # Note: In this container, nginx access.log and error.log are symlinked to 
    # stdout/stderr, so we use docker logs to get both combined.
    docker logs --tail 100 "$CONTAINER_NAME" 2>&1
}

case "${1:-start}" in
    start) start ;;
    stop) stop ;;
    build) build ;;
    restart) stop && start ;;
    status) status ;;
    logs) logs ;;
    *) echo "Usage: $0 {start|stop|build|restart|status|logs}" && exit 1 ;;
esac
