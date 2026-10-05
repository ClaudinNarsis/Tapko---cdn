/**
 * Anchor-relative coordinates.
 *
 * Normally a pin is stored in DOCUMENT pixels (viewport click + scroll offset)
 * and repositioned by subtracting scroll. That is correct for a live site,
 * where the thing commented on sits at a document position.
 *
 * It is wrong for a fixed-size image displayed scaled-to-fit, which is what
 * Tapko's canvas page is: the image is width:100% capped at its captured
 * width, so it is a different number of CSS pixels wide in every window, and
 * the page's own header/padding moves its origin. A document-pixel pin lands
 * somewhere else at any width but the one it was placed at.
 *
 * So when an anchor element is supplied, a pin is stored as:
 *   xPct   — fraction (0..1) of the anchor's displayed width
 *   yPx    — pixels down a FIXED basis (the capture's intrinsic height)
 *   basis  — that height, stored alongside
 *
 * The asymmetry is deliberate and matches what the canvas page already stored
 * before the widget took over: a fraction is right horizontally because the
 * image is always scaled to width, but a bare vertical fraction is meaningless
 * against a TRUNCATED capture (0.5 of a page we only captured a third of
 * points nowhere real). yPx + basis is the one encoding that survives both
 * scaling and truncation, and it needs no migration if a pin is ever re-read
 * at a different capture length.
 */

/**
 * Click position → anchor-relative coordinates.
 * @param {HTMLElement} anchorEl - Element the pin is relative to
 * @param {number} clientX - Viewport X of the click
 * @param {number} clientY - Viewport Y of the click
 * @param {number} basis - Fixed vertical basis (captured intrinsic height)
 * @returns {{xPct: number, yPx: number, basis: number}|null} null if the
 *   anchor has no layout yet (width/height 0), where every result would be a
 *   division by zero rendering at a position that claims to point somewhere.
 */
export function toAnchorCoords(anchorEl, clientX, clientY, basis) {
  if (!anchorEl || typeof anchorEl.getBoundingClientRect !== 'function') return null;

  const rect = anchorEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const resolvedBasis = Number.isFinite(basis) && basis > 0 ? basis : rect.height;

  const xPct = clamp((clientX - rect.left) / rect.width, 0, 1);
  const yPx = Math.round(((clientY - rect.top) / rect.height) * resolvedBasis);

  return { xPct, yPx, basis: resolvedBasis };
}

/**
 * Anchor-relative coordinates → current viewport position.
 *
 * Read from the anchor's LIVE rect, so pins follow the image when the window
 * resizes or the page scrolls without any scroll bookkeeping of their own.
 *
 * @param {HTMLElement} anchorEl - Element the pin is relative to
 * @param {{xPct: number, yPx: number, basis: number}} coords
 * @returns {{left: number, top: number}|null}
 */
export function fromAnchorCoords(anchorEl, coords) {
  if (!anchorEl || typeof anchorEl.getBoundingClientRect !== 'function') return null;
  if (!coords || !Number.isFinite(coords.xPct) || !Number.isFinite(coords.yPx)) return null;

  const rect = anchorEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  // A pin's own recorded basis wins over the anchor's current one, so a pin
  // placed before a re-capture still lands where its author put it.
  const basis = Number.isFinite(coords.basis) && coords.basis > 0 ? coords.basis : rect.height;

  return {
    left: rect.left + coords.xPct * rect.width,
    top: rect.top + (coords.yPx / basis) * rect.height
  };
}

/**
 * Reads anchor coordinates off a stored feedback's context, tolerating the
 * shapes written by the pre-widget canvas page (xPct/yPx/canvasHeight).
 * @param {Object} context - feedback.context
 * @returns {{xPct: number, yPx: number, basis: number}|null}
 */
export function readAnchorCoords(context) {
  if (!context) return null;

  const xPct = Number(context.xPct);
  const yPx = Number(context.yPx);
  if (!Number.isFinite(xPct) || !Number.isFinite(yPx)) return null;

  const basis = Number(context.canvasHeight);

  return {
    xPct: clamp(xPct, 0, 1),
    yPx,
    basis: Number.isFinite(basis) && basis > 0 ? basis : 0
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
