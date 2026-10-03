import { describe, it, expect } from 'vitest';
import { toAnchorCoords, fromAnchorCoords, readAnchorCoords } from '../src/utils/anchorCoords.js';

// A stand-in for the canvas <img>: a rect at some offset, at some displayed
// size. The whole point of anchor coords is that the displayed size varies
// while the stored coordinate does not, so every test here fixes a pin at one
// display size and reads it back at another.
const anchor = (left, top, width, height) => ({
  getBoundingClientRect: () => ({ left, top, width, height })
});

describe('toAnchorCoords', () => {
  it('stores a click as a width fraction plus pixels down the fixed basis', () => {
    // Anchor displayed 800x600 at (100, 50); capture is 1600x1200 intrinsic.
    const coords = toAnchorCoords(anchor(100, 50, 800, 600), 500, 350, 1200);

    // Horizontally: 400px into an 800px-wide box = halfway.
    expect(coords.xPct).toBeCloseTo(0.5);
    // Vertically: 300px into 600px displayed = halfway down a 1200px basis.
    expect(coords.yPx).toBe(600);
    expect(coords.basis).toBe(1200);
  });

  it('clamps a click outside the anchor rather than storing a position off the image', () => {
    const el = anchor(0, 0, 400, 300);
    expect(toAnchorCoords(el, -50, 10, 300).xPct).toBe(0);
    expect(toAnchorCoords(el, 9999, 10, 300).xPct).toBe(1);
  });

  it('falls back to the displayed height when no basis is supplied', () => {
    expect(toAnchorCoords(anchor(0, 0, 400, 300), 200, 150, 0).basis).toBe(300);
  });

  it('returns null when the anchor has no layout yet', () => {
    // An <img> that has not painted. Dividing by a zero width would produce a
    // NaN coordinate that renders nowhere real and cannot be corrected later.
    expect(toAnchorCoords(anchor(0, 0, 0, 0), 10, 10, 1200)).toBeNull();
    expect(toAnchorCoords(null, 10, 10, 1200)).toBeNull();
  });
});

describe('fromAnchorCoords', () => {
  it('round-trips a click back to the same point at the same display size', () => {
    const el = anchor(100, 50, 800, 600);
    const coords = toAnchorCoords(el, 500, 350, 1200);
    const pos = fromAnchorCoords(el, coords);

    expect(pos.left).toBeCloseTo(500);
    expect(pos.top).toBeCloseTo(350);
  });

  it('places the same stored pin correctly at a DIFFERENT display size', () => {
    // The requirement this module exists for: the canvas is a fixed image, so a
    // pin placed in a wide window must land on the same part of the picture in a
    // narrow one. Stored once at 800 wide, read back at 400 wide (half scale).
    const coords = toAnchorCoords(anchor(100, 50, 800, 600), 500, 350, 1200);
    const pos = fromAnchorCoords(anchor(0, 0, 400, 300), coords);

    // Still the centre of the image: half of 400 across, half of 300 down.
    expect(pos.left).toBeCloseTo(200);
    expect(pos.top).toBeCloseTo(150);
  });

  it('tracks the anchor as it scrolls, with no scroll bookkeeping of its own', () => {
    const coords = toAnchorCoords(anchor(0, 500, 400, 300), 200, 650, 300);
    // Same anchor, now scrolled up 400px: top goes 500 -> 100.
    const pos = fromAnchorCoords(anchor(0, 100, 400, 300), coords);

    expect(pos.left).toBeCloseTo(200);
    expect(pos.top).toBeCloseTo(250);
  });

  it("honours a pin's own recorded basis over the anchor's current one", () => {
    // A pin placed against a 1200px capture, read back after a re-capture made
    // the image longer. It must stay where its author put it.
    const pos = fromAnchorCoords(anchor(0, 0, 400, 300), { xPct: 0.5, yPx: 600, basis: 1200 });
    expect(pos.top).toBeCloseTo(150);
  });

  it('returns null for an unpainted anchor or an unusable pin', () => {
    expect(fromAnchorCoords(anchor(0, 0, 0, 0), { xPct: 0.5, yPx: 10, basis: 100 })).toBeNull();
    expect(fromAnchorCoords(anchor(0, 0, 400, 300), { xPct: NaN, yPx: 10, basis: 100 })).toBeNull();
    expect(fromAnchorCoords(anchor(0, 0, 400, 300), null)).toBeNull();
  });
});

describe('readAnchorCoords', () => {
  it('reads the shape the canvas page stored before the widget took over', () => {
    const coords = readAnchorCoords({ surface: 'canvas', xPct: 0.25, yPx: 300, canvasHeight: 1200 });
    expect(coords).toEqual({ xPct: 0.25, yPx: 300, basis: 1200 });
  });

  it('clamps a stored fraction that is out of range', () => {
    expect(readAnchorCoords({ xPct: 1.5, yPx: 10, canvasHeight: 100 }).xPct).toBe(1);
  });

  it('reports basis 0 when none was stored, leaving the caller to supply one', () => {
    expect(readAnchorCoords({ xPct: 0.5, yPx: 10 }).basis).toBe(0);
  });

  it('returns null for a context with no usable coordinates', () => {
    // A widget-placed feedback on a live site: commentPosition, no xPct.
    expect(readAnchorCoords({ commentPosition: { x: 10, y: 20 } })).toBeNull();
    expect(readAnchorCoords(null)).toBeNull();
  });
});
