import { afterEach, describe, expect, it, vi } from 'vitest'
import { youTubeId } from '../audio/youtube'
import { searchSongs } from './catalog'

const api = (items: unknown[]) => vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items }), { status: 200 }))

afterEach(() => vi.restoreAllMocks())

describe('catalog API client', () => {
  it('keeps well-formed tracks and folds the explicit flag into meta', async () => {
    api([
      { id: 'saavn:1', source: 'saavn', title: 'A', artist: 'B', duration: 200, streamUrl: 'https://aac.saavncdn.com/x_320.mp4', isLive: false, meta: 'Album', youtubeId: 'J7p4bzqLvCw', explicit: true },
      { id: 'youtube:J7p4bzqLvCw', source: 'youtube', title: 'C', artist: 'D', duration: 100, streamUrl: 'https://www.youtube.com/watch?v=J7p4bzqLvCw', isLive: false, youtubeId: 'J7p4bzqLvCw' },
    ])
    const out = await searchSongs('q')
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ id: 'saavn:1', source: 'saavn', title: 'A', artist: 'B', duration: 200, streamUrl: 'https://aac.saavncdn.com/x_320.mp4', isLive: false, meta: 'Explicit · Album', youtubeId: 'J7p4bzqLvCw' })
    expect(out[1].meta).toBeUndefined()
  })

  it('drops anything unsafe or unplayable', async () => {
    api([
      { id: 'x:1', source: 'audius', title: 'wrong source', artist: '', duration: 1, streamUrl: 'https://a', isLive: false },
      { id: 'saavn:2', source: 'saavn', title: 'insecure', artist: '', duration: 1, streamUrl: 'http://aac.saavncdn.com/x.mp4', isLive: false },
      { id: 'youtube:x', source: 'youtube', title: 'no id', artist: '', duration: 1, streamUrl: 'https://www.youtube.com/watch?v=x', isLive: false },
      { id: 'youtube:y', source: 'youtube', title: 'bad id', artist: '', duration: 1, streamUrl: 'https://www.youtube.com/watch?v=y', isLive: false, youtubeId: '"><script>' },
    ])
    expect(await searchSongs('q')).toEqual([])
  })

  it('surfaces API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":"x"}', { status: 502 }))
    await expect(searchSongs('q')).rejects.toThrow(/HTTP 502/)
  })
})

describe('youTubeId', () => {
  it('extracts ids from the URL shapes we store', () => {
    expect(youTubeId('https://www.youtube.com/watch?v=J7p4bzqLvCw')).toBe('J7p4bzqLvCw')
    expect(youTubeId('https://music.youtube.com/watch?v=-JRUbrVCHZM&list=x')).toBe('-JRUbrVCHZM')
    expect(youTubeId('https://youtu.be/4NRXx6U8ABQ')).toBe('4NRXx6U8ABQ')
    expect(youTubeId('J7p4bzqLvCw')).toBe('J7p4bzqLvCw')
    expect(youTubeId('https://www.youtube.com/watch?v=short')).toBe('')
  })
})
