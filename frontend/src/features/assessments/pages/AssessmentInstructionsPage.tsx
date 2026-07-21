import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { requestFullscreen } from '@/lib/fullscreen'
import { useStartAttempt } from '@/features/attempts/api'
import type { ListAvailableAssessmentsResponse } from '../types'

// Moved from AssessmentDetailPage.tsx — that page no longer calls
// useStartAttempt itself (its "Start Attempt" button now just navigates
// here), so this error-describing logic moved with the mutation to its new
// single call site.
function describeStartAttemptError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Something went wrong starting this attempt. Please try again.'
  }
  if (error.code === 'FORBIDDEN') {
    return 'You are not authorized to attempt this assessment — check with your trainer if you believe this is a mistake.'
  }
  if (error.code === 'CONFLICT' && error.message.toLowerCase().includes('maximum attempts')) {
    return `${error.message}. Contact your trainer if you need a retake.`
  }
  return error.message
}

// Pre-attempt instructions screen (lockdown item 1). One button, one job:
// start the attempt and, for assessments that require it, enter fullscreen —
// both inside the SAME click, since requestFullscreen() only succeeds when
// called from live user-gesture activation (see lib/fullscreen.ts's own
// comment). This is why fullscreen is requested synchronously right after
// firing the mutation below rather than chained onto the mutation's
// onSuccess: onSuccess only runs once the network round trip finishes, by
// which point the browser no longer considers this a user gesture and would
// silently refuse the request. navigate() itself has no such constraint (it's
// plain JS, not a privileged browser API), so it's fine to let it wait for
// the real attempt id in onSuccess.
export default function AssessmentInstructionsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const startAttempt = useStartAttempt()

  // Same one-per-page-visit reasoning as AssessmentDetailPage.tsx previously
  // used for this same mutation.
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  // Same cached-list lookup fallback as AssessmentDetailPage.tsx — there is
  // still no student-scoped GET /assessments/:id. A direct URL visit with an
  // empty cache (e.g. a hard refresh on this exact route) falls through to
  // the "couldn't load" state below, same as that page.
  const cachedLists = queryClient.getQueriesData<ListAvailableAssessmentsResponse>({
    queryKey: ['assessments', 'available'],
  })
  const assessment = cachedLists
    .map(([, data]) => data?.items.find((item) => item.id === id))
    .find((item) => item !== undefined)

  if (!assessment) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load this assessment&apos;s details directly.{' '}
          <Link to="/student" className="text-brand-accent underline">
            Go back to your assessments
          </Link>
          .
        </p>
      </div>
    )
  }

  // Gating decision (asked and confirmed): fullscreen is only requested, and
  // AttemptPage's fullscreenchange/tab-switch auto-submit lockdown is only
  // armed, when the assessment was actually configured to require it. The
  // backend enforces the same boundary from the other side — attempts.
  // service.ts's assertProctoringEventAllowed rejects a fullscreen_exit
  // proctoring event for any assessment where proctoringFullscreenRequired
  // is false — so forcing fullscreen on every assessment regardless of this
  // flag would both override a trainer's own setting and fight the backend's
  // own model of what "requires fullscreen" means.
  const requiresFullscreen = assessment.proctoringFullscreenRequired
  // Captured as a plain local (not `assessment.id` inline below) so
  // TypeScript's narrowing from the `!assessment` guard above — which
  // doesn't flow into this nested function's body — still applies.
  const assessmentId = assessment.id

  function handleStart() {
    if (startAttempt.isPending) return
    // 1. Start the attempt.
    startAttempt.mutate(
      { assessmentId, idempotencyKey },
      {
        // 3. Navigate once the real attempt id comes back. SPA navigation
        // (no full page reload) preserves whatever fullscreen state step 2
        // just entered — that's what makes requesting fullscreen here, on
        // this page, still in effect once AttemptPage mounts.
        onSuccess: (attempt) => navigate(`/student/attempts/${attempt.id}`, { replace: true }),
      },
    )
    // 2. Request fullscreen — synchronously, still within this click's user
    // gesture, not inside onSuccess above. See module comment for why.
    //
    // If this rejects (user declined the browser prompt, or the API is
    // unsupported entirely — e.g. some mobile browsers), the attempt still
    // proceeds: the mutate() call above already fired, and by the time a
    // rejection could be known, doing anything other than proceeding would
    // stall the student on an attempt that already exists server-side (and,
    // depending on the assessment's maxAttempts, may have already consumed
    // an attempt slot) with no way back in except this exact click again.
    // Silently treating the attempt as "locked down" when it isn't would be
    // worse than proceeding, though — so this does NOT swallow the failure
    // invisibly. AttemptPage checks real fullscreen state on its own mount
    // (independent of this promise) and shows a persistent, honest "lockdown
    // isn't active" banner for the rest of the attempt if it isn't, with a
    // retry affordance right there. See AttemptPage.tsx's isLockdownActive.
    if (requiresFullscreen) {
      void requestFullscreen(document.documentElement).catch(() => {
        // Intentionally empty — see comment above for why this isn't
        // handled here.
      })
    }
  }

  return (
    <div className="p-6">
      <Link
        to={`/student/assessments/${assessment.id}`}
        className="text-sm text-brand-accent hover:underline"
      >
        &larr; Back to assessment details
      </Link>

      <div className="mt-3 max-w-xl rounded-lg border border-border bg-background p-6 shadow-sm">
        <h1 className="font-heading text-xl font-semibold text-brand-primary">
          Before you start: {assessment.title}
        </h1>

        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            {assessment.timerMinutes
              ? `You have ${assessment.timerMinutes} minutes once you start — the timer cannot be paused.`
              : 'This assessment has no time limit.'}
          </li>
          <li>Once you submit, you cannot change any answers — this cannot be undone.</li>
          {requiresFullscreen && (
            <>
              <li>
                This assessment requires fullscreen. Starting will ask your browser to enter
                fullscreen mode — please allow it.
              </li>
              <li>
                Exiting fullscreen or switching to another tab or window will automatically submit
                your attempt as-is. Stay on this tab, in fullscreen, for the whole attempt.
              </li>
            </>
          )}
        </ul>

        {startAttempt.isError && (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {describeStartAttemptError(startAttempt.error)}
          </p>
        )}

        <Button
          className="mt-5 w-full bg-brand-accent text-white hover:bg-brand-accent/90"
          disabled={startAttempt.isPending}
          onClick={handleStart}
        >
          {startAttempt.isPending ? 'Starting…' : 'I understand, start assessment'}
        </Button>
      </div>
    </div>
  )
}
