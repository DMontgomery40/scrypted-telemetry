import * as fs from 'fs/promises';
import * as path from 'path';
import { IntelNPUMetrics } from './types';

/**
 * IntelMonitor handles Intel NPU monitoring via sysfs
 */
export class IntelMonitor {
  private console: Console;
  private npuPath?: string;
  private lastBusyTime = 0;
  private lastTimestamp = 0;
  private npuAvailable = false;

  // Known Intel NPU sysfs paths
  private readonly NPU_PATHS = [
    '/sys/devices/pci0000:00/0000:00:0b.0/accel/accel0/npu_busy_time_us',
    '/sys/class/accel/accel0/npu_busy_time_us', 
    '/sys/devices/platform/intel_vpu/accel/accel0/npu_busy_time_us',
    '/sys/devices/pci0000:00/0000:00:11.0/accel/accel0/npu_busy_time_us',
    '/sys/devices/pci0000:00/0000:00:14.0/accel/accel0/npu_busy_time_us'
  ];

  constructor(console: Console) {
    this.console = console;
    this.detectNPUPath();
  }

  /**
   * Detect available Intel NPU sysfs path
   */
  private async detectNPUPath() {
    for (const npuPath of this.NPU_PATHS) {
      try {
        await fs.access(npuPath, fs.constants.R_OK);
        this.npuPath = npuPath;
        this.npuAvailable = true;
        this.console.log(`Intel NPU detected at: ${npuPath}`);
        return;
      } catch {
        // Continue checking other paths
      }
    }

    this.console.warn('Intel NPU not detected - no readable sysfs paths found');
    this.console.debug('Searched paths:', this.NPU_PATHS);
    this.npuAvailable = false;
  }

  /**
   * Collect Intel NPU metrics from sysfs
   */
  async collectNPUMetrics(): Promise<IntelNPUMetrics | undefined> {
    if (!this.npuAvailable || !this.npuPath) {
      return undefined;
    }

    try {
      // Read NPU busy time
      const busyTimeData = await fs.readFile(this.npuPath, 'utf8');
      const busyTime = parseInt(busyTimeData.trim(), 10);
      
      if (isNaN(busyTime)) {
        this.console.warn(`Invalid NPU busy time value: ${busyTimeData}`);
        return undefined;
      }

      const currentTimestamp = Date.now() * 1000; // Convert to microseconds for consistency

      // Calculate utilization based on busy time delta
      let utilization = 0;
      if (this.lastBusyTime > 0 && this.lastTimestamp > 0) {
        const busyTimeDelta = busyTime - this.lastBusyTime;
        const timeDelta = currentTimestamp - this.lastTimestamp;
        
        if (timeDelta > 0) {
          utilization = Math.min((busyTimeDelta / timeDelta) * 100, 100);
          utilization = Math.max(utilization, 0); // Ensure non-negative
        }
      }

      // Update last values for next calculation
      this.lastBusyTime = busyTime;
      this.lastTimestamp = currentTimestamp;

      // Try to get additional metrics if available
      const additionalMetrics = await this.collectAdditionalNPUMetrics();

      return {
        utilization: Math.round(utilization * 100) / 100,
        busyTime,
        power: additionalMetrics.power || 0,
        frequency: additionalMetrics.frequency,
        temperature: additionalMetrics.temperature
      };

    } catch (error) {
      this.console.error('Error reading Intel NPU metrics:', error);
      
      // Check if the sysfs path is still accessible
      if ((error as any).code === 'ENOENT' || (error as any).code === 'EACCES') {
        this.npuAvailable = false;
        this.console.warn('NPU sysfs path no longer accessible, disabling NPU monitoring');
      }
      
      return undefined;
    }
  }

  /**
   * Collect additional NPU metrics if available
   */
  private async collectAdditionalNPUMetrics(): Promise<{
    power?: number;
    frequency?: number;
    temperature?: number;
  }> {
    const result: {
      power?: number;
      frequency?: number;
      temperature?: number;
    } = {};

    if (!this.npuPath) {
      return result;
    }

    const basePath = path.dirname(this.npuPath);
    
    // Try to read power consumption
    const powerPaths = [
      path.join(basePath, 'npu_power_watts'),
      path.join(basePath, 'power'),
      path.join(basePath, 'device/power/power_now')
    ];

    for (const powerPath of powerPaths) {
      try {
        const powerData = await fs.readFile(powerPath, 'utf8');
        const power = parseFloat(powerData.trim());
        if (!isNaN(power)) {
          result.power = power;
          break;
        }
      } catch {
        // Continue to next path
      }
    }

    // Try to read frequency
    const frequencyPaths = [
      path.join(basePath, 'npu_frequency_mhz'),
      path.join(basePath, 'frequency'),
      path.join(basePath, 'cur_freq')
    ];

    for (const freqPath of frequencyPaths) {
      try {
        const freqData = await fs.readFile(freqPath, 'utf8');
        const frequency = parseFloat(freqData.trim());
        if (!isNaN(frequency)) {
          result.frequency = frequency;
          break;
        }
      } catch {
        // Continue to next path
      }
    }

    // Try to read temperature
    const tempPaths = [
      path.join(basePath, 'npu_temperature'),
      path.join(basePath, 'temp'),
      path.join(basePath, 'device/hwmon/hwmon*/temp1_input')
    ];

    for (const tempPath of tempPaths) {
      try {
        // Handle wildcard in hwmon path
        if (tempPath.includes('*')) {
          const hwmonDir = path.dirname(tempPath);
          const hwmonDirs = await fs.readdir(path.dirname(hwmonDir));
          
          for (const dir of hwmonDirs) {
            if (dir.startsWith('hwmon')) {
              const resolvedPath = path.join(path.dirname(hwmonDir), dir, 'temp1_input');
              try {
                const tempData = await fs.readFile(resolvedPath, 'utf8');
                const temp = parseFloat(tempData.trim());
                if (!isNaN(temp)) {
                  // Convert from millidegrees to degrees if needed
                  result.temperature = temp > 1000 ? temp / 1000 : temp;
                  break;
                }
              } catch {
                // Continue
              }
            }
          }
        } else {
          const tempData = await fs.readFile(tempPath, 'utf8');
          const temp = parseFloat(tempData.trim());
          if (!isNaN(temp)) {
            result.temperature = temp > 1000 ? temp / 1000 : temp;
            break;
          }
        }
      } catch {
        // Continue to next path
      }
    }

    return result;
  }

