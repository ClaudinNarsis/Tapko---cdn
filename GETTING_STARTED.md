# Getting Started with Tapko Widget Development

## Project Status ✅

Your Tapko Widget project structure has been created successfully! Here's what we built:

### 📁 Complete File Structure

```
tapko-widget/
├── src/                                # Source code
│   ├── index.js                        # Main entry point & global API
│   ├── config.js                       # Configuration constants
│   ├── api/
│   │   └── client.js                   # API client with retry logic
│   ├── components/
│   │   └── CommentCard.js              # Comment UI component
│   ├── managers/
│   │   └── RecordingManager.js         # Voice recording handler
│   ├── utils/
│   │   └── dom.js                      # DOM utilities & helpers
│   └── styles/
│       └── widget.css                  # Widget styles
│
├── examples/
│   └── index.html                      # Interactive demo page
│
├── dist/                               # Built files (generated)
├── tests/                              # Tests (to be added)
│
├── build.js                            # esbuild configuration
├── package.json                        # Dependencies & scripts
├── .eslintrc.json                      # ESLint config
├── .gitignore                          # Git ignore rules
│
├── readme.md                           # Original project instructions
├── QUICKSTART.md                       # Quick reference guide
├── PROJECT_STRUCTURE.md                # Detailed documentation
└── GETTING_STARTED.md                  # This file
```

## 🚀 Quick Start (5 minutes)

### Step 1: Install Dependencies

```bash
cd "/Users/claudinnarsis/DevelopmentProjects/Tapko - cdn"
npm install
```

This installs:
- `esbuild` - Ultra-fast bundler
- `eslint` - Code linting

### Step 2: Build the Widget

```bash
# Development build (with source maps)
npm run build

# Or start watch mode
npm run dev
```

This creates `dist/tapko-widget.js`

### Step 3: Test It!

```bash
# Serve the demo page
npm run serve
```

Then open: **http://localhost:8080/examples/**

Try double-clicking on the cards to see your widget in action!

### Step 4: Quick Browser Console Test

Want to test the widget instantly on any webpage? Copy and paste this snippet into your browser console:

```javascript
// Load and test Tapko Widget in browser console
(function() {
  const script = document.createElement('script');
  script.src = 'http://localhost:8080/dist/tapko-widget.js';
  script.onload = async function() {
    console.log('✅ Tapko Widget loaded!');

    // Initialize the widget
    try {
      await Tapko.init({
        projectId: 'test-project-123',
        userId: 'test-user-456' // Required for validation API call
      });
      console.log('✅ Widget initialized! Try double-clicking any element on the page.');
      console.log('📘 API available at: window.Tapko');
      console.log('📘 Test: Tapko.createComment(document.body)');
    } catch (error) {
      console.error('❌ Initialization failed:', error.message);
      console.log('💡 Make sure your backend API is running and the project exists');
    }
  };
  script.onerror = function() {
    console.error('❌ Failed to load widget. Make sure the dev server is running on http://localhost:8080');
    console.log('💡 Run: npm run serve');
  };
  document.head.appendChild(script);
})();
```

**To use this snippet:**
1. Make sure your dev server is running (`npm run serve`)
2. Open **any website** in your browser
3. Open the browser console (F12 or Cmd+Option+I)
4. Paste the snippet above and press Enter
5. Double-click any element to open the comment card!

**Testing on a production build:**

If you want to test the production build from a CDN or file, modify the script URL:

```javascript
// Test production build (replace with your CDN URL)
(function() {
  const script = document.createElement('script');
  script.src = 'https://your-cdn.com/v1/tapko-widget.js'; // Change this
  script.onload = async function() {
    try {
      await Tapko.init({
        projectId: 'your-project-id',
        userId: 'user-id' // Required for validation
      });
      console.log('✅ Widget ready! Double-click any element.');
    } catch (error) {
      console.error('❌ Initialization failed:', error.message);
    }
  };
  document.head.appendChild(script);
})();
```

