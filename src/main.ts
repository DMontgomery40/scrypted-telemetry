import sdk, { 
  ScryptedDeviceBase, 
  Settings, 
  HttpRequestHandler, 
  DeviceProvider,
  HttpRequest,
  HttpResponse,
  Setting,
  SettingValue,
  ScryptedInterface,
  ScryptedDeviceType
} from '@scrypted/sdk';
import * as http from 'http';
// @ts-ignore - StorageSettings import issue with webpack
import { StorageSettings } from '@scrypted/sdk/storage-settings';
import { MetricsCollector } from './metrics-collector';
import { PrometheusFormatter } from './prometheus-formatter';
import { 
  HardwareMetrics, 
  TelemetryConfig, 
  ClusterMetricsMessage, 
  HealthStatus,
  DEFAULT_COLLECTION_INTERVAL,
  DEFAULT_CONNECTION_TIMEOUT,
  DEFAULT_RETRY_COUNT,
  DEFAULT_PROMETHEUS_ENDPOINT
} from './types';

/**
 * Scrypted Telemetry Plugin
 * 
 * Comprehensive hardware telemetry monitoring with cluster state sharing.
 * Collects metrics from multiple sources and provides Prometheus-compatible endpoints.
 */
export default class TelemetryPlugin extends ScryptedDeviceBase implements Settings, HttpRequestHandler, DeviceProvider {
  private metricsCollector: MetricsCollector;
  private prometheusFormatter: PrometheusFormatter;
  private collectionTimer?: NodeJS.Timeout;
  private localMetrics?: HardwareMetrics;
  private clusterMetrics: Map<string, HardwareMetrics> = new Map();
  private nodeId: string;
  private isStarted = false;
  private metricsServer?: http.Server;
  private metricsPort = 9090;

  storageSettings = new StorageSettings(this, {
    // Basic settings
    collectionInterval: {
      title: 'Collection Interval',
      description: 'How often to collect metrics (seconds)',
      type: 'number',
      defaultValue: DEFAULT_COLLECTION_INTERVAL,
      range: [1, 300]
    },
    
    enableClusterSharing: {
      title: 'Enable Cluster Sharing',
      description: 'Share metrics with other Scrypted nodes in the cluster',
      type: 'boolean',
      defaultValue: true
    },
    
    prometheusEndpoint: {
      title: 'Prometheus Endpoint Path',
      description: 'URL path for Prometheus metrics endpoint',
      type: 'string',
      defaultValue: DEFAULT_PROMETHEUS_ENDPOINT,
      placeholder: '/metrics'
    },
    
    // External exporter endpoints
    intelGpuEndpoint: {
      title: 'Intel GPU Exporter URL',
      description: 'Prometheus endpoint for Intel GPU metrics',
      type: 'string',
      defaultValue: 'http://localhost:9102/metrics',
      placeholder: 'http://localhost:9102/metrics'
    },
    
    intelNpuEndpoint: {
      title: 'Intel NPU Exporter URL', 
      description: 'Prometheus endpoint for Intel NPU metrics',
      type: 'string',
      defaultValue: 'http://localhost:9104/metrics',
      placeholder: 'http://localhost:9104/metrics'
    },
    
    nvidiaEndpoint: {
      title: 'NVIDIA GPU Exporter URL',
      description: 'Prometheus endpoint for NVIDIA GPU metrics (DCGM)',
      type: 'string', 
      defaultValue: 'http://localhost:9400/metrics',
      placeholder: 'http://localhost:9400/metrics'
    },
    
    macmonEndpoint: {
      title: 'macmon Exporter URL',
      description: 'Prometheus endpoint for Apple Silicon metrics',
      type: 'string',
      defaultValue: 'http://localhost:9105/metrics',
      placeholder: 'http://localhost:9105/metrics'
    },
    
    // Feature toggles
    enableLocalMetrics: {
      title: 'Enable Local Metrics',
      description: 'Collect basic system metrics via systeminformation',
      type: 'boolean',
      defaultValue: true
    },
    
    enableIntelGpu: {
      title: 'Enable Intel GPU Monitoring',
      description: 'Collect metrics from Intel GPU exporter',
      type: 'boolean',
      defaultValue: true
    },
    
    enableIntelNpu: {
      title: 'Enable Intel NPU Monitoring',
      description: 'Collect metrics from Intel NPU exporter',
      type: 'boolean',
      defaultValue: true
    },
    
    enableNvidia: {
      title: 'Enable NVIDIA GPU Monitoring',
      description: 'Collect metrics from NVIDIA DCGM exporter',
      type: 'boolean',
      defaultValue: true
    },
    
    enableMacmon: {
      title: 'Enable macmon Integration',
      description: 'Use native macmon tool on macOS systems',
      type: 'boolean',
      defaultValue: true
    },
    
    // Advanced settings
    connectionTimeout: {
      title: 'Connection Timeout',
      description: 'Timeout for exporter connections (milliseconds)',
      type: 'number',
      defaultValue: DEFAULT_CONNECTION_TIMEOUT,
      range: [1000, 60000]
    },
    
    retryCount: {
      title: 'Retry Count',
      description: 'Number of retry attempts for failed connections',
      type: 'number',
      defaultValue: DEFAULT_RETRY_COUNT,
      range: [0, 10]
    },
    
    metricsSecret: {
      title: 'Metrics Access Secret',
      description: 'Secret token for Prometheus to access metrics endpoint (e.g., use same as SCRYPTED_CLUSTER_SECRET)',
      type: 'string',
      defaultValue: 'swordfish',
      placeholder: 'Enter a secure secret token'
    },
    
    metricsServerPort: {
      title: 'Standalone Metrics Server Port',
      description: 'Port for standalone HTTP metrics server (bypasses Scrypted auth)',
      type: 'number',
      defaultValue: 9090,
      range: [9000, 9999],
      placeholder: '9090'
    }
  });

