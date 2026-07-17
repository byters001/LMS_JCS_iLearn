import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { useTrainingSessions } from '@/features/trainers/api'
import { cn } from '@/lib/utils'
import { useCreateAssessment } from '../api'

// One-shot fetch at the backend's max page size, not a real paginated/
// searchable picker — this phase only unblocks discovering a valid
// trainingSessionId at all (previously there was no list endpoint). A
// searchable picker with its own pagination is deferred, larger scope (same
// bucket as the question/pool/batch pickers).
const TRAINING_SESSION_PAGE_SIZE = 100

// Optional numeric fields stay as plain strings at the SCHEMA level (Zod
// only validates the string's shape here) rather than z.coerce.number() or
// z.preprocess — both of those made the resolver's input/output types
// diverge just enough that useForm<T>'s generic stopped lining up with
// zodResolver's inferred type (a real compile error, not a style choice).
// Keeping the form's own type exactly "what the inputs actually produce"
// (strings) and converting to number only once, in onSubmit, sidesteps
// that entirely. An empty string is valid (field is optional) and is
// exactly what an untouched number input naturally holds — no
// preprocessing needed to avoid it coercing to 0.
const optionalIntString = z
  .string()
  .optional()
  .refine((value) => !value || /^\d+$/.test(value), 'Must be a positive whole number')
const optionalNonNegativeNumberString = z
  .string()
  .optional()
  .refine((value) => !value || /^\d+(\.\d+)?$/.test(value), 'Must be a non-negative number')

function toOptionalInt(value: string | undefined): number | undefined {
  return value ? Number.parseInt(value, 10) : undefined
}
function toOptionalNumber(value: string | undefined): number | undefined {
  return value ? Number.parseFloat(value) : undefined
}

// Matches backend/assessments.schema.ts's createAssessmentSchema. startAt/
// endAt and randomQuestionCount are deliberately NOT on this form — see
// features/assessments/types.ts's CreateAssessmentInput comment for why.
const createAssessmentFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  // Optional (item 4, decision doc): assessment_batches, not training
  // session, is what actually controls student visibility (item 8A's
  // diagnosis) — an empty string means "no specific session," the same
  // untouched-select-input default this form already uses elsewhere
  // (optionalIntString above), converted to `undefined` in onSubmit before
  // it ever reaches the backend's z.string().uuid().optional().
  trainingSessionId: z
    .string()
    .refine((value) => !value || z.string().uuid().safeParse(value).success, {
      message: 'Must be a valid training session UUID',
    }),
  testCategory: z.enum(['mcq', 'coding', 'psychometric', 'mixed']),
  description: z.string().optional(),
  timerMinutes: optionalIntString,
  maxAttempts: optionalIntString,
  shuffleQuestions: z.boolean(),
  negativeMarking: z.boolean(),
  negativeMarkingValue: optionalNonNegativeNumberString,
  proctoringCameraRequired: z.boolean(),
  proctoringFullscreenRequired: z.boolean(),
  isPractice: z.boolean(),
})

type CreateAssessmentFormValues = z.infer<typeof createAssessmentFormSchema>

const TEST_CATEGORY_OPTIONS: Array<{ value: CreateAssessmentFormValues['testCategory']; label: string }> = [
  { value: 'mcq', label: 'MCQ' },
  { value: 'coding', label: 'Coding' },
  { value: 'psychometric', label: 'Psychometric' },
  { value: 'mixed', label: 'Mixed' },
]

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent'

