import { exec } from 'child_process';
import { promisify } from 'util';
import { AppleMetrics, MacmonOutput } from './types';

const execAsync = promisify(exec);

/**
 * MacMonitor handles Apple Silicon monitoring via the macmon tool
 */
export class MacMonitor {
  private console: Console;
  private macmonAvailable = false;

  constructor(console: Console) {
    this.console = console;
    this.checkMacmonAvailability();
  }

  /**
   * Check if macmon tool is available
   */
  private async checkMacmonAvailability() {
    try {
      await execAsync('which macmon');
      this.macmonAvailable = true;
      this.console.log('macmon tool detected and available');
    } catch (error) {
      this.macmonAvailable = false;
      this.console.warn('macmon tool not found. Install with: brew install macmon');
      this.console.warn('Apple Silicon metrics will not be available');
    }
  }

  /**
   * Collect Apple Silicon metrics using macmon
   */
  async collectMetrics(): Promise<AppleMetrics | undefined> {
    if (!this.macmonAvailable) {
      return undefined;
    }

    try {
      // Execute macmon with JSON output for 1 sample
      const { stdout, stderr } = await execAsync('macmon pipe -s 1 --soc-info', {
        timeout: 10000 // 10 second timeout
      });

      if (stderr) {
        this.console.warn('macmon stderr:', stderr);
      }

      if (!stdout || stdout.trim() === '') {
        this.console.warn('macmon returned empty output');
        return undefined;
      }

      // Parse macmon JSON output
      const macmonData = this.parseMacmonOutput(stdout);
      if (!macmonData) {
        return undefined;
      }

      // Convert to AppleMetrics format
      return this.convertToAppleMetrics(macmonData);

    } catch (error) {
      this.console.error('Error collecting macmon metrics:', error);
      
      // Check if macmon is still available (might have been uninstalled)
      if ((error as any).code === 'ENOENT') {
        this.macmonAvailable = false;
      }
      
      return undefined;
    }
  }

  /**
   * Parse macmon JSON output
   */
  private parseMacmonOutput(stdout: string): MacmonOutput | undefined {
    try {
      // macmon outputs one JSON object per line, we want the latest
      const lines = stdout.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      
      if (!lastLine) {
        this.console.warn('No valid macmon output lines found');
        return undefined;
      }

      const data = JSON.parse(lastLine) as MacmonOutput;
      
      // Validate required fields
      if (!data.timestamp || !data.cpu_metrics || !Array.isArray(data.cpu_metrics)) {
        this.console.warn('Invalid macmon output format - missing required fields');
        return undefined;
      }

      return data;

    } catch (error) {
      this.console.error('Error parsing macmon JSON output:', error);
      this.console.debug('Raw macmon output:', stdout);
      return undefined;
    }
  }

  /**
   * Convert macmon data to AppleMetrics format
   */
  private convertToAppleMetrics(data: MacmonOutput): AppleMetrics {
    const appleMetrics: AppleMetrics = {};

    try {
      // Process CPU metrics
      if (data.cpu_metrics && data.cpu_metrics.length > 0) {
        const cpuData = data.cpu_metrics[0]; // Take first CPU package
        
        appleMetrics.cpu = {
          pcpu: [], // Performance cores
          ecpu: []  // Efficiency cores
        };

        // Process P-cores (Performance cores)
        if (cpuData.pcpu_usage && Array.isArray(cpuData.pcpu_usage)) {
          appleMetrics.cpu.pcpu = cpuData.pcpu_usage.map((coreData, index) => {
            const [frequency, utilization] = coreData;
            return {
              id: index,
              utilization: Math.round(utilization * 100) / 100,
              frequency: Math.round(frequency),
              power: undefined // Not available in basic macmon output
            };
          });
        }

        // Process E-cores (Efficiency cores)
        if (cpuData.ecpu_usage && Array.isArray(cpuData.ecpu_usage)) {
          appleMetrics.cpu.ecpu = cpuData.ecpu_usage.map((coreData, index) => {
            const [frequency, utilization] = coreData;
            return {
              id: index,
              utilization: Math.round(utilization * 100) / 100,
              frequency: Math.round(frequency),
              power: undefined // Not available in basic macmon output
            };
          });
        }
      }

      // Process GPU metrics
      if (data.gpu_metrics) {
        appleMetrics.gpu = {
          utilization: Math.round(data.gpu_metrics.utilization * 100) / 100,
          frequency: Math.round(data.gpu_metrics.frequency),
          power: 0 // Not directly available, would need power metrics
        };
      }

      // Process Apple Neural Engine metrics
      if (typeof data.ane_power === 'number' && data.ane_power >= 0) {
        // Calculate ANE utilization based on power consumption
        // Assumption: ~8W is max ANE power consumption
        const maxAnePower = 8.0;
        const aneUtilization = Math.min((data.ane_power / maxAnePower) * 100, 100);
        
        appleMetrics.ane = {
          utilization: Math.round(aneUtilization * 100) / 100,
          power: Math.round(data.ane_power * 100) / 100
        };
      }

    } catch (error) {
      this.console.error('Error converting macmon data to AppleMetrics:', error);
    }

    return appleMetrics;
  }

  /**
   * Get extended macmon metrics with power information
   */
  async collectExtendedMetrics(): Promise<AppleMetrics | undefined> {
    if (!this.macmonAvailable) {
      return undefined;
    }

    try {
      // Try to get extended metrics with power info
      const { stdout } = await execAsync('macmon pipe -s 1 --soc-info --power-info', {
        timeout: 15000 // 15 second timeout for extended metrics
      });

      if (!stdout || stdout.trim() === '') {
        // Fall back to basic metrics
        return this.collectMetrics();
      }

      const macmonData = this.parseMacmonOutput(stdout);
      if (!macmonData) {
        return this.collectMetrics();
      }

      return this.convertToAppleMetrics(macmonData);

    } catch (error) {
      this.console.warn('Extended macmon metrics not available, falling back to basic:', error);
      return this.collectMetrics();
    }
  }

  /**
   * Test macmon functionality
   */
  async testMacmon(): Promise<{
    available: boolean;
    version?: string;
    sampleOutput?: any;
    error?: string;
  }> {
    try {
      // Check if macmon is available
      await execAsync('which macmon');
      
      // Get version
      const { stdout: versionOutput } = await execAsync('macmon --version');
      const version = versionOutput.trim();

      // Get sample output
      const { stdout: sampleOutput } = await execAsync('macmon pipe -s 1 --soc-info', {
        timeout: 10000
      });

      let parsedSample;
      try {
        const lines = sampleOutput.trim().split('\n');
        parsedSample = JSON.parse(lines[lines.length - 1]);
      } catch (parseError) {
        parsedSample = { parseError: (parseError as Error).message };
      }

      return {
        available: true,
        version,
        sampleOutput: parsedSample
      };

    } catch (error) {
      return {
        available: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Check if macmon is available
   */
  isAvailable(): boolean {
    return this.macmonAvailable;
  }

  /**
   * Force recheck macmon availability
   */
  async recheckAvailability(): Promise<boolean> {
    await this.checkMacmonAvailability();
    return this.macmonAvailable;
  }

  /**
   * Get macmon installation instructions
   */
  getInstallationInstructions(): string {
    return `
To install macmon on macOS:

1. Install Homebrew (if not already installed):
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

2. Install macmon:
   brew install macmon

3. Verify installation:
   macmon --version

4. Test basic functionality:
   macmon pipe -s 1 --soc-info

Note: macmon requires macOS and works best on Apple Silicon Macs.
`;
  }
}