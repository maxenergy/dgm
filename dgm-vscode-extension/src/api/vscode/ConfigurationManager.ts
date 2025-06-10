import * as vscode from 'vscode';
import { 
    ExtensionConfiguration, 
    TelemetryConfiguration, 
    getDefaultConfiguration,
    mergeConfigurations
} from '@shared/types';
import { Logger } from '@shared/utils/Logger';

export class ConfigurationManager implements vscode.Disposable {
    private readonly logger = new Logger('ConfigurationManager');
    private config: ExtensionConfiguration;
    private readonly configChangeEmitter = new vscode.EventEmitter<vscode.ConfigurationChangeEvent>();
    
    readonly onConfigurationChanged = this.configChangeEmitter.event;

    constructor() {
        this.config = this.loadConfiguration();
        
        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration(this.handleConfigurationChange.bind(this));
    }

    getConfiguration(): ExtensionConfiguration {
        return { ...this.config };
    }

    getTelemetryConfiguration(): TelemetryConfiguration {
        return { ...this.config.telemetry };
    }

    isTelemetryEnabled(): boolean {
        return this.config.telemetry.enabled;
    }

    isEvolutionEnabled(): boolean {
        return this.config.evolution.enabled;
    }

    isSandboxEnabled(): boolean {
        return this.config.security.sandboxEnabled;
    }

    async updateConfiguration(updates: Partial<ExtensionConfiguration>): Promise<void> {
        try {
            const vscodeConfig = vscode.workspace.getConfiguration('dgm');
            
            // Update each section
            if (updates.evolution) {
                await this.updateSection('evolution', updates.evolution);
            }
            if (updates.security) {
                await this.updateSection('security', updates.security);
            }
            if (updates.telemetry) {
                await this.updateSection('telemetry', updates.telemetry);
            }
            if (updates.llm) {
                await this.updateSection('llm', updates.llm);
            }
            if (updates.ui) {
                await this.updateSection('ui', updates.ui);
            }
            if (updates.performance) {
                await this.updateSection('performance', updates.performance);
            }
            if (updates.experimental) {
                await this.updateSection('experimental', updates.experimental);
            }

            this.logger.info('Configuration updated successfully');

        } catch (error) {
            this.logger.error('Failed to update configuration', error);
            throw error;
        }
    }

    private loadConfiguration(): ExtensionConfiguration {
        const defaultConfig = getDefaultConfiguration();
        const vscodeConfig = vscode.workspace.getConfiguration('dgm');

        // Load each section
        const evolution = this.loadSection('evolution', defaultConfig.evolution);
        const security = this.loadSection('security', defaultConfig.security);
        const telemetry = this.loadSection('telemetry', defaultConfig.telemetry);
        const llm = this.loadSection('llm', defaultConfig.llm);
        const ui = this.loadSection('ui', defaultConfig.ui);
        const performance = this.loadSection('performance', defaultConfig.performance);
        const experimental = this.loadSection('experimental', defaultConfig.experimental);

        return {
            evolution,
            security,
            telemetry,
            llm,
            ui,
            performance,
            experimental
        };
    }

    private loadSection<T>(sectionName: string, defaultValue: T): T {
        const vscodeConfig = vscode.workspace.getConfiguration('dgm');
        const section = vscodeConfig.get<T>(sectionName);
        
        if (!section) {
            return defaultValue;
        }

        // Merge with defaults to ensure all properties are present
        return { ...defaultValue, ...section };
    }

    private async updateSection(sectionName: string, updates: Record<string, unknown>): Promise<void> {
        const vscodeConfig = vscode.workspace.getConfiguration('dgm');
        
        for (const [key, value] of Object.entries(updates)) {
            const configKey = `${sectionName}.${key}`;
            await vscodeConfig.update(configKey, value, vscode.ConfigurationTarget.Global);
        }
    }

    private handleConfigurationChange(event: vscode.ConfigurationChangeEvent): void {
        if (event.affectsConfiguration('dgm')) {
            this.logger.info('Configuration changed, reloading...');
            
            const oldConfig = this.config;
            this.config = this.loadConfiguration();
            
            this.logger.debug('Configuration reloaded', {
                evolutionEnabled: this.config.evolution.enabled,
                telemetryEnabled: this.config.telemetry.enabled,
                securityLevel: this.config.security.permissionLevel
            });

            // Emit change event
            this.configChangeEmitter.fire(event);
        }
    }

    dispose(): void {
        this.configChangeEmitter.dispose();
    }
}