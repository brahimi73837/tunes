import { expect, test, type Page } from '@playwright/test'

/**
 * Full catalog (YouTube Music + JioSaavn via the tunes-api Worker) and the playback engine.
 * Runs in branded Chrome: JioSaavn serves AAC and YouTube needs codecs Playwright's Chromium lacks.
 *
 * Where the sound comes from ("via"):
 *   saavn  – a JioSaavn file in our <audio>        (ad-free)
 *   proxy  – YouTube audio through an Invidious proxy, in our <audio>   (ad-free)
 *   player – YouTube's own IFrame player            (last resort; may show ads)
 */

type Peek = { backend: () => 'audio' | 'youtube'; time: () => number; paused: () => boolean }
const peek = <T,>(page: Page, fn: keyof Peek) =>
  page.evaluate((f) => ((window as unknown as { __tunes?: Peek }).__tunes?.[f as keyof Peek]() ?? null) as T, fn)

type Via = 'saavn' | 'proxy' | 'player' | 'other'
const via = (page: Page) =>
  page.evaluate((): string => {
    const t = (window as unknown as { __tunes?: Peek }).__tunes
    if (t?.backend() === 'youtube') return 'player'
    const src = (document.getElementById('tunes-audio') as HTMLAudioElement | null)?.currentSrc ?? ''
    if (!src) return 'other'
    const u = new URL(src)
    if (u.host.endsWith('saavncdn.com')) return 'saavn'
    if (u.pathname.startsWith('/videoplayback')) return 'proxy'
    return 'other'
  }) as Promise<Via>

async function expectAdvancing(page: Page, from: Via | Via[], min = 2, timeout = 45_000) {
  const want = Array.isArray(from) ? from : [from]
  await expect.poll(async () => want.includes(await via(page)), { timeout, message: `playing via ${want.join('/')}` }).toBe(true)
  await expect.poll(() => peek<number>(page, 'time'), { timeout, intervals: [500] }).toBeGreaterThan(min)
  // Still moving (a far seek can take a few seconds to buffer).
  const a = await peek<number>(page, 'time')
  await expect.poll(() => peek<number>(page, 'time'), { timeout: 20_000 }).toBeGreaterThan(a + 0.5)
}

/** Types a query and leaves the box, which closes the suggestions. */
async function type(page: Page, q: string) {
  await page.getByTestId('search-input').fill(q)
  await page.getByTestId('search-input').blur()
}

/** Waits until no search is in flight, so result rows stop re-rendering. */
const settled = (page: Page) => expect(page.getByLabel('Searching')).toHaveCount(0, { timeout: 30_000 })

async function searchTab(page: Page, q: string, tab: 'songs' | 'videos' | 'artists' | 'albums') {
  await page.goto('./')
  await type(page, q)
  await page.getByTestId(`tab-${tab}`).click()
  await expect(page).toHaveURL(new RegExp(`tab=${tab}`))
}

async function searchSongs(page: Page, q: string) {
  await searchTab(page, q, 'songs')
  const rows = page.getByTestId('song-tracks').getByRole('listitem')
  await expect(rows.first()).toBeVisible({ timeout: 30_000 })
  return rows
}

/** Searches without leaving the page (a fresh page load would stop playback). */
async function searchInPlace(page: Page, q: string, tab: 'songs' | 'videos') {
  await type(page, q)
  await page.getByTestId(`tab-${tab}`).click()
  const rows = page.getByTestId(tab === 'songs' ? 'song-tracks' : 'video-tracks').getByRole('listitem')
  await expect(rows.first()).toBeVisible({ timeout: 30_000 })
  await settled(page)
  return rows
}

async function searchVideos(page: Page, q: string) {
  await searchTab(page, q, 'videos')
  const rows = page.getByTestId('video-tracks').getByRole('listitem')
  await expect(rows.first()).toBeVisible({ timeout: 30_000 })
  await settled(page)
  return rows
}

const playRow = (row: ReturnType<Page['getByRole']>) => row.getByRole('button', { name: /^Play .* by / }).click()

async function queueNext(page: Page, row: ReturnType<Page['getByRole']>) {
  await row.hover()
  await row.getByRole('button', { name: /^More options/ }).click()
  await page.getByRole('menuitem', { name: 'Play next' }).click()
}

