/**
 * Comprehensive telemetry types for hardware monitoring across platforms
 */

export interface HardwareMetrics {
  nodeId: string;
  timestamp: number;
  platform: string;
  hostname: string;
  
  // Core system metrics
  cpu: CPUMetrics;
  memory: MemoryMetrics;
  storage: StorageMetrics[];
  network: NetworkMetrics[];
  
  // GPU metrics (Intel/NVIDIA)
  gpu?: GPUMetrics[];
  
  // Intel NPU metrics
  intelNpu?: IntelNPUMetrics;
  
  // Apple Silicon specific metrics
  appleMetrics?: AppleMetrics;
  
  // Power consumption metrics
  power?: PowerMetrics;
  
  // Thermal metrics
  thermal?: ThermalMetrics;
}

export interface CPUMetrics {
  utilization: number; // Overall CPU utilization percentage
  frequency: number; // Current frequency in MHz
  temperature: number; // Temperature in Celsius
  cores: CPUCoreMetrics[];
}

export interface CPUCoreMetrics {
  id: number;
  utilization: number; // Core utilization percentage
  frequency: number; // Core frequency in MHz
  temperature?: number; // Per-core temperature if available
}

export interface MemoryMetrics {
  used: number; // Used memory in bytes
  total: number; // Total memory in bytes
  available: number; // Available memory in bytes
  percent: number; // Memory utilization percentage
  swapUsed?: number; // Swap usage in bytes
  swapTotal?: number; // Total swap in bytes
}

export interface StorageMetrics {
  device: string; // Device identifier (e.g., /dev/sda1)
  mountPoint: string; // Mount point (e.g., /)
  used: number; // Used space in bytes
  total: number; // Total space in bytes
  percent: number; // Usage percentage
  readRate: number; // Read rate in bytes/second
  writeRate: number; // Write rate in bytes/second
}

export interface NetworkMetrics {
  interface: string; // Interface name (e.g., eth0)
  bytesReceived: number; // Total bytes received
  bytesTransmitted: number; // Total bytes transmitted
  packetsReceived: number; // Total packets received
  packetsTransmitted: number; // Total packets transmitted
  receiveRate: number; // Current receive rate in bytes/second
  transmitRate: number; // Current transmit rate in bytes/second
  errors: number; // Total errors
  drops: number; // Total drops
}

export interface GPUMetrics {
  id: string; // GPU identifier
  name: string; // GPU name/model
  vendor: 'intel' | 'nvidia' | 'amd' | 'apple';
  utilization: number; // GPU utilization percentage
  memoryUsed: number; // GPU memory used in bytes
  memoryTotal: number; // GPU memory total in bytes
  memoryUtilization: number; // GPU memory utilization percentage
  frequency: number; // GPU frequency in MHz
  temperature: number; // GPU temperature in Celsius
  powerUsage: number; // Power usage in watts
  fanSpeed?: number; // Fan speed percentage
  
  // Engine-specific utilization for Intel GPUs
  engines?: {
    render?: number;
    media?: number;
    compute?: number;
    copy?: number;
  };
}

export interface IntelNPUMetrics {
  utilization: number; // NPU utilization percentage
  busyTime: number; // Total busy time in microseconds
  power: number; // Power consumption in watts
  frequency?: number; // Operating frequency if available
  temperature?: number; // Temperature if available
}

export interface AppleMetrics {
  // Apple Neural Engine metrics
  ane?: {
    utilization: number; // ANE utilization percentage
    power: number; // ANE power consumption in watts
  };
  
  // Apple CPU metrics (P/E cores)
  cpu?: {
    pcpu: AppleCPUCore[]; // Performance cores
    ecpu: AppleCPUCore[]; // Efficiency cores
  };
  
  // Apple GPU metrics
  gpu?: {
    utilization: number; // GPU utilization percentage
    frequency: number; // GPU frequency in MHz
    power: number; // GPU power in watts
  };
}

export interface AppleCPUCore {
  id: number;
  utilization: number; // Core utilization percentage
  frequency: number; // Core frequency in MHz
  power?: number; // Core power if available
}

export interface PowerMetrics {
  total: number; // Total system power in watts
  cpu: number; // CPU power consumption in watts
  gpu?: number; // GPU power consumption in watts
  ram?: number; // RAM power consumption in watts
  storage?: number; // Storage power consumption in watts
}

export interface ThermalMetrics {
  cpu: number; // CPU temperature in Celsius
  gpu?: number; // GPU temperature in Celsius
  system?: number; // Overall system temperature
  zones?: ThermalZone[]; // Individual thermal zones
}

export interface ThermalZone {
  name: string;
  temperature: number; // Temperature in Celsius
  critical?: number; // Critical temperature threshold
  warning?: number; // Warning temperature threshold
}

// Prometheus metric formatting types
export interface PrometheusMetric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  help: string;
  labels: Record<string, string>;
  value: number;
  timestamp?: number;
}

export interface PrometheusOutput {
  metrics: PrometheusMetric[];
  timestamp: number;
}

