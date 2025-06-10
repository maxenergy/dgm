import * as vscode from 'vscode';
import { 
    TelemetryEvent, 
    TelemetryMetric, 
    EventCategory, 
    EventLevel, 
    MetricUnit,
    TelemetryConfiguration,
    DefaultPrivacyFilter
} from '@shared/types';
import { Logger } from '@shared/utils/Logger';
import { ConfigurationManager } from '@api/vscode/ConfigurationManager';

export class TelemetryCollector implements vscode.Disposable {
    private readonly logger = new Logger('TelemetryCollector');
    private readonly events: TelemetryEvent[] = [];
    private readonly metrics: TelemetryMetric[] = [];
    private readonly privacyFilter = new DefaultPrivacyFilter();
    private readonly maxEvents = 1000;
    private sessionId: string;
    private flushTimer?: NodeJS.Timer;
    private isInitialized = false;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly configManager: ConfigurationManager
    ) {
        this.sessionId = this.generateSessionId();
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            // Start flush timer
            this.startFlushTimer();

            // Track session start
            this.trackEvent('session.started', {
                sessionId: this.sessionId,
                vscodeVersion: vscode.version,
                extensionVersion: this.context.extension.packageJSON.version,
                platform: process.platform,
                architecture: process.arch
            });

            this.isInitialized = true;
            this.logger.info('Telemetry collector initialized', { sessionId: this.sessionId });

        } catch (error) {
            this.logger.error('Failed to initialize telemetry collector', error);
            throw error;
        }
    }

    trackEvent(
        name: string, 
        properties: Record<string, unknown> = {},
        measurements: Record<string, number> = {},
        category: EventCategory = EventCategory.Extension,
        level: EventLevel = EventLevel.Info
    ): void {
        if (!this.isEnabled()) {
            return;
        }

        const config = this.configManager.getTelemetryConfiguration();
        
        // Apply privacy filter
        const filteredProperties = this.applyPrivacyFilter(properties, config);

        const event: TelemetryEvent = {
            id: this.generateEventId(),
            name,
            timestamp: Date.now(),
            properties: filteredProperties,
            measurements,
            category,
            level,
            sessionId: this.sessionId
        };

        // Add user ID if available and allowed
        if (!config.anonymize) {
            event.userId = this.getUserId();
        }

        this.events.push(event);
        
        // Keep only recent events
        if (this.events.length > this.maxEvents) {
            this.events.splice(0, this.events.length - this.maxEvents);
        }

        this.logger.debug('Event tracked', {
            name,
            category,
            level,
            propertiesCount: Object.keys(filteredProperties).length
        });

        // Immediately flush critical events
        if (level === EventLevel.Critical) {
            this.flush();
        }
    }

    trackMetric(
        name: string,
        value: number,
        unit: MetricUnit = MetricUnit.Count,
        tags: Record<string, string> = {}
    ): void {
        if (!this.isEnabled()) {
            return;
        }

        const metric: TelemetryMetric = {
            name,
            value,
            unit,
            timestamp: Date.now(),
            tags
        };

        this.metrics.push(metric);

        this.logger.debug('Metric tracked', { name, value, unit });
    }

    trackPerformance(name: string, startTime: number, endTime: number = Date.now()): void {
        const duration = endTime - startTime;
        this.trackMetric(`performance.${name}`, duration, MetricUnit.Milliseconds);
    }

    trackError(error: Error, context?: Record<string, unknown>): void {
        this.trackEvent('error.occurred', {
            errorName: error.name,
            errorMessage: error.message,
            errorStack: this.shouldIncludeStack() ? error.stack : undefined,
            context
        }, {}, EventCategory.Error, EventLevel.Error);
    }

    trackUserFeedback(
        type: 'satisfaction' | 'bug-report' | 'feature-request',
        rating?: number,
        comment?: string,
        context?: Record<string, unknown>
    ): void {
        this.trackEvent('user.feedback', {
            feedbackType: type,
            rating,
            comment: comment ? this.anonymizeText(comment) : undefined,
            context
        }, {}, EventCategory.User, EventLevel.Info);
    }

    trackAgentExecution(
        agentId: string,
        agentType: string,
        action: string,
        success: boolean,
        duration: number,
        metadata?: Record<string, unknown>
    ): void {
        this.trackEvent('agent.execution', {
            agentId: this.anonymizeAgentId(agentId),
            agentType,
            action,
            success,
            metadata
        }, {
            duration
        }, EventCategory.Agent, success ? EventLevel.Info : EventLevel.Warning);
    }

    trackEvolution(
        generation: number,
        populationSize: number,
        averageFitness: number,
        bestFitness: number,
        mutationsApplied: number,
        mutationsSuccessful: number
    ): void {
        this.trackEvent('evolution.cycle', {
            generation,
            populationSize,
            successRate: mutationsApplied > 0 ? mutationsSuccessful / mutationsApplied : 0
        }, {
            averageFitness,
            bestFitness,
            mutationsApplied,
            mutationsSuccessful
        }, EventCategory.Evolution, EventLevel.Info);
    }

    trackCodeGeneration(
        linesGenerated: number,
        tokensUsed: number,
        qualityScore: number,
        language: string
    ): void {
        this.trackMetric('code.lines_generated', linesGenerated);
        this.trackMetric('code.tokens_used', tokensUsed);
        this.trackMetric('code.quality_score', qualityScore, MetricUnit.Ratio);
        
        this.trackEvent('code.generated', {
            language,
            qualityScore
        }, {
            linesGenerated,
            tokensUsed
        }, EventCategory.Agent, EventLevel.Info);
    }

    async flush(): Promise<void> {
        if (this.events.length === 0 && this.metrics.length === 0) {
            return;
        }

        try {
            const config = this.configManager.getTelemetryConfiguration();
            
            if (config.endpoint) {
                await this.sendToEndpoint(config.endpoint);
            } else {
                await this.persistLocal();
            }

            this.events.length = 0;
            this.metrics.length = 0;

            this.logger.debug('Telemetry data flushed');

        } catch (error) {
            this.logger.error('Failed to flush telemetry data', error);
        }
    }

    getSessionStatistics(): {
        sessionId: string;
        eventsCount: number;
        metricsCount: number;
        sessionDuration: number;
    } {
        const sessionStart = this.events.find(e => e.name === 'session.started');
        const sessionDuration = sessionStart ? Date.now() - sessionStart.timestamp : 0;

        return {
            sessionId: this.sessionId,
            eventsCount: this.events.length,
            metricsCount: this.metrics.length,
            sessionDuration
        };
    }

    private isEnabled(): boolean {
        return this.configManager.isTelemetryEnabled();
    }

    private shouldIncludeStack(): boolean {
        const config = this.configManager.getTelemetryConfiguration();
        return config.includeStackTraces;
    }

    private applyPrivacyFilter(
        properties: Record<string, unknown>,
        config: TelemetryConfiguration
    ): Record<string, unknown> {
        if (!config.anonymize) {
            return properties;
        }

        const filtered: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(properties)) {
            if (this.privacyFilter.shouldAnonymize(key)) {
                filtered[key] = this.privacyFilter.anonymize(value);
            } else {
                filtered[key] = value;
            }
        }

        return filtered;
    }

    private anonymizeText(text: string): string {
        // Remove potential PII from text
        return text
            .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
            .replace(/\b\d{3}-\d{3}-\d{4}\b/g, '[PHONE]')
            .replace(/\b\d{3,4}\s\d{3,4}\s\d{4}\b/g, '[PHONE]')
            .replace(/\b[A-Z]{1,2}\d{1,2}[A-Z]?\s\d[A-Z]{2}\b/gi, '[POSTCODE]');
    }

    private anonymizeAgentId(agentId: string): string {
        const config = this.configManager.getTelemetryConfiguration();
        return config.anonymize ? this.privacyFilter.anonymize(agentId) as string : agentId;
    }

    private getUserId(): string | undefined {
        // In a real implementation, this would get the user ID from VSCode
        // For now, return undefined to maintain privacy
        return undefined;
    }

    private generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateEventId(): string {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private startFlushTimer(): void {
        const config = this.configManager.getTelemetryConfiguration();
        
        this.flushTimer = setInterval(() => {
            this.flush();
        }, config.flushInterval);
    }

    private async sendToEndpoint(endpoint: string): Promise<void> {
        // Implementation would send data to telemetry endpoint
        // For now, just log the action
        this.logger.info('Sending telemetry to endpoint', {
            endpoint,
            eventsCount: this.events.length,
            metricsCount: this.metrics.length
        });
    }

    private async persistLocal(): Promise<void> {
        try {
            const telemetryData = {
                events: this.events,
                metrics: this.metrics,
                sessionId: this.sessionId,
                timestamp: Date.now()
            };

            // Store in workspace state (local to the workspace)
            await this.context.workspaceState.update('telemetryData', telemetryData);

        } catch (error) {
            this.logger.error('Failed to persist telemetry data locally', error);
        }
    }

    dispose(): void {
        // Track session end
        this.trackEvent('session.ended', {
            sessionDuration: Date.now() - 
                (this.events.find(e => e.name === 'session.started')?.timestamp || Date.now())
        });

        // Final flush
        this.flush();

        // Clean up timer
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        this.logger.info('Telemetry collector disposed');
    }
}