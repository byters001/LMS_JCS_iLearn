import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/Combobox'
import { useCategories, useCreateQuestion, useTags, useTopics } from '../api'
import {
  applyQuestionContentRefinements,
  buildQuestionContentPayload,
  inputClassName,
  questionContentFieldsSchema,
  QuestionContentFields,
} from '../components/QuestionContentFields'
import type { CreateQuestionInput, QuestionDifficulty, QuestionType } from '../types'

const PICKER_PAGE_SIZE = 100

const TYPE_OPTIONS: Array<{ value: QuestionType; label: string }> = [
  { value: 'mcq', label: 'MCQ' },
  { value: 'coding', label: 'Coding' },
  { value: 'psychometric', label: 'Psychometric' },
]

const DIFFICULTY_OPTIONS: Array<{ value: QuestionDifficulty; label: string }> = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

const TYPE_VALUES = TYPE_OPTIONS.map((option) => option.value)
const DIFFICULTY_VALUES = DIFFICULTY_OPTIONS.map((option) => option.value)

function isQuestionType(value: string | null): value is QuestionType {
  return value !== null && (TYPE_VALUES as string[]).includes(value)
}

function isQuestionDifficulty(value: string | null): value is QuestionDifficulty {
  return value !== null && (DIFFICULTY_VALUES as string[]).includes(value)
}

// One flat schema covering all three types' fields (all optional except
// the genuinely-shared required ones), with per-type requirements enforced
// via superRefine — not a z.discriminatedUnion. This matches the
// codebase's existing convention (CreateAssessmentPage's refine for
// startAt<endAt is the same shape of "one flat form, cross-field rule via
// refine") rather than introducing a new pattern, and keeps useFieldArray
// working against fixed field names (options/testCases/psychometricOptions)
// regardless of which type is currently selected.
//
// Extends questionContentFieldsSchema (question-content-editing phase) —
// the shared content fields (questionText/marks/options/coding details/
// psychometric details, extracted to components/QuestionContentFields.tsx
// so EditQuestionContentPage.tsx can reuse the exact same schema/JSX rather
// than a second, divergent implementation) plus this page's own extra
// metadata fields (type/difficulty/categoryId/topicIds/tagIds) that only
// make sense at question-creation time, never per-version.
const createQuestionFormSchema = questionContentFieldsSchema
  .extend({
    type: z.enum(['mcq', 'coding', 'psychometric']),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    categoryId: z.string(),
    topicIds: z.array(z.string()),
    tagIds: z.array(z.string()),
  })
  .superRefine((data, ctx) => applyQuestionContentRefinements(data.type, data, ctx))

type CreateQuestionFormValues = z.infer<typeof createQuestionFormSchema>

// Chip-list multi-select — same pattern BatchesEditor.tsx established for
// batchIds (Combobox to add + removable chips), generalized here for
// topicIds/tagIds since both need the identical shape.
function MultiSelectChips({
  label,
  options,
  selectedIds,
  onChange,
  isLoading,
  isError,
  placeholder,
}: {
  label: string
  options: ComboboxOption[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  isLoading: boolean
  isError: boolean
  placeholder: string
}) {
  const optionsById = new Map(options.map((o) => [o.value, o.label]))
  const addOptions = options.filter((o) => !selectedIds.includes(o.value))

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-brand-primary">
        {label} <span className="text-muted-foreground">(optional)</span>
      </label>
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
        placeholder={placeholder}
        isLoading={isLoading}
        isError={isError}
        errorMessage={`Failed to load ${label.toLowerCase()}.`}
        emptyMessage={isLoading ? 'Loading…' : `No ${label.toLowerCase()} found.`}
      />
    </div>
  )
}

