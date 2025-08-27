import { Settings, Setting, ScryptedDeviceBase, ScryptedDeviceType, ScryptedInterface } from "@scrypted/sdk";
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

/**
 * Scrypted Telemetry Plugin - The Missing Piece
 * This actually discovers your setup and generates a working dashboard
 * No more "fill in these boxes and hope" - it autodiscovers and builds
 */
export class ScryptedTelemetryPlugin extends ScryptedDeviceBase implements Settings {
    private discoveryResults: any = {};
    private generatedDashboard: any = null;
    
    constructor(nativeId: string) {
        super(nativeId);
        
        // Start discovery on load
        this.runDiscovery();
    }
    
    async getSettings(): Promise<Setting[]> {
        const settings: Setting[] = [
            {
                key: 'prometheus_url',
                title: 'Prometheus URL',
                value: this.storage.getItem('prometheus_url') || 'http://localhost:9090',
                description: 'URL of your Prometheus server',
                placeholder: 'http://localhost:9090'
            },
            {
                key: 'grafana_url', 
                title: 'Grafana URL',
                value: this.storage.getItem('grafana_url') || 'http://localhost:3000',
                description: 'URL of your Grafana server',
                placeholder: 'http://localhost:3000'
            },
            {
                key: 'auto_discover',
                title: '🔍 Run Auto-Discovery',
                type: 'button',
                description: 'Discover all metrics and hardware automatically',
                value: 'Discover Now'
            },
            {
                key: 'discovery_status',
                title: 'Discovery Status',
                readonly: true,
                value: this.getDiscoveryStatus(),
                description: 'What we found in your setup'
            }
        ];
        
        // If we have discovery results, show configuration options
        if (this.discoveryResults.nodes) {
            settings.push({
                key: 'discovered_nodes',
                title: 'Discovered Nodes',
                readonly: true,
                multiple: true,
                value: this.getNodesList(),
                description: 'Nodes found in your cluster'
            });
            
            settings.push({
                key: 'discovered_hardware',
                title: 'Detected Hardware',
                readonly: true,
                multiple: true,
                value: this.getHardwareList(),
                description: 'Hardware capabilities detected'
            });
            
            settings.push({
                key: 'dashboard_name',
                title: 'Dashboard Name',
                value: this.storage.getItem('dashboard_name') || 'Scrypted Telemetry',
                description: 'Name for your generated dashboard'
            });
            
            settings.push({
                key: 'include_gpu',
                title: 'Include GPU Metrics',
                type: 'boolean',
                value: this.storage.getItem('include_gpu') !== 'false',
                description: 'Include GPU/accelerator panels'
            });
            
            settings.push({
                key: 'include_processes',
                title: 'Include Process Monitoring',
                type: 'boolean',
                value: this.storage.getItem('include_processes') !== 'false',
                description: 'Include top processes table'
            });
            
            settings.push({
                key: 'generate_dashboard',
                title: '🚀 Generate Dashboard',
                type: 'button',
                description: 'Generate Grafana dashboard JSON',
                value: 'Generate Now'
            });
        }
        
        // If dashboard was generated, show import options
        if (this.generatedDashboard) {
            settings.push({
                key: 'dashboard_json',
                title: '📋 Dashboard JSON',
                type: 'string',
                readonly: true,
                value: '✅ Dashboard generated! Click to copy...',
                description: 'Copy this JSON and import into Grafana'
            });
            
            settings.push({
                key: 'copy_dashboard',
                title: '📋 Copy Dashboard JSON',
                type: 'button',
                value: 'Copy to Clipboard',
                description: 'Copy the generated dashboard JSON'
            });
            
            settings.push({
                key: 'save_dashboard',
                title: '💾 Save Dashboard File',
                type: 'button', 
                value: 'Save as File',
                description: 'Save dashboard JSON to file'
            });
            
            if (this.storage.getItem('grafana_api_key')) {
                settings.push({
                    key: 'auto_import',
                    title: '🎯 Auto-Import to Grafana',
                    type: 'button',
                    value: 'Import Now',
                    description: 'Automatically import to Grafana (requires API key)'
                });
            }
        }
        
        // Advanced settings
        settings.push({
            key: 'advanced_settings',
            title: '⚙️ Advanced Settings',
            type: 'boolean',
            value: false,
            description: 'Show advanced configuration options'
        });
        
        if (this.storage.getItem('advanced_settings') === 'true') {
            settings.push({
                key: 'grafana_api_key',
                title: 'Grafana API Key',
                type: 'password',
                value: this.storage.getItem('grafana_api_key') || '',
                description: 'API key for auto-importing dashboards'
            });
            
            settings.push({
                key: 'refresh_interval',
                title: 'Refresh Interval',
                choices: ['5s', '10s', '30s', '1m', '5m'],
                value: this.storage.getItem('refresh_interval') || '5s',
                description: 'Dashboard refresh rate'
            });
            
            settings.push({
                key: 'install_missing',
                title: '🔧 Install Missing Components',
                type: 'button',
                value: 'Run Setup Script',
                description: 'Install missing exporters and components'
            });
        }
        
        return settings;
    }
    
