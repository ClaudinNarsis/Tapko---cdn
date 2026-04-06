/**
 * Network Log Manager
 * Intercepts and stores fetch/XHR network requests for debugging
 */

class NetworkLogManager {
    constructor() {
        this.logs = [];
        this.maxLogs = 100;
        this.originalFetch = null;
        this.originalXHROpen = null;
        this.originalXHRSend = null;
        this.isInitialized = false;
    }

    /**
     * Initialize network request interception
     */
    init() {
        if (this.isInitialized) return;

        this._interceptFetch();
        this._interceptXHR();

        this.isInitialized = true;
    }

    /**
     * Intercept fetch API
     */
    _interceptFetch() {
        this.originalFetch = window.fetch.bind(window);
        const self = this;

        window.fetch = async function (input, init = {}) {
            const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
            const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
            const requestHeaders = self._headersToObject(init.headers || (input instanceof Request ? input.headers : null));
            const requestBody = self._summarizeBody(init.body || null);
            const timestamp = new Date().toISOString();
            const startTime = performance.now();

            const entry = {
                type: 'fetch',
                timestamp,
                url,
                method,
                requestHeaders,
                requestBody,
                status: null,
                statusText: null,
                responseHeaders: null,
                duration: null,
                error: null
            };

            self._addEntry(entry);

            try {
                const response = await self.originalFetch(input, init);
                entry.status = response.status;
                entry.statusText = response.statusText;
                entry.responseHeaders = self._headersToObject(response.headers);
                entry.duration = Math.round(performance.now() - startTime);
                return response;
            } catch (err) {
                entry.error = err.message || String(err);
                entry.duration = Math.round(performance.now() - startTime);
                throw err;
            }
        };
    }

    /**
     * Intercept XMLHttpRequest
     */
    _interceptXHR() {
        const self = this;
        const OriginalXHR = window.XMLHttpRequest;

        this.originalXHROpen = OriginalXHR.prototype.open;
        this.originalXHRSend = OriginalXHR.prototype.send;
        const originalSetRequestHeader = OriginalXHR.prototype.setRequestHeader;

        OriginalXHR.prototype.open = function (method, url, ...rest) {
            this._tapkoEntry = {
                type: 'xhr',
                timestamp: new Date().toISOString(),
                url: String(url),
                method: method.toUpperCase(),
                requestHeaders: {},
                requestBody: null,
                status: null,
                statusText: null,
                responseHeaders: null,
                duration: null,
                error: null
            };
            self._addEntry(this._tapkoEntry);
            return self.originalXHROpen.call(this, method, url, ...rest);
        };

        OriginalXHR.prototype.setRequestHeader = function (name, value) {
            if (this._tapkoEntry) {
                this._tapkoEntry.requestHeaders[name] = value;
            }
            return originalSetRequestHeader.call(this, name, value);
        };

        OriginalXHR.prototype.send = function (body) {
            if (this._tapkoEntry) {
                this._tapkoEntry.requestBody = self._summarizeBody(body);
                this._tapkoEntry._startTime = performance.now();

                this.addEventListener('loadend', () => {
                    if (!this._tapkoEntry) return;
                    this._tapkoEntry.status = this.status;
                    this._tapkoEntry.statusText = this.statusText;
                    this._tapkoEntry.duration = Math.round(performance.now() - this._tapkoEntry._startTime);
                    try {
                        const rawHeaders = this.getAllResponseHeaders();
                        this._tapkoEntry.responseHeaders = self._parseRawHeaders(rawHeaders);
                    } catch (e) {
                        this._tapkoEntry.responseHeaders = {};
                    }
                });

                this.addEventListener('error', () => {
                    if (!this._tapkoEntry) return;
                    this._tapkoEntry.error = 'Network error';
                    this._tapkoEntry.duration = Math.round(performance.now() - this._tapkoEntry._startTime);
                });

                this.addEventListener('abort', () => {
                    if (!this._tapkoEntry) return;
                    this._tapkoEntry.error = 'Aborted';
                    this._tapkoEntry.duration = Math.round(performance.now() - this._tapkoEntry._startTime);
                });
            }

            return self.originalXHRSend.call(this, body);
        };
    }

    /**
     * Add an entry to the buffer
     */
    _addEntry(entry) {
        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
    }

    /**
     * Convert Headers object or plain object to plain object
     */
    _headersToObject(headers) {
        if (!headers) return {};
        if (headers instanceof Headers) {
            const obj = {};
            headers.forEach((value, key) => { obj[key] = value; });
            return obj;
        }
        if (typeof headers === 'object') return { ...headers };
        return {};
    }

    /**
     * Parse raw XHR response header string into object
     */
    _parseRawHeaders(raw) {
        const obj = {};
        if (!raw) return obj;
        raw.trim().split(/[\r\n]+/).forEach(line => {
            const idx = line.indexOf(':');
            if (idx > 0) {
                obj[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
            }
        });
        return obj;
    }

    /**
     * Summarize request body (avoid storing large payloads)
     */
    _summarizeBody(body) {
        if (!body) return null;
        if (typeof body === 'string') {
            return body.length > 500 ? body.slice(0, 500) + '…' : body;
        }
        if (body instanceof FormData) return '[FormData]';
        if (body instanceof Blob) return `[Blob ${body.size}B]`;
        if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return '[Binary]';
        return '[Body]';
    }

    /**
     * Get all captured network log entries
     */
    getNetworkLogs() {
        return [...this.logs];
    }

    /**
     * Get network logs as a JSON Blob
     */
    getNetworkLogsAsJsonBlob() {
        return new Blob([JSON.stringify(this.logs, null, 2)], { type: 'application/json' });
    }

    /**
     * Clear all captured entries
     */
    clear() {
        this.logs = [];
    }

    /**
     * Restore original fetch and XHR
     */
    destroy() {
        if (!this.isInitialized) return;

        if (this.originalFetch) {
            window.fetch = this.originalFetch;
        }
        if (this.originalXHROpen) {
            XMLHttpRequest.prototype.open = this.originalXHROpen;
        }
        if (this.originalXHRSend) {
            XMLHttpRequest.prototype.send = this.originalXHRSend;
        }

        this.isInitialized = false;
    }
}

// Export singleton
export const networkLogManager = new NetworkLogManager();
