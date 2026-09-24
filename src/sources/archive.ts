import { fetchJson } from '../lib/http'
import type { Collection, Track } from '../types'

const BASE = 'https://archive.org'
// Spoken-word collections that swamp keyword searches for music terms.
const EXCLUDE = 'oldtimeradio OR podcasts OR radioprograms OR audio_bookspoetry OR librivoxaudio OR audio_religion OR audio_podcast'

type Str = string | string[] | undefined
const first = (v: Str) => (Array.isArray(v) ? v[0] : v) ?? ''

interface SearchDoc { identifier: string; title?: Str; creator?: Str; downloads?: number; year?: Str }
interface MetaFile { name: string; format?: string; length?: string; title?: string; track?: string; creator?: string; artist?: string; album?: string; source?: string }
interface Metadata { metadata?: { title?: Str; creator?: Str; identifier?: string }; files?: MetaFile[]; is_dark?: boolean }

export const artworkFor = (identifier: string) => `${BASE}/services/img/${encodeURIComponent(identifier)}`

/** Lucene-escape user input so quotes/colons can't break the query. */
function escape(q: string): string {
  return q.replace(/[+\-!(){}[\]^"~*?:\\/&|]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function buildQuery(q: string): string {
  const t = escape(q)
  return `(title:(${t}) OR creator:(${t}) OR subject:(${t})) AND mediatype:(audio) AND -collection:(${EXCLUDE})`
}

export async function searchAlbums(query: string, signal?: AbortSignal): Promise<Collection[]> {
  if (!escape(query)) return []
  return advanced(buildQuery(query), 30, signal)
}

/** Popular netlabel releases: free, Creative Commons-licensed albums. */
export function featured(signal?: AbortSignal): Promise<Collection[]> {
  return advanced('collection:(netlabels) AND mediatype:(audio)', 12, signal)
}

async function advanced(q: string, rows: number, signal?: AbortSignal): Promise<Collection[]> {
  const params = new URLSearchParams({ q, rows: String(rows), output: 'json' })
  for (const f of ['identifier', 'title', 'creator', 'downloads', 'year']) params.append('fl[]', f)
  params.append('sort[]', 'downloads desc')
  const res = await fetchJson<{ response: { docs: SearchDoc[] } }>(`${BASE}/advancedsearch.php?${params}`, { signal })
  return res.response.docs.map((d) => ({
    id: d.identifier,
    source: 'archive' as const,
    kind: 'album' as const,
    title: first(d.title) || d.identifier,
    artist: first(d.creator) || 'Internet Archive',
    artwork: artworkFor(d.identifier),
    meta: first(d.year) || undefined,
  }))
}

/** "1783.69" or "29:43" or "1:02:03" → seconds */
export function parseLength(len?: string): number {
  if (!len) return 0
  if (len.includes(':')) return len.split(':').reduce((acc, p) => acc * 60 + (parseFloat(p) || 0), 0)
  return parseFloat(len) || 0
}

const MP3_PREFERENCE = ['VBR MP3', '320Kbps MP3', '256Kbps MP3', '192Kbps MP3', '128Kbps MP3', '64Kbps MP3']

/** Picks one MP3 flavour (an item often has originals + several derivatives of each file). */
export function pickAudioFiles(files: MetaFile[]): MetaFile[] {
  const mp3 = files.filter((f) => /mp3/i.test(f.format ?? '') || /\.mp3$/i.test(f.name))
  let chosen: MetaFile[] = []
  if (mp3.length) {
    const byFormat = new Map<string, MetaFile[]>()
    for (const f of mp3) byFormat.set(f.format ?? 'MP3', [...(byFormat.get(f.format ?? 'MP3') ?? []), f])
    const formats = [...byFormat.keys()].sort((a, b) => {
      const ia = MP3_PREFERENCE.indexOf(a), ib = MP3_PREFERENCE.indexOf(b)
      // More files first (a full album beats a single sample), then preferred quality.
      const diff = byFormat.get(b)!.length - byFormat.get(a)!.length
      return diff !== 0 ? diff : (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
    chosen = byFormat.get(formats[0])!
  } else {
    chosen = files.filter((f) => /ogg vorbis/i.test(f.format ?? ''))
  }
  const num = (f: MetaFile) => parseInt((f.track ?? '').split('/')[0], 10)
  return [...chosen].sort((a, b) => {
    const na = num(a), nb = num(b)
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb
    return a.name.localeCompare(b.name, undefined, { numeric: true })
  })
}

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/')

function prettyName(file: string): string {
  const base = file.split('/').pop() ?? file
  return base.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim()
}

export async function albumTracks(identifier: string, signal?: AbortSignal): Promise<{ album: Collection; tracks: Track[] }> {
  const m = await fetchJson<Metadata>(`${BASE}/metadata/${encodeURIComponent(identifier)}`, { signal })
  if (!m.files || m.is_dark) throw new Error('This Archive item is unavailable')
  const albumTitle = first(m.metadata?.title) || identifier
  const albumArtist = first(m.metadata?.creator) || 'Internet Archive'
  const artwork = artworkFor(identifier)
  const tracks: Track[] = pickAudioFiles(m.files).map((f) => ({
    id: `archive:${identifier}/${f.name}`,
    source: 'archive',
    title: f.title?.trim() || prettyName(f.name),
    artist: f.creator || f.artist || albumArtist,
    artwork,
    duration: parseLength(f.length),
    streamUrl: `${BASE}/download/${encodeURIComponent(identifier)}/${encodePath(f.name)}`,
    isLive: false,
    meta: albumTitle,
    pageUrl: `${BASE}/details/${encodeURIComponent(identifier)}`,
  }))
  return {
    album: { id: identifier, source: 'archive', kind: 'album', title: albumTitle, artist: albumArtist, artwork, trackCount: tracks.length },
    tracks,
  }
}
