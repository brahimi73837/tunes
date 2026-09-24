import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { QueueItem, RepeatMode, Track } from '../types'
import { moveItem, shuffleArray, uid } from '../lib/util'

/**
 * The player store holds the *desired* state (queue, what should be playing, volume…).
 * The audio engine (src/audio/engine.ts) owns the single HTMLAudioElement, reacts to this
 * store and reports progress into `usePlayback`.
 */

export interface Engine {
  load: (track: Track, autoplay: boolean, startAt?: number) => void
  play: () => void
  pause: () => void
  seek: (sec: number) => void
  currentTime: () => number
  applyVolume: (volume: number, muted: boolean) => void
  stop: () => void
}

let engine: Engine | null = null
export const attachEngine = (e: Engine) => {
  engine = e
}

/** High-frequency playback state, deliberately not persisted. */
export const usePlayback = create<{ currentTime: number; duration: number; buffering: boolean; error: string | null }>(() => ({
  currentTime: 0,
  duration: 0,
  buffering: false,
  error: null,
}))

export interface PlayerState {
  queue: QueueItem[]
  index: number
  /** Queue order before shuffle was turned on, so it can be restored. */
  unshuffled: QueueItem[] | null
  isPlaying: boolean
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  sleepAt: number | null
  sleepEndOfTrack: boolean

