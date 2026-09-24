import { beforeEach, describe, expect, it } from 'vitest'
import { LIKED_ID, useLibrary } from './library'
import type { Track } from '../types'

const t = (n: number): Track => ({ id: `audius:${n}`, source: 'audius', title: `T${n}`, artist: 'A', duration: 100, streamUrl: `https://api.audius.co/v1/tracks/${n}/stream`, isLive: false })
const lib = () => useLibrary.getState()
const get = (id: string) => lib().playlists.find((p) => p.id === id)!

describe('library store', () => {
  beforeEach(() => {
    localStorage.clear()
    useLibrary.setState({ playlists: [{ id: LIKED_ID, name: 'Liked', tracks: [], createdAt: 0, updatedAt: 0 }] })
  })

  it('always has Liked first', () => {
    expect(lib().playlists[0].id).toBe(LIKED_ID)
  })

  it('creates, renames and deletes playlists', () => {
    const id = lib().createPlaylist('  Road trip  ', [t(1), t(1), t(2)])
    expect(get(id).name).toBe('Road trip')
    expect(get(id).tracks.map((x) => x.id)).toEqual(['audius:1', 'audius:2'])
    lib().renamePlaylist(id, 'Night drive')
    expect(get(id).name).toBe('Night drive')
    lib().renamePlaylist(id, '   ')
    expect(get(id).name).toBe('Night drive')
    lib().deletePlaylist(id)
    expect(lib().playlists.find((p) => p.id === id)).toBeUndefined()
  })

  it('cannot rename or delete Liked', () => {
    lib().renamePlaylist(LIKED_ID, 'Nope')
    lib().deletePlaylist(LIKED_ID)
    expect(get(LIKED_ID).name).toBe('Liked')
  })

  it('adds tracks without duplicates and reports count', () => {
    const id = lib().createPlaylist('P')
    expect(lib().addTracks(id, [t(1), t(2)])).toBe(2)
    expect(lib().addTracks(id, [t(2), t(3)])).toBe(1)
    expect(get(id).tracks.map((x) => x.id)).toEqual(['audius:1', 'audius:2', 'audius:3'])
  })

  it('reorders and removes tracks', () => {
    const id = lib().createPlaylist('P', [t(1), t(2), t(3), t(4)])
    lib().moveTrack(id, 0, 2)
    expect(get(id).tracks.map((x) => x.title)).toEqual(['T2', 'T3', 'T1', 'T4'])
    lib().moveTrack(id, 3, 0)
    expect(get(id).tracks.map((x) => x.title)).toEqual(['T4', 'T2', 'T3', 'T1'])
    lib().removeTrackAt(id, 1)
    expect(get(id).tracks.map((x) => x.title)).toEqual(['T4', 'T3', 'T1'])
  })

  it('toggles likes, newest first', () => {
    expect(lib().toggleLike(t(1))).toBe(true)
    expect(lib().toggleLike(t(2))).toBe(true)
    expect(get(LIKED_ID).tracks.map((x) => x.id)).toEqual(['audius:2', 'audius:1'])
    expect(lib().toggleLike(t(1))).toBe(false)
    expect(get(LIKED_ID).tracks.map((x) => x.id)).toEqual(['audius:2'])
  })

  it('persists to localStorage', () => {
    lib().createPlaylist('Saved', [t(9)])
    const raw = JSON.parse(localStorage.getItem('tunes.library')!)
    expect(raw.state.playlists.map((p: { name: string }) => p.name)).toContain('Saved')
  })

  it('exports and re-imports (merging, not duplicating)', () => {
    const id = lib().createPlaylist('Mix', [t(1)])
    lib().toggleLike(t(5))
    const file = JSON.parse(JSON.stringify(lib().exportData()))
    expect(file.app).toBe('tunes')

    // Fresh browser.
    useLibrary.setState({ playlists: [{ id: LIKED_ID, name: 'Liked', tracks: [], createdAt: 0, updatedAt: 0 }] })
    expect(lib().importData(file)).toBe(2)
    expect(get(id).tracks).toHaveLength(1)
    expect(get(LIKED_ID).tracks.map((x) => x.id)).toEqual(['audius:5'])

    // Importing again merges into the same playlists.
    lib().importData(file)
    expect(lib().playlists).toHaveLength(2)
    expect(get(id).tracks).toHaveLength(1)
  })

  it('rejects invalid import files and filters insecure tracks', () => {
    expect(() => lib().importData({ nope: true })).toThrow()
    lib().importData({ playlists: [{ id: 'x', name: 'Bad', tracks: [{ ...t(1), streamUrl: 'http://evil' }, t(2)] }] })
    expect(get('x').tracks.map((x) => x.id)).toEqual(['audius:2'])
  })
})
