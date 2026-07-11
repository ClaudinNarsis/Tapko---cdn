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
import { CONFIG } from '../config.js';

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

/**
 * Fetch a URL and return a base64 data-URI, or null on failure / size limit.
 */
async function _fetchAsDataURI(url, maxBytes = 512 * 1024) {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size > maxBytes) return null;
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Inline all url() references inside a CSS string. Returns the modified CSS.
 * Skips web font resources — they add 200–400 KB each with no meaningful
 * impact on the renderer output (Puppeteer falls back to system fonts).
 */
async function _inlineCSSUrls(css, baseUrl) {
  const urlPattern = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
  const matches = [...css.matchAll(urlPattern)];
  const replacements = await Promise.allSettled(
    matches.map(async m => {
      const original = m[0];
      const href = m[1];
      if (href.startsWith('data:')) return { original, replacement: original };
      // Skip web fonts — no layout value in a headless renderer
      if (/\.(woff2?|ttf|eot|otf)(\?.*)?$/i.test(href)) return { original, replacement: original };
      const absolute = new URL(href, baseUrl).href;
      const dataURI = await _fetchAsDataURI(absolute);
      return { original, replacement: dataURI ? `url("${dataURI}")` : original };
    })
  );
  let result = css;
  for (const r of replacements) {
    if (r.status === 'fulfilled' && r.value.replacement !== r.value.original) {
      result = result.replace(r.value.original, r.value.replacement);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Payload size utilities
// ---------------------------------------------------------------------------

/** Accurate UTF-8 byte count of a string (matches what the network sends). */
function _measureBytes(str) {
  return new TextEncoder().encode(str).length;
}

// Max serialized HTML size before triggering reduction (0.5 MB headroom below
// API Gateway's hard 6 MB limit, leaving room for the JSON envelope).
const PAYLOAD_LIMIT_BYTES = 5.5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// DOM reduction helpers — all operate on the *cloned* node, never the live page
// ---------------------------------------------------------------------------

/** Strip all data-* attributes (zero visual impact, highest byte-reduction ROI). */
function _stripDataAttributes(rootEl) {
  rootEl.querySelectorAll('*').forEach(el => {
    [...el.attributes]
      .filter(a => a.name.startsWith('data-'))
      .forEach(a => el.removeAttribute(a.name));
  });
}

/**
 * Remove elements that are provably hidden from the rendered output.
 * Limited to inline-style detection — the clone has no layout engine so
 * getComputedStyle() returns empty values on detached nodes.
 */
function _stripHiddenElements(rootEl) {
  rootEl.querySelectorAll('[aria-hidden="true"], [hidden]').forEach(el => el.remove());
  rootEl.querySelectorAll('[style]').forEach(el => {
    const s = el.getAttribute('style') || '';
    if (/display\s*:\s*none/i.test(s) || /visibility\s*:\s*hidden/i.test(s)) {
      el.remove();
    }
  });
}

/**
 * Remove <style> blocks that exceed maxBytes. Targets CSS frameworks and
 * base64-encoded web fonts embedded via @font-face.
 */
function _stripLargeStyleBlocks(rootEl, maxBytes = 100 * 1024) {
  rootEl.querySelectorAll('style').forEach(el => {
    if (_measureBytes(el.textContent) > maxBytes) el.remove();
  });
}

/**
 * Remove elements whose document-absolute top edge is further than
 * (scrollY + viewportHeight * (1 + buffer)) pixels from the top of the page.
 *
 * Only strips *below* the viewport — elements above can still affect layout
 * (floats, flex/grid parents, sticky headers, CSS custom properties on ancestors).
 * Elements far below the fold are outside the renderer's clip region and have
 * no influence on the visible area.
 *
 * Positions are read from the data-tapko-rect-top attribute stamped onto the
 * live DOM *before* cloning (where layout information is available).
 *
 * @param {Element} rootEl        - Cloned document root
 * @param {number}  scrollY       - Current vertical scroll offset (px)
 * @param {number}  viewportHeight - Current viewport height (px)
 * @param {number}  buffer        - Extra viewport-heights of content to keep below
 *                                  the fold (default 2 = keep 3× viewport heights)
 */
function _stripBelowViewport(rootEl, scrollY, viewportHeight, buffer = 2) {
  const cutoff = scrollY + viewportHeight * (1 + buffer);
  rootEl.querySelectorAll('body > *, body > * > *').forEach(el => {
    const top = parseFloat(el.getAttribute('data-tapko-rect-top') || 'NaN');
    if (!isNaN(top) && top > cutoff) el.remove();
  });
  // Clean up the temporary position attributes
  rootEl.querySelectorAll('[data-tapko-rect-top]').forEach(el =>
    el.removeAttribute('data-tapko-rect-top')
  );
}

/**
 * Re-serialise the (mutated) clone and return the minified HTML string.
 * Extracted so the reduction loop can re-measure after each pass.
 */
function _serialiseClone(clone) {
  const serializer = new XMLSerializer();
  let html = serializer.serializeToString(clone);
  return html.replace(/>\s+</g, '><').trim();
}

/**
 * Apply DOM reduction strategies in order of ascending fidelity impact.
 * Each level is cumulative — level N applies everything from levels 1..N.
 *
 * Level 1 — zero visual impact:
 *   data-* attributes, aria-hidden/hidden/inline-display:none elements,
 *   elements > 3 viewport heights below the fold
 * Level 2 — minor impact (fonts / large framework CSS):
 *   Tighten below-viewport buffer to 2×, strip <style> blocks > 100 KB
 * Level 3 — moderate impact (unstyled render):
 *   Tighten below-viewport buffer to 1×, remove all <style> blocks
 * Level 4 — significant impact (no inlined images):
 *   Remove all inlined <img src="data:…"> to drop base64 image weight
 *
 * @param {Element} clone         - The mutable document clone
 * @param {number}  scrollY       - Vertical scroll position at capture time
 * @param {number}  viewportHeight
 * @param {number}  level         - Reduction level 1–4
 * @returns {string} Re-serialised, minified HTML
 */
function _reducePayload(clone, scrollY, viewportHeight, level) {
  if (level >= 1) {
    _stripDataAttributes(clone);
    _stripHiddenElements(clone);
    _stripBelowViewport(clone, scrollY, viewportHeight, 2);
  }
  if (level >= 2) {
    _stripBelowViewport(clone, scrollY, viewportHeight, 1);
    _stripLargeStyleBlocks(clone, 100 * 1024);
  }
  if (level >= 3) {
    _stripBelowViewport(clone, scrollY, viewportHeight, 0);
    clone.querySelectorAll('style').forEach(el => el.remove());
  }
  if (level >= 4) {
    clone.querySelectorAll('img[src^="data:"]').forEach(img => img.removeAttribute('src'));
  }
  return _serialiseClone(clone);
}

/**
 * Capture screenshot by serializing the DOM, inlining assets, and sending
 * the HTML to the configured server-side renderer.
 *
 * Returns { dataURL, metadata } matching the shape of captureViewportScreenshot.
 * @param {Object} options - Options forwarded from captureScreenshot
 * @param {Object} [options.widgetOverlay] - Pin and card overlay data
 */
async function captureDOMScreenshot(options = {}) {
  const timingStart = performance.now();

  // 1. Capture scroll position before any DOM mutations
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // 1b. Snapshot every CSS custom property currently on :root from the LIVE DOM.
  //     Scripts are stripped from the clone later, so any values that JS wrote via
  //     element.style.setProperty() or framework init would be lost. We freeze them
  //     here and re-inject them into the clone as a high-priority inline <style> block
  //     so the renderer sees the same layout state the user sees.
  const liveRootStyle = getComputedStyle(document.documentElement);
  const frozenCustomProps = [];
  for (const prop of liveRootStyle) {
    if (prop.startsWith('--')) {
      const val = liveRootStyle.getPropertyValue(prop).trim();
      if (val) frozenCustomProps.push(`${prop}:${val}`);
    }
  }

  // 2. Stamp document-absolute top positions onto elements BEFORE cloning.
  //    The live DOM has layout; the clone will not. These are used by
  //    _stripBelowViewport() to prune content far below the fold.
  document.querySelectorAll('body > *, body > * > *').forEach(el => {
    const rect = el.getBoundingClientRect();
    el.setAttribute('data-tapko-rect-top', (rect.top + scrollY).toFixed(0));
  });

  // 3. Deep clone the full document, then immediately clean up the live DOM
  const clone = document.documentElement.cloneNode(true);
  document.querySelectorAll('[data-tapko-rect-top]').forEach(el =>
    el.removeAttribute('data-tapko-rect-top')
  );

  // 4a. Remove the Tapko widget itself
  clone.querySelector('#tapko-widget-shadow-host')?.remove();

  // 4b. Freeze JS-initialized CSS custom properties AND animations BEFORE
  //     stripping scripts. Appending to the end of <head> ensures these rules
  //     win over earlier stylesheet declarations at the same specificity.
  //     The animation freeze means entrance animations (opacity:0→1, slide-ins)
  //     never play in the renderer, so Puppeteer always sees a stable frame
  //     rather than mid-flight invisible content (plain white screens).
  {
    const freezeStyle = document.createElement('style');
    const customPropRule = frozenCustomProps.length
      ? `:root{${frozenCustomProps.join(';')}}`
      : '';
    const animationFreezeRule =
      '*, *::before, *::after{animation-play-state:paused!important;transition-duration:0s!important;}';
    freezeStyle.textContent = customPropRule + animationFreezeRule;
    clone.querySelector('head')?.appendChild(freezeStyle);
  }

  // 4c. Remove scripts and noscript elements
  clone.querySelectorAll('script, noscript').forEach(el => el.remove());

  // 4d. Mask sensitive elements
  clone.querySelectorAll('.mk-mask, [data-mk-mask], .mk-exclude, [data-mk-exclude]').forEach(el => el.remove());

  // 4e. Fix scroll position so renderer paints the correct area
  clone.style.cssText += `; scroll-behavior: auto !important;`;
  const bodyClone = clone.querySelector('body');
  if (bodyClone) {
    bodyClone.style.setProperty('overflow', 'visible', 'important');
    bodyClone.style.marginTop = `-${scrollY}px`;
    bodyClone.style.marginLeft = `-${scrollX}px`;
  }

  // 4f. Inline <img> srcs as base64 (existing 512 KB per-asset cap applies)
  const imgEls = [...clone.querySelectorAll('img[src]')];
  await Promise.allSettled(imgEls.map(async img => {
    const src = img.getAttribute('src');
    if (!src || src.startsWith('data:')) return;
    const absolute = new URL(src, location.href).href;
    const dataURI = await _fetchAsDataURI(absolute);
    if (dataURI) img.setAttribute('src', dataURI);
  }));

  // 4g. Inline <link rel="stylesheet"> — skip files > 200 KB to avoid bloat
  //     from CSS frameworks; strip comments from those we do inline.
  const linkEls = [...clone.querySelectorAll('link[rel="stylesheet"][href]')];
  await Promise.allSettled(linkEls.map(async link => {
    const href = link.getAttribute('href');
    if (!href) return;
    try {
      const absolute = new URL(href, location.href).href;
      const res = await fetch(absolute, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) return;
      let css = await res.text();
      if (_measureBytes(css) > 200 * 1024) return; // leave <link> tag, skip inlining
      css = css.replace(/\/\*[\s\S]*?\*\//g, ''); // strip CSS comments
      css = await _inlineCSSUrls(css, absolute);
      const style = document.createElement('style');
      style.textContent = css;
      link.replaceWith(style);
    } catch { /* leave original link if fetch fails */ }
  }));

  // 4h. Inline background-image style attributes — skip if result exceeds 100 KB
  const styledEls = [...clone.querySelectorAll('[style]')];
  await Promise.allSettled(styledEls.map(async el => {
    const style = el.getAttribute('style');
    if (!style || !style.includes('url(')) return;
    const inlined = await _inlineCSSUrls(style, location.href);
    if (_measureBytes(inlined) > 100 * 1024) return; // too large, keep original
    el.setAttribute('style', inlined);
  }));

  // 4i. Replace <canvas> with <img> snapshots — use JPEG and skip if > 500 KB
  const canvasEls = [...clone.querySelectorAll('canvas')];
  const liveCanvases = [...document.querySelectorAll('canvas')];
  canvasEls.forEach((cloneCanvas, i) => {
    const live = liveCanvases[i];
    if (!live) return;
    try {
      const dataURI = live.toDataURL('image/jpeg', 0.7);
      if (dataURI.length > 500 * 1024) return; // skip oversized canvas snapshots
      const img = document.createElement('img');
      img.src = dataURI;
      img.width = live.width;
      img.height = live.height;
      cloneCanvas.replaceWith(img);
    } catch { /* tainted canvas — leave as-is */ }
  });

  // 5. Serialize and minify
  let html = _serialiseClone(clone);

  // 6. Measure payload and apply cascading reduction if needed
  let payloadBytes = _measureBytes(html);
  console.log(`[Tapko] DOM payload after inlining: ${(payloadBytes / 1024 / 1024).toFixed(2)} MB`);

  let reductionLevel = 0;
  while (payloadBytes > PAYLOAD_LIMIT_BYTES && reductionLevel < 4) {
    reductionLevel++;
    html = _reducePayload(clone, scrollY, viewportHeight, reductionLevel);
    payloadBytes = _measureBytes(html);
    console.warn(`[Tapko] Payload reduction level ${reductionLevel}: ${(payloadBytes / 1024 / 1024).toFixed(2)} MB`);
  }

  // Hard bail-out: if still over the limit after max reduction, propagate a
  // typed error so captureScreenshot() can return null instead of throwing.
  if (payloadBytes > PAYLOAD_LIMIT_BYTES) {
    const err = new Error('DOM screenshot payload exceeds limit after maximum reduction');
    err.code = 'DOM_PAYLOAD_TOO_LARGE';
    throw err;
  }

  // 7. POST to renderer — retry with escalated reduction on 413/403
  const { widgetOverlay } = options;
  const buildRequestBody = (h) => ({
    href: location.href,
    html: h,
    format: 'webp',
    width: viewportWidth,
    height: viewportHeight,
    devicePixelRatio: window.devicePixelRatio || 1
  });

  let response;
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const requestBody = buildRequestBody(html);
    console.log(`[Tapko] DOM renderer POST attempt ${attempt + 1} (${(payloadBytes / 1024 / 1024).toFixed(2)} MB)`);

    response = await fetch(CONFIG.API.rendererUrl + '/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (response.ok) break;

    // On 413 (Payload Too Large) or 403 (API Gateway size rejection), escalate
    // reduction and retry rather than failing immediately.
    if ((response.status === 413 || response.status === 403) && attempt < MAX_RETRIES) {
      reductionLevel++;
      console.warn(`[Tapko] Renderer returned ${response.status}, escalating to reduction level ${reductionLevel}`);
      if (reductionLevel <= 4) {
        html = _reducePayload(clone, scrollY, viewportHeight, reductionLevel);
        payloadBytes = _measureBytes(html);
        console.warn(`[Tapko] Post-retry reduction level ${reductionLevel}: ${(payloadBytes / 1024 / 1024).toFixed(2)} MB`);
      }
      continue;
    }

    throw new Error(`Renderer responded with ${response.status}`);
  }

  const json = await response.json();
  let dataURL = `data:image/${json.format};base64,${json.image}`;

  // Composite pin + card bubble on top of the rendered image, matching the success path.
  if (widgetOverlay) {
    dataURL = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const scale = img.width / window.innerWidth;
        _drawWidgetOverlay(ctx, widgetOverlay, scale);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Failed to load renderer image for overlay'));
      img.src = dataURL;
    });
  }

  const timingEnd = performance.now();
  console.log(`[Tapko] DOM screenshot captured in ${(timingEnd - timingStart).toFixed(0)}ms`);

  return {
    dataURL,
    metadata: {
      scrollX,
      scrollY,
      viewportWidth,
      viewportHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      timestamp: new Date().toISOString(),
      url: location.href,
      userAgent: navigator.userAgent,
      method: 'dom-serialization'
    }
  };
}

/**
 * Capture screenshot by sending the live page URL to the server-side renderer.
 * Puppeteer navigates the real URL directly — no DOM serialization, no asset
 * inlining, no payload limits. Works for any publicly accessible page and
 * produces the most faithful render because JS runs and CSS/fonts load natively.
 *
 * @param {Object} options
 * @param {Object} [options.widgetOverlay] - Pin and card overlay data
 */
async function captureURLScreenshot(options = {}) {
  const timingStart = performance.now();

  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const { widgetOverlay } = options;

  const response = await fetch(CONFIG.API.rendererUrl + '/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: location.href,
      format: 'webp',
      width: viewportWidth,
      height: viewportHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      scrollX,
      scrollY,
    })
  });

  if (!response.ok) throw new Error(`URL renderer responded with ${response.status}`);

  const json = await response.json();
  let dataURL = `data:image/${json.format};base64,${json.image}`;

  if (widgetOverlay) {
    dataURL = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const scale = img.width / window.innerWidth;
        _drawWidgetOverlay(ctx, widgetOverlay, scale);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Failed to load renderer image for overlay'));
      img.src = dataURL;
    });
  }

  const timingEnd = performance.now();
  console.log(`[Tapko] URL screenshot captured in ${(timingEnd - timingStart).toFixed(0)}ms`);

  return {
    dataURL,
    metadata: {
      scrollX,
      scrollY,
      viewportWidth,
      viewportHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      timestamp: new Date().toISOString(),
      url: location.href,
      userAgent: navigator.userAgent,
      method: 'url-navigation'
    }
  };
}

