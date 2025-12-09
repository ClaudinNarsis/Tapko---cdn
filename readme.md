# Tapko Widget - Project Instructions for Coding Agents

## Project Overview

**Project Name:** Tapko Widget
**Type:** CDN-served JavaScript widget for third-party websites
**Current Phase:** MVP with Vanilla JS
**Future Plan:** Migrate to Preact/Svelte for complex features

### Purpose
Tapko is a embeddable widget that integrates with any website to provide virtual feedback.The widget must work consistently across all sites without conflicts.

### Funtionality

Tapko widget can be added to any site with a project id. the widget should apear on the embded site which the user can interact with to provide feedback. the widget collects nessasary information and calls apis to process feedbacks

## Architecture

### Components
1. **Dashboard** - Admin interface for managing widget settings
2. **Backend API** - RESTful API serving widget data and configuration
3. **Widget Script** - CDN-served JavaScript that runs on client sites

### Data Flow
```
Client Site → Widget Script (CDN) → Backend API → Dashboard
```

## Tech Stack

### Widget (Current MVP)
- **Language:** Vanilla JavaScript (ES6+)
- **Build Tool:** esbuild
- **Styling:** Scoped CSS via Shadow DOM
- **Bundle Target:** <20KB gzipped

### Backend API
- [Specify: Node.js/Python/Go/etc]
- [Specify framework if applicable]

### Dashboard
- [Specify: React/Vue/Next.js/etc]

## File Structure
```
tapko-widget/
├── src/
│   ├── index.js              # Entry point & initialization
│   ├── config.js             # Configuration & constants
│   ├── api/
│   │   ├── client.js         # API client wrapper
│   │   └── endpoints.js      # API endpoint definitions
│   ├── components/
│   │   ├── widget.js         # Main widget component
│   │   └── [other-components].js
│   ├── utils/
│   │   ├── dom.js            # DOM manipulation helpers
│   │   ├── events.js         # Event handling
│   │   └── validation.js    # Input validation
│   └── styles/
│       └── widget.css        # Scoped widget styles
├── dist/                     # Built files (CDN-ready)
├── tests/
├── package.json
└── README.md
```

## Core Principles

### 1. Zero Conflicts
- Single global namespace: `window.Tapko`
- Shadow DOM for style isolation
- No dependencies on external libraries
- IIFE wrapper to avoid scope pollution

### 2. Performance
- Async loading (non-blocking)
- Lazy load heavy features
- Minimize bundle size
- Cache API responses appropriately

### 3. Compatibility
- Works on all modern browsers (Chrome, Firefox, Safari, Edge)
- Graceful degradation for older browsers
- Handles strict CSP policies
- No assumptions about host site environment

### 4. Security
- Sanitize all user inputs
- Validate API responses
- XSS prevention
- CORS properly configured

## Coding Standards

### Naming Conventions
```javascript
// Constants: UPPER_SNAKE_CASE
const API_BASE_URL = 'https://api.tapko.com';

// Classes/Constructors: PascalCase
class WidgetRenderer {}

// Functions/Variables: camelCase
function initializeWidget() {}
const isLoading = false;

// Private methods: _prefixed
function _internalHelper() {}
```

### Code Structure Pattern
```javascript
(function(window) {
  'use strict';
  
  const Tapko = {
    // Public configuration
    config: {},
    
    // Internal state (don't expose directly)
    _state: {},
    
    // Public API methods
    init(options) {},
    destroy() {},
    
    // Private methods
    _render() {},
    _handleEvent() {}
  };
  
  window.Tapko = Tapko;
})(window);
```

### Error Handling
```javascript
// Always wrap API calls and DOM operations
try {
  const data = await Tapko.api.fetchData();
  Tapko._render(data);
} catch (error) {
  console.error('[Tapko] Error:', error);
  Tapko._showError('Failed to load widget');
}
```

## API Integration

### Base Configuration
```javascript
const API_CONFIG = {
  baseUrl: 'https://api.tapko.com',
  version: 'v1',
  timeout: 5000,
  retries: 3
};
```

