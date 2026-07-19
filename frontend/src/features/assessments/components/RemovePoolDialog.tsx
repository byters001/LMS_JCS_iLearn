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
import { useRemovePool } from '../api'

interface RemovePoolDialogProps {
  assessmentId: string
  sectionId: string
  poolId: string
  poolName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Removes one assessment_section_pools row — not the pool itself
// (question-bank's own question_pools row is untouched, and remains
// attachable to other sections/assessments). No orphaning concern in this
// direction: nothing references assessment_section_pools.id, and this is
// only reachable while the parent assessment is still 'draft'
// (assertAssessmentEditable) — the exact opposite direction from tier 3a's
// DeletePoolDialog (which guards deleting the POOL itself while a live
// assessment still depends on it). A plain confirmation.
export function RemovePoolDialog({
  assessmentId,
  sectionId,
  poolId,
  poolName,
  open,
  onOpenChange,
}: RemovePoolDialogProps) {
  const removePool = useRemovePool(assessmentId)

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      removePool.reset()
    }
    onOpenChange(nextOpen)
  }

  function handleConfirm() {
    removePool.mutate({ sectionId, poolId }, { onSuccess: () => handleClose(false) })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {poolName} from this section?</DialogTitle>
          <DialogDescription>
            This section will stop drawing questions from &quot;{poolName}&quot;. The pool itself
            is untouched — you can attach it again later if needed.
          </DialogDescription>
        </DialogHeader>

        {removePool.isError && (
          <p className="text-sm text-destructive">
            {removePool.error instanceof ApiError
              ? removePool.error.message
              : 'Failed to remove pool. Please try again.'}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={removePool.isPending}
            onClick={handleConfirm}
          >
            {removePool.isPending ? 'Removing…' : 'Remove Pool'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