    async putSetting(key: string, value: any): Promise<void> {
        this.storage.setItem(key, value?.toString());
        
        switch(key) {
            case 'auto_discover':
                await this.runDiscovery();
                break;
                
            case 'generate_dashboard':
                await this.generateDashboard();
                break;
                
            case 'copy_dashboard':
                this.copyDashboardToClipboard();
                break;
                
            case 'save_dashboard':
                await this.saveDashboardToFile();
                break;
                
            case 'auto_import':
                await this.autoImportToGrafana();
                break;
                
            case 'install_missing':
                await this.runSetupScript();
                break;
        }
        
        // Refresh settings UI
        this.onDeviceEvent(ScryptedInterface.Settings, undefined);
    }
    
    private async runDiscovery(): Promise<void> {
        const prometheusUrl = this.storage.getItem('prometheus_url') || 'http://localhost:9090';
        
        this.console.info('🔍 Starting auto-discovery...');
        
        try {
            // Check Prometheus connectivity
            const healthCheck = await axios.get(`${prometheusUrl}/-/healthy`);
            if (healthCheck.status !== 200) {
                throw new Error('Prometheus not healthy');
            }
            
            // Run Python discovery script
            const discoveryScript = path.join(__dirname, 'dashboard_generator.py');
            const result = await this.runPythonScript(discoveryScript, [
                '--prometheus-url', prometheusUrl,
                '--discover-only'
            ]);
            
            this.discoveryResults = JSON.parse(result);
            this.console.info(`✅ Discovery complete! Found ${Object.keys(this.discoveryResults.nodes || {}).length} nodes`);
            
            // Store results
            this.storage.setItem('discovery_results', JSON.stringify(this.discoveryResults));
            
        } catch (error) {
            this.console.error('Discovery failed:', error);
            this.discoveryResults = { error: error.message };
        }
    }
    
    private async generateDashboard(): Promise<void> {
        const prometheusUrl = this.storage.getItem('prometheus_url') || 'http://localhost:9090';
        const dashboardName = this.storage.getItem('dashboard_name') || 'Scrypted Telemetry';
        const includeGpu = this.storage.getItem('include_gpu') !== 'false';
        const includeProcesses = this.storage.getItem('include_processes') !== 'false';
        const refreshInterval = this.storage.getItem('refresh_interval') || '5s';
        
        this.console.info('🎨 Generating dashboard...');
        
        try {
            // Run Python generator with options
            const generatorScript = path.join(__dirname, 'dashboard_generator.py');
            const result = await this.runPythonScript(generatorScript, [
                '--prometheus-url', prometheusUrl,
                '--dashboard-name', dashboardName,
                includeGpu ? '--include-gpu' : '--no-gpu',
                includeProcesses ? '--include-processes' : '--no-processes',
                '--refresh-interval', refreshInterval,
                '--generate'
            ]);
            
            this.generatedDashboard = JSON.parse(result);
            this.console.info('✅ Dashboard generated successfully!');
            
            // Store for later use
            this.storage.setItem('generated_dashboard', JSON.stringify(this.generatedDashboard));
            
        } catch (error) {
            this.console.error('Dashboard generation failed:', error);
        }
    }
    
