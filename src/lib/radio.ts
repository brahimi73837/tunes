import { radio } from '../sources/catalog'
import { usePlayer } from '../store/player'
import { toast } from '../store/ui'
import type { Track } from '../types'

/** Same song, other upload ("Shape Of You" music video after "Shape of You")? */
const songKey = (t: Pick<Track, 'title'>) =>
  t.title
    .toLowerCase()
    .replace(/[([].*?[)\]]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** Tracks YouTube Music would play after this one (needs a YouTube copy to ask about). */
export const hasRadio = (t: Track) => !!t.youtubeId

/** Plays a track followed by its YouTube Music radio. */
export async function startRadio(t: Track) {
  if (!t.youtubeId) return
  toast(`Starting radio from “${t.title}”…`)
  try {
    const list = await radio(t.youtubeId)
    usePlayer.getState().playTracks([t, ...list.filter((x) => x.id !== t.id && songKey(x) !== songKey(t))], 0, { shuffle: false })
  } catch {
    toast('Couldn’t start radio right now', 'error')
  }
}

/** When the queue runs out: songs like the last one, minus anything already queued. */
export async function similarTo(t: Track, exclude: Set<string>): Promise<Track[]> {
  if (!t.youtubeId) return []
  const list = await radio(t.youtubeId).catch(() => [])
  return list.filter((x) => !exclude.has(x.id) && !exclude.has(`youtube:${x.youtubeId}`) && songKey(x) !== songKey(t)).slice(0, 25)
}
