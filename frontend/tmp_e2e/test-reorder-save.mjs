import { chromium } from '@playwright/test'
import path from 'node:path'

const SHOT_DIR = 'C:\\Users\\ADMIN\\AppData\\Local\\Temp\\claude\\d--LMS-JCS\\a9f6804e-2cd4-4394-8303-411f698ad8fb\\scratchpad\\shots'
const ASSESSMENT_URL = 'http://localhost:5173/admin/assessments/d7e79b3a-5fab-4cc0-a698-f58efe2bcf53/edit'

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const page = await context.newPage()
const errors = []
page.on('console', (msg) => { if (msg.type() === 'error') { errors.push(msg.text()); console.log('CONSOLE ERROR:', msg.text()) } })
page.on('pageerror', (err) => { errors.push(String(err)); console.log('PAGE ERROR:', err) })

async function shot(name) {
  await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: true })
}

await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' })
await page.locator('input[type="email"]').first().fill('admin@jcsilearn.com')
await page.locator('input[type="password"]').first().fill('password123')
await page.locator('button[type="submit"]').first().click()
await page.waitForURL('**/admin**', { timeout: 10000 })

await page.goto(ASSESSMENT_URL, { waitUntil: 'domcontentloaded' })
await page.getByText('Reorder Test Section', { exact: false }).waitFor({ timeout: 15000 })
await page.waitForTimeout(1000)

// We should still be mid-reorder from the previous script (Q2=1, Q3=2, Q1 unranked).
// If not (e.g. state reset by a reload), rebuild it deterministically.
async function dumpAll() {
  const rows = page.locator('li').filter({ hasText: 'E2E Reorder Q' })
  const n = await rows.count()
  const lines = []
  for (let i = 0; i < n; i++) {
    const badge = (await rows.nth(i).locator('span').first().innerText()).trim()
    const text = (await rows.nth(i).innerText()).replace(/\s+/g, ' ').trim()
    lines.push(`  row${i}: badge="${badge}" | ${text}`)
  }
  console.log(lines.join('\n'))
}

if (await page.getByRole('button', { name: 'Save Order' }).count() === 0) {
  console.log('Not mid-reorder anymore — re-entering and re-ranking Q2, Q3, Q1 in that order')
  if (await page.getByRole('button', { name: 'Cancel' }).count() > 0) {
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.waitForTimeout(300)
  }
  await page.getByRole('button', { name: 'Reorder Questions' }).click()
  await page.waitForTimeout(500)
  for (const label of ['E2E Reorder Q2', 'E2E Reorder Q3', 'E2E Reorder Q1']) {
    const row = page.locator('li').filter({ hasText: label })
    await row.locator('button').first().click()
    await page.waitForTimeout(300)
  }
}

console.log('STATE before final rank (Q1 should still be unranked):')
await dumpAll()

// Rank the remaining unranked question (Q1) so all 3 are ranked
const q1Row = page.locator('li').filter({ hasText: 'E2E Reorder Q1' })
const q1Badge = (await q1Row.locator('span').first().innerText()).trim()
if (q1Badge === '–') {
  await q1Row.locator('button').first().click()
  await page.waitForTimeout(300)
}
console.log('STATE after ranking Q1 (expect Q2=1, Q3=2, Q1=3):')
await dumpAll()
await shot('save-01-fully-ranked.png')

const saveBtn = page.getByRole('button', { name: /save order/i })
const isDisabled = await saveBtn.isDisabled()
console.log('Save Order disabled? (expect false):', isDisabled)

await saveBtn.click()
console.log('Clicked Save Order, waiting for it to resolve...')
await page.waitForTimeout(2500)
await shot('save-02-after-save.png')

const stillInReorderMode = await page.getByRole('button', { name: /save order/i }).count()
console.log('Still shows Save Order button after save (expect 0 = exited reorder mode):', stillInReorderMode)
const reorderBtnBack = await page.getByRole('button', { name: 'Reorder Questions' }).count()
console.log('Reorder Questions button visible again (expect 1):', reorderBtnBack)

await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByText('Reorder Test Section', { exact: false }).waitFor({ timeout: 10000 })
await page.waitForTimeout(1000)
await shot('save-03-after-reload.png')

const rowsAfterReload = page.locator('li').filter({ hasText: 'E2E Reorder Q' })
console.log('Order after reload (expect Q2, Q3, Q1):')
for (let i = 0; i < await rowsAfterReload.count(); i++) {
  console.log(`  row${i}:`, (await rowsAfterReload.nth(i).innerText()).replace(/\s+/g, ' ').trim())
}

console.log('Total console/page errors:', errors.length, errors)

await context.close()
await browser.close()
console.log('DONE')
