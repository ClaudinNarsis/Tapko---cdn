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


/**
 * Load dom-to-image library dynamically
 */
async function loadDomToImage() {
  if (window.domtoimage) return window.domtoimage;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/dom-to-image@2.6.0/dist/dom-to-image.min.js';
    script.onload = () => resolve(window.domtoimage);
    script.onerror = () => reject(new Error('Failed to load dom-to-image'));
    document.head.appendChild(script);
  });
}

/**
 * Capture viewport-only screenshot at current scroll position
 */
async function captureViewportScreenshot(options = {}) {
  const timingStart = performance.now();
  console.log('[Tapko] Starting viewport capture with dom-to-image...');

  try {
    const domtoimage = await loadDomToImage();

    // Get current viewport and scroll position
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const devicePixelRatio = window.devicePixelRatio || 1;

    // Temporarily hide shadow host
    const shadowHost = document.getElementById('tapko-widget-shadow-host');
    const originalDisplay = shadowHost ? shadowHost.style.display : null;
    if (shadowHost) shadowHost.style.display = 'none';

    try {
      // Direct viewport capture using dom-to-image
      // We target the root element and use negative margins to "slide" the viewport into view
      const targetNode = document.documentElement;

      const dataURL = await domtoimage.toJpeg(targetNode, {
        width: viewportWidth * devicePixelRatio,
        height: viewportHeight * devicePixelRatio,
        quality: 0.85,
        style: {
          transform: `scale(${devicePixelRatio})`,
          transformOrigin: 'top left',
          marginTop: `-${scrollY}px`,
          marginLeft: `-${scrollX}px`,
          width: `${targetNode.scrollWidth}px`,
          height: `${targetNode.scrollHeight}px`,
          // Ensure background is captured
          backgroundColor: '#ffffff'
        },
        filter: (node) => {
          // Exclude widget elements if any are outside shadow DOM
          if (node.id === 'tapko-widget-shadow-host') return false;
          if (node.className && typeof node.className === 'string' && node.className.includes('dtc-')) return false;
          return true;
        }
      });

      // DIAGNOSTIC
      console.log(`[Tapko] Snapshot success. DataURL length: ${dataURL.length}`);

      const timingEnd = performance.now();
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
          method: 'dom-to-image-v10'
        }
      };

    } finally {
      if (shadowHost) shadowHost.style.display = originalDisplay;
    }

  } catch (error) {
    console.error('[Tapko] Screenshot capture failed:', error);
    throw new Error(`Failed to capture screenshot: ${error.message}`);
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
  loadDomToImage as importDomToImage
};
