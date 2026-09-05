import { chromium } from '@playwright/test'
import path from 'node:path'

const SHOT_DIR = 'C:\\Users\\ADMIN\\AppData\\Local\\Temp\\claude\\d--LMS-JCS\\a9f6804e-2cd4-4394-8303-411f698ad8fb\\scratchpad\\shots'
const STAMP = Date.now()
const ASSESSMENT_TITLE = `E2E Reorder Test ${STAMP}`

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const page = await context.newPage()
const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    consoleErrors.push(msg.text())
    console.log('CONSOLE ERROR:', msg.text())
  }
})
page.on('pageerror', (err) => {
  consoleErrors.push(String(err))
  console.log('PAGE ERROR:', err)
})

async function shot(name) {
  await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: true })
}

await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' })
await page.locator('input[type="email"]').first().fill('admin@jcsilearn.com')
await page.locator('input[type="password"]').first().fill('password123')
await page.locator('button[type="submit"]').first().click()
await page.waitForURL('**/admin**', { timeout: 10000 })
console.log('STEP 1: logged in as admin')

// Create a new mcq assessment
await page.goto('http://localhost:5173/admin/assessments/new', { waitUntil: 'domcontentloaded' })
await page.getByLabel('Title').waitFor({ timeout: 10000 })
await page.getByLabel('Title').fill(ASSESSMENT_TITLE)
await page.getByRole('button', { name: /create/i }).click()
await page.waitForURL(/\/admin\/assessments\/[0-9a-f-]{36}\/edit$/, { timeout: 10000 })
const assessmentUrl = page.url()
console.log('STEP 2: assessment created at', assessmentUrl)

// Add a manual section
await page.getByText('Add a new section', { exact: false }).waitFor({ timeout: 15000 })
const sectionTitleInput = page.locator('label:has-text("Section Title") + input')
await sectionTitleInput.fill('Reorder Test Section')
await page.getByRole('button', { name: /add section/i }).click()
await page.waitForTimeout(1200)
console.log('STEP 3: manual section added')

// Create 3 quick MCQ questions as admin (auto-approved per Phase 4a) so the
// picker has something guaranteed-attachable, rather than depending on
// whatever pre-existing approved mcq questions happen to be in the dev DB.
const questionTexts = []
for (let i = 1; i <= 3; i++) {
  const qText = `E2E Reorder Q${i} ${STAMP}`
  questionTexts.push(qText)
  await page.goto('http://localhost:5173/admin/questions/new?type=mcq&difficulty=medium', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Question Text').waitFor({ timeout: 10000 })
  await page.getByLabel('Question Text').fill(qText)

  // Category: use existing "+ New Category" flow with a fixed name (idempotent-ish per stamp)
  const categoryCombobox = page.getByPlaceholder(/search mcq categories/i)
  await categoryCombobox.click()
  await page.waitForTimeout(400)
  await categoryCombobox.fill('E2E Reorder Category')
  await page.waitForTimeout(600)
  const catOption = page.locator('[role="listbox"] [role="option"]', { hasText: 'E2E Reorder Category' })
  if (await catOption.count() > 0) {
    await catOption.first().click()
  } else {
    await page.getByRole('button', { name: /new category/i }).click()
    await page.getByLabel('Name').fill('E2E Reorder Category')
    await page.getByRole('button', { name: /create category/i }).click()
    await page.waitForTimeout(800)
  }
  await page.waitForTimeout(500)

  // Topic: required now (Phase 1) — create/select one
  const topicCombobox = page.getByPlaceholder(/search topics to add|no topics for this category/i)
  await topicCombobox.click()
  await page.waitForTimeout(400)
  await topicCombobox.fill('E2E Reorder Topic')
  await page.waitForTimeout(600)
  const topicOption = page.locator('[role="listbox"] [role="option"]', { hasText: 'E2E Reorder Topic' })
  if (await topicOption.count() > 0) {
    await topicOption.first().click()
  } else {
    await page.getByRole('button', { name: /new topic/i }).click()
    await page.getByLabel('Name').fill('E2E Reorder Topic')
    await page.getByRole('button', { name: /create topic/i }).click()
    await page.waitForTimeout(800)
  }
  await page.waitForTimeout(500)

  // Two MCQ options, mark first correct (radio, not checkbox)
  await page.getByPlaceholder('Option 1').fill('Option A')
  await page.getByPlaceholder('Option 2').fill('Option B')
  await page.getByLabel('Mark option 1 as correct').check()

  await page.getByRole('button', { name: /create question/i }).click()
  await page.waitForURL(/\/admin\/questions$/, { timeout: 10000 })
  console.log(`STEP 4.${i}: created question "${qText}"`)
}

// Back to the assessment edit page, attach the 3 questions
await page.goto(assessmentUrl, { waitUntil: 'domcontentloaded' })
await page.getByText('Attach a question', { exact: false }).waitFor({ timeout: 15000 })
for (const qText of questionTexts) {
  const picker = page.getByPlaceholder(/search approved questions/i)
  await picker.click()
  await page.waitForTimeout(500)
  await picker.fill(qText.slice(0, 20))
  await page.waitForTimeout(800)
  const option = page.locator('[role="listbox"] [role="option"]', { hasText: qText.slice(0, 20) })
  await option.first().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /attach question/i }).click()
  await page.waitForTimeout(1000)
}
console.log('STEP 5: attached 3 questions')
await shot('01-attached-3-questions.png')