### Request Pattern
```javascript
async function apiRequest(endpoint, options = {}) {
  const url = `${API_CONFIG.baseUrl}/${API_CONFIG.version}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Tapko-Version': Tapko.config.version,
      ...options.headers
    }
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }
  
  return response.json();
}
```

### Expected API Endpoints
- `GET /widget/config?siteId={id}` - Fetch widget configuration
- `POST /widget/event` - Track widget events
- `GET /widget/data?siteId={id}` - Fetch widget data
- [Add other endpoints as needed]

## Widget Lifecycle

### 1. Load
```javascript
// Script loaded on page
window.Tapko = { ... };
```

### 2. Initialize
```javascript
// Auto-init or manual init
Tapko.init({
  siteId: 'abc123',
  apiKey: 'key_xxx',
  theme: 'light'
});
```

### 3. Render
```javascript
// Create Shadow DOM
// Fetch data from API
// Render UI
```

### 4. Interaction
```javascript
// Handle user events
// Send events to API
// Update UI
```

### 5. Destroy (cleanup)
```javascript
Tapko.destroy(); // Remove listeners, clear state
```

## Development Workflow

### Setup
```bash
git clone [repo-url]
cd tapko-widget
npm install
```

### Development
```bash
npm run dev          # Watch mode with hot reload
npm run build        # Production build
npm run test         # Run tests
npm run lint         # Lint code
```

### Testing
- Test on clean HTML page
- Test on WordPress site
- Test on React/Vue/Angular apps
- Test with ad blockers enabled
- Test with strict CSP policies

### Before Committing
1. Run `npm run lint`
2. Run `npm run test`
3. Test in multiple browsers
4. Check bundle size: `npm run build && ls -lh dist/`
5. Verify no console errors

## Deployment

### CDN Structure
```
https://cdn.tapko.com/
├── v1/
│   ├── tapko-widget.js       # Unminified
│   └── tapko-widget.min.js   # Minified
└── latest/
    ├── tapko-widget.js
    └── tapko-widget.min.js
```

### Version Management
- Semantic versioning: MAJOR.MINOR.PATCH
- Always deploy to versioned path first
- Update `latest/` only after testing
- Never break existing versions

## Migration Path (Future)

### When to Migrate to Framework
- Complex state management needed
- Multiple interactive components
- Need for virtual DOM performance
- Team prefers component-based architecture

### Migration Strategy
1. Extract current logic into modules
2. Create Preact/Svelte components matching vanilla structure
3. Keep same public API (`window.Tapko.init()`)
4. A/B test performance
5. Deploy as separate version (`v2/`)

## Common Issues & Solutions

### Issue: Widget conflicts with site's CSS
**Solution:** Always use Shadow DOM, never leak styles

### Issue: Multiple initializations
**Solution:** Check if already initialized before init

### Issue: API calls blocked by CORS
**Solution:** Backend must set proper CORS headers

### Issue: Script loaded before DOM ready
**Solution:** Handle both states in initialization

## Environment Variables
```bash
# Development
API_URL=http://localhost:3000
ENVIRONMENT=development

# Production
API_URL=https://api.tapko.com
ENVIRONMENT=production
CDN_URL=https://cdn.tapko.com
```

## Key Files to Review

1. `src/index.js` - Main entry point, understand initialization flow
2. `src/api/client.js` - All API interactions
3. `src/components/widget.js` - Main UI logic
4. `package.json` - Build scripts and dependencies

## Important Constraints

❌ **Never Do:**
- Add jQuery or heavy frameworks
- Pollute global scope beyond `window.Tapko`
- Make synchronous API calls
- Assume host site has any specific libraries
- Use `document.write()`
- Modify host site's DOM outside Shadow DOM

✅ **Always Do:**
- Use Shadow DOM for style isolation
- Async/await for API calls
- Validate all inputs
- Handle errors gracefully
- Keep bundle size minimal
- Test cross-browser compatibility

## Questions to Ask When Working on Features

1. Does this increase bundle size significantly?
2. Could this conflict with host site code?
3. Is this properly isolated in Shadow DOM?
4. Have I handled all error cases?
5. Does this work without any external dependencies?
6. Is the API call properly cached/optimized?

## Resources

- Shadow DOM: https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM
- esbuild: https://esbuild.github.io/
- [Link to API documentation]
- [Link to design specs/Figma]

---

**Last Updated:** [Date]
**Maintainer:** Claudin
**Project Status:** MVP Development Phase