import { 
    TelemetryEvent, 
    TelemetryMetric, 
    EventCategory,
    MetricUnit,
    TrendDirection 
} from '@shared/types';
import { Logger } from '@shared/utils/Logger';

export interface MetricStatistics {
    count: number;
    sum: number;
    mean: number;
    median: number;
    min: number;
    max: number;
    stdDev: number;
    p95: number;
    p99: number;
}

export interface TrendAnalysis {
    direction: TrendDirection;
    strength: number; // 0-1, how strong the trend is
    confidence: number; // 0-1, confidence in the trend
    changeRate: number; // rate of change per unit time
}

export interface AnomalyDetection {
    isAnomaly: boolean;
    score: number; // 0-1, how anomalous
    expectedRange: [number, number];
    actualValue: number;
    explanation?: string;
}

export interface PerformanceInsight {
    type: 'bottleneck' | 'improvement' | 'regression' | 'optimization';
    component: string;
    description: string;
    impact: 'low' | 'medium' | 'high' | 'critical';
    recommendation?: string;
    metrics: Record<string, number>;
}

export class MetricsAnalyzer {
    private readonly logger = new Logger('MetricsAnalyzer');
    private readonly metricHistory: Map<string, TelemetryMetric[]> = new Map();
    private readonly eventHistory: Map<string, TelemetryEvent[]> = new Map();
    private readonly maxHistorySize = 1000;

    addMetric(metric: TelemetryMetric): void {
        const history = this.metricHistory.get(metric.name) || [];
        history.push(metric);
        
        // Keep only recent metrics
        if (history.length > this.maxHistorySize) {
            history.splice(0, history.length - this.maxHistorySize);
        }
        
        this.metricHistory.set(metric.name, history);
    }

    addEvent(event: TelemetryEvent): void {
        const history = this.eventHistory.get(event.name) || [];
        history.push(event);
        
        // Keep only recent events
        if (history.length > this.maxHistorySize) {
            history.splice(0, history.length - this.maxHistorySize);
        }
        
        this.eventHistory.set(event.name, history);
    }

    calculateStatistics(metricName: string, timeWindow?: number): MetricStatistics | null {
        const metrics = this.getMetricsInWindow(metricName, timeWindow);
        
        if (metrics.length === 0) {
            return null;
        }

        const values = metrics.map(m => m.value).sort((a, b) => a - b);
        
        const count = values.length;
        const sum = values.reduce((a, b) => a + b, 0);
        const mean = sum / count;
        
        // Calculate median
        const median = count % 2 === 0 
            ? (values[count / 2 - 1] + values[count / 2]) / 2
            : values[Math.floor(count / 2)];
        
        // Calculate standard deviation
        const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
        const stdDev = Math.sqrt(variance);
        
        // Calculate percentiles
        const p95Index = Math.floor(count * 0.95);
        const p99Index = Math.floor(count * 0.99);
        
        return {
            count,
            sum,
            mean,
            median,
            min: values[0],
            max: values[count - 1],
            stdDev,
            p95: values[p95Index],
            p99: values[p99Index]
        };
    }

