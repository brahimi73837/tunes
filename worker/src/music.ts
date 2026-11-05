import { Innertube } from 'youtubei.js/cf-worker'
import type { CatalogTrack } from './types'

/**
 * Artist, album, playlist, radio and lyrics pages from YouTube Music, via YouTube.js
 * (https://github.com/LuanRT/YouTube.js). These are plain browse/next calls; no player
 * endpoints, which YouTube rate-limits hard.
 */

/** A tile linking to another page: an album, single, playlist or artist. */
export interface Card {
  id: string
  kind: 'album' | 'single' | 'playlist' | 'artist'
  title: string
  subtitle?: string
  artwork?: string
}

export interface ArtistPage {
  id: string
  name: string
  description?: string
  artwork?: string
  banner?: string
  topSongs: CatalogTrack[]
  albums: Card[]
  singles: Card[]
  related: Card[]
}

export interface AlbumPage {
  id: string
  title: string
  artist: string
  artistId?: string
  kind: string
  year?: string
  artwork?: string
  tracks: CatalogTrack[]
}

export interface PlaylistPage {
  id: string
  title: string
  author?: string
  artwork?: string
  tracks: CatalogTrack[]
}

type Any = any // eslint-disable-line @typescript-eslint/no-explicit-any

let client: Promise<Innertube> | null = null
function yt(): Promise<Innertube> {
  client ??= Innertube.create({ retrieve_player: false, generate_session_locally: true, lang: 'en', location: 'US' }).catch((e) => {
    client = null
    throw e
  })
  return client
}

const text = (t: Any): string => (t == null ? '' : typeof t === 'string' ? t : (t.text ?? t.toString?.() ?? '')).trim()

/** Largest square-ish thumbnail, resized to 544px when the URL allows it. */
export function bestImage(thumb: Any): string | undefined {
  const list: Any[] = Array.isArray(thumb) ? thumb : (thumb?.contents ?? thumb?.thumbnails ?? [])
  const best = [...list].sort((a, b) => (b?.width ?? 0) - (a?.width ?? 0))[0]
  const url: string | undefined = best?.url
  if (!url?.startsWith('https://')) return undefined
  return url.replace(/=w\d+-h\d+(-p)?/, '=w544-h544$1')
}

const artistsOf = (item: Any): { name: string; channel_id?: string }[] => (Array.isArray(item?.artists) && item.artists.length ? item.artists : item?.author?.name ? [item.author] : [])

export function toTrack(item: Any, fallback: { artist?: string; artistId?: string; album?: string; albumId?: string; artwork?: string } = {}): CatalogTrack | null {
  const id: string | undefined = item?.id ?? item?.video_id
  if (!id || !/^[\w-]{11}$/.test(id)) return null
  const artists = artistsOf(item)
  const artist = artists.map((a) => a.name).filter(Boolean).join(', ') || (typeof item.author === 'string' ? item.author : '') || fallback.artist || 'Unknown artist'
  const duration = Number(item.duration?.seconds) || 0
  return {
    id: `youtube:${id}`,
    source: 'youtube',
    title: text(item.title) || 'Untitled',
    artist,
    artwork: bestImage(item.thumbnail ?? item.thumbnails) ?? fallback.artwork ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    duration,
    streamUrl: `https://www.youtube.com/watch?v=${id}`,
    isLive: false,
    meta: item.album?.name ?? fallback.album,
    pageUrl: `https://music.youtube.com/watch?v=${id}`,
    youtubeId: id,
    artistId: artists.find((a) => a.channel_id)?.channel_id ?? fallback.artistId,
    albumId: item.album?.id ?? fallback.albumId,
  }
}

const tracks = (items: Any[] | undefined, fallback?: Parameters<typeof toTrack>[1]) => (items ?? []).map((i) => toTrack(i, fallback)).filter((t): t is CatalogTrack => t !== null)

export function toCard(item: Any, kind?: Card['kind']): Card | null {
  const id: string | undefined = item?.id
  if (!id) return null
  const k: Card['kind'] = kind ?? (item.item_type === 'artist' ? 'artist' : item.item_type === 'playlist' ? 'playlist' : item.item_type === 'single' ? 'single' : 'album')
  return { id, kind: k, title: text(item.title ?? item.name), subtitle: text(item.subtitle) || item.year || undefined, artwork: bestImage(item.thumbnail) }
}