// Question creation only — no editing/versioning, approval-workflow, or
// question-pool creation UI here (all explicitly deferred, matching every
// prior phase's scope discipline). A question is created with its content
// atomically as version #1 (POST /questions does both in one call — see
// question-bank.service.ts) and starts in 'draft' status; moving it
// through submit/approve/reject is a separate future phase's UI.
export default function CreateQuestionPage() {
  const navigate = useNavigate()
  const createQuestion = useCreateQuestion()
  const categories = useCategories({ page: 1, pageSize: PICKER_PAGE_SIZE })
  const topics = useTopics({ page: 1, pageSize: PICKER_PAGE_SIZE })
  const tags = useTags({ page: 1, pageSize: PICKER_PAGE_SIZE })

  // Pre-fill from QuestionListPage's drill-down "Add Question" action
  // (?type=&difficulty=), which navigates here already knowing which
  // type+difficulty combination the trainer/admin was just browsing.
  // Falls back to the form's original 'mcq'/'medium' defaults when the
  // params are absent or don't match a real enum value (e.g. this page
  // opened directly from its plain "Create Question" entry point, which
  // passes none).
  const [searchParams] = useSearchParams()
  const typeParam = searchParams.get('type')
  const difficultyParam = searchParams.get('difficulty')
  const prefilledType = isQuestionType(typeParam) ? typeParam : null
  const prefilledDifficulty = isQuestionDifficulty(difficultyParam) ? difficultyParam : null

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<CreateQuestionFormValues>({
    resolver: zodResolver(createQuestionFormSchema),
    defaultValues: {
      type: prefilledType ?? 'mcq',
      difficulty: prefilledDifficulty ?? 'medium',
      categoryId: '',
      topicIds: [],
      tagIds: [],
      questionText: '',
      marks: '',
      questionImageUrl: undefined,
      options: [
        { optionText: '', isCorrect: false, imageUrl: undefined },
        { optionText: '', isCorrect: false, imageUrl: undefined },
      ],
      problemStatement: '',
      inputFormat: '',
      outputFormat: '',
      constraints: '',
      timeLimitMs: '',
      memoryLimitKb: '',
      supportedLanguages: [],
      testCases: [],
      traitCategory: '',
      scaleType: '',
      psychometricOptions: [],
    },
  })

  const type = watch('type')
  const categoryId = watch('categoryId')
  const topicIds = watch('topicIds')
  const tagIds = watch('tagIds')

  const categoryOptions: ComboboxOption[] = (categories.data?.items ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }))
  const topicOptions: ComboboxOption[] = (topics.data?.items ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }))
  const tagOptions: ComboboxOption[] = (tags.data?.items ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }))

  const onSubmit = handleSubmit((values) => {
    const payload: CreateQuestionInput = {
      ...buildQuestionContentPayload(values.type, values),
      type: values.type,
      difficulty: values.difficulty,
      categoryId: values.categoryId || undefined,
      topicIds: values.topicIds.length > 0 ? values.topicIds : undefined,
      tagIds: values.tagIds.length > 0 ? values.tagIds : undefined,
    }

    createQuestion.mutate(payload, { onSuccess: () => navigate('..') })
  })

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link to=".." className="text-sm text-brand-accent hover:underline">
        &larr; Back to questions
      </Link>

      <div className="mt-3 rounded-xl border border-border bg-background p-6 shadow-sm">
        <h1 className="font-heading text-xl font-semibold text-brand-primary">Create Question</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Creates the question and its first version in one step, as a draft — submitting it for
          review and approval is a separate workflow.
        </p>

        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-6">
          {/* --- Shared fields, apply to every type --- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="type" className="text-sm font-medium text-brand-primary">
                Type
              </label>
              <select id="type" className={inputClassName} {...register('type')}>
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
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
          </div>

          <QuestionContentFields
            type={type}
            register={register}
            control={control}
            watch={watch}
            setValue={setValue}
            getValues={getValues}
            errors={errors}
          />

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-brand-primary" htmlFor="categoryId">
              Category <span className="text-muted-foreground">(optional — global bank if unset)</span>
            </label>
            <Combobox
              id="categoryId"
              options={categoryOptions}
              value={categoryId || null}
              onSelect={(value) => setValue('categoryId', value)}
              placeholder="Search categories…"
              isLoading={categories.isPending}
              isError={categories.isError}
              errorMessage="Failed to load categories."
              emptyMessage={categories.isPending ? 'Loading…' : 'No categories found.'}
            />
          </div>

          <MultiSelectChips
            label="Topics"
            options={topicOptions}
            selectedIds={topicIds}
            onChange={(ids) => setValue('topicIds', ids)}
            isLoading={topics.isPending}
            isError={topics.isError}
            placeholder="Search topics to add…"
          />

          <MultiSelectChips
            label="Tags"
            options={tagOptions}
            selectedIds={tagIds}
            onChange={(ids) => setValue('tagIds', ids)}
            isLoading={tags.isPending}
            isError={tags.isError}
            placeholder="Search tags to add…"
          />

          {createQuestion.isError && (
            <p className="text-sm text-destructive">
              {createQuestion.error instanceof ApiError
                ? createQuestion.error.message
                : 'Failed to create question. Please try again.'}
            </p>
          )}

          <Button
            type="submit"
            disabled={createQuestion.isPending}
            className="w-full bg-brand-accent text-white hover:bg-brand-accent/90"
          >
            {createQuestion.isPending ? 'Creating…' : 'Create Question'}
          </Button>
        </form>
      </div>
    </div>
  )
}
