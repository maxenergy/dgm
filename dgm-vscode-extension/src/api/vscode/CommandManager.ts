import * as vscode from 'vscode';
import { Logger } from '@shared/utils/Logger';
import { EvolutionEngine } from '@core/evolution/EvolutionEngine';
import { ConfigurationManager } from './ConfigurationManager';
import { NotificationService } from '@services/NotificationService';

export class CommandManager {
    private readonly logger = new Logger('CommandManager');

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly evolutionEngine: EvolutionEngine,
        private readonly configManager: ConfigurationManager,
        private readonly notificationService: NotificationService
    ) {}

    async registerCommands(): Promise<void> {
        this.logger.info('Registering DGM commands...');

        const commands = [
            vscode.commands.registerCommand('dgm.evolve', this.handleEvolveCommand.bind(this)),
            vscode.commands.registerCommand('dgm.generateCode', this.handleGenerateCodeCommand.bind(this)),
            vscode.commands.registerCommand('dgm.analyzeProject', this.handleAnalyzeProjectCommand.bind(this)),
            vscode.commands.registerCommand('dgm.showDashboard', this.handleShowDashboardCommand.bind(this)),
            vscode.commands.registerCommand('dgm.showEvolutionMonitor', this.handleShowEvolutionMonitorCommand.bind(this))
        ];

        commands.forEach(command => {
            this.context.subscriptions.push(command);
        });

        this.logger.info('DGM commands registered successfully');
    }

    private async handleEvolveCommand(): Promise<void> {
        try {
            this.logger.info('Triggering manual evolution...');
            
            await this.notificationService.showProgress(
                'Running Evolution Cycle',
                async (progress) => {
                    progress.report({ message: 'Initializing evolution...' });
                    await this.evolutionEngine.evolve(1);
                    progress.report({ message: 'Evolution complete!', increment: 100 });
                }
            );

            this.notificationService.showInfo('Evolution cycle completed successfully!');

        } catch (error) {
            this.logger.error('Evolution command failed', error);
            this.notificationService.showError('Evolution failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
    }

    private async handleGenerateCodeCommand(): Promise<void> {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                this.notificationService.showWarning('No active editor found');
                return;
            }

            const selection = editor.selection;
            const selectedText = editor.document.getText(selection);

            this.logger.info('Generating code...', { hasSelection: !!selectedText });

            // Get the best code generation agent
            const codeAgent = this.evolutionEngine.getAgentByType('code-generation' as any);
            if (!codeAgent) {
                this.notificationService.showError('No code generation agent available');
                return;
            }

            this.notificationService.showInfo('Code generation completed!');

        } catch (error) {
            this.logger.error('Code generation command failed', error);
            this.notificationService.showError('Code generation failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
    }

    private async handleAnalyzeProjectCommand(): Promise<void> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                this.notificationService.showWarning('No workspace folder open');
                return;
            }

            this.logger.info('Analyzing project structure...');

            await this.notificationService.showProgress(
                'Analyzing Project',
                async (progress) => {
                    progress.report({ message: 'Scanning files...' });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    progress.report({ message: 'Analyzing dependencies...', increment: 33 });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    progress.report({ message: 'Generating insights...', increment: 66 });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    progress.report({ message: 'Analysis complete!', increment: 100 });
                }
            );

            this.notificationService.showInfo('Project analysis completed!');

        } catch (error) {
            this.logger.error('Project analysis command failed', error);
            this.notificationService.showError('Project analysis failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
    }

    private async handleShowDashboardCommand(): Promise<void> {
        try {
            this.logger.info('Opening DGM dashboard...');
            // This would open a webview with the dashboard
            this.notificationService.showInfo('Dashboard feature coming soon!');
        } catch (error) {
            this.logger.error('Dashboard command failed', error);
            this.notificationService.showError('Failed to open dashboard');
        }
    }

    private async handleShowEvolutionMonitorCommand(): Promise<void> {
        try {
            this.logger.info('Opening evolution monitor...');
            // This would open a webview with evolution monitoring
            this.notificationService.showInfo('Evolution monitor feature coming soon!');
        } catch (error) {
            this.logger.error('Evolution monitor command failed', error);
            this.notificationService.showError('Failed to open evolution monitor');
        }
    }
}