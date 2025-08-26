# Deployment Guide

This directory contains Docker Compose deployments for various hardware configurations. Due to the specialized nature of hardware monitoring, some Docker images need to be built locally while others can be pulled from public registries.

## Image Status and Requirements

### ✅ Publicly Available Images (Can be pulled directly)
- `nvcr.io/nvidia/k8s/dcgm-exporter:3.3.5-3.4.0-ubuntu22.04` - Official NVIDIA DCGM exporter
- `prom/node-exporter:latest` - Official Prometheus Node Exporter
- `andrewgolikov55/intel-gpu-exporter:latest` - Community Intel GPU exporter

### 🔨 Local Build Required (Build from source)
- Intel NPU monitoring containers (intel-npu-top, intel-npu-prometheus-exporter)
- macOS monitoring containers (macmon-prometheus-exporter)

*Note: These images are not available in public registries and must be built locally using the provided Dockerfiles.*

## Quick Start

### Option 1: Use Updated Deployments (Recommended)
The updated deployment files use publicly available images where possible and local builds for custom components:

```bash
# For Intel systems with GPU + NPU
cd deployments/intel-full
docker-compose -f docker-compose-updated.yml up -d

# For NVIDIA systems  
cd deployments/nvidia
docker-compose -f docker-compose-updated.yml up -d

# For macOS systems
cd deployments/macos
docker-compose -f docker-compose-updated.yml up -d
```

### Option 2: Build All Images Locally
If you prefer to build all custom images locally:

```bash
# Build Intel NPU monitoring
cd deployments/build/intel-npu-top
docker build -t local/intel-npu-top .

cd ../intel-npu-prometheus-exporter  
docker build -t local/intel-npu-prometheus-exporter .

cd ../macmon-prometheus-exporter
docker build -t local/macmon-prometheus-exporter .

# Then use the appropriate deployment
cd ../../intel-full
docker-compose -f docker-compose-updated.yml up -d
```

## Deployment Descriptions

### intel-full/ 
Complete Intel monitoring with GPU and NPU support
- **Public Images**: andrewgolikov55/intel-gpu-exporter, prom/node-exporter  
- **Local Builds**: intel-npu-top, intel-npu-prometheus-exporter
- **Ports**: 9100 (node), 9102 (gpu), 9103 (npu-top), 9104 (npu-exporter)

### nvidia/
NVIDIA GPU monitoring using official DCGM exporter
- **Public Images**: nvcr.io/nvidia/k8s/dcgm-exporter, prom/node-exporter
- **Local Builds**: None
- **Ports**: 9100 (node), 9400 (nvidia)

### macos/
macOS system monitoring (placeholder implementation)
- **Public Images**: prom/node-exporter
- **Local Builds**: macmon-prometheus-exporter
- **Ports**: 9100 (node), 9105 (macos)
- **Note**: Limited hardware access in Docker on macOS

### intel-gpu/
Intel GPU only monitoring
- **Public Images**: andrewgolikov55/intel-gpu-exporter, prom/node-exporter
- **Local Builds**: None  
- **Ports**: 9100 (node), 9102 (gpu)

### intel-npu/
Intel NPU only monitoring
- **Public Images**: prom/node-exporter
- **Local Builds**: intel-npu-top, intel-npu-prometheus-exporter
- **Ports**: 9100 (node), 9103 (npu-top), 9104 (npu-exporter)

### mixed-intel-nvidia/
Combined Intel and NVIDIA monitoring
- **Public Images**: nvcr.io/nvidia/k8s/dcgm-exporter, prom/node-exporter
- **Local Builds**: intel-npu-top, intel-npu-prometheus-exporter  
- **Ports**: 9100 (node), 9102 (gpu), 9103 (npu-top), 9104 (npu-exporter), 9400 (nvidia)

## Troubleshooting

### Image Pull Errors
If you get errors like "manifest unknown" or "repository does not exist":
1. Use the updated deployment files (`docker-compose-updated.yml`) 
2. Build local images as needed using the provided Dockerfiles
3. Check that Docker is running and you have internet access

### Build Errors
If local builds fail:
1. Ensure Docker BuildKit is enabled: `export DOCKER_BUILDKIT=1`
2. Check that you're in the correct directory with Dockerfile present
3. Verify all required files (Python scripts, shell scripts) are present

### Permission Errors
Some containers require privileged access or specific volume mounts:
- Intel GPU monitoring needs `/dev/dri` access
- NPU monitoring needs `/sys` and `/proc` access  
- NVIDIA monitoring needs `nvidia` runtime

## Legacy Deployments

The original `docker-compose.yml` files reference images that may not be publicly available. These are preserved for reference but may not work without:
1. Building the images locally
2. Publishing them to a registry
3. Using alternative image sources

## Next Steps

1. Choose the appropriate deployment for your hardware
2. Use the updated Docker Compose files for best compatibility
3. Configure the Scrypted Telemetry plugin to point to your exporter endpoints
4. Access metrics at the documented ports
5. Import the provided Grafana dashboard for visualization

For more information, see the main README.md in the repository root.