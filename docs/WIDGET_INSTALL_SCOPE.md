# Widget install scope — why Tapko lands on one page instead of the whole app

**Status:** investigation complete, plan proposed, nothing implemented yet
**Widget version investigated:** 4.4.0.0 (`dist/tapko-widget.js`, built from `src/` at this commit)
**Method:** every claim below was reproduced in a real Chromium instance against a real
build of the bundle. Reproduction harness lives in `tests/install-scope/`.

---

## Short version

"The widget only installs on one page" is not one bug. It is **four**, and only the first
one is a documentation problem. The other three are defects in the widget that no
installation instruction can work around.

| # | Defect | Who it hits | Severity |
|---|--------|-------------|----------|
| D1 | The widget never notices a client-side route change | every SPA | High — widget looks broken on every route after the first |
| D2 | Once the bundle has run, it can never be re-initialised by re-injecting the script | React/Vue/Angular apps that mount it from a component | High — permanently dead until a full reload |
| D3 | A `<body>` swap detaches the widget and it never comes back | Turbo/Hotwire, Astro view transitions, htmx `hx-boost`, Livewire `wire:navigate` | Critical — unrecoverable, and `isReady()` lies |
| D4 | The documented multi-page install depends on which page the visitor lands on first | every classic multi-page site | Medium — works for the person testing it, fails for real traffic |

A fifth, smaller issue (D5) is that URL normalisation discards the query string and hash,
which collapses every route of a hash-router app into a single page.

---

## Evidence

All four reproductions are in `tests/install-scope/`. Run them with
`node tests/install-scope/server.js` in one shell and `node tests/install-scope/<name>-test.js`
in another. The API is stubbed via Playwright request interception, so no backend is needed.

### D1 — client-side navigation is invisible to the widget

The widget was installed **correctly**: one `<script src=… data-tapko-project-id=…>` in the
app shell, present on every route. Two feedback pins exist on the backend, one belonging to
`/spa/route-a` and one to `/spa/route-b`.

```
--- Load /spa/route-a (full page load) ---
route-a state: {"hostInDom":true,"mounted":true,"url":"/spa/route-a","pins":[]}
api calls so far: ["/dev/api/project?projectId=proj-test-1…","/dev/api/feedbacks?projectId=proj-test-1…"]

--- Client-side navigate to /spa/route-b (pushState, no reload) ---
url now: http://localhost:8099/spa/route-b
new api calls during navigation: []          <-- nothing happened

--- Hard reload of /spa/route-b (full page load) ---
route-b after reload: {"hostInDom":true,"mounted":true,"url":"/spa/route-b","pins":[]}

--- PinManager log ---
[PinManager] Fetched 2 feedbacks from backend
[PinManager] Found 1 feedbacks for current page      <-- route-a's pin, on first load
[PinManager] Fetched 2 feedbacks from backend
[PinManager] Found 1 feedbacks for current page      <-- route-b's pin, only after a reload
```

On `pushState` navigation the widget made **zero** API calls and `PinManager` did not run.
The floating button stays on screen, which is why this reads as "installed", but the widget
is still bound to the URL it first loaded on.

**Root cause.** `PinManager` is handed the page URL exactly once, at init:

- `src/index.js:1036` — `await this.pinManager.init(this.config.projectId, window.location.href)`
- `src/managers/PinManager.js:66` — pins are filtered by comparing each feedback's
  `context.pageUrl` to that captured URL
- `src/managers/PinManager.js:34-38` — `init()` hard-returns if it has already run
- There is **no** `popstate`, `hashchange`, `pushState`, or `replaceState` listener anywhere
  in `src/` (`grep -rn "pushState\|popstate\|hashchange" src/` returns only unrelated hits)

So after a route change the user sees the *previous* route's pins, anchored to elements that
no longer exist, and none of the current route's pins. Newly submitted feedback is fine —
`src/components/CommentCard.js:1068` reads `window.location.href` at submit time — which is
what makes this so confusing to diagnose: writing works, reading doesn't.

