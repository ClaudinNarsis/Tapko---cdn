# Tapko Widget V2 — Quick Start Guide

## 🚀 Get Started in 3 Steps

### Step 1: Build the Widget

```bash
npm run build:v2
```

This creates `dist/tapko-widget-v2.js`

### Step 2: Start the Demo Server

```bash
npm run serve
```

### Step 3: Open the Demo

Open your browser to: **http://localhost:8080/examples/v2.html**

---

## 🎯 How to Use V2

### 1. Click the Floating Button

Look for the **purple circular button** in the bottom-right corner with a chat bubble icon.

### 2. Enter Feedback Mode

- Click the button
- You'll see a **subtle 4% overlay** appear
- Top-right label shows: **"Feedback mode — tap anything"**
- Cursor changes to **crosshair**

### 3. Tap Anywhere

- Click on any element on the page
- A **comment bubble** appears with:
  - Textarea for your comment
  - Cancel button
  - **"Draw on page"** button
  - Submit button

### 4. (Optional) Add a Drawing

- Click **"Draw on page"** in the comment bubble
- The bubble minimizes to a small pill
- Drawing canvas appears with toolbar:
  - **Undo** — Remove last stroke
  - **Clear** — Remove all strokes
  - **Done** — Finish drawing
- Draw with your mouse/finger
- Click **Done** when finished
- Bubble re-expands with your drawing attached

### 5. Submit

- Type your comment (or leave blank if you drew)
- Click **Submit** or press **Enter**
- See success checkmark ✓
- Bubble auto-closes after 3 seconds

### 6. Exit Feedback Mode

Two ways to exit:
1. **Click the floating button** (now shows an X icon)
2. **Press ESC twice** within 1 second

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **ESC** (once) | Close active comment bubble or exit drawing |
| **ESC** (twice) | Exit feedback mode completely |
| **Enter** | Submit comment |

---

## 🎨 Features to Try

### Feature 1: Tap Any Element
- Try tapping on images, cards, text, buttons
- See how the comment bubble intelligently positions itself
- Pin marker appears at your exact tap location

### Feature 2: Drawing Mode
- Enter drawing mode from any comment
- Draw arrows, circles, highlights
- Use Undo to remove mistakes
- Use Clear to start over
- Two-finger scroll still works while drawing

### Feature 3: Multiple Comments
- Create a comment, close it
- Create another comment elsewhere
- Each gets its own pin marker
- Only one comment bubble can be open at a time

### Feature 4: Context Capture
- Open browser DevTools console
- Submit a comment
- Check the `tapko:comment:submitted` event
- See all the captured metadata:
  - Element hierarchy
  - Viewport size
  - Browser info
  - Scroll position
  - Drawing data (if drawn)

---

## 📱 Mobile Testing

### On a Phone/Tablet:

1. Same flow as desktop
2. Floating button is **larger** (56px) for easy tapping
3. Drawing works with **finger**
4. **Two-finger scroll** still works in feedback and drawing modes
5. Comment bubbles are **responsive** and fit the screen

### To Test on Mobile:

```bash
# Find your local IP (macOS/Linux)
ifconfig | grep "inet "

# Start server
npm run serve

# On mobile, visit:
# http://YOUR_LOCAL_IP:8080/examples/v2.html
```

---

## 🔍 Inspect the Data

### 1. Open DevTools Console

```javascript
// Listen to events
window.addEventListener('tapko:comment:submitted', (e) => {
  console.log('Full submission data:', e.detail);
});
```

### 2. Check the Payload

When you submit a comment, you'll see:

```javascript
{
  feedbackId: "uuid-here",
  data: {
    feedbackTitle: "First 50 chars...",
    feedbackDescription: "Full comment text",
    feedbackPosition: {
      selector: "div.demo-card:nth-of-type(1)",
      boundingBox: { top, left, width, height },
      hierarchy: [...]
    },
    browserInfo: {
      browser: "Chrome",
      os: "macOS",
      deviceType: "Desktop",
      viewport: { width: 1440, height: 900 }
    },
    hasDrawing: true,
    drawingData: "data:image/png;base64,..."
  }
}
```

---

## 🎮 Programmatic Control

Open DevTools console and try:

