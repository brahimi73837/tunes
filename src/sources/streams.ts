import { parseInvidious, type AudioFormat, type StreamInfo } from '../../worker/src/invidious'
import { fetchJson } from '../lib/http'
import { settings, type Quality } from '../store/settings'
import type { Track } from '../types'
import { API_BASE, findAlternative } from './catalog'

/**
 * Ad-free YouTube audio. Like ytify, we ask Invidious servers for the audio formats and play
 * their proxied URL in our own <audio> element: no YouTube player, so no ads. Some servers
 * block Cloudflare, others are slow from it, so the browser races direct calls against our
 * Worker (which also health-checks and caches) and takes whichever answers first.
 */

/** Servers that answer browsers directly (CORS) — refreshed from the Worker's pool. */
const BUILTIN = ['yt.chocolatemoo53.com', 'yt.omada.cafe']
const POOL_KEY = 'tunes.instances.v2'
const POOL_TTL = 6 * 3600_000
const DIRECT_TIMEOUT_MS = 7000
const WORKER_TIMEOUT_MS = 12000
/** How long a song waits for its JioSaavn copy; and how much longer once the YouTube audio is ready. */
const SAAVN_BUDGET_MS = 1500
const SAAVN_GRACE_MS = 400

const cache = new Map<string, StreamInfo>()
let poolPromise: Promise<string[]> | null = null

function storedPool(): string[] | null {
  try {
    const raw = JSON.parse(localStorage.getItem(POOL_KEY) ?? 'null') as { at: number; hosts: string[] } | null
    return raw && Date.now() - raw.at < POOL_TTL && Array.isArray(raw.hosts) ? raw.hosts : null
  } catch {
    return null
  }
}

export function directPool(): Promise<string[]> {
  poolPromise ??= (async () => {
    const stored = storedPool()
    if (stored) return [...new Set([...BUILTIN, ...stored])]
    try {
      const r = await fetchJson<{ instances: string[] }>(`${API_BASE}/v1/instances?v=2`, { timeoutMs: 5000 })
      const hosts = (r.instances ?? []).filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(h)).slice(0, 12)
      try {
        localStorage.setItem(POOL_KEY, JSON.stringify({ at: Date.now(), hosts }))
      } catch {
        /* storage blocked */
      }
      return [...new Set([...BUILTIN, ...hosts])]
    } catch {
      return BUILTIN
    }
  })()
  return poolPromise
}

const fresh = (s: StreamInfo | undefined) => !!s && s.expires * 1000 - Date.now() > 10 * 60_000

async function direct(host: string, id: string, signal: AbortSignal): Promise<StreamInfo> {
  const data = await fetchJson<unknown>(`https://${host}/api/v1/videos/${id}?local=true`, { signal, timeoutMs: DIRECT_TIMEOUT_MS })
  const info = parseInvidious(host, id, data)
  if (!info) throw new Error(`${host}: no playable audio`)
  return info
}

async function viaWorker(id: string, exclude: string[], signal: AbortSignal): Promise<StreamInfo> {
  const q = new URLSearchParams({ id })
  if (exclude.length) q.set('exclude', exclude.join(','))
  const info = await fetchJson<StreamInfo>(`${API_BASE}/v1/streams?${q}`, { signal, timeoutMs: WORKER_TIMEOUT_MS })
  if (!info?.formats?.length || !info.instance) throw new Error('No stream')
  // Re-validate: only https URLs on the server that answered.
  const formats = info.formats.filter((f) => typeof f.url === 'string' && f.url.startsWith(`https://${info.instance}/`))
  if (!formats.length) throw new Error('No stream')
  return { ...info, formats }
}

