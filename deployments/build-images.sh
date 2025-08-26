#!/bin/bash
set -e

echo "🔨 Building custom Docker images for Scrypted Telemetry..."
echo "=================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running or not accessible"
    exit 1
fi

echo "📦 Building Intel NPU Top..."
cd "$BUILD_DIR/intel-npu-top"
docker build -t local/intel-npu-top:latest .

echo "📦 Building Intel NPU Prometheus Exporter..."
cd "$BUILD_DIR/intel-npu-prometheus-exporter"  
docker build -t local/intel-npu-prometheus-exporter:latest .

echo "📦 Building macOS Monitoring Exporter..."
cd "$BUILD_DIR/macmon-prometheus-exporter"
docker build -t local/macmon-prometheus-exporter:latest .

echo ""
echo "✅ All custom images built successfully!"
echo ""
echo "Built images:"
echo "- local/intel-npu-top:latest"
echo "- local/intel-npu-prometheus-exporter:latest"  
echo "- local/macmon-prometheus-exporter:latest"
echo ""
echo "🚀 You can now run docker-compose up -d in your chosen deployment directory"