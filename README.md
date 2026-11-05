# Tunes

**Live: https://brahimi73837.github.io/tunes/**

A free, no-login, **ad-free** music player that runs in the browser. Search **any song or video on YouTube**; everything plays as plain audio in the app's own player: full-quality **JioSaavn** files when they exist, otherwise YouTube audio through privacy proxies (the approach [ytify](https://github.com/n-ce/ytify) uses). It has artist and album pages, radio and autoplay, synced lyrics, and YouTube playlist import, plus independent artists on **Audius**, free albums and live recordings from the **Internet Archive**, and live **internet radio** from radio-browser.info.

The app is a static site (Vite + React + TypeScript + Tailwind + Zustand) deployed to GitHub Pages. Search, stream lookup and the music pages run through a small Cloudflare Worker in [`worker/`](worker/) (`https://tunes-api.tunes-api.workers.dev`, using [YouTube.js](https://github.com/LuanRT/YouTube.js)), because YouTube and JioSaavn don't allow browsers to call them directly. Audio never passes through the Worker.

```bash
npm install
npm run dev          # local dev server (uses the deployed Worker)
npm test             # unit tests (Vitest): app + worker
npm run build
npm run test:e2e     # Playwright against the built site (catalog tests need Google Chrome installed)
BASE_URL=https://<live-url>/ npx playwright test   # same tests against the live site

# Worker
cd worker && npm install
npm run dev          # local Worker on :8787 (point the app at it with VITE_API_BASE=http://localhost:8787)
npm run deploy       # wrangler deploy (needs `npx wrangler login` once)
```

See [DONE.md](DONE.md) for features, sources, keyboard shortcuts, limitations and how to back up playlists, and [NOTES.md](NOTES.md) for the API probe results.