const VIDEO_QUERY = 'daft punk alive 2007 full concert'

test('popular song: real result first, plays ad-free via JioSaavn in <audio>', async ({ page }) => {
  const rows = await searchSongs(page, 'shape of you ed sheeran')
  expect(await rows.count()).toBeGreaterThan(5)
  const first = rows.first()
  await expect(first).toContainText('Shape of You')
  await expect(first).toContainText('Ed Sheeran')
  await expect(first).toContainText('JioSaavn')
  await playRow(first)
  await expect(page.getByTestId('now-playing-title')).toHaveText(/^shape of you$/i)
  await expectAdvancing(page, 'saavn')
  // Full track, not a preview.
  await expect.poll(() => page.evaluate(() => (document.getElementById('tunes-audio') as HTMLAudioElement).duration)).toBeGreaterThan(200)
  await expect(page.getByTestId('video-toggle')).toHaveCount(0)
})

test('any YouTube video plays ad-free through a proxy in our own <audio> — no YouTube player', async ({ page }) => {
  const rows = await searchVideos(page, VIDEO_QUERY)
  expect(await rows.count()).toBeGreaterThan(5)
  await playRow(rows.first())
  await expectAdvancing(page, 'proxy')
  expect(await peek<string>(page, 'backend')).toBe('audio')
  await expect(page.locator('#tunes-youtube iframe')).toHaveCount(0)
  // Pause / resume.
  await page.getByTestId('play-pause').filter({ visible: true }).click()
  await expect.poll(() => peek<boolean>(page, 'paused')).toBe(true)
  const t = await peek<number>(page, 'time')
  await page.waitForTimeout(1200)
  expect(await peek<number>(page, 'time')).toBeCloseTo(t, 1)
  await page.getByTestId('play-pause').filter({ visible: true }).click()
  await expectAdvancing(page, 'proxy', t + 0.5)
})

test('song only on YouTube plays ad-free (JioSaavn copy or proxy), never the YouTube player', async ({ page }) => {
  const rows = await searchSongs(page, 'fairuz habou baadon')
  const yt = rows.filter({ hasText: 'YouTube' }).first()
  await expect(yt).toBeVisible()
  await playRow(yt)
  await expectAdvancing(page, ['saavn', 'proxy'])
})

test('seeking works on proxied YouTube audio', async ({ page }) => {
  const rows = await searchVideos(page, VIDEO_QUERY)
  await playRow(rows.first())
  await expectAdvancing(page, 'proxy', 1)
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight')
  await expect.poll(() => peek<number>(page, 'time')).toBeGreaterThan(110)
  await expectAdvancing(page, 'proxy', 110)
})

test('proxy server failure: switches to another server and keeps the position', async ({ page }) => {
  const rows = await searchVideos(page, VIDEO_QUERY)
  await playRow(rows.first())
  await expectAdvancing(page, 'proxy', 3)
  const first = await page.evaluate(() => new URL((document.getElementById('tunes-audio') as HTMLAudioElement).currentSrc).host)
  const at = await peek<number>(page, 'time')
  // That server dies mid-song.
  await page.route((u) => u.host === first, (r) => r.abort('failed'))
  await page.evaluate(() => {
    const a = document.getElementById('tunes-audio') as HTMLAudioElement
    a.currentTime = a.currentTime + 600 // force a fresh range request to the dead server
  })
  await expect.poll(() => page.evaluate(() => new URL((document.getElementById('tunes-audio') as HTMLAudioElement).currentSrc).host), { timeout: 45_000 }).not.toBe(first)
  await expectAdvancing(page, ['proxy', 'player'], at, 45_000)
})