**Note:** The API base URL is already configured in [src/config.js](src/config.js:12-14) (defaults to `http://localhost:6000/api`). Only pass `apiUrl` in the init options if you need to override it.

## 🎯 What You Have Now

### Core Features Implemented

✅ **Double-click/Double-tap Detection**
- Desktop: Double-click any element
- Mobile: Double-tap with 300ms delay

✅ **Comment Card UI**
- Text input with 500 char limit
- Emoji reactions (👍 ❤️ 👎)
- Close button with animation
- Smart positioning (stays in viewport)
- Beautiful animations

✅ **Voice Recording**
- Browser compatibility check
- Microphone permission handling
- Recording timer with animation
- WebM audio format
- Stop/Cancel functionality

✅ **API Integration**
- Full REST client with retry logic
- Timeout handling
- Authentication headers
- Comment submission
- Voice upload (multipart)

✅ **Event System**
- Custom events for all actions
- Integration hooks for host sites
- Error event handling

✅ **Security**
- XSS prevention via sanitization
- Input validation
- CORS support
- No global pollution (single namespace)

## 📝 Next Steps

### 1. Test the Demo

```bash
npm run serve
```

Visit http://localhost:8080/examples/ and:
- Double-click on cards
- Try adding text comments
- Test emoji reactions
- Try voice recording (requires HTTPS in production)
- Test on mobile (use browser dev tools)

### 2. Connect to Your Backend

Update [src/config.js](./src/config.js):

```javascript
export const CONFIG = {
  API: {
    baseUrl: 'http://localhost:3000', // Your API URL
    version: 'v1',
    timeout: 5000
  }
  // ...
};
```

### 3. Implement Backend Endpoints

Your backend needs these endpoints:

**Required:**
- `POST /v1/comments` - Save comments
- `POST /v1/comments/voice` - Upload audio files

**Optional:**
- `GET /v1/widget/config` - Widget configuration

See [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) for API specs.

### 4. Build for Production

```bash
npm run build:prod
```

This creates:
- `dist/tapko-widget.js` - Minified production build
- `dist/tapko-widget.debug.js` - Unminified for debugging

### 5. Deploy to CDN

Upload `dist/tapko-widget.js` to your CDN, then users can embed with:

```html
<script
  src="https://your-cdn.com/v1/tapko-widget.js"
  data-tapko-project-id="project-123"
></script>
```

## 🔧 Development Workflow

### File Structure Overview

```
src/
├── index.js          → Main widget class, event listeners, public API
├── config.js         → All configuration (API URLs, UI settings, events)
├── api/client.js     → HTTP client (GET, POST, with retries)
├── components/       → UI components
│   └── CommentCard   → Comment card logic & UI
├── managers/         → Business logic
│   └── RecordingManager → Voice recording
├── utils/dom.js      → DOM helpers (positioning, sanitization, etc.)
└── styles/widget.css → All widget styles
```

### Making Changes

**Add new features:**
1. Edit source files in `src/`
2. Run `npm run dev` (watch mode)
3. Refresh demo page to see changes

**Add new API endpoints:**
1. Add method to [src/api/client.js](./src/api/client.js)
2. Use in components

**Styling changes:**
1. Edit [src/styles/widget.css](./src/styles/widget.css)
2. All classes use `dtc-` prefix to avoid conflicts
3. Styles are injected at build time

**Add new components:**
1. Create in `src/components/`
2. Import in `src/index.js`
3. Follow same pattern as CommentCard

### Key Concepts

**1. Zero Conflicts**
- Single global: `window.Tapko`
- All CSS classes prefixed with `dtc-`
- No external dependencies
- Isolated from host site

**2. Event System**
```javascript
// Your widget dispatches events
window.addEventListener('tapko:comment:submitted', (e) => {
  console.log(e.detail); // Comment data
});
```

**3. Public API**
```javascript
Tapko.init(options)          // Initialize
Tapko.createComment(element) // Programmatic comment
Tapko.closeAll()             // Close all cards
Tapko.destroy()              // Cleanup
```

