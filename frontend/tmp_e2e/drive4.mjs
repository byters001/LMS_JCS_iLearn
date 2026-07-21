import { chromium } from '@playwright/test'
import path from 'node:path'

const SHOT_DIR = 'C:\\Users\\ADMIN\\AppData\\Local\\Temp\\claude\\d--LMS-JCS\\b65b6e7d-e490-4f6c-9f67-644c78b24805\\scratchpad'

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream'] })
const context = await browser.newContext({ viewport: { width: 1500, height: 950 }, permissions: ['camera'] })
const page = await context.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()) })
page.on('dialog', async (d) => { console.log('DIALOG:', d.message()); await d.accept() })

async function shot(name) {
  await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: false })
  console.log('screenshot:', name)
}

await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(500)
await page.locator('input[type="email"]').first().fill('samrojes@gmail.com')
await page.locator('input[type="password"]').first().fill('pass1234')
await page.locator('button[type="submit"]').first().click()
await page.waitForURL('**/student**', { timeout: 10000 })
await page.waitForTimeout(2000)
await shot('10-dashboard.png')

// Find the "toooo" assessment card and its action button
const card = page.locator('text=toooo').first()
await card.scrollIntoViewIfNeeded()
await shot('11-toooo-card.png')

// The action button is within the same card container — find nearest button
const cardContainer = page.locator('div', { has: page.getByText('toooo', { exact: true }) }).last()
const actionBtn = cardContainer.getByRole('button').last()
console.log('action button text:', await actionBtn.textContent())
await actionBtn.click()
await page.waitForTimeout(1500)
console.log('URL after clicking action:', page.url())
await shot('12-after-click.png')

await browser.close()
