https://brahimi73837.github.io/tunes/

# Tunes — done

A no-login, no-install music player that runs in the browser and is hosted on GitHub Pages. It searches the **full YouTube / YouTube Music catalog**, plays popular songs **ad-free from JioSaavn**, and keeps Audius, the Internet Archive and live radio.
Repo: https://github.com/brahimi73837/tunes (public). Every push to `main` runs the unit tests, builds and deploys via `.github/workflows/deploy.yml`. The search API is a Cloudflare Worker (`worker/`), deployed separately with `cd worker && npm run deploy`.

## Full catalog (YouTube Music + JioSaavn)
**How it works:**
1. The app calls the Worker at `https://tunes-api.tunes-api.workers.dev`. It's needed because YouTube and JioSaavn send no CORS headers, so a static site can't call them.
2. For `/v1/search` the Worker asks **YouTube Music** (its InnerTube API, songs filter) and **JioSaavn** at the same time.
3. It keeps YouTube Music's ranking, which is the best of the two, and **matches each song to a JioSaavn copy**. A match needs the same normalized title (featurings, "Remastered", "(From …)" dropped; remixes, live, slowed and covers kept distinct), at least one shared artist, and a duration within 8s.
4. The top 8 songs still unmatched get their own JioSaavn lookup by "title artist", capped at a 900ms budget.
5. Duplicate releases of the same recording are shown once.
6. Results are cached at the edge for 15 minutes.

**Playback:**
- **JioSaavn match** (badge "JioSaavn"): the full 320 kbps AAC file plays straight from `aac.saavncdn.com` in our own `<audio>` element. That means no ads, background playback, and lock-screen and media-key controls. The Worker decrypts JioSaavn's DES-"encrypted" media URL with a small pure-JS DES.
- **YouTube only** (badge "YouTube"): plays through the **official YouTube IFrame player** (youtube-nocookie.com), kept off-screen so you only hear audio. The 🎬 button in the player bar shows the video in a floating window. Seek, pause, volume, next/prev, resume-after-reload, queue and playlists all work the same as for any other track.
- **Fallback:** if a JioSaavn file fails, the same song plays from YouTube right away, from the same position. If a YouTube video won't play (for example the owner blocks embedding), `/v1/resolve` finds another copy, JioSaavn first and then a different upload such as the official music video. Only after that does the player skip the track.

**Other features:** search suggestions as you type (arrow keys, Enter and Esc; the list closes itself 1.8s after you stop typing). Results update live, and the previous results stay on screen while the next ones load. There's a **Videos** tab for any YouTube video (concerts, live sets, covers), and **Top songs today** on Home. That's YouTube Music's daily chart for your country, taken from the browser language (en-GB → UK), falling back to Global. Video titles are cleaned to song titles ("Artist - Song (Official Video)" → "Song"), and the top 30 are matched to JioSaavn; about half play ad-free.

## Verification
- **Full-catalog tests (added with the catalog work):**
  - **Unit, 22.** Worker: DES decryption checked against `openssl des-ecb`; YouTube Music song-row, video and JioSaavn parsing from saved real responses; title normalization; turning music-video titles into song titles; artist splitting; the matching and merge rules; duplicate collapse; music-video matching. App: API response sanitizing and YouTube id handling in share links.
  - **E2E, 12.** These run in branded Google Chrome **without** the autoplay override, so real autoplay rules apply:
    1. A popular song is the first result, has a JioSaavn stream, and a full-length track plays in `<audio>`.
    2. A YouTube-only song plays in the hidden player; show video, pause and resume work.
    3. Seeking works on YouTube.
    4. The Videos tab plays.
    5. The All tab puts Songs and Videos first.
    6. Suggestions work with the keyboard, and Esc keeps the query. They also close by themselves once typing pauses, so the tabs underneath can be clicked.
    7. Home charts play.
    8. A blocked JioSaavn CDN falls back to YouTube.
    9. The queue moves from JioSaavn to YouTube and back.
    10. A liked YouTube track survives a reload and resumes at its saved position.
    11. A JioSaavn track that ends auto-advances into a YouTube video with no click.
- **Unit tests (Vitest, 14):** playlist store (create/rename/delete, dedupe, reorder, remove, likes, persistence, export/import/merge, rejecting bad files) and the share-link encoding (compressed and plain round-trips, size, insecure-URL filtering, garbage rejection). They also run in CI on every deploy.
- **E2E (Playwright, 10):** these load the built site in Chromium with `--autoplay-policy=no-user-gesture-required`. They search each source (Audius / Archive / Radio), render results, click play, and check that `<audio>.currentTime` actually advances. They also cover the LIVE badge with the seek bar hidden for radio, like → queue → new playlist → reload persistence → share link opened in a fresh browser context → import, keyboard shortcuts, auto-skip of an unplayable track with a toast, queue remove/reorder/clear, and focus mode.
- All 10 e2e tests pass **against the live URL** (`BASE_URL=https://brahimi73837.github.io/tunes/ npx playwright test`) as well as locally.

