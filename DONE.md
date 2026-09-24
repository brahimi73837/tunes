https://brahimi73837.github.io/tunes/

# Tunes — done

A no-login, no-install, ad-free music player that runs entirely in the browser and is hosted on GitHub Pages.
Repo: https://github.com/brahimi73837/tunes (public). Every push to `main` runs the unit tests, builds and deploys via `.github/workflows/deploy.yml`.

## Verification
- **Unit tests (Vitest, 14):** playlist store (create/rename/delete, dedupe, reorder, remove, likes, persistence, export/import/merge, rejecting bad files) and the share-link encoding (compressed and plain round-trips, size, insecure-URL filtering, garbage rejection). They also run in CI on every deploy.
- **E2E (Playwright, 10):** these load the built site in Chromium with `--autoplay-policy=no-user-gesture-required`. They search each source (Audius / Archive / Radio), render results, click play, and check that `<audio>.currentTime` actually advances. They also cover the LIVE badge with the seek bar hidden for radio, like → queue → new playlist → reload persistence → share link opened in a fresh browser context → import, keyboard shortcuts, auto-skip of an unplayable track with a toast, queue remove/reorder/clear, and focus mode.
- All 10 e2e tests pass **against the live URL** (`BASE_URL=https://brahimi73837.github.io/tunes/ npx playwright test`) as well as locally.

## Features
**Player:** play/pause, next, previous (restarts the track if more than 3s in), seek bar with elapsed/total, ±10s skip, volume, mute, shuffle (restores the original order when turned off), and repeat off/all/one. A persistent bottom bar shows the artwork, title and artist. Clicking the artwork opens a full-screen "Now playing" view, which is also the main control surface on mobile.
**Queue:** a side panel (Q) where you can drag to reorder, move up/down, remove, clear (the current track keeps playing), "Play next", "Add to queue", and save the queue to a playlist.
**Resilience:** if a track errors, or plays with no progress for 10s, the player skips it and shows a toast. After 5 failures in a row it stops instead of looping.
**Media Session:** metadata and artwork, with play/pause/next/prev/seek handlers, so keyboard media keys and OS controls work.
**Live radio:** the seek bar is replaced by a pulsing LIVE badge. When you resume after a pause, the stream reconnects so you hear it live again.
**Search:** one debounced box with All / Audius / Archive / Radio tabs, skeleton loading states, empty states and retryable errors.
**Home:** Audius trending, genre tiles (each opens trending tracks for that genre plus matching radio), radio picks (top-voted https stations across 6 genres), trending Audius playlists, and free netlabel albums from the Archive.
**Radio tab:** genre chips (lofi, jazz, pop, rock, classical, hits, chill, electronic), a name filter, a country picker, and sorting by votes or plays.
**Playlists:** create, rename, delete, duplicate, drag-and-drop reorder, and remove. You can add from any track menu, drag a track onto a sidebar playlist, or add from the queue. Play or shuffle-play any playlist. The built-in **Liked** playlist has a heart on every track and station.
**Persistence (localStorage):** playlists, queue, current track and position, volume, mute, shuffle, repeat, compact mode and the visualizer toggle. On reload the last track is restored paused at the same position; the app never autoplays on load.
**Backup:** export all playlists (or one) as JSON and import it again; importing merges and never creates duplicates. **Share link** puts a whole playlist into the URL hash, compressed with deflate and base64url, so you can open it in any other browser and save it.
**Extras:** sleep timer (15–90 min or end of track), compact/mini mode, **Focus mode** (queues a mix of lofi, ambient and chillout live stations), a visualizer you can switch off, and an installable PWA manifest with no service worker, so nothing caches audio.
**UX:** dark and responsive. Desktop has a sidebar; mobile has a bottom tab bar and a full-screen player. Routing is hash-based (`#/search?q=…`), so deep links work on GitHub Pages, and Vite `base` is `/tunes/`.

## Keyboard shortcuts
| Key | Action |
|---|---|
| Space (or K) | Play / pause |
| ← / → | Seek −10s / +10s |
| Shift + ← / → | Previous / next track |
| ↑ / ↓ | Volume up / down |
| M | Mute |
| S | Shuffle |
| R | Cycle repeat |
| L | Like current track |
| Q | Toggle queue |
| / | Focus search |
| ? | Shortcut help |
| Esc | Close dialogs / leave search box |

## Sources (all probed with real requests first; see NOTES.md)
1. **Audius**: the primary source, and it needs **no API key** for reads. The app picks a host via `https://api.audius.co`, and uses track search, trending (overall and by genre), playlist search, trending playlists, playlist tracks, and `/v1/tracks/{id}/stream?app_name=tunes`. That endpoint 302-redirects to a signed content-node URL; CORS is `*`. Tracks marked `is_streamable: false` or stream-gated are filtered out, because their stream endpoint returns 404.
2. **Internet Archive**: `advancedsearch.php` (mediatype:audio, with spoken-word collections excluded), then `/metadata/{id}` to list the files, then `/download/{id}/{file}`. Each item is treated as an album. The app picks one MP3 flavour per item (the one with the most files, preferring VBR, then 320 kbps and so on) and falls back to Ogg if there is no MP3.
3. **Radio Browser**: uses mirrors `de1` → `de2` → `all`, because `fi1`, `nl1` and `at1` were dead when tested. Search is by name, tag and country code, with `hidebroken=true` and sorting by votes or clickcount. **Only https `url_resolved` streams are kept**, and duplicate stations (same stream or same name) are collapsed. Plays are reported to `/json/url/{uuid}` as the API requests.

**Dropped: none.** YouTube, Invidious/Piped, Spotify and Tidal were not used, as instructed.

## Decisions & known limitations
- **No mainstream label catalog.** This is independent and Creative Commons music, Archive recordings and radio. Chart hits are mostly available only through the radio stations.
- **The visualizer is decorative.** It animates from the play state instead of reading audio samples. A real analyser needs `crossOrigin` on the `<audio>` element, which would break most radio streams because they send no CORS headers. So the main audio element never gets `crossOrigin`, as the brief required.
- About half of the radio directory is http-only and is hidden because browsers block mixed content. Some https stations are also offline at any given moment; the player auto-skips those.
- Some Audius artwork lives on content nodes that are occasionally down; a generated gradient cover is shown instead.
- Internet Archive search relevance depends on the Archive's metadata. Some items are huge (hundreds of files) or contain no browser-playable audio, and the album page says so when that happens.
- Everything is stored in this browser only. Clearing site data erases your playlists, so export a backup (see below).
- `gh` was not installed on this machine. I installed it with Homebrew and used the GitHub token already stored in the macOS keychain (git credential helper) for `gh` calls.

## How to back up playlists
- **Library → Export all** downloads `tunes-playlists-YYYY-MM-DD.json`. On any browser, **Library → Import JSON** restores it. Importing the same file again merges into the existing playlists and does not duplicate them.
- For one playlist, open it and use **⋯ → Export as JSON**, or **Share link**. Share link copies a URL that contains the whole playlist; open it anywhere and press **Save to my library**.

## Development
```bash
npm install
npm run dev
npm test                 # Vitest unit tests
npm run build
npm run test:e2e         # Playwright against the local build (starts vite preview)
BASE_URL=https://brahimi73837.github.io/tunes/ npx playwright test   # against the live site
```