  current: () => QueueItem | undefined
  playTracks: (tracks: Track[], startIndex?: number, opts?: { shuffle?: boolean }) => void
  togglePlay: () => void
  play: () => void
  pause: () => void
  next: (opts?: { auto?: boolean; failed?: boolean }) => void
  prev: () => void
  jumpTo: (uid: string) => void
  seek: (sec: number) => void
  seekBy: (delta: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  addToQueue: (tracks: Track[]) => void
  playNext: (tracks: Track[]) => void
  removeFromQueue: (uid: string) => void
  moveInQueue: (from: number, to: number) => void
  clearQueue: () => void
  setSleep: (minutes: number | 'end' | null) => void
}

const item = (track: Track): QueueItem => ({ uid: uid('q_'), track })
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => {
      const loadCurrent = (autoplay: boolean) => {
        const cur = get().current()
        if (!cur) return
        usePlayback.setState({ currentTime: 0, duration: cur.track.duration || 0, error: null })
        engine?.load(cur.track, autoplay)
      }

      return {
        queue: [],
        index: -1,
        unshuffled: null,
        isPlaying: false,
        volume: 0.8,
        muted: false,
        shuffle: false,
        repeat: 'off',
        sleepAt: null,
        sleepEndOfTrack: false,

        current: () => get().queue[get().index],

        playTracks: (tracks, startIndex = 0, opts = {}) => {
          if (!tracks.length) return
          const items = tracks.map(item)
          const shuffle = opts.shuffle ?? get().shuffle
          if (shuffle) {
            const start = opts.shuffle ? Math.floor(Math.random() * items.length) : Math.min(startIndex, items.length - 1)
            const first = items[start]
            const rest = shuffleArray(items.filter((_, i) => i !== start))
            set({ queue: [first, ...rest], index: 0, unshuffled: items, shuffle: true, isPlaying: true })
          } else {
            set({ queue: items, index: Math.min(startIndex, items.length - 1), unshuffled: null, isPlaying: true })
          }
          loadCurrent(true)
        },

        togglePlay: () => (get().isPlaying ? get().pause() : get().play()),

        play: () => {
          if (!get().current()) {
            return
          }
          set({ isPlaying: true })
          engine?.play()
        },

        pause: () => {
          set({ isPlaying: false })
          engine?.pause()
        },

        next: ({ auto = false, failed = false } = {}) => {
          const { queue, index, repeat, sleepEndOfTrack } = get()
          if (!queue.length) return
          if (auto && !failed && sleepEndOfTrack) {
            set({ isPlaying: false, sleepEndOfTrack: false })
            engine?.pause()
            return
          }
          if (auto && !failed && repeat === 'one') {
            engine?.seek(0)
            engine?.play()
            return
          }
          if (index < queue.length - 1) {
            set({ index: index + 1 })
            loadCurrent(get().isPlaying || auto)
          } else if (repeat === 'all' || (repeat === 'one' && failed)) {
            set({ index: 0 })
            loadCurrent(get().isPlaying || auto)
          } else if (auto) {
            // End of queue: stop on the last track, rewound.
            set({ isPlaying: false })
            engine?.pause()
            engine?.seek(0)
          } else {
            set({ index: 0, isPlaying: false })
            loadCurrent(false)
          }
        },

        prev: () => {
          const { queue, index, repeat } = get()
          const cur = get().current()
          if (!cur) return
          if (!cur.track.isLive && (engine?.currentTime() ?? 0) > 3) {
            engine?.seek(0)
            return
          }
          if (index > 0) set({ index: index - 1 })
          else if (repeat === 'all') set({ index: queue.length - 1 })
          else {
            engine?.seek(0)
            return
          }
          loadCurrent(get().isPlaying)
        },

        jumpTo: (id) => {
          const i = get().queue.findIndex((q) => q.uid === id)
          if (i < 0) return
          set({ index: i, isPlaying: true })
          loadCurrent(true)
        },

        seek: (sec) => {
          const cur = get().current()
          if (!cur || cur.track.isLive) return
          engine?.seek(Math.max(0, sec))
        },

        seekBy: (delta) => get().seek((engine?.currentTime() ?? 0) + delta),

        setVolume: (v) => {
          const volume = clamp01(v)
          set({ volume, muted: volume === 0 ? get().muted : false })
          engine?.applyVolume(volume, get().muted)
        },

        toggleMute: () => {
          set({ muted: !get().muted })
          engine?.applyVolume(get().volume, get().muted)
        },

        toggleShuffle: () => {
          const { shuffle, queue, index, unshuffled } = get()
          const cur = queue[index]
          if (!shuffle) {
            const rest = shuffleArray(queue.filter((_, i) => i !== index))
            set({ shuffle: true, unshuffled: queue, queue: cur ? [cur, ...rest] : rest, index: cur ? 0 : -1 })
          } else {
            const present = new Set(queue.map((q) => q.uid))
            const base = (unshuffled ?? []).filter((q) => present.has(q.uid))
            const baseIds = new Set(base.map((q) => q.uid))
            const restored = [...base, ...queue.filter((q) => !baseIds.has(q.uid))]
            set({ shuffle: false, unshuffled: null, queue: restored, index: cur ? restored.findIndex((q) => q.uid === cur.uid) : -1 })
          }
        },

        cycleRepeat: () => set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),

        addToQueue: (tracks) => {
          const items = tracks.map(item)
          const wasEmpty = get().queue.length === 0
          set((s) => ({ queue: [...s.queue, ...items], unshuffled: s.unshuffled ? [...s.unshuffled, ...items] : null }))
          if (wasEmpty) {
            set({ index: 0 })
            loadCurrent(false)
          }
        },

        playNext: (tracks) => {
          const items = tracks.map(item)
          const { index, queue } = get()
          if (!queue.length) return get().addToQueue(tracks)
          const at = index + 1
          set((s) => ({
            queue: [...s.queue.slice(0, at), ...items, ...s.queue.slice(at)],
            unshuffled: s.unshuffled ? insertAfter(s.unshuffled, s.queue[index]?.uid, items) : null,
          }))
        },

        removeFromQueue: (id) => {
          const { queue, index } = get()
          const i = queue.findIndex((q) => q.uid === id)
          if (i < 0) return
          const newQueue = queue.filter((q) => q.uid !== id)
          const unshuffled = get().unshuffled?.filter((q) => q.uid !== id) ?? null
          if (i < index) set({ queue: newQueue, index: index - 1, unshuffled })
          else if (i > index) set({ queue: newQueue, unshuffled })
          else {
            // Removing the current track: move on to whatever takes its place.
            if (!newQueue.length) {
              set({ queue: [], index: -1, isPlaying: false, unshuffled: null })
              engine?.stop()
              return
            }
            set({ queue: newQueue, index: Math.min(index, newQueue.length - 1), unshuffled })
            loadCurrent(get().isPlaying)
          }
        },

        moveInQueue: (from, to) => {
          const { queue, index } = get()
          const curUid = queue[index]?.uid
          const moved = moveItem(queue, from, to)
          set({ queue: moved, index: curUid ? moved.findIndex((q) => q.uid === curUid) : index })
        },

        clearQueue: () => {
          // Keep the current track so playback isn't interrupted.
          const cur = get().current()
          set({ queue: cur ? [cur] : [], index: cur ? 0 : -1, unshuffled: null })
        },

        setSleep: (minutes) => {
          if (minutes === null) set({ sleepAt: null, sleepEndOfTrack: false })
          else if (minutes === 'end') set({ sleepAt: null, sleepEndOfTrack: true })
          else set({ sleepAt: Date.now() + minutes * 60_000, sleepEndOfTrack: false })
        },
      }
    },
    {
      name: 'tunes.player',
      version: 1,
      partialize: (s) => ({
        queue: s.queue.slice(0, 500),
        index: s.index,
        unshuffled: s.unshuffled?.slice(0, 500) ?? null,
        volume: s.volume,
        muted: s.muted,
        shuffle: s.shuffle,
        repeat: s.repeat,
      }),
    },
  ),
)

function insertAfter(list: QueueItem[], afterUid: string | undefined, items: QueueItem[]): QueueItem[] {
  const i = afterUid ? list.findIndex((q) => q.uid === afterUid) : -1
  return [...list.slice(0, i + 1), ...items, ...list.slice(i + 1)]
}
