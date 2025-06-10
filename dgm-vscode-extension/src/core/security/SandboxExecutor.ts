import { NodeVM, VMScript } from 'vm2';
import * as path from 'path';
import { Logger } from '@shared/utils/Logger';
import { SecurityValidator } from './SecurityValidator';
import { ResourceLimits, ValidationResult } from '@shared/types';

export interface SandboxOptions {
    timeout: number;
    memoryLimit: number;
    cpuLimit: number;
    allowedModules: string[];
    deniedModules: string[];
    env: Record<string, string>;
}

export interface ExecutionResult {
    success: boolean;
    output: unknown;
    error?: Error;
    executionTime: number;
    memoryUsed: number;
}

export class SandboxExecutor {
    private readonly logger = new Logger('SandboxExecutor');
    private readonly validator: SecurityValidator;
    private readonly defaultOptions: SandboxOptions = {
        timeout: 30000,
        memoryLimit: 512 * 1024 * 1024, // 512MB
        cpuLimit: 80,
        allowedModules: ['path', 'url', 'querystring', 'util'],
        deniedModules: ['fs', 'child_process', 'net', 'http', 'https', 'cluster'],
        env: {}
    };

    constructor(
        private options: Partial<SandboxOptions> = {}
    ) {
        this.options = { ...this.defaultOptions, ...options };
        this.validator = new SecurityValidator();
    }

    async execute(code: string, context: Record<string, unknown> = {}): Promise<ExecutionResult> {
        const startTime = Date.now();
        const initialMemory = process.memoryUsage().heapUsed;

        try {
            // Validate code before execution
            const validation = await this.validator.validateCode(code);
            if (!validation.isValid) {
                throw new Error(`Code validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
            }

            // Create sandbox VM
            const vm = this.createVM();
            
            // Prepare script
            const script = new VMScript(code, {
                filename: 'sandbox-execution.js',
                lineOffset: 0,
                columnOffset: 0
            });

            // Execute in sandbox
            const result = await this.runWithTimeout(
                () => vm.run(script, 'sandbox-execution.js'),
                this.options.timeout!
            );

            const executionTime = Date.now() - startTime;
            const memoryUsed = process.memoryUsage().heapUsed - initialMemory;

            this.logger.info('Code executed successfully in sandbox', {
                executionTime,
                memoryUsed
            });

            return {
                success: true,
                output: result,
                executionTime,
                memoryUsed
            };

        } catch (error) {
            const executionTime = Date.now() - startTime;
            const memoryUsed = process.memoryUsage().heapUsed - initialMemory;

            this.logger.error('Sandbox execution failed', error);

            return {
                success: false,
                output: null,
                error: error instanceof Error ? error : new Error(String(error)),
                executionTime,
                memoryUsed
            };
        }
    }

    async executeFunction(
        fn: string,
        args: unknown[] = [],
        context: Record<string, unknown> = {}
    ): Promise<ExecutionResult> {
        const wrappedCode = `
            (function() {
                const fn = ${fn};
                return fn.apply(null, ${JSON.stringify(args)});
            })();
        `;

        return this.execute(wrappedCode, context);
    }

    async validateAndExecute(
        code: string,
        resourceLimits: ResourceLimits,
        context: Record<string, unknown> = {}
    ): Promise<ExecutionResult> {
        // Apply resource limits
        this.options.timeout = resourceLimits.maxExecutionTimeMs;
        this.options.memoryLimit = resourceLimits.maxMemoryMB * 1024 * 1024;
        this.options.cpuLimit = resourceLimits.maxCPUPercent;

        // Execute with limits
        const result = await this.execute(code, context);

        // Check if resource limits were exceeded
        if (result.executionTime > resourceLimits.maxExecutionTimeMs) {
            return {
                ...result,
                success: false,
                error: new Error('Execution time limit exceeded')
            };
        }

        if (result.memoryUsed > resourceLimits.maxMemoryMB * 1024 * 1024) {
            return {
                ...result,
                success: false,
                error: new Error('Memory limit exceeded')
            };
        }

        return result;
    }

    private createVM(): NodeVM {
        const { allowedModules, deniedModules, timeout, memoryLimit } = this.options;

        return new NodeVM({
            timeout,
            sandbox: {
                // Safe globals
                console: this.createSafeConsole(),
                setTimeout: undefined,
                setInterval: undefined,
                setImmediate: undefined,
                process: this.createSafeProcess()
            },
            require: {
                external: false,
                builtin: allowedModules,
                root: './',
                mock: this.createMockModules(),
                context: 'sandbox',
                import: false,
                resolve: (moduleName: string) => {
                    if (deniedModules?.includes(moduleName)) {
                        throw new Error(`Module '${moduleName}' is not allowed`);
                    }
                    return moduleName;
                }
            },
            wrapper: 'commonjs',
            sourceExtensions: ['js', 'ts'],
            argv: [],
            env: this.options.env,
            wasm: false,
            fixAsync: true
        });
    }

    private createSafeConsole(): Partial<Console> {
        const safeLog = (level: string) => (...args: unknown[]) => {
            this.logger.log(level, `[Sandbox] ${args.map(String).join(' ')}`);
        };

        return {
            log: safeLog('info'),
            info: safeLog('info'),
            warn: safeLog('warn'),
            error: safeLog('error'),
            debug: safeLog('debug')
        };
    }

    private createSafeProcess(): Partial<NodeJS.Process> {
        return {
            version: process.version,
            versions: process.versions,
            platform: process.platform,
            arch: process.arch,
            pid: -1,
            ppid: -1,
            env: {},
            exit: () => { throw new Error('process.exit() is not allowed'); },
            abort: () => { throw new Error('process.abort() is not allowed'); },
            kill: () => { throw new Error('process.kill() is not allowed'); }
        };
    }

    private createMockModules(): Record<string, unknown> {
        return {
            'vscode': {
                window: {
                    showInformationMessage: (msg: string) => {
                        this.logger.info(`[Mock VSCode] ${msg}`);
                    },
                    showErrorMessage: (msg: string) => {
                        this.logger.error(`[Mock VSCode] ${msg}`);
                    }
                },
                workspace: {
                    getConfiguration: () => ({
                        get: () => undefined,
                        has: () => false,
                        update: () => Promise.resolve()
                    })
                }
            }
        };
    }

    private async runWithTimeout<T>(
        fn: () => T | Promise<T>,
        timeout: number
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Execution timeout after ${timeout}ms`));
            }, timeout);

            Promise.resolve(fn())
                .then(result => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    updateOptions(options: Partial<SandboxOptions>): void {
        this.options = { ...this.options, ...options };
    }

    getResourceUsage(): { memory: number; cpu: number } {
        const memory = process.memoryUsage();
        return {
            memory: memory.heapUsed + memory.external,
            cpu: process.cpuUsage().user / 1000000 // Convert to seconds
        };
    }
}