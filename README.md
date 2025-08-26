# Scrypted Telemetry Plugin

Hardware monitoring plugin for Scrypted. Collects CPU, GPU, NPU, memory, disk, and network metrics from multiple sources and provides Prometheus-compatible endpoints.

## What it does

- Monitors Intel GPU, Intel NPU, NVIDIA GPU, Apple Silicon metrics  
- Collects system metrics (CPU temp/usage, memory, disk, network)
- Provides Prometheus endpoints for Grafana dashboards
- Works across multiple Scrypted nodes with cluster sharing

## Required exporters

Install these first, then configure the plugin:

**Intel systems:**
- `intel-gpu-tools` package
- `intel-gpu-top` tool
- Intel GPU exporter (from bjia56/btop-builder or similar)
- `dmontgomery40/intel-gpu-prometheus-exporter` container
- `dmontgomery40/intel-npu-top` container  
- `dmontgomery40/intel-npu-prometheus-exporter` container

**macOS:**
- `macmon` (brew install macmon)
- `dmontgomery40/macmon-prometheus-exporter`

**All systems:**
- Prometheus 
- Telegraf (optional, for enhanced system metrics)

## Installation

1. Install required exporters for your hardware
2. Install this plugin in Scrypted
3. Configure exporter endpoints in plugin settings
4. Access metrics at `/endpoint/telemetry/metrics` or standalone server port

## Screenshots

Grafana dashboard with multi-node monitoring:
![Grafana Dashboard](assets/Screenshot%202025-08-26%20at%2012.06.52%20AM.png)

Scrypted plugin configuration:
![Plugin Settings](assets/Screenshot%202025-08-26%20at%2012.13.17%20AM.png)

## Docker deployments

Pre-configured docker-compose files in `/deployments/` for different hardware combinations.

## Prometheus config example

```yaml
scrape_configs:
  - job_name: 'scrypted-telemetry'
    static_configs:
      - targets: ['scrypted-host:9090']
```

## Notes

This was fun to build but I can't scale it for everyone's setup. Take it, run with it, make it easier for users if you want.

Thanks to bjia56 for cosmotop inspiration and koush for Scrypted.