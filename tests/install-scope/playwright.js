// Resolve Playwright wherever it happens to live: a local devDependency, a global
// install, or a preinstalled one in a CI image. Keeps the harness runnable without
// adding a heavy dependency to package.json.
const CANDIDATES = [
  'playwright',
  '@playwright/test',
  '/opt/node22/lib/node_modules/playwright',
  '/usr/lib/node_modules/playwright'
];

let resolved = null;
for (const candidate of CANDIDATES) {
  try {
    resolved = require(candidate);
    break;
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
  }
}

if (!resolved) {
  console.error(
    'Playwright not found. Install it with `npm i -D playwright` (or `npm i -g playwright`)\n' +
    'and make sure a Chromium build is available.'
  );
  process.exit(1);
}

// Some images ship the browsers outside the default download location.
const { chromium } = resolved;
const EXECUTABLE = process.env.TAPKO_CHROMIUM || '/opt/pw-browsers/chromium';

module.exports = {
  chromium: {
    launch(options = {}) {
      const opts = { ...options };
      if (!opts.executablePath && require('fs').existsSync(EXECUTABLE)) {
        opts.executablePath = EXECUTABLE;
      }
      return chromium.launch(opts);
    }
  }
};
