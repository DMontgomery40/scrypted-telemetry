#!/usr/bin/env python3
"""
Simple Intel NPU monitoring placeholder
This is a basic implementation that provides health endpoints and placeholder metrics.
A real implementation would integrate with Intel NPU drivers and tools.
"""

from flask import Flask, jsonify
import psutil
import time
import threading

app = Flask(__name__)

# Store metrics
metrics_data = {
    'npu_utilization': 0.0,
    'npu_temperature': 45.0,
    'timestamp': time.time()
}

def update_metrics():
    """Update metrics periodically"""
    while True:
        # Placeholder metrics - in real implementation this would read from NPU
        metrics_data.update({
            'npu_utilization': min(100.0, psutil.cpu_percent() * 0.8),  # Simulated
            'npu_temperature': 45.0 + (psutil.cpu_percent() * 0.3),    # Simulated
            'timestamp': time.time()
        })
        time.sleep(1)

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': time.time(),
        'service': 'intel-npu-top'
    })

@app.route('/metrics')
def get_metrics():
    """Return NPU metrics in JSON format"""
    return jsonify(metrics_data)

@app.route('/')
def index():
    """Root endpoint"""
    return jsonify({
        'service': 'Intel NPU Top Placeholder',
        'version': '1.0.0',
        'endpoints': ['/health', '/metrics']
    })

if __name__ == '__main__':
    # Start metrics update thread
    metrics_thread = threading.Thread(target=update_metrics, daemon=True)
    metrics_thread.start()
    
    app.run(host='0.0.0.0', port=9103, debug=False)