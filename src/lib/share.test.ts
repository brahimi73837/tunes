import { describe, expect, it } from 'vitest'
import { decodePlaylist, encodePlaylist } from './share'
import type { Track } from '../types'

const tracks: Track[] = [
  { id: 'audius:abc', source: 'audius', title: 'Song “One” – ünïcödé 🎵', artist: 'Artist', artwork: 'https://x/a.jpg', duration: 201.4, streamUrl: 'https://api.audius.co/v1/tracks/abc/stream?app_name=tunes', isLive: false, meta: 'Lo-Fi', pageUrl: 'https://audius.co/a/b' },
  { id: 'archive:item/01 track.mp3', source: 'archive', title: 'Track', artist: 'Band', duration: 0, streamUrl: 'https://archive.org/download/item/01%20track.mp3', isLive: false },
  { id: 'radio:uuid', source: 'radio', title: 'Station', artist: 'US · jazz', duration: 0, streamUrl: 'https://stream.example/live', isLive: true },
]

describe('share link encoding', () => {
  it('round-trips a playlist with compression', async () => {
    const enc = await encodePlaylist({ name: 'My Mix', tracks })
    expect(enc[0]).toBe('z')
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/)
    const dec = await decodePlaylist(enc)
    expect(dec.name).toBe('My Mix')
    expect(dec.tracks).toHaveLength(3)
    expect(dec.tracks[0]).toMatchObject({ ...tracks[0], duration: 201 })
    expect(dec.tracks[1]).toMatchObject({ id: tracks[1].id, streamUrl: tracks[1].streamUrl, artwork: undefined })
    expect(dec.tracks[2].isLive).toBe(true)
  })

  it('round-trips without compression', async () => {
    const enc = await encodePlaylist({ name: 'Plain', tracks }, { compress: false })
    expect(enc[0]).toBe('j')
    expect((await decodePlaylist(enc)).tracks.map((t) => t.id)).toEqual(tracks.map((t) => t.id))
  })

  it('compresses large playlists into a reasonably short URL', async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ ...tracks[0], id: `audius:${i}`, streamUrl: `https://api.audius.co/v1/tracks/${i}/stream?app_name=tunes` }))
    const z = await encodePlaylist({ name: 'Big', tracks: many })
    const j = await encodePlaylist({ name: 'Big', tracks: many }, { compress: false })
    expect(z.length).toBeLessThan(j.length / 3)
  })

  it('drops tracks with insecure or malformed data', async () => {
    const bad = [...tracks, { ...tracks[0], id: 'audius:http', streamUrl: 'http://insecure/stream' }]
    const dec = await decodePlaylist(await encodePlaylist({ name: 'x', tracks: bad }))
    expect(dec.tracks.map((t) => t.id)).not.toContain('audius:http')
  })

  it('rejects garbage', async () => {
    await expect(decodePlaylist('xnope')).rejects.toThrow()
    await expect(decodePlaylist('j' + btoa('{"v":2}'))).rejects.toThrow()
  })
})
