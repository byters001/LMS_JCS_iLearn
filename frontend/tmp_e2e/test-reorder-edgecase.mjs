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

// Enter (or re-enter) a clean reorder mode
if (await page.getByRole('button', { name: 'Cancel' }).count() > 0) {
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.waitForTimeout(300)
}
await page.getByRole('button', { name: 'Reorder Questions' }).click()
await page.waitForTimeout(500)

const rows = page.locator('li').filter({ hasText: 'E2E Reorder Q' })
console.log('row count:', await rows.count())

async function rowLabel(i) {
  return (await rows.nth(i).innerText()).replace(/\s+/g, ' ').trim()
}
async function badgeText(i) {
  return (await rows.nth(i).locator('span').first().innerText()).trim()
}
async function clickRow(i) {
  await rows.nth(i).locator('button').first().click()
  await page.waitForTimeout(300)
}
async function dumpAll(label) {
  const n = await rows.count()
  const lines = []
  for (let i = 0; i < n; i++) {
    lines.push(`  row${i}: badge="${await badgeText(i)}" | ${await rowLabel(i)}`)
  }
  console.log(label + ':\n' + lines.join('\n'))
}

await dumpAll('INITIAL STATE')
await shot('edge-00-initial.png')

// Click row0 (Q1) -> expect rank 1
await clickRow(0)
await dumpAll('AFTER click row0 (expect row0=1)')
await shot('edge-01-click-row0.png')

// Click row1 (Q2) -> expect Q1=1, Q2=2
await clickRow(1)
await dumpAll('AFTER click row1 (expect Q1=1, Q2=2)')
await shot('edge-02-click-row1.png')

// UNDO: click Q1 again (it's still row0 since ranked rows that are already at
// the top don't visually reorder relative to each other) -> expect Q1 back
// to unranked ("–"), and Q2 renumbers from 2 down to 1
await clickRow(0)
await dumpAll('AFTER undo row0/Q1 (expect Q1="–", Q2 renumbered to 1)')
await shot('edge-03-undo-row0.png')

// Click a DIFFERENT row (Q3) in this new order -> expect Q2=1 (unchanged), Q3=2
// Q3 is wherever it currently sits in the unranked bottom group — find it by text
const q3Row = page.locator('li').filter({ hasText: 'E2E Reorder Q3' })
await q3Row.locator('button').first().click()
await page.waitForTimeout(300)
await dumpAll('AFTER click Q3 (expect Q2=1, Q3=2, Q1 still "–")')
await shot('edge-04-click-q3.png')

console.log('Console/page errors so far:', errors.length)

// Now save and verify no console errors, and mode exits reorder
await page.getByRole('button', { name: /save order/i }).click()
await page.waitForTimeout(2000)
await shot('edge-05-after-save.png')
const stillReorderButtons = await page.getByRole('button', { name: /save order/i }).count()
console.log('Save Order button still present after save (expect 0):', stillReorderButtons)
const reorderQuestionsBack = await page.getByRole('button', { name: 'Reorder Questions' }).count()
console.log('Reorder Questions button back (expect 1):', reorderQuestionsBack)

await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByText('Reorder Test Section', { exact: false }).waitFor({ timeout: 10000 })
await page.waitForTimeout(800)
await shot('edge-06-after-reload.png')
const rowsAfterReload = page.locator('li').filter({ hasText: 'E2E Reorder Q' })
console.log('Order after reload (expect Q2, Q3, Q1):')
for (let i = 0; i < await rowsAfterReload.count(); i++) {
  console.log(`  row${i}:`, (await rowsAfterReload.nth(i).innerText()).replace(/\s+/g, ' ').trim())
}

console.log('Total console/page errors across whole run:', errors.length, errors)

await context.close()
await browser.close()
console.log('DONE')
