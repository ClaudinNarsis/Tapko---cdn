# Install-scope reproduction harness

These scripts reproduce the four defects behind "the widget only installs on one page",
documented in [`docs/WIDGET_INSTALL_SCOPE.md`](../../docs/WIDGET_INSTALL_SCOPE.md).

They drive the **real built bundle** in a real Chromium instance. The backend is stubbed with
Playwright request interception, so no API, project, or network access is needed.

## Running

```bash
npm run build                       # produces dist/tapko-widget.js

node tests/install-scope/server.js  # shell 1 — serves dist/ + the fixture pages on :8099

node tests/install-scope/spa-test.js        # shell 2
node tests/install-scope/mpa-test.js
node tests/install-scope/bodyswap-test.js
node tests/install-scope/reinit-test.js
```

Playwright is resolved from a local devDependency, a global install, or a preinstalled copy
(see `playwright.js`). Override the browser binary with `TAPKO_CHROMIUM=/path/to/chromium`.

## What each script proves

| Script | Defect | Current (broken) result | Expected after the fix |
|---|---|---|---|
| `spa-test.js` | D1 — no route awareness | `new api calls during navigation: []` | a `/feedbacks` call and the new route's pins, with no reload |
| `mpa-test.js` | D4 — entry-order dependency<br>D2 — one-shot bundle | S1 `widgetMounted:false`<br>S4c `widgetMounted:false` | S1 mounts when the snippet is site-wide<br>S4c remounts on re-injection |
| `bodyswap-test.js` | D3 — `<body>` swap | `hostInDom:false` while `ready:true` | `hostInDom:true` (self-heals) |
| `reinit-test.js` | D2 — control case | passes today | keeps passing |

`reinit-test.js` is the control: it shows that `Tapko.init()` after `Tapko.destroy()` *does*
work, which is why the Phase 0 workaround (load the bundle once, drive the global API by hand)
is sound.

## Fixtures

- `spa.html` — app shell with a `pushState` router and two routes. The widget is installed
  the *correct* way: once, in the shell.
- `page-with-snippet.html` — a page carrying the full snippet with `data-tapko-project-id`.
- `page-bare.html` — a page carrying only `<script src>`, mirroring the pattern in
  `examples/local-testing/about.html`.
- `page-none.html` — a page with no Tapko script, used as the base for dynamic injection.
