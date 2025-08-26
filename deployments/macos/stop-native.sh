#!/bin/bash

# Stop native macmon exporter

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/macmon-exporter.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "❌ No PID file found. Exporter may not be running."
    exit 1
fi

PID=$(cat "$PID_FILE")

if kill -0 "$PID" 2>/dev/null; then
    echo "🛑 Stopping macmon exporter (PID: $PID)..."
    kill "$PID"
    
    # Wait for it to stop
    for i in {1..10}; do
        if ! kill -0 "$PID" 2>/dev/null; then
            break
        fi
        sleep 1
    done
    
    if kill -0 "$PID" 2>/dev/null; then
        echo "⚠️  Process didn't stop gracefully, force killing..."
        kill -9 "$PID"
    fi
    
    rm -f "$PID_FILE"
    echo "✅ macmon exporter stopped successfully"
else
    echo "⚠️  Process not running, cleaning up PID file..."
    rm -f "$PID_FILE"
fi