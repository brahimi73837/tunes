// @vitest-environment node
import { describe, expect, it } from 'vitest'
import ytmSongs from '../test/fixtures/ytm-songs.json'
import ytVideos from '../test/fixtures/yt-videos.json'
import saavnSearch from '../test/fixtures/saavn-search.json'
import { b64ToBytes, desEcbDecrypt } from './des'
import { matchScore, mergeSongs, videoMatch } from './match'
import { mediaUrl, toTrack as saavnTrack, type SaavnSong } from './saavn'
import { artistSet, decodeEntities, normTitle, parseDuration, songTitleFromVideo } from './text'
import type { CatalogTrack } from './types'
import { collect, parseSongRow, parseVideo } from './youtube'

const song = (o: Partial<CatalogTrack>): CatalogTrack => ({ id: 'x', source: 'youtube', title: '', artist: '', duration: 0, streamUrl: 'https://x', isLive: false, ...o })

describe('DES', () => {
  it('decrypts a JioSaavn media URL (checked against openssl des-ecb)', () => {
    const enc = 'ID2ieOjCrwfgWvL5sXl4B1ImC5QfbsDyrbd+HcWncZZoemb80Tc5P2Jgrpnh/kigWgy0UPcVXF1Z4sdM/ulXnBw7tS9a8Gtq'
    expect(new TextDecoder().decode(desEcbDecrypt(b64ToBytes(enc), '38346591'))).toBe('https://aac.saavncdn.com/126/da7cde34b008294e181842062530546d_96.mp4')
  })
  it('rejects input that is not whole blocks', () => {
    expect(() => desEcbDecrypt(new Uint8Array(5), '38346591')).toThrow()
  })
})

describe('text helpers', () => {
  it('decodes entities', () => {
    expect(decodeEntities('Tum Hi Ho (From &quot;Aashiqui 2&quot;) &amp; more &#39;x&#39;')).toBe('Tum Hi Ho (From "Aashiqui 2") & more \'x\'')
  })
  it('parses durations', () => {
    expect(parseDuration('3:22')).toBe(202)
    expect(parseDuration('1:24:07')).toBe(5047)
    expect(parseDuration('LIVE')).toBe(0)
    expect(parseDuration(undefined)).toBe(0)
  })
  it('normalises titles but keeps meaningful edits apart', () => {
    expect(normTitle('Blinding Lights')).toBe('blinding lights')
    expect(normTitle('Tum Hi Ho (From "Aashiqui 2")')).toBe('tum hi ho')
    expect(normTitle('Bohemian Rhapsody - Remastered 2011')).toBe('bohemian rhapsody')
    expect(normTitle('Shape of You (feat. Someone)')).toBe('shape of you')
    expect(normTitle('Señorita')).toBe('senorita')
    expect(normTitle('Blinding Lights (Nightcore)')).not.toBe(normTitle('Blinding Lights'))
    expect(normTitle('Shape of You (Stormzy Remix)')).not.toBe(normTitle('Shape of You'))
  })
  it('turns music-video titles into song titles', () => {
    expect(songTitleFromVideo('Tarantino (Official Music Video)', 'LISA')).toBe('Tarantino')
    expect(songTitleFromVideo('Megan Thee Stallion - Lover Girl [Official Video]', 'Megan Thee Stallion')).toBe('Lover Girl')
    expect(songTitleFromVideo('The Weeknd - Blinding Lights (Official Video)', 'TheWeekndVEVO')).toBe('Blinding Lights')
    expect(songTitleFromVideo('Hello - Live at Wembley', 'Adele')).toBe('Hello - Live at Wembley')
    expect(songTitleFromVideo('Thin Ice - Tina Tuesday', 'Tina Tuesday')).toBe('Thin Ice')
    expect(songTitleFromVideo('Dai Dai', 'Shakira, Burna Boy')).toBe('Dai Dai')
  })
  it('splits artist credits', () => {
    expect([...artistSet('Sunrize, Aiden Music & Mr Demon')]).toEqual(['sunrize', 'aiden music', 'mr demon'])
    expect([...artistSet('Beyoncé feat. Jay-Z')]).toEqual(['beyonce', 'jay z'])
  })
})

