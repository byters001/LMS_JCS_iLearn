// TanStack Query hooks for the "attempts" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import type { Attempt, AttemptQuestion } from './types'

interface StartAttemptVariables {
  assessmentId: string
  // Generated ONCE per page visit by the caller (see
  // features/assessments/pages/AssessmentDetailPage.tsx's
  // `useState(() => crypto.randomUUID())`) and reused across every
  // retry/double-click of "Start Attempt" on that same page instance. This
  // hook does not generate or cache the key itself — it only forwards
  // whatever it's given as the Idempotency-Key header (CLAUDE1.md
  // non-negotiable #8), so the backend's idempotency plugin can recognize
  // a retry and replay the first attempt instead of creating a duplicate.
  idempotencyKey: string
}

function startAttempt({ assessmentId, idempotencyKey }: StartAttemptVariables): Promise<Attempt> {
  return api.post<Attempt>(
    '/attempts',
    { assessmentId },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  )
}

export function useStartAttempt() {
  return useMutation({
    mutationFn: startAttempt,
  })
}

// --- Part 2: question rendering ---

function getAttempt(attemptId: string): Promise<Attempt> {
  return api.get<Attempt>(`/attempts/${attemptId}`)
}

// Used by AttemptPage to resolve this attempt's assessmentId, which is
// then used to look up timerMinutes from whatever available-assessments
// list is already cached (see AttemptPage.tsx's comment on why there's no
// direct student-scoped endpoint for that).
export function useAttempt(attemptId: string | undefined) {
  return useQuery({
    queryKey: ['attempts', attemptId],
    queryFn: () => getAttempt(attemptId as string),
    enabled: Boolean(attemptId),
  })
}

function getAttemptQuestions(attemptId: string): Promise<AttemptQuestion[]> {
  return api.get<AttemptQuestion[]>(`/attempts/${attemptId}/questions`)
}

// Wraps GET /attempts/:attemptId/questions — reads the FROZEN
// attempt_question_selections snapshot (see attempts.service.ts's
// getAttemptQuestions), never re-resolves the assessment's sections live,
// so this is stable for the lifetime of the attempt regardless of any
// later edits to the assessment itself.
export function useAttemptQuestions(attemptId: string | undefined) {
  return useQuery({
    queryKey: ['attempts', attemptId, 'questions'],
    queryFn: () => getAttemptQuestions(attemptId as string),
    enabled: Boolean(attemptId),
  })
}
