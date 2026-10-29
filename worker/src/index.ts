import { bestMatch, mergeSongs, videoMatch } from './match'
import * as saavn from './saavn'
import { songTitleFromVideo } from './text'
import type { CatalogTrack, Env } from './types'
import * as youtube from './youtube'

/**
 * Tunes catalog API. The app is a static site, and neither YouTube nor JioSaavn send CORS
 * headers, so this Worker does the searching and returns plain JSON. Audio never flows
 * through here: JioSaavn files come straight from its CDN, YouTube plays in the IFrame player.
 *
 *   GET /v1/search?q=…&type=songs|videos
 *   GET /v1/suggest?q=…
 *   GET /v1/charts?country=GB                         (today's top songs; global when the country has no chart)
 *   GET /v1/resolve?title=…&artist=…&duration=…&not=saavn|youtube   (find another copy)
 */

const CACHE_SECONDS = { search: 900, suggest: 3600, resolve: 3600, charts: 6 * 3600 }
/** Chart entries we look up on JioSaavn individually; Workers allow 50 subrequests per call. */
const CHART_MATCHES = 30
/** Top search results without a JioSaavn copy that get their own lookup, and how long we wait for them. */
const SEARCH_LOOKUPS = 8
const LOOKUP_BUDGET_MS = 900

const withDeadline = <T,>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))])

/** Looks each still-YouTube-only song up on JioSaavn by "title artist" (a broad query like "queen" misses most). */
async function upgradeTop(list: CatalogTrack[], env: Env, count: number, budgetMs: number): Promise<CatalogTrack[]> {
  const targets = list.map((t, i) => ({ t, i })).filter(({ t }) => t.source === 'youtube').slice(0, count)
  const out = [...list]
  await Promise.all(
    targets.map(async ({ t, i }) => {
      const found = await withDeadline(saavn.searchSongs(`${t.title.replace(/[([].*?[)\]]/g, ' ')} ${t.artist}`, { geoIp: env.SAAVN_GEO_IP, limit: 5 }), budgetMs, [])
      out[i] = mergeSongs([t], found)[0]
    }),
  )
  // Two rows can now point at the same JioSaavn file.
  const seen = new Set<string>()
  return out.filter((t) => !seen.has(t.id) && !!seen.add(t.id))
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allowed = (env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim())
  const ok = allowed.includes('*') || allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  return {
    'Access-Control-Allow-Origin': ok ? origin || '*' : allowed[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

const param = (url: URL, name: string, max = 200) => {
  const v = (url.searchParams.get(name) ?? '').trim()
  if (!v) throw new HttpError(400, `Missing "${name}"`)
  return v.slice(0, max)
}

async function settle<T>(p: Promise<T>, fallback: T, label: string, errors: string[]): Promise<T> {
  try {
    return await p
  } catch (e) {
    errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`)
    return fallback
  }
}

async function search(url: URL, env: Env) {
  const q = param(url, 'q')
  const type = url.searchParams.get('type') === 'videos' ? 'videos' : 'songs'
  const errors: string[] = []
  if (type === 'videos') {
    return { items: await youtube.searchVideos(q) }
  }
  const [yt, sv] = await Promise.all([
    settle(youtube.searchSongs(q), [], 'youtube', errors),
    settle(saavn.searchSongs(q, { geoIp: env.SAAVN_GEO_IP }), [], 'saavn', errors),
  ])
  if (!yt.length && !sv.length && errors.length) throw new HttpError(502, errors.join('; '))
  // If YouTube Music is unreachable, JioSaavn's own ranking is still a decent answer.
  const items = yt.length ? await upgradeTop(mergeSongs(yt, sv), env, SEARCH_LOOKUPS, LOOKUP_BUDGET_MS) : sv
  return { items, ...(errors.length ? { partial: errors } : {}) }
}

async function resolve(url: URL, env: Env): Promise<{ item: CatalogTrack | null }> {
  const target = { title: param(url, 'title'), artist: param(url, 'artist'), duration: Number(url.searchParams.get('duration')) || 0 }
  const not = url.searchParams.get('not')
  const q = `${target.title} ${target.artist}`
  if (not !== 'saavn') {
    const hit = bestMatch(target, await saavn.searchSongs(q, { geoIp: env.SAAVN_GEO_IP, limit: 10 }).catch(() => []))
    if (hit) return { item: hit }
  }
  if (not !== 'youtube') {
    const yt = await youtube.searchSongs(q).catch(() => [])
    const exclude = url.searchParams.get('exclude')
    const candidates = yt.filter((t) => t.youtubeId !== exclude)
    const hit = bestMatch(target, candidates)
    if (hit) return { item: hit }
    // Different upload of the same song: the music-video version usually embeds when the audio track doesn't.
    const vids = await youtube.searchVideos(q).catch(() => [])
    const v = videoMatch(target, vids.filter((t) => t.youtubeId !== exclude))
    if (v) return { item: v }
  }
  return { item: null }
}

async function charts(url: URL, env: Env) {
  const country = (url.searchParams.get('country') ?? '').toUpperCase()
  // Chart titles are video titles ("Song (Official Music Video)"); look each up on JioSaavn.
  const list = await youtube.chart(/^[A-Z]{2}$/.test(country) ? country : 'ZZ', 50)
  const songs = list.map((t) => ({ ...t, title: songTitleFromVideo(t.title, t.artist) }))
  return { items: await upgradeTop(songs, env, CHART_MATCHES, 5000) }
}

async function route(req: Request, env: Env): Promise<{ body: unknown; ttl: number }> {
  const url = new URL(req.url)
  switch (url.pathname) {
    case '/v1/search':
      return { body: await search(url, env), ttl: CACHE_SECONDS.search }
    case '/v1/suggest':
      return { body: { suggestions: await youtube.suggestions(param(url, 'q', 100)) }, ttl: CACHE_SECONDS.suggest }
    case '/v1/charts':
      return { body: await charts(url, env), ttl: CACHE_SECONDS.charts }
    case '/v1/resolve':
      return { body: await resolve(url, env), ttl: CACHE_SECONDS.resolve }
    case '/':
    case '/v1/health':
      return { body: { ok: true, service: 'tunes-api' }, ttl: 0 }
    default:
      throw new HttpError(404, 'Not found')
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const cors = corsHeaders(req, env)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (req.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors })

    // Cache by URL alone; CORS headers are added per request below.
    const cacheKey = new Request(new URL(req.url).toString(), { method: 'GET' })
    const cache = (caches as unknown as { default: Cache }).default
    const hit = await cache.match(cacheKey)
    if (hit) {
      const res = new Response(hit.body, hit)
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v)
      res.headers.set('X-Cache', 'HIT')
      return res
    }

    try {
      const { body, ttl } = await route(req, env)
      const partial = !!(body as { partial?: unknown }).partial
      const res = Response.json(body, { headers: { 'Cache-Control': ttl && !partial ? `public, max-age=${ttl}` : 'no-store' } })
      if (ttl && !partial) ctx.waitUntil(cache.put(cacheKey, res.clone()))
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v)
      return res
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 502
      return Response.json({ error: e instanceof Error ? e.message : 'Upstream error' }, { status, headers: { ...cors, 'Cache-Control': 'no-store' } })
    }
  },
}
