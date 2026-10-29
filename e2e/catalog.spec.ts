import { expect, test, type Page } from '@playwright/test'

/**
 * Full-catalog search (YouTube Music + JioSaavn via the tunes-api Worker) and both players.
 * Runs in branded Chrome: JioSaavn serves AAC and YouTube needs codecs Playwright's Chromium lacks.
 */

type Peek = { backend: () => 'audio' | 'youtube'; time: () => number; paused: () => boolean }
const peek = <T,>(page: Page, fn: 'backend' | 'time' | 'paused') =>
  page.evaluate((f) => ((window as unknown as { __tunes?: Peek }).__tunes?.[f as keyof Peek]() ?? null) as T, fn)

async function expectAdvancing(page: Page, backend: 'audio' | 'youtube', min = 2, timeout = 45_000) {
  await expect.poll(() => peek<string>(page, 'backend'), { timeout }).toBe(backend)
  await expect.poll(() => peek<number>(page, 'time'), { timeout, intervals: [500] }).toBeGreaterThan(min)
  const a = await peek<number>(page, 'time')
  await page.waitForTimeout(1500)
  expect(await peek<number>(page, 'time')).toBeGreaterThan(a)
}

/** Types a query and leaves the box, which closes the suggestions. */
async function type(page: Page, q: string) {
  await page.getByTestId('search-input').fill(q)
  await page.getByTestId('search-input').blur()
}

/** Waits until no search is in flight, so result rows stop re-rendering. */
const settled = (page: Page) => expect(page.getByLabel('Searching')).toHaveCount(0, { timeout: 30_000 })

async function searchSongs(page: Page, q: string) {
  await page.goto('./')
  await type(page, q)
  await page.getByTestId('tab-songs').click()
  await expect(page).toHaveURL(/tab=songs/)
  const rows = page.getByTestId('song-tracks').getByRole('listitem')
  await expect(rows.first()).toBeVisible({ timeout: 30_000 })
  return rows
}

test('popular song: real result first, plays ad-free via JioSaavn in <audio>', async ({ page }) => {
  const rows = await searchSongs(page, 'shape of you ed sheeran')
  expect(await rows.count()).toBeGreaterThan(5)
  const first = rows.first()
  await expect(first).toContainText('Shape of You')
  await expect(first).toContainText('Ed Sheeran')
  await expect(first).toContainText('JioSaavn')
  await first.getByRole('button', { name: /^Play .* by / }).click()
  await expect(page.getByTestId('now-playing-title')).toHaveText('Shape of You')
  await expectAdvancing(page, 'audio')
  // Full track, not a preview.
  await expect.poll(() => page.evaluate(() => (document.getElementById('tunes-audio') as HTMLAudioElement).duration)).toBeGreaterThan(200)
  await expect(page.getByTestId('video-toggle')).toHaveCount(0)
})

test('song only on YouTube plays through the hidden YouTube player', async ({ page }) => {
  const rows = await searchSongs(page, 'fairuz habou baadon')
  const yt = rows.filter({ hasText: 'YouTube' }).first()
  await expect(yt).toBeVisible()
  await yt.getByRole('button', { name: /^Play .* by / }).click()
  await expectAdvancing(page, 'youtube')
  // Hidden by default; the toggle reveals the video.
  const host = page.locator('#tunes-youtube')
  await expect(host).toHaveAttribute('data-visible', 'false')
  await page.getByTestId('video-toggle').filter({ visible: true }).click()
  await expect(host).toHaveAttribute('data-visible', 'true')
  await expect(host).toBeInViewport()
  // Pause and resume work on the YouTube player too.
  await page.getByTestId('play-pause').filter({ visible: true }).click()
  await expect.poll(() => peek<boolean>(page, 'paused')).toBe(true)
  const t = await peek<number>(page, 'time')
  await page.waitForTimeout(1500)
  expect(await peek<number>(page, 'time')).toBeCloseTo(t, 0)
  await page.getByTestId('play-pause').filter({ visible: true }).click()
  await expectAdvancing(page, 'youtube', t + 0.5)
})

test('seeking works on a YouTube track', async ({ page }) => {
  const rows = await searchSongs(page, 'fairuz habou baadon')
  await rows.filter({ hasText: 'YouTube' }).first().getByRole('button', { name: /^Play .* by / }).click()
  await expectAdvancing(page, 'youtube', 1)
  await page.keyboard.press('Escape')
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight')
  await expect.poll(() => peek<number>(page, 'time')).toBeGreaterThan(55)
})

test('videos tab: any YouTube video plays', async ({ page }) => {
  await page.goto('./')
  await type(page, 'daft punk alive 2007 full concert')
  await page.getByTestId('tab-videos').click()
  const rows = page.getByTestId('video-tracks').getByRole('listitem')
  await expect(rows.first()).toBeVisible({ timeout: 30_000 })
  expect(await rows.count()).toBeGreaterThan(5)
  await rows.first().getByRole('button', { name: /^Play .* by / }).click()
  await expectAdvancing(page, 'youtube')
})

