import { fetchJson, httpsImage, isAbortError, isHttps } from '../lib/http'
import type { Track } from '../types'

// fi1/nl1/at1 were dead when probed; `all` is DNS round-robin over whatever is alive.
const SERVERS = ['https://de1.api.radio-browser.info', 'https://de2.api.radio-browser.info', 'https://all.api.radio-browser.info']
let preferred = 0

interface Station {
  stationuuid: string
  name: string
  url_resolved: string
  url: string
  favicon?: string
  tags?: string
  country?: string
  countrycode?: string
  codec?: string
  bitrate?: number
  votes?: number
  clickcount?: number
  homepage?: string
  lastcheckok?: number
}

async function api(path: string, params: Record<string, string | number | boolean>, signal?: AbortSignal): Promise<Station[]> {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])))
  let lastErr: unknown
  for (let i = 0; i < SERVERS.length; i++) {
    const idx = (preferred + i) % SERVERS.length
    try {
      const res = await fetchJson<Station[]>(`${SERVERS[idx]}/json${path}?${qs}`, { signal, timeoutMs: 8000 })
      preferred = idx
      return res
    } catch (e) {
      if (isAbortError(e) && signal?.aborted) throw e
      lastErr = e
    }
  }
  throw lastErr
}

export function toTrack(s: Station): Track | null {
  const url = s.url_resolved || s.url
  if (!isHttps(url)) return null // http streams are blocked as mixed content on an https page
  const tags = (s.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3).join(' · ')
  return {
    id: `radio:${s.stationuuid}`,
    source: 'radio',
    title: s.name.trim() || 'Untitled station',
    artist: [s.countrycode || s.country, tags].filter(Boolean).join(' · ') || 'Internet radio',
    artwork: httpsImage(s.favicon),
    duration: 0,
    streamUrl: url.trim(),
    isLive: true,
    meta: [s.codec, s.bitrate ? `${s.bitrate}kbps` : ''].filter(Boolean).join(' ') || undefined,
    pageUrl: isHttps(s.homepage) ? s.homepage : undefined,
  }
}

const COMMON = { hidebroken: true, order: 'votes', reverse: true, limit: 120 }

function clean(list: Station[], max = 60): Track[] {
  const seen = new Set<string>()
  const out: Track[] = []
  for (const s of list) {
    const t = toTrack(s)
    if (!t) continue
    const key = t.streamUrl.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
    if (out.length >= max) break
  }
  return out
}

export type RadioSort = 'votes' | 'clickcount'

export async function search(opts: { name?: string; tag?: string; countrycode?: string; order?: RadioSort; max?: number }, signal?: AbortSignal): Promise<Track[]> {
  const params: Record<string, string | number | boolean> = { ...COMMON, order: opts.order ?? 'votes' }
  if (opts.name) params.name = opts.name
  if (opts.tag) params.tag = opts.tag
  if (opts.countrycode) params.countrycode = opts.countrycode
  return clean(await api('/stations/search', params, signal), opts.max)
}

export const searchByName = (name: string, signal?: AbortSignal) => search({ name }, signal)

export const GENRE_CHIPS = ['lofi', 'jazz', 'pop', 'rock', 'classical', 'hits', 'chill', 'electronic']

export const COUNTRIES: [string, string][] = [
  ['', 'All countries'], ['US', 'United States'], ['GB', 'United Kingdom'], ['DE', 'Germany'], ['FR', 'France'],
  ['NL', 'Netherlands'], ['ES', 'Spain'], ['IT', 'Italy'], ['CA', 'Canada'], ['AU', 'Australia'], ['BR', 'Brazil'],
  ['JP', 'Japan'], ['IN', 'India'], ['MT', 'Malta'], ['SE', 'Sweden'], ['CH', 'Switzerland'], ['AT', 'Austria'],
  ['BE', 'Belgium'], ['PL', 'Poland'], ['MX', 'Mexico'], ['GR', 'Greece'],
]
