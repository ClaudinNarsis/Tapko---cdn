# Scroll Behavior Fix

## Problem

The comment bubble and pin marker were using `position: fixed` which made them stay in a fixed position relative to the viewport. When the user scrolled the page, the bubble would scroll with the viewport instead of staying attached to the element they clicked on.

**Expected**: Comment bubble sticks to the clicked element
**Actual (before fix)**: Comment bubble stayed in fixed viewport position

---

## Solution

Changed from `fixed` positioning to `absolute` positioning with scroll event listeners.

### Changes Made

#### 1. **CommentCardV2.js** - Updated positioning logic

**Added**:
- Scroll event listener that updates positions when page scrolls
- Resize event listener for viewport changes
- `_updatePositions()` method that recalculates pin and card positions
- `_setupScrollListener()` method to attach listeners
- Cleanup of listeners in `_cleanup()` method

**Changed**:
- Pin marker: `position: fixed` → `position: absolute`
- Card: `position: fixed` → `position: absolute`
- Position calculations now use `pageXOffset/pageYOffset` (document scroll)
- Positions are relative to document, not viewport

**Key Code**:
```javascript
// Calculate position relative to document
const targetRect = this.target.getBoundingClientRect();
const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
const scrollY = window.pageYOffset || document.documentElement.scrollTop;

// Position absolutely in document
this.pinMarker.style.left = `${targetRect.left + scrollX}px`;
this.pinMarker.style.top = `${targetRect.top + scrollY}px`;
```

#### 2. **widgetV2.css** - Updated CSS positioning

**Changed**:
```css
/* Before */
.dtc-comment-pin {
  position: fixed;
}

.dtc-comment-card-v2 {
  position: fixed;
}

/* After */
.dtc-comment-pin {
  position: absolute;
  pointer-events: none;
}

.dtc-comment-card-v2 {
  position: absolute;
}
```

---

## How It Works

### Initialization
1. User taps element in feedback mode
2. Get element's position using `getBoundingClientRect()`
3. Add current scroll offset (`pageXOffset/pageYOffset`)
4. Position pin and card absolutely at those coordinates

### During Scroll
1. Scroll event fires
2. `_updatePositions()` is called
3. Recalculate element position (rect + scroll)
4. Update pin marker position
5. Update card position if not minimized

### Visual Result
- Pin marker moves with the element
- Comment bubble follows the element
- Everything scrolls naturally with page content

---

## Testing

### Quick Test
1. Build: `npm run build:v2`
2. Serve: `npm run serve`
3. Open: `http://localhost:8080/examples/scroll-test.html`

### Test Steps
1. Click floating button to enter feedback mode
2. Tap any colored card
3. Scroll page up and down
4. **Verify**: Pin marker and bubble move WITH the card

### Test Page Features
- Multiple cards at different scroll positions
- 300vh height (lots of scrolling)
- Visual instructions
- Clear expected behavior description

---

## Performance Considerations

### Efficient Updates
- Uses `passive: true` for scroll listeners (better performance)
- Uses `requestAnimationFrame` for position updates
- Only updates when card is visible and not minimized

### Memory Management
- Scroll listeners are removed in `_cleanup()`
- No memory leaks when cards are closed
- Properly handles multiple comment cards

---

## Edge Cases Handled

1. **Viewport Overflow**: Card repositions if it would go off-screen
2. **Window Resize**: Position updates on resize events
3. **Minimized State**: Skips card updates when minimized (during drawing)
4. **Multiple Cards**: Each card tracks its own target element
5. **Element Movement**: Positions update if element moves (e.g., dynamic content)

---

## Browser Compatibility

Works in all modern browsers:
- ✅ Chrome/Edge (tested)
- ✅ Firefox (getBoundingClientRect + scroll events supported)
- ✅ Safari (iOS and desktop)
- ✅ Mobile browsers (touch scrolling works)

---

## Files Modified

1. `src/components/CommentCardV2.js`
   - Added scroll listener setup
   - Updated position calculation logic
   - Added cleanup for listeners

2. `src/styles/widgetV2.css`
   - Changed positioning from `fixed` to `absolute`
   - Added `pointer-events: none` to pin marker

3. `dist/tapko-widget-v2.js`
   - Rebuilt with fixes (67.34 KB)

---

## Before vs After

### Before
```
User taps element
  ↓
Pin/bubble positioned at viewport coordinates
  ↓
User scrolls
  ↓
❌ Pin/bubble stay at fixed viewport position
  ↓
Element moves away from pin/bubble
```

### After
```
User taps element
  ↓
Pin/bubble positioned at document coordinates
  ↓
User scrolls
  ↓
Scroll event fires
  ↓
Positions recalculated with new scroll offset
  ↓
✅ Pin/bubble move with element
```

---

## Verification

### Console Logging
The scroll-test.html page includes logging:
```javascript
window.addEventListener('scroll', () => {
  console.log(`Scroll position: ${window.pageYOffset}px`);
});
```

### Visual Verification
1. **Pin Marker**: Small purple dot should stay on element
2. **Comment Bubble**: Should stay next to element
3. **During Scroll**: Both should move smoothly with page

---

## Summary

✅ **Fixed**: Comment bubbles now stick to elements during scroll
✅ **Performance**: Efficient scroll listeners with passive events
✅ **Compatibility**: Works across all modern browsers
✅ **Testing**: Dedicated test page with multiple scenarios

The fix ensures the V2 widget provides an intuitive, natural scrolling experience where feedback annotations stay connected to the elements they reference.
