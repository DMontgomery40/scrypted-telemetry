import * as si from 'systeminformation';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';
import fetch from 'node-fetch';
import { 
  HardwareMetrics, 
  TelemetryConfig, 
  PlatformCapabilities, 
  HealthStatus, 
  ServiceHealth, 
  ExternalEndpoint,
  CPUMetrics,
  MemoryMetrics,
  StorageMetrics,
  NetworkMetrics,
  GPUMetrics,
  IntelNPUMetrics,
  TelemetryError
} from './types';
import { MacMonitor } from './mac-monitor';
import { IntelMonitor } from './intel-monitor';

/**
 * MetricsCollector orchestrates the collection of metrics from multiple sources
 */
export class MetricsCollector {
  private config: TelemetryConfig;
  private console: Console;
  private capabilities: PlatformCapabilities;
  private macMonitor?: MacMonitor;
  private intelMonitor?: IntelMonitor;
  private lastErrors: TelemetryError[] = [];
  private serviceHealth: Map<string, ServiceHealth> = new Map();

  constructor(config: TelemetryConfig, console: Console) {
    this.config = config;
    this.console = console;
    this.capabilities = this.detectPlatformCapabilities();
    
    // Initialize platform-specific monitors
    this.initializePlatformMonitors();
    
    this.console.log('MetricsCollector initialized with capabilities:', this.capabilities);
  }

  /**
   * Update configuration
   */
  updateConfig(config: TelemetryConfig) {
    this.config = config;
    
    // Reinitialize monitors if needed
    this.initializePlatformMonitors();
  }

  /**
   * Detect platform capabilities
   */
  private detectPlatformCapabilities(): PlatformCapabilities {
    const platform = os.platform();
    const arch = os.arch();
    
    return {
      hasIntelGPU: this.checkIntelGPU(),
      hasIntelNPU: this.checkIntelNPU(),
      hasNvidiaGPU: this.checkNvidiaGPU(),
      hasAMDGPU: this.checkAMDGPU(),
      isAppleSilicon: platform === 'darwin' && arch === 'arm64',
      isMacOS: platform === 'darwin',
      isLinux: platform === 'linux',
      isWindows: platform === 'win32'
    };
  }

