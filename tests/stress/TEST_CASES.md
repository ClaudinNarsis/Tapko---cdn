# Screenshot stress cases: bos.studiofreight.dev

Reference page for "hard" capture: Nuxt + Lenis smooth scroll, GSAP ScrollTrigger
pinned sections (`pin-spacer`), SplitText paragraphs (`<div class="word">` inside
`<p>`), a full-viewport WebGL scene (`.page-home__gl`, three.js, ~80 GLB/KTX2
assets) behind a `#bos-preloader` that stays up until the assets load (~84 s cold,
never in headless Lambda Chromium).

Run everything with `npm run stress -- <url>` (see `.claude/skills/stress-test/SKILL.md`).
It builds a dev-API widget, hits the real page and real dev renderer with every write endpoint
stubbed, and writes a truth-vs-capture `sheet.png` per run. A single cell:

```
node tests/stress/harness.js --widget <dev build> --url <url> \
  --dpr 2 --mode auto --render url --scrolls 0,4500,9000 --out runs/x --profile profiles/x
python3 tests/stress/sheet.py runs/x
```

A case passes when the uploaded screenshot matches what was on screen at submit
(same section, same text layout, scene present, pin where it was clicked), and the
capture finishes in under ~15 s.

## Matrix (every cell at scroll 0, 2500, 4500, 7000, 9000, 12000, 15000)

| # | DPR | Local settings (`screenshotMode`) | `renderMode` | Expected path |
|---|-----|-----------------------------------|--------------|---------------|
| M1 | 1 | off (`auto`) | `url` | URL skipped (live canvas fills viewport) → DOM |
| M2 | 2 | off (`auto`) | `url` | same as M1 |
| M3 | 1 | on (`local`) | `url` | getDisplayMedia (headed only); DOM if denied |
| M4 | 2 | on (`local`) | `url` | HiDPI → DOM, never getDisplayMedia |
| M5 | 1 | off | `html` | DOM |
| M6 | 2 | off | `html` | DOM |
| M7 | 3 | off | `url` | mobile 390x844, DOM |

Viewports from real reports: 745x868 and 1014x868 at DPR 2, scroll 0 and 9781.

## Scenarios

| # | Case | What to check |
|---|------|---------------|
| S1 | Comment inside a pinned GSAP section (scroll 9000-10000) | scene + section content, not a blank frame (prod bug, feedback "application") |
| S2 | SplitText paragraph on screen | words flow on lines, not one word per line |
| S3 | Preloader still up (comment before assets load) | capture shows the loader, same as the screen |
| S4 | Rapid back-to-back comments (no wait for upload) | every comment gets its own correct screenshot, queue drains |
| S5 | Scroll immediately after submit | screenshot is the submit-time view, not where the page scrolled to |
| S6 | Renderer down (route aborted) | comment still submits, no hang, no screenshot |
| S7 | Reload between comments | widget re-inits, captures still correct |
| S8 | Attach annotations | drawing canvas opens on a correct screenshot (null capture used to throw "No screenshot available") |
| S9 | Second comment on a page where URL capture failed | no second ~27 s URL attempt |
| S10 | Large viewport 2560x1440 DPR 1, small 390x844 DPR 3 | payload under limit, overlay pin at the right spot |

## Fixed in this pass (each was a failing case above)

- DOM snapshot taken after the 27 s URL attempt failed, so it showed the page half a minute later (S5, S3).
- URL capture "succeeded" with a blank frame on WebGL viewports; now skipped when a canvas covers >=25% of the viewport (S1).
- URL capture retried on every comment after failing (S9); client cap 20 s.
- `>\s+<` minify deleted inter-word spaces; `<p>` holding `<div>` children was split by the renderer's HTML parser (S2).
- No doctype in the payload, so the renderer laid it out in quirks mode.
- Canvas → `<img>` dropped class/id/style; DPR 2 full-viewport canvases over 500 KB were skipped (now downscaled).
- Renderer deadline measured after browser launch (28.5 s → API Gateway 504); loader check blind to `pointer-events:none` loaders.
- First Escape in annotation mode closed the card *under* the drawing layer, leaving a full-screen layer that blocked every later click (S8).

## Results (2026-11-17, dev renderer)

- Baseline widget: y≈9000 URL capture = black frame; DOM fallback = one word per line; 30-50 s per capture.
- Fixed widget: 40/40 matrix cells match the live page; S1-S4 and S6-S10 pass; S5 failed 1 of 3 (see Known limits). 5-6.5 s per capture on an idle machine.

## Known limits

- S5: scrolling within ~200 ms of Submit can still land in the snapshot (it is taken on the next frame after the card hides and the pin is scrolled into view).
- M3: getDisplayMedia can't be auto-accepted in automated Chrome (`NotReadableError`), so local mode at DPR 1 was only verified through its DOM fallback; check it by hand.
- Inline stage measured 11-35 s with three WebGL Chromes in parallel, 1-3 s solo; no budget added (leftover URLs would break localhost/auth-walled projects).
- After one URL-capture failure (incl. a single transient 5xx, or a public page needing 20-27 s), the rest of that page session uses DOM capture.
- Any page with a canvas covering >=25% of the viewport now uses DOM capture instead of URL capture.

## Awwwards sweep (2026-11-18): heavy / animated pages

Run `npm run stress -- <url> --quick` on each. To test a renderer change without deploying, serve
`Tapko-backend` `render()` on localhost and set `STRESS_RENDER_URL=http://localhost:3999/render`
(harness forwards `/render` calls there instead of the dev Lambda).

| Site | What it exercises | Fixed by |
|------|-------------------|----------|
| sweet-tape.com | 16 MB payload (68 inlined webp); reduction used to delete the site CSS -> unstyled page | images shed before stylesheets (`_reducePayload`) |
| zrk.technology | 13.6 MB payload; level 4 stripped every data-URI image incl. canvas snapshots | canvas snapshots protected, canvas JPEG steps down instead of giving up |
| jjettas.com | one 434 KB texture repeated 4x in CSS; `aria-hidden` WebGL hero removed at level 1; renderer ENOSPC/ERR_FAILED on file:// | `_dedupeStyleDataURIs`, aria-hidden kept, HTML served from memory |
| grail-app.com | `Navigating frame was detached` on one comment in five | renderer retries once on browser death |
| santalarch.com | tall page (30 000 px), payload near the 5.5 MB limit | below-fold pruning now actually runs (data-* strip erased its stamp) |
| extrafazant.nl | entrance-animated hero headline in URL mode | open, see Known limits |

Known limits found here:
- WebGL canvases drawn on demand (grail `_acceptBg`, sweet-tape hero scene) read back blank after their frame is
  presented, so the DOM capture can't contain them. A fully transparent readback is now skipped instead of
  becoming an opaque black box. Local screenshot mode (getDisplayMedia) is the way to get these.
- Canvases fed by cross-origin video (zrk hero) are tainted and can't be read.
