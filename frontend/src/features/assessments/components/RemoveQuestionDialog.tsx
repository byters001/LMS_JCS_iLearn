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
import { useRemoveQuestion } from '../api'

interface RemoveQuestionDialogProps {
  assessmentId: string
  sectionId: string
  questionId: string
  questionText: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Removes one manual assessment_questions row — not the question itself
// (question-bank's own question/version rows are untouched). No orphaning
// concern: nothing references assessment_questions.id (confirmed by grep
// across db/schema — attempt_question_selections/attempt_responses both
// reference question_version_id directly, never this junction row), and
// this is only reachable while the parent assessment is still 'draft'
// (assertAssessmentEditable), so no attempt could be depending on this
// section's current question list anyway. A plain confirmation.
export function RemoveQuestionDialog({
  assessmentId,
  sectionId,
  questionId,
  questionText,
  open,
  onOpenChange,
}: RemoveQuestionDialogProps) {
  const removeQuestion = useRemoveQuestion(assessmentId)

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      removeQuestion.reset()
    }
    onOpenChange(nextOpen)
  }

  function handleConfirm() {
    removeQuestion.mutate({ sectionId, questionId }, { onSuccess: () => handleClose(false) })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove this question from the section?</DialogTitle>
          <DialogDescription>
            &quot;{questionText}&quot; will no longer appear in this section. The question itself
            stays in the question bank, untouched — you can attach it again later if needed.
          </DialogDescription>
        </DialogHeader>

        {removeQuestion.isError && (
          <p className="text-sm text-destructive">
            {removeQuestion.error instanceof ApiError
              ? removeQuestion.error.message
              : 'Failed to remove question. Please try again.'}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={removeQuestion.isPending}
            onClick={handleConfirm}
          >
            {removeQuestion.isPending ? 'Removing…' : 'Remove Question'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
