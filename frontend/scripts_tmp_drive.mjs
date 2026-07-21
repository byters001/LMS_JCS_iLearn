import { chromium } from '@playwright/test'
import path from 'node:path'

const SHOT_DIR = 'C:\\Users\\ADMIN\\AppData\\Local\\Temp\\claude\\d--LMS-JCS\\b65b6e7d-e490-4f6c-9f67-644c78b24805\\scratchpad'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text())
})
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message))

async function shot(name) {
  await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: false })
  console.log('screenshot:', name)
}

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await shot('01-landing.png')
  console.log('URL after landing:', page.url())

  // Try to find a login form
  const emailInput = page.locator('input[type="email"], input[name="email"]').first()
  const passInput = page.locator('input[type="password"], input[name="password"]').first()
  if (await emailInput.count() === 0) {
    await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
  }
  await shot('02-login-page.png')

  await emailInput.fill('student031@skcet.ac.in')
  await passInput.fill('password123')
  await shot('03-login-filled.png')

  const submitBtn = page.locator('button[type="submit"]').first()
  await submitBtn.click()
  await page.waitForTimeout(2000)
  console.log('URL after login:', page.url())
  await shot('04-after-login.png')
} catch (err) {
  console.error('ERROR:', err.message)
  await shot('error.png')
}

await browser.close()
