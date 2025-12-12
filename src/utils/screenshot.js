/**
 * Screenshot Utilities
 * Captures viewport-only screenshots and generates thumbnails
 * 
 * IMPORTANT: This captures ONLY the visible viewport at the current scroll position,
 * NOT the entire page from top to bottom.
 */

/**
 * Load html2canvas library dynamically from CDN
 * @returns {Promise<Function>} html2canvas function
 */
async function loadHtml2Canvas() {
  // Check if already loaded
  if (window.html2canvas) {
    return window.html2canvas;
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    script.onload = () => {
      if (window.html2canvas) {
        resolve(window.html2canvas);
      } else {
        reject(new Error('html2canvas failed to load'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load html2canvas from CDN'));
    document.head.appendChild(script);
  });
}

/**
 * Capture viewport-only screenshot at current scroll position
 * 
 * This captures ONLY what the user is currently viewing in their viewport,
 * at their exact scroll position and zoom level.
 * 
 * @returns {Promise<Object>} Object containing screenshot dataURL and metadata
 */
async function captureViewportScreenshot() {
  try {
    // Load html2canvas library
    const html2canvas = await loadHtml2Canvas();

    // Get current viewport and scroll position
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const devicePixelRatio = window.devicePixelRatio || 1;

    // Capture viewport-only screenshot
    // CRITICAL: These options ensure we capture ONLY the visible viewport
    const canvas = await html2canvas(document.body, {
      // Viewport dimensions - this is what limits the capture to viewport only
      windowWidth: viewportWidth,
      windowHeight: viewportHeight,

      // Current scroll position - this tells html2canvas where the viewport is
      x: scrollX,
      y: scrollY,

      // Set internal scroll to 0 to prevent double-scrolling
      scrollX: 0,
      scrollY: 0,

      // Width and height of the capture (same as viewport)
      width: viewportWidth,
      height: viewportHeight,

      // Quality settings
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',

      // Ignore Tapko widget elements EXCEPT the drawing canvas
      ignoreElements: (element) => {
        const className = element.className || '';
        if (typeof className !== 'string') return false;

        // Allow drawing canvas to be captured
        if (className.includes('dtc-drawing-canvas')) {
          return false;
        }

        // Ignore all other Tapko widget UI elements
        return className.includes('dtc-');
      }
    });

    // Create a new canvas to composite everything
    // This ensures we have a clean 2D context and avoids any potential issues with the html2canvas object
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = canvas.width;
    finalCanvas.height = canvas.height;
    const finalCtx = finalCanvas.getContext('2d');

    // 1. Draw the screenshot onto the new canvas
    finalCtx.drawImage(canvas, 0, 0);

    // 2. Manual composite of drawing canvas onto screenshot
    const drawingCanvas = document.querySelector('.dtc-drawing-canvas');
    if (drawingCanvas) {
      // Convert drawing canvas to data URL (this renders the scale transform)
      const drawingDataURL = drawingCanvas.toDataURL('image/png');

      if (drawingDataURL.length > 1000) {
        // Load as image and draw onto final canvas
        await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            // Draw the image onto the final canvas
            finalCtx.drawImage(img, 0, 0);
            resolve();
          };
          img.onerror = (error) => {
            console.error('[Tapko] Failed to load drawing as image:', error);
            resolve();
          };
          img.src = drawingDataURL;
        });
      }
    }

    // Convert final canvas to data URL
    const dataURL = finalCanvas.toDataURL('image/png', 1.0);

    // Get zoom level (if detectable)
    let zoomLevel = 1;
    try {
      zoomLevel = Math.round((window.outerWidth / window.innerWidth) * 100) / 100;
    } catch (e) {
      // Zoom detection not available in all browsers
    }

    // Return screenshot with complete metadata
    return {
      dataURL,
      metadata: {
        scrollX,
        scrollY,
        viewportWidth,
        viewportHeight,
        devicePixelRatio,
        zoomLevel,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent
      }
    };
  } catch (error) {
    console.error('[Tapko] Screenshot capture failed:', error);
    throw new Error(`Failed to capture screenshot: ${error.message}`);
  }
}

/**
 * Generate thumbnail from screenshot
 * 
 * @param {string} screenshotDataURL - Base64 data URL of the screenshot
 * @param {number} maxWidth - Maximum width (default 200)
 * @param {number} maxHeight - Maximum height (default 200)
 * @returns {Promise<string>} Thumbnail data URL
 */
async function generateThumbnail(screenshotDataURL, maxWidth = 200, maxHeight = 200) {
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

export { captureViewportScreenshot, generateThumbnail };