test('no ad-free stream at all: YouTube player as last resort, or skip when that is turned off', async ({ page }) => {
  // Every Invidious server and the Worker's stream lookup are unreachable.
  await page.route(/\/api\/v1\/videos\/|\/v1\/streams\?/, (r) => r.abort('failed'))
  const rows = await searchVideos(page, VIDEO_QUERY)
  await playRow(rows.first())
  await expectAdvancing(page, 'player', 2, 60_000)

  // Settings → turn the YouTube player off: the same video is now skipped with a message.
  await page.getByTestId('settings-link').click()
  await page.getByTestId('setting-yt-fallback').uncheck({ force: true })
  await expect(page.getByTestId('setting-yt-fallback')).not.toBeChecked()
  await page.getByTestId('play-pause').filter({ visible: true }).click() // pause
  await page.goBack()
  const again = page.getByTestId('video-tracks').getByRole('listitem').first()
  await expect(again).toBeVisible({ timeout: 30_000 })
  await playRow(again)
  await expect(page.getByTestId('toasts')).toContainText(/Couldn.t play|Skipped/, { timeout: 60_000 })
  expect(await peek<boolean>(page, 'paused')).toBe(true)
})

test('JioSaavn stream failure falls back to the same song from YouTube, ad-free', async ({ page }) => {
  await page.route(/saavncdn\.com\/.*\.mp4/, (r) => r.abort('failed'))
  const rows = await searchSongs(page, 'shape of you ed sheeran')
  const first = rows.first()
  await expect(first).toContainText('JioSaavn')
  await playRow(first)
  await expectAdvancing(page, 'proxy', 2, 60_000)
  await expect(page.getByTestId('now-playing-title')).toHaveText(/^shape of you$/i)
})

