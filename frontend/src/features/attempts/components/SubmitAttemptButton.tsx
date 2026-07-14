import { useState } from 'react'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { useSubmitAttempt } from '../api'

interface SubmitAttemptButtonProps {
  attemptId: string
  answeredCount: number
  totalCount: number
  onSubmitted: () => void
}

// Visible from the navigator area (not per-question) — final submit is an
// attempt-level action, not a per-question one. No shared components/ui
// dialog exists yet (and adding one is outside this phase's stated
// features/attempts + coding/CodeEditor scope), so the confirmation is a
// small self-contained modal here rather than a new shared component.
export function SubmitAttemptButton({
  attemptId,
  answeredCount,
  totalCount,
  onSubmitted,
}: SubmitAttemptButtonProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  // Generated once when the confirmation is TRIGGERED (dialog opened), not
  // once per click of "Yes, submit" inside it — retrying the same confirm
  // click after a network failure (without closing the dialog) reuses this
  // same key; closing and reopening the dialog is a fresh attempt at the
  // action and gets a fresh key.
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)
  const submitAttempt = useSubmitAttempt(attemptId)

  function openConfirm() {
    setIdempotencyKey(crypto.randomUUID())
    setIsConfirmOpen(true)
  }

  function closeConfirm() {
    if (submitAttempt.isPending) return
    setIsConfirmOpen(false)
  }

  function confirmSubmit() {
    if (!idempotencyKey) return
    submitAttempt.mutate({ idempotencyKey }, { onSuccess: onSubmitted })
  }

  return (
    <>
      <Button variant="outline" className="w-full" onClick={openConfirm}>
        Submit Attempt
      </Button>

      {isConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-xl">
            <h2 className="text-base font-semibold text-brand-primary">Submit this attempt?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {answeredCount} of {totalCount} questions answered. Once submitted, you cannot
              change any answers — this cannot be undone.
            </p>

            {submitAttempt.isError && (
              <p className="mt-3 text-sm text-destructive">
                {submitAttempt.error instanceof ApiError
                  ? submitAttempt.error.message
                  : 'Failed to submit — try again.'}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" disabled={submitAttempt.isPending} onClick={closeConfirm}>
                Cancel
              </Button>
              <Button
                className="bg-brand-accent text-white hover:bg-brand-accent/90"
                disabled={submitAttempt.isPending}
                onClick={confirmSubmit}
              >
                {submitAttempt.isPending ? 'Submitting…' : 'Yes, submit'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
