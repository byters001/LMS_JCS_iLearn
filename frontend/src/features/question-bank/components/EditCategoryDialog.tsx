import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/Combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCategories, useUpdateCategory } from '../api'
import type { QuestionCategory } from '../types'

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40'

const editCategoryFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  parentCategoryId: z.string(),
})

type EditCategoryFormValues = z.infer<typeof editCategoryFormSchema>

const PICKER_PAGE_SIZE = 100

interface EditCategoryDialogProps {
  category: QuestionCategory
  open: boolean
  onOpenChange: (open: boolean) => void
}

// `type` is not editable here, same as the backend's updateQuestionCategorySchema
// (see that schema's own comment) — changing a category's type after
// questions/topics already reference it would silently mismatch that
// existing content against the new type. Parent picker reuses the same
// Combobox-based flow CreateCategoryDialog.tsx already established, scoped
// to this category's own type and excluding itself from the options to
// prevent self-parenting.
export function EditCategoryDialog({ category, open, onOpenChange }: EditCategoryDialogProps) {
  const updateCategory = useUpdateCategory()
  const parentOptions = useCategories({ type: category.type, page: 1, pageSize: PICKER_PAGE_SIZE })

  const { handleSubmit, register, reset, watch, setValue } = useForm<EditCategoryFormValues>({
    resolver: zodResolver(editCategoryFormSchema),
    defaultValues: { name: category.name, parentCategoryId: category.parentCategoryId ?? '' },
  })
  const parentCategoryId = watch('parentCategoryId')

  useEffect(() => {
    if (open) {
      reset({ name: category.name, parentCategoryId: category.parentCategoryId ?? '' })
    }
  }, [open, category, reset])

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      updateCategory.reset()
    }
    onOpenChange(nextOpen)
  }

  const parentCategoryOptions: ComboboxOption[] = (parentOptions.data?.items ?? [])
    .filter((c) => c.id !== category.id)
    .map((c) => ({ value: c.id, label: c.name }))

  const onSubmit = handleSubmit((values) => {
    updateCategory.mutate(
      {
        id: category.id,
        input: {
          name: values.name,
          parentCategoryId: values.parentCategoryId || null,
        },
      },
      { onSuccess: () => handleClose(false) },
    )
  })

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Category</DialogTitle>
          <DialogDescription>
            Updates name and parent category only — type is fixed once a category exists.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="editCategoryName" className="text-sm font-medium text-foreground">
              Name
            </label>
            <input id="editCategoryName" className={inputClassName} {...register('name')} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Parent category <span className="text-muted-foreground">(optional)</span>
            </label>
            <Combobox
              options={parentCategoryOptions}
              value={parentCategoryId || null}
              onSelect={(value) => setValue('parentCategoryId', value)}
              placeholder="Search categories…"
              isLoading={parentOptions.isPending}
              isError={parentOptions.isError}
              errorMessage="Failed to load categories."
              emptyMessage={parentOptions.isPending ? 'Loading…' : 'No categories found.'}
            />
          </div>

          {updateCategory.isError && (
            <p className="text-sm text-destructive">
              {updateCategory.error instanceof ApiError
                ? updateCategory.error.message
                : 'Failed to update category. Please try again.'}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateCategory.isPending}>
              {updateCategory.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
