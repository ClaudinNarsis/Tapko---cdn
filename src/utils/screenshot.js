/**
 * Screenshot Utilities
 * Captures viewport-only screenshots and generates thumbnails using dom-to-image
 *
 * IMPORTANT: This captures ONLY the visible viewport at the current scroll position,
 * NOT the entire page from top to bottom.
 *
 * Uses dom-to-image library for better CSS compatibility, especially with:
 * - External stylesheets (CORS-enabled)
 * - Modern CSS features (gradients, custom properties, etc.)
 * - WordPress and other CMS styling
 */

import { ScreenshotPermissionOverlay } from '../components/ScreenshotPermissionOverlay.js';
import debugLogger from './DebugLogger.js';


/**
 * Load html-to-image library dynamically
 * Used only for internal widget content capture (drawing overlays)
 */
async function loadHtmlToImage() {
  if (window.htmlToImage) return window.htmlToImage;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js';
    script.onload = () => resolve(window.htmlToImage);
    script.onerror = () => reject(new Error('Failed to load html-to-image'));
    document.head.appendChild(script);
  });
}

/**
 * Capture viewport-only screenshot using Screen Capture API
 * This method bypasses CORS and gradient rendering issues
 * @param {Object} options - Screenshot options
 * @param {ShadowRoot} options.shadowRoot - Optional shadow root to show permission overlay in
 * @param {boolean} options.keepWidgetVisible - If true, keeps the widget visible in screenshot (for showing pin markers)
 */
async function captureViewportScreenshot(options = {}) {
  debugLogger.startOperation('Capture viewport screenshot');
  debugLogger.logMemory('Before screenshot capture');

  const timingStart = performance.now();
  console.log('[Tapko] Starting viewport capture with Screen Capture API...');

  const { shadowRoot, keepWidgetVisible = false } = options;
  let permissionOverlay = null;

  try {
    // Get current viewport and scroll position
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const devicePixelRatio = window.devicePixelRatio || 1;

    // CRITICAL FIX: Cap maximum resolution to prevent browser crashes
    // High-DPI displays (Retina, 4K) can request massive resolutions that crash the browser
    // Safe maximum: 1920x1080 (Full HD)
    const MAX_WIDTH = 1920;
    const MAX_HEIGHT = 1080;

    // Calculate safe dimensions - don't multiply by DPR to avoid oversized captures
    const idealWidth = Math.min(viewportWidth, MAX_WIDTH);
    const idealHeight = Math.min(viewportHeight, MAX_HEIGHT);

    debugLogger.info('Viewport info collected', {
      viewportWidth,
      viewportHeight,
      devicePixelRatio,
      idealWidth,
      idealHeight,
      scrollX,
      scrollY
    });

    // Get shadow host reference (we'll hide it after permission is granted)
    const shadowHost = document.getElementById('tapko-widget-shadow-host');
    const originalDisplay = shadowHost ? shadowHost.style.display : null;

    try {
      // Show permission overlay if shadowRoot is provided (BEFORE hiding widget)
      if (shadowRoot) {
        permissionOverlay = new ScreenshotPermissionOverlay(shadowRoot);
        permissionOverlay.show();
        // Small delay to ensure overlay is visible before permission prompt
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Request screen capture with safe constraints
      debugLogger.info('START: Request getDisplayMedia permission', {
        idealWidth,
        idealHeight,
        maxWidth: MAX_WIDTH,
        maxHeight: MAX_HEIGHT
      });

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          mediaSource: 'screen',
          width: { ideal: idealWidth, max: MAX_WIDTH },
          height: { ideal: idealHeight, max: MAX_HEIGHT }
        },
        audio: false,
        preferCurrentTab: true
      });

      debugLogger.info('END: Permission granted, stream obtained');

      // Get actual stream settings
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      debugLogger.info('Stream video track settings', {
        width: settings.width,
        height: settings.height,
        frameRate: settings.frameRate,
        aspectRatio: settings.aspectRatio
      });

      // Permission granted! Now hide the overlay and shadow host
      if (permissionOverlay) {
        permissionOverlay.hide();
        permissionOverlay = null;
      }

      // Hide shadow host for clean screenshot (unless we want to keep widget visible)
      if (shadowHost && !keepWidgetVisible) shadowHost.style.display = 'none';

      // Create video element to capture the stream
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;

      // Wait for video to be ready
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = reject;
        setTimeout(() => reject(new Error('Video load timeout')), 5000);
      });

      // Small delay to ensure first frame is rendered
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create canvas and capture frame
      debugLogger.info('Creating canvas for frame capture', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        totalPixels: video.videoWidth * video.videoHeight
      });

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      debugLogger.info('START: Draw video frame to canvas');
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      debugLogger.info('END: Video frame drawn to canvas');

      // Stop all tracks
      stream.getTracks().forEach(track => track.stop());

      debugLogger.logMemory('Before toDataURL conversion');

      // Convert to JPEG data URL
      debugLogger.info('START: Convert canvas to dataURL');
      const dataURL = canvas.toDataURL('image/jpeg', 0.85);
      debugLogger.info('END: Conversion to dataURL complete', {
        dataURLLength: dataURL.length
      });

      debugLogger.logMemory('After toDataURL conversion');

      console.log(`[Tapko] Snapshot success. DataURL length: ${dataURL.length}`);

      const timingEnd = performance.now();
      console.log(`[Tapko Timing] Screen capture: ${(timingEnd - timingStart).toFixed(2)}ms`);

      debugLogger.endOperation('Capture viewport screenshot', {
        success: true,
        duration: `${(timingEnd - timingStart).toFixed(2)}ms`
      });

      return {
        dataURL,
        metadata: {
          scrollX,
          scrollY,
          viewportWidth,
          viewportHeight,
          devicePixelRatio,
          timestamp: new Date().toISOString(),
          url: window.location.href,
          userAgent: navigator.userAgent,
          method: 'screen-capture-api'
        }
      };

    } catch (innerError) {
      // Hide overlay on error
      if (permissionOverlay) {
        permissionOverlay.hide();
        permissionOverlay = null;
      }
      throw innerError;
    } finally {
      if (shadowHost) shadowHost.style.display = originalDisplay;
    }

  } catch (error) {
    debugLogger.error('Screenshot capture failed', {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack
    });

    // Ensure overlay is hidden in case of any error
    if (permissionOverlay) {
      permissionOverlay.hide();
    }

    console.error('[Tapko] Screenshot capture failed:', error);

    debugLogger.endOperation('Capture viewport screenshot', {
      success: false,
      error: error.message
    });

    // Provide helpful error messages
    if (error.name === 'NotAllowedError') {
      throw new Error('Screenshot permission denied. Please allow screen capture when prompted.');
    } else if (error.name === 'NotSupportedError') {
      throw new Error('Screen capture not supported in this browser.');
    } else {
      throw new Error(`Failed to capture screenshot: ${error.message}`);
    }
  }
}


