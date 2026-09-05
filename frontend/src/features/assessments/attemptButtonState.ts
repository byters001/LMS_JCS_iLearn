import type { AvailableAssessment } from './types'

export type AttemptButtonState =
  | { kind: 'not-live' }
  // Scheduled is its own kind (not folded into 'not-live') — item 2's fix:
  // a scheduled assessment previously fell into the generic not-live branch,
  // and AssessmentDetailPage.tsx specifically overrode that branch's label
  // to literally read "Start Test" (just disabled) — easy to misread as
  // live at a glance, screenshot-confirmed. Carrying startAt here lets both
  // surfaces (the card and the detail page) render the same "opens at X"
  // message from one source, instead of each formatting it independently.
  | { kind: 'scheduled'; startAt: string | null }
  | { kind: 'start' }
  | { kind: 'continue' }
  | { kind: 'retake' }
  | { kind: 'completed'; resultsAttemptId: string }
  // The assessment's window closed (endAt passed) while status is still
  // 'live' and the student never reached a completed-tier attempt — see the
  // endAt check below, replacing the "known gap" this kind used to be.
  | { kind: 'missed' }

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
  if (assessment.status === 'scheduled') return { kind: 'scheduled', startAt: assessment.startAt }
  if (assessment.status !== 'live') return { kind: 'not-live' }

  // Backend fix: publishAssessment never checked startAt against "now" —
  // status='live' only ever meant "reachable," not "the scheduled window
  // has actually opened." attempts.service.ts's assertAssessmentAttemptable
  // now enforces this server-side (rejects startAttempt with a
  // ConflictError before startAt), so status alone can no longer be trusted
  // here either. This branch mirrors the server check: a 'live' assessment
  // whose startAt is still in the future gets the exact same lock
  // treatment as a 'scheduled' one, reusing the 'scheduled' kind rather
  // than inventing a parallel one — both surfaces already render that
  // kind's "Opens at X" message from `startAt` alone, so nothing else
  // needs to change to pick this up.
  if (assessment.startAt && new Date(assessment.startAt).getTime() > Date.now()) {
    return { kind: 'scheduled', startAt: assessment.startAt }
  }

  // Fix for the endAt gap this comment used to flag: a 'live' assessment's
  // window can still close (endAt passes) while status never flips away
  // from 'live'. The backend already rejects startAttempt past endAt
  // (attempts.service.ts's assertAssessmentAttemptable) — this mirrors that
  // here so a student never sees "Start Test" for a window that's already
  // shut. Only applies to the two branches below that would otherwise fall
  // back to 'start' (no attempt, or an attempt whose status is in neither
  // RESUMABLE_STATUSES nor COMPLETED_TIER_STATUSES) — an attempt already
  // resumable or completed-tier is unaffected by the deadline passing.
  const isPastEnd = assessment.endAt !== null && new Date(assessment.endAt).getTime() <= Date.now()

  const attempt = assessment.myLatestAttempt
  if (!attempt) return isPastEnd ? { kind: 'missed' } : { kind: 'start' }

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
  // 'start' (or 'missed', once the window's closed) for anything
  // unrecognized rather than silently blocking a student from ever starting.
  return isPastEnd ? { kind: 'missed' } : { kind: 'start' }
}

// Shared button copy — StudentAssessmentsPage.tsx's card and
// AssessmentDetailPage.tsx's button both read from this ONE map, so the
// label a student sees never differs between the two surfaces for the same
// assessment.
export const ATTEMPT_BUTTON_LABELS: Record<AttemptButtonState['kind'], string> = {
  'not-live': 'View details',
  // Generic fallback only — both call sites special-case 'scheduled' to
  // show the actual formatted startAt instead of this static string (see
  // StudentAssessmentsPage.tsx's card and AssessmentDetailPage.tsx).
  scheduled: 'Not open yet',
  start: 'Start Test',
  continue: 'Continue Test',
  retake: 'Retake Test',
  // Phase 4 (final) — was 'Test Completed' (a static label, styled to look
  // clickable but not actually pointing anywhere informative beyond the
  // bare per-question breakdown). Both real call sites of this map
  // (StudentAssessmentsPage.tsx's card, AssessmentDetailPage.tsx's button)
  // now link to the new polished report page instead — this label change
  // and that retarget travel together, not a redundant second button next
  // to the old one.
  completed: 'View Report',
  // The assessment's window is closed and nothing was ever submitted —
  // distinct from 'completed' (which did get a submission), so it can't
  // reuse that label or its "View Report" link (there's no attempt/report
  // to view).
  missed: 'Missed',
}

// Shared per-kind CTA color — StudentAssessmentsPage.tsx's card/featured CTA
// and AssessmentDetailPage.tsx's button all read from this ONE map (same
// reasoning as ATTEMPT_BUTTON_LABELS above: one source, so the two surfaces
// can never render a different color for the same kind), replacing the
// bare buttonVariants({ variant: 'default' }) bg-primary/text-primary-
// foreground pairing every clickable kind used to share — that resolved to
// the app's orange --primary regardless of what the button actually meant.
// 'completed'/'scheduled'/'not-live' aren't here: each call site already
// gives them their own distinct (outline / locked-box) treatment, unrelated
// to this solid-CTA coloring.
//
// Contrast verified against WCAG's relative-luminance formula for white
// text on each fill (not eyeballed): green-700 #15803d -> 5.01:1,
// blue-700 #1d4ed8 -> 6.70:1, blue-600 #2563eb -> 5.17:1, red-700 #b91c1c
// -> 6.47:1, red-600 #dc2626 -> 4.83:1 — all clear WCAG AA's 4.5:1 for
// normal text. green-600 #16a34a was rejected for this (measures ~3.3:1,
// under AA) — that's why green keeps the same darker -700 shade in both
// modes instead of following blue/red's light-700/dark-600 pattern; a
// lighter dark-mode green would fail the same check that light-mode "just
// assumed" the gap comment above used to warn against.
export const ATTEMPT_BUTTON_COLOR_CLASSES: Partial<Record<AttemptButtonState['kind'], string>> = {
  start: 'bg-green-700 text-white hover:bg-green-800 dark:bg-green-700 dark:hover:bg-green-800',
  continue: 'bg-green-700 text-white hover:bg-green-800 dark:bg-green-700 dark:hover:bg-green-800',
  retake: 'bg-blue-700 text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700',
  // No hover shade — every call site renders this as a non-interactive
  // disabled-style element, not a clickable button (see ATTEMPT_BUTTON_LABELS'
  // own comment on why: there's no attempt to resume and no report to view).
  missed: 'bg-red-700 text-white dark:bg-red-600',
}
