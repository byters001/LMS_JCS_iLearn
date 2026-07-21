import { chromium } from '@playwright/test'
import path from 'node:path'

const SHOT_DIR = 'C:\\Users\\ADMIN\\AppData\\Local\\Temp\\claude\\d--LMS-JCS\\b65b6e7d-e490-4f6c-9f67-644c78b24805\\scratchpad'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()) })

async function shot(name) {
  await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: false })
  console.log('screenshot:', name)
}

await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(500)
await page.locator('input[type="email"]').first().fill('student031@skcet.ac.in')
await page.locator('input[type="password"]').first().fill('password123')
await page.locator('button[type="submit"]').first().click()
await page.waitForURL('**/student**', { timeout: 10000 })
await page.waitForTimeout(2500)
await shot('06-assessments-list.png')

const html = await page.content()
console.log('---has assessment cards---')
const cardTexts = await page.locator('main, [class*="grid"] > div, a, button').allTextContents()
console.log(JSON.stringify(cardTexts.filter(t => t.trim().length > 0).slice(0, 60), null, 2))

await browser.close()
