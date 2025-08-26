#!/bin/bash

echo "🔍 Detecting hardware configuration..."
echo "======================================"

DETECTED_INTEL_GPU=false
DETECTED_INTEL_NPU=false  
DETECTED_NVIDIA=false
DETECTED_APPLE=false

# Check for Intel GPU (look for DRI devices)
if [ -d "/dev/dri" ] && [ "$(ls -A /dev/dri 2>/dev/null)" ]; then
    echo "✅ Intel GPU detected (/dev/dri found)"
    DETECTED_INTEL_GPU=true
else
    echo "❌ Intel GPU not detected"
fi

# Check for Intel NPU (multiple possible paths)
NPU_PATHS=(
    "/sys/devices/pci0000:00/0000:00:0b.0/accel/accel0/npu_busy_time_us"
    "/sys/class/accel/accel0/npu_busy_time_us"
    "/sys/devices/platform/intel_vpu/accel/accel0/npu_busy_time_us"
)

for path in "${NPU_PATHS[@]}"; do
    if [ -f "$path" ]; then
        echo "✅ Intel NPU detected ($path)"
        DETECTED_INTEL_NPU=true
        break
    fi
done

if [ "$DETECTED_INTEL_NPU" = false ]; then
    echo "❌ Intel NPU not detected"
fi

# Check for NVIDIA GPU
if command -v nvidia-smi &> /dev/null; then
    if nvidia-smi &> /dev/null; then
        echo "✅ NVIDIA GPU detected (nvidia-smi available)"
        DETECTED_NVIDIA=true
    else
        echo "⚠️  nvidia-smi found but not working (driver issue?)"
    fi
else
    echo "❌ NVIDIA GPU not detected"
fi

# Check for macOS/Apple Silicon
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "✅ macOS detected"
    DETECTED_APPLE=true
    
    # Check for Apple Silicon specifically
    if [[ $(uname -m) == "arm64" ]]; then
        echo "✅ Apple Silicon detected (ARM64)"
    else
        echo "ℹ️  Intel Mac detected (x86_64)"
    fi
    
    # Check if macmon is available
    if command -v macmon &> /dev/null; then
        echo "✅ macmon tool available"
    else
        echo "⚠️  macmon not found (install with: brew install macmon)"
    fi
else
    echo "❌ Not running on macOS"
fi

echo ""
echo "📋 Deployment Recommendations:"
echo "=============================="

# Recommend deployment based on detected hardware
if [ "$DETECTED_INTEL_GPU" = true ] && [ "$DETECTED_INTEL_NPU" = true ] && [ "$DETECTED_NVIDIA" = true ]; then
    echo "🎯 Recommended: deployments/mixed-intel-nvidia/"
    echo "   You have Intel GPU + NPU + NVIDIA GPU"
elif [ "$DETECTED_INTEL_GPU" = true ] && [ "$DETECTED_INTEL_NPU" = true ]; then
    echo "🎯 Recommended: deployments/intel-full/"
    echo "   You have Intel GPU + NPU"
elif [ "$DETECTED_INTEL_GPU" = true ]; then
    echo "🎯 Recommended: deployments/intel-gpu/"
    echo "   You have Intel GPU only"
elif [ "$DETECTED_INTEL_NPU" = true ]; then
    echo "🎯 Recommended: deployments/intel-npu/"
    echo "   You have Intel NPU only"
elif [ "$DETECTED_NVIDIA" = true ]; then
    echo "🎯 Recommended: deployments/nvidia/"
    echo "   You have NVIDIA GPU"
elif [ "$DETECTED_APPLE" = true ]; then
    echo "🎯 Recommended: deployments/macos/"
    echo "   macOS with potential Apple Neural Engine support"
else
    echo "🎯 Recommended: Basic plugin installation only"
    echo "   No specialized hardware detected, will use systeminformation"
fi

echo ""
echo "🚀 Next Steps:"
echo "=============="
echo "1. cd into the recommended deployment directory"
echo "2. Run: docker-compose up -d"  
echo "3. Install the Scrypted Telemetry plugin"
echo "4. Configure the exporter endpoints in plugin settings"
echo "5. Access metrics at: http://your-scrypted-ip/endpoint/telemetry/metrics"

# Exit with different codes based on what was detected
if [ "$DETECTED_INTEL_GPU" = true ] || [ "$DETECTED_INTEL_NPU" = true ] || [ "$DETECTED_NVIDIA" = true ] || [ "$DETECTED_APPLE" = true ]; then
    exit 0  # Hardware detected
else
    exit 1  # No specialized hardware
fi