    private async runPythonScript(scriptPath: string, args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            const python = spawn('python3', [scriptPath, ...args]);
            let output = '';
            let error = '';
            
            python.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            python.stderr.on('data', (data) => {
                error += data.toString();
            });
            
            python.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(error || `Python script exited with code ${code}`));
                } else {
                    resolve(output);
                }
            });
        });
    }
    
    private getDiscoveryStatus(): string {
        if (!this.discoveryResults.nodes) {
            return '⏳ Not yet discovered - click "Discover Now"';
        }
        
        const nodeCount = Object.keys(this.discoveryResults.nodes).length;
        const metrics = this.discoveryResults.total_metrics || 0;
        
        return `✅ Found ${nodeCount} nodes with ${metrics} metrics`;
    }
    
    private getNodesList(): string[] {
        if (!this.discoveryResults.nodes) return [];
        
        return Object.entries(this.discoveryResults.nodes).map(([instance, node]: [string, any]) => {
            return `${node.hostname} (${node.ip}:${node.port})`;
        });
    }
    
    private getHardwareList(): string[] {
        if (!this.discoveryResults.nodes) return [];
        
        const hardware = new Set<string>();
        
        Object.values(this.discoveryResults.nodes).forEach((node: any) => {
            if (node.hardware?.nvidia_gpu) hardware.add('✅ NVIDIA GPU');
            if (node.hardware?.intel_gpu) hardware.add('✅ Intel GPU');
            if (node.hardware?.intel_npu) hardware.add('✅ Intel NPU');
            if (node.hardware?.mac) hardware.add('✅ Mac (Apple Silicon)');
        });
        
        return Array.from(hardware);
    }
    
    private copyDashboardToClipboard(): void {
        if (!this.generatedDashboard) return;
        
        // This would need clipboard API or native integration
        // For now, we'll show the JSON for manual copy
        this.console.info('Dashboard JSON:', JSON.stringify(this.generatedDashboard, null, 2));
    }
    
    private async saveDashboardToFile(): Promise<void> {
        if (!this.generatedDashboard) return;
        
        const filePath = '/tmp/scrypted-dashboard.json';
        fs.writeFileSync(filePath, JSON.stringify(this.generatedDashboard, null, 2));
        
        this.console.info(`✅ Dashboard saved to ${filePath}`);
    }
    
    private async autoImportToGrafana(): Promise<void> {
        const grafanaUrl = this.storage.getItem('grafana_url') || 'http://localhost:3000';
        const apiKey = this.storage.getItem('grafana_api_key');
        
        if (!apiKey || !this.generatedDashboard) return;
        
        try {
            const response = await axios.post(
                `${grafanaUrl}/api/dashboards/db`,
                {
                    dashboard: this.generatedDashboard,
                    overwrite: true
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            if (response.status === 200) {
                this.console.info(`✅ Dashboard imported! View at: ${grafanaUrl}/d/${this.generatedDashboard.uid}`);
            }
        } catch (error) {
            this.console.error('Auto-import failed:', error);
        }
    }
    
    private async runSetupScript(): Promise<void> {
        this.console.info('🔧 Running setup script...');
        
        try {
            // Run the tteck-style setup script
            const setupScript = path.join(__dirname, 'tteck.sh');
            const setup = spawn('bash', [setupScript]);
            
            setup.stdout.on('data', (data) => {
                this.console.info(data.toString());
            });
            
            setup.stderr.on('data', (data) => {
                this.console.error(data.toString());
            });
            
            setup.on('close', (code) => {
                if (code === 0) {
                    this.console.info('✅ Setup complete!');
                } else {
                    this.console.error(`Setup failed with code ${code}`);
                }
            });
        } catch (error) {
            this.console.error('Setup failed:', error);
        }
    }
}

export default ScryptedTelemetryPlugin;