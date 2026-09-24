# Tunes

**Live: https://brahimi73837.github.io/tunes/**

A free, no-login music player that runs entirely in the browser: independent artists on **Audius**, free albums and live recordings from the **Internet Archive**, and live **internet radio** from radio-browser.info.

Static site (Vite + React + TypeScript + Tailwind + Zustand), deployed to GitHub Pages.

```bash
npm install
npm run dev          # local dev server
npm test             # unit tests (Vitest)
npm run build
npm run test:e2e     # Playwright smoke tests against the built site
BASE_URL=https://<live-url>/ npx playwright test   # same tests against the live site
```

See [DONE.md](DONE.md) for features, sources, keyboard shortcuts, limitations and how to back up playlists, and [NOTES.md](NOTES.md) for the API probe results.
