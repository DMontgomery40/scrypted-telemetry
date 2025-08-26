#!/usr/bin/env python3
"""
Intel NPU Prometheus Exporter
Fetches metrics from intel-npu-top service and exports them in Prometheus format
"""

import os
import time
import requests
from flask import Flask, Response
from prometheus_client import Gauge, generate_latest, CONTENT_TYPE_LATEST

app = Flask(__name__)

# Prometheus metrics
npu_utilization = Gauge('intel_npu_utilization_percent', 'Intel NPU utilization percentage')
npu_temperature = Gauge('intel_npu_temperature_celsius', 'Intel NPU temperature in Celsius')

# Configuration
INTEL_NPU_TOP_URL = os.getenv('INTEL_NPU_TOP_URL', 'http://intel-npu-top:9103')
SCRAPE_INTERVAL = int(os.getenv('SCRAPE_INTERVAL', '5'))

def fetch_npu_metrics():
    """Fetch metrics from intel-npu-top service"""
    try:
        response = requests.get(f"{INTEL_NPU_TOP_URL}/metrics", timeout=5)
        if response.status_code == 200:
            data = response.json()
            npu_utilization.set(data.get('npu_utilization', 0))
            npu_temperature.set(data.get('npu_temperature', 0))
            return True
    except Exception as e:
        print(f"Error fetching NPU metrics: {e}")
        return False

@app.route('/metrics')
def metrics():
    """Return Prometheus metrics"""
    fetch_npu_metrics()
    return Response(generate_latest(), mimetype=CONTENT_TYPE_LATEST)

@app.route('/health')
def health():
    """Health check endpoint"""
    return {'status': 'healthy', 'service': 'intel-npu-prometheus-exporter'}

@app.route('/')
def index():
    """Root endpoint"""
    return {
        'service': 'Intel NPU Prometheus Exporter',
        'version': '1.0.0',
        'npu_source': INTEL_NPU_TOP_URL,
        'endpoints': ['/metrics', '/health']
    }

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=9104, debug=False)