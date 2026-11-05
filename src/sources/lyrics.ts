import { fetchJson } from '../lib/http'
import type { Track } from '../types'
import { youtubeLyrics } from './catalog'

/** Lyrics for the now-playing view: time-synced from lrclib.net when it has them, else plain text. */
export interface Lyrics {
  /** Lines with their start time in seconds, in order. */
  synced?: { at: number; text: string }[]
  plain?: string
  source: string
}

interface LrclibHit {
  trackName?: string
  artistName?: string
  duration?: number
  instrumental?: boolean
  syncedLyrics?: string | null
  plainLyrics?: string | null
}

const LRCLIB = 'https://lrclib.net/api'

/** "[01:02.34] line" → { at: 62.34, text: "line" }; drops metadata tags and blank timings. */
export function parseLrc(lrc: string): { at: number; text: string }[] {
  const out: { at: number; text: string }[] = []
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    if (!stamps.length) continue
    const text = raw.replace(/\[[^\]]*\]/g, '').trim()
    for (const m of stamps) {
      const frac = m[3] ? Number(m[3]) / 10 ** m[3].length : 0
      out.push({ at: Number(m[1]) * 60 + Number(m[2]) + frac, text })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/** Index of the line being sung at `time` (-1 before the first line). */
export function activeLine(lines: { at: number }[], time: number): number {
  let lo = 0
  let hi = lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].at <= time + 0.25) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

/** Search-friendly title and lead artist: no "(feat. …)", "(Official Video)", "- Remastered". */
export function lyricsQuery(t: Pick<Track, 'title' | 'artist'>): { title: string; artist: string } {
  const title = t.title
    .replace(/\s*[([](feat|ft|with|official|lyrics?|audio|video|remaster|from)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(remaster|.*version).*$/i, '')
    .trim()
  const artist = t.artist.split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b)\s*/i)[0].trim()
  return { title: title || t.title, artist: artist || t.artist }
}

function fromHit(h: LrclibHit | null | undefined): Lyrics | null {
  if (!h) return null
  if (h.syncedLyrics) {
    const synced = parseLrc(h.syncedLyrics)
    if (synced.length) return { synced, plain: h.plainLyrics ?? undefined, source: 'LRCLIB' }
  }
  return h.plainLyrics ? { plain: h.plainLyrics, source: 'LRCLIB' } : null
}

export async function getLyrics(t: Track, signal?: AbortSignal): Promise<Lyrics | null> {
  const { title, artist } = lyricsQuery(t)
  const q = new URLSearchParams({ track_name: title, artist_name: artist })
  if (t.duration) q.set('duration', String(Math.round(t.duration)))
  let found = await fetchJson<LrclibHit>(`${LRCLIB}/get?${q}`, { signal, timeoutMs: 8000 })
    .then(fromHit)
    .catch(() => null)
  if (!found?.synced) {
    // No exact match: search, preferring synced lyrics of about the same length.
    const hits = await fetchJson<LrclibHit[]>(`${LRCLIB}/search?${new URLSearchParams({ track_name: title, artist_name: artist })}`, { signal, timeoutMs: 8000 }).catch(() => [])
    const near = (h: LrclibHit) => !t.duration || !h.duration || Math.abs(h.duration - t.duration) <= 4
    const best = hits.find((h) => h.syncedLyrics && near(h)) ?? hits.find((h) => h.plainLyrics && near(h))
    found = (best && fromHit(best)) ?? found
  }
  if (found) return found
  if (t.youtubeId) {
    const yt = await youtubeLyrics(t.youtubeId, signal).catch(() => null)
    if (yt) return { plain: yt.text, source: yt.source?.replace(/^Source:\s*/i, '') || 'YouTube Music' }
  }
  return null
}
