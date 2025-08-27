#!/usr/bin/env python3
"""
Scrypted Telemetry Dashboard Generator - Complete Implementation
This actually discovers metrics and builds a working Grafana dashboard
tteck would be proud - it just works
"""

import json
import requests
import sys
import os
from typing import Dict, List, Set, Optional, Tuple
from dataclasses import dataclass, field
from collections import defaultdict
import re

@dataclass
class NodeInfo:
    """Information about a discovered node"""
    hostname: str
    ip: str
    port: str
    metrics: Set[str] = field(default_factory=set)
    hardware: Dict[str, bool] = field(default_factory=dict)

class ScryptedDashboardGenerator:
    def __init__(self, prometheus_url: str = "http://localhost:9090"):
        self.prometheus_url = prometheus_url
        self.nodes: Dict[str, NodeInfo] = {}
        self.all_metrics: Set[str] = set()
        self.panel_id = 1
        self.current_y = 0
        
        # Panel templates for different metric types
        self.panel_templates = {
            "cpu": self._cpu_panel_template,
            "gpu": self._gpu_panel_template,
            "memory": self._memory_panel_template,
            "disk": self._disk_panel_template,
            "network": self._network_panel_template,
            "temperature": self._temperature_panel_template,
            "power": self._power_panel_template,
            "process": self._process_panel_template
        }
        
    def discover_all(self) -> Dict:
        """Main discovery function - finds everything available"""
        print("🔍 Starting comprehensive discovery...")
        
        # Step 1: Get all metrics
        self._discover_metrics()
        
        # Step 2: Identify nodes
        self._identify_nodes()
        
        # Step 3: Detect hardware per node
        self._detect_hardware()
        
        # Step 4: Build dashboard
        dashboard = self._build_smart_dashboard()
        
        return dashboard
    
    def _discover_metrics(self):
        """Discover all available metrics from Prometheus"""
        try:
            response = requests.get(f"{self.prometheus_url}/api/v1/label/__name__/values")
            if response.status_code == 200:
                self.all_metrics = set(response.json().get("data", []))
                print(f"  ✓ Found {len(self.all_metrics)} total metrics")
        except Exception as e:
            print(f"  ✗ Failed to discover metrics: {e}")
            
    def _identify_nodes(self):
        """Identify all nodes/instances from metrics"""
        # Query for instances
        try:
            response = requests.get(f"{self.prometheus_url}/api/v1/label/instance/values")
            if response.status_code == 200:
                instances = response.json().get("data", [])
                
                for instance in instances:
                    # Parse instance (e.g., "192.168.68.173:9100")
                    if ":" in instance:
                        ip, port = instance.rsplit(":", 1)
                        hostname = self._get_hostname_for_ip(ip) or ip
                        
                        node = NodeInfo(hostname=hostname, ip=ip, port=port)
                        self.nodes[instance] = node
                        
                print(f"  ✓ Identified {len(self.nodes)} nodes")
                for instance, node in self.nodes.items():
                    print(f"    • {node.hostname} ({node.ip}:{node.port})")
        except Exception as e:
            print(f"  ✗ Failed to identify nodes: {e}")
            
    def _get_hostname_for_ip(self, ip: str) -> Optional[str]:
        """Try to get hostname for an IP from metrics"""
        # Check if we have a hostname in metrics
        for metric in ["node_uname_info", "host"]:
            if metric in self.all_metrics:
                result = self._query_metric(f'{metric}{{instance=~".*{ip}.*"}}')
                if result:
                    for item in result:
                        labels = item.get("metric", {})
                        if "nodename" in labels:
                            return labels["nodename"]
                        if "host" in labels:
                            return labels["host"]
        return None
        
    def _detect_hardware(self):
        """Detect hardware capabilities for each node"""
        for instance, node in self.nodes.items():
            print(f"\n  Detecting hardware for {node.hostname}...")
            
            # Find metrics for this instance
            instance_metrics = set()
            for metric in self.all_metrics:
                result = self._query_metric(f'{metric}{{instance="{instance}"}}')
                if result:
                    instance_metrics.add(metric)
                    
            node.metrics = instance_metrics
            
            # Detect hardware based on metrics
            node.hardware = {
                "nvidia_gpu": any(m.startswith(("nvidia_", "DCGM_")) for m in instance_metrics),
                "intel_gpu": any("intel_gpu" in m or "igpu_" in m for m in instance_metrics),
                "intel_npu": "intel_npu_usage_percent" in instance_metrics,
                "mac": any(m.startswith("mac_") for m in instance_metrics),
                "node_exporter": any(m.startswith("node_") for m in instance_metrics),
                "telegraf": any(m.startswith(("cpu_", "disk_", "mem_")) for m in instance_metrics),
                "has_temp": any("temp" in m for m in instance_metrics),
                "has_power": any("power" in m or "watts" in m for m in instance_metrics),
                "has_process": any("process" in m for m in instance_metrics)
            }
            
            # Print detected hardware
            for hw, present in node.hardware.items():
                if present:
                    print(f"    ✓ {hw.replace('_', ' ').title()}")
                    
    def _query_metric(self, query: str) -> Optional[List]:
        """Execute a Prometheus query and return results"""
        try:
            response = requests.get(
                f"{self.prometheus_url}/api/v1/query",
                params={"query": query}
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "success":
                    return data.get("data", {}).get("result", [])
        except:
            pass
        return None
        
    def _build_smart_dashboard(self) -> Dict:
        """Build dashboard based on discovered capabilities"""
        print("\n🏗️  Building intelligent dashboard...")
        
        dashboard = {
            "annotations": {"list": [{"builtIn": 1, "datasource": {"type": "grafana", "uid": "-- Grafana --"}, 
                                      "enable": True, "hide": True, "iconColor": "rgba(0, 211, 255, 1)", 
                                      "name": "Annotations & Alerts", "type": "dashboard"}]},
            "description": "🛡️ Auto-Generated Scrypted Telemetry - Just Works™",
            "editable": True,
            "fiscalYearStartMonth": 0,
            "graphTooltip": 2,
            "links": [],
            "liveNow": True,
            "panels": [],
            "refresh": "5s",
            "schemaVersion": 41,
            "tags": ["scrypted", "auto-generated", "tteck-approved"],
            "templating": {"list": []},
            "time": {"from": "now-15m", "to": "now"},
            "timepicker": {},
            "timezone": "",
            "title": "🚀 SCRYPTED Telemetry (Auto-Generated)",
            "uid": "scrypted-auto",
            "version": 1
        }
        
        # Add header row
        self._add_row(dashboard, "🎯 System Overview")
        
        # Build panels based on what we found
        self._add_overview_panels(dashboard)
        
        # GPU/Accelerator section if any exist
        if self._has_any_gpu():
            self._add_row(dashboard, "🚀 GPU & Accelerators")
            self._add_gpu_panels(dashboard)
            
        # CPU & Memory
        self._add_row(dashboard, "💻 CPU & Memory")
        self._add_cpu_memory_panels(dashboard)
        
        # Disk I/O if available
        if self._has_disk_metrics():
            self._add_row(dashboard, "💾 Storage")
            self._add_disk_panels(dashboard)
            
        # Network if available  
        if self._has_network_metrics():
            self._add_row(dashboard, "🌐 Network")
            self._add_network_panels(dashboard)
            
        # Process monitoring if available
        if self._has_process_metrics():
            self._add_row(dashboard, "📊 Processes")
            self._add_process_panels(dashboard)
            
        print(f"  ✓ Added {len(dashboard['panels'])} panels")
        return dashboard
        
    def _add_row(self, dashboard: Dict, title: str):
        """Add a row separator to dashboard"""
        dashboard["panels"].append({
            "collapsed": False,
            "gridPos": {"h": 1, "w": 24, "x": 0, "y": self.current_y},
            "id": self.panel_id,
            "panels": [],
            "title": title,
            "type": "row"
        })
        self.panel_id += 1
        self.current_y += 1
        
    def _add_overview_panels(self, dashboard: Dict):
        """Add overview panels showing key metrics at a glance"""
        x_pos = 0
        panel_width = 6
        
        # Temperature gauges if available
        if self._has_temperature():
            temp_targets = self._build_temperature_targets()
            if temp_targets:
                dashboard["panels"].append(self._temperature_panel_template(
                    "🌡️ Temperatures",
                    temp_targets,
                    {"h": 5, "w": panel_width, "x": x_pos, "y": self.current_y}
                ))
                x_pos += panel_width
                
        # Power gauges if available (Mac power, etc)
        if self._has_power():
            power_targets = self._build_power_targets()
            if power_targets:
                dashboard["panels"].append(self._power_panel_template(
                    "⚡ Power Usage",
                    power_targets,
                    {"h": 5, "w": panel_width, "x": x_pos, "y": self.current_y}
                ))
                x_pos += panel_width
                
        # NPU gauge if available
        if self._has_npu():
            npu_targets = [{"expr": "intel_npu_usage_percent", "legendFormat": "Intel NPU"}]
            dashboard["panels"].append({
                "id": self.panel_id,
                "title": "🧠 NPU Usage",
                "type": "bargauge",
                "datasource": {"type": "prometheus", "uid": "prometheus-uid"},
                "gridPos": {"h": 5, "w": panel_width, "x": x_pos, "y": self.current_y},
                "targets": npu_targets,
                "fieldConfig": {
                    "defaults": {
                        "unit": "percent",
                        "thresholds": {
                            "steps": [
                                {"color": "green", "value": 0},
                                {"color": "yellow", "value": 50},
                                {"color": "red", "value": 80}
                            ]
                        }
                    }
                }
            })
            self.panel_id += 1
            x_pos += panel_width
            
        if x_pos > 0:  # We added overview panels
            self.current_y += 6
            
    def _add_gpu_panels(self, dashboard: Dict):
        """Add GPU/accelerator monitoring panels"""
        targets = []
        
        # Build targets for all GPU types found
        for instance, node in self.nodes.items():
            # NVIDIA
            if node.hardware.get("nvidia_gpu"):
                if "DCGM_FI_DEV_GPU_UTIL" in node.metrics:
                    targets.append({
                        "expr": f'DCGM_FI_DEV_GPU_UTIL{{instance="{instance}"}}',
                        "legendFormat": f"{node.hostname} NVIDIA GPU"
                    })
                    
            # Intel GPU
            if node.hardware.get("intel_gpu"):
                # Complex Intel GPU query
                intel_metrics = [m for m in node.metrics if "igpu_engines" in m or "intel_gpu" in m]
                if intel_metrics:
                    expr = " or ".join([f'{m}{{instance="{instance}"}}' for m in intel_metrics[:4]])
                    targets.append({
                        "expr": f'max by (instance) ({expr})',
                        "legendFormat": f"{node.hostname} Intel GPU"
                    })
                    
            # Intel NPU
            if node.hardware.get("intel_npu"):
                targets.append({
                    "expr": f'intel_npu_usage_percent{{instance="{instance}"}}',
                    "legendFormat": f"{node.hostname} Intel NPU"
                })
                
            # Mac GPU/ANE
            if node.hardware.get("mac"):
                if "mac_gpu_usage_percent" in node.metrics:
                    targets.append({
                        "expr": f'mac_gpu_usage_percent{{instance="{instance}"}}',
                        "legendFormat": f"{node.hostname} Mac GPU"
                    })
                if "mac_ane_usage_percent" in node.metrics:
                    targets.append({
                        "expr": f'mac_ane_usage_percent{{instance="{instance}"}}',
                        "legendFormat": f"{node.hostname} Neural Engine"
                    })
                    
        if targets:
            dashboard["panels"].append(self._gpu_panel_template(
                "GPU & Accelerator Utilization",
                targets,
                {"h": 10, "w": 24, "x": 0, "y": self.current_y}
            ))
            self.current_y += 11
            
    def _add_cpu_memory_panels(self, dashboard: Dict):
        """Add CPU and memory panels"""
        # CPU panel
        cpu_targets = self._build_cpu_targets()
        if cpu_targets:
            dashboard["panels"].append(self._cpu_panel_template(
                "CPU Utilization",
                cpu_targets,
                {"h": 10, "w": 12, "x": 0, "y": self.current_y}
            ))
            
        # Memory panel
        mem_targets = self._build_memory_targets()
        if mem_targets:
            dashboard["panels"].append(self._memory_panel_template(
                "Memory Usage",
                mem_targets,
                {"h": 10, "w": 12, "x": 12, "y": self.current_y}
            ))
            
        self.current_y += 11
        
    def _add_disk_panels(self, dashboard: Dict):
        """Add disk I/O and usage panels"""
        # Disk I/O
        io_targets = self._build_disk_io_targets()
        if io_targets:
            dashboard["panels"].append(self._disk_panel_template(
                "💾 Disk I/O",
                io_targets,
                {"h": 10, "w": 12, "x": 0, "y": self.current_y}
            ))
            
        # Disk usage
        usage_targets = self._build_disk_usage_targets()
        if usage_targets:
            dashboard["panels"].append({
                "id": self.panel_id,
                "title": "📊 Disk Usage",
                "type": "bargauge",
                "datasource": {"type": "prometheus", "uid": "prometheus-uid"},
                "gridPos": {"h": 10, "w": 12, "x": 12, "y": self.current_y},
                "targets": usage_targets,
                "fieldConfig": {
                    "defaults": {
                        "unit": "percent",
                        "thresholds": {
                            "steps": [
                                {"color": "green", "value": 0},
                                {"color": "yellow", "value": 70},
                                {"color": "red", "value": 90}
                            ]
                        }
                    }
                },
                "options": {
                    "displayMode": "lcd",
                    "orientation": "horizontal"
                }
            })
            self.panel_id += 1
            
        self.current_y += 11
        
    def _add_network_panels(self, dashboard: Dict):
        """Add network monitoring panels"""
        net_targets = self._build_network_targets()
        if net_targets:
            dashboard["panels"].append(self._network_panel_template(
                "🌐 Network Traffic",
                net_targets,
                {"h": 10, "w": 24, "x": 0, "y": self.current_y}
            ))
            self.current_y += 11
            
    def _add_process_panels(self, dashboard: Dict):
        """Add process monitoring table"""
        process_targets = self._build_process_targets()
        if process_targets:
            dashboard["panels"].append(self._process_panel_template(
                "🔥 Top Processes",
                process_targets,
                {"h": 12, "w": 24, "x": 0, "y": self.current_y}
            ))
            self.current_y += 13
            
    # Helper methods to check capabilities
    def _has_any_gpu(self) -> bool:
        return any(
            node.hardware.get("nvidia_gpu") or 
            node.hardware.get("intel_gpu") or 
            node.hardware.get("intel_npu") or
            (node.hardware.get("mac") and "mac_gpu_usage_percent" in node.metrics)
            for node in self.nodes.values()
        )
        
    def _has_temperature(self) -> bool:
        return any(node.hardware.get("has_temp") for node in self.nodes.values())
        
    def _has_power(self) -> bool:
        return any(node.hardware.get("has_power") for node in self.nodes.values())
        
    def _has_npu(self) -> bool:
        return any(node.hardware.get("intel_npu") for node in self.nodes.values())
        
    def _has_disk_metrics(self) -> bool:
        return any("disk" in m for m in self.all_metrics)
        
    def _has_network_metrics(self) -> bool:
        return any("network" in m or "net_" in m for m in self.all_metrics)
        
    def _has_process_metrics(self) -> bool:
        return any(node.hardware.get("has_process") for node in self.nodes.values())
        
    # Target builders
    def _build_temperature_targets(self) -> List[Dict]:
        targets = []
        for instance, node in self.nodes.items():
            if "node_hwmon_temp_celsius" in node.metrics:
                targets.append({
                    "expr": f'node_hwmon_temp_celsius{{instance="{instance}",sensor="temp1"}}',
                    "legendFormat": f"{node.hostname} CPU"
                })
            if "mac_cpu_temperature_celsius" in node.metrics:
                targets.append({
                    "expr": f'mac_cpu_temperature_celsius{{instance="{instance}"}}',
                    "legendFormat": f"{node.hostname} Mac CPU"
                })
        return targets
        
    def _build_power_targets(self) -> List[Dict]:
        targets = []
        for instance, node in self.nodes.items():
            if "mac_cpu_power_watts" in node.metrics:
                targets.append({
                    "expr": f'mac_cpu_power_watts{{instance="{instance}"}}',
                    "legendFormat": f"{node.hostname} CPU Power"
                })
            if "mac_gpu_power_watts" in node.metrics:
                targets.append({
                    "expr": f'mac_gpu_power_watts{{instance="{instance}"}}',
                    "legendFormat": f"{node.hostname} GPU Power"
                })
            if "mac_ane_power_watts" in node.metrics:
                targets.append({
                    "expr": f'mac_ane_power_watts{{instance="{instance}"}}',
                    "legendFormat": f"{node.hostname} ANE Power"
                })
        return targets
        
    def _build_cpu_targets(self) -> List[Dict]:
        targets = []
        for instance, node in self.nodes.items():
            if "cpu_usage_idle" in node.metrics:
                targets.append({
                    "expr": f'100 - cpu_usage_idle{{cpu="cpu-total",instance="{instance}"}}',
                    "legendFormat": f"{node.hostname} CPU"
                })
            elif "node_cpu_seconds_total" in node.metrics:
                targets.append({
                    "expr": f'100 - (avg by(instance) (rate(node_cpu_seconds_total{{mode="idle",instance="{instance}"}}[5m])) * 100)',
                    "legendFormat": f"{node.hostname} CPU"
                })
            elif node.hardware.get("mac") and "mac_pcpu_usage_percent" in node.metrics:
                targets.append({
                    "expr": f'(mac_pcpu_usage_percent{{instance="{instance}"}} + mac_ecpu_usage_percent{{instance="{instance}"}}) / 2',
                    "legendFormat": f"{node.hostname} Mac CPU"
                })
        return targets
        
    def _build_memory_targets(self) -> List[Dict]:
        targets = []
        for instance, node in self.nodes.items():
            if "node_memory_MemAvailable_bytes" in node.metrics:
                targets.append({
                    "expr": f'(1 - (node_memory_MemAvailable_bytes{{instance="{instance}"}} / node_memory_MemTotal_bytes{{instance="{instance}"}})) * 100',
                    "legendFormat": f"{node.hostname} Memory"
                })
            elif "mem_used_percent" in node.metrics:
                targets.append({
                    "expr": f'mem_used_percent{{instance="{instance}"}}',
                    "legendFormat": f"{node.hostname} Memory"
                })
        return targets
        
    def _build_disk_io_targets(self) -> List[Dict]:
        targets = []
        for instance, node in self.nodes.items():
            if "diskio_read_bytes" in node.metrics:
                # Find available disks
                result = self._query_metric(f'diskio_read_bytes{{instance="{instance}"}}')
                if result:
                    for item in result:
                        disk_name = item.get("metric", {}).get("name", "")
                        if disk_name and not disk_name.startswith("loop"):
                            targets.append({
                                "expr": f'rate(diskio_read_bytes{{instance="{instance}",name="{disk_name}"}}[5m])',
                                "legendFormat": f"{node.hostname} {disk_name} Read"
                            })
                            targets.append({
                                "expr": f'rate(diskio_write_bytes{{instance="{instance}",name="{disk_name}"}}[5m])',
                                "legendFormat": f"{node.hostname} {disk_name} Write"
                            })
        return targets
        
    def _build_disk_usage_targets(self) -> List[Dict]:
        targets = []
        for instance, node in self.nodes.items():
            if "node_filesystem_size_bytes" in node.metrics:
                # Get main filesystems
                result = self._query_metric(f'node_filesystem_size_bytes{{instance="{instance}",fstype!="tmpfs"}}')
                if result:
                    for item in result:
                        mount = item.get("metric", {}).get("mountpoint", "")
                        if mount and mount in ["/", "/home", "/var", "/mnt"]:
                            targets.append({
                                "expr": f'(1 - node_filesystem_avail_bytes{{instance="{instance}",mountpoint="{mount}"}} / node_filesystem_size_bytes{{instance="{instance}",mountpoint="{mount}"}}) * 100',
                                "legendFormat": f"{node.hostname} {mount}"
                            })
        return targets[:6]  # Limit to 6 filesystems
        
    def _build_network_targets(self) -> List[Dict]:
        targets = []
        for instance, node in self.nodes.items():
            if "node_network_receive_bytes_total" in node.metrics:
                # Find main network interface
                result = self._query_metric(f'node_network_receive_bytes_total{{instance="{instance}"}}')
                if result:
                    for item in result:
                        device = item.get("metric", {}).get("device", "")
                        if device and not device.startswith(("lo", "docker", "veth")):
                            targets.append({
                                "expr": f'rate(node_network_receive_bytes_total{{instance="{instance}",device="{device}"}}[5m])',
                                "legendFormat": f"{node.hostname} {device} RX"
                            })
                            targets.append({
                                "expr": f'rate(node_network_transmit_bytes_total{{instance="{instance}",device="{device}"}}[5m])',
                                "legendFormat": f"{node.hostname} {device} TX"
                            })
                            break  # Only first interface per node
        return targets
        
    def _build_process_targets(self) -> List[Dict]:
        # Process metrics are usually table queries
        return [
            {"expr": "topk(10, top_process_cpu_percent)", "format": "table"},
            {"expr": "topk(10, top_process_memory_percent)", "format": "table"}
        ]
        
    # Panel templates
    def _cpu_panel_template(self, title: str, targets: List[Dict], gridPos: Dict) -> Dict:
        return {
            "id": self.panel_id,
            "title": title,
            "type": "timeseries",
            "datasource": {"type": "prometheus", "uid": "prometheus-uid"},
            "gridPos": gridPos,
            "targets": targets,
            "fieldConfig": {
                "defaults": {
                    "unit": "percent",
                    "custom": {
                        "drawStyle": "line",
                        "lineInterpolation": "smooth",
                        "fillOpacity": 30,
                        "gradientMode": "opacity"
                    },
                    "max": 100,
                    "min": 0
                }
            }
        }
        
    def _gpu_panel_template(self, title: str, targets: List[Dict], gridPos: Dict) -> Dict:
        panel = self._cpu_panel_template(title, targets, gridPos)
        panel["fieldConfig"]["defaults"]["custom"]["fillOpacity"] = 20
        return panel
        
    def _memory_panel_template(self, title: str, targets: List[Dict], gridPos: Dict) -> Dict:
        return self._cpu_panel_template(title, targets, gridPos)
        
    def _temperature_panel_template(self, title: str, targets: List[Dict], gridPos: Dict) -> Dict:
        self.panel_id += 1
        return {
            "id": self.panel_id - 1,
            "title": title,
            "type": "bargauge",
            "datasource": {"type": "prometheus", "uid": "prometheus-uid"},
            "gridPos": gridPos,
            "targets": targets,
            "fieldConfig": {
                "defaults": {
                    "unit": "celsius",
                    "thresholds": {
                        "steps": [
                            {"color": "green", "value": 0},
                            {"color": "yellow", "value": 60},
                            {"color": "orange", "value": 70},
                            {"color": "red", "value": 80}
                        ]
                    }
                }
            },
            "options": {
                "displayMode": "basic",
                "orientation": "horizontal"
            }
        }
        
    def _power_panel_template(self, title: str, targets: List[Dict], gridPos: Dict) -> Dict:
        self.panel_id += 1
        return {
            "id": self.panel_id - 1,
            "title": title,
            "type": "bargauge",
            "datasource": {"type": "prometheus", "uid": "prometheus-uid"},
            "gridPos": gridPos,
            "targets": targets,
            "fieldConfig": {
                "defaults": {
                    "unit": "watt",
                    "thresholds": {
                        "steps": [
                            {"color": "green", "value": 0},
                            {"color": "yellow", "value": 15},
                            {"color": "red", "value": 25}
                        ]
                    }
                }
            },
            "options": {
                "displayMode": "basic",
                "orientation": "horizontal"
            }
        }
        
    def _disk_panel_template(self, title: str, targets: List[Dict], gridPos: Dict) -> Dict:
        self.panel_id += 1
        return {
            "id": self.panel_id - 1,
            "title": title,
            "type": "timeseries",
            "datasource": {"type": "prometheus", "uid": "prometheus-uid"},
            "gridPos": gridPos,
            "targets": targets,
            "fieldConfig": {
                "defaults": {
                    "unit": "Bps",
                    "custom": {
                        "drawStyle": "line",
                        "lineInterpolation": "smooth",
                        "fillOpacity": 20,
                        "axisCenteredZero": True
                    }
                },
                "overrides": [
                    {
                        "matcher": {"id": "byRegexp", "options": "/.*Write.*/"},
                        "properties": [{"id": "custom.transform", "value": "negative-Y"}]
                    }
                ]
            }
        }
        
    def _network_panel_template(self, title: str, targets: List[Dict], gridPos: Dict) -> Dict:
        panel = self._disk_panel_template(title, targets, gridPos)
        panel["fieldConfig"]["overrides"] = [
            {
                "matcher": {"id": "byRegexp", "options": "/.*TX.*/"},
                "properties": [{"id": "custom.transform", "value": "negative-Y"}]
            }
        ]
        return panel
        
    def _process_panel_template(self, title: str, targets: List[Dict], gridPos: Dict) -> Dict:
        self.panel_id += 1
        return {
            "id": self.panel_id - 1,
            "title": title,
            "type": "table",
            "datasource": {"type": "prometheus", "uid": "prometheus-uid"},
            "gridPos": gridPos,
            "targets": targets,
            "transformations": [
                {
                    "id": "joinByField",
                    "options": {"byField": "full_command", "mode": "inner"}
                }
            ]
        }

def main():
    """Main entry point - tteck style"""
    import argparse
    
    print("""
╔══════════════════════════════════════════════════════╗
║     Scrypted Dashboard Generator - Auto Mode         ║
║           "It Just Works" - tteck approved           ║
╚══════════════════════════════════════════════════════╝
    """)
    
    parser = argparse.ArgumentParser(description='Generate Grafana dashboard from Prometheus metrics')
    parser.add_argument('--prometheus-url', default='http://localhost:9090',
                       help='Prometheus server URL')
    parser.add_argument('--output', default='/opt/scrypted-telemetry/grafana-provisioning/dashboards/auto.json',
                       help='Output dashboard file')
    parser.add_argument('--grafana-url', default='http://localhost:3000',
                       help='Grafana URL for auto-import')
    parser.add_argument('--grafana-api-key', help='Grafana API key for auto-import')
    args = parser.parse_args()
    
    # Check Prometheus is accessible
    try:
        response = requests.get(f"{args.prometheus_url}/api/v1/query", params={"query": "up"})
        if response.status_code != 200:
            print(f"❌ Prometheus not accessible at {args.prometheus_url}")
            print("   Make sure Prometheus is running and accessible")
            sys.exit(1)
    except Exception as e:
        print(f"❌ Cannot connect to Prometheus: {e}")
        sys.exit(1)
        
    # Generate dashboard
    generator = ScryptedDashboardGenerator(args.prometheus_url)
    dashboard = generator.discover_all()
    
    # Save dashboard
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, 'w') as f:
        json.dump(dashboard, f, indent=2)
    print(f"\n✅ Dashboard saved to {args.output}")
    
    # Auto-import to Grafana if API key provided
    if args.grafana_api_key:
        try:
            response = requests.post(
                f"{args.grafana_url}/api/dashboards/db",
                headers={
                    "Authorization": f"Bearer {args.grafana_api_key}",
                    "Content-Type": "application/json"
                },
                json={"dashboard": dashboard, "overwrite": True}
            )
            if response.status_code == 200:
                print(f"✅ Dashboard auto-imported to Grafana")
                print(f"   View at: {args.grafana_url}/d/scrypted-auto")
            else:
                print(f"⚠️  Could not auto-import: {response.text}")
        except Exception as e:
            print(f"⚠️  Auto-import failed: {e}")
    else:
        print(f"\n📋 To import manually:")
        print(f"   1. Open Grafana: {args.grafana_url}")
        print(f"   2. Go to Dashboards → Import")
        print(f"   3. Upload {args.output}")
        
    print("\n🎉 tteck would be proud - it just works!")
    
if __name__ == "__main__":
    main()