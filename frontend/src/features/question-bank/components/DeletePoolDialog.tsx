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
import { useAssessmentsUsingPool } from '@/features/assessments/api'
import { useDeletePool } from '../api'
import type { QuestionPool } from '../types'

interface DeletePoolDialogProps {
  pool: QuestionPool
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}

// My read on DELETE /question-pools/:id before wiring this up (item 10
// tier 3a's explicit ask): confirmed soft delete (question_pools.deleted_at,
// an UPDATE — question-bank.repository.ts's deleteQuestionPool), same
// pattern as everything else this session. That means schema.sql's own
// ON DELETE RESTRICT on assessment_section_pools.question_pool_id — which
// that column's own comment says exists specifically so "a pool in active
// use by a scheduled/live assessment section can't be silently deleted out
// from under it" — can never actually fire, because RESTRICT only guards a
// literal SQL DELETE and this codebase never issues one for pools.
//
// Unlike questions (see DeleteQuestionDialog.tsx), this IS a real,
// live-usage-breaking risk: question-bank.service.ts's resolveQuestionPool
// calls findQuestionPoolById first, which throws NotFoundError on a
// soft-deleted pool — and that resolution path runs live whenever an
// attempt starts against an assessment section that draws from this pool.
// Soft-deleting a pool still referenced by assessment_section_pools would
// break attempt-start for that section immediately, not just cause a
// discoverability inconvenience.
//
// No existing endpoint answered "which assessments use this pool" (confirmed
// by grep), so this tier added one — GET /assessments/pools/:poolId/usage
// (assessments module, to avoid a circular import back into question-bank).
// This dialog fetches that list and BLOCKS the delete entirely if any
// non-deleted assessment currently references this pool through any of its
// sections, same "fetch dependents, block if any exist" shape
// DeleteCollegeDialog.tsx already established for colleges/departments.
export function DeletePoolDialog({ pool, open, onOpenChange, onDeleted }: DeletePoolDialogProps) {
  const usage = useAssessmentsUsingPool(pool.id, { enabled: open })
  const deletePool = useDeletePool()

  const usageCount = usage.data?.length
  const hasDependents = (usageCount ?? 0) > 0

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      deletePool.reset()
    }
    onOpenChange(nextOpen)
  }

  function handleConfirm() {
    deletePool.mutate(pool.id, {
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
          <DialogTitle>Delete {pool.name}?</DialogTitle>
          {usage.isPending ? (
            <DialogDescription>Checking for assessments using this pool…</DialogDescription>
          ) : usage.isError ? (
            <DialogDescription className="text-destructive">
              Couldn't verify whether any assessment uses this pool — try again before deleting.
            </DialogDescription>
          ) : hasDependents ? (
            <DialogDescription>
              This pool is still used by {usageCount} assessment{usageCount === 1 ? '' : 's'}
              {': '}
              {usage.data?.map((row) => row.assessmentTitle).join(', ')}. Remove it from{' '}
              {usageCount === 1 ? 'that assessment' : 'those assessments'} first — deleting it now
              would break attempt-start for any section that draws from this pool.
            </DialogDescription>
          ) : (
            <DialogDescription>
              This removes {pool.name} from the question bank. No assessment currently references
              it, so this is safe. This action cannot be undone from the UI.
            </DialogDescription>
          )}
        </DialogHeader>

        {deletePool.isError && (
          <p className="text-sm text-destructive">
            {deletePool.error instanceof ApiError
              ? deletePool.error.message
              : 'Failed to delete pool. Please try again.'}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={usage.isPending || usage.isError || hasDependents || deletePool.isPending}
            onClick={handleConfirm}
          >
            {deletePool.isPending ? 'Deleting…' : 'Delete Pool'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
