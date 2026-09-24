import { expect, test, type Page } from '@playwright/test'

const audioTime = (page: Page) => page.evaluate(() => (document.getElementById('tunes-audio') as HTMLAudioElement | null)?.currentTime ?? 0)

/** Waits until the shared <audio> element has actually advanced past `min` seconds. */
async function expectAudioAdvancing(page: Page, min = 2, timeout = 45_000) {
  await expect.poll(() => audioTime(page), { timeout, intervals: [500] }).toBeGreaterThan(min)
  const a = await audioTime(page)
  await page.waitForTimeout(1500)
  expect(await audioTime(page)).toBeGreaterThan(a)
}

async function search(page: Page, q: string, tab: 'audius' | 'archive' | 'radio') {
  await page.goto('./')
  await page.getByTestId('search-input').fill(q)
  await page.getByTestId(`tab-${tab}`).click()
  await expect(page).toHaveURL(new RegExp(`tab=${tab}`))
}

test('home renders trending, genres and radio picks', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByTestId('trending-list').getByRole('listitem').first()).toBeVisible()
  await expect(page.getByTestId('genre-tile').first()).toBeVisible()
  await expect(page.getByTestId('home-radio').getByTestId('station-card').first()).toBeVisible()
})

test('Audius: search, play, audio advances', async ({ page }) => {
  await search(page, 'lofi', 'audius')
  const rows = page.getByTestId('audius-tracks').getByRole('listitem')
  await expect(rows.first()).toBeVisible()
  expect(await rows.count()).toBeGreaterThan(3)
  await rows.first().getByRole('button', { name: /^Play .* by / }).click()
  await expect(page.getByTestId('now-playing-title')).toBeVisible()
  await expectAudioAdvancing(page)
  // Seek bar is shown for on-demand tracks.
  await expect(page.getByTestId('seek')).toBeVisible()
})

test('Internet Archive: search, open album, play, audio advances', async ({ page }) => {
  await search(page, 'jazz', 'archive')
  const cards = page.getByTestId('archive-results').getByTestId('album-card')
  await expect(cards.first()).toBeVisible()
  expect(await cards.count()).toBeGreaterThan(3)
  // Open the first album that lists playable tracks.
  for (let i = 0; i < 5; i++) {
    await search(page, 'jazz', 'archive')
    await page.getByTestId('archive-results').getByTestId('album-card').nth(i).click()
    await expect(page.getByTestId('collection-title')).not.toHaveText('Loading…')
    if (await page.getByTestId('album-tracks').isVisible()) break
  }
  await expect(page.getByTestId('album-tracks').getByRole('listitem').first()).toBeVisible()
  await page.getByTestId('play-all').click()
  await expectAudioAdvancing(page)
})

test('Radio: genre chip, play station, LIVE badge and audio advances', async ({ page }) => {
  await page.goto('./#/radio')
  await page.getByTestId('radio-chip-jazz').click()
  const cards = page.getByTestId('radio-results').getByTestId('station-card')
  await expect(cards.first()).toBeVisible()
  await cards.first().getByRole('button', { name: /^Play / }).click()
  // Unreachable stations auto-skip to the next one in the list.
  await expectAudioAdvancing(page, 2, 60_000)
  await expect(page.getByTestId('live-indicator')).toBeVisible()
  await expect(page.getByTestId('seek')).toHaveCount(0)
})

test('Radio search by name via the All tab renders stations', async ({ page }) => {
  await search(page, 'jazz', 'radio')
  await expect(page.getByTestId('radio-results').getByTestId('station-card').first()).toBeVisible()
})

test('like, queue, playlist create and share link round-trip', async ({ page, context }) => {
  await page.goto('./')
  const first = page.getByTestId('trending-list').getByRole('listitem').first()
  await expect(first).toBeVisible()
  const title = (await first.getByRole('button', { name: /^Play .* by / }).getAttribute('aria-label'))!

  // Like it.
  await first.hover()
  await first.getByRole('button', { name: 'Add to Liked' }).click()
  await expect(page.getByTestId('sidebar-playlists')).toContainText('1 track')

  // Add to queue via menu.
  await first.getByRole('button', { name: /^More options/ }).click()
  await page.getByRole('menuitem', { name: 'Add to queue' }).click()
  await page.getByRole('button', { name: 'Queue', exact: true }).click()
  await expect(page.getByTestId('queue-item')).toHaveCount(1)

  // New playlist from menu.
  await first.getByRole('button', { name: /^More options/ }).click()
  await page.getByRole('menuitem', { name: 'Add to playlist' }).click()
  await page.getByRole('menuitem', { name: 'New playlist…' }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('E2E Mix')
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click()
  await expect(page.getByTestId('sidebar-playlists')).toContainText('E2E Mix')

  // Persisted across reload.
  await page.reload()
  await expect(page.getByTestId('sidebar-playlists')).toContainText('E2E Mix')

  // Share link opens in a fresh browser context and imports.
  await page.getByTestId('sidebar-playlists').getByText('E2E Mix').click()
  await expect(page.getByTestId('playlist-tracks').getByRole('listitem')).toHaveCount(1)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByTestId('share-playlist').click()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toContain('#/import/')

  const other = await (await page.context().browser()!.newContext()).newPage()
  await other.goto(link)
  await expect(other.getByTestId('collection-title')).toHaveText('E2E Mix')
  await expect(other.getByTestId('import-tracks').getByRole('listitem')).toHaveCount(1)
  await expect(other.getByTestId('import-tracks')).toContainText(title.replace(/^Play /, '').split(' by ')[0])
  await other.getByTestId('save-import').click()
  await expect(other.getByTestId('sidebar-playlists')).toContainText('E2E Mix')
})

test('keyboard: ? opens help, / focuses search, space toggles play', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByTestId('trending-list').getByRole('listitem').first()).toBeVisible()
  await page.keyboard.press('?')
  await expect(page.getByTestId('help-overlay')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('help-overlay')).toHaveCount(0)
  await page.keyboard.press('/')
  await expect(page.getByTestId('search-input')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('search-input')).not.toBeFocused()
  await page.getByRole('link', { name: 'Home' }).first().click()

  await page.getByTestId('trending-list').getByRole('listitem').first().getByRole('button', { name: /^Play .* by / }).click()
  await expectAudioAdvancing(page, 1)
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  await page.keyboard.press('Space')
  await expect(page.getByTestId('play-pause').filter({ visible: true })).toHaveAttribute('aria-label', 'Play')
  const paused = await audioTime(page)
  await page.waitForTimeout(1200)
  expect(await audioTime(page)).toBeCloseTo(paused, 1)
})
