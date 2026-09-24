import type { SourceId, Track } from '../types'
import * as audius from './audius'

export interface SourceInfo {
  id: SourceId
  label: string
  /** Tailwind classes for the small source badge. */
  badge: string
  /** Optional hook to turn a stored streamUrl into a fresh one right before playback. */
  resolveStream?: (t: Track) => Promise<string>
}

export const SOURCES: Record<SourceId, SourceInfo> = {
  audius: { id: 'audius', label: 'Audius', badge: 'bg-fuchsia-500/15 text-fuchsia-300', resolveStream: audius.resolveStream },
  archive: { id: 'archive', label: 'Archive', badge: 'bg-sky-500/15 text-sky-300' },
  radio: { id: 'radio', label: 'Radio', badge: 'bg-amber-500/15 text-amber-300' },
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
