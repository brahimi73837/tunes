import type { SourceId, Track } from '../types'

/**
 * Share links carry a whole playlist in the URL hash: #/import/<payload>
 * payload = "z" + base64url(deflate-raw(json))  when CompressionStream exists
 *         | "j" + base64url(json)               otherwise
 * Tracks are stored as compact tuples to keep links short.
 */

type TrackTuple = [source: SourceId, id: string, title: string, artist: string, artwork: string, duration: number, streamUrl: string, isLive: 0 | 1, meta?: string, pageUrl?: string]

export interface SharedPlaylist {
  name: string
  tracks: Track[]
}

interface Payload { v: 1; n: string; t: TrackTuple[] }

const SOURCES: SourceId[] = ['audius', 'archive', 'radio']

function toTuple(t: Track): TrackTuple {
  const tuple: TrackTuple = [t.source, t.id, t.title, t.artist, t.artwork ?? '', Math.round(t.duration || 0), t.streamUrl, t.isLive ? 1 : 0]
  if (t.meta || t.pageUrl) tuple.push(t.meta ?? '')
  if (t.pageUrl) tuple.push(t.pageUrl)
  return tuple
}

function fromTuple(x: unknown): Track | null {
  if (!Array.isArray(x) || x.length < 8) return null
  const [source, id, title, artist, artwork, duration, streamUrl, isLive, meta, pageUrl] = x
  if (!SOURCES.includes(source) || typeof id !== 'string' || typeof streamUrl !== 'string') return null
  if (!streamUrl.startsWith('https://')) return null
  return {
    source,
    id,
    title: String(title ?? ''),
    artist: String(artist ?? ''),
    artwork: typeof artwork === 'string' && artwork.startsWith('https://') ? artwork : undefined,
    duration: Number(duration) || 0,
    streamUrl,
    isLive: isLive === 1 || isLive === true,
    meta: meta ? String(meta) : undefined,
    pageUrl: typeof pageUrl === 'string' && pageUrl.startsWith('https://') ? pageUrl : undefined,
  }
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Response(bytes as BodyInit).body!.pipeThrough(stream))
  return new Uint8Array(await res.arrayBuffer())
}

const canCompress = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'

export async function encodePlaylist(p: SharedPlaylist, opts: { compress?: boolean } = {}): Promise<string> {
  const payload: Payload = { v: 1, n: p.name, t: p.tracks.map(toTuple) }
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  if ((opts.compress ?? true) && canCompress()) {
    return 'z' + bytesToB64url(await pipe(bytes, new CompressionStream('deflate-raw')))
  }
  return 'j' + bytesToB64url(bytes)
}

export async function decodePlaylist(encoded: string): Promise<SharedPlaylist> {
  const kind = encoded[0]
  const body = encoded.slice(1)
  let bytes: Uint8Array
  if (kind === 'z') {
    if (!canCompress()) throw new Error('This browser cannot open compressed share links')
    bytes = await pipe(b64urlToBytes(body), new DecompressionStream('deflate-raw'))
  } else if (kind === 'j') {
    bytes = b64urlToBytes(body)
  } else {
    throw new Error('Unrecognised share link')
  }
  const data = JSON.parse(new TextDecoder().decode(bytes)) as Partial<Payload>
  if (data?.v !== 1 || !Array.isArray(data.t)) throw new Error('Unrecognised share link')
  return {
    name: String(data.n || 'Shared playlist').slice(0, 120),
    tracks: data.t.map(fromTuple).filter((t): t is Track => t !== null),
  }
}

export function shareUrl(encoded: string): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#/import/${encoded}`
}
