import { describe, expect, it } from 'vitest'
import { parseInvidious } from '../../worker/src/invidious'
import { activeLine, lyricsQuery, parseLrc } from './lyrics'
import { pickFormat, saavnQuality } from './streams'
import { playlistIdFrom } from './catalog'

const host = 'yt.example.org'
const fmt = (itag: number, type: string, extra = '') => ({ itag: String(itag), type, bitrate: String(itag * 1000), url: `/videoplayback?expire=1793909554&itag=${itag}${extra}&host=rr1---sn.googlevideo.com` })

describe('parseInvidious', () => {
  const data = {
    title: 'T',
    author: 'A',
    lengthSeconds: 201,
    adaptiveFormats: [
      fmt(140, 'audio/mp4; codecs="mp4a.40.2"'),
      fmt(251, 'audio/webm; codecs="opus"'),
      fmt(251, 'audio/webm; codecs="opus"', '&xtags=acont%3Ddubbed%3Alang%3Dfr'),
      fmt(250, 'audio/webm; codecs="opus"', '&xtags=drc%3D1'),
      fmt(137, 'video/mp4; codecs="avc1"'),
      { itag: '139', type: 'audio/mp4', url: 'https://rr1---sn.googlevideo.com/videoplayback?itag=139' },
    ],
  }
  it('keeps proxied, original-language, non-DRC audio and makes URLs absolute', () => {
    const s = parseInvidious(host, 'abcdefghijk', data)!
    expect(s.instance).toBe(host)
    expect(s.duration).toBe(201)
    expect(s.expires).toBe(1793909554)
    expect(s.formats.map((f) => f.itag)).toEqual([140, 251])
    expect(s.formats.every((f) => f.url.startsWith(`https://${host}/videoplayback?`))).toBe(true)
  })
  it('rejects live streams, errors and video-only answers', () => {
    expect(parseInvidious(host, 'x', { ...data, liveNow: true })).toBeNull()
    expect(parseInvidious(host, 'x', { error: 'This content isn’t available' })).toBeNull()
    expect(parseInvidious(host, 'x', { adaptiveFormats: [fmt(137, 'video/mp4')] })).toBeNull()
    expect(parseInvidious(host, 'x', null)).toBeNull()
  })
})

describe('format and quality choice', () => {
  const formats = [139, 140, 249, 250, 251].map((itag) => ({ itag, mime: itag < 200 ? 'audio/mp4' : 'audio/webm; codecs="opus"', bitrate: itag, url: `u${itag}` }))
  it('prefers Opus where supported, AAC elsewhere', () => {
    expect(pickFormat(formats, 'high', true).itag).toBe(251)
    expect(pickFormat(formats, 'high', false).itag).toBe(140)
    expect(pickFormat(formats, 'saver', true).itag).toBe(249)
    expect(pickFormat(formats, 'saver', false).itag).toBe(139)
  })
  it('falls back to whatever plays when preferred itags are missing', () => {
    expect(pickFormat([{ itag: 600, mime: 'audio/webm', bitrate: 1, url: 'x' }, { itag: 599, mime: 'audio/mp4', bitrate: 2, url: 'y' }], 'high', false).itag).toBe(599)
  })
  it('rewrites JioSaavn bitrates', () => {
    expect(saavnQuality('https://aac.saavncdn.com/1/x_320.mp4', 'high')).toBe('https://aac.saavncdn.com/1/x_320.mp4')
    expect(saavnQuality('https://aac.saavncdn.com/1/x_320.mp4', 'normal')).toBe('https://aac.saavncdn.com/1/x_160.mp4')
    expect(saavnQuality('https://aac.saavncdn.com/1/x_160.mp4', 'saver')).toBe('https://aac.saavncdn.com/1/x_96.mp4')
  })
})

describe('lyrics', () => {
  it('parses LRC, including repeated timestamps and metadata', () => {
    const lines = parseLrc('[ar: Someone]\n[00:13.13] Yeah\n[00:16.5]\n[01:02.345][02:00.00] Chorus')
    expect(lines).toEqual([
      { at: 13.13, text: 'Yeah' },
      { at: 16.5, text: '' },
      { at: 62.345, text: 'Chorus' },
      { at: 120, text: 'Chorus' },
    ])
  })
  it('finds the line being sung', () => {
    const lines = [{ at: 10 }, { at: 20 }, { at: 30 }]
    expect(activeLine(lines, 5)).toBe(-1)
    expect(activeLine(lines, 9.9)).toBe(0) // a hair early feels in time
    expect(activeLine(lines, 25)).toBe(1)
    expect(activeLine(lines, 99)).toBe(2)
  })
  it('cleans titles and artists for the lookup', () => {
    expect(lyricsQuery({ title: 'Blinding Lights (Official Video)', artist: 'The Weeknd' })).toEqual({ title: 'Blinding Lights', artist: 'The Weeknd' })
    expect(lyricsQuery({ title: 'Stay (feat. Justin Bieber)', artist: 'The Kid LAROI, Justin Bieber' })).toEqual({ title: 'Stay', artist: 'The Kid LAROI' })
  })
})

describe('playlistIdFrom', () => {
  it('accepts ids and pasted links', () => {
    expect(playlistIdFrom('https://music.youtube.com/playlist?list=PL4fGSI1pDJn6t3TXLGiiJdD-sZbrG3tG0')).toBe('PL4fGSI1pDJn6t3TXLGiiJdD-sZbrG3tG0')
    expect(playlistIdFrom('https://www.youtube.com/watch?v=abc&list=OLAK5uy_kNWGJvgWVqlt5LsFDL9Sdluly4M8TvGkM')).toBe('OLAK5uy_kNWGJvgWVqlt5LsFDL9Sdluly4M8TvGkM')
    expect(playlistIdFrom('VLPL4fGSI1pDJn6t3TXLGiiJdD-sZbrG3tG0')).toBe('PL4fGSI1pDJn6t3TXLGiiJdD-sZbrG3tG0')
    expect(playlistIdFrom('https://example.com/?list=<script>')).toBeNull()
    expect(playlistIdFrom('hello')).toBeNull()
  })
})
