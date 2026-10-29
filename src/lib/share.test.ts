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

  it('keeps YouTube ids for YouTube tracks and JioSaavn fallbacks', async () => {
    const yt: Track = { id: 'youtube:J7p4bzqLvCw', source: 'youtube', title: 'Blinding Lights', artist: 'The Weeknd', duration: 202, streamUrl: 'https://www.youtube.com/watch?v=J7p4bzqLvCw', isLive: false, youtubeId: 'J7p4bzqLvCw' }
    const sv: Track = { id: 'saavn:abc', source: 'saavn', title: 'Shape of You', artist: 'Ed Sheeran', duration: 233, streamUrl: 'https://aac.saavncdn.com/126/x_320.mp4', isLive: false, youtubeId: 'JGwWNGJdvx8' }
    const dec = await decodePlaylist(await encodePlaylist({ name: 'Mixed', tracks: [yt, sv, tracks[0]] }))
    expect(dec.tracks[0]).toEqual(yt)
    expect(dec.tracks[1]).toEqual(sv)
    expect(dec.tracks[2].youtubeId).toBeUndefined()
  })

  it('drops YouTube tracks without a valid video id', async () => {
    const payload = { v: 1, n: 'x', t: [['youtube', 'youtube:bad', 'T', 'A', '', 1, 'https://www.youtube.com/watch?v=bad', 0, '', '', 'not-an-id!']] }
    const dec = await decodePlaylist('j' + btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))
    expect(dec.tracks).toHaveLength(0)
  })

  it('rejects garbage', async () => {
    await expect(decodePlaylist('xnope')).rejects.toThrow()
    await expect(decodePlaylist('j' + btoa('{"v":2}'))).rejects.toThrow()
  })
})
