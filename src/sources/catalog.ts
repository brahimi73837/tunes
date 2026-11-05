import { fetchJson } from '../lib/http'
import type { Track } from '../types'

/**
 * The full catalog (YouTube Music + JioSaavn) comes from our tiny Worker in worker/:
 * neither service sends CORS headers, so the browser can't search them directly.
 */
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? 'https://tunes-api.tunes-api.workers.dev'

export type ApiTrack = Track & { explicit?: boolean }

const YT_ID = /^[\w-]{11}$/
export const ARTIST_ID = /^UC[\w-]{22}$/
export const ALBUM_ID = /^MPREb_[\w-]+$/

export function clean(t: ApiTrack): Track | null {
  if (t?.source !== 'youtube' && t?.source !== 'saavn') return null
  if (!t.streamUrl?.startsWith('https://')) return null
  if (t.youtubeId && !YT_ID.test(t.youtubeId)) return null
  if (t.source === 'youtube' && !t.youtubeId) return null
  const { explicit, artistId, albumId, ...track } = t
  return {
    ...track,
    isLive: false,
    meta: [explicit ? 'Explicit' : '', t.meta ?? ''].filter(Boolean).join(' · ') || undefined,
    ...(artistId && ARTIST_ID.test(artistId) ? { artistId } : {}),
    ...(albumId && ALBUM_ID.test(albumId) ? { albumId } : {}),
  }
}

export const cleanAll = (list: ApiTrack[] | undefined) => (list ?? []).map(clean).filter((t): t is Track => t !== null)

export const qs = (params: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(params).filter((e): e is [string, string | number] => e[1] !== undefined && e[1] !== '').map(([k, v]) => [k, String(v)])).toString()

export async function searchSongs(query: string, signal?: AbortSignal): Promise<Track[]> {
  const r = await fetchJson<{ items: ApiTrack[] }>(`${API_BASE}/v1/search?${qs({ q: query })}`, { signal, timeoutMs: 15000 })
  return cleanAll(r.items)
}

export async function searchVideos(query: string, signal?: AbortSignal): Promise<Track[]> {
  const r = await fetchJson<{ items: ApiTrack[] }>(`${API_BASE}/v1/search?${qs({ q: query, type: 'videos' })}`, { signal, timeoutMs: 15000 })
  return cleanAll(r.items)
}

/** Country from the browser locale ("en-GB" → "GB"); the API falls back to global charts. */
const country = () => navigator.languages?.map((l) => l.split('-')[1]).find((c) => c && /^[A-Za-z]{2}$/.test(c))?.toUpperCase()

/** Today's top songs (YouTube Music charts) for the viewer's country. */
export async function charts(signal?: AbortSignal): Promise<Track[]> {
  const r = await fetchJson<{ items: ApiTrack[] }>(`${API_BASE}/v1/charts?${qs({ country: country() })}`, { signal, timeoutMs: 20000 })
  return cleanAll(r.items)
}

export async function suggest(query: string, signal?: AbortSignal): Promise<string[]> {
  const r = await fetchJson<{ suggestions: string[] }>(`${API_BASE}/v1/suggest?${qs({ q: query })}`, { signal, timeoutMs: 5000 })
  return (r.suggestions ?? []).filter((s) => typeof s === 'string').slice(0, 8)
}

/**
 * Finds another playable copy of a track whose stream just failed: a JioSaavn file for a
 * YouTube track, or a different YouTube upload (often the music video) when embedding is off.
 */
export async function findAlternative(t: Track, not: 'saavn' | 'youtube' | undefined, signal?: AbortSignal): Promise<Track | null> {
  const r = await fetchJson<{ item: ApiTrack | null }>(
    `${API_BASE}/v1/resolve?${qs({ title: t.title, artist: t.artist, duration: Math.round(t.duration) || undefined, not, exclude: t.youtubeId })}`,
    { signal, timeoutMs: 12000 },
  )
  return r.item ? clean(r.item) : null
}

/** A tile linking to an album, single, playlist or artist page (from YouTube Music). */
export interface MusicCard {
  id: string
  kind: 'album' | 'single' | 'playlist' | 'artist'
  title: string
  subtitle?: string
  artwork?: string
}

