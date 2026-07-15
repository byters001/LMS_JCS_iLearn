// Real end-to-end regression test for the 401 -> refresh -> retry -> succeed
// flow — the exact class of bug (cookie path/domain/SameSite/CORS
// mismatches between the real localhost:5173 -> localhost:3000 cross-origin
// request) that a mocked/unit test cannot reproduce, since jsdom/MSW don't
// enforce real browser cookie/CORS semantics. See api/index.test.ts for the
// unit-level coverage of the interceptor's retry/dedupe *logic*; this spec
// only exists to prove that logic actually works against the real backend,
// real Set-Cookie header, and a real cross-port request.
import { expect, test } from '@playwright/test'
import { FIXTURE_STUDENT_EMAIL, FIXTURE_STUDENT_PASSWORD, TARGET_ASSESSMENT_TITLE } from './fixtures'

test('a corrupted access token on the first post-login request recovers via a real refresh', async ({
  page,
}) => {
  // StudentAssessmentsPage (the /student index route) fires exactly one
  // GET /assessments/available on mount, right after login navigates
  // there — the first and only match here corrupts its Authorization
  // header so the REAL backend genuinely rejects it with a real 401,
  // rather than simulating one. Every subsequent match (the interceptor's
  // own retry, and anything else) passes through untouched.
  let matchCount = 0
  await page.route('**/api/v1/assessments/available*', async (route) => {
    matchCount += 1
    if (matchCount === 1) {
      await route.continue({
        headers: { ...route.request().headers(), authorization: 'Bearer e2e-deliberately-invalid-token' },
      })
    } else {
      await route.continue()
    }
  })

  const refreshResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/auth/refresh') && response.request().method() === 'POST',
  )

  await page.goto('/login')
  await page.getByLabel('Email').fill(FIXTURE_STUDENT_EMAIL)
  await page.getByLabel('Password').fill(FIXTURE_STUDENT_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()

  // Proves the real refresh round-trip happened (real httpOnly cookie sent
  // cross-origin, real new access token issued) and succeeded.
  const refreshResponse = await refreshResponsePromise
  expect(refreshResponse.status()).toBe(200)

  // Proves the RETRIED request reached the app as real, rendered data —
  // not an error state the student would have been stuck looking at.
  await expect(page.getByRole('heading', { name: 'Your Assessments' })).toBeVisible()
  await expect(page.getByText(TARGET_ASSESSMENT_TITLE)).toBeVisible()

  expect(matchCount).toBeGreaterThanOrEqual(2)
})
