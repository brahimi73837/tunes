/**
 * Invidious API response parsing, shared by the Worker and the app (pure: no I/O, no globals).
 */

export interface AudioFormat {
  itag: number
  /** e.g. 'audio/webm; codecs="opus"' */
  mime: string
  bitrate: number
  url: string
}

export interface StreamInfo {
  id: string
  instance: string
  title?: string
  author?: string
  duration: number
  formats: AudioFormat[]
  /** Unix seconds; YouTube stream URLs stop working after this. */
  expires: number
}

interface InvidiousFormat {
  itag?: string | number
  type?: string
  bitrate?: string | number
  url?: string
  clen?: string
}

/** Turns an Invidious /api/v1/videos response into our shape, keeping original-language, non-DRC audio. */
export function parseInvidious(host: string, id: string, data: unknown, now = Date.now()): StreamInfo | null {
  const d = data as { adaptiveFormats?: InvidiousFormat[]; title?: string; author?: string; lengthSeconds?: number; liveNow?: boolean }
  if (!d || !Array.isArray(d.adaptiveFormats) || d.liveNow) return null
  const formats: AudioFormat[] = []
  for (const f of d.adaptiveFormats) {
    if (!f?.type?.startsWith('audio/') || !f.url) continue
    const url = f.url.startsWith('/') ? `https://${host}${f.url}` : f.url
    let u: URL
    try {
      u = new URL(url)
    } catch {
      continue
    }
    // Only proxied URLs play for us: googlevideo links are locked to the server's IP.
    if (u.protocol !== 'https:' || u.host !== host) continue
    const xtags = decodeURIComponent(u.searchParams.get('xtags') ?? '')
    if (/acont=(dubbed|descriptive)/.test(xtags) || /drc=1/.test(xtags)) continue
    formats.push({ itag: Number(f.itag), mime: f.type, bitrate: Number(f.bitrate) || 0, url })
  }
  if (!formats.length) return null
  const firstUrl = new URL(formats[0].url)
  const expires = Number(firstUrl.searchParams.get('expire')) || Math.floor(now / 1000) + 3 * 3600
  return { id, instance: host, title: d.title, author: d.author, duration: Number(d.lengthSeconds) || 0, formats, expires }
}

/** The format the probe downloads from; AAC is what every browser can play. */
export const probeFormat = (s: StreamInfo) => s.formats.find((f) => f.itag === 140) ?? s.formats[0]