// Configuration types
export interface TelemetryConfig {
  collectionInterval: number; // Collection interval in seconds
  enableClusterSharing: boolean; // Enable sharing with other Scrypted nodes
  prometheusEndpoint: string; // Prometheus endpoint path
  
  // External exporter endpoints
  externalEndpoints: ExternalEndpoint[];
  
  // Feature toggles
  enableLocalMetrics: boolean; // Collect basic system metrics
  enableMacmonIntegration: boolean; // Use native macmon on macOS
  
  // Connection settings
  connectionTimeout: number; // Timeout in milliseconds
  retryCount: number; // Number of retry attempts
}

export interface ExternalEndpoint {
  name: string; // Human-readable name
  url: string; // Endpoint URL
  enabled: boolean; // Whether this endpoint is enabled
  timeout: number; // Timeout for this endpoint
  labels?: Record<string, string>; // Additional labels to add
}

// Platform detection types
export interface PlatformCapabilities {
  hasIntelGPU: boolean;
  hasIntelNPU: boolean;
  hasNvidiaGPU: boolean;
  hasAMDGPU: boolean;
  isAppleSilicon: boolean;
  isMacOS: boolean;
  isLinux: boolean;
  isWindows: boolean;
}

// Error handling types
export interface TelemetryError {
  source: string; // Source of the error (e.g., 'intel-gpu-exporter')
  message: string; // Error message
  timestamp: number; // When the error occurred
  retryable: boolean; // Whether this error can be retried
}

// Cluster communication types
export interface ClusterMetricsMessage {
  type: 'metrics_update' | 'node_online' | 'node_offline';
  nodeId: string;
  timestamp: number;
  data: HardwareMetrics | null;
}

// Health check types
export interface HealthStatus {
  healthy: boolean;
  services: ServiceHealth[];
  lastUpdate: number;
}

export interface ServiceHealth {
  name: string; // Service name (e.g., 'intel-gpu-exporter')
  url: string; // Service URL
  healthy: boolean; // Whether service is healthy
  lastCheck: number; // Last health check timestamp
  responseTime: number; // Response time in milliseconds
  error?: string; // Error message if unhealthy
}

// Raw data types for external integrations
export interface MacmonOutput {
  timestamp: number;
  cpu_metrics: Array<{
    pcpu_usage: Array<[number, number]>; // [frequency, utilization] pairs
    ecpu_usage: Array<[number, number]>; // [frequency, utilization] pairs
  }>;
  gpu_metrics: {
    frequency: number;
    utilization: number;
  };
  ane_power: number;
}

export interface IntelGPUTopOutput {
  timestamp: number;
  engines: {
    render: number;
    media: number;
    compute: number;
    copy: number;
  };
  memory: {
    used: number;
    total: number;
  };
  frequency: number;
}

export interface DCGMMetric {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

// Utility types
export type MetricValue = number | string;
export type MetricLabels = Record<string, string>;

// Constants
export const DEFAULT_COLLECTION_INTERVAL = 15; // seconds
export const DEFAULT_CONNECTION_TIMEOUT = 10000; // milliseconds
export const DEFAULT_RETRY_COUNT = 3;
export const DEFAULT_PROMETHEUS_ENDPOINT = '/metrics';

// Metric name constants
export const METRIC_NAMES = {
  CPU_UTILIZATION: 'cpu_utilization_percent',
  CPU_FREQUENCY: 'cpu_frequency_mhz',
  CPU_TEMPERATURE: 'cpu_temperature_celsius',
  
  MEMORY_USED: 'memory_used_bytes',
  MEMORY_TOTAL: 'memory_total_bytes',
  MEMORY_UTILIZATION: 'memory_utilization_percent',
  
  GPU_UTILIZATION: 'gpu_utilization_percent',
  GPU_MEMORY_USED: 'gpu_memory_used_bytes',
  GPU_MEMORY_TOTAL: 'gpu_memory_total_bytes',
  GPU_TEMPERATURE: 'gpu_temperature_celsius',
  GPU_POWER: 'gpu_power_watts',
  
  INTEL_NPU_UTILIZATION: 'intel_npu_utilization_percent',
  INTEL_NPU_POWER: 'intel_npu_power_watts',
  
  ANE_UTILIZATION: 'ane_utilization_percent',
  ANE_POWER: 'ane_power_watts',
  
  NETWORK_BYTES_RX: 'network_bytes_received_total',
  NETWORK_BYTES_TX: 'network_bytes_transmitted_total',
  
  DISK_USED: 'disk_used_bytes',
  DISK_TOTAL: 'disk_total_bytes',
  DISK_UTILIZATION: 'disk_utilization_percent',
} as const;

// Label constants
export const LABEL_NAMES = {
  NODE: 'node',
  CORE: 'core',
  GPU: 'gpu',
  DEVICE: 'device',
  INTERFACE: 'interface',
  MOUNT_POINT: 'mount_point',
  ENGINE: 'engine',
} as const;