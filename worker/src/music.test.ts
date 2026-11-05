// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { bestImage, toCard, toTrack } from './music'

describe('YouTube.js mapping', () => {
  it('maps a song with artists and album', () => {
    const t = toTrack({
      id: 'RmYCOm4ehKs',
      title: { text: 'Save Your Tears' },
      artists: [{ name: 'The Weeknd', channel_id: 'UClYV6hHlupm_S_ObS1W-DYw' }],
      album: { id: 'MPREb_TH6Wut5eTMQ', name: 'After Hours' },
      duration: { seconds: 216 },
      thumbnail: [{ url: 'https://yt3.googleusercontent.com/x=w120-h120-l90-rj', width: 120 }, { url: 'https://yt3.googleusercontent.com/x=w60-h60-l90-rj', width: 60 }],
    })!
    expect(t).toMatchObject({ id: 'youtube:RmYCOm4ehKs', title: 'Save Your Tears', artist: 'The Weeknd', duration: 216, meta: 'After Hours', artistId: 'UClYV6hHlupm_S_ObS1W-DYw', albumId: 'MPREb_TH6Wut5eTMQ', youtubeId: 'RmYCOm4ehKs' })
    expect(t.artwork).toBe('https://yt3.googleusercontent.com/x=w544-h544-l90-rj')
  })
  it('fills album tracks from the album page (they carry no artist or artwork)', () => {
    const t = toTrack({ id: 'v9j_blPbiUk', title: 'Give Life Back to Music', duration: { seconds: 276 } }, { artist: 'Daft Punk', artistId: 'UCRr1xG_2WIDs18a6cIiCxeA', album: 'RAM', albumId: 'MPREb_x', artwork: 'https://a/b.jpg' })!
    expect(t).toMatchObject({ artist: 'Daft Punk', artistId: 'UCRr1xG_2WIDs18a6cIiCxeA', meta: 'RAM', albumId: 'MPREb_x', artwork: 'https://a/b.jpg' })
  })
  it('drops items without a valid video id', () => {
    expect(toTrack({ id: 'nope', title: 'x' })).toBeNull()
    expect(toTrack(null)).toBeNull()
  })
  it('maps cards and picks the largest image', () => {
    expect(toCard({ id: 'MPREb_1', title: { text: 'Discovery' }, subtitle: { text: '2001' }, thumbnail: [{ url: 'https://i/s=w120-h120', width: 120 }, { url: 'https://i/s=w544-h544', width: 544 }] }, 'album')).toEqual({ id: 'MPREb_1', kind: 'album', title: 'Discovery', subtitle: '2001', artwork: 'https://i/s=w544-h544' })
    expect(bestImage({ contents: [{ url: 'http://insecure', width: 900 }] })).toBeUndefined()
  })
})
