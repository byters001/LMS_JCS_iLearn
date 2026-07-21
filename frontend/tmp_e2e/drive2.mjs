import { chromium } from '@playwright/test'
import path from 'node:path'

const SHOT_DIR = 'C:\\Users\\ADMIN\\AppData\\Local\\Temp\\claude\\d--LMS-JCS\\b65b6e7d-e490-4f6c-9f67-644c78b24805\\scratchpad'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('response', async (res) => {
  if (res.url().includes('/auth/login')) {
    console.log('LOGIN RESPONSE STATUS:', res.status())
    try {
      console.log('LOGIN RESPONSE BODY:', await res.text())
    } catch {}
  }
})

async function shot(name) {
  await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: false })
  console.log('screenshot:', name)
}

await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(800)
await page.locator('input[type="email"], input[name="email"]').first().fill('student031@skcet.ac.in')
await page.locator('input[type="password"], input[name="password"]').first().fill('password123')
await page.locator('button[type="submit"]').first().click()
await page.waitForTimeout(3000)
console.log('URL:', page.url())
await shot('05-login-result.png')

await browser.close()
