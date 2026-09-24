# API probe notes (2026-09-24)

All probes done with `curl` sending `Origin: https://x.github.io` to check CORS.

## Audius — works, no API key needed for reads
- Host selection: `GET https://api.audius.co` → `{"data":["https://api.audius.co"]}`. `Access-Control-Allow-Origin: *`.
- `GET /v1/tracks/search?query=lofi&app_name=tunes` → 200, ACAO `*`. Track fields used: `id`, `title`, `user.name`, `artwork["480x480"]`, `duration`, `is_streamable`, `is_stream_gated`, `genre`.
- Some search results have `is_streamable: false` (stream endpoint then returns 404) → filtered out.
- `GET /v1/tracks/{id}/stream?app_name=tunes` → 302 to a content node (`https://…/tracks/cidstream/…?signature=…`) → 206 `audio/mpeg`, ACAO `*`. The redirecting endpoint is stable, so it is what we store as `streamUrl` (the inline `stream.url` field in track JSON is a signed, time-stamped URL — not stored).
- `GET /v1/tracks/trending?genre=Electronic&time=week` → 200.
- `GET /v1/playlists/search?query=lofi` → 200; `GET /v1/playlists/{id}/tracks` → 200.
- `GET /v1/playlists/trending` → 200.
- Artwork is served from content nodes over https.

## Internet Archive — works
- `GET https://archive.org/advancedsearch.php?q=…+AND+mediatype:audio&fl[]=identifier&fl[]=title&fl[]=creator&sort[]=downloads+desc&rows=…&output=json` → 200, ACAO `*`.
- `GET https://archive.org/metadata/{identifier}` → 200, ACAO `*`. `files[]` has `name`, `format` ("VBR MP3", "128Kbps MP3", …), `length` (seconds as "1783.69" or "mm:ss"), `title`, `track`, `creator`.
- `GET https://archive.org/download/{id}/{file}` → 302 to `https://dnXXXX.*.archive.org/0/items/…` → 206 `audio/mpeg`, ACAO `*`.
- Artwork: `https://archive.org/services/img/{identifier}`.
- Plain keyword search returns lots of old-time-radio / spoken word; we bias query to title/creator/subject and exclude a couple of spoken-word collections.

## Radio Browser — works
- `GET https://all.api.radio-browser.info/json/servers` → list of mirrors (today only `de1`; `de2` also answers). `fi1`, `nl1`, `at1` are dead. Adapter tries de1 → de2 → all.
- `GET /json/stations/search?tag=lofi&hidebroken=true&order=votes&reverse=true&limit=…` → 200, ACAO `*`.
- Many `url_resolved` values are `http://` → dropped (mixed content). ~50% of top stations are https.
- Playback of a stream in `<audio>` does not need CORS (no `crossOrigin` attribute set).
- Hard-coded SomaFM URLs hang from this network, so the home "curated radio" is fetched live from Radio Browser (top-voted https stations per tag) instead of hard-coding stream URLs.

## Visualizer decision
A real Web Audio analyser needs `crossOrigin="anonymous"` on the audio element; radio streams mostly lack CORS on the stream itself, and a CORS-tainted `MediaElementSource` outputs silence. So the visualizer is decorative (animated from play state), and the audio element never gets `crossOrigin`.