  constructor() {
    super();
    
    // Generate unique node identifier
    this.nodeId = this.generateNodeId();
    
    // Initialize components
    this.metricsCollector = new MetricsCollector(this.getTelemetryConfig(), this.console);
    this.prometheusFormatter = new PrometheusFormatter();
    
    // Set up cluster communication
    this.setupClusterListener();
    
    // Make endpoints public for Prometheus access
    this.setupPublicEndpoints();
    
    // Start standalone metrics server
    this.startMetricsServer();
    
    // Auto-start collection
    this.startCollection();
    
    this.console.log(`Telemetry plugin initialized for node: ${this.nodeId}`);
  }

  /**
   * Set up public endpoints for Prometheus access
   */
  private async setupPublicEndpoints() {
    try {
      // Set CORS headers for cross-origin access
      await sdk.endpointManager.setAccessControlAllowOrigin({
        nativeId: this.nativeId,
        origins: ['*']
      });
      
      // Get public endpoint URLs for logging  
      const publicUrl = await sdk.endpointManager.getLocalEndpoint(this.nativeId, { 
        public: true,
        insecure: true
      });
      
      this.console.log(`🔓 Public Telemetry Endpoints:`);
      this.console.log(`  📊 Metrics: ${publicUrl}/metrics`);
      this.console.log(`  ❤️  Health:  ${publicUrl}/health`);
      this.console.log(`  📈 Grafana:  ${publicUrl}/dashboard.json`);
      this.console.log(`  📋 Status:   ${publicUrl}/status`);
      
    } catch (error) {
      this.console.error('Error setting up public endpoints:', error);
    }
  }

  /**
   * Start standalone HTTP server for metrics
   */
  private startMetricsServer() {
    const port = this.storageSettings.values.metricsServerPort || 9090;
    
    this.metricsServer = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://localhost');
        const path = url.pathname;
        
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }
        
