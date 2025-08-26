import { 
  HardwareMetrics, 
  PrometheusMetric, 
  METRIC_NAMES, 
  LABEL_NAMES 
} from './types';

/**
 * PrometheusFormatter converts hardware metrics to Prometheus format
 */
export class PrometheusFormatter {
  
  /**
   * Format hardware metrics for Prometheus
   */
  formatMetrics(allMetrics: HardwareMetrics[]): string {
    const prometheusMetrics: PrometheusMetric[] = [];
    
    // Process metrics from all nodes
    for (const nodeMetrics of allMetrics) {
      const nodePrometheusMetrics = this.convertNodeMetrics(nodeMetrics);
      prometheusMetrics.push(...nodePrometheusMetrics);
    }
    
    // Group metrics by name for proper formatting
    const metricGroups = this.groupMetricsByName(prometheusMetrics);
    
    // Generate Prometheus output
    return this.generatePrometheusOutput(metricGroups);
  }

  /**
   * Convert single node metrics to Prometheus metrics
   */
  private convertNodeMetrics(metrics: HardwareMetrics): PrometheusMetric[] {
    const prometheusMetrics: PrometheusMetric[] = [];
    const baseLabels = { [LABEL_NAMES.NODE]: metrics.nodeId };

    // CPU Metrics
    prometheusMetrics.push({
      name: METRIC_NAMES.CPU_UTILIZATION,
      type: 'gauge',
      help: 'CPU utilization percentage',
      labels: baseLabels,
      value: metrics.cpu.utilization,
      timestamp: metrics.timestamp
    });

    prometheusMetrics.push({
      name: METRIC_NAMES.CPU_FREQUENCY,
      type: 'gauge',
      help: 'CPU frequency in MHz',
      labels: baseLabels,
      value: metrics.cpu.frequency,
      timestamp: metrics.timestamp
    });

    prometheusMetrics.push({
      name: METRIC_NAMES.CPU_TEMPERATURE,
      type: 'gauge',
      help: 'CPU temperature in Celsius',
      labels: baseLabels,
      value: metrics.cpu.temperature,
      timestamp: metrics.timestamp
    });

    // Per-core CPU metrics
    for (const core of metrics.cpu.cores) {
      prometheusMetrics.push({
        name: METRIC_NAMES.CPU_UTILIZATION,
        type: 'gauge',
        help: 'CPU utilization percentage per core',
        labels: { ...baseLabels, [LABEL_NAMES.CORE]: core.id.toString() },
        value: core.utilization,
        timestamp: metrics.timestamp
      });

      prometheusMetrics.push({
        name: METRIC_NAMES.CPU_FREQUENCY,
        type: 'gauge', 
        help: 'CPU frequency in MHz per core',
        labels: { ...baseLabels, [LABEL_NAMES.CORE]: core.id.toString() },
        value: core.frequency,
        timestamp: metrics.timestamp
      });

      if (core.temperature !== undefined) {
        prometheusMetrics.push({
          name: METRIC_NAMES.CPU_TEMPERATURE,
          type: 'gauge',
          help: 'CPU temperature in Celsius per core',
          labels: { ...baseLabels, [LABEL_NAMES.CORE]: core.id.toString() },
          value: core.temperature,
          timestamp: metrics.timestamp
        });
      }
    }

    // Memory Metrics
    prometheusMetrics.push({
      name: METRIC_NAMES.MEMORY_USED,
      type: 'gauge',
      help: 'Memory used in bytes',
      labels: baseLabels,
      value: metrics.memory.used,
      timestamp: metrics.timestamp
    });

    prometheusMetrics.push({
      name: METRIC_NAMES.MEMORY_TOTAL,
      type: 'gauge',
      help: 'Total memory in bytes',
      labels: baseLabels,
      value: metrics.memory.total,
      timestamp: metrics.timestamp
    });

    prometheusMetrics.push({
      name: METRIC_NAMES.MEMORY_UTILIZATION,
      type: 'gauge',
      help: 'Memory utilization percentage',
      labels: baseLabels,
      value: metrics.memory.percent,
      timestamp: metrics.timestamp
    });

    // Storage Metrics
    for (const storage of metrics.storage) {
      const storageLabels = { 
        ...baseLabels, 
        [LABEL_NAMES.DEVICE]: storage.device,
        [LABEL_NAMES.MOUNT_POINT]: storage.mountPoint
      };

      prometheusMetrics.push({
        name: METRIC_NAMES.DISK_USED,
        type: 'gauge',
        help: 'Disk used space in bytes',
        labels: storageLabels,
        value: storage.used,
        timestamp: metrics.timestamp
      });

      prometheusMetrics.push({
        name: METRIC_NAMES.DISK_TOTAL,
        type: 'gauge',
        help: 'Total disk space in bytes',
        labels: storageLabels,
        value: storage.total,
        timestamp: metrics.timestamp
      });

      prometheusMetrics.push({
        name: METRIC_NAMES.DISK_UTILIZATION,
        type: 'gauge',
        help: 'Disk utilization percentage',
        labels: storageLabels,
        value: storage.percent,
        timestamp: metrics.timestamp
      });
    }

    // Network Metrics
    for (const network of metrics.network) {
      const networkLabels = { 
        ...baseLabels, 
        [LABEL_NAMES.INTERFACE]: network.interface 
      };

      prometheusMetrics.push({
        name: METRIC_NAMES.NETWORK_BYTES_RX,
        type: 'counter',
        help: 'Total bytes received',
        labels: networkLabels,
        value: network.bytesReceived,
        timestamp: metrics.timestamp
      });

      prometheusMetrics.push({
        name: METRIC_NAMES.NETWORK_BYTES_TX,
        type: 'counter',
        help: 'Total bytes transmitted',
        labels: networkLabels,
        value: network.bytesTransmitted,
        timestamp: metrics.timestamp
      });

      prometheusMetrics.push({
        name: 'network_packets_received_total',
        type: 'counter',
        help: 'Total packets received',
        labels: networkLabels,
        value: network.packetsReceived,
        timestamp: metrics.timestamp
      });

      prometheusMetrics.push({
        name: 'network_packets_transmitted_total',
        type: 'counter',
        help: 'Total packets transmitted',
        labels: networkLabels,
        value: network.packetsTransmitted,
        timestamp: metrics.timestamp
      });
    }

    // GPU Metrics
    if (metrics.gpu) {
      for (const gpu of metrics.gpu) {
        const gpuLabels = { 
          ...baseLabels, 
          [LABEL_NAMES.GPU]: gpu.id,
          vendor: gpu.vendor,
          name: gpu.name.replace(/[^a-zA-Z0-9_]/g, '_')
        };

        prometheusMetrics.push({
          name: METRIC_NAMES.GPU_UTILIZATION,
          type: 'gauge',
          help: 'GPU utilization percentage',
          labels: gpuLabels,
          value: gpu.utilization,
          timestamp: metrics.timestamp
        });

        prometheusMetrics.push({
          name: METRIC_NAMES.GPU_MEMORY_USED,
          type: 'gauge',
          help: 'GPU memory used in bytes',
          labels: gpuLabels,
          value: gpu.memoryUsed,
          timestamp: metrics.timestamp
        });

        prometheusMetrics.push({
          name: METRIC_NAMES.GPU_MEMORY_TOTAL,
          type: 'gauge',
          help: 'GPU memory total in bytes',
          labels: gpuLabels,
          value: gpu.memoryTotal,
          timestamp: metrics.timestamp
        });

        prometheusMetrics.push({
          name: METRIC_NAMES.GPU_TEMPERATURE,
          type: 'gauge',
          help: 'GPU temperature in Celsius',
          labels: gpuLabels,
          value: gpu.temperature,
          timestamp: metrics.timestamp
        });

        prometheusMetrics.push({
          name: METRIC_NAMES.GPU_POWER,
          type: 'gauge',
          help: 'GPU power consumption in watts',
          labels: gpuLabels,
          value: gpu.powerUsage,
          timestamp: metrics.timestamp
        });

        prometheusMetrics.push({
          name: 'gpu_frequency_mhz',
          type: 'gauge',
          help: 'GPU frequency in MHz',
          labels: gpuLabels,
          value: gpu.frequency,
          timestamp: metrics.timestamp
        });

        // Intel GPU engine metrics
        if (gpu.engines) {
          for (const [engine, utilization] of Object.entries(gpu.engines)) {
            if (utilization !== undefined) {
              prometheusMetrics.push({
                name: 'intel_gpu_engine_utilization_percent',
                type: 'gauge',
                help: 'Intel GPU engine utilization percentage',
                labels: { ...gpuLabels, [LABEL_NAMES.ENGINE]: engine },
                value: utilization,
                timestamp: metrics.timestamp
              });
            }
          }
        }
      }
    }

    // Intel NPU Metrics
    if (metrics.intelNpu) {
      prometheusMetrics.push({
        name: METRIC_NAMES.INTEL_NPU_UTILIZATION,
        type: 'gauge',
        help: 'Intel NPU utilization percentage',
        labels: baseLabels,
        value: metrics.intelNpu.utilization,
        timestamp: metrics.timestamp
      });

      prometheusMetrics.push({
        name: 'intel_npu_busy_time_us_total',
        type: 'counter',
        help: 'Intel NPU total busy time in microseconds',
        labels: baseLabels,
        value: metrics.intelNpu.busyTime,
        timestamp: metrics.timestamp
      });

      prometheusMetrics.push({
        name: METRIC_NAMES.INTEL_NPU_POWER,
        type: 'gauge',
        help: 'Intel NPU power consumption in watts',
        labels: baseLabels,
        value: metrics.intelNpu.power,
        timestamp: metrics.timestamp
      });

      if (metrics.intelNpu.frequency !== undefined) {
        prometheusMetrics.push({
          name: 'intel_npu_frequency_mhz',
          type: 'gauge',
          help: 'Intel NPU frequency in MHz',
          labels: baseLabels,
          value: metrics.intelNpu.frequency,
          timestamp: metrics.timestamp
        });
      }
    }

    // Apple Metrics
    if (metrics.appleMetrics) {
      // Apple Neural Engine
      if (metrics.appleMetrics.ane) {
        prometheusMetrics.push({
          name: METRIC_NAMES.ANE_UTILIZATION,
          type: 'gauge',
          help: 'Apple Neural Engine utilization percentage',
          labels: baseLabels,
          value: metrics.appleMetrics.ane.utilization,
          timestamp: metrics.timestamp
        });

        prometheusMetrics.push({
          name: METRIC_NAMES.ANE_POWER,
          type: 'gauge',
          help: 'Apple Neural Engine power consumption in watts',
          labels: baseLabels,
          value: metrics.appleMetrics.ane.power,
          timestamp: metrics.timestamp
        });
      }

      // Apple CPU (P/E cores)
      if (metrics.appleMetrics.cpu) {
        // Performance cores
        for (const core of metrics.appleMetrics.cpu.pcpu) {
          prometheusMetrics.push({
            name: 'apple_pcpu_utilization_percent',
            type: 'gauge',
            help: 'Apple performance core utilization percentage',
            labels: { ...baseLabels, [LABEL_NAMES.CORE]: core.id.toString(), core_type: 'performance' },
            value: core.utilization,
            timestamp: metrics.timestamp
          });

          prometheusMetrics.push({
            name: 'apple_pcpu_frequency_mhz',
            type: 'gauge',
            help: 'Apple performance core frequency in MHz',
            labels: { ...baseLabels, [LABEL_NAMES.CORE]: core.id.toString(), core_type: 'performance' },
            value: core.frequency,
            timestamp: metrics.timestamp
          });
        }

        // Efficiency cores
        for (const core of metrics.appleMetrics.cpu.ecpu) {
          prometheusMetrics.push({
            name: 'apple_ecpu_utilization_percent',
            type: 'gauge',
            help: 'Apple efficiency core utilization percentage',
            labels: { ...baseLabels, [LABEL_NAMES.CORE]: core.id.toString(), core_type: 'efficiency' },
            value: core.utilization,
            timestamp: metrics.timestamp
          });

          prometheusMetrics.push({
            name: 'apple_ecpu_frequency_mhz',
            type: 'gauge',
            help: 'Apple efficiency core frequency in MHz',
            labels: { ...baseLabels, [LABEL_NAMES.CORE]: core.id.toString(), core_type: 'efficiency' },
            value: core.frequency,
            timestamp: metrics.timestamp
          });
        }
      }

      // Apple GPU
      if (metrics.appleMetrics.gpu) {
        prometheusMetrics.push({
          name: 'apple_gpu_utilization_percent',
          type: 'gauge',
          help: 'Apple GPU utilization percentage',
          labels: baseLabels,
          value: metrics.appleMetrics.gpu.utilization,
          timestamp: metrics.timestamp
        });

        prometheusMetrics.push({
          name: 'apple_gpu_frequency_mhz',
          type: 'gauge',
          help: 'Apple GPU frequency in MHz',
          labels: baseLabels,
          value: metrics.appleMetrics.gpu.frequency,
          timestamp: metrics.timestamp
        });

        prometheusMetrics.push({
          name: 'apple_gpu_power_watts',
          type: 'gauge',
          help: 'Apple GPU power consumption in watts',
          labels: baseLabels,
          value: metrics.appleMetrics.gpu.power,
          timestamp: metrics.timestamp
        });
      }
    }

    // Power Metrics
    if (metrics.power) {
      prometheusMetrics.push({
        name: 'power_total_watts',
        type: 'gauge',
        help: 'Total system power consumption in watts',
        labels: baseLabels,
        value: metrics.power.total,
        timestamp: metrics.timestamp
      });

      prometheusMetrics.push({
        name: 'power_cpu_watts',
        type: 'gauge',
        help: 'CPU power consumption in watts',
        labels: baseLabels,
        value: metrics.power.cpu,
        timestamp: metrics.timestamp
      });

      if (metrics.power.gpu !== undefined) {
        prometheusMetrics.push({
          name: 'power_gpu_watts',
          type: 'gauge',
          help: 'GPU power consumption in watts',
          labels: baseLabels,
          value: metrics.power.gpu,
          timestamp: metrics.timestamp
        });
      }
    }

    // Thermal Metrics
    if (metrics.thermal) {
      if (metrics.thermal.zones) {
        for (const zone of metrics.thermal.zones) {
          prometheusMetrics.push({
            name: 'thermal_zone_temperature_celsius',
            type: 'gauge',
            help: 'Thermal zone temperature in Celsius',
            labels: { ...baseLabels, zone: zone.name },
            value: zone.temperature,
            timestamp: metrics.timestamp
          });
        }
      }
    }

    return prometheusMetrics;
  }

