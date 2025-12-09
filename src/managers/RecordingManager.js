/**
 * Recording Manager
 * Manages voice recording functionality
 */

import { CONFIG } from '../config.js';
import { dispatchCustomEvent } from '../utils/dom.js';

class RecordingManager {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.isRecording = false;
    this.startTime = null;
    this.timerInterval = null;
  }

  /**
   * Check if browser supports recording
   */
  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /**
   * Start recording
   */
  async startRecording() {
    if (this.isRecording) {
      console.warn('[Tapko] Recording already in progress');
      return false;
    }

    if (!RecordingManager.isSupported()) {
      throw new Error('Audio recording is not supported in this browser');
    }

    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create media recorder
      const options = { mimeType: 'audio/webm' };
      this.mediaRecorder = new MediaRecorder(this.stream, options);

      this.audioChunks = [];
      this.startTime = Date.now();

      // Handle data available
      this.mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      });

      // Handle recording stop
      this.mediaRecorder.addEventListener('stop', () => {
        this._cleanup();
      });

      // Start recording
      this.mediaRecorder.start();
      this.isRecording = true;

      // Dispatch event
      dispatchCustomEvent(CONFIG.EVENTS.RECORDING_STARTED, {
        timestamp: this.startTime
      });

      return true;
    } catch (error) {
      console.error('[Tapko] Failed to start recording:', error);
      this._cleanup();
      throw new Error('Failed to access microphone. Please check permissions.');
    }
  }

  /**
   * Stop recording
   */
  stopRecording() {
    return new Promise((resolve, reject) => {
      if (!this.isRecording || !this.mediaRecorder) {
        reject(new Error('No recording in progress'));
        return;
      }

      this.mediaRecorder.addEventListener('stop', () => {
        try {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          const duration = Date.now() - this.startTime;

          dispatchCustomEvent(CONFIG.EVENTS.RECORDING_STOPPED, {
            duration,
            size: audioBlob.size
          });

          resolve({
            blob: audioBlob,
            duration,
            size: audioBlob.size
          });
        } catch (error) {
          reject(error);
        }
      }, { once: true });

      this.mediaRecorder.stop();
      this.isRecording = false;
    });
  }

  /**
   * Cancel recording without saving
   */
  cancelRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      this.audioChunks = [];
      this._cleanup();
    }
  }

  /**
   * Get recording duration in seconds
   */
  getDuration() {
    if (!this.startTime) return 0;
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Format duration as MM:SS
   */
  getFormattedDuration() {
    const seconds = this.getDuration();
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Cleanup resources
   */
  _cleanup() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Destroy and cleanup all resources
   */
  destroy() {
    this.cancelRecording();
    this._cleanup();
    this.audioChunks = [];
    this.mediaRecorder = null;
  }
}

export { RecordingManager };