        if (path === '/metrics') {
          const allMetrics = this.getAllMetrics();
          const prometheusOutput = this.prometheusFormatter.formatMetrics(allMetrics);
          
          res.writeHead(200, {
            'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
          });
          res.end(prometheusOutput);
          
        } else if (path === '/health') {
          this.getHealthStatus().then(health => {
            res.writeHead(health.healthy ? 200 : 503, {
              'Content-Type': 'application/json'
            });
            res.end(JSON.stringify(health, null, 2));
          }).catch(error => {
            this.console.error('Error getting health status:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          });
          
        } else if (path === '/status') {
          const status = {
            nodeId: this.nodeId,
            isStarted: this.isStarted,
            localMetrics: !!this.localMetrics,
            clusterNodes: Array.from(this.clusterMetrics.keys()),
            lastCollection: this.localMetrics?.timestamp || 0,
            config: this.getTelemetryConfig(),
            metricsServerPort: port
          };
          
          res.writeHead(200, {
            'Content-Type': 'application/json'
          });
          res.end(JSON.stringify(status, null, 2));
          
        } else if (path === '/dashboard') {
          const dashboard = this.generateGrafanaDashboard();
          
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Disposition': 'attachment; filename="scrypted-telemetry-dashboard.json"'
          });
          res.end(JSON.stringify(dashboard, null, 2));
          
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
        
      } catch (error) {
        this.console.error('Error handling metrics server request:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    });
    
    this.metricsServer.listen(port, '0.0.0.0', () => {
      this.console.log(`✅ Standalone metrics server running on http://0.0.0.0:${port}/metrics`);
      this.console.log(`   📊 Direct Prometheus target: <HOST_IP>:${port}/metrics`);
      this.console.log(`   📈 Grafana Dashboard JSON: <HOST_IP>:${port}/dashboard`);
      this.console.log(`   ❤️  Health check: <HOST_IP>:${port}/health`);
      this.console.log(`   📋 Status: <HOST_IP>:${port}/status`);
    });
    
    this.metricsServer.on('error', (error) => {
      this.console.error(`Metrics server error on port ${port}:`, error);
    });
  }

  /**
   * Generate unique node identifier based on hostname and IP
   */
  private generateNodeId(): string {
    const os = require('os');
    const hostname = os.hostname();
    
    // Get primary network interface IP
    const interfaces = os.networkInterfaces();
    let primaryIp = '127.0.0.1';
    
    for (const interfaceName of Object.keys(interfaces)) {
      const iface = interfaces[interfaceName];
      if (iface) {
        for (const addr of iface) {
          if (!addr.internal && addr.family === 'IPv4') {
            primaryIp = addr.address;
            break;
          }
        }
        if (primaryIp !== '127.0.0.1') break;
      }
    }
    
    return `${hostname}_${primaryIp.replace(/\./g, '_')}`;
  }

  /**
   * Get current telemetry configuration
   */
  private getTelemetryConfig(): TelemetryConfig {
    const settings = this.storageSettings.values;
    
    return {
      collectionInterval: settings.collectionInterval || DEFAULT_COLLECTION_INTERVAL,
      enableClusterSharing: settings.enableClusterSharing !== false,
      prometheusEndpoint: settings.prometheusEndpoint || DEFAULT_PROMETHEUS_ENDPOINT,
      
      externalEndpoints: [
        {
          name: 'Intel GPU',
          url: settings.intelGpuEndpoint || 'http://localhost:9102/metrics',
          enabled: settings.enableIntelGpu !== false,
          timeout: settings.connectionTimeout || DEFAULT_CONNECTION_TIMEOUT
        },
        {
          name: 'Intel NPU',
          url: settings.intelNpuEndpoint || 'http://localhost:9104/metrics',
          enabled: settings.enableIntelNpu !== false,
          timeout: settings.connectionTimeout || DEFAULT_CONNECTION_TIMEOUT
        },
        {
          name: 'NVIDIA GPU',
          url: settings.nvidiaEndpoint || 'http://localhost:9400/metrics',
          enabled: settings.enableNvidia !== false,
          timeout: settings.connectionTimeout || DEFAULT_CONNECTION_TIMEOUT
        },
        {
          name: 'macmon',
          url: settings.macmonEndpoint || 'http://localhost:9105/metrics',
          enabled: settings.enableMacmon !== false,
          timeout: settings.connectionTimeout || DEFAULT_CONNECTION_TIMEOUT
        }
      ],
      
      enableLocalMetrics: settings.enableLocalMetrics !== false,
      enableMacmonIntegration: settings.enableMacmon !== false,
      
      connectionTimeout: settings.connectionTimeout || DEFAULT_CONNECTION_TIMEOUT,
      retryCount: settings.retryCount || DEFAULT_RETRY_COUNT
    };
  }

  /**
   * Start metrics collection
   */
  private async startCollection() {
    if (this.isStarted) {
      return;
    }
    
    this.isStarted = true;
    const config = this.getTelemetryConfig();
    
    // Initial collection
    await this.collectAndPublishMetrics();
    
    // Set up periodic collection
    this.collectionTimer = setInterval(async () => {
      try {
        await this.collectAndPublishMetrics();
      } catch (error) {
        this.console.error('Error during periodic metrics collection:', error);
      }
    }, config.collectionInterval * 1000);
    
    this.console.log(`Started metrics collection with ${config.collectionInterval}s interval`);
  }

  /**
   * Stop metrics collection
   */
  private stopCollection() {
    if (this.collectionTimer) {
      clearInterval(this.collectionTimer);
      this.collectionTimer = undefined;
    }
    this.isStarted = false;
    this.console.log('Stopped metrics collection');
  }

  /**
   * Collect metrics and publish to cluster
   */
  private async collectAndPublishMetrics() {
    try {
      // Collect local metrics
      this.localMetrics = await this.metricsCollector.collectMetrics();
      
      if (!this.localMetrics) {
        this.console.warn('No metrics collected');
        return;
      }
      
      // Set node identifier
      this.localMetrics.nodeId = this.nodeId;
      this.localMetrics.timestamp = Date.now();
      
      // Publish to cluster if enabled
      const config = this.getTelemetryConfig();
      if (config.enableClusterSharing) {
        await this.publishToCluster(this.localMetrics);
      }
      
    } catch (error) {
      this.console.error('Error collecting metrics:', error);
    }
  }

  /**
   * Publish metrics to cluster
   */
  private async publishToCluster(metrics: HardwareMetrics) {
    try {
      const message: ClusterMetricsMessage = {
        type: 'metrics_update',
        nodeId: this.nodeId,
        timestamp: Date.now(),
        data: metrics
      };
      
      // Publish via Scrypted device events
      sdk.deviceManager.onDeviceEvent(this.nativeId, 'TelemetryUpdated', message);
      
    } catch (error) {
      this.console.error('Error publishing to cluster:', error);
    }
  }

  /**
   * Set up cluster event listener
   */
  private setupClusterListener() {
    sdk.systemManager.listen((eventSource, eventDetails, eventData) => {
      try {
        if (eventDetails.eventInterface === 'TelemetryUpdated' && eventData) {
          const message = eventData as ClusterMetricsMessage;
          
          // Don't process our own messages
          if (message.nodeId === this.nodeId) {
            return;
          }
          
          if (message.type === 'metrics_update' && message.data) {
            // Store remote metrics
            this.clusterMetrics.set(message.nodeId, message.data);
            this.console.log(`Received metrics from cluster node: ${message.nodeId}`);
          } else if (message.type === 'node_offline') {
            // Remove offline node metrics
            this.clusterMetrics.delete(message.nodeId);
            this.console.log(`Node went offline: ${message.nodeId}`);
          }
        }
      } catch (error) {
        this.console.error('Error processing cluster event:', error);
      }
    });
  }

  /**
   * Get all metrics (local + cluster)
   */
  private getAllMetrics(): HardwareMetrics[] {
    const allMetrics: HardwareMetrics[] = [];
    
    // Add local metrics
    if (this.localMetrics) {
      allMetrics.push(this.localMetrics);
    }
    
    // Add cluster metrics
    for (const metrics of this.clusterMetrics.values()) {
      allMetrics.push(metrics);
    }
    
    return allMetrics;
  }

  /**
   * Get health status
   */
  private async getHealthStatus(): Promise<HealthStatus> {
    const health = await this.metricsCollector.getHealthStatus();
    return {
      healthy: health.healthy && this.isStarted,
      services: health.services,
      lastUpdate: this.localMetrics?.timestamp || 0
    };
  }

  // Scrypted Settings interface implementation
  async getSettings(): Promise<Setting[]> {
    return await this.storageSettings.getSettings();
  }

  async putSetting(key: string, value: SettingValue): Promise<void> {
    await this.storageSettings.putSetting(key, value);
    
    // Restart collection if relevant settings changed
    const restartTriggers = [
      'collectionInterval',
      'enableLocalMetrics',
      'enableIntelGpu',
      'enableIntelNpu', 
      'enableNvidia',
      'enableMacmon',
      'connectionTimeout',
      'retryCount'
    ];
    
    // Restart metrics server if port changed
    if (key === 'metricsServerPort') {
      this.console.log('Metrics server port changed, restarting server...');
      this.stopMetricsServer();
      setTimeout(() => this.startMetricsServer(), 1000);
    }
    
    if (restartTriggers.includes(key)) {
      this.console.log(`Setting ${key} changed, restarting collection...`);
      this.stopCollection();
      
      // Update metrics collector configuration
      this.metricsCollector.updateConfig(this.getTelemetryConfig());
      
      // Restart collection
      setTimeout(() => this.startCollection(), 1000);
    }
  }

  // Scrypted HttpRequestHandler interface implementation
  async onRequest(request: HttpRequest, response: HttpResponse): Promise<void> {
    try {
      const url = new URL(request.url || '/', 'http://localhost');
      let path = url.pathname;
      
      // DEBUG: Log exactly what we're receiving
      this.console.log(`[TELEMETRY] Received request: ${request.url}, pathname: ${path}`);
      
      // Handle public endpoint prefix
      const isPublic = path.startsWith('/public/');
      if (isPublic) {
        path = path.substring('/public'.length);
        this.console.log(`[TELEMETRY] Public path detected, stripped to: ${path}`);
      }
      
      if (path === '/metrics' || path === this.storageSettings.values.prometheusEndpoint) {
        // Skip authentication for public paths
        if (!isPublic) {
          // Only check secret for non-public paths
          const providedSecret = url.searchParams.get('secret');
          const configuredSecret = this.storageSettings.values.metricsSecret;
          
          if (configuredSecret && providedSecret !== configuredSecret) {
            this.console.warn(`[TELEMETRY] Unauthorized metrics access attempt - invalid secret provided`);
            response.send('Unauthorized', { code: 401 });
            return;
          }
        } else {
          this.console.log(`[TELEMETRY] Serving metrics via public endpoint - authentication skipped`);
        }
        
        // Prometheus metrics endpoint
        const allMetrics = this.getAllMetrics();
        const prometheusOutput = this.prometheusFormatter.formatMetrics(allMetrics);
        
        response.send(prometheusOutput, {
          headers: {
            'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
          }
        });
        
      } else if (path === '/health') {
        // Health check endpoint
        const health = await this.getHealthStatus();
        
        response.send(JSON.stringify(health, null, 2), {
          headers: {
            'Content-Type': 'application/json'
          },
          code: health.healthy ? 200 : 503
        });
        
      } else if (path === '/status') {
        // Status endpoint with detailed information
        const status = {
          nodeId: this.nodeId,
          isStarted: this.isStarted,
          localMetrics: !!this.localMetrics,
          clusterNodes: Array.from(this.clusterMetrics.keys()),
          lastCollection: this.localMetrics?.timestamp || 0,
          config: this.getTelemetryConfig()
        };
        
        response.send(JSON.stringify(status, null, 2), {
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
      } else if (path === '/dashboard.json') {
        // Serve Grafana dashboard JSON
        const fs = require('fs');
        const pathModule = require('path');
        
        try {
          const dashboardPath = pathModule.join(__dirname, '../dashboard.json');
          const dashboard = fs.readFileSync(dashboardPath, 'utf8');
          
          response.send(dashboard, {
            headers: {
              'Content-Type': 'application/json'
            }
          });
        } catch (error) {
          this.console.error('Error serving dashboard JSON:', error);
          response.send('Dashboard not found', { code: 404 });
        }
        
      } else {
        // Not found
        response.send('Not Found', { code: 404 });
      }
      
    } catch (error) {
      this.console.error('Error handling HTTP request:', error);
      response.send('Internal Server Error', { code: 500 });
    }
  }

  // Scrypted DeviceProvider interface implementation
  async getDevice(nativeId: string): Promise<any> {
    // This plugin acts as a single device, return itself
    return this;
  }

  async releaseDevice(id: string, nativeId: string): Promise<void> {
    // Cleanup when device is removed
    this.stopCollection();
    this.console.log('Telemetry plugin device released');
  }

  /**
   * Generate Grafana dashboard JSON
   */
  private generateGrafanaDashboard() {
    return {
      "annotations": {
        "list": [
          {
            "builtIn": 1,
            "datasource": {
              "type": "grafana",
              "uid": "-- Grafana --"
            },
            "enable": true,
            "hide": true,
            "iconColor": "rgba(0, 211, 255, 1)",
            "name": "Annotations & Alerts",
            "type": "dashboard"
          }
        ]
      },
      "description": "Critical infrastructure monitoring for Scrypted NVR - Life Safety System",
      "editable": true,
      "fiscalYearStartMonth": 0,
      "graphTooltip": 1,
      "id": null,
      "links": [],
      "liveNow": true,
      "panels": [
        {
          "collapsed": false,
          "gridPos": {
            "h": 1,
            "w": 24,
            "x": 0,
            "y": 0
          },
          "id": 1,
          "panels": [],
          "title": "🚨 CRITICAL TEMPERATURES",
          "type": "row"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "${DS_PROMETHEUS}"
          },
          "fieldConfig": {
            "defaults": {
              "color": {
                "mode": "thresholds"
              },
              "custom": {
                "axisBorderShow": false,
                "axisColorMode": "text",
                "axisLabel": "",
                "axisPlacement": "auto",
                "barAlignment": 0,
                "displayMode": "list",
                "filterable": false,
                "footer": {
                  "countRows": false,
                  "fields": "",
                  "reducer": ["sum"],
                  "show": false
                },
                "frameIndex": 0,
                "showHeader": true
              },
              "mappings": [],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "green",
                    "value": null
                  },
                  {
                    "color": "yellow",
                    "value": 70
                  },
                  {
                    "color": "red",
                    "value": 85
                  }
                ]
              },
              "unit": "celsius"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 6,
            "w": 12,
            "x": 0,
            "y": 1
          },
          "id": 2,
          "options": {
            "displayMode": "basic",
            "maxVizHeight": 300,
            "minVizHeight": 75,
            "namePlacement": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": ["lastNotNull"],
              "fields": "",
              "values": false
            },
            "showUnfilled": true,
            "sizing": "auto",
            "valueMode": "color"
          },
          "pluginVersion": "10.0.0",
          "targets": [
            {
              "datasource": {
                "type": "prometheus"
              },
              "editorMode": "code",
              "expr": "cpu_temperature_celsius{core=\"\"} or cpu_temperature_celsius{core!=\"\"}",
              "instant": false,
              "legendFormat": "{{node}} CPU {{core}}",
              "range": true,
              "refId": "A"
            }
          ],
          "title": "CPU Temperatures",
          "type": "bargauge"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "${DS_PROMETHEUS}"
          },
          "fieldConfig": {
            "defaults": {
              "color": {
                "mode": "thresholds"
              },
              "custom": {
                "axisBorderShow": false,
                "axisColorMode": "text",
                "axisLabel": "",
                "axisPlacement": "auto",
                "barAlignment": 0,
                "displayMode": "list",
                "filterable": false,
                "footer": {
                  "countRows": false,
                  "fields": "",
                  "reducer": ["sum"],
                  "show": false
                },
                "frameIndex": 0,
                "showHeader": true
              },
              "mappings": [],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "green",
                    "value": null
                  },
                  {
                    "color": "yellow",
                    "value": 75
                  },
                  {
                    "color": "red",
                    "value": 90
                  }
                ]
              },
              "unit": "percent"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 6,
            "w": 12,
            "x": 12,
            "y": 1
          },
          "id": 3,
          "options": {
            "displayMode": "basic",
            "maxVizHeight": 300,
            "minVizHeight": 75,
            "namePlacement": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": ["lastNotNull"],
              "fields": "",
              "values": false
            },
            "showUnfilled": true,
            "sizing": "auto",
            "valueMode": "color"
          },
          "pluginVersion": "10.0.0",
          "targets": [
            {
              "datasource": {
                "type": "prometheus"
              },
              "editorMode": "code",
              "expr": "intel_npu_utilization_percent",
              "instant": false,
              "legendFormat": "{{node}} Intel NPU",
              "range": true,
              "refId": "A"
            }
          ],
          "title": "🧠 NPU Utilization (OpenVino)",
          "type": "bargauge"
        },
        {
          "collapsed": false,
          "gridPos": {
            "h": 1,
            "w": 24,
            "x": 0,
            "y": 7
          },
          "id": 4,
          "panels": [],
          "title": "📊 SYSTEM STATUS",
          "type": "row"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "${DS_PROMETHEUS}"
          },
          "fieldConfig": {
            "defaults": {
              "color": {
                "mode": "palette-classic"
              },
              "custom": {
                "axisBorderShow": false,
                "axisColorMode": "text",
                "axisLabel": "",
                "axisPlacement": "auto",
                "drawStyle": "line",
                "fillOpacity": 0,
                "gradientMode": "none",
                "hideFrom": {
                  "legend": false,
                  "tooltip": false,
                  "vis": false
                },
                "lineInterpolation": "linear",
                "lineWidth": 2,
                "pointSize": 5,
                "scaleDistribution": {
                  "type": "linear"
                },
                "showPoints": "auto",
                "spanNulls": false,
                "stacking": {
                  "group": "A",
                  "mode": "none"
                },
                "thresholdsStyle": {
                  "mode": "off"
                }
              },
              "mappings": [],
              "max": 100,
              "min": 0,
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "green",
                    "value": null
                  },
                  {
                    "color": "red",
                    "value": 80
                  }
                ]
              },
              "unit": "percent"
            },
            "overrides": [
              {
                "matcher": {
                  "id": "byRegexp",
                  "options": "/.*PVE.*/"
                },
                "properties": [
                  {
                    "id": "color",
                    "value": {
                      "fixedColor": "red",
                      "mode": "fixed"
                    }
                  }
                ]
              },
              {
                "matcher": {
                  "id": "byRegexp",
                  "options": "/.*PVE3.*/"
                },
                "properties": [
                  {
                    "id": "color",
                    "value": {
                      "fixedColor": "blue",
                      "mode": "fixed"
                    }
                  }
                ]
              },
              {
                "matcher": {
                  "id": "byRegexp",
                  "options": "/.*Mac.*/"
                },
                "properties": [
                  {
                    "id": "color",
                    "value": {
                      "fixedColor": "green",
                      "mode": "fixed"
                    }
                  }
                ]
              }
            ]
          },
          "gridPos": {
            "h": 8,
            "w": 12,
            "x": 0,
            "y": 8
          },
          "id": 5,
          "options": {
            "legend": {
              "calcs": [],
              "displayMode": "list",
              "placement": "bottom",
              "showLegend": true
            },
            "tooltip": {
              "mode": "single",
              "sort": "none"
            }
          },
          "targets": [
            {
              "datasource": {
                "type": "prometheus"
              },
              "editorMode": "code",
              "expr": "cpu_utilization_percent{core=\"\"}",
              "instant": false,
              "legendFormat": "{{node}} CPU",
              "range": true,
              "refId": "A"
            }
          ],
          "title": "CPU Utilization",
          "type": "timeseries"
        },
        {
          "datasource": {
            "type": "prometheus",
            "uid": "${DS_PROMETHEUS}"
          },
          "fieldConfig": {
            "defaults": {
              "color": {
                "mode": "thresholds"
              },
              "custom": {
                "axisBorderShow": false,
                "axisColorMode": "text",
                "axisLabel": "",
                "axisPlacement": "auto",
                "barAlignment": 0,
                "displayMode": "list",
                "filterable": false,
                "footer": {
                  "countRows": false,
                  "fields": "",
                  "reducer": ["sum"],
                  "show": false
                },
                "frameIndex": 0,
                "showHeader": true
              },
              "mappings": [],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "green",
                    "value": null
                  },
                  {
                    "color": "yellow",
                    "value": 85
                  },
                  {
                    "color": "red",
                    "value": 95
                  }
                ]
              },
              "unit": "percent"
            },
            "overrides": []
          },
          "gridPos": {
            "h": 8,
            "w": 12,
            "x": 12,
            "y": 8
          },
          "id": 6,
          "options": {
            "displayMode": "basic",
            "maxVizHeight": 300,
            "minVizHeight": 75,
            "namePlacement": "auto",
            "orientation": "horizontal",
            "reduceOptions": {
              "calcs": ["lastNotNull"],
              "fields": "",
              "values": false
            },
            "showUnfilled": true,
            "sizing": "auto",
            "valueMode": "color"
          },
          "pluginVersion": "10.0.0",
          "targets": [
            {
              "datasource": {
                "type": "prometheus"
              },
              "editorMode": "code",
              "expr": "disk_utilization_percent",
              "instant": false,
              "legendFormat": "{{node}} {{device}}",
              "range": true,
              "refId": "A"
            }
          ],
          "title": "🗄️ Storage Usage (NVR Critical)",
          "type": "bargauge"
        }
      ],
      "refresh": "30s",
      "schemaVersion": 37,
      "style": "dark",
      "tags": ["scrypted", "nvr", "telemetry", "life-safety"],
      "templating": {
        "list": []
      },
      "time": {
        "from": "now-1h",
        "to": "now"
      },
      "timepicker": {},
      "timezone": "",
      "title": "🛡️ Scrypted NVR - Life Safety Monitoring",
      "uid": "scrypted-telemetry",
      "version": 1,
      "weekStart": ""
    };
  }

  /**
   * Stop standalone metrics server
   */
  private stopMetricsServer() {
    if (this.metricsServer) {
      this.metricsServer.close(() => {
        this.console.log('Standalone metrics server stopped');
      });
      this.metricsServer = undefined;
    }
  }

  // Cleanup on plugin shutdown
  async destroy() {
    this.stopCollection();
    this.stopMetricsServer();
    
    // Notify cluster that this node is going offline
    if (this.storageSettings.values.enableClusterSharing) {
      try {
        const message: ClusterMetricsMessage = {
          type: 'node_offline',
          nodeId: this.nodeId,
          timestamp: Date.now(),
          data: null
        };
        
        sdk.deviceManager.onDeviceEvent(this.nativeId, 'TelemetryUpdated', message);
      } catch (error) {
        this.console.error('Error notifying cluster of shutdown:', error);
      }
    }
    
    this.console.log('Telemetry plugin destroyed');
  }
}

// Auto-discovery for the plugin
(async () => {
  await sdk.deviceManager.onDeviceDiscovered({
    name: 'Telemetry Monitor',
    nativeId: 'telemetry',
    interfaces: [
      ScryptedInterface.Settings,
      ScryptedInterface.HttpRequestHandler,
      ScryptedInterface.DeviceProvider
    ],
    type: ScryptedDeviceType.API
  });
})();