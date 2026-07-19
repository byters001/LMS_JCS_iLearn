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
import { useDeleteAssessment } from '../api'
import type { Assessment } from '../types'

interface DeleteAssessmentDialogProps {
  assessment: Assessment
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}

// My orphaning read on DELETE /assessments/:id (item 10 tier 3b's explicit
// ask): confirmed soft delete (assessments.deleted_at — assessments.
// repository.ts's deleteAssessment, an UPDATE) AND confirmed
// assessments.service.ts's deleteAssessment calls assertAssessmentEditable
// first, so this is only ever reachable while status === 'draft' — the
// backend, not just this dialog, enforces that; AssessmentEditPage hides
// this button entirely outside draft rather than relying on the 409.
//
// Two things to check, given every prior tier's soft-delete-defeats-RESTRICT
// pattern:
//
// 1. assessment_attempts.assessment_id -> assessments(id) ON DELETE
//    RESTRICT (schema.sql). Same defeated-RESTRICT shape as tier 3a's
//    pools — but the real question isn't "does the constraint fire," it's
//    "could a row exist to violate it in the first place." Confirmed
//    directly against attempts.service.ts: assertAssessmentAttemptable
//    only allows starting an attempt when assessment.status === 'live'.
//    The approval workflow (assessments.service.ts) is a strictly linear
//    state machine with exactly one branch — reject, which moves
//    review -> draft — and that branch sits BEFORE live in the chain
//    (draft -> review -> approved -> scheduled -> live -> completed ->
//    archived). There is no action anywhere that moves an assessment from
//    live (or anything after it) back to draft. So an assessment currently
//    in status='draft' has, by construction, never been 'live' at any
//    point in its history — which means it PROVABLY has zero
//    assessment_attempts rows. Draft-only isn't just "probably fine," it's
//    a real guarantee here, not merely mirroring a pattern from a
//    different tier.
//
// 2. assessment_sections.assessment_id -> assessments(id) ON DELETE
//    CASCADE, and (one level further) assessment_questions/
//    assessment_section_pools -> assessment_sections(id) ON DELETE
//    CASCADE. This CASCADE can never fire either, for the same soft-
//    delete reason — no literal SQL DELETE ever touches the assessments
//    row. So a deleted assessment's sections/questions/pool-links remain
//    physically in the database, uncascaded. But unlike tier 3a's pool
//    case, this isn't a live-usage hazard: every path that could reach
//    those child rows (listAssessmentSections, findAssessmentSectionById,
//    resolveSectionQuestions, etc.) calls findAssessmentById first, which
//    filters deleted_at IS NULL and 404s — so the orphaned rows become
//    permanently unreachable through the API the instant the parent is
//    deleted, same as they'd be if actually cascaded. They're inert
//    leftover storage, not a dangling reference anything can still act on.
//
// Net: draft-only status is sufficient on its own here — no additional
// dependent-check guard is needed (unlike pools in tier 3a), so this
// dialog is a plain confirmation, not a blocking one.
export function DeleteAssessmentDialog({
  assessment,
  open,
  onOpenChange,
  onDeleted,
}: DeleteAssessmentDialogProps) {
  const deleteAssessment = useDeleteAssessment()

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      deleteAssessment.reset()
    }
    onOpenChange(nextOpen)
  }

  function handleConfirm() {
    deleteAssessment.mutate(assessment.id, {
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
          <DialogTitle>Delete {assessment.title}?</DialogTitle>
          <DialogDescription>
            This assessment is still a draft, so nothing has ever been able to attempt it — no
            attempts exist and none can be orphaned by this. Its sections, questions, and attached
            pools go with it. This action cannot be undone from the UI.
          </DialogDescription>
        </DialogHeader>

        {deleteAssessment.isError && (
          <p className="text-sm text-destructive">
            {deleteAssessment.error instanceof ApiError
              ? deleteAssessment.error.message
              : 'Failed to delete assessment. Please try again.'}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteAssessment.isPending}
            onClick={handleConfirm}
          >
            {deleteAssessment.isPending ? 'Deleting…' : 'Delete Assessment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