  /**
   * Test Intel NPU functionality
   */
  async testNPU(): Promise<{
    available: boolean;
    path?: string;
    busyTime?: number;
    additionalMetrics?: any;
    error?: string;
  }> {
    try {
      await this.detectNPUPath();
      
      if (!this.npuAvailable || !this.npuPath) {
        return {
          available: false,
          error: 'No Intel NPU sysfs paths found'
        };
      }

      // Read current busy time
      const busyTimeData = await fs.readFile(this.npuPath, 'utf8');
      const busyTime = parseInt(busyTimeData.trim(), 10);
      
      // Get additional metrics
      const additionalMetrics = await this.collectAdditionalNPUMetrics();

      return {
        available: true,
        path: this.npuPath,
        busyTime,
        additionalMetrics
      };

    } catch (error) {
      return {
        available: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Check if Intel NPU is available
   */
  isAvailable(): boolean {
    return this.npuAvailable;
  }

  /**
   * Force recheck NPU availability
   */
  async recheckAvailability(): Promise<boolean> {
    await this.detectNPUPath();
    return this.npuAvailable;
  }

  /**
   * Get NPU path
   */
  getNPUPath(): string | undefined {
    return this.npuPath;
  }

  /**
   * Reset utilization calculation
   */
  resetUtilizationCalculation() {
    this.lastBusyTime = 0;
    this.lastTimestamp = 0;
  }

  /**
   * Get Intel NPU debugging information
   */
  async getDebugInfo(): Promise<{
    searchedPaths: string[];
    foundPath?: string;
    pathAccessible?: boolean;
    sysfsListing?: string[];
    driverInfo?: any;
  }> {
    const debugInfo = {
      searchedPaths: this.NPU_PATHS,
      foundPath: this.npuPath
    };

    // Check if found path is still accessible
    if (this.npuPath) {
      try {
        await fs.access(this.npuPath, fs.constants.R_OK);
        (debugInfo as any).pathAccessible = true;
      } catch {
        (debugInfo as any).pathAccessible = false;
      }
    }

    // List sysfs accel devices
    try {
      const accelDevices = await fs.readdir('/sys/class/accel');
      (debugInfo as any).sysfsListing = accelDevices;
    } catch {
      (debugInfo as any).sysfsListing = [];
    }

    // Try to get driver information
    try {
      const driverInfo: any = {};
      
      // Check for intel_vpu driver
      try {
        const moduleInfo = await fs.readFile('/proc/modules', 'utf8');
        if (moduleInfo.includes('intel_vpu')) {
          driverInfo.intel_vpu = 'loaded';
        }
      } catch {
        // Driver info not available
      }

      // Check for VPU devices in lspci if available
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        const { stdout } = await execAsync('lspci | grep -i vpu');
        if (stdout.trim()) {
          driverInfo.vpu_devices = stdout.trim().split('\n');
        }
      } catch {
        // lspci not available or no VPU devices
      }

      (debugInfo as any).driverInfo = driverInfo;
    } catch {
      // Driver info not available
    }

    return debugInfo;
  }

  /**
   * Get Intel NPU setup instructions
   */
  getSetupInstructions(): string {
    return `
Intel NPU Setup Instructions:

1. Ensure Intel NPU drivers are installed:
   - Check if intel_vpu module is loaded: lsmod | grep intel_vpu
   - If not loaded, the NPU driver may not be installed or configured

2. Verify NPU device is detected:
   - Check for accel devices: ls -la /sys/class/accel/
   - Look for Intel VPU in lspci: lspci | grep -i vpu

3. Common NPU sysfs paths:
   ${this.NPU_PATHS.map(p => `   - ${p}`).join('\n')}

4. If NPU is not detected:
   - Update kernel to latest version (NPU support added in recent kernels)
   - Install Intel NPU drivers from Intel's repository
   - Check BIOS settings - NPU may need to be enabled

5. Verify permissions:
   - NPU sysfs files should be readable by the user running Scrypted
   - Check with: ls -la /sys/class/accel/accel*/

Note: Intel NPU support is still evolving and may require specific kernel versions and drivers.
`;
  }
}