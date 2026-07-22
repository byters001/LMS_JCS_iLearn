import { useId, useState } from 'react'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSubmitAttempt } from '../api'

interface SubmitAttemptButtonProps {
  attemptId: string
  answeredCount: number
  totalCount: number
  onSubmitted: () => void
  // Autosave phase — Submit Attempt is reachable at any time, not gated on
  // "last question" or on having navigated away first, so it's itself a
  // form of leaving the current question — the same unsaved-answer risk
  // Next/Previous/the navigator already guard against (see AttemptPage.tsx's
  // trySaveCurrentAnswer, passed in as this prop). Optional because
  // AttemptPage only has a save handle to offer while the current question
  // is mcq/psychometric — undefined means "nothing to save, proceed."
  // Returning false means the save failed; the confirm dialog does not open
  // in that case, keeping the student on the question that failed to save.
  onBeforeSubmit?: () => Promise<boolean>
  // True for the brief window a save triggered by onBeforeSubmit (or by
  // AttemptPage's Next/Previous/navigator) is in flight — disables this
  // button too, so a click here can't race a save already underway from a
  // different trigger.
  disabled?: boolean
}

// The exact string a student must type (case-insensitive) before "Yes,
// submit" enables. This confirmation applies ONLY to this manual-submit
// dialog — AttemptPage's autoSubmit() (timer expiry, fullscreen exit, tab
// switch) calls useSubmitAttempt directly and never renders this component
// at all, so those already-non-cancelable takeover flows are structurally
// incapable of showing a text box that would just block a submission the
// student can't stop anyway.
const CONFIRMATION_PHRASE = 'END'

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
  onBeforeSubmit,
  disabled,
}: SubmitAttemptButtonProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  // Distinct from submitAttempt.isPending below — this covers only the
  // brief onBeforeSubmit() window, BEFORE the confirm dialog has even
  // opened, so the button can't be clicked again while that's in flight.
  const [isCheckingBeforeSubmit, setIsCheckingBeforeSubmit] = useState(false)
  // Generated once when the confirmation is TRIGGERED (dialog opened), not
  // once per click of "Yes, submit" inside it — retrying the same confirm
  // click after a network failure (without closing the dialog) reuses this
  // same key; closing and reopening the dialog is a fresh attempt at the
  // action and gets a fresh key.
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)
  const [confirmationText, setConfirmationText] = useState('')
  const submitAttempt = useSubmitAttempt(attemptId)
  const confirmInputId = useId()

  const isConfirmationValid = confirmationText.trim().toUpperCase() === CONFIRMATION_PHRASE

  async function openConfirm() {
    if (onBeforeSubmit) {
      setIsCheckingBeforeSubmit(true)
      const canProceed = await onBeforeSubmit().finally(() => setIsCheckingBeforeSubmit(false))
      // onBeforeSubmit itself is responsible for surfacing why (toast +
      // inline error on the question that failed to save) — this just
      // stops short of opening a confirmation dialog for a submission that
      // wouldn't include the student's latest answer.
      if (!canProceed) return
    }
    setIdempotencyKey(crypto.randomUUID())
    setConfirmationText('')
    setIsConfirmOpen(true)
  }

  function closeConfirm() {
    if (submitAttempt.isPending) return
    setIsConfirmOpen(false)
    setConfirmationText('')
  }

  function confirmSubmit() {
    if (!idempotencyKey || !isConfirmationValid) return
    submitAttempt.mutate({ idempotencyKey }, { onSuccess: onSubmitted })
  }

  return (
    <>
      <Button
        variant="outline"
        className="w-full"
        disabled={disabled || isCheckingBeforeSubmit}
        onClick={openConfirm}
      >
        {isCheckingBeforeSubmit ? 'Saving…' : 'Submit Attempt'}
      </Button>

      {isConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-xl">
            <h2 className="text-base font-semibold text-brand-primary">Submit this attempt?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {answeredCount} of {totalCount} questions answered. Once submitted, you cannot
              change any answers — this cannot be undone.
            </p>

            <div className="mt-4">
              <label
                htmlFor={confirmInputId}
                className="text-xs font-medium text-muted-foreground"
              >
                Type <span className="font-semibold text-brand-primary">END</span> to confirm
              </label>
              <Input
                id={confirmInputId}
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                disabled={submitAttempt.isPending}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="END"
                className="mt-1"
              />
            </div>

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
                disabled={submitAttempt.isPending || !isConfirmationValid}
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
