import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Combobox, type ComboboxOption } from '@/components/Combobox'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTags, useTopics, useUpdateCriterion } from '../api'
import type { QuestionDifficulty, QuestionPoolCriterion } from '../types'
import { TagFilterChips } from './TagFilterChips'

const PICKER_PAGE_SIZE = 100

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent'

const DIFFICULTY_OPTIONS: Array<{ value: QuestionDifficulty; label: string }> = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

const editCriterionFormSchema = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']),
  topicId: z.string(),
  tagFilter: z.array(z.string()),
  countRequired: z
    .string()
    .min(1, 'Required')
    .refine(
      (value) => /^\d+$/.test(value) && Number.parseInt(value, 10) > 0,
      'Must be a positive whole number',
    ),
})

type EditCriterionFormValues = z.infer<typeof editCriterionFormSchema>

interface EditCriterionDialogProps {
  poolId: string
  criterion: QuestionPoolCriterion
  open: boolean
  onOpenChange: (open: boolean) => void
}

// No workflow-state gate needed here — criteria rows aren't referenced by
// assessment_section_pools (that FK points at question_pools.id only, never
// at an individual criterion), so editing one never touches anything a live
// attempt has already frozen. Same non-issue as question metadata edits,
// just via a different FK shape.
export function EditCriterionDialog({
  poolId,
  criterion,
  open,
  onOpenChange,
}: EditCriterionDialogProps) {
  const updateCriterion = useUpdateCriterion(poolId)
  const topics = useTopics({ page: 1, pageSize: PICKER_PAGE_SIZE })
  const tags = useTags({ page: 1, pageSize: PICKER_PAGE_SIZE })

  const { handleSubmit, register, setValue, watch, reset } = useForm<EditCriterionFormValues>({
    resolver: zodResolver(editCriterionFormSchema),
    defaultValues: {
      difficulty: criterion.difficulty,
      topicId: criterion.topicId ?? '',
      tagFilter: criterion.tagFilter ?? [],
      countRequired: String(criterion.countRequired),
    },
  })

  const topicId = watch('topicId')
  const tagFilter = watch('tagFilter')

  useEffect(() => {
    if (open) {
      reset({
        difficulty: criterion.difficulty,
        topicId: criterion.topicId ?? '',
        tagFilter: criterion.tagFilter ?? [],
        countRequired: String(criterion.countRequired),
      })
    }
  }, [open, criterion, reset])

  const topicOptions: ComboboxOption[] = (topics.data?.items ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }))
  const tagOptions: ComboboxOption[] = (tags.data?.items ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }))

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      updateCriterion.reset()
    }
    onOpenChange(nextOpen)
  }

  const onSubmit = handleSubmit((values) => {
    updateCriterion.mutate(
      {
        criteriaId: criterion.id,
        input: {
          difficulty: values.difficulty,
          topicId: values.topicId || null,
          tagFilter: values.tagFilter.length > 0 ? values.tagFilter : null,
          countRequired: Number.parseInt(values.countRequired, 10),
        },
      },
      { onSuccess: () => handleClose(false) },
    )
  })

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Criterion</DialogTitle>
          <DialogDescription>
            Changes what this criterion draws the next time the pool is resolved — re-run
            "Preview Resolution" after saving to see the effect.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="editCriterionDifficulty"
                className="text-sm font-medium text-brand-primary"
              >
                Difficulty
              </label>
              <select
                id="editCriterionDifficulty"
                className={inputClassName}
                {...register('difficulty')}
              >
                {DIFFICULTY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="editCriterionCountRequired"
                className="text-sm font-medium text-brand-primary"
              >
                Count Required
              </label>
              <input
                id="editCriterionCountRequired"
                type="number"
                min={1}
                step={1}
                className={inputClassName}
                {...register('countRequired')}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-brand-primary" htmlFor="editCriterionTopic">
              Topic <span className="text-muted-foreground">(optional)</span>
            </label>
            <Combobox
              id="editCriterionTopic"
              options={topicOptions}
              value={topicId || null}
              onSelect={(value) => setValue('topicId', value)}
              placeholder="Search topics…"
              isLoading={topics.isPending}
              isError={topics.isError}
              errorMessage="Failed to load topics."
              emptyMessage={topics.isPending ? 'Loading…' : 'No topics found.'}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-brand-primary">
              Tag Filter{' '}
              <span className="text-muted-foreground">(optional — matches ANY listed tag)</span>
            </label>
            <TagFilterChips
              options={tagOptions}
              selectedIds={tagFilter}
              onChange={(ids) => setValue('tagFilter', ids)}
              isLoading={tags.isPending}
              isError={tags.isError}
            />
          </div>

          {updateCriterion.isError && (
            <p className="text-sm text-destructive">
              {updateCriterion.error instanceof ApiError
                ? updateCriterion.error.message
                : 'Failed to update criterion. Please try again.'}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateCriterion.isPending}>
              {updateCriterion.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