/** Resolves audio formats for a video, racing direct server calls against the Worker. */
export async function streamInfo(id: string, opts: { exclude?: string[]; signal?: AbortSignal } = {}): Promise<StreamInfo> {
  const exclude = opts.exclude ?? []
  const hit = cache.get(id)
  if (fresh(hit) && !exclude.includes(hit!.instance)) return hit!
  const ctrl = new AbortController()
  opts.signal?.addEventListener('abort', () => ctrl.abort(opts.signal?.reason))
  const hosts = (await directPool()).filter((h) => !exclude.includes(h))
  try {
    const info = await Promise.any([...hosts.map((h) => direct(h, id, ctrl.signal)), viaWorker(id, exclude, ctrl.signal)])
    cache.set(id, info)
    return info
  } catch {
    throw new Error('no ad-free stream available right now')
  } finally {
    ctrl.abort()
  }
}

let opus: boolean | null = null
const canOpus = () => (opus ??= typeof Audio !== 'undefined' && new Audio().canPlayType('audio/webm; codecs="opus"') !== '')

/** Picks the format for the user's quality setting; Opus where supported, AAC elsewhere (Safari). */
export function pickFormat(formats: AudioFormat[], quality: Quality = settings().quality, opusOk = canOpus()): AudioFormat {
  const prefs: Record<Quality, { opus: number[]; aac: number[] }> = {
    high: { opus: [251, 250, 249], aac: [140, 139] },
    normal: { opus: [250, 251, 249], aac: [140, 139] },
    saver: { opus: [249, 250, 251], aac: [139, 140] },
  }
  const order = opusOk ? [...prefs[quality].opus, ...prefs[quality].aac] : prefs[quality].aac
  for (const itag of order) {
    const f = formats.find((x) => x.itag === itag)
    if (f) return f
  }
  const playable = formats.filter((f) => opusOk || !f.mime.includes('webm'))
  return (playable.length ? playable : formats).sort((a, b) => b.bitrate - a.bitrate)[0]
}

/** JioSaavn files come in 320/160/96 kbps; the API hands out the best one. */
export function saavnQuality(url: string, quality: Quality = settings().quality): string {
  const want = quality === 'high' ? null : quality === 'normal' ? '160' : '96'
  return want ? url.replace(/_(320|160)\.mp4$/, `_${want}.mp4`) : url
}

export interface Resolved {
  url: string
  /** The Invidious server, so a failure can exclude it next time. */
  instance?: string
  /** Set when a JioSaavn copy was found for a YouTube track. */
  saavn?: Track
}

/** Songs (they have an album or an artist page) are worth a quick JioSaavn lookup; videos aren't. */
const isSong = (t: Track) => !!(t.albumId || t.artistId)

export async function resolveYouTube(t: Track, opts: { exclude?: string[]; signal?: AbortSignal; trySaavn?: boolean } = {}): Promise<Resolved> {
  const id = t.youtubeId!
  const yt = streamInfo(id, opts)
  if ((opts.trySaavn ?? true) && isSong(t) && !opts.exclude?.length) {
    const sleep = (ms: number) => new Promise<null>((r) => setTimeout(() => r(null), ms))
    const lookup = findAlternative(t, 'youtube', opts.signal).catch(() => null)
    const saavn = await Promise.race([
      lookup,
      sleep(SAAVN_BUDGET_MS),
      // Don't hold up audio that's ready: give JioSaavn only a short grace period after that.
      yt.then(() => sleep(SAAVN_GRACE_MS), () => lookup),
    ])
    if (saavn?.source === 'saavn') {
      yt.catch(() => {}) // keep it cached for a fallback, don't surface its error
      return { url: saavnQuality(saavn.streamUrl), saavn }
    }
  }
  const info = await yt
  return { url: pickFormat(info.formats).url, instance: info.instance }
}

/** Warms the cache for a track that's about to play. */
export function prefetch(t: Track | undefined) {
  if (t?.source === 'youtube' && t.youtubeId && !fresh(cache.get(t.youtubeId))) void streamInfo(t.youtubeId).catch(() => {})
}

export function forget(id: string) {
  cache.delete(id)
}
