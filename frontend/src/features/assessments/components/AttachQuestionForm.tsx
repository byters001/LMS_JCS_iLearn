import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/Combobox'
import { useCategories, useQuestionsForPicker, useTopics } from '@/features/question-bank/api'
import { useAttachQuestion } from '../api'
import type { TestCategory } from '../types'

// Kept as a validated string, not z.coerce.number()/z.preprocess — see
// CreateAssessmentPage.tsx's comment on why that combination breaks
// useForm<T>'s generic inference against zodResolver.
const optionalPositiveNumberString = z
  .string()
  .optional()
  .refine((value) => !value || /^\d+(\.\d+)?$/.test(value), 'Must be a positive number')

const attachQuestionFormSchema = z.object({
  questionVersionId: z.string().uuid('Pick a question from the list'),
  marksOverride: optionalPositiveNumberString,
})

type AttachQuestionFormValues = z.infer<typeof attachQuestionFormSchema>

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent'

// A small, bounded page — this feeds AttachQuestionForm's combobox, which
// enriches every row with a per-question detail fetch to get real text (see
// useQuestionsForPicker's comment on why). Larger than this and the
// resulting fan-out stops being reasonable for a picker; a real catalog
// browser with server-side search is a larger, separate future phase.
const QUESTION_PICKER_PAGE_SIZE = 30

// Categories/topics are cheap lookups (no per-row detail fetch fan-out the
// way the question picker itself needs) — same page size CreateQuestionPage
// uses for the same pickers.
const FILTER_PICKER_PAGE_SIZE = 100

interface AttachQuestionFormProps {
  assessmentId: string
  sectionId: string
  testCategory: TestCategory
}

// Only approved questions are attachable (assessments.service.ts's
// createAssessmentQuestion rejects anything else), and — unless the
// assessment is 'mixed' — only questions whose type matches the
// assessment's testCategory (assertMatchesTestCategory). Both filters are
// applied up front so the picker only ever offers choices the backend will
// actually accept, rather than letting the user pick something and then
// discover the rejection after submitting.
export function AttachQuestionForm({ assessmentId, sectionId, testCategory }: AttachQuestionFormProps) {
  const attachQuestion = useAttachQuestion(assessmentId)

  // Category/topic are genuinely optional, combinable filters on top of the
  // existing status/type scoping and the Combobox's own client-side text
  // search — not a replacement for either. All active filters (status,
  // type, categoryId, topicId server-side; text search client-side over the
  // resulting page's labels) narrow the same list together, AND-combined:
  // buildQuestionsWhere (question-bank.repository.ts) already ANDs every
  // provided condition, and the text search then further narrows whatever
  // that query already returned.
  //
  // Category is type-scoped exactly like CreateQuestionPage's category
  // picker (question_categories.type) — reusing the same `type` param
  // shape (undefined for 'mixed' sections, matching the existing question
  // type filter's own mixed-section handling below) rather than duplicating
  // that logic. Topic is scoped to whichever category is selected, same
  // "not fetched until a category exists" behavior as CreateQuestionPage.
  const [categoryId, setCategoryId] = useState('')
  const [topicId, setTopicId] = useState('')

  const categories = useCategories({
    type: testCategory === 'mixed' ? undefined : testCategory,
    page: 1,
    pageSize: FILTER_PICKER_PAGE_SIZE,
  })
  const topics = useTopics(
    { categoryId, page: 1, pageSize: FILTER_PICKER_PAGE_SIZE },
    { enabled: Boolean(categoryId) },
  )

  // Switching (or clearing) category invalidates whatever topic was
  // selected under the previous category.
  useEffect(() => {
    setTopicId('')
  }, [categoryId])

  const picker = useQuestionsForPicker({
    status: 'approved',
    type: testCategory === 'mixed' ? undefined : testCategory,
    categoryId: categoryId || undefined,
    topicId: topicId || undefined,
    page: 1,
    pageSize: QUESTION_PICKER_PAGE_SIZE,
  })

  const categoryOptions: ComboboxOption[] = (categories.data?.items ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }))
  const topicOptions: ComboboxOption[] = (topics.data?.items ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }))

  const {
    handleSubmit,
    register,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<AttachQuestionFormValues>({
    resolver: zodResolver(attachQuestionFormSchema),
    defaultValues: { questionVersionId: '' },
  })

  const questionVersionId = watch('questionVersionId')

  const onSubmit = handleSubmit((values) => {
    attachQuestion.mutate(
      {
        sectionId,
        questionVersionId: values.questionVersionId,
        marksOverride: values.marksOverride ? Number.parseFloat(values.marksOverride) : undefined,
      },
      { onSuccess: () => reset({ questionVersionId: '' }) },
    )
  })

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-56 space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">
              Filter by category
            </label>
            {categoryId && (
              <button
                type="button"
                className="text-xs font-medium text-brand-accent hover:underline"
                onClick={() => setCategoryId('')}
              >
                Clear
              </button>
            )}
          </div>
          <Combobox
            options={categoryOptions}
            value={categoryId || null}
            onSelect={(value) => setCategoryId(value)}
            placeholder="Any category…"
            isLoading={categories.isPending}
            isError={categories.isError}
            errorMessage="Failed to load categories."
            emptyMessage={categories.isPending ? 'Loading…' : 'No categories found.'}
          />
        </div>
        <div className="w-56 space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Filter by topic</label>
            {topicId && (
              <button
                type="button"
                className="text-xs font-medium text-brand-accent hover:underline"
                onClick={() => setTopicId('')}
              >
                Clear
              </button>
            )}
          </div>
          {categoryId ? (
            <Combobox
              options={topicOptions}
              value={topicId || null}
              onSelect={(value) => setTopicId(value)}
              placeholder="Any topic…"
              isLoading={topics.isPending}
              isError={topics.isError}
              errorMessage="Failed to load topics."
              emptyMessage={topics.isPending ? 'Loading…' : 'No topics for this category yet.'}
            />
          ) : (
            <p className="rounded-md border border-dashed border-input px-3 py-2 text-xs text-muted-foreground">
              Pick a category first
            </p>
          )}
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1 space-y-1">
          <Combobox
            id="questionVersionId"
            options={picker.items.map((item) => ({ value: item.questionVersionId, label: item.label }))}
            value={questionVersionId || null}
            onSelect={(value) => setValue('questionVersionId', value, { shouldValidate: true })}
            placeholder="Search approved questions by text…"
            isLoading={picker.isLoading}
            isError={picker.isError}
            errorMessage="Failed to load questions."
            emptyMessage={
              picker.isLoading ? 'Loading…' : 'No matching approved questions for this filter.'
            }
          />
          {errors.questionVersionId && (
            <p className="text-xs text-destructive">{errors.questionVersionId.message}</p>
          )}
        </div>
        <div className="w-28 space-y-1">
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="Marks override"
            className={inputClassName}
            {...register('marksOverride')}
          />
        </div>
        <Button type="submit" size="sm" disabled={attachQuestion.isPending}>
          {attachQuestion.isPending ? 'Attaching…' : 'Attach Question'}
        </Button>
        {attachQuestion.isError && (
          <p className="w-full text-xs text-destructive">
            {attachQuestion.error instanceof ApiError
              ? attachQuestion.error.message
              : 'Failed to attach question.'}
          </p>
        )}
      </form>
    </div>
  )
}