/**
 * Orchestrator — priority order when a renderer URL is configured:
 *   1. URL navigation  — renderer loads the live public page directly (best quality)
 *   2. DOM serialization — renderer renders the pre-serialized HTML (private/localhost pages)
 *   3. getDisplayMedia  — browser screen capture (DPR=1 only; requires user permission)
 *
 * When no renderer URL is configured, falls through directly to getDisplayMedia.
 *
 * options.renderMode (auth-redirect render-mode plan, T9): 'html' means this
 * project's creation-time/re-check render already detected an auth-wall or
 * redirect for this project's URL — an anonymous URL-navigation capture is
 * already known to fail for this project, so step 1 is skipped entirely and
 * capture goes straight to DOM serialization (step 2), which captures the
 * visitor's live, already-authenticated DOM instead. Undefined/'url'
 * preserves today's URL-first behavior unchanged.
 */
async function captureScreenshot(options = {}) {
  const dpr = window.devicePixelRatio || 1;

  if (CONFIG.API.rendererUrl) {
    let captureOverlay = null;
    if (options.shadowRoot) {
      captureOverlay = new ScreenshotPermissionOverlay(options.shadowRoot);
      captureOverlay.showCapturing();
    }
    try {
      // 1. URL navigation — simplest path; Puppeteer opens the live page.
      //    Falls back to DOM serialization if the page isn't publicly reachable
      //    (localhost, staging behind auth, non-200 responses from the renderer).
      //    Skipped entirely when renderMode === 'html' (see doc comment above).
      if (options.renderMode !== 'html') {
        try {
          if (captureOverlay) captureOverlay.updateStatus('Capturing page…');
          console.log('[Tapko] Attempting URL-based screenshot');
          return await captureURLScreenshot(options);
        } catch (urlErr) {
          console.warn('[Tapko] URL capture failed:', urlErr.message, '— falling back to DOM serialization');
        }
      } else {
        console.log('[Tapko] renderMode is "html" — skipping URL-based screenshot, using DOM serialization');
      }

      // 2. DOM serialization fallback.
      try {
        if (captureOverlay) captureOverlay.updateStatus('Analysing page…');
        return await captureDOMScreenshot(options);
      } catch (domErr) {
        if (domErr.code === 'DOM_PAYLOAD_TOO_LARGE') {
          console.warn('[Tapko] DOM screenshot skipped — payload too large. Feedback will be submitted without a screenshot.');
          return null;
        }
        console.warn('[Tapko] DOM screenshot failed:', domErr.message);
        return null;
      }
    } finally {
      if (captureOverlay) {
        captureOverlay.hide();
        captureOverlay = null;
      }
    }
  }

  // No renderer configured. On HiDPI displays getDisplayMedia crashes the GPU
  // process (viewport × DPR² physical pixels), so skip it entirely.
  if (dpr > 1) {
    console.warn('[Tapko] No renderer URL configured — skipping screenshot on HiDPI device');
    return null;
  }

  // DPR=1: use getDisplayMedia (requires user permission prompt).
  return await captureViewportScreenshot(options);
}

export {
  captureScreenshot,
  captureURLScreenshot,
  captureViewportScreenshot,
  generateThumbnail,
  dataURLToBlob,
  loadHtmlToImage as importHtmlToImage
};
