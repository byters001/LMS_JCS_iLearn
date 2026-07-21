import { chromium } from '@playwright/test'
import path from 'node:path'

const SHOT_DIR = 'C:\\Users\\ADMIN\\AppData\\Local\\Temp\\claude\\d--LMS-JCS\\b65b6e7d-e490-4f6c-9f67-644c78b24805\\scratchpad'

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream'] })
const context = await browser.newContext({ viewport: { width: 1500, height: 950 }, permissions: ['camera'] })
const page = await context.newPage()
page.on('console', (msg) => console.log('CONSOLE', msg.type().toUpperCase() + ':', msg.text()))
page.on('requestfailed', (req) => console.log('REQUEST FAILED:', req.url(), req.failure()?.errorText))
page.on('response', async (res) => {
  if (res.url().includes('/attempts') || res.url().includes('/start')) {
    console.log('RESPONSE', res.status(), res.url())
    if (res.status() >= 400) {
      try { console.log('  body:', await res.text()) } catch {}
    }
  }
})
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
await page.waitForTimeout(1500)

await page.locator('a[href="/student/assessments/f4fde0e5-20df-4b74-875c-afb304bc8581"]').click()
await page.waitForTimeout(1000)
await page.getByRole('button', { name: 'Start Test' }).click()
await page.waitForTimeout(1000)
await page.getByRole('button', { name: /i understand, start assessment/i }).click()
await page.waitForTimeout(6000)
console.log('URL:', page.url())
await shot('33-after-wait.png')

await browser.close()
