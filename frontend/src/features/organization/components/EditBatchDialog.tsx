import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
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
import { Input } from '@/components/ui/input'
import { useUpdateBatch } from '../api'
import type { Batch } from '../types'

const editBatchFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  maxStudents: z
    .string()
    .optional()
    .refine((value) => !value || /^\d+$/.test(value), 'Must be a positive whole number'),
})

type EditBatchFormValues = z.infer<typeof editBatchFormSchema>

interface EditBatchDialogProps {
  batch: Batch
  open: boolean
  onOpenChange: (open: boolean) => void
}

// name/maxStudents only — matches item 10 tier 2's explicit scope, not
// updateBatchSchema's full field set (that schema also accepts `status`,
// but BatchCard's own Switch already owns status changes via the
// dedicated toggle-active route — see UpdateBatchInput's own comment in
// types.ts for why this form deliberately never touches it).
export function EditBatchDialog({ batch, open, onOpenChange }: EditBatchDialogProps) {
  const updateBatch = useUpdateBatch()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditBatchFormValues>({
    resolver: zodResolver(editBatchFormSchema),
    defaultValues: { name: batch.name, maxStudents: batch.maxStudents?.toString() ?? '' },
  })

  useEffect(() => {
    if (open) {
      reset({ name: batch.name, maxStudents: batch.maxStudents?.toString() ?? '' })
    }
  }, [open, batch, reset])

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      updateBatch.reset()
    }
    onOpenChange(nextOpen)
  }

  const onSubmit = handleSubmit((values) => {
    updateBatch.mutate(
      {
        id: batch.id,
        input: {
          name: values.name,
          maxStudents: values.maxStudents ? Number.parseInt(values.maxStudents, 10) : undefined,
        },
      },
      { onSuccess: () => handleClose(false) },
    )
  })

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Batch</DialogTitle>
          <DialogDescription>Update {batch.name}&apos;s name or capacity.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="batchName" className="text-sm font-medium text-brand-primary">
              Name
            </label>
            <Input id="batchName" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="batchMaxStudents" className="text-sm font-medium text-brand-primary">
              Max Students <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input id="batchMaxStudents" type="number" min={1} {...register('maxStudents')} />
            {errors.maxStudents && (
              <p className="text-xs text-destructive">{errors.maxStudents.message}</p>
            )}
            {batch.studentCount > 0 && (
              // Purely informational — confirmed by reading organization.
              // service.ts's updateBatch directly: it does NOT validate
              // maxStudents against the current enrolled count, so setting
              // it below studentCount is technically accepted server-side.
              // Not silently claiming an enforcement that doesn't exist.
              <p className="text-xs text-muted-foreground">
                {batch.studentCount} student{batch.studentCount === 1 ? '' : 's'} currently
                enrolled.
              </p>
            )}
          </div>

          {updateBatch.isError && (
            <p className="text-sm text-destructive">
              {updateBatch.error instanceof ApiError
                ? updateBatch.error.message
                : 'Failed to update batch. Please try again.'}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateBatch.isPending}>
              {updateBatch.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