### D2 — the bundle is a one-shot

Simulating the common React pattern: a component injects the script tag on mount and calls
`Tapko.destroy()` on unmount, then the next route injects it again.

```
S4a first dynamic injection            : {"scriptLoaded":true,"widgetMounted":true,"ready":true}
S4b after destroy() (route unmount)    : {"scriptLoaded":true,"widgetMounted":false,"ready":false}
S4c re-injected on next route          : {"scriptLoaded":true,"widgetMounted":false,"ready":false}
S4  console warnings                   : ["[Tapko] Widget already initialized"]
```

The re-injected bundle never mounts. `src/index.js:52` guards the whole IIFE:

```js
if (window[CONFIG.NAMESPACE]) {
  console.warn('[Tapko] Widget already initialized');
  return;
}
```

`destroy()` (`src/index.js:899`) tears down the UI but leaves `window.Tapko` in place, so on
re-execution the guard fires and the auto-init block at `src/index.js:1253` is never reached.

Manual re-init *does* work — `window.Tapko.init({ projectId })` after `destroy()` remounts
cleanly (verified in `reinit-test.js`). That asymmetry is the basis of the workaround in
Phase 0 below: load the bundle once, drive `init()`/`destroy()` by hand, never re-inject.

Note also that `destroy()` deletes `tapko_session_config` (`src/index.js:957`). A component
unmount is not the same intent as "this user is done with Tapko", but it currently clears the
config that later pages rely on.

### D3 — a `<body>` swap is fatal

```
after initial load        : {"hostInDom":true,"ready":true}
after <body> swap         : {"hostInDom":false,"ready":true}   <-- gone, but claims to be alive
isInitialized still true? : true
```

The shadow host is appended to `document.body` (`src/index.js:352`). Turbo replaces the whole
`<body>` element on navigation; Astro's view-transition router swaps body content; htmx
`hx-boost` and Livewire `wire:navigate` do the same. The host goes with it.

`isInitialized` stays `true`, so:
- the widget is invisible,
- `isReady()` returns `true`, so any host-side "is it up?" check passes,
- `init()` early-returns "Already initialized", so nothing can bring it back.

Only a full page reload recovers. This is the most severe of the four because the widget
actively reports a healthy state while being absent.

