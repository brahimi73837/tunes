import { b64ToBytes, desEcbDecrypt } from './des'
import { decodeEntities } from './text'
import type { CatalogTrack } from './types'

const API = 'https://www.jiosaavn.com/api.php'
const MEDIA_KEY = '38346591'
// An address in India; JioSaavn hides most of its licensed catalog from other regions.
const DEFAULT_GEO_IP = '49.36.0.1'

interface SaavnArtist { name: string; role?: string }
export interface SaavnSong {
  id: string
  title: string
  subtitle?: string
  type?: string
  perma_url?: string
  image?: string
  explicit_content?: string
  more_info?: {
    album?: string
    duration?: string
    '320kbps'?: string
    encrypted_media_url?: string
    artistMap?: { primary_artists?: SaavnArtist[]; artists?: SaavnArtist[] }
    music?: string
  }
}

export function mediaUrl(encrypted: string, hq: boolean): string | null {
  try {
    const url = new TextDecoder().decode(desEcbDecrypt(b64ToBytes(encrypted), MEDIA_KEY))
    if (!/^https:\/\/[a-z0-9.-]+\.saavncdn\.com\//.test(url)) return null
    // The signed web.saavncdn.com variants are geo-fenced; the aac host serves the same file to everyone.
    return url.replace(/^https:\/\/[a-z0-9.-]+\.saavncdn\.com\//, 'https://aac.saavncdn.com/').replace(/_96\.mp4$/, hq ? '_320.mp4' : '_160.mp4')
  } catch {
    return null
  }
}

export function toTrack(s: SaavnSong): CatalogTrack | null {
  const info = s.more_info ?? {}
  if (s.type && s.type !== 'song') return null
  const streamUrl = info.encrypted_media_url ? mediaUrl(info.encrypted_media_url, info['320kbps'] === 'true') : null
  if (!streamUrl) return null
  const primary = info.artistMap?.primary_artists?.map((a) => decodeEntities(a.name)).filter(Boolean) ?? []
  const artist = primary.length ? primary.join(', ') : decodeEntities((s.subtitle ?? '').split(' - ')[0] || 'Unknown artist')
  return {
    id: `saavn:${s.id}`,
    source: 'saavn',
    title: decodeEntities(s.title),
    artist,
    artwork: s.image?.startsWith('https://') ? s.image.replace(/-\d+x\d+\.(jpg|png|webp)$/, '-500x500.$1') : undefined,
    duration: Number(info.duration) || 0,
    streamUrl,
    isLive: false,
    meta: info.album ? decodeEntities(info.album) : undefined,
    pageUrl: s.perma_url,
    explicit: s.explicit_content === '1',
  }
}

export async function searchSongs(query: string, opts: { limit?: number; geoIp?: string } = {}): Promise<CatalogTrack[]> {
  const qs = new URLSearchParams({
    __call: 'search.getResults',
    _format: 'json',
    _marker: '0',
    api_version: '4',
    ctx: 'web6dot0',
    n: String(opts.limit ?? 20),
    p: '1',
    q: query,
  })
  const res = await fetch(`${API}?${qs}`, {
    headers: { Accept: 'application/json', 'X-Forwarded-For': opts.geoIp || DEFAULT_GEO_IP, 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`JioSaavn HTTP ${res.status}`)
  const data = (await res.json()) as { results?: SaavnSong[] }
  return (data.results ?? []).map(toTrack).filter((t): t is CatalogTrack => t !== null)
}
