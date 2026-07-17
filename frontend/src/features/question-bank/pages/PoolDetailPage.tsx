import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/Combobox'
import { cn } from '@/lib/utils'
import {
  useAddCriterion,
  usePoolCriteria,
  usePoolDetail,
  useResolvePool,
  useTags,
  useTopics,
} from '../api'
import type { QuestionDifficulty } from '../types'

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent'

const PICKER_PAGE_SIZE = 100

const TYPE_LABELS = {
  mcq: 'MCQ',
  coding: 'Coding',
  psychometric: 'Psychometric',
} as const

const DIFFICULTY_OPTIONS: Array<{ value: QuestionDifficulty; label: string }> = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

const DIFFICULTY_LABELS: Record<QuestionDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

const QUESTION_TEXT_TRUNCATE_LENGTH = 90

function truncate(text: string): string {
  return text.length > QUESTION_TEXT_TRUNCATE_LENGTH
    ? `${text.slice(0, QUESTION_TEXT_TRUNCATE_LENGTH)}…`
    : text
}

const addCriterionFormSchema = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']),
  topicId: z.string(),
  tagFilter: z.array(z.string()),
  countRequired: z
    .string()
    .min(1, 'Required')
    .refine((value) => /^\d+$/.test(value) && Number.parseInt(value, 10) > 0, 'Must be a positive whole number'),
})

type AddCriterionFormValues = z.infer<typeof addCriterionFormSchema>

