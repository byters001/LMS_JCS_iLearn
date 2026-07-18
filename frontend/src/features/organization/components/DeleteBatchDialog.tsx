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
import { useBatchTrainers, useDeleteBatch } from '../api'
import type { Batch } from '../types'

interface DeleteBatchDialogProps {
  batch: Batch
  open: boolean
  onOpenChange: (open: boolean) => void
}

// My read on DELETE /batches/:id before wiring this up (item 10 tier 2's
// explicit ask — "check the actual FK behavior... same discipline as
// colleges"):
//
// organization.repository.ts's deleteBatch is a SOFT delete
// (batches.deleted_at, an UPDATE — confirmed by reading it directly, same
// as colleges/departments), so none of the real FK constraints on
// batch_id can ever actually fire (they only guard a literal SQL DELETE):
//   - training_program_students.batch_id -> ON DELETE RESTRICT
//     (students.schema.ts) — the direct enrollment link. This is the one
//     that matters: RESTRICT signals the schema's own authors considered
//     "a batch with real students" something that should NOT be
//     deletable, but the soft-delete path bypasses that protection
//     entirely.
//   - batch_trainers.batch_id -> ON DELETE CASCADE (organization.
//     schema.ts) and assessment_batches.batch_id -> ON DELETE CASCADE
//     (assessments.schema.ts) — both would auto-clean on a REAL delete,
//     but since this is a soft delete, neither actually fires; those rows
//     just keep pointing at a now-hidden batch.
// organization.service.ts's deleteBatch does no dependent check of its
// own either (confirmed by reading it directly) — it would happily
// soft-delete a batch that still has enrolled students, assigned
// trainers, or assessments scoped to it, silently vanishing it from
// useBatches/useMyBatches (both deletedAt-filtered) while all of that
// still references it.
//
// This dialog blocks on the one dependent that represents real people's
// enrollment data (batch.studentCount — already present on the Batch
// object from listBatches/listMyBatches, no extra query needed) — the
// same "one direct, most-consequential check is sufficient" precedent
// DeleteCollegeDialog.tsx already established. Assigned trainers are
// surfaced as an informational note, not a hard block: reassigning a
// trainer elsewhere is trivial and reversible, nowhere near the same
// stakes as silently orphaning real students' enrollment history.
export function DeleteBatchDialog({ batch, open, onOpenChange }: DeleteBatchDialogProps) {
  const trainers = useBatchTrainers(batch.id, { page: 1, pageSize: 1 })
  const deleteBatch = useDeleteBatch()

  const hasDependents = batch.studentCount > 0
  const trainerCount = trainers.data?.total

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      deleteBatch.reset()
    }
    onOpenChange(nextOpen)
  }

  function handleConfirm() {
    deleteBatch.mutate(batch.id, { onSuccess: () => handleClose(false) })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {batch.name}?</DialogTitle>
          {hasDependents ? (
            <DialogDescription>
              This batch still has {batch.studentCount} enrolled student
              {batch.studentCount === 1 ? '' : 's'} — remove or transfer{' '}
              {batch.studentCount === 1 ? 'it' : 'them'} first. Deleting a batch with active
              enrollment would silently hide it from every batch list while those students'
              records still point at it.
            </DialogDescription>
          ) : (
            <DialogDescription>
              This removes {batch.name} from every batch list (Admin and Trainer views alike).
              {trainerCount !== undefined && trainerCount > 0
                ? ` ${trainerCount} trainer${trainerCount === 1 ? ' is' : 's are'} still assigned to it — they'll stop seeing it in My Batches.`
                : ''}{' '}
              This action cannot be undone from the UI.
            </DialogDescription>
          )}
        </DialogHeader>

        {deleteBatch.isError && (
          <p className="text-sm text-destructive">
            {deleteBatch.error instanceof ApiError
              ? deleteBatch.error.message
              : 'Failed to delete batch. Please try again.'}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={hasDependents || deleteBatch.isPending}
            onClick={handleConfirm}
          >
            {deleteBatch.isPending ? 'Deleting…' : 'Delete Batch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