// Enter reorder mode
await page.getByRole('button', { name: 'Reorder Questions' }).click()
await page.waitForTimeout(500)
await shot('02-reorder-mode-entered.png')

const rows = page.locator('li').filter({ hasText: 'E2E Reorder Q' })
const rowCount = await rows.count()
console.log('STEP 6: reorder mode entered, row count =', rowCount)

async function rowText(i) {
  return (await rows.nth(i).innerText()).replace(/\s+/g, ' ').trim()
}

console.log('Row 0 before any click:', await rowText(0))
console.log('Row 1 before any click:', await rowText(1))
console.log('Row 2 before any click:', await rowText(2))

// Click row 0 (rank #1)
await rows.nth(0).getByText(questionTexts[0].slice(0, 20)).click()
await page.waitForTimeout(300)
await shot('03-clicked-row0.png')
console.log('After clicking row0 -> row0:', await rowText(0))

// Click row 1 (rank #2)
await rows.nth(1).getByText(questionTexts[1].slice(0, 20)).click()
await page.waitForTimeout(300)
await shot('04-clicked-row1.png')
console.log('After clicking row1 -> row0:', await rowText(0), '| row1:', await rowText(1))

// Click row 0 AGAIN to undo (the flagged edge case)
await rows.nth(0).getByText(questionTexts[0].slice(0, 20)).click()
await page.waitForTimeout(300)
await shot('05-undo-row0.png')
console.log('After UNDO row0 -> row0:', await rowText(0), '| row1:', await rowText(1))

// Click row 2 (a different row, in a different order than the original click sequence)
await rows.nth(2).getByText(questionTexts[2].slice(0, 20)).click()
await page.waitForTimeout(300)
await shot('06-clicked-row2-after-undo.png')
console.log('After clicking row2 -> row0:', await rowText(0), '| row1:', await rowText(1), '| row2:', await rowText(2))

// Save Order
const saveButton = page.getByRole('button', { name: /save order/i })
await saveButton.click()
await page.waitForTimeout(1500)
await shot('07-after-save.png')
const stillReordering = await page.getByRole('button', { name: /save order/i }).count()
console.log('STEP 7: Save Order clicked, still in reorder mode (should be 0):', stillReordering)

// Reload and confirm persisted order + no console errors
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByText('E2E Reorder Q', { exact: false }).first().waitFor({ timeout: 10000 })
await page.waitForTimeout(800)
await shot('08-after-reload.png')
const rowsAfterReload = page.locator('li').filter({ hasText: 'E2E Reorder Q' })
console.log('After reload, order:')
for (let i = 0; i < await rowsAfterReload.count(); i++) {
  console.log(`  row ${i}:`, (await rowsAfterReload.nth(i).innerText()).replace(/\s+/g, ' ').trim())
}

console.log('Console/page errors captured:', consoleErrors.length, consoleErrors)

await context.close()
await browser.close()
console.log('DONE')