test('All tab: songs first, then artists and albums, then videos', async ({ page }) => {
  await page.goto('./')
  await type(page, 'daft punk')
  await expect(page.getByTestId('song-tracks').getByRole('listitem').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('artist-results').getByTestId('artist-card').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('video-tracks').getByRole('listitem').first()).toBeVisible({ timeout: 30_000 })
  const order = await page.locator('[data-testid^="results-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
  expect(order.indexOf('results-songs')).toBe(0)
  expect(order.indexOf('results-artists')).toBeLessThan(order.indexOf('results-videos'))
  expect(order.indexOf('results-videos')).toBeLessThan(order.indexOf('results-audius'))
})

test('artist page: from a search result to top songs, albums and similar artists', async ({ page }) => {
  await searchTab(page, 'daft punk', 'artists')
  const card = page.getByTestId('artist-results').getByTestId('artist-card').first()
  await expect(card).toContainText('Daft Punk', { timeout: 30_000 })
  await card.click()
  await expect(page).toHaveURL(/#\/artist\/UC/)
  await expect(page.getByTestId('collection-title')).toHaveText('Daft Punk', { timeout: 30_000 })
  await expect(page.getByTestId('artist-songs').getByRole('listitem').first()).toBeVisible()
  await expect(page.getByTestId('artist-albums').getByTestId('album-card').first()).toBeVisible()
  await expect(page.getByTestId('artist-related').getByTestId('artist-card').first()).toBeVisible()
  // Play the top songs.
  await page.getByTestId('play-all').click()
  await expectAdvancing(page, ['saavn', 'proxy'])
  // Open an album from the artist page.
  await page.getByTestId('artist-albums').getByTestId('album-card').first().click()
  await expect(page).toHaveURL(/#\/yt-album\/MPREb_/)
  await expect(page.getByTestId('album-tracks').getByRole('listitem').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('album-artist')).toHaveText('Daft Punk')
})

test('album page: play, save to library, and artist link in track rows', async ({ page }) => {
  await searchTab(page, 'random access memories daft punk', 'albums')
  const card = page.getByTestId('album-results').getByTestId('album-card').first()
  await expect(card).toBeVisible({ timeout: 30_000 })
  await card.click()
  const tracks = page.getByTestId('album-tracks').getByRole('listitem')
  await expect(tracks.first()).toBeVisible({ timeout: 30_000 })
  expect(await tracks.count()).toBeGreaterThan(8)
  await page.getByTestId('save-collection').click()
  await expect(page.getByTestId('sidebar-playlists')).toContainText(/Random Access Memories/)
  await page.getByTestId('play-all').click()
  await expectAdvancing(page, ['saavn', 'proxy'])
  await tracks.first().getByTestId('artist-link').click()
  await expect(page).toHaveURL(/#\/artist\/UC/)
})

test('start radio from a song fills the queue with similar songs', async ({ page }) => {
  const rows = await searchSongs(page, 'blinding lights the weeknd')
  const row = rows.first()
  await row.hover()
  await row.getByRole('button', { name: /^More options/ }).click()
  await page.getByRole('menuitem', { name: 'Start radio' }).click()
  await expectAdvancing(page, ['saavn', 'proxy'])
  await page.getByRole('button', { name: 'Queue', exact: true }).click()
  await expect.poll(() => page.getByTestId('queue-item').count(), { timeout: 20_000 }).toBeGreaterThan(10)
})

test('autoplay: when the queue ends, similar songs keep playing', async ({ page }) => {
  const rows = await searchSongs(page, 'shape of you ed sheeran')
  await playRow(rows.first())
  await expectAdvancing(page, 'saavn')
  // Playing a search result queues the whole list; clear it so this is the last song.
  await page.getByRole('button', { name: 'Queue', exact: true }).click()
  await page.getByTestId('clear-queue').click()
  await expect(page.getByTestId('queue-item')).toHaveCount(1)
  await page.evaluate(() => {
    const a = document.getElementById('tunes-audio') as HTMLAudioElement
    a.currentTime = a.duration - 2
  })
  await expect(page.getByTestId('now-playing-title')).not.toHaveText(/^shape of you$/i, { timeout: 60_000 })
  await expect.poll(() => page.getByTestId('queue-item').count(), { timeout: 20_000 }).toBeGreaterThan(5)
  // The new song's clock starts over (the old one ended at ~233 s).
  await expect.poll(() => peek<number>(page, 'time'), { timeout: 60_000 }).toBeLessThan(120)
  await expectAdvancing(page, ['saavn', 'proxy'], 1, 60_000)
})

test('lyrics: synced lines follow the song', async ({ page }) => {
  const rows = await searchSongs(page, 'blinding lights the weeknd')
  await playRow(rows.first())
  await expectAdvancing(page, ['saavn', 'proxy'])
  await page.getByTestId('lyrics-button').click()
  const lyrics = page.getByTestId('lyrics').filter({ visible: true })
  await expect(lyrics).toContainText('tryna call', { timeout: 20_000 })
  await expect(lyrics).toContainText('synced')
  // Clicking a line seeks there, and that line becomes the current one.
  const line = lyrics.getByRole('button', { name: /I've been tryna call/ }).first()
  await line.click()
  await expect(line).toHaveAttribute('aria-current', 'true', { timeout: 10_000 })
  expect(await peek<number>(page, 'time')).toBeGreaterThan(20)
})

test('import a YouTube Music playlist by link, then save it', async ({ page }) => {
  await page.goto('./#/library')
  await page.getByTestId('import-youtube').click()
  await page.getByRole('dialog').getByRole('textbox').fill('https://music.youtube.com/playlist?list=PL4fGSI1pDJn6t3TXLGiiJdD-sZbrG3tG0')
  await page.getByRole('dialog').getByRole('button', { name: 'Open' }).click()
  await expect(page).toHaveURL(/#\/yt-playlist\/PL4fGSI1pDJn6t3TXLGiiJdD-sZbrG3tG0/)
  const rows = page.getByTestId('yt-playlist-tracks').getByRole('listitem')
  await expect(rows.first()).toBeVisible({ timeout: 30_000 })
  expect(await rows.count()).toBeGreaterThan(50)
  await page.getByTestId('save-collection').click()
  await expect(page.getByTestId('sidebar-playlists')).toContainText('Daily Top Music Videos')
})

test('settings: data-saver quality picks a smaller stream', async ({ page }) => {
  await page.goto('./#/settings')
  await page.getByTestId('quality-saver').click()
  await expect(page.getByTestId('quality-saver')).toHaveAttribute('aria-checked', 'true')
  const rows = await searchSongs(page, 'shape of you ed sheeran')
  await playRow(rows.first())
  await expectAdvancing(page, 'saavn')
  expect(await page.evaluate(() => (document.getElementById('tunes-audio') as HTMLAudioElement).currentSrc)).toMatch(/_96\.mp4$/)
})

test('search suggestions: keyboard pick replaces the query', async ({ page }) => {
  await page.goto('./')
  const input = page.getByTestId('search-input')
  await input.click()
  await input.fill('blinding li')
  const list = page.getByTestId('search-suggestions')
  await expect(list.getByRole('option').first()).toBeVisible({ timeout: 15_000 })
  // Arrow keys keep the list open (it otherwise closes itself once typing pauses).
  await input.press('ArrowDown')
  const firstText = (await list.getByRole('option', { selected: true }).textContent())!.trim()
  await input.press('Enter')
  await expect(input).toHaveValue(firstText)
  await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(firstText).replace(/%20/g, '(%20|\\+)')}`))
  await expect(list).toHaveCount(0)
  // Escape with the list open closes it but keeps the query.
  await input.press('Backspace')
  await expect(list.getByRole('option').first()).toBeVisible({ timeout: 15_000 })
  await input.press('ArrowDown')
  await input.press('Escape')
  await expect(list).toHaveCount(0)
  await expect(input).toHaveValue(firstText.slice(0, -1))
  await expect(input).toBeFocused()
})

test('suggestions get out of the way once typing pauses, so tabs are clickable', async ({ page }) => {
  await page.goto('./')
  const input = page.getByTestId('search-input')
  await input.click()
  await input.pressSequentially('daft pu', { delay: 40 })
  await expect(page.getByTestId('search-suggestions')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('search-suggestions')).toHaveCount(0, { timeout: 5_000 })
  await expect(input).toBeFocused()
  await page.getByTestId('tab-songs').click({ timeout: 2_000 })
  await expect(page).toHaveURL(/tab=songs/)
})

test('home shows today’s top songs, and a mix based on what you played', async ({ page }) => {
  await page.goto('./')
  const rows = page.getByTestId('charts-list').getByRole('listitem')
  await expect(rows.first()).toBeVisible({ timeout: 30_000 })
  expect(await rows.count()).toBe(10)
  await playRow(rows.first())
  await expectAdvancing(page, ['saavn', 'proxy'])
  await expect(page.getByTestId('home-mix').getByRole('listitem').first()).toBeVisible({ timeout: 30_000 })
})

test('queue moves between JioSaavn files and proxied YouTube audio', async ({ page }) => {
  const rows = await searchSongs(page, 'queen bohemian rhapsody')
  const saavn = rows.filter({ hasText: 'JioSaavn' }).first()
  await expect(saavn).toBeVisible()
  await playRow(saavn)
  await expectAdvancing(page, 'saavn')

  const vids = await searchInPlace(page, VIDEO_QUERY, 'videos')
  await queueNext(page, vids.first())
  await page.getByTestId('next').filter({ visible: true }).click()
  await expectAdvancing(page, 'proxy')

  await page.getByRole('button', { name: 'Previous' }).filter({ visible: true }).click()
  await page.getByRole('button', { name: 'Previous' }).filter({ visible: true }).click()
  await expectAdvancing(page, 'saavn')
})

test('auto-advance from a JioSaavn track into a YouTube video, no click needed', async ({ page }) => {
  const rows = await searchSongs(page, 'shape of you ed sheeran')
  await playRow(rows.first())
  await expectAdvancing(page, 'saavn')
  const vids = await searchInPlace(page, VIDEO_QUERY, 'videos')
  await queueNext(page, vids.first())
  // Jump to the last seconds and let the track end on its own.
  await page.evaluate(() => {
    const a = document.getElementById('tunes-audio') as HTMLAudioElement
    a.currentTime = a.duration - 2
  })
  await expectAdvancing(page, 'proxy', 2, 60_000)
})

test('liked YouTube video survives reload and resumes where it was', async ({ page }) => {
  const rows = await searchVideos(page, VIDEO_QUERY)
  const row = rows.first()
  await row.hover()
  await row.getByRole('button', { name: 'Add to Liked' }).click()
  await playRow(row)
  await expectAdvancing(page, 'proxy', 6)
  await page.waitForTimeout(5500) // resume position is saved every 5 s
  await page.reload()
  await expect(page.getByTestId('sidebar-playlists')).toContainText('1 track')
  await page.getByTestId('play-pause').filter({ visible: true }).click()
  await expect.poll(() => via(page), { timeout: 30_000 }).toBe('proxy')
  await expect.poll(() => peek<number>(page, 'time'), { timeout: 45_000 }).toBeGreaterThan(5)
})
