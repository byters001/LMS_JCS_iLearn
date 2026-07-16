import { X } from 'lucide-react'
import { useState } from 'react'
import { ApiError } from '@/api'
import { Combobox } from '@/components/Combobox'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUsers } from '@/features/users/api'
import { useAssignTrainerToBatch, useBatchTrainers, useUnassignTrainerFromBatch } from '../api'

interface AssignTrainerDialogProps {
  batchId: string
  batchName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Generous upper bound for the trainer picker, same "small enough to just
// fetch in one page" call as BatchListPage's own COLLEGE_PICKER_PAGE_SIZE.
const TRAINER_PICKER_PAGE_SIZE = 100

// Combobox itself is single-select — "multi-select" here means each pick
// stages one trainer into a chip list below, which can grow before a single
// "Assign" click submits every staged trainer. There's no bulk-assign
// endpoint on the backend (POST /batches/:id/trainers assigns one trainer
// per call), so submitting fires one mutation per staged trainer.
export function AssignTrainerDialog({
  batchId,
  batchName,
  open,
  onOpenChange,
}: AssignTrainerDialogProps) {
  const [stagedTrainerIds, setStagedTrainerIds] = useState<string[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)

  const trainers = useUsers(
    { roleSlug: 'faculty', page: 1, pageSize: TRAINER_PICKER_PAGE_SIZE },
    { enabled: open },
  )
  const assignedTrainers = useBatchTrainers(batchId, {
    page: 1,
    pageSize: TRAINER_PICKER_PAGE_SIZE,
  })
  const assignTrainer = useAssignTrainerToBatch(batchId)
  const unassignTrainer = useUnassignTrainerFromBatch(batchId)

  const assignedTrainerIds = new Set(
    (assignedTrainers.data?.items ?? []).map((item) => item.trainerId),
  )

  const trainerNameById = new Map(
    (trainers.data?.items ?? []).map((trainer) => [trainer.id, `${trainer.fullName} (${trainer.email})`]),
  )

  const pickerOptions = (trainers.data?.items ?? [])
    .filter(
      (trainer) => !assignedTrainerIds.has(trainer.id) && !stagedTrainerIds.includes(trainer.id),
    )
    .map((trainer) => ({
      value: trainer.id,
      label: `${trainer.fullName} (${trainer.email})`,
    }))

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      setStagedTrainerIds([])
      setSubmitError(null)
    }
    onOpenChange(nextOpen)
  }

  async function handleAssignStaged() {
    setSubmitError(null)
    try {
      await Promise.all(
        stagedTrainerIds.map((trainerId) => assignTrainer.mutateAsync({ trainerId })),
      )
      setStagedTrainerIds([])
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Failed to assign one or more trainers.')
    }
  }

  async function handleUnassign(trainerId: string) {
    setSubmitError(null)
    try {
      await unassignTrainer.mutateAsync(trainerId)
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Failed to unassign trainer.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Trainers — {batchName}</DialogTitle>
          <DialogDescription>
            Super Admins may assign any trainer. Faculty may only assign themselves, or another
            trainer already on this batch (handing off during leave).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-brand-primary">Currently assigned</p>
            {assignedTrainers.isPending ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (assignedTrainers.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No trainers assigned yet.</p>
            ) : (
              <ul className="space-y-1">
                {assignedTrainers.data!.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-sm"
                  >
                    <span>{trainerNameById.get(item.trainerId) ?? item.trainerId}</span>
                    <button
                      type="button"
                      aria-label="Unassign trainer"
                      disabled={unassignTrainer.isPending}
                      onClick={() => handleUnassign(item.trainerId)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-brand-primary">Add trainers</p>
            <Combobox
              id="assignTrainerPicker"
              options={pickerOptions}
              value={null}
              onSelect={(trainerId) => setStagedTrainerIds((ids) => [...ids, trainerId])}
              placeholder="Search trainers by name or email…"
              isLoading={trainers.isPending}
              isError={trainers.isError}
              errorMessage="Failed to load trainers."
              emptyMessage="No matching trainers."
            />
          </div>

          {stagedTrainerIds.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {stagedTrainerIds.map((trainerId) => (
                <li
                  key={trainerId}
                  className="flex items-center gap-1 rounded-full bg-brand-accent/10 px-2.5 py-1 text-xs font-medium text-brand-accent"
                >
                  {trainerNameById.get(trainerId) ?? trainerId}
                  <button
                    type="button"
                    aria-label="Remove from selection"
                    onClick={() =>
                      setStagedTrainerIds((ids) => ids.filter((id) => id !== trainerId))
                    }
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Close
          </Button>
          <Button
            type="button"
            disabled={stagedTrainerIds.length === 0 || assignTrainer.isPending}
            onClick={handleAssignStaged}
          >
            {assignTrainer.isPending
              ? 'Assigning…'
              : `Assign ${stagedTrainerIds.length || ''} Trainer${
                  stagedTrainerIds.length === 1 ? '' : 's'
                }`.replace('  ', ' ')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