Astro compounds it: [per Astro's docs](https://docs.astro.build/en/guides/view-transitions/),
anything bound to `DOMContentLoaded` does not re-run on client-side navigation — and
`src/index.js:1289` uses exactly that for the session-restore path.

### D4 — the documented multi-page install depends on entry order

The pattern in `examples/local-testing/` is: full snippet on `index.html`, bare
`<script src>` on every other page, config carried between them in `sessionStorage`
(`src/index.js:478` writes it, `src/index.js:1267` restores it).

```
S1  fresh session, land on bare page   : {"scriptLoaded":true,"widgetMounted":false,"ready":false}
S2a snippet page                       : {"scriptLoaded":true,"widgetMounted":true,"ready":true}
S2b then bare page (session restore)   : {"scriptLoaded":true,"widgetMounted":true,"ready":true}
```

It works if you browse in from the snippet page (S2) and fails if you arrive anywhere else
first (S1) — which is what happens with a shared review link, an organic search landing, a
refresh on an inner page, or a second tab. The person installing it always tests from the
homepage, so it always looks fine.

`sessionStorage` also does not survive a new tab, and is unavailable in some embedded and
privacy-restricted contexts, where the restore path silently no-ops.

### D5 — URL normalisation drops query and hash

`_normalizeUrl()` (`src/managers/PinManager.js:799`, `src/managers/PinStorage.js:70`) reduces
a URL to `protocol//host/pathname`. Consequences:

- **Hash routers collapse entirely.** Vue Router hash mode, Angular's `HashLocationStrategy`,
  and React Router's `HashRouter` put the route in the fragment, so `/#/dashboard` and
  `/#/billing` both normalise to `/`. Every pin from every route renders on every route.
- **Query-driven views collapse.** `?tab=billing` and `?tab=usage` share one pin set.

This may be deliberate (it makes pins survive UTM parameters, which is genuinely desirable).
It needs an explicit decision, not a silent default — see Phase 3.

---

## Which frameworks this happens in

"Wrong file" is where people actually paste it when the instructions just show raw HTML.
"Correct file" is the shell that renders on every route.

### Client-side routers — D1 always applies, even when installed correctly

| Framework | Wrong file (scopes to one route) | Correct file |
|---|---|---|
| Next.js App Router | `app/page.tsx`, or any `app/<route>/page.tsx` | `app/layout.tsx` (root layout), via `next/script` |
| Next.js Pages Router | `pages/index.tsx` | `pages/_app.tsx`, or `pages/_document.tsx` |
| React (Vite/CRA) | a route component | `index.html` / `public/index.html`, or `App.tsx` above the router |
| React Router v7 / Remix | a route module | `app/root.tsx` |
| Vue 3 (Vite) | a `.vue` view | `index.html` |
| Nuxt 3/4 | `pages/index.vue`, or `useHead` in one page | `nuxt.config.ts` → `app.head.script[]`, or `app.vue` |
| SvelteKit | `+page.svelte` | `src/app.html`, or the root `+layout.svelte` |
| Angular | a routed component | `src/index.html`, or `angular.json` → `architect.build.options.scripts` |
| Gatsby | a page component | `gatsby-ssr.js` (`onRenderBody`) + `gatsby-browser.js` |
| SolidStart / Qwik City | a route file | the root document component |
| Ember | a route template | `app/index.html` |
| Inertia.js (Laravel/Rails) | a page component | the Blade/ERB root layout |

### Body-swapping navigation — D3 applies, and it is fatal

| Framework | Correct file | Note |
|---|---|---|
| Rails 7+ / Hotwire Turbo | `app/views/layouts/application.html.erb` | Turbo replaces `<body>` on every visit |
| Astro + view transitions | `src/layouts/Layout.astro` | also needs `astro:page-load`; `DOMContentLoaded` won't fire |
| htmx with `hx-boost` | base template | swaps target containers, often `body` |
| Laravel Livewire (`wire:navigate`) | `resources/views/layouts/app.blade.php` | SPA-style body swap |
| Barba.js / Swup / Unpoly | base template | container swap |

Astro **without** view transitions behaves like a normal multi-page site (each navigation is
a real page load), so only D4 applies there.

### Classic multi-page — D4 applies

| Platform | Wrong place | Correct place |
|---|---|---|
| WordPress | pasting into one page/post via a block | `header.php`/`footer.php` in the theme, `wp_enqueue_script` in `functions.php`, WPCode, or GTM |
| Shopify | a page template or a single page's content | `layout/theme.liquid` |
| Webflow | **Page Settings → Custom Code** | **Site Settings → Custom Code → Footer** |
| Squarespace | a single page's Code Injection, or a code block | Settings → Advanced → Code Injection → Footer |
| Wix | Custom Code scoped to specific pages | Custom Code → "Apply to all pages" |
| Framer | page-level custom code | Site Settings → General → Custom Code |
| HubSpot CMS | a single page's header HTML | Settings → Website → Pages → site footer HTML |
| Laravel (Blade) | one view | `resources/views/layouts/app.blade.php` |
| Rails (no Turbo) | one view | `app/views/layouts/application.html.erb` |
| Django | one template | `base.html` |
| ASP.NET / Razor | one page | `_Layout.cshtml` |
| Hugo / Jekyll / 11ty | one content file | `layouts/_default/baseof.html`, `_layouts/default.html`, base layout |
| Plain HTML | one `.html` file | every page, or a build step |

Webflow is worth singling out — it has *two* custom-code panels with near-identical UI, one
site-wide and one page-scoped. It is the single most likely origin of this exact report.

---

## Plan

Ordered by value per unit of work. Phase 0 ships today and needs no widget change.

### Phase 0 — stop the bleeding with instructions (0.5 day, docs only)

The dashboard currently hands out a bare `<script>` tag with no indication of *where* it goes.
Replace it with a framework picker that emits the snippet **and the target filename**.

- Add a "Where does this go?" step to the install screen: pick the stack, get the exact file
  path and the full snippet for it.
- Lead every snippet with a comment naming the file: `<!-- app/layout.tsx — root layout, not a page -->`.
- For the site builders, name the exact menu path and warn about the page-level panel.
- Publish the known-issue notes for SPAs: a full reload is currently needed to see another
  route's pins. Say it plainly rather than letting customers discover it.
- For React/Vue/Angular, document the load-once pattern (Phase 0 workaround for D2):

```jsx
// Load the bundle ONCE in the app shell. Never inject it per route.
// Drive the widget through the global API instead.
useEffect(() => {
  if (window.Tapko?.isReady()) return;
  window.Tapko?.init({ projectId: 'xxx' });
}, []);
```

**Exit criteria:** a new customer on each of Next.js, Nuxt, Webflow and WordPress can install
site-wide from the dashboard without asking support.

### Phase 1 — make the widget follow route changes (2–3 days, fixes D1)

Add a route watcher to `src/index.js` and a re-scope path to `PinManager`.

1. **Emit a location-change signal.** Patch `history.pushState`/`replaceState` once, and
   listen to `popstate` and `hashchange`:

   ```js
   // src/utils/routeWatcher.js (new)
   export function watchLocation(onChange) {
     const fire = () => onChange(window.location.href);
     for (const m of ['pushState', 'replaceState']) {
       const original = history[m];
       history[m] = function (...args) {
         const result = original.apply(this, args);
         fire();
         return result;
       };
     }
     window.addEventListener('popstate', fire);
     window.addEventListener('hashchange', fire);
     // Frameworks that swap the document rather than push state
     for (const evt of ['astro:page-load', 'turbo:load', 'turbo:render']) {
       document.addEventListener(evt, fire);
     }
   }
   ```

   Patch defensively — record the original and restore it in `destroy()`, and guard against
   double-patching if the bundle is evaluated twice.

2. **Debounce and compare normalised URLs.** Only act when the normalised URL actually
   changes; routers fire `replaceState` frequently for scroll and query housekeeping. Debounce
   ~150 ms and coalesce.

3. **Add `PinManager.reloadForPage(projectId, pageUrl)`.** Today `init()` returns early
   (`PinManager.js:34`) and `clearAll()` (`PinManager.js:725`) also wipes IndexedDB, which is
   too destructive here. The new method should: remove pin elements from the shadow root,
   clear the in-memory `pins` map, leave `pinStorage` alone, then re-run the fetch/filter/render
   pass against the new URL.

4. **Re-point the rest of the page-scoped state**: analytics page view
   (`AnalyticsManager.trackPageView`), and any open comment card or feedback mode should close
   on navigation rather than hang over the new route.

5. **Wait for the new route to paint.** Pins anchor to elements by selector. Firing
   immediately after `pushState` will miss elements the router has not rendered yet — resolve
   on the next animation frame after the location settles, with a short retry for
   selectors that are not there yet.

**Test:** `tests/install-scope/spa-test.js` currently prints `new api calls during navigation: []`.
After this phase it must show a `/feedbacks` call and `Found 1 feedbacks for current page`
for route-b without a reload.

### Phase 2 — make init/destroy idempotent (1–2 days, fixes D2 and D3)

1. **Separate "is the API loaded" from "is the widget mounted."** The guard at
   `src/index.js:52` should only skip *re-defining* the class, not skip auto-init. Extract the
   auto-init block (`src/index.js:1253-1292`) into `window.Tapko.__bootstrap()` and call it on
   every evaluation of the bundle. It is already safe to call twice — `init()` guards on
   `isInitialized`/`_isInitializing`.

2. **Make `isReady()` tell the truth.** Return
   `this.isInitialized && !!this.shadowHost?.isConnected`. This alone converts D3 from silent
   to detectable.

3. **Self-heal on detach.** Watch for the host leaving the document and re-attach:

   ```js
   const observer = new MutationObserver(() => {
     if (this.isInitialized && this.shadowHost && !this.shadowHost.isConnected) {
       document.body.appendChild(this.shadowHost);   // re-attach, keep all state
     }
   });
   observer.observe(document.documentElement, { childList: true, subtree: false });
   ```

   Observing `documentElement` with `subtree: false` catches the `<body>` replacement itself
   without the cost of watching the whole tree. Pair it with the `turbo:load` /
   `astro:page-load` listeners from Phase 1 as a belt-and-braces path.

4. **Split `destroy()` from "forget me."** `destroy()` should stop clearing
   `tapko_session_config` (`src/index.js:957`). Move that to an explicit
   `Tapko.reset()` for the "log out / disable" case. A route unmount is not a logout.

**Test:** `bodyswap-test.js` must end with `hostInDom: true`; `mpa-test.js` S4c must show
`widgetMounted: true`.

### Phase 3 — decide what a "page" is (0.5 day, addresses D5)

Make URL scoping explicit and configurable rather than an accident of `_normalizeUrl`:

```js
Tapko.init({
  projectId: 'xxx',
  pageKey: 'pathname'          // 'pathname' (default) | 'pathname+search' | 'href' | (url) => string
});
```

Ship `pathname+hash` as the default when a hash route is detected (`location.hash` starting
with `#/`), so hash-router apps stop collapsing. Let customers pass a function for the
awkward cases (`/products/123` where every product should share one pin set).

This changes which pins match existing feedback, so it needs a migration note — existing
`context.pageUrl` values are full hrefs and remain the source of truth, so only the
comparison changes.

### Phase 4 — remove the install failure mode entirely (1 week)

1. **Publish `@tapko/widget` on npm** with framework wrappers that make the wrong install
   impossible: `<TapkoProvider projectId>` for React, a Nuxt module, a Vue plugin, an Angular
   provider. Each mounts once at the app root and calls the global API. This is the single
   highest-leverage item for SPA customers.

2. **Ship a tiny loader.** A ~1 KB `tapko.js` that does nothing but inject the real bundle,
   so the customer's site-wide snippet never changes again and the heavy bundle can be
   versioned and cached independently.

3. **Add an install verifier.** A dashboard button that crawls a handful of the customer's
   URLs (sitemap-derived) and reports which ones have the widget. This turns "it only works on
   one page" from a support ticket into a self-serve check, and it is what would have caught
   D4 before a customer did.

4. **Document the GTM path.** Many agency customers already run Google Tag Manager, where
   site-wide is the default. For them this is a two-minute install and sidesteps every
   template question above.

### Phase 5 — regression coverage (ongoing)

Promote `tests/install-scope/` into CI. The four harness scripts already assert the exact
behaviours above and run headless against the built bundle. Wire them into a
`npm run test:install-scope` script and gate releases on them, so this cannot regress silently.

---

## Sequencing recommendation

Ship **Phase 0 this week** — it costs nothing and stops new customers hitting D4.
Then **Phase 2 before Phase 1**: D3 is the only unrecoverable defect and its fix is smaller.
Phase 1 is the bigger engineering lift and the one customers will notice most.
Phases 3–5 follow.

## What to tell existing customers

For anyone already reporting this, the immediate mitigations are:

- **Multi-page sites:** put the full snippet — including `data-tapko-project-id` — in the
  site-wide template, not just the bare script tag. Do not rely on the bare-script +
  session-restore pattern; it fails on direct entry (D4).
- **SPAs:** install in the app shell, and expect to reload to see another route's pins until
  Phase 1 ships (D1).
- **Turbo/Astro/htmx/Livewire:** there is no reliable workaround today (D3). Prioritise
  Phase 2 for these accounts.