  /**
   * Group metrics by name
   */
  private groupMetricsByName(metrics: PrometheusMetric[]): Map<string, PrometheusMetric[]> {
    const groups = new Map<string, PrometheusMetric[]>();
    
    for (const metric of metrics) {
      if (!groups.has(metric.name)) {
        groups.set(metric.name, []);
      }
      groups.get(metric.name)!.push(metric);
    }
    
    return groups;
  }

  /**
   * Generate Prometheus output
   */
  private generatePrometheusOutput(metricGroups: Map<string, PrometheusMetric[]>): string {
    const lines: string[] = [];
    
    for (const [metricName, metrics] of metricGroups.entries()) {
      if (metrics.length === 0) continue;
      
      // Use first metric for help and type
      const firstMetric = metrics[0];
      
      // Add help comment
      lines.push(`# HELP ${metricName} ${firstMetric.help}`);
      
      // Add type comment  
      lines.push(`# TYPE ${metricName} ${firstMetric.type}`);
      
      // Add metric values
      for (const metric of metrics) {
        const labelString = this.formatLabels(metric.labels);
        const line = labelString 
          ? `${metricName}{${labelString}} ${metric.value}`
          : `${metricName} ${metric.value}`;
        lines.push(line);
      }
      
      // Add empty line between metric groups
      lines.push('');
    }
    
    return lines.join('\n');
  }

