import { artistSet, normTitle } from './text'
import type { CatalogTrack } from './types'

const EDIT_WORDS = /\b(remix|mix|live|acoustic|instrumental|slowed|sped|reverb|nightcore|cover|karaoke|version|demo|unplugged|mashup|bootleg|flip|rework|vip)\b/

/**
 * How confident we are that two catalog entries are the same recording (0 = different).
 * Title and at least one artist must agree; duration breaks ties and rejects other edits.
 */
export function matchScore(a: Pick<CatalogTrack, 'title' | 'artist' | 'duration'>, b: Pick<CatalogTrack, 'title' | 'artist' | 'duration'>): number {
  const ta = normTitle(a.title)
  const tb = normTitle(b.title)
  if (!ta || !tb) return 0
  let title = 0
  if (ta === tb) title = 1
  else if ((ta.startsWith(tb + ' ') || tb.startsWith(ta + ' ')) && Math.min(ta.length, tb.length) >= 4) {
    // "Song" vs "Song Radio Edit" is fine; "Song" vs "Song Stormzy Remix" is a different recording.
    const extra = (ta.length > tb.length ? ta : tb).slice(Math.min(ta.length, tb.length))
    if (!EDIT_WORDS.test(extra)) title = 0.7
  }
  if (!title) return 0

  const aa = artistSet(a.artist)
  const ab = artistSet(b.artist)
  const shared = [...aa].some((x) => ab.has(x) || [...ab].some((y) => (x.length > 3 && y.includes(x)) || (y.length > 3 && x.includes(y))))
  if (!shared) return 0

  if (!a.duration || !b.duration) return title === 1 ? 0.6 : 0
  const diff = Math.abs(a.duration - b.duration)
  if (diff <= 3) return title
  if (diff <= 8) return title * 0.8
  return 0
}

export function bestMatch<T extends Pick<CatalogTrack, 'title' | 'artist' | 'duration'>>(target: Pick<CatalogTrack, 'title' | 'artist' | 'duration'>, candidates: T[], exclude?: Set<T>): T | null {
  let best: T | null = null
  let bestScore = 0.55
  for (const c of candidates) {
    if (exclude?.has(c)) continue
    const s = matchScore(target, c)
    if (s > bestScore) {
      best = c
      bestScore = s
    }
  }
  return best
}

const squash = (s: string) => normTitle(s).replace(/\s+/g, '')

/**
 * Music videos are titled "Artist - Song (Official Video)" on channels like "ArtistVEVO",
 * so compare loosely: the song title and an artist must both appear somewhere, and the
 * video may run longer than the song (intros, outros, skits).
 */
export function videoMatch<T extends Pick<CatalogTrack, 'title' | 'artist' | 'duration'>>(target: Pick<CatalogTrack, 'title' | 'artist' | 'duration'>, videos: T[]): T | null {
  const title = squash(target.title)
  const artists = [...artistSet(target.artist)].map((a) => a.replace(/\s+/g, ''))
  if (!title) return null
  return (
    videos.find((v) => {
      const hay = squash(`${v.title} ${v.artist}`)
      const timeOk = !target.duration || !v.duration || (v.duration >= target.duration - 5 && v.duration <= target.duration + 90)
      return timeOk && hay.includes(title) && artists.some((a) => hay.includes(a))
    }) ?? null
  )
}

/**
 * Keeps YouTube Music's ranking (it is by far the best) but swaps in the JioSaavn stream for
 * every song it also has: that plays ad-free through our own <audio> element, works in the
 * background on phones, and keeps the YouTube id as a fallback.
 */
export function mergeSongs(yt: CatalogTrack[], saavn: CatalogTrack[]): CatalogTrack[] {
  const used = new Set<CatalogTrack>()
  const merged = yt.map((y) => {
    const s = bestMatch(y, saavn, used)
    if (!s) return y
    used.add(s)
    return {
      ...s,
      title: y.title,
      artist: y.artist,
      meta: y.meta ?? s.meta,
      explicit: y.explicit || s.explicit,
      youtubeId: y.youtubeId,
    }
  })
  // The same recording often appears twice (single and album release); show it once.
  const kept: CatalogTrack[] = []
  for (const t of merged) {
    const twin = kept.find((k) => normTitle(k.title) === normTitle(t.title) && k.artist.toLowerCase() === t.artist.toLowerCase() && Math.abs(k.duration - t.duration) <= 2)
    if (!twin) kept.push(t)
    else if (twin.source === 'youtube' && t.source === 'saavn') kept[kept.indexOf(twin)] = t
  }
  return kept
}