describe('YouTube parsing', () => {
  it('parses YouTube Music song rows', () => {
    const rows = collect(ytmSongs, 'musicResponsiveListItemRenderer').map(parseSongRow)
    expect(rows.length).toBe(6)
    const first = rows[0]!
    expect(first).toMatchObject({ id: 'youtube:J7p4bzqLvCw', source: 'youtube', title: 'Blinding Lights', artist: 'The Weeknd', meta: 'Blinding Lights', duration: 202, youtubeId: 'J7p4bzqLvCw' })
    expect(first.artwork).toMatch(/^https:\/\/.*=w544-h544/)
    expect(rows[2]!.artist).toBe('Sunrize, Aiden Music, Mr Demon')
  })
  it('parses video results and skips ones without a length', () => {
    const vids = collect(ytVideos, 'videoRenderer').map(parseVideo).filter(Boolean)
    expect(vids[0]).toMatchObject({ id: 'youtube:B38CY-4Rd6s', duration: 5047, artwork: 'https://i.ytimg.com/vi/B38CY-4Rd6s/hqdefault.jpg' })
    expect(parseVideo({ videoId: 'abc', title: { runs: [{ text: 'Live now' }] } })).toBeNull()
  })
})

describe('JioSaavn parsing', () => {
  it('builds a direct 320kbps aac URL', () => {
    const t = saavnTrack((saavnSearch.results as SaavnSong[])[0])!
    expect(t).toMatchObject({ id: expect.stringMatching(/^saavn:/), source: 'saavn', title: 'Shape of You', artist: 'Ed Sheeran', duration: 233 })
    expect(t.streamUrl).toBe('https://aac.saavncdn.com/126/da7cde34b008294e181842062530546d_320.mp4')
    expect(t.artwork).toMatch(/-500x500\.jpg$/)
  })
  it('refuses URLs that are not on the saavn CDN', () => {
    expect(mediaUrl('not base64!!', true)).toBeNull()
  })
})

describe('matching', () => {
  const yt = song({ title: 'Shape of You', artist: 'Ed Sheeran', duration: 234 })
  it('matches the same recording across catalogs', () => {
    expect(matchScore(yt, song({ title: 'Shape of You', artist: 'Ed Sheeran', duration: 233 }))).toBe(1)
    expect(matchScore(song({ title: 'Tum Hi Ho', artist: 'Arijit Singh', duration: 262 }), song({ title: 'Tum Hi Ho (From "Aashiqui 2")', artist: 'Mithoon, Arijit Singh', duration: 261 }))).toBe(1)
  })
  it('rejects covers, remixes and other edits', () => {
    expect(matchScore(yt, song({ title: 'Shape of You', artist: 'Piyush Bhavnani', duration: 233 }))).toBe(0)
    expect(matchScore(yt, song({ title: 'Shape of You (Stormzy Remix)', artist: 'Ed Sheeran', duration: 233 }))).toBe(0)
    expect(matchScore(yt, song({ title: 'Shape of You', artist: 'Ed Sheeran', duration: 300 }))).toBe(0)
  })
  it('merges: YouTube order, JioSaavn stream when available, YouTube id kept as fallback', () => {
    const a = song({ id: 'youtube:a', youtubeId: 'a', title: 'Shape of You', artist: 'Ed Sheeran', duration: 234 })
    const b = song({ id: 'youtube:b', youtubeId: 'b', title: 'Obscure Song', artist: 'Nobody', duration: 100 })
    const s = song({ id: 'saavn:1', source: 'saavn', title: 'Shape of You', artist: 'Ed Sheeran', duration: 233, streamUrl: 'https://aac.saavncdn.com/x_320.mp4' })
    const merged = mergeSongs([a, b], [s])
    expect(merged.map((t) => t.id)).toEqual(['saavn:1', 'youtube:b'])
    expect(merged[0]).toMatchObject({ source: 'saavn', youtubeId: 'a', streamUrl: 'https://aac.saavncdn.com/x_320.mp4' })
  })
  it('collapses duplicate releases of the same recording', () => {
    const a = song({ id: 'youtube:a', title: 'Alors on danse (Radio Edit)', artist: 'Stromae', duration: 208 })
    const b = song({ id: 'youtube:b', title: 'Alors on danse (Radio Edit)', artist: 'Stromae', duration: 209 })
    const c = song({ id: 'youtube:c', title: 'Alors on danse (Extended Mix)', artist: 'Stromae', duration: 300 })
    expect(mergeSongs([a, b, c], []).map((t) => t.id)).toEqual(['youtube:a', 'youtube:c'])
  })
  it('finds the music video for a song', () => {
    const vids = [
      song({ title: 'Blinding Lights (Lyrics)', artist: 'Lyric Channel', duration: 202 }),
      song({ title: 'The Weeknd - Blinding Lights (Official Video)', artist: 'TheWeekndVEVO', duration: 262 }),
    ]
    expect(videoMatch({ title: 'Blinding Lights', artist: 'The Weeknd', duration: 202 }, vids)).toBe(vids[1])
  })
})
