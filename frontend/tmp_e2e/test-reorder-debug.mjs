import { chromium } from '@playwright/test'
import path from 'node:path'

const SHOT_DIR = 'C:\\Users\\ADMIN\\AppData\\Local\\Temp\\claude\\d--LMS-JCS\\a9f6804e-2cd4-4394-8303-411f698ad8fb\\scratchpad\\shots'
const ASSESSMENT_URL = 'http://localhost:5173/admin/assessments/d7e79b3a-5fab-4cc0-a698-f58efe2bcf53/edit'

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const page = await context.newPage()
page.on('console', (msg) => console.log('CONSOLE', msg.type().toUpperCase() + ':', msg.text()))
page.on('pageerror', (err) => console.log('PAGE ERROR:', err))

await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' })
await page.locator('input[type="email"]').first().fill('admin@jcsilearn.com')
await page.locator('input[type="password"]').first().fill('password123')
await page.locator('button[type="submit"]').first().click()
await page.waitForURL('**/admin**', { timeout: 10000 })

await page.goto(ASSESSMENT_URL, { waitUntil: 'domcontentloaded' })
await page.getByText('Reorder Test Section', { exact: false }).waitFor({ timeout: 15000 })
await page.waitForTimeout(1000)

const reorderBtn = page.getByRole('button', { name: 'Reorder Questions' })
if (await reorderBtn.count() > 0) {
  await reorderBtn.click()
  console.log('Clicked Reorder Questions')
} else {
  console.log('Reorder Questions button not found — maybe already in reorder mode; trying Cancel first')
  const cancelBtn = page.getByRole('button', { name: 'Cancel' })
  if (await cancelBtn.count() > 0) {
    await cancelBtn.click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Reorder Questions' }).click()
  }
}
await page.waitForTimeout(500)

const rows = page.locator('li').filter({ hasText: 'E2E Reorder Q' })
console.log('row count:', await rows.count())

// Dump the outerHTML of the first row's first child element (badge/text wrapper)
const firstRowFirstChildHTML = await rows.nth(0).evaluate((li) => li.firstElementChild?.outerHTML)
console.log('Row0 first child HTML BEFORE click:\n', firstRowFirstChildHTML)

// Click via a direct locator on the button element itself, scoped to row0
const row0Clickable = rows.nth(0).locator('button').first()
const row0ClickableCount = await row0Clickable.count()
console.log('Row0 clickable <button> count:', row0ClickableCount)

if (row0ClickableCount > 0) {
  await row0Clickable.click()
  await page.waitForTimeout(400)
  const afterHTML = await rows.nth(0).evaluate((li) => li.firstElementChild?.outerHTML)
  console.log('Row0 first child HTML AFTER click:\n', afterHTML)
} else {
  console.log('No clickable button in row0 — dumping full row HTML')
  console.log(await rows.nth(0).evaluate((li) => li.outerHTML))
}

await page.screenshot({ path: path.join(SHOT_DIR, 'debug-01.png'), fullPage: true })

await context.close()
await browser.close()
console.log('DONE')
