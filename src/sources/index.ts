import type { SourceId, Track } from '../types'
import * as audius from './audius'
import * as radio from './radio'

export interface SourceInfo {
  id: SourceId
  label: string
  /** Tailwind classes for the small source badge. */
  badge: string
  /** "Open on …" label for the track's page link. */
  pageLabel: string
  /** Optional hook to turn a stored streamUrl into a fresh one right before playback. */
  resolveStream?: (t: Track) => Promise<string>
  /** Optional fire-and-forget hook when a track from this source starts loading. */
  onPlay?: (t: Track) => void
}

export const SOURCES: Record<SourceId, SourceInfo> = {
  youtube: { id: 'youtube', label: 'YouTube', badge: 'bg-red-500/15 text-red-300', pageLabel: 'YouTube' },
  saavn: { id: 'saavn', label: 'JioSaavn', badge: 'bg-teal-500/15 text-teal-300', pageLabel: 'JioSaavn' },
  audius: { id: 'audius', label: 'Audius', badge: 'bg-fuchsia-500/15 text-fuchsia-300', pageLabel: 'Audius', resolveStream: audius.resolveStream },
  archive: { id: 'archive', label: 'Archive', badge: 'bg-sky-500/15 text-sky-300', pageLabel: 'Archive.org' },
  radio: { id: 'radio', label: 'Radio', badge: 'bg-amber-500/15 text-amber-300', pageLabel: 'station site', onPlay: radio.countClick },
}

export async function resolveStreamUrl(t: Track): Promise<string> {
  const resolver = SOURCES[t.source]?.resolveStream
  if (!resolver) return t.streamUrl
  try {
    return await resolver(t)
  } catch {
    return t.streamUrl
  }
}