```javascript
// Enter feedback mode
Tapko.enterFeedbackMode()

// Exit feedback mode
Tapko.exitFeedbackMode()

// Check status
Tapko.getProjectStatus()
// Returns: { isInitialized, isDisabled, isInFeedbackMode, projectData }

// Close all active components
Tapko.closeAll()

// Get version
Tapko.getVersion()
// Returns: "1.0.0"
```

---

## 🧪 Test Scenarios

### Scenario 1: Basic Comment
1. Enter feedback mode
2. Tap a card
3. Type "This looks great!"
4. Submit
5. ✅ Should see success message

### Scenario 2: Drawing Only
1. Enter feedback mode
2. Tap an image
3. Click "Draw on page"
4. Draw an arrow or circle
5. Click Done
6. Submit (without typing text)
7. ✅ Should submit drawing

### Scenario 3: Comment + Drawing
1. Enter feedback mode
2. Tap anywhere
3. Type "Move this button here"
4. Click "Draw on page"
5. Draw an arrow
6. Click Done
7. Submit
8. ✅ Should submit both text and drawing

### Scenario 4: Multiple Comments
1. Enter feedback mode
2. Create comment on Card 1 → Submit
3. Create comment on Card 2 → Submit
4. Create comment on Card 3 → Submit
5. ✅ All should have pin markers at different locations

### Scenario 5: Cancel Flows
1. Enter feedback mode
2. Tap element
3. Click Cancel
4. ✅ Bubble closes, feedback mode stays active
5. Press ESC
6. ✅ Exits feedback mode

### Scenario 6: ESC Key
1. Enter feedback mode
2. Tap element (bubble opens)
3. Press ESC once
4. ✅ Bubble closes, mode stays active
5. Press ESC again (within 1s)
6. ✅ Exits feedback mode

### Scenario 7: Drawing Cancellation
1. Enter feedback mode
2. Tap element
3. Click "Draw on page"
4. Draw something
5. Press ESC
6. ✅ Exits drawing, returns to comment bubble
7. ✅ Drawing is discarded

---

## 🐛 Common Issues

### Issue: Floating button doesn't appear

**Cause**: Project validation failed or not collecting feedback

**Solution**: Check console for errors. Ensure backend returns `isCollectingFeedback: true`

### Issue: Clicks not intercepted in feedback mode

**Cause**: Another element has higher z-index

**Solution**: Overlay uses `z-index: 2147483645`. Check for conflicts.

### Issue: Drawing looks pixelated

**Cause**: Device pixel ratio not handled

**Solution**: Already implemented. Check `DrawingCanvas.js` line 74-76.

### Issue: Can't scroll while in feedback mode

**Cause**: Browser or touch gesture conflict

**Solution**:
- Desktop: Use mouse wheel (should work)
- Mobile: Use two-finger scroll (should work)

---

## 📊 Performance Monitoring

### Check Bundle Size

```bash
ls -lh dist/tapko-widget-v2.js
```

Should be around **65 KB** (development) or **~25 KB** (production minified)

### Measure Init Time

```javascript
console.time('init');
await Tapko.init({ projectId: '...' });
console.timeEnd('init');
// Should be < 50ms
```

### Measure Feedback Mode Entry

```javascript
console.time('feedback-mode');
Tapko.enterFeedbackMode();
console.timeEnd('feedback-mode');
// Should be < 16ms
```

---

## 🎉 You're Ready!

You've successfully:
- ✅ Built the V2 widget
- ✅ Loaded the demo page
- ✅ Understood the flow
- ✅ Learned all features
- ✅ Tested scenarios

### Next Steps

1. **Integrate with your backend** — Update API endpoints in `src/config.js`
2. **Customize styling** — Edit `src/styles/widgetV2.css`
3. **Add your branding** — Change colors, button position, etc.
4. **Deploy to CDN** — Upload `dist/tapko-widget-v2.js`

### Production Deployment

```bash
# Build minified version
npm run build:prod:v2

# Output: dist/tapko-widget-v2.js (minified)
# Upload this to your CDN
```

### Integration on Your Site

```html
<script src="https://your-cdn.com/tapko-widget-v2.js"></script>
<script>
  Tapko.init({
    projectId: 'your-project-id',
    apiKey: 'your-api-key',
    userId: 'current-user-id'
  });
</script>
```

---

**Questions?** Check [V2_IMPLEMENTATION.md](./V2_IMPLEMENTATION.md) for detailed technical documentation.

**Happy Feedback Collecting! 🚀**