export default function CreateAssessmentPage() {
  const navigate = useNavigate()
  const createAssessment = useCreateAssessment()
  const trainingSessions = useTrainingSessions({ page: 1, pageSize: TRAINING_SESSION_PAGE_SIZE })

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CreateAssessmentFormValues>({
    resolver: zodResolver(createAssessmentFormSchema),
    defaultValues: {
      title: '',
      trainingSessionId: '',
      testCategory: 'mcq',
      description: '',
      shuffleQuestions: false,
      negativeMarking: false,
      proctoringCameraRequired: false,
      proctoringFullscreenRequired: false,
      isPractice: false,
    },
  })

  const negativeMarkingEnabled = watch('negativeMarking')

  const onSubmit = handleSubmit((values) => {
    createAssessment.mutate(
      {
        title: values.title,
        trainingSessionId: values.trainingSessionId || undefined,
        testCategory: values.testCategory,
        description: values.description || undefined,
        timerMinutes: toOptionalInt(values.timerMinutes),
        maxAttempts: toOptionalInt(values.maxAttempts),
        shuffleQuestions: values.shuffleQuestions,
        negativeMarking: values.negativeMarking,
        negativeMarkingValue: values.negativeMarking
          ? toOptionalNumber(values.negativeMarkingValue)
          : undefined,
        proctoringCameraRequired: values.proctoringCameraRequired,
        proctoringFullscreenRequired: values.proctoringFullscreenRequired,
        isPractice: values.isPractice,
      },
      {
        // Sections/questions/pools/batches are all handled on
        // AssessmentEditPage, not in this form — a staged approach that
        // matches how a real trainer actually works (settle the
        // assessment's identity first, then iteratively build out its
        // content), and keeps this form from becoming an unreviewable wall
        // of fields. Agreeing with that split, not just following it.
        onSuccess: (assessment) => navigate(`../${assessment.id}/edit`),
      },
    )
  })

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link to=".." className="text-sm text-brand-accent hover:underline">
        &larr; Back to assessments
      </Link>

      <div className="mt-3 rounded-lg border border-border bg-background p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-brand-primary">Create Assessment</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sections, questions, question pools, and batch assignment are all configured on the
          next screen once this assessment exists as a draft.
        </p>

        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="title" className="text-sm font-medium text-brand-primary">
              Title
            </label>
            <input id="title" className={inputClassName} {...register('title')} />
            {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="trainingSessionId" className="text-sm font-medium text-brand-primary">
              Training Session <span className="text-muted-foreground">(optional)</span>
            </label>

            {trainingSessions.isPending && (
              <div
                role="status"
                aria-label="Loading training sessions"
                className={cn(inputClassName, 'animate-pulse text-muted-foreground')}
              >
                Loading sessions…
              </div>
            )}

            {trainingSessions.isError && (
              <p className="text-sm text-destructive">
                {trainingSessions.error instanceof ApiError
                  ? trainingSessions.error.message
                  : 'Failed to load training sessions. Please try again.'}
              </p>
            )}

            {trainingSessions.data && (
              // Never disabled — "No specific session" (value="") is always a
              // real, selectable option, whether or not any sessions exist
              // yet. assessment_batches, not training session, is what
              // controls student visibility (item 8A's diagnosis), so there's
              // no reason a missing session should block creation.
              <select id="trainingSessionId" className={inputClassName} {...register('trainingSessionId')}>
                <option value="">No specific session</option>
                {trainingSessions.data.items.map((session) => (
                  // "{title} — {date} ({program})" — two sessions from
                  // DIFFERENT training programs can share the exact same
                  // title (e.g. both called "Session 1"), so title + date
                  // alone was ambiguous. trainingProgramName (backend now
                  // joins training_programs for this) makes each option
                  // distinguishable.
                  <option key={session.id} value={session.id}>
                    {session.title} — {session.sessionDate} ({session.trainingProgramName})
                  </option>
                ))}
              </select>
            )}

            {trainingSessions.data?.items.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No training sessions exist yet — that&apos;s fine, this assessment can be created
                without one and linked to a session later if one becomes relevant.
              </p>
            )}

            {errors.trainingSessionId && (
              <p className="text-sm text-destructive">{errors.trainingSessionId.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="testCategory" className="text-sm font-medium text-brand-primary">
              Test Category
            </label>
            <select
              id="testCategory"
              className={inputClassName}
              {...register('testCategory')}
            >
              {TEST_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="description" className="text-sm font-medium text-brand-primary">
              Description <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="description"
              rows={3}
              className={inputClassName}
              {...register('description')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="timerMinutes" className="text-sm font-medium text-brand-primary">
                Timer (minutes) <span className="text-muted-foreground">(optional)</span>
              </label>
              <input
                id="timerMinutes"
                type="number"
                min={1}
                className={inputClassName}
                {...register('timerMinutes')}
              />
              {errors.timerMinutes && (
                <p className="text-sm text-destructive">{errors.timerMinutes.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="maxAttempts" className="text-sm font-medium text-brand-primary">
                Max Attempts <span className="text-muted-foreground">(default 1)</span>
              </label>
              <input
                id="maxAttempts"
                type="number"
                min={1}
                className={inputClassName}
                {...register('maxAttempts')}
              />
              {errors.maxAttempts && (
                <p className="text-sm text-destructive">{errors.maxAttempts.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <label className="flex items-center gap-2 text-sm text-brand-primary">
              <input type="checkbox" {...register('shuffleQuestions')} />
              Shuffle questions
            </label>
            <label className="flex items-center gap-2 text-sm text-brand-primary">
              <input type="checkbox" {...register('isPractice')} />
              Practice assessment (doesn&apos;t count toward real results)
            </label>
            <label className="flex items-center gap-2 text-sm text-brand-primary">
              <input type="checkbox" {...register('proctoringCameraRequired')} />
              Require camera proctoring
            </label>
            <label className="flex items-center gap-2 text-sm text-brand-primary">
              <input type="checkbox" {...register('proctoringFullscreenRequired')} />
              Require fullscreen proctoring
            </label>
            <label className="flex items-center gap-2 text-sm text-brand-primary">
              <input type="checkbox" {...register('negativeMarking')} />
              Negative marking
            </label>
            {negativeMarkingEnabled && (
              <div className="space-y-1.5 pl-6">
                <label
                  htmlFor="negativeMarkingValue"
                  className="text-sm font-medium text-brand-primary"
                >
                  Marks deducted per wrong answer
                </label>
                <input
                  id="negativeMarkingValue"
                  type="number"
                  min={0}
                  step="0.01"
                  className={inputClassName}
                  {...register('negativeMarkingValue')}
                />
                {errors.negativeMarkingValue && (
                  <p className="text-sm text-destructive">{errors.negativeMarkingValue.message}</p>
                )}
              </div>
            )}
          </div>

          {createAssessment.isError && (
            <p className="text-sm text-destructive">
              {createAssessment.error instanceof ApiError
                ? createAssessment.error.message
                : 'Failed to create assessment. Please try again.'}
            </p>
          )}

          <Button
            type="submit"
            disabled={createAssessment.isPending}
            className="w-full bg-brand-accent text-white hover:bg-brand-accent/90"
          >
            {createAssessment.isPending ? 'Creating…' : 'Create Assessment'}
          </Button>
        </form>
      </div>
    </div>
  )
}
