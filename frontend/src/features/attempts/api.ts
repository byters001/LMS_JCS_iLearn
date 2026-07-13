// TanStack Query hooks for the "attempts" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { useMutation } from '@tanstack/react-query'
import { api } from '@/api'
import type { Attempt } from './types'

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
