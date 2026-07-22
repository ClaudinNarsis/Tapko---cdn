import { defineConfig } from 'vitest/config';

// Minimal test infra (auth-redirect render-mode plan, T9) — this repo had
// zero test infrastructure before this. Scoped to the 3 files this plan
// touches: index.js, components/CommentCard.js, utils/screenshot.js.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
