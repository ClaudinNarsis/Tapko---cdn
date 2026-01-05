# Tapko Project Instructions for AI Agents

## Core Principles
1. **No html2canvas**: NEVER use `html2canvas` for screenshot capture in this project. It has significant issues with modern CSS like high gradients and complex layouts. Use `dom-to-image` for all screenshot-related tasks.
2. **Shadow DOM Isolation**: All widget elements MUST be rendered within the Shadow DOM (`tapko-widget-shadow-host`). 
3. **Encapsulated Styling**: All widget-specific styling must be injected into the Shadow DOM. DO NOT add global styles to the host page that could interfere with the original site's appearance.
4. **Namespace Compliance**: All custom events and CSS classes should follow the defined namespace prefixes (`tapko-` or as defined in `config.js`).

## Screenshot Engine: dom-to-image
- Primary utility: `src/utils/screenshot.js`
- Target: `document.documentElement` for full layout awareness.
- Positioning: Use negative `marginTop`/`marginLeft` on the root element within the `style` option of `dom-to-image` to align the viewport.
- Scaling: Handle `window.devicePixelRatio` for high-resolution captures.

## Build Process
- Styles from `src/styles/widget.css` are bundled and replaced via the `INJECTED_CSS` placeholder in `src/index.js` during the build process (`build.js`).
- Use `ShadowStyleManager` to manage styles within the encapsulated shadow root.
