import { create } from 'zustand'
import * as radio from '../sources/radio'
import { usePlayer } from '../store/player'
import { toast } from '../store/ui'
import type { Track } from '../types'

const useFocus = create<{ loading: boolean }>(() => ({ loading: false }))
export const useFocusModeState = () => useFocus((s) => s.loading)

/** "Focus mode": queue a mix of lofi + ambient live stations and start playing. */
export async function startFocusMode() {
  if (useFocus.getState().loading) return
  useFocus.setState({ loading: true })
  try {
    const results = await Promise.allSettled([
      radio.search({ tag: 'lofi', max: 6 }),
      radio.search({ tag: 'ambient', max: 5 }),
      radio.search({ tag: 'chillout', max: 4 }),
    ])
    const lists = results.map((r) => (r.status === 'fulfilled' ? r.value : []))
    // Interleave so skipping hops between moods.
    const seen = new Set<string>()
    const mixed: Track[] = []
    for (let i = 0; i < 6; i++) {
      for (const l of lists) {
        const t = l[i]
        if (t && !seen.has(t.id)) {
          seen.add(t.id)
          mixed.push(t)
        }
      }
    }
    if (!mixed.length) throw new Error('No focus stations reachable right now')
    const player = usePlayer.getState()
    if (player.shuffle) player.toggleShuffle()
    player.playTracks(mixed, 0, { shuffle: false })
    toast(`Focus mode: ${mixed.length} lofi & ambient stations queued. Next ⏭ switches station.`, 'success')
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Focus mode failed', 'error')
  } finally {
    useFocus.setState({ loading: false })
  }
}
