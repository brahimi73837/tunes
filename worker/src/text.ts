const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

/** "3:22" / "1:02:03" → seconds. */
export function parseDuration(s: string | undefined): number {
  if (!s || !/^\d+(:\d{1,2})+$/.test(s.trim())) return 0
  return s.trim().split(':').reduce((acc, p) => acc * 60 + Number(p), 0)
}

const NOISE = /\b(official( music)? (video|audio)|lyrics?( video)?|audio|hd|4k|visuali[sz]er|remaster(ed)?( \d{4})?|\d{4} remaster(ed)?|explicit|clean|from [^)\]]*)\b/g

/** Normalises a title for comparison: drops featurings, bracketed notes, punctuation and accents. */
export function normTitle(s: string): string {
  return decodeEntities(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\((feat|ft|with)\.?[^)]*\)|\[(feat|ft|with)\.?[^\]]*\]/g, ' ')
    .replace(/\s(feat|ft)\.?\s.*$/, ' ')
    .replace(/[([][^)\]]*[)\]]/g, (m) => (/(remix|live|acoustic|instrumental|slowed|sped|nightcore|cover|karaoke|version|edit|mix)/.test(m) ? m : ' '))
    .replace(/\s-\s.*(remaster|version|edit|mono|stereo).*$/, ' ')
    .replace(NOISE, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Lower-cased individual artist names, split on the usual separators. */
export function artistSet(s: string): Set<string> {
  return new Set(
    decodeEntities(s)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/\s*(?:,|&|\band\b|\bx\b|\bfeat\.?|\bft\.?|\bwith\b|\/)\s*/)
      .map((a) => a.replace(/[^\p{L}\p{N}]+/gu, ' ').trim())
      .filter(Boolean),
  )
}

const VIDEO_NOISE = /\s*[([](?:official\s*)?(?:music\s*)?(?:video|audio|visuali[sz]er|lyric(?:s)?(?: video)?|mv|m\/v|hd|4k)[^)\]]*[)\]]/gi

/**
 * Turns a music-video title into a song title: "Artist - Song (Official Music Video)" → "Song".
 * Only strips the side of the dash that names the artist, so "Song - Live" survives.
 */
export function songTitleFromVideo(title: string, artist: string): string {
  let t = title.replace(VIDEO_NOISE, '').trim()
  const dash = t.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (dash) {
    const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
    const names = [...artistSet(artist)].map(squash).filter(Boolean)
    const isArtist = (part: string) => names.some((n) => squash(part).includes(n) || n.includes(squash(part)))
    if (isArtist(dash[1])) t = dash[2].trim()
    else if (isArtist(dash[2])) t = dash[1].trim()
  }
  return t || title
}
