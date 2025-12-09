# Tapko Widget - Project Structure

## Overview
This document explains the project structure and how different components work together.

## Directory Structure

```
tapko-widget/
├── src/                          # Source files
│   ├── index.js                  # Main entry point & widget initialization
│   ├── config.js                 # Configuration & constants
│   ├── api/
│   │   └── client.js             # API client for backend communication
│   ├── components/
│   │   └── CommentCard.js        # Comment card UI component
│   ├── managers/
│   │   └── RecordingManager.js   # Voice recording functionality
│   ├── utils/
│   │   └── dom.js                # DOM manipulation helpers
│   └── styles/
│       └── widget.css            # Widget styles (injected at build)
├── dist/                         # Built files (generated, CDN-ready)
├── examples/
│   └── index.html                # Demo page for testing
├── tests/                        # Test files (to be added)
├── build.js                      # esbuild configuration
├── package.json                  # Dependencies & scripts
└── readme.md                     # Project documentation
```

## Core Files Explanation

### src/index.js
**Purpose:** Main entry point that creates the global `Tapko` object

**Key Features:**
- Initializes widget with project configuration
- Sets up double-click/double-tap event listeners
- Manages widget lifecycle (init, destroy)
- Exposes public API methods
- Supports auto-initialization via data attributes

**Public API:**
```javascript
Tapko.init(options)          // Initialize widget
Tapko.destroy()              // Cleanup and remove widget
Tapko.createComment(element) // Programmatically create comment
Tapko.closeAll()             // Close all active comments
Tapko.getVersion()           // Get widget version
Tapko.isReady()              // Check initialization status
```

### src/config.js
**Purpose:** Centralized configuration

**Contains:**
- API endpoints and settings
- UI defaults (dimensions, animations)
- Event name constants
- CSS class prefix for namespacing

### src/api/client.js
**Purpose:** API communication layer

**Features:**
- Handles all HTTP requests (GET, POST, PUT, DELETE)
- Automatic retry on network errors
- Timeout handling
- Authentication headers
- Widget-specific endpoints:
  - `getWidgetConfig()` - Fetch widget settings
  - `submitComment()` - Submit text/emoji comments
  - `uploadVoiceRecording()` - Upload audio files

### src/components/CommentCard.js
**Purpose:** Comment card UI and interaction logic

**Features:**
- Creates and positions comment card UI
- Handles text input, emojis, and voice recording
- Manages submission workflow
- Shows loading, success, and error states
- Keyboard shortcuts (ESC, Cmd+Enter)
- Auto-cleanup on close

### src/managers/RecordingManager.js
**Purpose:** Voice recording functionality

**Features:**
- Browser compatibility check
- Microphone permission handling
- Records audio in WebM format
- Timer tracking
- Start/stop/cancel recording
- Returns audio blob for upload

### src/utils/dom.js
**Purpose:** DOM manipulation utilities

**Functions:**
- `getAnchorContainer()` - Find positioning parent
- `calculateCardPosition()` - Smart positioning
- `createElement()` - Create elements with classes
- `sanitizeHTML()` - XSS prevention
- `removeElement()` - Animated removal
- `dispatchCustomEvent()` - Event system
- Utility helpers (debounce, throttle, etc.)

### src/styles/widget.css
**Purpose:** All widget styles

**Features:**
- Scoped with `dtc-` prefix to avoid conflicts
- Animations (entrance, recording pulse)
- Responsive design
- Loading and error states
- Mobile-optimized touch targets

## Data Flow

### 1. Initialization
```
Page Load → Script Loads → Tapko.init() → API Client Setup → Event Listeners Attached
```

### 2. Comment Creation
```
User Double-Click → Event Handler → CommentCard Created → Card Positioned → UI Rendered
```

### 3. Comment Submission
```
User Submits → Validate Input → API Request → Upload Audio (if any) → Show Success → Auto-close
```

