import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDeleteQuestion } from '../api'
import type { QuestionWithCurrentVersion } from '../types'

interface DeleteQuestionDialogProps {
  question: QuestionWithCurrentVersion
  open: boolean
  onOpenChange: (open: boolean) => void
  // Fired only on a successful delete (never on Cancel/backdrop-close) —
  // lets QuestionDetailPage navigate away, since the question 404s at its
  // current URL once deleted.
  onDeleted?: () => void
}

// My read on DELETE /questions/:id before wiring this up (item 10 tier 3a's
// explicit ask): confirmed soft delete (questions.deleted_at, an UPDATE —
// question-bank.repository.ts's deleteQuestion) same as every other tier.
// But UNLIKE pools (see DeletePoolDialog.tsx), this needs no blocking
// dependent-check guard:
//
// assessment_questions.question_version_id references question_versions.id
// directly (ON DELETE RESTRICT) — NOT questions.id. Soft-deleting a
// `questions` row only ever sets questions.deleted_at; it never touches
// question_versions or any of that version's content tables. So any
// assessment that has already attached a version of this question keeps
// working exactly as before — the frozen content, attempt scoring, and
// everything attempt_question_selections/attempt_responses depend on
// (also both ON DELETE RESTRICT on question_versions.id, never questions.id)
// is completely unaffected by this delete.
//
// The one real (much smaller) side effect: findQuestionById/listQuestions
// both filter deleted_at IS NULL, so a deleted question stops showing up
// in the Question Bank's own browse/search UI — a discoverability
// inconvenience for anyone trying to look it back up, not a data-integrity
// or attempt-scoring hazard. No existing endpoint answers "is this
// question attached to any assessment" (confirmed by grep — nothing does,
// unlike pools where assessment_section_pools already has that reverse
// path implied), and building one for a risk this low doesn't earn its
// keep. This dialog is a plain confirmation with an honest description of
// that real (low) impact, not a blocking guard.
export function DeleteQuestionDialog({
  question,
  open,
  onOpenChange,
  onDeleted,
}: DeleteQuestionDialogProps) {
  const deleteQuestion = useDeleteQuestion()

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      deleteQuestion.reset()
    }
    onOpenChange(nextOpen)
  }

  function handleConfirm() {
    deleteQuestion.mutate(question.id, {
      onSuccess: () => {
        handleClose(false)
        onDeleted?.()
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this question?</DialogTitle>
          <DialogDescription>
            This removes it from the question bank's browse/search and from any pool it could
            otherwise be drawn into. If any assessment already includes a version of this
            question, that assessment is unaffected — its frozen content and any graded attempts
            stay exactly as they are. This action cannot be undone from the UI.
          </DialogDescription>
        </DialogHeader>

        {deleteQuestion.isError && (
          <p className="text-sm text-destructive">
            {deleteQuestion.error instanceof ApiError
              ? deleteQuestion.error.message
              : 'Failed to delete question. Please try again.'}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteQuestion.isPending}
            onClick={handleConfirm}
          >
            {deleteQuestion.isPending ? 'Deleting…' : 'Delete Question'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
