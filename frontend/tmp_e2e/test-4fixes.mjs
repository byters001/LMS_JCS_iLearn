import { chromium } from '@playwright/test'
import path from 'node:path'

const SHOT_DIR = 'C:\\Users\\ADMIN\\AppData\\Local\\Temp\\claude\\d--LMS-JCS\\3a4de448-6b55-43d9-a2d1-6262b74ecdc2\\scratchpad\\shots'
const STAMP = Date.now()
const ASSESSMENT_TITLE = `E2E Scheduled Lock Test ${STAMP}`

const browser = await chromium.launch()

async function login(page, email, password) {
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  await page.locator('input[type="email"]').first().fill(email)
  await page.locator('input[type="password"]').first().fill(password)
  await page.locator('button[type="submit"]').first().click()
}

// ================= Admin: create + schedule (not publish) a test assessment =================
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } })
const page = await context.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()) })

await login(page, 'admin@jcsilearn.com', 'password123')
await page.waitForURL('**/admin**', { timeout: 10000 })
console.log('STEP 1: logged in as admin')

await page.goto('http://localhost:5173/admin/assessments/new', { waitUntil: 'domcontentloaded' })
await page.getByLabel('Title').waitFor({ timeout: 10000 })
await page.getByLabel('Title').fill(ASSESSMENT_TITLE)
await page.getByRole('button', { name: /create/i }).click()
await page.waitForURL(/\/admin\/assessments\/[0-9a-f-]{36}\/edit$/, { timeout: 10000 })
console.log('STEP 2: assessment created, at', page.url())
await page.getByText('SECTIONS', { exact: false }).waitFor({ timeout: 15000 })
await page.waitForTimeout(800)

// Batches: college -> batch (Byters @ PSG)
await page.getByText('BATCHES', { exact: false }).first().scrollIntoViewIfNeeded()
const collegePicker = page.getByPlaceholder('Select a college to browse its batches…')
await collegePicker.click()
await page.waitForTimeout(600)
await collegePicker.fill('PSG')
await page.waitForTimeout(800)
await page.locator('[role="listbox"] [role="option"]', { hasText: 'PSG' }).first().click()
await page.waitForTimeout(900)

const batchPicker = page.getByPlaceholder('Search batches by name to add…')
await batchPicker.click()
await page.waitForTimeout(600)
await batchPicker.fill('Byters')
await page.waitForTimeout(800)
await page.locator('[role="listbox"] [role="option"]', { hasText: 'Byters' }).first().click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: /Save Batches/ }).click()
await page.waitForTimeout(1500)
console.log('STEP 3: batch attached')

// Workflow: draft -> review -> approved -> scheduled (startAt 3 days from now — stop here, do NOT publish)
await page.getByRole('button', { name: 'Submit for Review' }).click()
await page.waitForTimeout(1500)
await page.getByRole('button', { name: 'Approve', exact: true }).click()
await page.waitForTimeout(1500)

const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
const end = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const dtInputs = page.locator('input[type="datetime-local"]')
await dtInputs.nth(0).waitFor({ timeout: 10000 })
await dtInputs.nth(0).fill(toLocalInputValue(start))
await dtInputs.nth(1).fill(toLocalInputValue(end))
await page.getByRole('button', { name: 'Schedule' }).click()
await page.waitForTimeout(1500)
const statusText = await page.locator('body').innerText()
console.log('STEP 4: assessment scheduled (not published), shows "Scheduled":', statusText.includes('Scheduled'))
console.log('scheduled startAt (future):', start.toISOString())

// ================= Chatbot drag test (as admin) =================
await page.goto('http://localhost:5173/admin', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
const fab = page.getByRole('button', { name: /reports assistant/i })
await fab.waitFor({ timeout: 10000 })
const fabBoxBefore = await fab.boundingBox()
console.log('STEP 5: chatbot FAB default position:', fabBoxBefore)
await page.screenshot({ path: path.join(SHOT_DIR, 'fix4-chatbot-before-drag.png') })

// Drag it to top-left area
await page.mouse.move(fabBoxBefore.x + fabBoxBefore.width / 2, fabBoxBefore.y + fabBoxBefore.height / 2)
await page.mouse.down()
await page.mouse.move(200, 150, { steps: 15 })
await page.mouse.up()
await page.waitForTimeout(500)
const fabBoxAfter = await fab.boundingBox()
console.log('STEP 6: chatbot FAB position after drag:', fabBoxAfter)
await page.screenshot({ path: path.join(SHOT_DIR, 'fix4-chatbot-after-drag.png') })

// Confirm it's above the sidebar visually + still opens correctly from new position
await fab.click()
await page.waitForTimeout(600)
await page.screenshot({ path: path.join(SHOT_DIR, 'fix4-chatbot-panel-open-after-drag.png') })
const panelVisible = await page.getByText('Reports Assistant').isVisible()
console.log('STEP 7: panel opens correctly after drag:', panelVisible)
await fab.click()
await page.waitForTimeout(400)

await context.close()

// ================= Student: verify locked scheduled card + Test Completed styling =================
const studentContext = await browser.newContext({ viewport: { width: 1500, height: 950 } })
const studentPage = await studentContext.newPage()
studentPage.on('console', (msg) => { if (msg.type() === 'error') console.log('STUDENT CONSOLE ERROR:', msg.text()) })

await login(studentPage, 'samrojes@gmail.com', 'pass1234')
await studentPage.waitForURL('**/student**', { timeout: 10000 })
console.log('STEP 8: logged in as samrojes (student)')
await studentPage.getByText(ASSESSMENT_TITLE, { exact: false }).waitFor({ timeout: 15000 })
await studentPage.waitForTimeout(800)
await studentPage.screenshot({ path: path.join(SHOT_DIR, 'fix2-full-page-with-locked-card.png'), fullPage: true })
console.log('STEP 9: full assessments page screenshotted (locked card + completed card both visible)')

// Confirm the scheduled card is NOT a clickable link (should be a <div>, no href)
const scheduledCardLocator = studentPage.locator('div', { hasText: ASSESSMENT_TITLE }).filter({ hasText: 'Opens' })
const scheduledCardCount = await scheduledCardLocator.count()
console.log('scheduled card rendered as locked div (count > 0):', scheduledCardCount)
const scheduledAnchorCount = await studentPage.locator('a', { hasText: ASSESSMENT_TITLE }).count()
console.log('scheduled card is NOT an <a> link (expect 0):', scheduledAnchorCount)

// Close-crop screenshots of both card types
const lockedCard = studentPage.locator('div.rounded-xl', { hasText: ASSESSMENT_TITLE }).first()
if (await lockedCard.count() > 0) {
  await lockedCard.screenshot({ path: path.join(SHOT_DIR, 'fix2-locked-card-crop.png') })
}
const completedCardLink = studentPage.locator('a', { hasText: 'Test Completed' }).first()
if (await completedCardLink.count() > 0) {
  await completedCardLink.screenshot({ path: path.join(SHOT_DIR, 'fix1-completed-card-crop.png') })
  console.log('STEP 10: found an existing Test Completed card, screenshotted')
} else {
  console.log('STEP 10: no existing Test Completed card found on this page')
}

await studentContext.close()
await browser.close()
console.log('DONE')