test('All tab shows songs and videos ahead of the other sources', async ({ page }) => {
  await page.goto('./')
  await type(page, 'daft punk')
  await expect(page.getByTestId('song-tracks').getByRole('listitem').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('video-tracks').getByRole('listitem').first()).toBeVisible({ timeout: 30_000 })
  const order = await page.locator('[data-testid^="results-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
  expect(order.slice(0, 2)).toEqual(['results-songs', 'results-videos'])
})

test('search suggestions: keyboard pick replaces the query', async ({ page }) => {
  await page.goto('./')
  const input = page.getByTestId('search-input')
  await input.click()
  await input.pressSequentially('blinding li', { delay: 40 })
  const list = page.getByTestId('search-suggestions')
  await expect(list.getByRole('option').first()).toBeVisible({ timeout: 15_000 })
  const firstText = (await list.getByRole('option').first().textContent())!.trim()
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(input).toHaveValue(firstText)
  await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(firstText).replace(/%20/g, '(%20|\\+)')}`))
  await expect(list).toHaveCount(0)
  // Escape with the list open closes it but keeps the query.
  await input.press('Backspace')
  await expect(list.getByRole('option').first()).toBeVisible({ timeout: 15_000 })
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

test('home shows today’s top songs and they play', async ({ page }) => {
  await page.goto('./')
  const rows = page.getByTestId('charts-list').getByRole('listitem')
  await expect(rows.first()).toBeVisible({ timeout: 30_000 })
  expect(await rows.count()).toBe(10)
  await rows.first().getByRole('button', { name: /^Play .* by / }).click()
  await expect.poll(() => peek<number>(page, 'time'), { timeout: 45_000 }).toBeGreaterThan(2)
})

test('JioSaavn stream failure falls back to the same song on YouTube', async ({ page }) => {
  await page.route(/saavncdn\.com\/.*\.mp4/, (r) => r.abort('failed'))
  const rows = await searchSongs(page, 'shape of you ed sheeran')
  const first = rows.first()
  await expect(first).toContainText('JioSaavn')
  await first.getByRole('button', { name: /^Play .* by / }).click()
  await expectAdvancing(page, 'youtube', 2, 60_000)
  await expect(page.getByTestId('now-playing-title')).toHaveText('Shape of You')
})

test('queue moves between JioSaavn and YouTube tracks', async ({ page }) => {
  const rows = await searchSongs(page, 'queen bohemian rhapsody')
  const saavn = rows.filter({ hasText: 'JioSaavn' }).first()
  await expect(saavn).toBeVisible()
  await saavn.getByRole('button', { name: /^Play .* by / }).click()
  await expectAdvancing(page, 'audio')

  // Queue a YouTube-only video next and skip to it.
  await type(page, 'daft punk alive 2007 full concert')
  await page.getByTestId('tab-videos').click()
  const vid = page.getByTestId('video-tracks').getByRole('listitem').first()
  await expect(vid).toBeVisible({ timeout: 30_000 })
  await settled(page)
  await vid.hover()
  await vid.getByRole('button', { name: /^More options/ }).click()
  await page.getByRole('menuitem', { name: 'Play next' }).click()
  await page.getByTestId('next').filter({ visible: true }).click()
  await expectAdvancing(page, 'youtube')
  expect(await page.evaluate(() => (document.getElementById('tunes-audio') as HTMLAudioElement).paused)).toBe(true)

  // And back.
  await page.getByRole('button', { name: 'Previous' }).filter({ visible: true }).click()
  await page.getByRole('button', { name: 'Previous' }).filter({ visible: true }).click()
  await expectAdvancing(page, 'audio')
})

test('liked YouTube track survives reload and resumes', async ({ page }) => {
  const rows = await searchSongs(page, 'fairuz habou baadon')
  const yt = rows.filter({ hasText: 'YouTube' }).first()
  await yt.hover()
  await yt.getByRole('button', { name: 'Add to Liked' }).click()
  await yt.getByRole('button', { name: /^Play .* by / }).click()
  await expectAdvancing(page, 'youtube', 6)
  await page.waitForTimeout(5500) // resume position is saved every 5 s
  await page.reload()
  await expect(page.getByTestId('sidebar-playlists')).toContainText('1 track')
  await page.getByTestId('play-pause').filter({ visible: true }).click()
  await expect.poll(() => peek<string>(page, 'backend'), { timeout: 30_000 }).toBe('youtube')
  await expect.poll(() => peek<number>(page, 'time'), { timeout: 45_000 }).toBeGreaterThan(5)
})

test('auto-advance from a JioSaavn track into a YouTube video, no click needed', async ({ page }) => {
  const rows = await searchSongs(page, 'shape of you ed sheeran')
  await rows.first().getByRole('button', { name: /^Play .* by / }).click()
  await expectAdvancing(page, 'audio')

  await type(page, 'daft punk alive 2007 full concert')
  await page.getByTestId('tab-videos').click()
  const vid = page.getByTestId('video-tracks').getByRole('listitem').first()
  await expect(vid).toBeVisible({ timeout: 30_000 })
  await settled(page)
  await vid.hover()
  await vid.getByRole('button', { name: /^More options/ }).click()
  await page.getByRole('menuitem', { name: 'Play next' }).click()

  // Jump to the last seconds and let the track end on its own.
  await page.evaluate(() => {
    const a = document.getElementById('tunes-audio') as HTMLAudioElement
    a.currentTime = a.duration - 2
  })
  await expectAdvancing(page, 'youtube', 2, 60_000)
})
