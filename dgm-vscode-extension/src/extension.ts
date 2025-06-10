import * as vscode from 'vscode';
import { Logger } from '@shared/utils/Logger';
import { ConfigurationManager } from '@api/vscode/ConfigurationManager';
import { CommandManager } from '@api/vscode/CommandManager';
import { TelemetryCollector } from '@core/telemetry/TelemetryCollector';
import { EvolutionEngine } from '@core/evolution/EvolutionEngine';
import { NotificationService } from '@services/NotificationService';

let evolutionEngine: EvolutionEngine | undefined;
let telemetryCollector: TelemetryCollector | undefined;
let logger: Logger | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Initialize logger
    logger = new Logger('DGM Extension');
    logger.info('Darwin Gödel Machine VSCode Extension is activating...');

    try {
        // Initialize configuration manager
        const configManager = new ConfigurationManager();
        context.subscriptions.push(configManager);

        // Initialize telemetry collector
        if (configManager.isTelemetryEnabled()) {
            telemetryCollector = new TelemetryCollector(context, configManager);
            await telemetryCollector.initialize();
            context.subscriptions.push(telemetryCollector);
        }

        // Initialize notification service
        const notificationService = new NotificationService();

        // Initialize evolution engine
        evolutionEngine = new EvolutionEngine(
            context,
            configManager,
            telemetryCollector,
            notificationService
        );
        await evolutionEngine.initialize();
        context.subscriptions.push(evolutionEngine);

        // Initialize command manager
        const commandManager = new CommandManager(
            context,
            evolutionEngine,
            configManager,
            notificationService
        );
        await commandManager.registerCommands();

        // Register configuration change listener
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration('dgm')) {
                    logger?.info('Configuration changed, scheduling evolution');
                    evolutionEngine?.scheduleEvolution('low');
                }
            })
        );

        // Register workspace events
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument((document) => {
                telemetryCollector?.trackEvent('document.saved', {
                    language: document.languageId,
                    size: document.getText().length
                });
            })
        );

        // Show welcome message
        const isFirstActivation = context.globalState.get('dgm.firstActivation', true);
        if (isFirstActivation) {
            notificationService.showWelcomeMessage();
            await context.globalState.update('dgm.firstActivation', false);
        }

        logger.info('Darwin Gödel Machine VSCode Extension activated successfully');
        telemetryCollector?.trackEvent('extension.activated', {
            version: context.extension.packageJSON.version
        });

    } catch (error) {
        logger?.error('Failed to activate extension', error);
        vscode.window.showErrorMessage(
            `Failed to activate Darwin Gödel Machine Extension: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        throw error;
    }
}

export async function deactivate(): Promise<void> {
    logger?.info('Darwin Gödel Machine VSCode Extension is deactivating...');

    try {
        // Cleanup evolution engine
        if (evolutionEngine) {
            await evolutionEngine.shutdown();
        }

        // Finalize telemetry
        if (telemetryCollector) {
            telemetryCollector.trackEvent('extension.deactivated');
            await telemetryCollector.flush();
        }

        logger?.info('Darwin Gödel Machine VSCode Extension deactivated successfully');
    } catch (error) {
        logger?.error('Error during deactivation', error);
    }
}