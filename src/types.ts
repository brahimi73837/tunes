export type SourceId = 'audius' | 'archive' | 'radio'

/** The one shape every source adapter produces. Everything else in the app only knows about this. */
export interface Track {
  /** Globally unique: `${source}:${sourceSpecificId}` */
  id: string
  source: SourceId
  title: string
  artist: string
  artwork?: string
  /** Seconds. 0 when unknown or live. */
  duration: number
  streamUrl: string
  isLive: boolean
  /** Optional extra context (genre, country, bitrate…) shown as a subtle label. */
  meta?: string
  /** Link back to the source page for attribution. */
  pageUrl?: string
}

/** A group of tracks from a source: an Audius playlist or an Internet Archive item. */
export interface Collection {
  id: string
  source: SourceId
  kind: 'album' | 'playlist'
  title: string
  artist: string
  artwork?: string
  trackCount?: number
  meta?: string
}

export interface Playlist {
  id: string
  name: string
  tracks: Track[]
  createdAt: number
  updatedAt: number
}

export interface QueueItem {
  /** Unique per queue entry so the same track can appear twice. */
  uid: string
  track: Track
}

export type RepeatMode = 'off' | 'all' | 'one'
