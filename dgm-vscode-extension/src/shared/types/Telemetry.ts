export interface TelemetryEvent {
    id: string;
    name: string;
    timestamp: number;
    properties: Record<string, unknown>;
    measurements?: Record<string, number>;
    category: EventCategory;
    level: EventLevel;
    userId?: string;
    sessionId: string;
}

export enum EventCategory {
    Extension = 'extension',
    Evolution = 'evolution',
    Agent = 'agent',
    User = 'user',
    Performance = 'performance',
    Error = 'error',
    Security = 'security'
}

export enum EventLevel {
    Verbose = 'verbose',
    Info = 'info',
    Warning = 'warning',
    Error = 'error',
    Critical = 'critical'
}

export interface TelemetryMetric {
    name: string;
    value: number;
    unit: MetricUnit;
    timestamp: number;
    tags: Record<string, string>;
}

export enum MetricUnit {
    Count = 'count',
    Milliseconds = 'milliseconds',
    Seconds = 'seconds',
    Bytes = 'bytes',
    Kilobytes = 'kilobytes',
    Megabytes = 'megabytes',
    Percentage = 'percentage',
    Ratio = 'ratio'
}

export interface UserFeedback {
    id: string;
    timestamp: number;
    type: FeedbackType;
    rating?: number;
    comment?: string;
    context: FeedbackContext;
    metadata: Record<string, unknown>;
}

export enum FeedbackType {
    Satisfaction = 'satisfaction',
    BugReport = 'bug-report',
    FeatureRequest = 'feature-request',
    Performance = 'performance',
    Suggestion = 'suggestion'
}

export interface FeedbackContext {
    agentId?: string;
    taskId?: string;
    feature?: string;
    errorId?: string;
}

export interface PerformanceTrace {
    id: string;
    name: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    status: TraceStatus;
    parent?: string;
    children: string[];
    metadata: Record<string, unknown>;
}

export enum TraceStatus {
    Started = 'started',
    InProgress = 'in-progress',
    Completed = 'completed',
    Failed = 'failed',
    Cancelled = 'cancelled'
}

export interface ErrorReport {
    id: string;
    timestamp: number;
    error: ErrorDetails;
    context: ErrorContext;
    impact: ErrorImpact;
    resolution?: ErrorResolution;
}

export interface ErrorDetails {
    name: string;
    message: string;
    stack?: string;
    code?: string;
    type: ErrorType;
}

export enum ErrorType {
    Syntax = 'syntax',
    Runtime = 'runtime',
    Logic = 'logic',
    Network = 'network',
    Security = 'security',
    Configuration = 'configuration',
    Unknown = 'unknown'
}

export interface ErrorContext {
    component: string;
    method: string;
    file?: string;
    line?: number;
    userId?: string;
    sessionId: string;
    environment: Record<string, unknown>;
}

export interface ErrorImpact {
    severity: ErrorSeverity;
    affectedUsers: number;
    frequency: number;
    firstOccurrence: number;
    lastOccurrence: number;
}

export enum ErrorSeverity {
    Low = 'low',
    Medium = 'medium',
    High = 'high',
    Critical = 'critical'
}

export interface ErrorResolution {
    status: ResolutionStatus;
    fixedIn?: string;
    workaround?: string;
    notes?: string;
}

export enum ResolutionStatus {
    Open = 'open',
    InProgress = 'in-progress',
    Fixed = 'fixed',
    WontFix = 'wont-fix',
    Duplicate = 'duplicate'
}

export interface TelemetrySession {
    id: string;
    userId?: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    events: string[];
    metrics: string[];
    errors: string[];
    metadata: SessionMetadata;
}

export interface SessionMetadata {
    vscodeVersion: string;
    extensionVersion: string;
    platform: string;
    language: string;
    theme: string;
    workspaceType?: string;
}

export interface TelemetryConfiguration {
    enabled: boolean;
    anonymize: boolean;
    sampleRate: number;
    excludePatterns: string[];
    includeStackTraces: boolean;
    maxEventsPerSession: number;
    flushInterval: number;
    endpoint?: string;
}

export interface TelemetryReport {
    period: ReportPeriod;
    summary: ReportSummary;
    topEvents: EventSummary[];
    errorTrends: ErrorTrend[];
    performanceMetrics: PerformanceMetric[];
    userEngagement: EngagementMetric[];
}

export interface ReportPeriod {
    start: number;
    end: number;
    timezone: string;
}

export interface ReportSummary {
    totalEvents: number;
    uniqueUsers: number;
    sessions: number;
    errors: number;
    averageSessionDuration: number;
}

export interface EventSummary {
    name: string;
    count: number;
    uniqueUsers: number;
    trend: TrendDirection;
}

export enum TrendDirection {
    Up = 'up',
    Down = 'down',
    Stable = 'stable'
}

export interface ErrorTrend {
    type: ErrorType;
    count: number;
    change: number;
    topErrors: ErrorDetails[];
}

export interface PerformanceMetric {
    name: string;
    p50: number;
    p95: number;
    p99: number;
    mean: number;
    stdDev: number;
}

export interface EngagementMetric {
    feature: string;
    usage: number;
    retention: number;
    satisfaction?: number;
}

// Privacy helpers
export interface PrivacyFilter {
    shouldAnonymize(field: string): boolean;
    anonymize(value: unknown): unknown;
    isPersonalData(field: string): boolean;
}

export class DefaultPrivacyFilter implements PrivacyFilter {
    private personalDataFields = new Set([
        'userId',
        'email',
        'username',
        'filepath',
        'workspacePath'
    ]);

    shouldAnonymize(field: string): boolean {
        return this.personalDataFields.has(field.toLowerCase());
    }

    anonymize(value: unknown): unknown {
        if (typeof value === 'string') {
            return this.hashString(value);
        }
        return '[REDACTED]';
    }

    isPersonalData(field: string): boolean {
        return this.personalDataFields.has(field.toLowerCase());
    }

    private hashString(str: string): string {
        // Simple hash for demonstration - in production use proper hashing
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `anon_${Math.abs(hash).toString(36)}`;
    }
}

// Type guards
export function isTelemetryEvent(obj: unknown): obj is TelemetryEvent {
    return typeof obj === 'object' && 
           obj !== null && 
           'name' in obj && 
           'timestamp' in obj && 
           'category' in obj;
}

export function isErrorReport(obj: unknown): obj is ErrorReport {
    return typeof obj === 'object' && 
           obj !== null && 
           'error' in obj && 
           'context' in obj && 
           'impact' in obj;
}