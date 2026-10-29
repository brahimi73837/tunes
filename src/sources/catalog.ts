import { fetchJson } from '../lib/http'
import type { Track } from '../types'

/**
 * The full catalog (YouTube Music + JioSaavn) comes from our tiny Worker in worker/:
 * neither service sends CORS headers, so the browser can't search them directly.
 */
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? 'https://tunes-api.tunes-api.workers.dev'

type ApiTrack = Track & { explicit?: boolean }

const YT_ID = /^[\w-]{11}$/

function clean(t: ApiTrack): Track | null {
  if (t.source !== 'youtube' && t.source !== 'saavn') return null
  if (!t.streamUrl?.startsWith('https://')) return null
  if (t.youtubeId && !YT_ID.test(t.youtubeId)) return null
  if (t.source === 'youtube' && !t.youtubeId) return null
  const { explicit, ...track } = t
  return { ...track, isLive: false, meta: [explicit ? 'Explicit' : '', t.meta ?? ''].filter(Boolean).join(' · ') || undefined }
}

const cleanAll = (list: ApiTrack[] | undefined) => (list ?? []).map(clean).filter((t): t is Track => t !== null)

const qs = (params: Record<string, string | number | undefined>) =>
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