  /**
   * Check for Intel GPU
   */
  private checkIntelGPU(): boolean {
    try {
      // Check for DRI devices (Linux)
      if (os.platform() === 'linux') {
        try {
          const driPath = '/dev/dri';
          const entries = require('fs').readdirSync(driPath);
          return entries.length > 0;
        } catch {
          return false;
        }
      }
      
      // Check for Intel GPU on other platforms
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Check for Intel NPU
   */
  private checkIntelNPU(): boolean {
    if (os.platform() !== 'linux') {
      return false;
    }

    const npuPaths = [
      '/sys/devices/pci0000:00/0000:00:0b.0/accel/accel0/npu_busy_time_us',
      '/sys/class/accel/accel0/npu_busy_time_us',
      '/sys/devices/platform/intel_vpu/accel/accel0/npu_busy_time_us'
    ];

    for (const npuPath of npuPaths) {
      try {
        require('fs').accessSync(npuPath, require('fs').constants.R_OK);
        return true;
      } catch {
        // Continue checking other paths
      }
    }

    return false;
  }

  /**
   * Check for NVIDIA GPU
   */
  private checkNvidiaGPU(): boolean {
    try {
      const { execSync } = require('child_process');
      execSync('nvidia-smi', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check for AMD GPU
   */
  private checkAMDGPU(): boolean {
    try {
      // Check for AMD GPU on Linux
      if (os.platform() === 'linux') {
        const { execSync } = require('child_process');
        try {
          execSync('rocm-smi', { stdio: 'ignore' });
          return true;
        } catch {
          // Try alternative check
          try {
            const lspciOutput = execSync('lspci | grep VGA', { encoding: 'utf8' });
            return lspciOutput.toLowerCase().includes('amd');
          } catch {
            return false;
          }
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Initialize platform-specific monitors
   */
  private initializePlatformMonitors() {
    // Initialize macOS monitor
    if (this.capabilities.isMacOS && this.config.enableMacmonIntegration) {
      if (!this.macMonitor) {
        this.macMonitor = new MacMonitor(this.console);
      }
    }

    // Initialize Intel monitor
    if ((this.capabilities.hasIntelGPU || this.capabilities.hasIntelNPU) && this.capabilities.isLinux) {
      if (!this.intelMonitor) {
        this.intelMonitor = new IntelMonitor(this.console);
      }
    }
  }

  /**
   * Collect all metrics
   */
  async collectMetrics(): Promise<HardwareMetrics | undefined> {
    try {
      const startTime = Date.now();
      
      // Collect basic system metrics
      const [cpu, memory, storage, network] = await Promise.all([
        this.collectCPUMetrics(),
        this.collectMemoryMetrics(), 
        this.collectStorageMetrics(),
        this.collectNetworkMetrics()
      ]);

      const baseMetrics: HardwareMetrics = {
        nodeId: '', // Will be set by main plugin
        timestamp: Date.now(),
        platform: os.platform(),
        hostname: os.hostname(),
        cpu,
        memory,
        storage,
        network
      };

      // Collect external metrics
      const externalMetrics = await this.collectExternalMetrics();
      
      // Merge external GPU metrics
      if (externalMetrics.gpu && externalMetrics.gpu.length > 0) {
        baseMetrics.gpu = externalMetrics.gpu;
      }
      
      // Add Intel NPU metrics
      if (externalMetrics.intelNpu) {
        baseMetrics.intelNpu = externalMetrics.intelNpu;
      }

      // Collect platform-specific metrics
      if (this.capabilities.isMacOS && this.macMonitor) {
        try {
          const appleMetrics = await this.macMonitor.collectMetrics();
          if (appleMetrics) {
            baseMetrics.appleMetrics = appleMetrics;
          }
        } catch (error) {
          this.console.warn('Failed to collect Apple metrics:', error);
          this.recordError('macmon', error as Error, true);
        }
      }

      // Add Intel-specific metrics from sysfs
      if (this.capabilities.isLinux && this.intelMonitor) {
        try {
          const intelNpuMetrics = await this.intelMonitor.collectNPUMetrics();
          if (intelNpuMetrics) {
            // Merge with external NPU metrics or use as fallback
            baseMetrics.intelNpu = intelNpuMetrics;
          }
        } catch (error) {
          this.console.warn('Failed to collect Intel NPU metrics:', error);
          this.recordError('intel-npu-sysfs', error as Error, true);
        }
      }

      const collectionTime = Date.now() - startTime;
      this.console.log(`Metrics collection completed in ${collectionTime}ms`);
      
      return baseMetrics;

    } catch (error) {
      this.console.error('Error during metrics collection:', error);
      this.recordError('metrics-collector', error as Error, true);
      return undefined;
    }
  }

  /**
   * Collect CPU metrics
   */
  private async collectCPUMetrics(): Promise<CPUMetrics> {
    try {
      const [cpuData, cpuTemp, cpuSpeed] = await Promise.all([
        si.currentLoad(),
        si.cpuTemperature(),
        si.cpuCurrentSpeed()
      ]);

      const cores = cpuData.cpus?.map((core, index) => ({
        id: index,
        utilization: Math.round(core.load * 100) / 100,
        frequency: cpuSpeed.cores?.[index] || cpuSpeed.avg,
        temperature: cpuTemp.cores?.[index] || undefined
      })) || [];

      return {
        utilization: Math.round(cpuData.currentLoad * 100) / 100,
        frequency: cpuSpeed.avg,
        temperature: cpuTemp.main || 0,
        cores
      };

    } catch (error) {
      this.console.error('Error collecting CPU metrics:', error);
      throw error;
    }
  }

  /**
   * Collect memory metrics
   */
  private async collectMemoryMetrics(): Promise<MemoryMetrics> {
    try {
      const memData = await si.mem();
      
      return {
        used: memData.used,
        total: memData.total,
        available: memData.available,
        percent: Math.round((memData.used / memData.total) * 10000) / 100,
        swapUsed: memData.swapused,
        swapTotal: memData.swaptotal
      };

    } catch (error) {
      this.console.error('Error collecting memory metrics:', error);
      throw error;
    }
  }

  /**
   * Collect storage metrics
   */
  private async collectStorageMetrics(): Promise<StorageMetrics[]> {
    try {
      const [fsData, ioData] = await Promise.all([
        si.fsSize(),
        si.disksIO()
      ]);

      return fsData.map(fs => ({
        device: fs.fs,
        mountPoint: fs.mount,
        used: fs.used,
        total: fs.size,
        percent: Math.round(fs.use * 100) / 100,
        readRate: ioData.rIO_sec || 0,
        writeRate: ioData.wIO_sec || 0
      }));

    } catch (error) {
      this.console.error('Error collecting storage metrics:', error);
      return [];
    }
  }

  /**
   * Collect network metrics
   */
  private async collectNetworkMetrics(): Promise<NetworkMetrics[]> {
    try {
      const [interfaces, stats] = await Promise.all([
        si.networkInterfaces(),
        si.networkStats()
      ]);

      const networkMetrics: NetworkMetrics[] = [];

      for (const iface of interfaces) {
        if (iface.internal) continue;

        const stat = stats.find(s => s.iface === iface.iface);
        
        networkMetrics.push({
          interface: iface.iface,
          bytesReceived: stat?.rx_bytes || 0,
          bytesTransmitted: stat?.tx_bytes || 0,
          packetsReceived: (stat as any)?.rx_packets || 0,
          packetsTransmitted: (stat as any)?.tx_packets || 0,
          receiveRate: stat?.rx_sec || 0,
          transmitRate: stat?.tx_sec || 0,
          errors: stat?.rx_errors || 0,
          drops: stat?.rx_dropped || 0
        });
      }

      return networkMetrics;

    } catch (error) {
      this.console.error('Error collecting network metrics:', error);
      return [];
    }
  }

  /**
   * Collect metrics from external exporters
   */
  private async collectExternalMetrics(): Promise<{
    gpu?: GPUMetrics[];
    intelNpu?: IntelNPUMetrics;
  }> {
    const results: {
      gpu?: GPUMetrics[];
      intelNpu?: IntelNPUMetrics;
    } = {};

    const promises = this.config.externalEndpoints
      .filter(endpoint => endpoint.enabled)
      .map(endpoint => this.scrapeExternalEndpoint(endpoint));

    const responses = await Promise.allSettled(promises);
    
    for (let i = 0; i < responses.length; i++) {
      const response = responses[i];
      const endpoint = this.config.externalEndpoints.filter(e => e.enabled)[i];
      
      if (response.status === 'fulfilled' && response.value) {
        // Parse Prometheus metrics based on endpoint type
        const metrics = this.parsePrometheusMetrics(response.value, endpoint.name);
        
        if (endpoint.name.toLowerCase().includes('gpu')) {
          if (!results.gpu) results.gpu = [];
          const gpuMetrics = this.parseGPUMetrics(metrics, endpoint.name);
          if (gpuMetrics) {
            results.gpu.push(gpuMetrics);
          }
        } else if (endpoint.name.toLowerCase().includes('npu')) {
          const npuMetrics = this.parseNPUMetrics(metrics);
          if (npuMetrics) {
            results.intelNpu = npuMetrics;
          }
        }
      } else if (response.status === 'rejected') {
        this.recordError(endpoint.name, response.reason, true);
      }
    }

    return results;
  }

  /**
   * Scrape external Prometheus endpoint
   */
  private async scrapeExternalEndpoint(endpoint: ExternalEndpoint): Promise<string | undefined> {
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), endpoint.timeout);

      const response = await fetch(endpoint.url, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/plain'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      const responseTime = Date.now() - startTime;

      // Update service health
      this.updateServiceHealth(endpoint.name, endpoint.url, true, responseTime);
      
      return text;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateServiceHealth(endpoint.name, endpoint.url, false, responseTime, (error as Error).message);
      throw error;
    }
  }

  /**
   * Parse Prometheus metrics format
   */
  private parsePrometheusMetrics(text: string, source: string): Map<string, number> {
    const metrics = new Map<string, number>();
    const lines = text.split('\n');

    for (const line of lines) {
      // Skip comments and empty lines
      if (line.startsWith('#') || line.trim() === '') {
        continue;
      }

      // Parse metric line: metric_name{labels} value [timestamp]
      const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\{?([^}]*)\}?\s+([^\s]+)/);
      if (match) {
        const [, metricName, labels, value] = match;
        const numericValue = parseFloat(value);
        
        if (!isNaN(numericValue)) {
          const key = labels ? `${metricName}{${labels}}` : metricName;
          metrics.set(key, numericValue);
        }
      }
    }

    this.console.log(`Parsed ${metrics.size} metrics from ${source}`);
    return metrics;
  }

  /**
   * Parse GPU metrics from Prometheus data
   */
  private parseGPUMetrics(metrics: Map<string, number>, source: string): GPUMetrics | undefined {
    try {
      let vendor: 'intel' | 'nvidia' | 'amd' | 'apple' = 'intel';
      
      if (source.toLowerCase().includes('nvidia') || source.toLowerCase().includes('dcgm')) {
        vendor = 'nvidia';
      } else if (source.toLowerCase().includes('amd')) {
        vendor = 'amd';
      } else if (source.toLowerCase().includes('apple')) {
        vendor = 'apple';
      }

      // Extract GPU metrics based on vendor
      if (vendor === 'nvidia') {
        return this.parseNVIDIAGPUMetrics(metrics);
      } else if (vendor === 'intel') {
        return this.parseIntelGPUMetrics(metrics);
      }

      return undefined;
    } catch (error) {
      this.console.error(`Error parsing GPU metrics from ${source}:`, error);
      return undefined;
    }
  }

  /**
   * Parse NVIDIA GPU metrics
   */
  private parseNVIDIAGPUMetrics(metrics: Map<string, number>): GPUMetrics | undefined {
    try {
      // Find first GPU (gpu="0")
      const gpuId = '0';
      
      const utilization = this.findMetricValue(metrics, 'DCGM_FI_DEV_GPU_UTIL', { gpu: gpuId }) || 0;
      const memoryUsed = this.findMetricValue(metrics, 'DCGM_FI_DEV_FB_USED', { gpu: gpuId }) || 0;
      const memoryTotal = this.findMetricValue(metrics, 'DCGM_FI_DEV_FB_TOTAL', { gpu: gpuId }) || 0;
      const temperature = this.findMetricValue(metrics, 'DCGM_FI_DEV_GPU_TEMP', { gpu: gpuId }) || 0;
      const powerUsage = this.findMetricValue(metrics, 'DCGM_FI_DEV_POWER_USAGE', { gpu: gpuId }) || 0;
      const frequency = this.findMetricValue(metrics, 'DCGM_FI_DEV_SM_CLOCK', { gpu: gpuId }) || 0;

      return {
        id: gpuId,
        name: 'NVIDIA GPU',
        vendor: 'nvidia',
        utilization,
        memoryUsed: memoryUsed * 1024 * 1024, // Convert MB to bytes
        memoryTotal: memoryTotal * 1024 * 1024, // Convert MB to bytes
        memoryUtilization: memoryTotal > 0 ? (memoryUsed / memoryTotal) * 100 : 0,
        frequency,
        temperature,
        powerUsage
      };
    } catch (error) {
      this.console.error('Error parsing NVIDIA GPU metrics:', error);
      return undefined;
    }
  }

  /**
   * Parse Intel GPU metrics
   */
  private parseIntelGPUMetrics(metrics: Map<string, number>): GPUMetrics | undefined {
    try {
      const utilization = this.findMetricValue(metrics, 'intel_gpu_utilization_percent') || 0;
      const memoryUsed = this.findMetricValue(metrics, 'intel_gpu_memory_used_bytes') || 0;
      const memoryTotal = this.findMetricValue(metrics, 'intel_gpu_memory_total_bytes') || 0;
      const frequency = this.findMetricValue(metrics, 'intel_gpu_frequency_mhz') || 0;

      const engines = {
        render: this.findMetricValue(metrics, 'intel_gpu_utilization_percent', { engine: 'render' }),
        media: this.findMetricValue(metrics, 'intel_gpu_utilization_percent', { engine: 'media' }),
        compute: this.findMetricValue(metrics, 'intel_gpu_utilization_percent', { engine: 'compute' }),
        copy: this.findMetricValue(metrics, 'intel_gpu_utilization_percent', { engine: 'copy' })
      };

      return {
        id: '0',
        name: 'Intel GPU',
        vendor: 'intel',
        utilization,
        memoryUsed,
        memoryTotal,
        memoryUtilization: memoryTotal > 0 ? (memoryUsed / memoryTotal) * 100 : 0,
        frequency,
        temperature: 0,
        powerUsage: 0,
        engines
      };
    } catch (error) {
      this.console.error('Error parsing Intel GPU metrics:', error);
      return undefined;
    }
  }

  /**
   * Parse NPU metrics from Prometheus data
   */
  private parseNPUMetrics(metrics: Map<string, number>): IntelNPUMetrics | undefined {
    try {
      const utilization = this.findMetricValue(metrics, 'intel_npu_utilization_percent') || 0;
      const busyTime = this.findMetricValue(metrics, 'intel_npu_busy_time_us_total') || 0;
      const power = this.findMetricValue(metrics, 'intel_npu_power_watts') || 0;

      return {
        utilization,
        busyTime,
        power
      };
    } catch (error) {
      this.console.error('Error parsing NPU metrics:', error);
      return undefined;
    }
  }

  /**
   * Find metric value with optional label matching
   */
  private findMetricValue(metrics: Map<string, number>, metricName: string, labels?: Record<string, string>): number | undefined {
    if (!labels) {
      return metrics.get(metricName);
    }

    for (const [key, value] of metrics.entries()) {
      if (key.startsWith(metricName + '{')) {
        // Check if all required labels match
        const allMatch = Object.entries(labels).every(([labelKey, labelValue]) => {
          const regex = new RegExp(`${labelKey}="([^"]+)"`);
          const match = key.match(regex);
          return match && match[1] === labelValue;
        });

        if (allMatch) {
          return value;
        }
      }
    }

    return undefined;
  }

  /**
   * Update service health status
   */
  private updateServiceHealth(name: string, url: string, healthy: boolean, responseTime: number, error?: string) {
    this.serviceHealth.set(name, {
      name,
      url,
      healthy,
      lastCheck: Date.now(),
      responseTime,
      error
    });
  }

  /**
   * Record error
   */
  private recordError(source: string, error: Error, retryable: boolean) {
    const telemetryError: TelemetryError = {
      source,
      message: error.message,
      timestamp: Date.now(),
      retryable
    };

    this.lastErrors.push(telemetryError);
    
    // Keep only last 10 errors
    if (this.lastErrors.length > 10) {
      this.lastErrors.shift();
    }
  }

  /**
   * Get health status
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const services = Array.from(this.serviceHealth.values());
    const healthy = services.length === 0 || services.every(s => s.healthy);

    return {
      healthy,
      services,
      lastUpdate: Date.now()
    };
  }

  /**
   * Get platform capabilities
   */
  getPlatformCapabilities(): PlatformCapabilities {
    return this.capabilities;
  }

  /**
   * Get recent errors
   */
  getRecentErrors(): TelemetryError[] {
    return [...this.lastErrors];
  }
}