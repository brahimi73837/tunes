import { parseDuration } from './text'
import type { CatalogTrack } from './types'

const YTM = 'https://music.youtube.com/youtubei/v1'
const YT = 'https://www.youtube.com/youtubei/v1'
const YTM_CLIENT = { clientName: 'WEB_REMIX', clientVersion: '1.20251015.03.00', hl: 'en', gl: 'US' }
const YT_CLIENT = { clientName: 'WEB', clientVersion: '2.20251015.01.00', hl: 'en', gl: 'US' }
/** Search filters, as YouTube Music's own UI sends them. */
const FILTER_SONGS = 'EgWKAQIIAWoKEAkQBRAKEAMQBA=='
const FILTER_VIDEOS = 'EgIQAQ=='

type Json = Record<string, any>

async function innertube(base: string, endpoint: string, client: Json, body: Json): Promise<Json> {
  const origin = base === YTM ? 'https://music.youtube.com' : 'https://www.youtube.com'
  const res = await fetch(`${base}/${endpoint}?prettyPrint=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, Referer: `${origin}/`, 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' },
    body: JSON.stringify({ context: { client }, ...body }),
  })
  if (!res.ok) throw new Error(`YouTube HTTP ${res.status}`)
  return res.json()
}

/** Collects every value stored under `key`, depth-first. The response trees are deep and shift often. */
export function collect(node: unknown, key: string, out: Json[] = []): Json[] {
  if (Array.isArray(node)) for (const v of node) collect(v, key, out)
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === key) out.push(v as Json)
      else collect(v, key, out)
    }
  }
  return out
}

const runsText = (runs?: Json[]) => (runs ?? []).map((r) => r.text).join('')

export function songArtwork(thumbs?: Json[]): string | undefined {
  const url: string | undefined = thumbs?.[thumbs.length - 1]?.url
  if (!url?.startsWith('https://')) return undefined
  // googleusercontent thumbnails take their size in the URL; ask for a big square.
  return url.replace(/=w\d+-h\d+/, '=w544-h544')
}

const videoThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

/** One row of a YouTube Music "Songs" search shelf. */
export function parseSongRow(it: Json): CatalogTrack | null {
  const cols = (it.flexColumns ?? []).map((c: Json) => c.musicResponsiveListItemFlexColumnRenderer?.text?.runs as Json[] | undefined)
  const videoId: string | undefined = it.playlistItemData?.videoId ?? cols[0]?.[0]?.navigationEndpoint?.watchEndpoint?.videoId
  if (!videoId || !cols[0]) return null
  const details: Json[] = cols[1] ?? []
  const pageType = (r: Json) => r.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType
  const artists = details.filter((r) => pageType(r) === 'MUSIC_PAGE_TYPE_ARTIST').map((r) => r.text)
  const album = details.find((r) => pageType(r) === 'MUSIC_PAGE_TYPE_ALBUM')?.text
  // Rows without artist links still list "Artist • Album • 3:22" as plain runs.
  const parts = runsText(details).split(' • ').map((s) => s.trim())
  // Search rows end with "• 3:22"; playlist rows keep the length in a fixed column instead.
  const fixed = runsText(it.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs)
  const duration = parseDuration(parts[parts.length - 1]) || parseDuration(fixed)
  const explicit = collect(it.badges, 'musicInlineBadgeRenderer').some((b) => b.icon?.iconType === 'MUSIC_EXPLICIT_BADGE')
  return {
    id: `youtube:${videoId}`,
    source: 'youtube',
    title: runsText(cols[0]),
    artist: artists.length ? artists.join(', ') : parts[0] || 'Unknown artist',
    artwork: songArtwork(it.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails) ?? videoThumb(videoId),
    duration,
    streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
    isLive: false,
    meta: album,
    pageUrl: `https://music.youtube.com/watch?v=${videoId}`,
    youtubeId: videoId,
    explicit,
  }
}

export function parseVideo(v: Json): CatalogTrack | null {
  const id: string | undefined = v.videoId
  if (!id) return null
  const duration = parseDuration(v.lengthText?.simpleText)
  // Upcoming premieres and live streams have no length; the IFrame player can't seek them sensibly.
  if (!duration) return null
  return {
    id: `youtube:${id}`,
    source: 'youtube',
    title: runsText(v.title?.runs) || v.title?.simpleText || 'Untitled',
    artist: runsText(v.ownerText?.runs) || runsText(v.shortBylineText?.runs) || 'YouTube',
    artwork: videoThumb(id),
    duration,
    streamUrl: `https://www.youtube.com/watch?v=${id}`,
    isLive: false,
    meta: v.viewCountText?.simpleText,
    pageUrl: `https://www.youtube.com/watch?v=${id}`,
    youtubeId: id,
  }
}

const dedupe = (list: (CatalogTrack | null)[]) => {
  const seen = new Set<string>()
  return list.filter((t): t is CatalogTrack => !!t && !seen.has(t.id) && !!seen.add(t.id))
}

export async function searchSongs(query: string): Promise<CatalogTrack[]> {
  const data = await innertube(YTM, 'search', YTM_CLIENT, { query, params: FILTER_SONGS })
  return dedupe(collect(data, 'musicResponsiveListItemRenderer').map(parseSongRow))
}

export async function searchVideos(query: string): Promise<CatalogTrack[]> {
  const data = await innertube(YT, 'search', YT_CLIENT, { query, params: FILTER_VIDEOS })
  return dedupe(collect(data, 'videoRenderer').map(parseVideo))
}

/** "Daily Top Music Videos - Global"; looked up fresh from the charts page when possible. */
const FALLBACK_CHART = 'VLPL4fGSI1pDJn6t3TXLGiiJdD-sZbrG3tG0'

/** The "Daily Top Music Videos" playlist on a country's charts page ("ZZ" = global), if it has one. */
async function dailyChartId(country: string): Promise<string | null> {
  const charts = await innertube(YTM, 'browse', { ...YTM_CLIENT, gl: country === 'ZZ' ? 'US' : country }, { browseId: 'FEmusic_charts', formData: { selectedValues: [country] } })
  const item = collect(charts, 'musicTwoRowItemRenderer').find((x) => /^daily top music videos/i.test(runsText(x.title?.runs)))
  const id: string | undefined = item?.navigationEndpoint?.browseEndpoint?.browseId
  return id?.startsWith('VL') ? id : null
}

export async function chart(country = 'ZZ', limit = 50): Promise<CatalogTrack[]> {
  let browseId = FALLBACK_CHART
  try {
    browseId = (await dailyChartId(country)) ?? (country !== 'ZZ' ? await dailyChartId('ZZ') : null) ?? FALLBACK_CHART
  } catch {
    /* use the known playlist */
  }
  const data = await innertube(YTM, 'browse', YTM_CLIENT, { browseId })
  return dedupe(collect(data, 'musicResponsiveListItemRenderer').map(parseSongRow)).slice(0, limit)
}

export async function suggestions(input: string): Promise<string[]> {
  const data = await innertube(YTM, 'music/get_search_suggestions', YTM_CLIENT, { input })
  return collect(data, 'searchSuggestionRenderer')
    .map((s) => runsText(s.suggestion?.runs))
    .filter(Boolean)
    .slice(0, 8)
}
