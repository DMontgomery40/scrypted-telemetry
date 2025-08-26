#!/bin/bash

# Native macOS deployment script for macmon monitoring
# This script runs macmon natively instead of in Docker

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/macmon-exporter.log"
PID_FILE="$SCRIPT_DIR/macmon-exporter.pid"

# Configuration
EXPORTER_PORT=9105
MACMON_INTERVAL=1

echo "🚀 Starting native macmon Prometheus exporter for macOS..."

# Check if macmon is installed
if ! command -v macmon &> /dev/null; then
    echo "❌ macmon not found. Installing via Homebrew..."
    if ! command -v brew &> /dev/null; then
        echo "❌ Homebrew not found. Please install Homebrew first:"
        echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        exit 1
    fi
    brew install macmon
fi

# Check if Go is installed for the exporter
if ! command -v go &> /dev/null; then
    echo "❌ Go not found. Installing via Homebrew..."
    brew install go
fi

# Clone and build the exporter if needed
EXPORTER_DIR="$SCRIPT_DIR/macmon-prometheus-exporter"
if [ ! -d "$EXPORTER_DIR" ]; then
    echo "📦 Cloning macmon Prometheus exporter..."
    git clone https://github.com/dmontgomery40/macmon-prometheus-exporter.git "$EXPORTER_DIR"
fi

cd "$EXPORTER_DIR"

# Build the exporter
echo "🔨 Building macmon exporter..."
go build -o macmon-exporter .

# Stop existing instance if running
if [ -f "$PID_FILE" ]; then
    echo "🛑 Stopping existing macmon exporter..."
    if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        kill "$(cat "$PID_FILE")"
        sleep 2
    fi
    rm -f "$PID_FILE"
fi

# Start the exporter
echo "🌟 Starting macmon exporter on port $EXPORTER_PORT..."
nohup ./macmon-exporter \
    --port="$EXPORTER_PORT" \
    --interval="${MACMON_INTERVAL}s" \
    --macmon-args="pipe -s 1 --soc-info" \
    > "$LOG_FILE" 2>&1 &

EXPORTER_PID=$!
echo $EXPORTER_PID > "$PID_FILE"

# Wait a moment and check if it's running
sleep 2
if kill -0 "$EXPORTER_PID" 2>/dev/null; then
    echo "✅ macmon exporter started successfully!"
    echo "   PID: $EXPORTER_PID"
    echo "   Metrics: http://localhost:$EXPORTER_PORT/metrics"
    echo "   Logs: $LOG_FILE"
    echo "   To stop: kill $EXPORTER_PID"
else
    echo "❌ Failed to start macmon exporter"
    echo "Check logs: $LOG_FILE"
    exit 1
fi

# Test the endpoint
echo "🧪 Testing metrics endpoint..."
if curl -s "http://localhost:$EXPORTER_PORT/metrics" | head -5; then
    echo ""
    echo "✅ Metrics endpoint is responding!"
else
    echo "⚠️  Metrics endpoint not responding yet (may take a moment to initialize)"
fi

echo ""
echo "📊 Next steps:"
echo "1. Configure Scrypted Telemetry plugin with endpoint: http://localhost:$EXPORTER_PORT/metrics"
echo "2. Monitor logs: tail -f $LOG_FILE"
echo "3. To stop: ./stop-native.sh"