/** Same shape as the app's `Track` (src/types.ts), restricted to the catalog sources. */
export interface CatalogTrack {
  id: string
  source: 'youtube' | 'saavn'
  title: string
  artist: string
  artwork?: string
  /** Seconds. */
  duration: number
  /** Direct audio URL for saavn; the watch URL for youtube (played through the IFrame player). */
  streamUrl: string
  isLive: false
  /** Album name. */
  meta?: string
  pageUrl?: string
  /** YouTube video to fall back to (or, for youtube tracks, the one to play). */
  youtubeId?: string
  explicit?: boolean
}

export interface Env {
  /** IP sent as X-Forwarded-For to JioSaavn; it picks its catalog region from it. */
  SAAVN_GEO_IP?: string
  /** Comma-separated list of origins allowed to call the API ("*" for any). */
  ALLOWED_ORIGINS?: string
}
