import { 
    PerformanceTrace, 
    TraceStatus, 
    MetricUnit 
} from '@shared/types';
import { Logger } from '@shared/utils/Logger';
import { TelemetryCollector } from './TelemetryCollector';

export interface PerformanceThreshold {
    metric: string;
    warning: number;
    critical: number;
    unit: MetricUnit;
}

export interface SystemMetrics {
    memory: {
        used: number;
        total: number;
        percentage: number;
    };
    cpu: {
        usage: number;
        processes: number;
    };
    heap: {
        used: number;
        total: number;
        percentage: number;
    };
}

export class PerformanceMonitor {
    private readonly logger = new Logger('PerformanceMonitor');
    private readonly traces: Map<string, PerformanceTrace> = new Map();
    private readonly thresholds: Map<string, PerformanceThreshold> = new Map();
    private monitoringInterval?: NodeJS.Timer;
    private isMonitoring = false;

    constructor(private readonly telemetryCollector: TelemetryCollector) {
        this.initializeDefaultThresholds();
    }

    startTrace(name: string, parent?: string): string {
        const traceId = this.generateTraceId();
        const trace: PerformanceTrace = {
            id: traceId,
            name,
            startTime: Date.now(),
            status: TraceStatus.Started,
            parent,
            children: [],
            metadata: {}
        };

        // Link to parent
        if (parent && this.traces.has(parent)) {
            const parentTrace = this.traces.get(parent)!;
            parentTrace.children.push(traceId);
            this.traces.set(parent, parentTrace);
        }

        this.traces.set(traceId, trace);
        
        this.logger.debug('Performance trace started', { traceId, name, parent });
        return traceId;
    }

    updateTrace(traceId: string, status: TraceStatus, metadata?: Record<string, unknown>): void {
        const trace = this.traces.get(traceId);
        if (!trace) {
            this.logger.warn('Trace not found for update', { traceId });
            return;
        }

        trace.status = status;
        if (metadata) {
            trace.metadata = { ...trace.metadata, ...metadata };
        }

        this.traces.set(traceId, trace);
    }

    endTrace(traceId: string, status: TraceStatus = TraceStatus.Completed): number {
        const trace = this.traces.get(traceId);
        if (!trace) {
            this.logger.warn('Trace not found for ending', { traceId });
            return 0;
        }

        const endTime = Date.now();
        const duration = endTime - trace.startTime;

        trace.endTime = endTime;
        trace.duration = duration;
        trace.status = status;

        this.traces.set(traceId, trace);

        // Track performance metric
        this.telemetryCollector.trackPerformance(trace.name, trace.startTime, endTime);

        // Check thresholds
        this.checkThreshold(trace.name, duration);

        this.logger.debug('Performance trace ended', { 
            traceId, 
            name: trace.name, 
            duration, 
            status 
        });

        return duration;
    }

    measureAsync<T>(name: string, fn: () => Promise<T>, parent?: string): Promise<T> {
        const traceId = this.startTrace(name, parent);
        
        return fn()
            .then(result => {
                this.endTrace(traceId, TraceStatus.Completed);
                return result;
            })
            .catch(error => {
                this.endTrace(traceId, TraceStatus.Failed);
                this.updateTrace(traceId, TraceStatus.Failed, { 
                    error: error.message 
                });
                throw error;
            });
    }