    analyzeTrend(metricName: string, timeWindow: number = 24 * 60 * 60 * 1000): TrendAnalysis {
        const metrics = this.getMetricsInWindow(metricName, timeWindow);
        
        if (metrics.length < 2) {
            return {
                direction: TrendDirection.Stable,
                strength: 0,
                confidence: 0,
                changeRate: 0
            };
        }

        // Sort by timestamp
        metrics.sort((a, b) => a.timestamp - b.timestamp);
        
        // Simple linear regression
        const n = metrics.length;
        const sumX = metrics.reduce((sum, _, i) => sum + i, 0);
        const sumY = metrics.reduce((sum, m) => sum + m.value, 0);
        const sumXY = metrics.reduce((sum, m, i) => sum + i * m.value, 0);
        const sumXX = metrics.reduce((sum, _, i) => sum + i * i, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        
        // Calculate correlation coefficient for confidence
        const meanX = sumX / n;
        const meanY = sumY / n;
        
        let numSum = 0;
        let denSumX = 0;
        let denSumY = 0;
        
        for (let i = 0; i < n; i++) {
            numSum += (i - meanX) * (metrics[i].value - meanY);
            denSumX += Math.pow(i - meanX, 2);
            denSumY += Math.pow(metrics[i].value - meanY, 2);
        }
        
        const correlation = Math.abs(numSum / Math.sqrt(denSumX * denSumY));
        
        // Determine direction and strength
        const direction = slope > 0.1 ? TrendDirection.Up : 
                         slope < -0.1 ? TrendDirection.Down : 
                         TrendDirection.Stable;
        
        const strength = Math.min(Math.abs(slope) / (meanY || 1), 1);
        
        return {
            direction,
            strength,
            confidence: correlation,
            changeRate: slope
        };
    }

    detectAnomalies(metricName: string, currentValue: number): AnomalyDetection {
        const stats = this.calculateStatistics(metricName);
        
        if (!stats) {
            return {
                isAnomaly: false,
                score: 0,
                expectedRange: [0, 0],
                actualValue: currentValue
            };
        }

        // Use z-score for anomaly detection
        const zScore = Math.abs((currentValue - stats.mean) / stats.stdDev);
        const threshold = 2.5; // 2.5 standard deviations
        
        const isAnomaly = zScore > threshold;
        const score = Math.min(zScore / threshold, 1);
        
        // Expected range based on standard deviation
        const expectedRange: [number, number] = [
            stats.mean - 2 * stats.stdDev,
            stats.mean + 2 * stats.stdDev
        ];

        let explanation: string | undefined;
        if (isAnomaly) {
            if (currentValue > stats.mean) {
                explanation = `Value is ${zScore.toFixed(2)} standard deviations above the mean`;
            } else {
                explanation = `Value is ${zScore.toFixed(2)} standard deviations below the mean`;
            }
        }

        return {
            isAnomaly,
            score,
            expectedRange,
            actualValue: currentValue,
            explanation
        };
    }

    generatePerformanceInsights(): PerformanceInsight[] {
        const insights: PerformanceInsight[] = [];

        // Analyze evolution performance
        const evolutionInsights = this.analyzeEvolutionPerformance();
        insights.push(...evolutionInsights);

        // Analyze agent performance
        const agentInsights = this.analyzeAgentPerformance();
        insights.push(...agentInsights);

        // Analyze code generation performance
        const codeGenInsights = this.analyzeCodeGenerationPerformance();
        insights.push(...codeGenInsights);

        // Analyze error patterns
        const errorInsights = this.analyzeErrorPatterns();
        insights.push(...errorInsights);

        return insights.sort((a, b) => {
            const impactOrder = { critical: 4, high: 3, medium: 2, low: 1 };
            return impactOrder[b.impact] - impactOrder[a.impact];
        });
    }

    getEventFrequency(eventName: string, timeWindow: number = 60 * 60 * 1000): number {
        const events = this.getEventsInWindow(eventName, timeWindow);
        return events.length / (timeWindow / (60 * 60 * 1000)); // events per hour
    }

    getErrorRate(timeWindow: number = 60 * 60 * 1000): number {
        const allEvents = this.getAllEventsInWindow(timeWindow);
        const errorEvents = allEvents.filter(e => e.category === EventCategory.Error);
        
        return allEvents.length > 0 ? errorEvents.length / allEvents.length : 0;
    }

    private analyzeEvolutionPerformance(): PerformanceInsight[] {
        const insights: PerformanceInsight[] = [];

        const avgFitnessStats = this.calculateStatistics('evolution.averageFitness');
        const cycleTimeStats = this.calculateStatistics('performance.evolution_cycle');

        if (avgFitnessStats && avgFitnessStats.mean < 0.5) {
            insights.push({
                type: 'bottleneck',
                component: 'evolution',
                description: 'Average fitness is below optimal threshold',
                impact: 'high',
                recommendation: 'Consider adjusting mutation rate or selection strategy',
                metrics: {
                    averageFitness: avgFitnessStats.mean,
                    targetFitness: 0.7
                }
            });
        }

        if (cycleTimeStats && cycleTimeStats.p95 > 10000) {
            insights.push({
                type: 'bottleneck',
                component: 'evolution',
                description: 'Evolution cycles are taking too long',
                impact: 'medium',
                recommendation: 'Consider reducing population size or optimizing fitness evaluation',
                metrics: {
                    p95CycleTime: cycleTimeStats.p95,
                    targetTime: 5000
                }
            });
        }

        return insights;
    }

    private analyzeAgentPerformance(): PerformanceInsight[] {
        const insights: PerformanceInsight[] = [];

        const executionTimeStats = this.calculateStatistics('performance.agent_execution');
        const successRateStats = this.calculateStatistics('agent.success_rate');

        if (executionTimeStats && executionTimeStats.p95 > 5000) {
            insights.push({
                type: 'bottleneck',
                component: 'agents',
                description: 'Agent execution times are high',
                impact: 'medium',
                recommendation: 'Review agent complexity and optimize algorithms',
                metrics: {
                    p95ExecutionTime: executionTimeStats.p95,
                    targetTime: 3000
                }
            });
        }

        if (successRateStats && successRateStats.mean < 0.8) {
            insights.push({
                type: 'regression',
                component: 'agents',
                description: 'Agent success rate is below target',
                impact: 'high',
                recommendation: 'Investigate common failure patterns and improve error handling',
                metrics: {
                    successRate: successRateStats.mean,
                    targetRate: 0.9
                }
            });
        }

        return insights;
    }

    private analyzeCodeGenerationPerformance(): PerformanceInsight[] {
        const insights: PerformanceInsight[] = [];

        const qualityStats = this.calculateStatistics('code.quality_score');
        const tokensStats = this.calculateStatistics('code.tokens_used');

        if (qualityStats && qualityStats.mean < 0.7) {
            insights.push({
                type: 'regression',
                component: 'code-generation',
                description: 'Code quality scores are declining',
                impact: 'high',
                recommendation: 'Review prompts and model parameters',
                metrics: {
                    qualityScore: qualityStats.mean,
                    targetScore: 0.8
                }
            });
        }

        if (tokensStats && tokensStats.p95 > 2000) {
            insights.push({
                type: 'optimization',
                component: 'code-generation',
                description: 'Token usage is high, may indicate inefficient prompts',
                impact: 'medium',
                recommendation: 'Optimize prompts to reduce token consumption',
                metrics: {
                    p95Tokens: tokensStats.p95,
                    targetTokens: 1500
                }
            });
        }

        return insights;
    }

    private analyzeErrorPatterns(): PerformanceInsight[] {
        const insights: PerformanceInsight[] = [];

        const errorRate = this.getErrorRate();
        
        if (errorRate > 0.05) {
            insights.push({
                type: 'regression',
                component: 'system',
                description: 'Error rate is above acceptable threshold',
                impact: 'critical',
                recommendation: 'Investigate and fix recurring errors',
                metrics: {
                    errorRate,
                    targetRate: 0.02
                }
            });
        }

        return insights;
    }

    private getMetricsInWindow(metricName: string, timeWindow?: number): TelemetryMetric[] {
        const metrics = this.metricHistory.get(metricName) || [];
        
        if (!timeWindow) {
            return metrics;
        }

        const cutoff = Date.now() - timeWindow;
        return metrics.filter(m => m.timestamp > cutoff);
    }

    private getEventsInWindow(eventName: string, timeWindow: number): TelemetryEvent[] {
        const events = this.eventHistory.get(eventName) || [];
        const cutoff = Date.now() - timeWindow;
        return events.filter(e => e.timestamp > cutoff);
    }

    private getAllEventsInWindow(timeWindow: number): TelemetryEvent[] {
        const cutoff = Date.now() - timeWindow;
        const allEvents: TelemetryEvent[] = [];
        
        for (const events of this.eventHistory.values()) {
            allEvents.push(...events.filter(e => e.timestamp > cutoff));
        }
        
        return allEvents;
    }
}