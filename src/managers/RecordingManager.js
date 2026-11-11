/**
 * Recording Manager
 * Records the current tab (getDisplayMedia) with optional mic narration into
 * a .webm, hard-capped at MAX_DURATION_MS.
 */

import { CONFIG } from '../config.js';
import { dispatchCustomEvent } from '../utils/dom.js';

const MAX_DURATION_MS = 60000;
const MIME_TYPE = 'video/webm';

class RecordingManager {
  constructor() {
    this.mediaRecorder = null;
    this.chunks = [];
    this.streams = [];
    this.isRecording = false;
    this.startTime = null;
    this.timerInterval = null;
    this.capTimeout = null;
    this.onTick = null; // (remainingSeconds) => void, once per second
    this.onStop = null; // ({ blob, duration, size }) => void, on any stop (button, cap, browser "Stop sharing")
  }

  /**
   * getDisplayMedia + webm MediaRecorder. False on iOS (no getDisplayMedia)
   * and on browsers that can only record mp4.
   */
  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) &&
      typeof MediaRecorder !== 'undefined' &&
      MediaRecorder.isTypeSupported(MIME_TYPE);
  }

  /**
   * Start recording the current tab, plus the mic when withMic is true.
   * Resolves false if the user cancels the share picker.
   */
  async startRecording({ withMic = false } = {}) {
    if (this.isRecording) return false;
    if (!RecordingManager.isSupported()) {
      throw new Error('Screen recording is not supported in this browser');
    }

    let screen;
    try {
      // Same 720p cap as screenshot.js (GPU memory on HiDPI); displaySurface /
      // monitorTypeSurfaces steer the picker to this tab, not the whole screen.
      screen = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { max: 1280 }, height: { max: 720 }, frameRate: { max: 15 }, displaySurface: 'browser' },
        audio: false,
        preferCurrentTab: true,
        monitorTypeSurfaces: 'exclude'
      });
    } catch (error) {
      console.warn('[Tapko] Screen recording cancelled:', error.message);
      return false;
    }
    this.streams = [screen];

    let mic = null;
    if (withMic) {
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.streams.push(mic);
      } catch (error) {
        console.warn('[Tapko] Mic unavailable, recording without narration:', error.message);
      }
    }

    const tracks = [...screen.getVideoTracks(), ...(mic ? mic.getAudioTracks() : [])];
    // ~1 Mbps keeps 60 s near 8 MB (IndexedDB queue, upload, storage).
    this.mediaRecorder = new MediaRecorder(new MediaStream(tracks), { mimeType: MIME_TYPE, videoBitsPerSecond: 1e6 });
    this.chunks = [];
    this.mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    });
    this.mediaRecorder.addEventListener('stop', () => this._finish());

    // The browser's own "Stop sharing" button ends the video track.
    screen.getVideoTracks()[0]?.addEventListener('ended', () => this.stopRecording());

    this.mediaRecorder.start(1000);
    this.isRecording = true;
    this.startTime = Date.now();
    this.capTimeout = setTimeout(() => this.stopRecording(), MAX_DURATION_MS);
    this.timerInterval = setInterval(() => this.onTick && this.onTick(this.getRemainingSeconds()), 1000);
    if (this.onTick) this.onTick(this.getRemainingSeconds());

    dispatchCustomEvent(CONFIG.EVENTS.RECORDING_STARTED, { timestamp: this.startTime });
    return true;
  }

  /**
   * Stop recording; onStop receives the result.
   */
  stopRecording() {
    if (!this.isRecording) return;
    this.isRecording = false;
    this._clearTimers();
    if (this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
  }

  /**
   * Cancel recording without saving
   */
  cancelRecording() {
    this.onStop = null;
    this.stopRecording();
    this.chunks = [];
    this._cleanup();
  }

  _finish() {
    this._cleanup();
    if (!this.chunks.length) return;
    // Exactly MIME_TYPE, never blob.type with codecs: the presigned PUT signs this string.
    const blob = new Blob(this.chunks, { type: MIME_TYPE });
    const duration = Math.min(Date.now() - this.startTime, MAX_DURATION_MS);
    dispatchCustomEvent(CONFIG.EVENTS.RECORDING_STOPPED, { duration });
    if (this.onStop) this.onStop({ blob, duration, size: blob.size });
  }

  getRemainingSeconds() {
    if (!this.startTime) return MAX_DURATION_MS / 1000;
    return Math.max(0, Math.ceil((MAX_DURATION_MS - (Date.now() - this.startTime)) / 1000));
  }

  _clearTimers() {
    clearTimeout(this.capTimeout);
    clearInterval(this.timerInterval);
    this.capTimeout = null;
    this.timerInterval = null;
  }

  /**
   * Stop every screen and mic track, so the browser's sharing indicator goes away.
   */
  _cleanup() {
    this._clearTimers();
    this.streams.forEach(stream => stream.getTracks().forEach(track => track.stop()));
    this.streams = [];
  }

  destroy() {
    this.cancelRecording();
    this.mediaRecorder = null;
  }
}

export { RecordingManager, MAX_DURATION_MS };