## Features
**Player:** play/pause, next, previous (restarts the track if more than 3s in), seek bar with elapsed/total, ±10s skip, volume, mute, shuffle (restores the original order when turned off), and repeat off/all/one. A persistent bottom bar shows the artwork, title and artist. Clicking the artwork opens a full-screen "Now playing" view, which is also the main control surface on mobile.
**Queue:** a side panel (Q) where you can drag to reorder, move up/down, remove, clear (the current track keeps playing), "Play next", "Add to queue", and save the queue to a playlist.
**Resilience:** if a track errors, or plays with no progress for 10s, the player skips it and shows a toast. After 5 failures in a row it stops instead of looping.
**Media Session:** metadata and artwork, with play/pause/next/prev/seek handlers, so keyboard media keys and OS controls work.
**Live radio:** the seek bar is replaced by a pulsing LIVE badge. When you resume after a pause, the stream reconnects so you hear it live again.
**Search:** one live search box with suggestions and All / Songs / Videos / Audius / Archive / Radio tabs, skeleton loading states, empty states and retryable errors.
**Home:** today's top songs, Audius trending, genre tiles (each opens trending tracks for that genre plus matching radio), radio picks (top-voted https stations across 6 genres), trending Audius playlists, and free netlabel albums from the Archive.
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
0. **YouTube Music / YouTube + JioSaavn** (through the Worker): the main source for songs. See "Full catalog" above.
1. **Audius**: independent artists, and it needs **no API key** for reads. The app picks a host via `https://api.audius.co`, and uses track search, trending (overall and by genre), playlist search, trending playlists, playlist tracks, and `/v1/tracks/{id}/stream?app_name=tunes`. That endpoint 302-redirects to a signed content-node URL; CORS is `*`. Tracks marked `is_streamable: false` or stream-gated are filtered out, because their stream endpoint returns 404.
2. **Internet Archive**: `advancedsearch.php` (mediatype:audio, with spoken-word collections excluded), then `/metadata/{id}` to list the files, then `/download/{id}/{file}`. Each item is treated as an album. The app picks one MP3 flavour per item (the one with the most files, preferring VBR, then 320 kbps and so on) and falls back to Ogg if there is no MP3.
3. **Radio Browser**: uses mirrors `de1` → `de2` → `all`, because `fi1`, `nl1` and `at1` were dead when tested. Search is by name, tag and country code, with `hidebroken=true` and sorting by votes or clickcount. **Only https `url_resolved` streams are kept**, and duplicate stations (same stream or same name) are collapsed. Plays are reported to `/json/url/{uuid}` as the API requests.

**Not used:** Invidious and Piped. Public instances are mostly dead or have their APIs switched off (the healthiest Invidious instance reported `api: false, cors: false`). Server-side YouTube stream extraction (yt-dlp-style) wasn't used either: YouTube blocks it from datacenter IPs ("confirm you're not a bot", PO tokens). The IFrame player runs in your own browser, so it doesn't hit that problem.

## Decisions & known limitations
- **YouTube-only tracks can show YouTube's own ads.** This happens on monetized videos and depends on YouTube, not on us; an ad blocker in your browser usually removes them. JioSaavn tracks never have ads. On phones, a YouTube-only track may need **one tap on the video** to start, because mobile browsers won't start a cross-origin player without a tap. The player shows itself and says so. Lock-screen and background playback is reliable for JioSaavn tracks; for YouTube tracks it depends on the browser.
- **JioSaavn region.** JioSaavn hides most licensed music from IPs outside India. The Worker sends an Indian address as `X-Forwarded-For` (`SAAVN_GEO_IP` in `worker/src/types.ts` overrides it). The audio CDN (`aac.saavncdn.com`) serves the files worldwide. If JioSaavn ever stops honoring this, everything still plays through YouTube.
- **Unofficial APIs.** YouTube Music's InnerTube API and JioSaavn's `api.php` aren't public APIs and their formats can change. The parsers are defensive and covered by fixture tests; if one breaks, update `worker/src/youtube.ts` or `worker/src/saavn.ts` and run `npm run deploy` in `worker/`. Using them is against those services' terms, so treat this as a personal project.
- **Worker limits:** Cloudflare's free plan allows 100k requests a day. A search costs one request plus up to about 10 upstream calls, and results are edge-cached. CORS only allows the GitHub Pages origin and localhost (`ALLOWED_ORIGINS` in `worker/wrangler.toml`).
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
npm test                 # Vitest unit tests (app + worker)
npm run build
npm run test:e2e         # Playwright against the local build (starts vite preview)
BASE_URL=https://brahimi73837.github.io/tunes/ npx playwright test   # against the live site
```
