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
await page.waitForTimeout(1500)

await page.goto('http://localhost:5173/student/assessments/f4fde0e5-20df-4b74-875c-afb304bc8581', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await shot('14-instructions.png')

// Try to find a "Start"/"Begin"/"Start Attempt" button on the instructions page
const buttons = await page.locator('button, a').allTextContents()
console.log('clickable texts:', JSON.stringify(buttons.filter(t => t.trim())))

await browser.close()
