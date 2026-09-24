import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Playlist, Track } from '../types'
import { moveItem, uid } from '../lib/util'

export const LIKED_ID = 'liked'

const now = () => Date.now()
const newPlaylist = (id: string, name: string, tracks: Track[] = []): Playlist => ({ id, name, tracks, createdAt: now(), updatedAt: now() })

export interface ExportFile {
  app: 'tunes'
  version: 1
  exportedAt: string
  playlists: Playlist[]
}

interface LibraryState {
  playlists: Playlist[]
  createPlaylist: (name: string, tracks?: Track[]) => string
  renamePlaylist: (id: string, name: string) => void
  deletePlaylist: (id: string) => void
  /** Adds tracks, skipping ones already in the playlist. Returns how many were added. */
  addTracks: (id: string, tracks: Track[]) => number
  removeTrackAt: (id: string, index: number) => void
  moveTrack: (id: string, from: number, to: number) => void
  toggleLike: (track: Track) => boolean
  exportData: (ids?: string[]) => ExportFile
  /** Merges playlists from an export file. Returns the number of playlists imported. */
  importData: (data: unknown) => number
}

function update(list: Playlist[], id: string, fn: (p: Playlist) => Playlist): Playlist[] {
  return list.map((p) => (p.id === id ? { ...fn(p), updatedAt: now() } : p))
}

function isTrack(t: unknown): t is Track {
  const x = t as Track
  return !!x && typeof x.id === 'string' && typeof x.title === 'string' && typeof x.streamUrl === 'string' && x.streamUrl.startsWith('https://') && ['audius', 'archive', 'radio'].includes(x.source)
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      playlists: [newPlaylist(LIKED_ID, 'Liked')],

      createPlaylist: (name, tracks = []) => {
        const id = uid('pl_')
        set((s) => ({ playlists: [...s.playlists, newPlaylist(id, name.trim() || 'New playlist', dedupe(tracks))] }))
        return id
      },

      renamePlaylist: (id, name) => {
        if (id === LIKED_ID || !name.trim()) return
        set((s) => ({ playlists: update(s.playlists, id, (p) => ({ ...p, name: name.trim() })) }))
      },

      deletePlaylist: (id) => {
        if (id === LIKED_ID) return
        set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) }))
      },

      addTracks: (id, tracks) => {
        const pl = get().playlists.find((p) => p.id === id)
        if (!pl) return 0
        const have = new Set(pl.tracks.map((t) => t.id))
        const fresh = dedupe(tracks).filter((t) => !have.has(t.id))
        if (fresh.length) set((s) => ({ playlists: update(s.playlists, id, (p) => ({ ...p, tracks: [...p.tracks, ...fresh] })) }))
        return fresh.length
      },

      removeTrackAt: (id, index) =>
        set((s) => ({ playlists: update(s.playlists, id, (p) => ({ ...p, tracks: p.tracks.filter((_, i) => i !== index) })) })),

      moveTrack: (id, from, to) =>
        set((s) => ({ playlists: update(s.playlists, id, (p) => ({ ...p, tracks: moveItem(p.tracks, from, to) })) })),

      toggleLike: (track) => {
        const liked = get().playlists.find((p) => p.id === LIKED_ID)!
        const has = liked.tracks.some((t) => t.id === track.id)
        set((s) => ({
          playlists: update(s.playlists, LIKED_ID, (p) => ({
            ...p,
            // Newest likes first.
            tracks: has ? p.tracks.filter((t) => t.id !== track.id) : [track, ...p.tracks],
          })),
        }))
        return !has
      },

      exportData: (ids) => ({
        app: 'tunes',
        version: 1,
        exportedAt: new Date().toISOString(),
        playlists: get().playlists.filter((p) => !ids || ids.includes(p.id)),
      }),

      importData: (data) => {
        const incoming = (data as Partial<ExportFile>)?.playlists
        if (!Array.isArray(incoming)) throw new Error('Not a Tunes export file')
        let count = 0
        for (const raw of incoming) {
          if (!raw || typeof raw.name !== 'string' || !Array.isArray(raw.tracks)) continue
          const tracks = raw.tracks.filter(isTrack)
          if (raw.id === LIKED_ID) {
            get().addTracks(LIKED_ID, tracks)
          } else {
            const existing = get().playlists.find((p) => p.id === raw.id)
            // Same id already here (re-importing a backup): merge into it; otherwise create.
            if (existing) get().addTracks(existing.id, tracks)
            else set((s) => ({ playlists: [...s.playlists, { ...newPlaylist(typeof raw.id === 'string' ? raw.id : uid('pl_'), raw.name, dedupe(tracks)) }] }))
          }
          count++
        }
        return count
      },
    }),
    {
      name: 'tunes.library',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ playlists: s.playlists }),
      merge: (persisted, current) => {
        const playlists = (persisted as { playlists?: Playlist[] })?.playlists ?? current.playlists
        // The Liked playlist must always exist and come first.
        const liked = playlists.find((p) => p.id === LIKED_ID) ?? newPlaylist(LIKED_ID, 'Liked')
        return { ...current, playlists: [liked, ...playlists.filter((p) => p.id !== LIKED_ID)] }
      },
    },
  ),
)

function dedupe(tracks: Track[]): Track[] {
  const seen = new Set<string>()
  return tracks.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
}

export const useIsLiked = (trackId: string | undefined) =>
  useLibrary((s) => !!trackId && s.playlists[0]?.id === LIKED_ID && s.playlists[0].tracks.some((t) => t.id === trackId))