## 📚 Documentation

- **[QUICKSTART.md](./QUICKSTART.md)** - Quick reference
- **[PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)** - Detailed docs
- **[readme.md](./readme.md)** - Original project instructions

## 🐛 Troubleshooting

### Build fails
```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Widget not appearing in demo
1. Check browser console for errors
2. Ensure build completed: `ls -la dist/`
3. Check if script loaded: Open dev tools → `window.Tapko`

### Voice recording not working
- Requires HTTPS in production (browser security)
- For local testing, use `localhost` (allowed by browsers)
- Check microphone permissions

### API calls failing
1. Check network tab in dev tools
2. Verify API URL in config.js
3. Check CORS headers on backend
4. See console for detailed errors

## 🎨 Customization

### Change Colors

Edit [src/styles/widget.css](./src/styles/widget.css):

```css
.dtc-comment-card {
  border: 2px solid #YOUR_COLOR;
}

.dtc-comment-submit {
  background: #YOUR_COLOR;
}
```

### Change Timing

Edit [src/config.js](./src/config.js):

```javascript
DEFAULTS: {
  doubleTapDelay: 300,  // Change to 400 for slower
}

UI: {
  animationDuration: 300, // Animation speed
}
```

### Disable Features

```javascript
Tapko.init({
  projectId: 'xxx',
  enableVoiceComments: false, // Disable voice
  enableEmojis: false,        // Disable emojis
  doubleClickEnabled: false   // Disable double-click
});
```

## 📦 Production Checklist

Before deploying:

- [ ] Test in Chrome, Firefox, Safari
- [ ] Test on mobile devices
- [ ] Test with your backend API
- [ ] Check bundle size: `ls -lh dist/`
- [ ] Run linter: `npm run lint`
- [ ] Test on a real website
- [ ] Set up error tracking
- [ ] Configure CDN caching headers
- [ ] Test with ad blockers enabled
- [ ] Document your API endpoints

## 🚀 Deployment

1. **Build production bundle:**
   ```bash
   npm run build:prod
   ```

2. **Upload to CDN:**
   - Upload `dist/tapko-widget.js`
   - Set caching headers (1 year for versioned URLs)
   - Enable gzip compression

3. **Version URL structure:**
   ```
   https://cdn.yoursite.com/v1.0.0/tapko-widget.js
   https://cdn.yoursite.com/latest/tapko-widget.js
   ```

4. **Integration snippet:**
   ```html
   <script src="https://cdn.yoursite.com/v1.0.0/tapko-widget.js"></script>
   <script>
     Tapko.init({ projectId: 'xxx' });
   </script>
   ```

## 💡 Tips

1. **Keep bundle small** - Current target is <20KB gzipped
2. **Test everywhere** - Different browsers handle events differently
3. **Monitor errors** - Use the `tapko:error` event
4. **Version carefully** - Never break existing integrations
5. **Document changes** - Update version in config.js

## 🤝 Contributing

1. Create feature branch
2. Make changes
3. Test thoroughly
4. Run `npm run lint`
5. Submit PR with description

## 📞 Support

Need help? Here's how to get it:

- **Bug reports:** Create GitHub issue
- **Questions:** Check PROJECT_STRUCTURE.md
- **Feature requests:** Open discussion

---

## ✨ What's Next?

Your widget is ready for development! Here are some ideas:

**Immediate:**
- [ ] Build and test the demo
- [ ] Connect to your backend API
- [ ] Test on a real website

**Short term:**
- [ ] Add unit tests
- [ ] Add E2E tests
- [ ] Improve error handling
- [ ] Add more themes

**Future:**
- [ ] Comment management UI
- [ ] Real-time collaboration
- [ ] More reaction types
- [ ] Screenshot capture
- [ ] Comment threads
- [ ] Admin dashboard integration

---

**Happy coding!** 🎉

If you have questions, check [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) for detailed documentation.