const cards = (items: Any[] | undefined, kind?: Card['kind']) => (items ?? []).map((i) => toCard(i, kind)).filter((c): c is Card => c !== null && !!c.title)

export async function artist(id: string): Promise<ArtistPage> {
  const page: Any = await (await yt()).music.getArtist(id)
  const sections: Any[] = page.sections ?? []
  const section = (re: RegExp) => sections.find((s) => re.test(text(s.header?.title ?? s.title)))
  const name = text(page.header?.title)
  const top = section(/^(top )?songs$/i) ?? sections.find((s) => s.type === 'MusicShelf')
  return {
    id,
    name,
    description: text(page.header?.description) || undefined,
    artwork: bestImage(page.header?.thumbnail),
    banner: (page.header?.thumbnail?.contents ?? [])[0]?.url,
    topSongs: tracks(top?.contents, { artist: name, artistId: id }),
    albums: cards(section(/^albums$/i)?.contents, 'album'),
    singles: cards(section(/^singles/i)?.contents, 'single'),
    related: cards(section(/fans might also like|similar/i)?.contents, 'artist'),
  }
}

export async function album(id: string): Promise<AlbumPage> {
  const page: Any = await (await yt()).music.getAlbum(id)
  const h = page.header ?? {}
  const artistRun = (h.strapline_text_one?.runs ?? []).find((r: Any) => r.endpoint?.payload?.browseId?.startsWith('UC'))
  const artistName = text(h.strapline_text_one) || text(h.author?.name)
  const artwork = bestImage(h.thumbnail)
  const [kind, year] = text(h.subtitle).split(' • ')
  return {
    id,
    title: text(h.title),
    artist: artistName,
    artistId: artistRun?.endpoint?.payload?.browseId,
    kind: kind || 'Album',
    year: year && /^\d{4}$/.test(year) ? year : undefined,
    artwork,
    tracks: tracks(page.contents, { artist: artistName, artistId: artistRun?.endpoint?.payload?.browseId, album: text(h.title), albumId: id, artwork }),
  }
}

export async function playlist(id: string): Promise<PlaylistPage> {
  const page: Any = await (await yt()).music.getPlaylist(id)
  let items: Any[] = [...(page.contents ?? [])]
  // Long playlists come in pages of 100; fetch a few more.
  for (let i = 0, cur: Any = page; i < 4 && cur.has_continuation && items.length < 500; i++) {
    cur = await cur.getContinuation()
    items = items.concat(cur.contents ?? [])
  }
  const h = page.header ?? {}
  return { id, title: text(h.title) || 'YouTube playlist', author: text(h.author?.name ?? h.strapline_text_one) || undefined, artwork: bestImage(h.thumbnail), tracks: tracks(items) }
}

/** YouTube Music's "radio" for a song: the up-next queue it would play. */
export async function radio(videoId: string): Promise<CatalogTrack[]> {
  const next: Any = await (await yt()).music.getUpNext(videoId, true)
  return tracks(next.contents).filter((t) => t.youtubeId !== videoId)
}

export async function lyrics(videoId: string): Promise<{ text: string; source?: string } | null> {
  try {
    const l: Any = await (await yt()).music.getLyrics(videoId)
    const body = text(l?.description)
    return body ? { text: body, source: text(l?.footer) || undefined } : null
  } catch {
    return null
  }
}

export async function searchCards(query: string, type: 'artist' | 'album'): Promise<Card[]> {
  const res: Any = await (await yt()).music.search(query, { type })
  const items: Any[] = (type === 'artist' ? res.artists?.contents : res.albums?.contents) ?? []
  return items
    .map((i): Card | null => {
      if (!i?.id) return null
      if (type === 'artist') return { id: i.id, kind: 'artist', title: text(i.name ?? i.title), subtitle: text(i.subtitle).replace(/^Artist • /, '') || undefined, artwork: bestImage(i.thumbnail) }
      const kindLabel = text(i.item_type) === 'single' ? 'single' : 'album'
      return { id: i.id, kind: kindLabel as Card['kind'], title: text(i.title), subtitle: [i.author?.name ?? artistsOf(i)[0]?.name, i.year].filter(Boolean).join(' • ') || undefined, artwork: bestImage(i.thumbnail) }
    })
    .filter((c): c is Card => c !== null && !!c.title)
}
