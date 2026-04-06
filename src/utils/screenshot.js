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
 * Draw pin marker and comment card bubble onto an existing canvas context.
 * Called after the video frame is drawn so nothing touches the GPU compositor.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} overlay
 * @param {number} overlay.pinX   - Pin centre X in CSS viewport pixels
 * @param {number} overlay.pinY   - Pin centre Y in CSS viewport pixels
 * @param {Object} overlay.cardRect - {left, top, width, height} of the card in CSS pixels
 * @param {string} overlay.cardText - Comment text to render inside the card
 * @param {number} scale - CSS-pixel → video-pixel ratio (videoWidth / viewportWidth)
 */
function _drawWidgetOverlay(ctx, overlay, scale) {
  const { pinX, pinY, cardRect, cardText } = overlay;

  ctx.save();
  ctx.scale(scale, scale);

  // --- Pin dot (mirrors .dtc-comment-pin CSS) ---
  const PIN_RADIUS = 6;
  ctx.beginPath();
  ctx.arc(pinX, pinY, PIN_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#4f46e5';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  // Subtle drop shadow ring
  ctx.beginPath();
  ctx.arc(pinX, pinY, PIN_RADIUS + 3, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(79, 70, 229, 0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // --- Card bubble ---
  if (cardRect) {
    const { left, top, width, height } = cardRect;
    const RADIUS = 12;
    const PADDING = 12;

    // White rounded rect with shadow
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 12 / scale;
    ctx.shadowOffsetY = 4 / scale;
    ctx.beginPath();
    ctx.moveTo(left + RADIUS, top);
    ctx.lineTo(left + width - RADIUS, top);
    ctx.quadraticCurveTo(left + width, top, left + width, top + RADIUS);
    ctx.lineTo(left + width, top + height - RADIUS);
    ctx.quadraticCurveTo(left + width, top + height, left + width - RADIUS, top + height);
    ctx.lineTo(left + RADIUS, top + height);
    ctx.quadraticCurveTo(left, top + height, left, top + height - RADIUS);
    ctx.lineTo(left, top + RADIUS);
    ctx.quadraticCurveTo(left, top, left + RADIUS, top);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Border
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Comment text
    if (cardText) {
      ctx.fillStyle = '#1f2937';
      ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textBaseline = 'top';

      // Word-wrap text within card width
      const maxLineWidth = width - PADDING * 2;
      const words = cardText.split(' ');
      let line = '';
      let lineY = top + PADDING;
      const lineHeight = 18;

      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxLineWidth && line) {
          ctx.fillText(line, left + PADDING, lineY);
          line = word;
          lineY += lineHeight;
          if (lineY + lineHeight > top + height - PADDING) break;
        } else {
          line = test;
        }
      }
      if (line) ctx.fillText(line, left + PADDING, lineY);
    }
  }

  ctx.restore();
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

  // Rate limit to prevent rapid consecutive captures (GPU memory needs time to be released)
  const now = Date.now();
  const timeSinceLastCapture = now - lastCaptureTime;

  if (timeSinceLastCapture < MIN_CAPTURE_INTERVAL && lastCaptureTime !== 0) {
    const waitTime = MIN_CAPTURE_INTERVAL - timeSinceLastCapture;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastCaptureTime = Date.now();

  // Check memory before attempting capture - delay if elevated
  if (performance.memory) {
    const memoryPercent = (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100;

    if (memoryPercent > 1.2) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const timingStart = performance.now();

  const { shadowRoot, keepWidgetVisible = false, widgetOverlay = null } = options;
  let permissionOverlay = null;

  try {
    // Get current viewport and scroll position
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const devicePixelRatio = window.devicePixelRatio || 1;

    // Cap maximum resolution to prevent GPU memory exhaustion (720p max)
    const MAX_WIDTH = 1280;
    const MAX_HEIGHT = 720;

    // On Retina/HiDPI displays getDisplayMedia allocates an IOSurface at physical pixels
    // (viewport * DPR), so a 1280×720 CSS constraint becomes 2560×1440 on DPR=2 — 4×
    // the GPU memory. Force constraints to physical-pixel budget by capping at DPR=1.
    const captureDPR = Math.min(devicePixelRatio, 1);
    let idealWidth  = Math.floor(viewportWidth  * captureDPR);
    let idealHeight = Math.floor(viewportHeight * captureDPR);

    // Scale down if viewport exceeds limits
    if (idealWidth > MAX_WIDTH || idealHeight > MAX_HEIGHT) {
      const scale = Math.min(MAX_WIDTH / idealWidth, MAX_HEIGHT / idealHeight);
      idealWidth  = Math.floor(idealWidth  * scale);
      idealHeight = Math.floor(idealHeight * scale);
    }

    // Get shadow host reference (we'll hide it after permission is granted)
    const shadowHost = document.getElementById('tapko-widget-shadow-host');
    const originalDisplay = shadowHost ? shadowHost.style.display : null;

    try {
      // Hide shadow host BEFORE getDisplayMedia and wait for the compositor to repaint.
      // With preferCurrentTab, Chrome grabs the tab's GPU compositor frame immediately
      // when getDisplayMedia resolves — if the widget is still composited at that moment
      // Chrome processes it at 2x DPR on HiDPI displays, crashing the GPU process.
      // Hiding first + awaiting two rAF cycles ensures the compositor has repainted
      // without the widget before the capture frame is grabbed.
      debugLogger.checkpoint('shadow-hide', { idealWidth, idealHeight, devicePixelRatio });
      if (shadowHost) shadowHost.style.display = 'none';

      // Freeze all CSS animations and transitions on the host page before capture.
      // Active animated layers each hold a composited IOSurface tile; pausing them
      // collapses that GPU memory pressure before Chrome allocates the capture buffer.
      document.body.style.setProperty('animation-play-state', 'paused', 'important');
      document.body.style.setProperty('transition', 'none', 'important');
      // Notify host page so it can pause canvas/WebGL rAF loops if desired.
      document.dispatchEvent(new CustomEvent('tapko:capture-start'));

      await new Promise(resolve => requestAnimationFrame(resolve));
      await new Promise(resolve => requestAnimationFrame(resolve));
      debugLogger.checkpoint('shadow-hide-raf-done');

      // Show permission overlay if shadowRoot is provided
      if (shadowRoot) {
        permissionOverlay = new ScreenshotPermissionOverlay(shadowRoot);
        permissionOverlay.show();
        debugLogger.checkpoint('permission-overlay-shown');
        // Small delay to ensure overlay is visible before permission prompt
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      debugLogger.checkpoint('getDisplayMedia-start');
      debugLogger.logUserAction('screenshot-permission-prompt-shown', { idealWidth, idealHeight });

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          mediaSource: 'screen',
          width: { ideal: idealWidth, max: MAX_WIDTH },
          height: { ideal: idealHeight, max: MAX_HEIGHT }
        },
        audio: false,
        preferCurrentTab: true
      });

      debugLogger.checkpoint('getDisplayMedia-resolved');
      debugLogger.logUserAction('screenshot-permission-granted');

      // Permission granted! Hide the overlay
      if (permissionOverlay) {
        permissionOverlay.hide();
        permissionOverlay = null;
      }

      // Create video element to capture the stream
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;

      debugLogger.checkpoint('video-element-created');

      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = reject;
        setTimeout(() => reject(new Error('Video load timeout')), 5000);
      });

      debugLogger.checkpoint('video-metadata-loaded', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        dpr: devicePixelRatio,
        canvasAllocMB: ((video.videoWidth * video.videoHeight * 4) / 1024 / 1024).toFixed(1)
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      debugLogger.checkpoint('canvas-create', { videoWidth: video.videoWidth, videoHeight: video.videoHeight });
      const canvas = document.createElement('canvas');

      debugLogger.checkpoint('canvas-size', { width: video.videoWidth, height: video.videoHeight, allocBytes: video.videoWidth * video.videoHeight * 4 });
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      debugLogger.checkpoint('canvas-context');
      const ctx = canvas.getContext('2d');

      debugLogger.checkpoint('canvas-drawImage');
      ctx.drawImage(video, 0, 0);

      // Composite pin and card on top of the captured frame without touching the GPU
      // compositor. The scale converts CSS viewport pixels → captured video pixels.
      if (widgetOverlay) {
        const scale = video.videoWidth / viewportWidth;
        _drawWidgetOverlay(ctx, widgetOverlay, scale);
        debugLogger.checkpoint('widget-overlay-drawn');
      }

      debugLogger.checkpoint('tracks-stop');
      stream.getTracks().forEach(track => track.stop());

      debugLogger.checkpoint('toDataURL-start');
      const dataURL = canvas.toDataURL('image/jpeg', 0.85);
      debugLogger.checkpoint('toDataURL-done', { dataURLLength: dataURL.length });

      // Clean up temporary objects to prevent memory leaks
      video.srcObject = null;
      video.src = '';
      video.load();
      canvas.width = 0;
      canvas.height = 0;

      const timingEnd = performance.now();
      console.log(`[Tapko] Screenshot captured in ${(timingEnd - timingStart).toFixed(0)}ms`);

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
      // Guarantee animation state is restored even if capture fails mid-way.
      document.body.style.removeProperty('animation-play-state');
      document.body.style.removeProperty('transition');
      document.dispatchEvent(new CustomEvent('tapko:capture-end'));
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
        let width = img.width;
        let height = img.height;

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

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const thumbnailDataURL = canvas.toDataURL('image/png', 0.8);

        // Clean up to prevent memory leaks
        canvas.width = 0;
        canvas.height = 0;
        img.src = '';

        const timingEnd = performance.now();
        console.log(`[Tapko] Thumbnail generated in ${(timingEnd - timingStart).toFixed(0)}ms`);
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
