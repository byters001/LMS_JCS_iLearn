// Real end-to-end test of start -> answer -> submit-response -> persists,
// against the real backend and real DB.
//
// Persistence is verified via a DIRECT, independent API call rather than
// `page.reload()` — deliberately, after `page.reload()` was tried first and
// failed in a way that revealed a real architectural fact about this app:
// the access token lives ONLY in an in-memory Zustand store (CLAUDE1.md's
// own requirement — never localStorage/sessionStorage), and there is no
// boot-time silent-refresh call anywhere in App.tsx/main.tsx. A real hard
// reload therefore always logs the user out client-side and bounces them to
// /login, even though the real httpOnly refresh cookie is still valid
// server-side — confirmed live: an earlier version of this test used
// `page.reload()` here and landed back on the login form instead of the
// attempt. That's arguably a real UX gap worth a separate ticket, but it
// isn't what this test is checking, so this test
// instead verifies persistence the way that's actually true here: an
// independent GET against the real backend using the real access token,
// bypassing the SPA (and therefore any client-side cache) entirely.
//
// Deliberately stops short of the final "Submit Attempt" action — see
// global-teardown.ts's module comment on why (max_attempts=2, teardown
// cleans up between runs regardless; a full submit isn't needed to prove
// save-then-persist).
import { expect, test } from '@playwright/test'
import {
  FIXTURE_STUDENT_EMAIL,
  FIXTURE_STUDENT_PASSWORD,
  TARGET_ASSESSMENT_TITLE,
  TARGET_OPTION_ID,
  TARGET_OPTION_TEXT,
} from './fixtures'

const API_BASE_URL = 'http://localhost:3000/api/v1'

test('start an attempt, answer an MCQ, save, and confirm it persists server-side', async ({
  page,
}) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(FIXTURE_STUDENT_EMAIL)
  await page.getByLabel('Password').fill(FIXTURE_STUDENT_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('heading', { name: 'Your Assessments' })).toBeVisible()

  // AssessmentDetailPage reads assessment metadata out of this list page's
  // own TanStack Query cache (no student-scoped GET /assessments/:id
  // exists — see that page's own module comment), so navigation must go
  // through this card click, not a direct URL visit.
  await page.getByRole('heading', { name: TARGET_ASSESSMENT_TITLE, level: 3 }).click()
  await expect(page.getByRole('heading', { name: TARGET_ASSESSMENT_TITLE, level: 1 })).toBeVisible()

  await page.getByRole('button', { name: 'Start Attempt' }).click()

  // Lands on /student/attempts/:attemptId once startAttempt resolves.
  await expect(page.getByRole('heading', { name: /Question 1 of/ })).toBeVisible()
  const attemptUrlMatch = page.url().match(/\/student\/attempts\/([^/]+)/)
  if (!attemptUrlMatch) {
    throw new Error(`Expected to be on an attempt URL, got: ${page.url()}`)
  }
  const attemptId = attemptUrlMatch[1]

  // Capture the real bearer token this save request actually used, to
  // reuse for the independent verification call below — this is the same
  // token the app itself is using at this moment, not a separately
  // reconstructed one.
  const savePutPromise = page.waitForRequest(
    (req) => req.method() === 'PUT' && req.url().includes(`/attempts/${attemptId}/responses/`),
  )

  await page.getByLabel(TARGET_OPTION_TEXT).check()
  await page.getByRole('button', { name: 'Save Answer' }).click()

  const savePut = await savePutPromise
  const accessToken = savePut.headers()['authorization']
  expect(accessToken).toBeTruthy()

  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  // The real persistence check: ask the backend directly, independent of
  // the SPA's own TanStack Query cache, whether the save actually landed
  // in attempt_responses.
  const verifyResponse = await page.request.get(`${API_BASE_URL}/attempts/${attemptId}/questions`, {
    headers: { Authorization: accessToken },
  })
  expect(verifyResponse.ok()).toBe(true)
  const body = await verifyResponse.json()
  const question = body.data[0]
  expect(question.savedResponse?.selectedOptionId).toBe(TARGET_OPTION_ID)
})
