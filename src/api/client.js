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
    // Log POST requests for debugging
    if (endpoint.includes('/feedback/submit')) {
      console.log('[Tapko API] POST request to', endpoint, 'with data keys:', Object.keys(data));
    }
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

  /**
   * Get presigned URL for S3 upload
   * @param {Object} fileData - { folderName, fileName, fileType }
   */
  async getPresignedUrl(fileData) {
    console.log('[Tapko S3] Requesting presigned URL:', {
      folderName: fileData.folderName,
      fileName: fileData.fileName,
      fileType: fileData.fileType,
      projectId: this.projectId,
      userId: this.userId
    });

    const response = await this.post('/upload/presigned-url', {
      projectId: this.projectId,
      userId: this.userId,
      ...fileData
    });

    console.log('[Tapko S3] Presigned URL response:', {
      success: response.success,
      hasUploadUrl: !!response.data?.uploadUrl,
      hasKey: !!response.data?.key,
      key: response.data?.key,
      bucket: response.data?.bucket,
      url: response.data?.url
    });

    return response;
  }

  /**
   * Upload binary data to S3 using presigned URL
   */
  async uploadToS3(uploadUrl, data, contentType) {
    console.log('[Tapko S3] Starting S3 upload:', {
      uploadUrlHost: new URL(uploadUrl).host,
      uploadUrlPath: new URL(uploadUrl).pathname,
      contentType,
      dataSize: data?.size || data?.length || 'unknown'
    });

    const headers = {};
    const urlObj = new URL(uploadUrl);

    // Parse SignedHeaders to know what headers MUST be sent
    const signedHeadersParam = urlObj.searchParams.get('X-Amz-SignedHeaders');
    const signedHeaders = signedHeadersParam ? signedHeadersParam.split(';') : [];

    console.log('[Tapko S3] Signed headers:', signedHeaders);

    // 1. Content-Type
    // Only send if it is in the signed headers list
    if (signedHeaders.includes('content-type')) {
      headers['Content-Type'] = contentType;
    }

    // 2. x-amz-acl
    // If in signed headers, try to find the value from query params (common pattern) or default
    if (signedHeaders.includes('x-amz-acl')) {
      const acl = urlObj.searchParams.get('x-amz-acl');
      if (acl) {
        headers['x-amz-acl'] = acl;
      }
    }

    console.log('[Tapko S3] Upload headers:', headers);

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers,
      body: data
    });

    console.log('[Tapko S3] Upload response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Tapko S3] Upload error details:', errorText);
      throw new Error(`S3 Upload failed: ${response.status} ${errorText}`);
    }

    console.log('[Tapko S3] Upload successful');
    return true;
  }

  /**
   * Submit feedback with enhanced metadata
   */
  async submitFeedback(feedbackData) {
    const endpoint = '/feedback/submit';

    // If payload already matches new structure, send it directly
    if (feedbackData.context && feedbackData.assets) {
      console.log('[Tapko API] Submitting feedback with new structure:', {
        endpoint,
        title: feedbackData.title,
        hasAssets: !!feedbackData.assets,
        assetKeys: feedbackData.assets ? Object.keys(feedbackData.assets) : [],
        screenshotKey: feedbackData.assets?.screenshot?.key,
        logsKey: feedbackData.assets?.logs?.key,
        projectId: feedbackData.projectId || this.projectId,
        userId: feedbackData.userId || this.userId
      });

      console.log('[Tapko API] Screenshot asset detail:', feedbackData.assets?.screenshot);
      console.log('[Tapko API] Logs asset detail:', feedbackData.assets?.logs);

      return this.post(endpoint, feedbackData);
    }

    // Fallback for legacy calls
    console.log('[Tapko API] Submitting feedback with legacy structure');
    const payload = {
      projectId: this.projectId,
      userId: this.userId,
      feedbackTitle: feedbackData.feedbackTitle || 'User Feedback',
      feedbackDescription: feedbackData.feedbackDescription || '',
      feedbackPosition: feedbackData.feedbackPosition || {},
      // Additional metadata
      browserInfo: feedbackData.browserInfo || {},
      breakpoint: feedbackData.breakpoint || {},
      timestamp: new Date().toISOString(),
      url: window.location.href,
      // Optional fields
      ...(feedbackData.screenshot && { screenshot: feedbackData.screenshot }),
      ...(feedbackData.emoji && { emoji: feedbackData.emoji }),
      ...(feedbackData.hasAudio && { hasAudio: feedbackData.hasAudio })
    };

    return this.post(endpoint, payload);
  }

}

export { APIClient };
