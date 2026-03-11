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

// CRITICAL MEMORY FIX: Rate limiter to prevent rapid consecutive captures
// This allows time for GPU memory to be released between captures
let lastCaptureTime = 0;
const MIN_CAPTURE_INTERVAL = 1000; // 1 second minimum between captures

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

  // CRITICAL MEMORY FIX: Rate limit to prevent rapid consecutive captures
  // GPU/video memory needs time to be released between captures
  const now = Date.now();
  const timeSinceLastCapture = now - lastCaptureTime;

  if (timeSinceLastCapture < MIN_CAPTURE_INTERVAL && lastCaptureTime !== 0) {
    const waitTime = MIN_CAPTURE_INTERVAL - timeSinceLastCapture;
    console.warn(`[Tapko] Rate limiting: waiting ${waitTime}ms before next capture to allow GPU memory release`);
    debugLogger.warn('Rate limiting screenshot capture', {
      timeSinceLastCapture,
      waitTime,
      reason: 'GPU memory release'
    });
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastCaptureTime = Date.now();

  // CRITICAL MEMORY FIX: Check memory before attempting capture
  // If memory is already elevated, delay and try garbage collection first
  if (performance.memory) {
    const memoryPercent = (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100;
    debugLogger.info('Pre-capture memory check', {
      usedMB: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2),
      limitMB: (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2),
      percentUsed: memoryPercent.toFixed(2)
    });

    // If memory usage is high (>1.2%), force a small delay to allow garbage collection
    if (memoryPercent > 1.2) {
      console.warn('[Tapko] Memory usage elevated, delaying to allow cleanup...');
      debugLogger.warn('Memory usage elevated before capture', { percentUsed: memoryPercent.toFixed(2) });

      // Small delay to allow browser GC to run
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check memory again after delay
      const newPercent = (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100;
      debugLogger.info('Memory after GC delay', {
        usedMB: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2),
        percentUsed: newPercent.toFixed(2),
        wasReduced: newPercent < memoryPercent
      });
    }
  }

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
    // Screen Capture API allocates GPU/video memory which can exhaust even with low JS heap usage
    // Safe maximum: 1280x720 (720p) - Conservative limit to prevent GPU memory exhaustion
    const MAX_WIDTH = 1280;
    const MAX_HEIGHT = 720;

    // Calculate safe dimensions - scale down if viewport exceeds limits
    // Don't multiply by DPR to avoid oversized captures
    let idealWidth = viewportWidth;
    let idealHeight = viewportHeight;

    // If viewport exceeds max dimensions, scale down proportionally
    if (viewportWidth > MAX_WIDTH || viewportHeight > MAX_HEIGHT) {
      const scale = Math.min(MAX_WIDTH / viewportWidth, MAX_HEIGHT / viewportHeight);
      idealWidth = Math.floor(viewportWidth * scale);
      idealHeight = Math.floor(viewportHeight * scale);

      debugLogger.warn('Viewport exceeds safe limits, scaling down', {
        originalViewport: `${viewportWidth}x${viewportHeight}`,
        scaledViewport: `${idealWidth}x${idealHeight}`,
        scale: scale.toFixed(3)
      });
    }

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
      debugLogger.logMemory('After permission granted', { operation: 'getDisplayMedia completed' });

      // Get actual stream settings
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      const actualStreamSize = settings.width * settings.height;
      const estimatedStreamMemory = actualStreamSize * 4; // RGBA bytes

      debugLogger.info('Stream video track settings', {
        width: settings.width,
        height: settings.height,
        totalPixels: actualStreamSize,
        estimatedMemoryMB: (estimatedStreamMemory / 1024 / 1024).toFixed(2),
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

      debugLogger.logMemory('Before creating video element');

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

      debugLogger.logMemory('After video metadata loaded');

      // Small delay to ensure first frame is rendered
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create canvas and capture frame
      const canvasPixels = video.videoWidth * video.videoHeight;
      const estimatedCanvasMemory = canvasPixels * 4;

      debugLogger.info('Creating canvas for frame capture', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        totalPixels: canvasPixels,
        estimatedMemoryMB: (estimatedCanvasMemory / 1024 / 1024).toFixed(2)
      });

      debugLogger.logMemory('Before canvas creation', {
        operation: 'about to create canvas',
        size: `${video.videoWidth}x${video.videoHeight}`
      });

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      debugLogger.logMemory('After canvas creation', {
        operation: 'canvas created',
        size: `${canvas.width}x${canvas.height}`
      });

      debugLogger.info('START: Draw video frame to canvas');
      const ctx = canvas.getContext('2d');

      debugLogger.logMemory('Before drawImage', { operation: 'about to draw video to canvas' });

      ctx.drawImage(video, 0, 0);

      debugLogger.logMemory('After drawImage', { operation: 'video drawn to canvas' });
      debugLogger.info('END: Video frame drawn to canvas');

      // Stop all tracks
      stream.getTracks().forEach(track => track.stop());

      debugLogger.logMemory('Before toDataURL conversion', {
        operation: 'about to convert canvas to dataURL',
        quality: 0.85,
        format: 'image/jpeg'
      });

      // Convert to JPEG data URL
      debugLogger.info('START: Convert canvas to dataURL');
      const dataURL = canvas.toDataURL('image/jpeg', 0.85);

      debugLogger.logMemory('After toDataURL conversion', {
        operation: 'toDataURL completed',
        dataURLLength: dataURL.length,
        dataURLSizeMB: (dataURL.length / 1024 / 1024).toFixed(2)
      });

      debugLogger.info('END: Conversion to dataURL complete', {
        dataURLLength: dataURL.length,
        dataURLSizeMB: (dataURL.length / 1024 / 1024).toFixed(2)
      });

      // Log memory delta for this operation
      debugLogger.logMemoryDelta('Before screenshot capture', 'After toDataURL conversion', {
        operation: 'Complete screenshot capture'
      });

      // CRITICAL MEMORY FIX: Explicitly clean up temporary objects to prevent memory leaks
      // Without this cleanup, memory accumulates between screenshots causing crashes
      debugLogger.info('START: Cleaning up video and canvas references');

      // Clear video element
      video.srcObject = null;
      video.src = '';
      video.load(); // Force release of media resources

      // Clear canvas to release pixel buffer
      canvas.width = 0;
      canvas.height = 0;

      debugLogger.info('END: Temporary objects cleaned up');
      debugLogger.logMemory('After cleanup');

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
