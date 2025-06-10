import * as vscode from 'vscode';
import { Logger } from '@shared/utils/Logger';

export interface NotificationOptions {
    modal?: boolean;
    detail?: string;
}

export class NotificationService {
    private readonly logger = new Logger('NotificationService');

    showWelcomeMessage(): void {
        const message = 'Welcome to Darwin Gödel Machine! The self-evolving coding assistant is now active.';
        
        vscode.window.showInformationMessage(
            message,
            'Learn More',
            'Settings'
        ).then(selection => {
            if (selection === 'Learn More') {
                vscode.env.openExternal(vscode.Uri.parse('https://github.com/dgm-dev-team/dgm-vscode-extension'));
            } else if (selection === 'Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'dgm');
            }
        });
    }

    showInfo(message: string, options?: NotificationOptions): Thenable<string | undefined> {
        this.logger.info(`Info notification: ${message}`);
        return vscode.window.showInformationMessage(message, options);
    }

    showWarning(message: string, options?: NotificationOptions): Thenable<string | undefined> {
        this.logger.warn(`Warning notification: ${message}`);
        return vscode.window.showWarningMessage(message, options);
    }

    showError(message: string, options?: NotificationOptions): Thenable<string | undefined> {
        this.logger.error(`Error notification: ${message}`);
        return vscode.window.showErrorMessage(message, options);
    }

    showProgress<T>(
        title: string,
        task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Thenable<T>
    ): Thenable<T> {
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title,
                cancellable: false
            },
            task
        );
    }
}