### 4. Voice Recording
```
Click Mic → Request Permission → Start Recording → Show Timer → Stop Recording → Return Blob
```

## Build Process

### Development Build
```bash
npm run dev
```
- Watches for file changes
- Generates source maps
- Unminified output
- Fast rebuilds

### Production Build
```bash
npm run build:prod
```
- Minifies code
- Removes source maps
- Injects CSS into JS
- Generates both minified and debug versions

### Build Output
```
dist/
├── tapko-widget.js        # Production bundle (minified)
└── tapko-widget.debug.js  # Debug bundle (unminified)
```

## Integration Methods

### Method 1: Auto-initialization (Recommended)
```html
<script
  src="https://cdn.tapko.com/v1/tapko-widget.min.js"
  data-tapko-project-id="your-project-id"
  data-tapko-api-key="your-api-key"
></script>
```

### Method 2: Manual initialization
```html
<script src="https://cdn.tapko.com/v1/tapko-widget.min.js"></script>
<script>
  Tapko.init({
    projectId: 'your-project-id',
    apiKey: 'your-api-key',
    theme: 'light',
    enableVoiceComments: true
  });
</script>
```

### Method 3: Programmatic usage
```javascript
// Create comment on specific element
const element = document.querySelector('#my-element');
Tapko.createComment(element);

// Listen to events
window.addEventListener('tapko:comment:submitted', (e) => {
  console.log('Comment submitted:', e.detail);
});

// Cleanup
Tapko.destroy();
```

## Events System

The widget dispatches custom events for integration:

```javascript
// Available events
window.addEventListener('tapko:initialized', handler);
window.addEventListener('tapko:comment:created', handler);
window.addEventListener('tapko:comment:submitted', handler);
window.addEventListener('tapko:comment:closed', handler);
window.addEventListener('tapko:recording:started', handler);
window.addEventListener('tapko:recording:stopped', handler);
window.addEventListener('tapko:error', handler);
```

## Configuration Options

```javascript
{
  projectId: 'required',              // Your project ID
  apiKey: 'optional',                 // API authentication key
  apiUrl: 'optional',                 // Custom API URL
  theme: 'light',                     // Theme (future feature)
  position: 'bottom-right',           // Widget position
  enableVoiceComments: true,          // Enable/disable voice
  enableEmojis: true,                 // Enable/disable emojis
  doubleClickEnabled: true,           // Desktop activation
  doubleTapEnabled: true,             // Mobile activation
  doubleTapDelay: 300                 // Double-tap timing (ms)
}
```

## Development Workflow

### 1. Setup
```bash
npm install
```

### 2. Development
```bash
npm run dev          # Start watch mode
npm run serve        # Serve example page (port 8080)
```

### 3. Testing
Open `http://localhost:8080/examples/` in browser

### 4. Build for Production
```bash
npm run build:prod
```

### 5. Deploy to CDN
Upload `dist/tapko-widget.js` to your CDN

## Browser Support

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- Mobile browsers: ✅ Full support
- IE11: ❌ Not supported (ES6 required)

## Performance Targets

- **Bundle Size:** < 20KB gzipped
- **Load Time:** < 100ms
- **Initialization:** < 50ms
- **Comment Creation:** < 16ms (1 frame)

## Security Features

- XSS prevention via HTML sanitization
- CORS properly configured
- No eval() or Function() usage
- CSP compatible
- Input validation on all user data

## Next Steps

1. Add unit tests
2. Add E2E tests with Playwright
3. Add TypeScript definitions
4. Add more themes
5. Add comment management features
6. Add real-time collaboration

## Troubleshooting

### Widget not initializing
- Check console for errors
- Verify projectId is provided
- Check API URL is accessible

### Comments not submitting
- Check network tab for API errors
- Verify API key permissions
- Check CORS headers

### Recording not working
- Check microphone permissions
- Verify HTTPS (required for getUserMedia)
- Check browser compatibility

---

**Last Updated:** 2025-12-09
