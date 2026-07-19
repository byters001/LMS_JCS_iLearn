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
import { useUpdatePool } from '../api'
import type { QuestionPool } from '../types'

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent'

const editPoolFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string(),
})

type EditPoolFormValues = z.infer<typeof editPoolFormSchema>

interface EditPoolDialogProps {
  pool: QuestionPool
  open: boolean
  onOpenChange: (open: boolean) => void
}

// name/description only — see UpdatePoolInput's own comment in types.ts for
// why type/collegeId/categoryId stay out of this dialog even though the
// backend schema technically accepts them: changing a pool's type after
// criteria rows already exist against it would silently invalidate those
// rows' intent, and collegeId/categoryId reclassify what the pool is
// scoped to in a way that's out of this tier's explicit ask.
export function EditPoolDialog({ pool, open, onOpenChange }: EditPoolDialogProps) {
  const updatePool = useUpdatePool()

  const { handleSubmit, register, reset } = useForm<EditPoolFormValues>({
    resolver: zodResolver(editPoolFormSchema),
    defaultValues: { name: pool.name, description: pool.description ?? '' },
  })

  useEffect(() => {
    if (open) {
      reset({ name: pool.name, description: pool.description ?? '' })
    }
  }, [open, pool, reset])

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      updatePool.reset()
    }
    onOpenChange(nextOpen)
  }

  const onSubmit = handleSubmit((values) => {
    updatePool.mutate(
      {
        id: pool.id,
        input: {
          name: values.name,
          description: values.description.trim() ? values.description : null,
        },
      },
      { onSuccess: () => handleClose(false) },
    )
  })

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Pool</DialogTitle>
          <DialogDescription>
            Updates name and description only — type and scope are fixed once criteria exist
            against this pool.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="editPoolName" className="text-sm font-medium text-brand-primary">
              Name
            </label>
            <input id="editPoolName" className={inputClassName} {...register('name')} />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="editPoolDescription"
              className="text-sm font-medium text-brand-primary"
            >
              Description <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="editPoolDescription"
              rows={3}
              className={inputClassName}
              {...register('description')}
            />
          </div>

          {updatePool.isError && (
            <p className="text-sm text-destructive">
              {updatePool.error instanceof ApiError
                ? updatePool.error.message
                : 'Failed to update pool. Please try again.'}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updatePool.isPending}>
              {updatePool.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
