import * as vscode from 'vscode';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

export interface LogEntry {
    timestamp: number;
    level: LogLevel;
    component: string;
    message: string;
    data?: unknown;
    error?: Error;
}

export class Logger {
    private static outputChannel: vscode.OutputChannel;
    private static logLevel: LogLevel = LogLevel.INFO;
    private static logs: LogEntry[] = [];
    private static readonly maxLogs = 1000;

    constructor(private readonly component: string) {
        if (!Logger.outputChannel) {
            Logger.outputChannel = vscode.window.createOutputChannel('DGM Extension');
        }
    }

    static setLogLevel(level: LogLevel): void {
        Logger.logLevel = level;
    }

    static getLogs(): LogEntry[] {
        return [...Logger.logs];
    }

    static clearLogs(): void {
        Logger.logs = [];
    }

    debug(message: string, data?: unknown): void {
        this.log(LogLevel.DEBUG, message, data);
    }

    info(message: string, data?: unknown): void {
        this.log(LogLevel.INFO, message, data);
    }

    warn(message: string, data?: unknown): void {
        this.log(LogLevel.WARN, message, data);
    }

    error(message: string, error?: unknown): void {
        const errorObj = error instanceof Error ? error : 
                        typeof error === 'string' ? new Error(error) :
                        new Error(String(error));
        this.log(LogLevel.ERROR, message, undefined, errorObj);
    }

    log(level: LogLevel, message: string, data?: unknown, error?: Error): void {
        if (level < Logger.logLevel) {
            return;
        }

        const entry: LogEntry = {
            timestamp: Date.now(),
            level,
            component: this.component,
            message,
            data,
            error
        };

        Logger.logs.push(entry);
        
        // Keep only the most recent logs
        if (Logger.logs.length > Logger.maxLogs) {
            Logger.logs = Logger.logs.slice(-Logger.maxLogs);
        }

        // Output to VSCode channel
        this.writeToChannel(entry);

        // Output to console in development
        if (process.env.NODE_ENV === 'development') {
            this.writeToConsole(entry);
        }
    }

    private writeToChannel(entry: LogEntry): void {
        const timestamp = new Date(entry.timestamp).toISOString();
        const levelStr = LogLevel[entry.level].padEnd(5);
        const componentStr = `[${this.component}]`.padEnd(20);
        
        let output = `${timestamp} ${levelStr} ${componentStr} ${entry.message}`;
        
        if (entry.data) {
            output += `\n  Data: ${JSON.stringify(entry.data, null, 2)}`;
        }
        
        if (entry.error) {
            output += `\n  Error: ${entry.error.message}`;
            if (entry.error.stack) {
                output += `\n  Stack: ${entry.error.stack}`;
            }
        }

        Logger.outputChannel.appendLine(output);
    }

    private writeToConsole(entry: LogEntry): void {
        const timestamp = new Date(entry.timestamp).toISOString();
        const prefix = `[${timestamp}] [${this.component}]`;
        
        switch (entry.level) {
            case LogLevel.DEBUG:
                console.debug(prefix, entry.message, entry.data);
                break;
            case LogLevel.INFO:
                console.info(prefix, entry.message, entry.data);
                break;
            case LogLevel.WARN:
                console.warn(prefix, entry.message, entry.data);
                break;
            case LogLevel.ERROR:
                console.error(prefix, entry.message, entry.error || entry.data);
                break;
        }
    }

    static dispose(): void {
        if (Logger.outputChannel) {
            Logger.outputChannel.dispose();
        }
    }
}