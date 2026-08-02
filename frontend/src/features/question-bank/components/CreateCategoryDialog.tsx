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
import { useCategories, useCreateCategory } from '../api'
import type { QuestionCategory, QuestionType } from '../types'

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent'

const createCategoryFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  parentCategoryId: z.string(),
})

type CreateCategoryFormValues = z.infer<typeof createCategoryFormSchema>

const PICKER_PAGE_SIZE = 100

interface CreateCategoryDialogProps {
  // Fixed for the lifetime of the dialog, not user-editable — this dialog is
  // always opened from a context that already knows which question type the
  // new category is for (CreateQuestionPage's type-filtered category
  // picker), and question_categories.type must match its parent's type (see
  // question-bank.service.ts's createQuestionCategory), so the parent picker
  // below is itself scoped to this same type.
  type: QuestionType
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (category: QuestionCategory) => void
}

export function CreateCategoryDialog({
  type,
  open,
  onOpenChange,
  onCreated,
}: CreateCategoryDialogProps) {
  const createCategory = useCreateCategory()
  const parentOptions = useCategories({ type, page: 1, pageSize: PICKER_PAGE_SIZE })

  const { handleSubmit, register, reset, watch, setValue } = useForm<CreateCategoryFormValues>({
    resolver: zodResolver(createCategoryFormSchema),
    defaultValues: { name: '', parentCategoryId: '' },
  })
  const parentCategoryId = watch('parentCategoryId')

  useEffect(() => {
    if (open) {
      reset({ name: '', parentCategoryId: '' })
      createCategory.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) createCategory.reset()
    onOpenChange(nextOpen)
  }

  const parentCategoryOptions: ComboboxOption[] = (parentOptions.data?.items ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }))

  const onSubmit = handleSubmit((values) => {
    createCategory.mutate(
      {
        name: values.name,
        type,
        parentCategoryId: values.parentCategoryId || undefined,
      },
      {
        onSuccess: (category) => {
          onCreated(category)
          handleClose(false)
        },
      },
    )
  })

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Category</DialogTitle>
          <DialogDescription>
            Creates a new {type} category, available immediately for this and future questions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="newCategoryName" className="text-sm font-medium text-brand-primary">
              Name
            </label>
            <input
              id="newCategoryName"
              className={inputClassName}
              autoFocus
              {...register('name')}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-brand-primary">
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

          {createCategory.isError && (
            <p className="text-sm text-destructive">
              {createCategory.error instanceof ApiError
                ? createCategory.error.message
                : 'Failed to create category. Please try again.'}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createCategory.isPending}>
              {createCategory.isPending ? 'Creating…' : 'Create Category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
