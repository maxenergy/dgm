import * as vscode from 'vscode';
import { 
    UserFeedback, 
    FeedbackType, 
    FeedbackContext,
    EventLevel 
} from '@shared/types';
import { Logger } from '@shared/utils/Logger';
import { TelemetryCollector } from './TelemetryCollector';

export interface FeedbackPrompt {
    id: string;
    type: FeedbackType;
    title: string;
    message: string;
    trigger: FeedbackTrigger;
    context?: FeedbackContext;
}

export interface FeedbackTrigger {
    type: 'time' | 'event' | 'error' | 'performance' | 'manual';
    condition?: string;
    threshold?: number;
}

export interface FeedbackSummary {
    totalFeedback: number;
    averageRating?: number;
    feedbackByType: Record<FeedbackType, number>;
    commonThemes: string[];
    recentTrends: {
        satisfactionTrend: 'improving' | 'declining' | 'stable';
        bugReportTrend: 'increasing' | 'decreasing' | 'stable';
    };
}

export class UserFeedbackManager implements vscode.Disposable {
    private readonly logger = new Logger('UserFeedbackManager');
    private readonly feedback: UserFeedback[] = [];
    private readonly prompts: FeedbackPrompt[] = [];
    private readonly maxFeedback = 500;
    private promptTimer?: NodeJS.Timer;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly telemetryCollector: TelemetryCollector
    ) {
        this.initializeDefaultPrompts();
        this.loadFeedbackHistory();
        this.startPeriodicPrompts();
    }

    async collectFeedback(
        type: FeedbackType,
        context?: FeedbackContext,
        prefilledData?: Partial<UserFeedback>
    ): Promise<UserFeedback | null> {
        try {
            const feedbackData = await this.showFeedbackDialog(type, prefilledData);
            
            if (!feedbackData) {
                return null;
            }

            const feedback: UserFeedback = {
                id: this.generateFeedbackId(),
                timestamp: Date.now(),
                type,
                context: context || {},
                metadata: {
                    vscodeVersion: vscode.version,
                    extensionVersion: this.context.extension.packageJSON.version,
                    platform: process.platform
                },
                ...feedbackData
            };

            this.feedback.push(feedback);
            
            // Keep only recent feedback
            if (this.feedback.length > this.maxFeedback) {
                this.feedback.splice(0, this.feedback.length - this.maxFeedback);
            }

            // Track in telemetry
            this.telemetryCollector.trackUserFeedback(
                type, 
                feedback.rating, 
                feedback.comment, 
                context
            );

            // Persist to storage
            await this.saveFeedbackHistory();

            this.logger.info('User feedback collected', {
                type,
                hasRating: feedback.rating !== undefined,
                hasComment: feedback.comment !== undefined
            });

            return feedback;

        } catch (error) {
            this.logger.error('Failed to collect user feedback', error);
            return null;
        }
    }

    async promptForFeedback(prompt: FeedbackPrompt): Promise<boolean> {
        const action = await vscode.window.showInformationMessage(
            prompt.message,
            { modal: false },
            'Provide Feedback',
            'Not Now',
            'Don\'t Ask Again'
        );

        switch (action) {
            case 'Provide Feedback':
                const feedback = await this.collectFeedback(prompt.type, prompt.context);
                return feedback !== null;
            
            case 'Don\'t Ask Again':
                await this.disablePrompt(prompt.id);
                return false;
            
            default:
                return false;
        }
    }

    registerPrompt(prompt: FeedbackPrompt): void {
        this.prompts.push(prompt);
        this.logger.info('Feedback prompt registered', { 
            id: prompt.id, 
            type: prompt.type 
        });
    }

    async disablePrompt(promptId: string): Promise<void> {
        const disabledPrompts = this.context.globalState.get<string[]>('disabledFeedbackPrompts', []);
        if (!disabledPrompts.includes(promptId)) {
            disabledPrompts.push(promptId);
            await this.context.globalState.update('disabledFeedbackPrompts', disabledPrompts);
        }
    }

    triggerSatisfactionSurvey(context?: FeedbackContext): void {
        // Only prompt if haven't asked recently
        const lastSurvey = this.context.globalState.get<number>('lastSatisfactionSurvey', 0);
        const daysSinceLastSurvey = (Date.now() - lastSurvey) / (24 * 60 * 60 * 1000);
        
        if (daysSinceLastSurvey >= 7) {
            const prompt: FeedbackPrompt = {
                id: 'satisfaction-survey',
                type: FeedbackType.Satisfaction,
                title: 'Rate Your Experience',
                message: 'How satisfied are you with the Darwin Gödel Machine extension?',
                trigger: { type: 'manual' },
                context
            };
            
            this.promptForFeedback(prompt);
            this.context.globalState.update('lastSatisfactionSurvey', Date.now());
        }
    }

    triggerBugReport(errorContext: Record<string, unknown>): void {
        const prompt: FeedbackPrompt = {
            id: 'bug-report',
            type: FeedbackType.BugReport,
            title: 'Report Issue',
            message: 'We noticed an error occurred. Would you like to report it?',
            trigger: { type: 'error' },
            context: { errorId: 'error-' + Date.now(), ...errorContext }
        };
        
        this.promptForFeedback(prompt);
    }

    getFeedbackSummary(timeWindow?: number): FeedbackSummary {
        let relevantFeedback = this.feedback;
        
        if (timeWindow) {
            const cutoff = Date.now() - timeWindow;
            relevantFeedback = this.feedback.filter(f => f.timestamp > cutoff);
        }

        const totalFeedback = relevantFeedback.length;
        
        // Calculate average rating
        const ratingsOnly = relevantFeedback.filter(f => f.rating !== undefined);
        const averageRating = ratingsOnly.length > 0 
            ? ratingsOnly.reduce((sum, f) => sum + (f.rating || 0), 0) / ratingsOnly.length
            : undefined;

        // Count by type
        const feedbackByType = {} as Record<FeedbackType, number>;
        Object.values(FeedbackType).forEach(type => {
            feedbackByType[type] = relevantFeedback.filter(f => f.type === type).length;
        });

        // Analyze common themes from comments
        const commonThemes = this.extractCommonThemes(relevantFeedback);

        // Analyze trends
        const recentTrends = this.analyzeTrends(relevantFeedback);

        return {
            totalFeedback,
            averageRating,
            feedbackByType,
            commonThemes,
            recentTrends
        };
    }

    getFeedbackHistory(type?: FeedbackType, limit: number = 50): UserFeedback[] {
        let filtered = type 
            ? this.feedback.filter(f => f.type === type)
            : this.feedback;
        
        return filtered
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    private async showFeedbackDialog(
        type: FeedbackType,
        prefilled?: Partial<UserFeedback>
    ): Promise<Partial<UserFeedback> | null> {
        switch (type) {
            case FeedbackType.Satisfaction:
                return this.showSatisfactionDialog(prefilled);
            
            case FeedbackType.BugReport:
                return this.showBugReportDialog(prefilled);
            
            case FeedbackType.FeatureRequest:
                return this.showFeatureRequestDialog(prefilled);
            
            default:
                return this.showGenericFeedbackDialog(type, prefilled);
        }
    }

    private async showSatisfactionDialog(
        prefilled?: Partial<UserFeedback>
    ): Promise<Partial<UserFeedback> | null> {
        const ratingOptions = [
            { label: '⭐ 1 - Very Dissatisfied', value: 1 },
            { label: '⭐⭐ 2 - Dissatisfied', value: 2 },
            { label: '⭐⭐⭐ 3 - Neutral', value: 3 },
            { label: '⭐⭐⭐⭐ 4 - Satisfied', value: 4 },
            { label: '⭐⭐⭐⭐⭐ 5 - Very Satisfied', value: 5 }
        ];

        const ratingChoice = await vscode.window.showQuickPick(ratingOptions, {
            placeHolder: 'How satisfied are you with the extension?',
            canPickMany: false
        });

        if (!ratingChoice) {
            return null;
        }

        const comment = await vscode.window.showInputBox({
            prompt: 'Any additional comments? (optional)',
            placeHolder: 'Tell us what you like or what could be improved...',
            value: prefilled?.comment
        });

        return {
            rating: ratingChoice.value,
            comment: comment || undefined
        };
    }

    private async showBugReportDialog(
        prefilled?: Partial<UserFeedback>
    ): Promise<Partial<UserFeedback> | null> {
        const comment = await vscode.window.showInputBox({
            prompt: 'Please describe the issue you encountered',
            placeHolder: 'What happened? What were you trying to do?',
            value: prefilled?.comment
        });

        if (!comment) {
            return null;
        }

        return { comment };
    }

    private async showFeatureRequestDialog(
        prefilled?: Partial<UserFeedback>
    ): Promise<Partial<UserFeedback> | null> {
        const comment = await vscode.window.showInputBox({
            prompt: 'What feature would you like to see?',
            placeHolder: 'Describe the feature and how it would help you...',
            value: prefilled?.comment
        });

        if (!comment) {
            return null;
        }

        return { comment };
    }

    private async showGenericFeedbackDialog(
        type: FeedbackType,
        prefilled?: Partial<UserFeedback>
    ): Promise<Partial<UserFeedback> | null> {
        const comment = await vscode.window.showInputBox({
            prompt: `Please provide your ${type} feedback`,
            placeHolder: 'Your feedback is valuable to us...',
            value: prefilled?.comment
        });

        if (!comment) {
            return null;
        }

        return { comment };
    }

    private initializeDefaultPrompts(): void {
        // Satisfaction survey after successful use
        this.registerPrompt({
            id: 'post-success-satisfaction',
            type: FeedbackType.Satisfaction,
            title: 'How was your experience?',
            message: 'We see you\'ve been using the extension successfully. How would you rate your experience?',
            trigger: {
                type: 'event',
                condition: 'code.generated',
                threshold: 5
            }
        });

        // Bug report after errors
        this.registerPrompt({
            id: 'post-error-bug-report',
            type: FeedbackType.BugReport,
            title: 'Report Issue',
            message: 'Something went wrong. Would you like to help us fix it?',
            trigger: {
                type: 'error'
            }
        });

        // Feature request for power users
        this.registerPrompt({
            id: 'power-user-feature-request',
            type: FeedbackType.FeatureRequest,
            title: 'Suggest Features',
            message: 'You\'re an active user! Any features you\'d like to see?',
            trigger: {
                type: 'time',
                threshold: 7 * 24 * 60 * 60 * 1000 // 7 days of use
            }
        });
    }

    private extractCommonThemes(feedback: UserFeedback[]): string[] {
        const comments = feedback
            .filter(f => f.comment)
            .map(f => f.comment!.toLowerCase());

        if (comments.length === 0) {
            return [];
        }

        // Simple keyword frequency analysis
        const keywords = new Map<string, number>();
        const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'this', 'that', 'these', 'those']);

        comments.forEach(comment => {
            const words = comment.match(/\b\w+\b/g) || [];
            words.forEach(word => {
                if (word.length > 3 && !commonWords.has(word)) {
                    keywords.set(word, (keywords.get(word) || 0) + 1);
                }
            });
        });

        return Array.from(keywords.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word]) => word);
    }

    private analyzeTrends(feedback: UserFeedback[]): FeedbackSummary['recentTrends'] {
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const recent = feedback.filter(f => f.timestamp > thirtyDaysAgo);
        const older = feedback.filter(f => f.timestamp <= thirtyDaysAgo);

        // Satisfaction trend
        const recentSatisfaction = recent
            .filter(f => f.rating !== undefined)
            .reduce((sum, f) => sum + (f.rating || 0), 0) / recent.length || 0;
        
        const olderSatisfaction = older
            .filter(f => f.rating !== undefined)
            .reduce((sum, f) => sum + (f.rating || 0), 0) / older.length || 0;

        const satisfactionTrend = recentSatisfaction > olderSatisfaction + 0.2 ? 'improving' :
                                 recentSatisfaction < olderSatisfaction - 0.2 ? 'declining' : 'stable';

        // Bug report trend
        const recentBugReports = recent.filter(f => f.type === FeedbackType.BugReport).length;
        const olderBugReports = older.filter(f => f.type === FeedbackType.BugReport).length;
        
        const recentBugRate = recent.length > 0 ? recentBugReports / recent.length : 0;
        const olderBugRate = older.length > 0 ? olderBugReports / older.length : 0;

        const bugReportTrend = recentBugRate > olderBugRate + 0.1 ? 'increasing' :
                              recentBugRate < olderBugRate - 0.1 ? 'decreasing' : 'stable';

        return {
            satisfactionTrend,
            bugReportTrend
        };
    }

    private generateFeedbackId(): string {
        return `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private async saveFeedbackHistory(): Promise<void> {
        try {
            await this.context.globalState.update('userFeedback', this.feedback);
        } catch (error) {
            this.logger.error('Failed to save feedback history', error);
        }
    }

    private async loadFeedbackHistory(): Promise<void> {
        try {
            const saved = this.context.globalState.get<UserFeedback[]>('userFeedback', []);
            this.feedback.push(...saved);
        } catch (error) {
            this.logger.error('Failed to load feedback history', error);
        }
    }

    private startPeriodicPrompts(): void {
        // Check for triggered prompts every hour
        this.promptTimer = setInterval(() => {
            this.checkTriggeredPrompts();
        }, 60 * 60 * 1000);
    }

    private async checkTriggeredPrompts(): Promise<void> {
        const disabledPrompts = this.context.globalState.get<string[]>('disabledFeedbackPrompts', []);
        
        for (const prompt of this.prompts) {
            if (disabledPrompts.includes(prompt.id)) {
                continue;
            }

            if (await this.shouldTriggerPrompt(prompt)) {
                this.promptForFeedback(prompt);
                break; // Only show one prompt at a time
            }
        }
    }

    private async shouldTriggerPrompt(prompt: FeedbackPrompt): Promise<boolean> {
        const lastShown = this.context.globalState.get<number>(`lastPrompt_${prompt.id}`, 0);
        const hoursSinceLastShown = (Date.now() - lastShown) / (60 * 60 * 1000);
        
        // Don't show the same prompt more than once per day
        if (hoursSinceLastShown < 24) {
            return false;
        }

        // Check trigger conditions
        switch (prompt.trigger.type) {
            case 'time':
                return prompt.trigger.threshold ? 
                       (Date.now() - this.context.globalState.get<number>('extensionFirstUse', Date.now())) > prompt.trigger.threshold :
                       false;
            
            case 'event':
                // Would check event frequency here
                return false;
            
            default:
                return false;
        }
    }

    dispose(): void {
        if (this.promptTimer) {
            clearInterval(this.promptTimer);
        }
    }
}