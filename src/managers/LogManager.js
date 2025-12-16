/**
 * Log Manager
 * Intercepts and stores console logs for debugging
 */

import { CONFIG } from '../config.js';

class LogManager {
    constructor() {
        this.logs = [];
        this.maxLogs = 100;
        this.originalConsole = {
            log: console.log,
            warn: console.warn,
            error: console.error,
            info: console.info
        };
        this.isInitialized = false;
    }

    /**
     * Initialize log capturing
     */
    init() {
        if (this.isInitialized) return;

        // Intercept console methods
        console.log = (...args) => {
            this._addLog('log', args);
            this.originalConsole.log.apply(console, args);
        };

        console.warn = (...args) => {
            this._addLog('warn', args);
            this.originalConsole.warn.apply(console, args);
        };

        console.error = (...args) => {
            this._addLog('error', args);
            this.originalConsole.error.apply(console, args);
        };

        console.info = (...args) => {
            this._addLog('info', args);
            this.originalConsole.info.apply(console, args);
        };

        this.isInitialized = true;
        console.log('[Tapko] LogManager initialized');
    }

    /**
     * Add log to buffer
     */
    _addLog(type, args) {
        // Don't capture Tapko internal logs to avoid noise/recursion issues if we logged there
        // But we probably want them. Let's keep them but maybe filter circular structures.

        try {
            const timestamp = new Date().toISOString();

            // Process arguments to be JSON safe-ish
            const processedArgs = args.map(arg => {
                if (arg instanceof Error) {
                    return {
                        message: arg.message,
                        stack: arg.stack,
                        name: arg.name
                    };
                }
                if (typeof arg === 'object' && arg !== null) {
                    try {
                        // Simple serialization check
                        JSON.stringify(arg);
                        return arg;
                    } catch (e) {
                        return '[Circular/Unserializable Object]';
                    }
                }
                return arg;
            });

            this.logs.push({
                type,
                timestamp,
                data: processedArgs
            });

            // Maintain buffer size
            if (this.logs.length > this.maxLogs) {
                this.logs.shift();
            }
        } catch (error) {
            this.originalConsole.error('[Tapko] Error capturing log:', error);
        }
    }

    /**
     * Get captured logs
     */
    getLogs() {
        return [...this.logs];
    }

    /**
   * Get logs as Text Blob
   */
    getLogsAsTextBlob() {
        const timingStart = performance.now();
        const logsText = this.logs.map(log => {
            const dataStr = log.data.map(arg => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg);
                    } catch (e) {
                        return '[Object]';
                    }
                }
                return String(arg);
            }).join(' ');
            return `[${log.timestamp}] [${log.type.toUpperCase()}] ${dataStr}`;
        }).join('\n');

        const blob = new Blob([logsText], { type: 'text/plain' });
        const timingEnd = performance.now();
        console.log(`[Tapko Timing] Log collection to blob: ${(timingEnd - timingStart).toFixed(2)}ms (${this.logs.length} logs)`);
        return blob;
    }

    /**
     * Get logs as JSON Blob
     */
    getLogsAsBlob() {
        const logsJSON = JSON.stringify(this.logs, null, 2);
        return new Blob([logsJSON], { type: 'application/json' });
    }

    /**
     * Clear logs
     */
    clear() {
        this.logs = [];
    }

    /**
     * Restore original console methods
     */
    destroy() {
        if (!this.isInitialized) return;

        console.log = this.originalConsole.log;
        console.warn = this.originalConsole.warn;
        console.error = this.originalConsole.error;
        console.info = this.originalConsole.info;

        this.isInitialized = false;
    }
}

// Export singleton
export const logManager = new LogManager();