  /**
   * Format labels for Prometheus output
   */
  private formatLabels(labels: Record<string, string>): string {
    const labelPairs = Object.entries(labels)
      .filter(([key, value]) => value !== undefined && value !== '')
      .map(([key, value]) => `${key}="${this.escapeLabelValue(value)}"`);
    
    return labelPairs.join(',');
  }

  /**
   * Escape label values for Prometheus format
   */
  private escapeLabelValue(value: string): string {
    return value
      .replace(/\\/g, '\\\\')  // Escape backslashes
      .replace(/"/g, '\\"')    // Escape quotes
      .replace(/\n/g, '\\n')   // Escape newlines
      .replace(/\t/g, '\\t')   // Escape tabs
      .replace(/\r/g, '\\r');  // Escape carriage returns
  }

  /**
   * Validate metric name for Prometheus compliance
   */
  private validateMetricName(name: string): boolean {
    // Prometheus metric names must match [a-zA-Z_:][a-zA-Z0-9_:]*
    const prometheusNameRegex = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
    return prometheusNameRegex.test(name);
  }

  /**
   * Sanitize metric name for Prometheus compliance
   */
  private sanitizeMetricName(name: string): string {
    // Replace invalid characters with underscores
    let sanitized = name.replace(/[^a-zA-Z0-9_:]/g, '_');
    
    // Ensure it starts with a letter, underscore, or colon
    if (!/^[a-zA-Z_:]/.test(sanitized)) {
      sanitized = `_${sanitized}`;
    }
    
    return sanitized;
  }
}