    measureSync<T>(name: string, fn: () => T, parent?: string): T {
        const traceId = this.startTrace(name, parent);
        
        try {
            const result = fn();
            this.endTrace(traceId, TraceStatus.Completed);
            return result;
        } catch (error) {
            this.endTrace(traceId, TraceStatus.Failed);
            this.updateTrace(traceId, TraceStatus.Failed, { 
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    getSystemMetrics(): SystemMetrics {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        return {
            memory: {
                used: memoryUsage.rss,
                total: memoryUsage.rss + memoryUsage.external,
                percentage: (memoryUsage.rss / (memoryUsage.rss + memoryUsage.external)) * 100
            },
            cpu: {
                usage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
                processes: 1 // Single process for extension
            },
            heap: {
                used: memoryUsage.heapUsed,
                total: memoryUsage.heapTotal,
                percentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
            }
        };
    }

    startSystemMonitoring(intervalMs: number = 30000): void {
        if (this.isMonitoring) {
            return;
        }

        this.isMonitoring = true;
        this.monitoringInterval = setInterval(() => {
            this.collectSystemMetrics();
        }, intervalMs);

        this.logger.info('System monitoring started', { intervalMs });
    }

    stopSystemMonitoring(): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = undefined;
        }
        this.isMonitoring = false;
        this.logger.info('System monitoring stopped');
    }

    setThreshold(metric: string, warning: number, critical: number, unit: MetricUnit): void {
        this.thresholds.set(metric, { metric, warning, critical, unit });
        this.logger.debug('Performance threshold set', { metric, warning, critical, unit });
    }

    getTrace(traceId: string): PerformanceTrace | undefined {
        return this.traces.get(traceId);
    }

    getTraceTree(rootTraceId: string): PerformanceTrace | null {
        const rootTrace = this.traces.get(rootTraceId);
        if (!rootTrace) {
            return null;
        }

        const buildTree = (trace: PerformanceTrace): PerformanceTrace => {
            const children = trace.children.map(childId => {
                const childTrace = this.traces.get(childId);
                return childTrace ? buildTree(childTrace) : null;
            }).filter(Boolean) as PerformanceTrace[];

            return {
                ...trace,
                children: children.map(c => c.id)
            };
        };

        return buildTree(rootTrace);
    }

    getPerformanceSummary(timeWindow?: number): {
        totalTraces: number;
        averageDuration: number;
        successRate: number;
        slowestOperations: Array<{ name: string; duration: number }>;
        failedOperations: Array<{ name: string; error: string }>;
    } {
        let traces = Array.from(this.traces.values());

        if (timeWindow) {
            const cutoff = Date.now() - timeWindow;
            traces = traces.filter(t => t.startTime > cutoff);
        }

        const completedTraces = traces.filter(t => t.duration !== undefined);
        const failedTraces = traces.filter(t => t.status === TraceStatus.Failed);

        const totalTraces = traces.length;
        const averageDuration = completedTraces.length > 0 
            ? completedTraces.reduce((sum, t) => sum + (t.duration || 0), 0) / completedTraces.length
            : 0;
        const successRate = totalTraces > 0 
            ? (totalTraces - failedTraces.length) / totalTraces 
            : 1;

        const slowestOperations = completedTraces
            .sort((a, b) => (b.duration || 0) - (a.duration || 0))
            .slice(0, 10)
            .map(t => ({ name: t.name, duration: t.duration || 0 }));

        const failedOperations = failedTraces
            .slice(0, 10)
            .map(t => ({ 
                name: t.name, 
                error: t.metadata?.error as string || 'Unknown error' 
            }));

        return {
            totalTraces,
            averageDuration,
            successRate,
            slowestOperations,
            failedOperations
        };
    }

    clearOldTraces(maxAge: number = 24 * 60 * 60 * 1000): void {
        const cutoff = Date.now() - maxAge;
        const toDelete: string[] = [];

        for (const [id, trace] of this.traces) {
            if (trace.startTime < cutoff) {
                toDelete.push(id);
            }
        }

        toDelete.forEach(id => this.traces.delete(id));
        
        this.logger.info('Old traces cleared', { count: toDelete.length });
    }

    private initializeDefaultThresholds(): void {
        // Evolution cycle thresholds
        this.setThreshold('evolution_cycle', 5000, 15000, MetricUnit.Milliseconds);
        
        // Agent execution thresholds
        this.setThreshold('agent_execution', 3000, 10000, MetricUnit.Milliseconds);
        
        // Code generation thresholds
        this.setThreshold('code_generation', 2000, 8000, MetricUnit.Milliseconds);
        
        // Memory usage thresholds
        this.setThreshold('memory_usage', 512, 1024, MetricUnit.Megabytes);
        
        // CPU usage thresholds
        this.setThreshold('cpu_usage', 70, 90, MetricUnit.Percentage);
    }

    private collectSystemMetrics(): void {
        const metrics = this.getSystemMetrics();

        // Track memory metrics
        this.telemetryCollector.trackMetric(
            'system.memory.used', 
            metrics.memory.used / (1024 * 1024), // Convert to MB
            MetricUnit.Megabytes
        );

        this.telemetryCollector.trackMetric(
            'system.memory.percentage', 
            metrics.memory.percentage,
            MetricUnit.Percentage
        );

        // Track heap metrics
        this.telemetryCollector.trackMetric(
            'system.heap.used', 
            metrics.heap.used / (1024 * 1024), // Convert to MB
            MetricUnit.Megabytes
        );

        this.telemetryCollector.trackMetric(
            'system.heap.percentage', 
            metrics.heap.percentage,
            MetricUnit.Percentage
        );

        // Check memory thresholds
        const memoryMB = metrics.memory.used / (1024 * 1024);
        this.checkThreshold('memory_usage', memoryMB);

        // Check heap thresholds
        this.checkThreshold('cpu_usage', metrics.heap.percentage);
    }

    private checkThreshold(metricName: string, value: number): void {
        const threshold = this.thresholds.get(metricName);
        if (!threshold) {
            return;
        }

        if (value >= threshold.critical) {
            this.logger.error(`Critical performance threshold exceeded for ${metricName}`, {
                metric: metricName,
                value,
                threshold: threshold.critical,
                unit: threshold.unit
            });

            this.telemetryCollector.trackEvent(
                'performance.threshold.critical',
                { metric: metricName, value, threshold: threshold.critical },
                {},
                undefined,
                'critical'
            );
        } else if (value >= threshold.warning) {
            this.logger.warn(`Performance warning threshold exceeded for ${metricName}`, {
                metric: metricName,
                value,
                threshold: threshold.warning,
                unit: threshold.unit
            });

            this.telemetryCollector.trackEvent(
                'performance.threshold.warning',
                { metric: metricName, value, threshold: threshold.warning },
                {},
                undefined,
                'warning'
            );
        }
    }

    private generateTraceId(): string {
        return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    dispose(): void {
        this.stopSystemMonitoring();
        this.traces.clear();
        this.logger.info('Performance monitor disposed');
    }
}