/**
 * Generate thumbnail from screenshot
 *
 * @param {string} screenshotDataURL - Base64 data URL of the screenshot
 * @param {number} maxWidth - Maximum width (default 25)
 * @param {number} maxHeight - Maximum height (default 25)
 * @returns {Promise<string>} Thumbnail data URL
 */
async function generateThumbnail(screenshotDataURL, maxWidth = 25, maxHeight = 25) {
  const timingStart = performance.now();
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();

      img.onload = () => {
        // Calculate dimensions maintaining aspect ratio
        let width = img.width;
        let height = img.height;

        // Scale down if needed
        if (width > maxWidth || height > maxHeight) {
          const aspectRatio = width / height;

          if (width > height) {
            width = maxWidth;
            height = maxWidth / aspectRatio;
          } else {
            height = maxHeight;
            width = maxHeight * aspectRatio;
          }
        }

        // Create canvas for thumbnail
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to data URL
        const thumbnailDataURL = canvas.toDataURL('image/png', 0.8);
        const timingEnd = performance.now();
        console.log(`[Tapko Timing] Thumbnail generation: ${(timingEnd - timingStart).toFixed(2)}ms`);
        resolve(thumbnailDataURL);
      };

      img.onerror = () => {
        reject(new Error('Failed to load screenshot image for thumbnail generation'));
      };

      img.src = screenshotDataURL;
    } catch (error) {
      reject(new Error(`Thumbnail generation failed: ${error.message}`));
    }
  });
}

/**
 * Convert data URL to Blob
 */
function dataURLToBlob(dataURL) {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new Blob([u8arr], { type: mime });
}

export {
  captureViewportScreenshot,
  generateThumbnail,
  dataURLToBlob,
  loadHtmlToImage as importHtmlToImage
};
