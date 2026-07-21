import type { AvailableAssessment } from './types'

export type AttemptButtonState =
  | { kind: 'not-live' }
  | { kind: 'start' }
  | { kind: 'continue' }
  | { kind: 'retake' }
  | { kind: 'completed'; resultsAttemptId: string }

// Attempts are always created with status 'in_progress' directly (see
// backend's attempts.repository.ts's createAttemptWithSelections) —
// 'not_started' is included defensively for a real row that could exist
// with that status, not because one currently ever gets written.
const RESUMABLE_STATUSES = new Set(['not_started', 'in_progress'])
const COMPLETED_TIER_STATUSES = new Set(['submitted', 'pending_evaluation', 'invalidated'])

// Assessment card button-state phase — the single source of truth for
// Start/Continue/Retake/Completed, shared by StudentAssessmentsPage.tsx's
// card and AssessmentDetailPage.tsx's button so the two surfaces can never
// disagree. Derived entirely from data GET /assessments/available already
// returns (assessment.status + the new myLatestAttempt join added this
// phase) — no per-card lookup, no new endpoint.
export function getAttemptButtonState(assessment: AvailableAssessment): AttemptButtonState {
  if (assessment.status !== 'live') return { kind: 'not-live' }

  const attempt = assessment.myLatestAttempt
  if (!attempt) return { kind: 'start' }

  if (RESUMABLE_STATUSES.has(attempt.status)) return { kind: 'continue' }

  if (COMPLETED_TIER_STATUSES.has(attempt.status)) {
    // Known gap: approved assessment_retake_requests grants can raise the
    // REAL ceiling above maxAttempts server-side (attempts.service.ts's
    // startAttempt computes effectiveMaxAttempts = maxAttempts +
    // approvedRetakeCount) — this comparison doesn't see those, so a
    // student with an approved extra retake may still show "completed"
    // here even though the backend would actually let them start one if
    // they somehow reached the start flow. Fixing it would mean joining
    // assessment_retake_requests into GET /assessments/available too,
    // which is out of this phase's "small field addition" scope — flagged
    // rather than silently handled wrong.
    if (attempt.attemptNumber < assessment.maxAttempts) return { kind: 'retake' }
    return { kind: 'completed', resultsAttemptId: attempt.id }
  }

  // Exhaustive over AttemptStatus's real current values; falls back to
  // 'start' for anything unrecognized rather than silently blocking a
  // student from ever starting.
  return { kind: 'start' }
}

// Shared button copy — StudentAssessmentsPage.tsx's card and
// AssessmentDetailPage.tsx's button both read from this ONE map, so the
// label a student sees never differs between the two surfaces for the same
// assessment.
export const ATTEMPT_BUTTON_LABELS: Record<AttemptButtonState['kind'], string> = {
  'not-live': 'View details',
  start: 'Start Test',
  continue: 'Continue Test',
  retake: 'Retake Test',
  completed: 'Test Completed',
}
