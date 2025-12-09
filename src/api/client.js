/**
 * API Client
 * Handles all communication with the Tapko backend
 */

import { CONFIG } from '../config.js';

class APIClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || CONFIG.API.baseUrl;
    this.version = config.version || CONFIG.API.version;
    this.timeout = config.timeout || CONFIG.API.timeout;
    this.retries = config.retries || CONFIG.API.retries;
    this.projectId = config.projectId || null;
    this.apiKey = config.apiKey || null;
    this.userId = config.userId || null;
  }

  /**
   * Build full API URL
   */
  _buildUrl(endpoint) {
    if (this.version) {
      return `${this.baseUrl}/${this.version}${endpoint}`;
    }
    return `${this.baseUrl}${endpoint}`;
  }

  /**
   * Get default headers
   */
  _getHeaders(customHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Tapko-Version': CONFIG.VERSION,
      ...customHeaders
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    if (this.projectId) {
      headers['X-Project-ID'] = this.projectId;
    }

    if (this.userId) {
      headers['X-User-ID'] = this.userId;
    }

    return headers;
  }

  /**
   * Make API request with timeout and retries
   */
  async _request(endpoint, options = {}, attempt = 1) {
    const url = this._buildUrl(endpoint);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: this._getHeaders(options.headers),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      // Retry on network errors
      if (attempt < this.retries && (error.name === 'AbortError' || error.name === 'TypeError')) {
        console.warn(`[Tapko] Request failed, retrying (${attempt}/${this.retries})...`);
        await this._delay(1000 * attempt);
        return this._request(endpoint, options, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Delay helper for retries
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * GET request
   */
  async get(endpoint, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;
    return this._request(url, { method: 'GET' });
  }

  /**
   * POST request
   */
  async post(endpoint, data = {}) {
    return this._request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * PUT request
   */
  async put(endpoint, data = {}) {
    return this._request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * DELETE request
   */
  async delete(endpoint) {
    return this._request(endpoint, { method: 'DELETE' });
  }

  // === Widget-specific API methods ===

  /**
   * Validate project and check if it's collecting feedback
   */
  async validateProject() {
    return this.get('/project', {
      projectId: this.projectId,
      userId: this.userId
    });
  }

  /**
   * Fetch widget configuration
   */
  async getWidgetConfig() {
    return this.get('/widget/config', { projectId: this.projectId });
  }

  /**
   * Submit a comment
   */
  async submitComment(commentData) {
    return this.post('/comments', {
      projectId: this.projectId,
      userId: this.userId,
      ...commentData,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    });
  }

  /**
   * Upload voice recording
   */
  async uploadVoiceRecording(audioBlob, commentId) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('commentId', commentId);
    formData.append('projectId', this.projectId);
    if (this.userId) {
      formData.append('userId', this.userId);
    }

    const url = this._buildUrl('/comments/voice');

    const headers = {
      'Authorization': this.apiKey ? `Bearer ${this.apiKey}` : undefined,
      'X-Project-ID': this.projectId
    };

    if (this.userId) {
      headers['X-User-ID'] = this.userId;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    return await response.json();
  }

}

export { APIClient };