const httpsOrNone = (u?: string) => (u?.startsWith('https://') ? u : undefined)
const cleanCards = (list: MusicCard[] | undefined) =>
  (list ?? [])
    .filter((c) => c && typeof c.id === 'string' && typeof c.title === 'string' && (c.kind === 'artist' ? ARTIST_ID.test(c.id) : c.kind === 'playlist' ? /^(VL)?[\w-]{10,}$/.test(c.id) : ALBUM_ID.test(c.id)))
    .map((c) => ({ ...c, artwork: httpsOrNone(c.artwork) }))

export async function searchCards(query: string, type: 'artists' | 'albums', signal?: AbortSignal): Promise<MusicCard[]> {
  const r = await fetchJson<{ cards: MusicCard[] }>(`${API_BASE}/v1/search?${qs({ q: query, type })}`, { signal, timeoutMs: 15000 })
  return cleanCards(r.cards)
}

export interface ArtistPage {
  id: string
  name: string
  description?: string
  artwork?: string
  banner?: string
  topSongs: Track[]
  albums: MusicCard[]
  singles: MusicCard[]
  related: MusicCard[]
}

export async function artist(id: string, signal?: AbortSignal): Promise<ArtistPage> {
  const r = await fetchJson<ArtistPage & { topSongs: ApiTrack[] }>(`${API_BASE}/v1/artist?${qs({ id })}`, { signal, timeoutMs: 20000 })
  return { ...r, artwork: httpsOrNone(r.artwork), banner: httpsOrNone(r.banner), topSongs: cleanAll(r.topSongs), albums: cleanCards(r.albums), singles: cleanCards(r.singles), related: cleanCards(r.related) }
}

export interface AlbumPage {
  id: string
  title: string
  artist: string
  artistId?: string
  kind: string
  year?: string
  artwork?: string
  tracks: Track[]
}

export async function album(id: string, signal?: AbortSignal): Promise<AlbumPage> {
  const r = await fetchJson<AlbumPage & { tracks: ApiTrack[] }>(`${API_BASE}/v1/album?${qs({ id })}`, { signal, timeoutMs: 20000 })
  return { ...r, artwork: httpsOrNone(r.artwork), artistId: r.artistId && ARTIST_ID.test(r.artistId) ? r.artistId : undefined, tracks: cleanAll(r.tracks) }
}

export interface YouTubePlaylist {
  id: string
  title: string
  author?: string
  artwork?: string
  tracks: Track[]
}

/** Accepts a playlist id or a pasted YouTube / YouTube Music link. */
export function playlistIdFrom(input: string): string | null {
  const s = input.trim()
  let id = s
  try {
    if (/^https?:\/\//i.test(s)) id = new URL(s).searchParams.get('list') ?? ''
  } catch {
    return null
  }
  return /^(VL)?(PL|OLAK5uy_|RD|UU|FL)[\w-]{8,}$/.test(id) ? id.replace(/^VL/, '') : null
}

export async function youtubePlaylist(id: string, signal?: AbortSignal): Promise<YouTubePlaylist> {
  const r = await fetchJson<YouTubePlaylist & { tracks: ApiTrack[] }>(`${API_BASE}/v1/playlist?${qs({ id })}`, { signal, timeoutMs: 30000 })
  return { ...r, artwork: httpsOrNone(r.artwork), tracks: cleanAll(r.tracks) }
}

/** YouTube Music's radio for a song: what it would play next. */
export async function radio(videoId: string, signal?: AbortSignal): Promise<Track[]> {
  const r = await fetchJson<{ items: ApiTrack[] }>(`${API_BASE}/v1/radio?${qs({ id: videoId })}`, { signal, timeoutMs: 15000 })
  return cleanAll(r.items)
}

/** Plain lyrics from YouTube Music, when no synced lyrics exist. */
export async function youtubeLyrics(videoId: string, signal?: AbortSignal): Promise<{ text: string; source?: string } | null> {
  const r = await fetchJson<{ lyrics: { text: string; source?: string } | null }>(`${API_BASE}/v1/lyrics?${qs({ id: videoId })}`, { signal, timeoutMs: 15000 })
  return r.lyrics?.text ? r.lyrics : null
}
