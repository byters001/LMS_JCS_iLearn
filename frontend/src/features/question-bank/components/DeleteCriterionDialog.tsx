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
import { useDeleteCriterion } from '../api'
import type { QuestionPoolCriterion } from '../types'

interface DeleteCriterionDialogProps {
  poolId: string
  criterion: QuestionPoolCriterion
  open: boolean
  onOpenChange: (open: boolean) => void
}

// No orphaning-safety guard needed here (unlike the pool itself) —
// assessment_section_pools.question_pool_id references question_pools.id
// only; no table anywhere references an individual question_pool_criteria
// row (confirmed by grep across db/schema). Deleting a criterion just
// changes what the pool draws on its next resolve — it can turn a
// previously-fully-satisfied pool under-supplied, but that's surfaced by
// "Preview Resolution" after the fact, not a hazard this dialog needs to
// pre-empt. A plain confirmation is the honest match for the real risk.
export function DeleteCriterionDialog({
  poolId,
  criterion,
  open,
  onOpenChange,
}: DeleteCriterionDialogProps) {
  const deleteCriterion = useDeleteCriterion(poolId)

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      deleteCriterion.reset()
    }
    onOpenChange(nextOpen)
  }

  function handleConfirm() {
    deleteCriterion.mutate(criterion.id, { onSuccess: () => handleClose(false) })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this criterion?</DialogTitle>
          <DialogDescription>
            The pool will stop drawing questions for this criterion on its next resolution. This
            may make the pool under-supplied if no other criterion covers the same requirement.
            This action cannot be undone from the UI.
          </DialogDescription>
        </DialogHeader>

        {deleteCriterion.isError && (
          <p className="text-sm text-destructive">
            {deleteCriterion.error instanceof ApiError
              ? deleteCriterion.error.message
              : 'Failed to delete criterion. Please try again.'}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteCriterion.isPending}
            onClick={handleConfirm}
          >
            {deleteCriterion.isPending ? 'Deleting…' : 'Delete Criterion'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
