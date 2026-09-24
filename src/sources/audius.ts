import { fetchJson } from '../lib/http'
import type { Collection, Track } from '../types'

const APP_NAME = 'tunes'
const DEFAULT_HOST = 'https://api.audius.co'

interface AudiusUser { name: string; handle: string }
interface AudiusTrack {
  id: string
  title: string
  duration: number
  genre?: string
  mood?: string
  permalink?: string
  artwork?: Record<string, string> | null
  user: AudiusUser
  is_streamable?: boolean
  is_stream_gated?: boolean
  is_delete?: boolean
  access?: { stream?: boolean }
}
interface AudiusPlaylist {
  id: string
  playlist_name: string
  track_count?: number
  is_album?: boolean
  artwork?: Record<string, string> | null
  user: AudiusUser
}

let hostPromise: Promise<string> | null = null

/** Uses the API's host-selection endpoint, falling back to the default gateway. */
export function getHost(): Promise<string> {
  hostPromise ??= fetchJson<{ data: string[] }>(DEFAULT_HOST, { timeoutMs: 5000 })
    .then((r) => {
      const hosts = (r.data ?? []).filter((h) => h.startsWith('https://'))
      return hosts.length ? hosts[Math.floor(Math.random() * hosts.length)] : DEFAULT_HOST
    })
    .catch(() => DEFAULT_HOST)
  return hostPromise
}

async function api<T>(path: string, params: Record<string, string | number> = {}, signal?: AbortSignal): Promise<T> {
  const host = await getHost()
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), app_name: APP_NAME })
  const res = await fetchJson<{ data: T }>(`${host}/v1${path}?${qs}`, { signal })
  return res.data
}

function artworkOf(a?: Record<string, string> | null): string | undefined {
  const url = a?.['480x480'] ?? a?.['150x150'] ?? a?.['1000x1000']
  return url?.startsWith('https://') ? url : undefined
}

function playable(t: AudiusTrack): boolean {
  return t.is_streamable !== false && !t.is_stream_gated && !t.is_delete && t.access?.stream !== false
}

export function toTrack(t: AudiusTrack): Track {
  return {
    id: `audius:${t.id}`,
    source: 'audius',
    title: t.title,
    artist: t.user?.name ?? 'Unknown artist',
    artwork: artworkOf(t.artwork),
    duration: t.duration ?? 0,
    // The redirecting endpoint is stable; the signed URL it redirects to is not.
    streamUrl: `${DEFAULT_HOST}/v1/tracks/${t.id}/stream?app_name=${APP_NAME}`,
    isLive: false,
    meta: t.genre || undefined,
    pageUrl: t.permalink ? `https://audius.co${t.permalink}` : undefined,
  }
}

const tracks = (list: AudiusTrack[]) => (list ?? []).filter(playable).map(toTrack)

export async function searchTracks(query: string, signal?: AbortSignal): Promise<Track[]> {
  return tracks(await api<AudiusTrack[]>('/tracks/search', { query, limit: 40 }, signal))
}

export async function trending(genre?: string, signal?: AbortSignal): Promise<Track[]> {
  const params: Record<string, string | number> = { time: 'week', limit: 40 }
  if (genre) params.genre = genre
  return tracks(await api<AudiusTrack[]>('/tracks/trending', params, signal))
}

function toCollections(list: AudiusPlaylist[]): Collection[] {
  return (list ?? [])
    .filter((p) => (p.track_count ?? 1) > 0)
    .map((p) => ({
      id: p.id,
      source: 'audius' as const,
      kind: p.is_album ? ('album' as const) : ('playlist' as const),
      title: p.playlist_name,
      artist: p.user?.name ?? '',
      artwork: artworkOf(p.artwork),
      trackCount: p.track_count,
    }))
}

export async function searchPlaylists(query: string, signal?: AbortSignal): Promise<Collection[]> {
  return toCollections(await api<AudiusPlaylist[]>('/playlists/search', { query, limit: 12 }, signal))
}

export async function trendingPlaylists(signal?: AbortSignal): Promise<Collection[]> {
  return toCollections(await api<AudiusPlaylist[]>('/playlists/trending', { time: 'week', limit: 12 }, signal))
}

export async function playlistTracks(id: string, signal?: AbortSignal): Promise<Track[]> {
  return tracks(await api<AudiusTrack[]>(`/playlists/${encodeURIComponent(id)}/tracks`, {}, signal))
}

/** Rewrites a stored stream URL to the currently selected host. */
export async function resolveStream(track: Track): Promise<string> {
  const host = await getHost()
  return host === DEFAULT_HOST ? track.streamUrl : track.streamUrl.replace(DEFAULT_HOST, host)
}

export const GENRES = [
  'Electronic', 'Hip-Hop/Rap', 'Lo-Fi', 'Pop', 'Rock', 'Jazz',
  'Ambient', 'R&B/Soul', 'House', 'Techno', 'Classical', 'Alternative',
]

export async function getPlaylist(id: string, signal?: AbortSignal): Promise<{ playlist: Collection | null; tracks: Track[] }> {
  const [meta, list] = await Promise.all([
    api<AudiusPlaylist[]>(`/playlists/${encodeURIComponent(id)}`, {}, signal).catch(() => []),
    playlistTracks(id, signal),
  ])
  return { playlist: toCollections(meta)[0] ?? null, tracks: list }
}
