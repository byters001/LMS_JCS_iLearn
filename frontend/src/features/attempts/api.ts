// TanStack Query hooks for the "attempts" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import type { Attempt, AttemptResponse, AttemptQuestion, SubmitCodeResult } from './types'

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

// Patches the cached questions array's matching entry's `savedResponse`
// in place, rather than invalidating/refetching the whole list — this
// endpoint's response already carries everything `savedResponse` needs
// (see backend/attempts.types.ts's SanitizedSavedResponse, which is exactly
// {selectedOptionId, likertValue, isMarkedForReview}, a subset of what
// submitResponse/submitCode return). Used by both useSubmitResponse and
// useSubmitCode below so:
//   - navigating away and back to the same question within one page visit
//     shows the just-saved state immediately, without waiting on a refetch
//   - the "X of Y answered" count (SubmitAttemptButton) updates live as
//     each question is saved
function patchSavedResponse(
  queryClient: ReturnType<typeof useQueryClient>,
  attemptId: string,
  questionVersionId: string,
  savedResponse: { selectedOptionId: string | null; likertValue: number | null; isMarkedForReview: boolean },
) {
  queryClient.setQueryData<AttemptQuestion[]>(['attempts', attemptId, 'questions'], (prev) =>
    prev?.map((question) =>
      question.questionVersionId === questionVersionId ? { ...question, savedResponse } : question,
    ),
  )
}

interface SubmitResponseVariables {
  questionVersionId: string
  selectedOptionId?: string
  likertValue?: number
  // Fresh per distinct answer, stable across a retry of the same one — see
  // useStableIdempotencyKey.ts for exactly how callers derive this.
  idempotencyKey: string
}

function submitResponse(
  attemptId: string,
  { questionVersionId, idempotencyKey, ...body }: SubmitResponseVariables,
): Promise<AttemptResponse> {
  return api.put<AttemptResponse>(`/attempts/${attemptId}/responses/${questionVersionId}`, body, {
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

// Used by both McqQuestion (selectedOptionId) and PsychometricQuestion
// (likertValue) — same route, same Idempotency-Key requirement, just a
// different one of the two optional body fields set per caller.
export function useSubmitResponse(attemptId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: SubmitResponseVariables) => submitResponse(attemptId, variables),
    onSuccess: (data) => {
      patchSavedResponse(queryClient, attemptId, data.questionVersionId, {
        selectedOptionId: data.selectedOptionId,
        likertValue: data.likertValue,
        isMarkedForReview: data.isMarkedForReview,
      })
    },
  })
}

interface SubmitCodeVariables {
  questionVersionId: string
  language: string
  sourceCode: string
  idempotencyKey: string
}

function submitCode(
  attemptId: string,
  { questionVersionId, idempotencyKey, ...body }: SubmitCodeVariables,
): Promise<SubmitCodeResult> {
  return api.post<SubmitCodeResult>(
    `/attempts/${attemptId}/responses/${questionVersionId}/submit-code`,
    body,
    { headers: { 'Idempotency-Key': idempotencyKey } },
  )
}

// A REAL Judge0 call (several seconds) — CodingQuestion is responsible for
// surfacing isPending as a clear loading state and disabling a second
// submit while one is in flight (mutation.isPending already covers that:
// TanStack Query mutations don't run two invocations of the same
// useMutation instance concurrently from this hook's perspective, but the
// UI must still disable the button itself so a click during isPending
// doesn't queue up a second real request).
export function useSubmitCode(attemptId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: SubmitCodeVariables) => submitCode(attemptId, variables),
    onSuccess: (data) => {
      // isMarkedForReview isn't settable via submit-code (submitCodeSchema
      // has no such field), so this is always false here — the point of
      // this patch is purely to mark the question as "answered" for the
      // "X of Y answered" count, matching every other question type's
      // savedResponse-presence-means-answered convention.
      patchSavedResponse(queryClient, attemptId, data.questionVersionId, {
        selectedOptionId: null,
        likertValue: null,
        isMarkedForReview: data.isMarkedForReview,
      })
    },
  })
}

interface SubmitAttemptVariables {
  // Generated once when the final-submit confirmation dialog is triggered
  // (opened), reused across retries of that same confirm click — see
  // SubmitAttemptButton.tsx.
  idempotencyKey: string
}

function submitAttemptRequest(
  attemptId: string,
  { idempotencyKey }: SubmitAttemptVariables,
): Promise<Attempt> {
  return api.post<Attempt>(`/attempts/${attemptId}/submit`, undefined, {
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export function useSubmitAttempt(attemptId: string) {
  return useMutation({
    mutationFn: (variables: SubmitAttemptVariables) => submitAttemptRequest(attemptId, variables),
  })
}
