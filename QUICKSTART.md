# Tapko Widget - Quick Start Guide

A lightweight, embeddable commenting widget for any website. Add visual feedback with text, emojis, and voice recordings.

## Features

- 📝 **Text Comments** - Simple textarea for detailed feedback
- 🎤 **Voice Recording** - Record audio comments (WebM format)
- 😊 **Emoji Reactions** - Quick feedback with emoji buttons
- 📱 **Mobile Optimized** - Double-tap on mobile, double-click on desktop
- 🎨 **Clean UI** - Beautiful, modern design
- 🔒 **Secure** - XSS prevention, input sanitization
- ⚡ **Fast** - < 20KB gzipped
- 🌐 **Cross-browser** - All modern browsers

## Installation

Add to your HTML:

```html
<script
  src="https://cdn.tapko.com/v1/tapko-widget.min.js"
  data-tapko-project-id="your-project-id"
></script>
```

Or manually initialize:

```html
<script src="https://cdn.tapko.com/v1/tapko-widget.min.js"></script>
<script>
  Tapko.init({
    projectId: 'your-project-id',
    apiKey: 'your-api-key' // Optional
  });
</script>
```

## Usage

- **Desktop:** Double-click any element
- **Mobile:** Double-tap any element
- **Keyboard:** ESC to close, Cmd/Ctrl+Enter to submit

## API Methods

```javascript
Tapko.createComment(element);  // Create comment on element
Tapko.closeAll();              // Close all comments
Tapko.isReady();               // Check if initialized
Tapko.destroy();               // Cleanup
```

## Configuration

```javascript
Tapko.init({
  projectId: 'required',
  apiKey: 'optional',
  enableVoiceComments: true,
  enableEmojis: true,
  doubleClickEnabled: true,
  doubleTapEnabled: true
});
```

## Development

```bash
npm install        # Install dependencies
npm run dev        # Start development
npm run serve      # Serve demo (port 8080)
npm run build:prod # Build for production
```

## Events

```javascript
window.addEventListener('tapko:comment:submitted', (e) => {
  console.log('Comment submitted:', e.detail);
});

// Available events:
// - tapko:initialized
// - tapko:comment:created
// - tapko:comment:submitted
// - tapko:comment:closed
// - tapko:recording:started
// - tapko:recording:stopped
// - tapko:error
```

## Support

- 📖 [Full Documentation](./PROJECT_STRUCTURE.md)
- 🐛 [Report Issues](https://github.com/your-repo/issues)
- 📧 support@tapko.com

---

Built with ❤️ by Claudin