// Same chip-list multi-select shape as CreateQuestionPage.tsx's
// MultiSelectChips (Combobox to add + removable chips) — reimplemented
// locally rather than imported since that component isn't exported and
// this is the only other call site; a shared/components extraction isn't
// warranted for two internal usages of a small, feature-local pattern.
function TagFilterChips({
  options,
  selectedIds,
  onChange,
  isLoading,
  isError,
}: {
  options: ComboboxOption[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  isLoading: boolean
  isError: boolean
}) {
  const optionsById = new Map(options.map((o) => [o.value, o.label]))
  const addOptions = options.filter((o) => !selectedIds.includes(o.value))

  return (
    <div className="space-y-1.5">
      {selectedIds.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {selectedIds.map((id) => (
            <li
              key={id}
              className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-brand-primary"
            >
              <span>{optionsById.get(id) ?? id}</span>
              <button
                type="button"
                aria-label={`Remove ${optionsById.get(id) ?? id}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => onChange(selectedIds.filter((existing) => existing !== id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <Combobox
        options={addOptions}
        value={null}
        onSelect={(value) => onChange([...selectedIds, value])}
        placeholder="Search tags to add…"
        isLoading={isLoading}
        isError={isError}
        errorMessage="Failed to load tags."
        emptyMessage={isLoading ? 'Loading…' : 'No tags found.'}
      />
    </div>
  )
}

function AddCriterionForm({ poolId }: { poolId: string }) {
  const addCriterion = useAddCriterion(poolId)
  const topics = useTopics({ page: 1, pageSize: PICKER_PAGE_SIZE })
  const tags = useTags({ page: 1, pageSize: PICKER_PAGE_SIZE })

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<AddCriterionFormValues>({
    resolver: zodResolver(addCriterionFormSchema),
    defaultValues: { difficulty: 'medium', topicId: '', tagFilter: [], countRequired: '1' },
  })

  const topicId = watch('topicId')
  const tagFilter = watch('tagFilter')

  const topicOptions: ComboboxOption[] = (topics.data?.items ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }))
  const tagOptions: ComboboxOption[] = (tags.data?.items ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }))

  const onSubmit = handleSubmit((values) => {
    addCriterion.mutate(
      {
        difficulty: values.difficulty,
        topicId: values.topicId || undefined,
        tagFilter: values.tagFilter.length > 0 ? values.tagFilter : undefined,
        countRequired: Number.parseInt(values.countRequired, 10),
      },
      {
        onSuccess: () =>
          reset({ difficulty: values.difficulty, topicId: '', tagFilter: [], countRequired: '1' }),
      },
    )
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="difficulty" className="text-sm font-medium text-brand-primary">
            Difficulty
          </label>
          <select id="difficulty" className={inputClassName} {...register('difficulty')}>
            {DIFFICULTY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="countRequired" className="text-sm font-medium text-brand-primary">
            Count Required
          </label>
          <input
            id="countRequired"
            type="number"
            min={1}
            step={1}
            className={inputClassName}
            {...register('countRequired')}
          />
          {errors.countRequired && (
            <p className="text-xs text-destructive">{errors.countRequired.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-brand-primary" htmlFor="topicId">
          Topic <span className="text-muted-foreground">(optional)</span>
        </label>
        <Combobox
          id="topicId"
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

      {addCriterion.isError && (
        <p className="text-sm text-destructive">
          {addCriterion.error instanceof ApiError
            ? addCriterion.error.message
            : 'Failed to add criterion. Please try again.'}
        </p>
      )}

      <Button
        type="submit"
        disabled={addCriterion.isPending}
        className="bg-brand-accent text-white hover:bg-brand-accent/90"
      >
        {addCriterion.isPending ? 'Adding…' : 'Add Criterion'}
      </Button>
    </form>
  )
}

// Shows the pool's metadata, its current criteria rows, a form to add a
// new criterion, and the "Preview Resolution" action — the real payoff of
// this whole feature: a live GET /question-pools/:id/resolve call (a real
// randomized draw against currently-approved questions, not a simulation)
// so a curator can see exactly what an assessment section pointed at this
// pool would draw right now, including the "under-supplied" signal when a
// criterion can't fill its countRequired. Deliberately NOT auto-fetched on
// page load — see api.ts's useResolvePool comment — a curator triggers it
// explicitly, and again after adding/adjusting criteria.
export default function PoolDetailPage() {
  const { id } = useParams<{ id: string }>()
  const pool = usePoolDetail(id)
  const criteria = usePoolCriteria(id)
  const topics = useTopics({ page: 1, pageSize: PICKER_PAGE_SIZE })
  const tags = useTags({ page: 1, pageSize: PICKER_PAGE_SIZE })
  const resolution = useResolvePool(id ?? '')

  if (pool.isLoading) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading pool…</p>
      </div>
    )
  }

  if (pool.isError || !pool.data) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">
          {pool.error instanceof ApiError ? pool.error.message : "Couldn't load this pool."}
        </p>
      </div>
    )
  }

  const topicNameById = new Map((topics.data?.items ?? []).map((t) => [t.id, t.name]))
  const tagNameById = new Map((tags.data?.items ?? []).map((t) => [t.id, t.name]))

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link to=".." className="text-sm text-brand-accent hover:underline">
        &larr; Back to pools
      </Link>

      <div className="mt-3 rounded-xl border border-border bg-background p-6 shadow-sm">
        <h1 className="font-heading text-xl font-semibold text-brand-primary">{pool.data.name}</h1>
        {pool.data.description && (
          <p className="mt-1 text-sm text-muted-foreground">{pool.data.description}</p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Type</dt>
            <dd className="font-medium text-brand-primary">{TYPE_LABELS[pool.data.type]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Scope</dt>
            <dd className="font-medium text-brand-primary">
              {pool.data.collegeId ? 'College-specific' : 'Global'}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-background p-6 shadow-sm">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Criteria
        </h2>

        {criteria.isPending && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
        {criteria.isError && (
          <p className="mt-3 text-sm text-destructive">Failed to load criteria.</p>
        )}
        {!criteria.isPending && !criteria.isError && (
          <div className="mt-3 space-y-2">
            {(criteria.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No criteria yet — add one below to define what this pool draws.
              </p>
            ) : (
              (criteria.data ?? []).map((criterion) => (
                <div
                  key={criterion.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border px-4 py-2.5 text-sm"
                >
                  <span className="font-medium text-brand-primary">
                    {DIFFICULTY_LABELS[criterion.difficulty]}
                  </span>
                  <span className="text-muted-foreground">
                    Requires {criterion.countRequired}
                  </span>
                  <span className="text-muted-foreground">
                    Topic: {criterion.topicId ? (topicNameById.get(criterion.topicId) ?? '—') : 'Any'}
                  </span>
                  <span className="text-muted-foreground">
                    Tags:{' '}
                    {criterion.tagFilter && criterion.tagFilter.length > 0
                      ? criterion.tagFilter.map((tagId) => tagNameById.get(tagId) ?? tagId).join(', ')
                      : 'Any'}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        <div className="mt-6 border-t border-border pt-6">
          <h3 className="text-sm font-semibold text-brand-primary">Add Criterion</h3>
          <div className="mt-3">
            <AddCriterionForm poolId={pool.data.id} />
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-background p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Preview Resolution
          </h2>
          <Button
            size="sm"
            disabled={!id || resolution.isFetching}
            onClick={() => resolution.refetch()}
          >
            {resolution.isFetching ? 'Resolving…' : 'Preview Resolution'}
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Runs a live draw against real, currently-approved questions — exactly what an assessment
          section pointed at this pool would get right now. Each click re-rolls the random
          selection, so numbers can shift between runs even with no data changes.
        </p>

        {resolution.isError && (
          <p className="mt-4 text-sm text-destructive">
            {resolution.error instanceof ApiError
              ? resolution.error.message
              : 'Failed to resolve this pool. Please try again.'}
          </p>
        )}

        {resolution.data && (
          <div className="mt-4 space-y-4">
            <div
              className={cn(
                'rounded-lg border px-4 py-3 text-sm',
                resolution.data.isFullySatisfied
                  ? 'border-green-600/30 bg-green-600/5 text-green-700 dark:text-green-400'
                  : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400',
              )}
            >
              {resolution.data.isFullySatisfied
                ? `Fully satisfied — ${resolution.data.totalSelected}/${resolution.data.totalRequired} questions drawn across ${resolution.data.criteria.length} criterion${resolution.data.criteria.length === 1 ? '' : 'a'}.`
                : `Under-supplied — only ${resolution.data.totalSelected}/${resolution.data.totalRequired} questions could be drawn. Add more approved questions or relax a criterion below.`}
            </div>

            {resolution.data.criteria.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This pool has no criteria — nothing to resolve.
              </p>
            ) : (
              resolution.data.criteria.map((criterion) => {
                const isShort = criterion.selected.length < criterion.countRequired
                return (
                  <div key={criterion.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-brand-primary">
                        {DIFFICULTY_LABELS[criterion.difficulty]}
                        {criterion.topicId && (
                          <span className="ml-2 font-normal text-muted-foreground">
                            · {topicNameById.get(criterion.topicId) ?? 'topic'}
                          </span>
                        )}
                      </p>
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-xs font-medium',
                          isShort
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-green-600/10 text-green-700 dark:text-green-400',
                        )}
                      >
                        {criterion.selected.length}/{criterion.countRequired} drawn ·{' '}
                        {criterion.eligibleTotal} eligible
                      </span>
                    </div>

                    {isShort && (
                      <p className="mt-2 text-xs text-destructive">
                        {criterion.eligibleTotal === 0
                          ? '0 eligible — no approved question in the bank matches this criterion yet.'
                          : `Under-supplied — only ${criterion.eligibleTotal} eligible question${criterion.eligibleTotal === 1 ? '' : 's'} available for ${criterion.countRequired} required.`}
                      </p>
                    )}

                    {criterion.selected.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {criterion.selected.map((question) => (
                          <li
                            key={question.questionVersionId}
                            className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-1.5 text-sm"
                          >
                            <span className="text-brand-primary">
                              {truncate(question.questionText)}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {question.marks} marks
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
