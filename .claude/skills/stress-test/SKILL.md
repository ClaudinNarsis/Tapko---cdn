---
name: stress-test
description: Stress-test the widget's screenshot capture on any URL. Covers DPR 1/2/3, local settings on/off, renderMode url/html, plus scenarios (rapid comments, scroll after submit, renderer down, reload, annotations, 2560px). Use when the user pastes a URL and says "stress test", "test screenshots on this site", or reports that screenshots fail on a page.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Agent
---

## Run

```bash
npm install                                  # once; playwright is a devDependency, uses system Chrome
npm run stress -- <url>                      # full: 7 matrix cells + 6 scenarios, ~15-25 min
npm run stress -- <url> --quick              # M2 + M5 only, ~5 min
```

Run it in the background (it takes longer than one Bash timeout) and wait for the notification.
Output lands in `tests/stress/runs/<host>-<timestamp>/` (gitignored). Each run dir has
`truth-*.png` (what was on screen at submit), `upload-*` (what the widget uploaded),
`render-*` (renderer request HTML and response), `sheet.png` (truth | captured side by side),
`log.txt`, `console.txt` and `results.json`. `summary.js` prints a line per run at the end.

Safety: the harness only runs a **dev-API** bundle (run.sh builds one). It refuses anything else,
because writes are stubbed by matching the dev host and a prod bundle would create real feedback.

## Judge

The summary only counts uploads. **Pass/fail on content means opening every `sheet.png`** (Read the image):
- same section and scroll position as the truth, text flows in lines (not one word per line)
- canvas/WebGL/video areas present, not black or blank
- no loader/splash screen unless the truth shows one too
- pin lands where the click was
- `max` time under ~15 s per capture (WebGL sites run slower with 3 Chromes in parallel; re-run one cell solo with `PAR=1` before calling it slow)

Scenario checks:
- `S-annotate` uploads nothing by design; check `annotate-*.png` shows the drawing canvas over a correct screenshot.
- `S-rendererdown`: comments still submit, no hang.
- `S-midscroll`: `scrolled-after-submit` is expected; the capture must still match the truth. A miss within ~200 ms of Submit is a known limit.
- M3 (local, DPR 1) can't auto-accept getDisplayMedia in automated Chrome, so only its DOM fallback is tested. Tell the user to check it by hand.

## When the site needs tuning

`harness.js` waits up to 150 s for the page to be "ready": no full-viewport element named
`*preload*|*loader*|*splash*` at the centre, and no `html.lenis-stopped`. If the log says
`WARN loader still covering the page`, or the truth screenshots show an intro, find the site's
loader/scroll-lock signal and add it to the `waitForFunction` in `harness.js`.
Scroll positions default to 0/25/50/75/100% of the page; pass `--scrolls 0,4500,9000` to the harness
for specific sections (for example, ones named in a bug report).
If wheel scrolling doesn't reach the target (`WARN wanted scrollY`), the site hijacks scroll; check `log.txt`.

## Fix loop

1. For each failing cell, find out which path ran: `console.txt` has `[Tapko] Skipping URL-based screenshot (<reason>)`
   and stage timings; `results.json` `renders` shows url/html, status and time.
2. Open the `render-N-req.html` that was sent and compare it to the live DOM to find what the serializer broke.
3. Fix in `src/utils/screenshot.js` (backend renderer: `Tapko-backend/src/controllers/renderController.js`).
   Add a unit test in `tests/screenshot.robustness.test.js` that fails without the fix, then `npm test`.
4. Re-run only the failing cells (copy the matching `node tests/stress/harness.js ...` line from `run.sh`)
   with a rebuilt dev bundle, then the full run once at the end.
5. Add any new case to `tests/stress/TEST_CASES.md`.

You can spread cells across subagents (one `harness.js` call each, separate `--profile` and `--out`).
Keep it to 3 Chromes at once total.

## Report

Per cell: pass/fail with the sheet path, the path used (URL or DOM) and the time. Then fixes made
(file:line), known limits, and what needs a manual check. Nothing gets committed or PR'd without
asking. PRs go to `dev`.

Reference run and case list for a hard page (WebGL + GSAP + Lenis): `tests/stress/TEST_CASES.md`.
