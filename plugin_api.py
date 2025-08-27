#!/usr/bin/env python3
"""
REST API wrapper for the Scrypted Dashboard Generator
This bridges the TypeScript plugin with the Python generator
tteck would make it a simple REST service
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import json
import sys
import os
import traceback
from datetime import datetime
from typing import Dict, Any, Optional

# Import the actual generator
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from tteck import ScryptedDashboardGenerator

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from Scrypted plugin

# Cache discovery results for performance
discovery_cache = {
    "timestamp": None,
    "results": None,
    "ttl": 300  # 5 minute cache
}

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "timestamp": datetime.now().isoformat()})

@app.route('/discover', methods=['POST'])
def discover():
    """Run discovery and return results"""
    try:
        data = request.json or {}
        prometheus_url = data.get('prometheus_url', 'http://localhost:9090')
        force_refresh = data.get('force_refresh', False)
        
        # Check cache unless forced refresh
        if not force_refresh and discovery_cache["results"]:
            if discovery_cache["timestamp"]:
                age = (datetime.now() - discovery_cache["timestamp"]).total_seconds()
                if age < discovery_cache["ttl"]:
                    return jsonify({
                        "status": "success",
                        "cached": True,
                        "age_seconds": age,
                        "data": discovery_cache["results"]
                    })
        
        # Run discovery
        generator = ScryptedDashboardGenerator(prometheus_url)
        generator._discover_metrics()
        generator._identify_nodes()
        generator._detect_hardware()
        
        # Format results for plugin
        results = {
            "nodes": {},
            "total_metrics": len(generator.all_metrics),
            "capabilities": {
                "has_nvidia": False,
                "has_intel_gpu": False,
                "has_intel_npu": False,
                "has_mac": False,
                "has_multiple_nodes": len(generator.nodes) > 1,
                "has_temperature": False,
                "has_power": False,
                "has_disk": False,
                "has_network": False,
                "has_processes": False
            }
        }
        
        # Process each node
        for instance, node in generator.nodes.items():
            results["nodes"][instance] = {
                "hostname": node.hostname,
                "ip": node.ip,
                "port": node.port,
                "hardware": node.hardware,
                "metric_count": len(node.metrics),
                "key_metrics": list(node.metrics)[:20]  # Sample of metrics
            }
            
            # Update capabilities
            for cap in ["nvidia_gpu", "intel_gpu", "intel_npu", "mac"]:
                if node.hardware.get(cap):
                    results["capabilities"][f"has_{cap.replace('_gpu', '')}"] = True
            
            if node.hardware.get("has_temp"):
                results["capabilities"]["has_temperature"] = True
            if node.hardware.get("has_power"):
                results["capabilities"]["has_power"] = True
            if node.hardware.get("has_process"):
                results["capabilities"]["has_processes"] = True
        
        # Check for disk/network metrics
        results["capabilities"]["has_disk"] = any("disk" in m for m in generator.all_metrics)
        results["capabilities"]["has_network"] = any("network" in m or "net_" in m for m in generator.all_metrics)
        
        # Cache results
        discovery_cache["results"] = results
        discovery_cache["timestamp"] = datetime.now()
        
        return jsonify({
            "status": "success",
            "cached": False,
            "data": results
        })
        
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

@app.route('/generate', methods=['POST'])
def generate():
    """Generate dashboard based on discovery and options"""
    try:
        data = request.json or {}
        prometheus_url = data.get('prometheus_url', 'http://localhost:9090')
        
        # Dashboard options
        options = {
            "name": data.get('dashboard_name', 'Scrypted Telemetry'),
            "include_gpu": data.get('include_gpu', True),
            "include_processes": data.get('include_processes', True),
            "include_disk": data.get('include_disk', True),
            "include_network": data.get('include_network', True),
            "refresh_interval": data.get('refresh_interval', '5s'),
            "uid": data.get('uid', 'scrypted-auto'),
            "datasource_uid": data.get('datasource_uid', 'prometheus-uid')
        }
        
        # Run generator
        generator = ScryptedDashboardGenerator(prometheus_url)
        dashboard = generator.discover_all()
        
        # Apply options
        dashboard["title"] = options["name"]
        dashboard["refresh"] = options["refresh_interval"]
        dashboard["uid"] = options["uid"]
        
        # Update datasource UIDs in all panels
        for panel in dashboard.get("panels", []):
            if "datasource" in panel:
                panel["datasource"]["uid"] = options["datasource_uid"]
        
        # Filter panels based on options
        if not options["include_gpu"]:
            dashboard["panels"] = [p for p in dashboard["panels"] 
                                  if "GPU" not in p.get("title", "") and "Accelerator" not in p.get("title", "")]
        
        if not options["include_processes"]:
            dashboard["panels"] = [p for p in dashboard["panels"] 
                                  if "Process" not in p.get("title", "")]
        
        if not options["include_disk"]:
            dashboard["panels"] = [p for p in dashboard["panels"] 
                                  if "Disk" not in p.get("title", "") and "Storage" not in p.get("title", "")]
        
        if not options["include_network"]:
            dashboard["panels"] = [p for p in dashboard["panels"] 
                                  if "Network" not in p.get("title", "")]
        
        return jsonify({
            "status": "success",
            "dashboard": dashboard,
            "panel_count": len(dashboard.get("panels", [])),
            "options_applied": options
        })
        
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

@app.route('/import', methods=['POST'])
def import_to_grafana():
    """Import dashboard directly to Grafana"""
    try:
        data = request.json or {}
        grafana_url = data.get('grafana_url', 'http://localhost:3000')
        api_key = data.get('api_key')
        dashboard = data.get('dashboard')
        
        if not api_key:
            return jsonify({
                "status": "error",
                "error": "API key required for import"
            }), 400
        
        if not dashboard:
            return jsonify({
                "status": "error",
                "error": "Dashboard JSON required"
            }), 400
        
        import requests
        
        # Import to Grafana
        response = requests.post(
            f"{grafana_url}/api/dashboards/db",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "dashboard": dashboard,
                "overwrite": True,
                "message": f"Auto-imported by Scrypted Telemetry Plugin at {datetime.now()}"
            }
        )
        
        if response.status_code == 200:
            result = response.json()
            return jsonify({
                "status": "success",
                "grafana_response": result,
                "url": f"{grafana_url}/d/{dashboard.get('uid', 'unknown')}"
            })
        else:
            return jsonify({
                "status": "error",
                "error": f"Grafana returned {response.status_code}",
                "response": response.text
            }), 500
            
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

@app.route('/validate', methods=['POST'])
def validate_setup():
    """Validate the entire setup - check what's missing"""
    try:
        data = request.json or {}
        prometheus_url = data.get('prometheus_url', 'http://localhost:9090')
        grafana_url = data.get('grafana_url', 'http://localhost:3000')
        
        validation = {
            "prometheus": {"status": "unknown", "issues": []},
            "grafana": {"status": "unknown", "issues": []},
            "exporters": {"found": [], "missing": []},
            "recommendations": []
        }
        
        import requests
        
        # Check Prometheus
        try:
            resp = requests.get(f"{prometheus_url}/-/healthy", timeout=5)
            if resp.status_code == 200:
                validation["prometheus"]["status"] = "healthy"
            else:
                validation["prometheus"]["status"] = "unhealthy"
                validation["prometheus"]["issues"].append(f"Health check returned {resp.status_code}")
        except Exception as e:
            validation["prometheus"]["status"] = "unreachable"
            validation["prometheus"]["issues"].append(str(e))
            validation["recommendations"].append("Install and start Prometheus: docker run -p 9090:9090 prom/prometheus")
        
        # Check Grafana
        try:
            resp = requests.get(f"{grafana_url}/api/health", timeout=5)
            if resp.status_code == 200:
                validation["grafana"]["status"] = "healthy"
            else:
                validation["grafana"]["status"] = "unhealthy"
                validation["grafana"]["issues"].append(f"Health check returned {resp.status_code}")
        except Exception as e:
            validation["grafana"]["status"] = "unreachable"
            validation["grafana"]["issues"].append(str(e))
            validation["recommendations"].append("Install and start Grafana: docker run -p 3000:3000 grafana/grafana")
        
        # Check for exporters if Prometheus is healthy
        if validation["prometheus"]["status"] == "healthy":
            try:
                # Get all metrics
                resp = requests.get(f"{prometheus_url}/api/v1/label/__name__/values")
                if resp.status_code == 200:
                    metrics = set(resp.json().get("data", []))
                    
                    # Check what exporters are present
                    if any(m.startswith("node_") for m in metrics):
                        validation["exporters"]["found"].append("node-exporter")
                    else:
                        validation["exporters"]["missing"].append("node-exporter")
                        validation["recommendations"].append("Install node-exporter for system metrics")
                    
                    if any(m.startswith(("nvidia_", "DCGM_")) for m in metrics):
                        validation["exporters"]["found"].append("nvidia-exporter")
                    
                    if any(m.startswith("intel_npu_") for m in metrics):
                        validation["exporters"]["found"].append("intel-npu-exporter")
                    
                    if any(m.startswith("mac_") for m in metrics):
                        validation["exporters"]["found"].append("mac-exporter")
                    
                    if not validation["exporters"]["found"]:
                        validation["recommendations"].append("No exporters found - run the setup script to install them")
                        
            except Exception as e:
                validation["prometheus"]["issues"].append(f"Could not query metrics: {e}")
        
        # Overall status
        if (validation["prometheus"]["status"] == "healthy" and 
            validation["grafana"]["status"] == "healthy" and 
            len(validation["exporters"]["found"]) > 0):
            validation["ready"] = True
            validation["message"] = "System is ready for dashboard generation"
        else:
            validation["ready"] = False
            validation["message"] = "Setup incomplete - check recommendations"
        
        return jsonify(validation)
        
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('DEBUG', 'false').lower() == 'true'
    
    print(f"""
╔══════════════════════════════════════════════════════╗
║     Scrypted Dashboard Generator API                ║
║           Running on port {port}                    ║
║                                                      ║
║     Endpoints:                                       ║
║       POST /discover - Run discovery                ║
║       POST /generate - Generate dashboard           ║
║       POST /import   - Import to Grafana            ║
║       POST /validate - Check setup                  ║
║                                                      ║
║     tteck would be proud - it's just an API!        ║
╚══════════════════════════════════════════════════════╝
    """)
    
    app.run(host='0.0.0.0', port=port, debug=debug)