import { useFieldArray } from 'react-hook-form'
import type {
  Control,
  FieldErrors,
  UseFormGetValues,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ImageUploadField } from './ImageUploadField'
import { CODING_LANGUAGE_LABELS } from '../types'
import type { CodingLanguageKey, CreateQuestionVersionInput, QuestionType } from '../types'

// Extracted from CreateQuestionPage.tsx (question-content-editing phase) —
// this is the exact same field set/JSX that page used to own inline, now
// shared verbatim with EditQuestionContentPage.tsx (creating a new version
// pre-filled from the current one). This is deliberately everything a
// question_versions row (+ its version-scoped children) can carry —
// questionText/marks/images/options/codingDetails/testCases/
// psychometricDetails/psychometricOptions — and NOTHING from the `questions`
// row itself (type/difficulty/category/college/topics/tags), since those are
// metadata that live outside versioning entirely (EditQuestionDialog.tsx's
// own metadata-only scope) and `type` specifically is fixed per question,
// never chosen per-version. CreateQuestionPage.tsx extends this schema with
// those extra metadata fields for its own use; EditQuestionContentPage.tsx
// uses it as-is.

export const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40'

// Same "validated string, converted once in onSubmit" convention as
// CreateAssessmentPage.tsx — see that file's comment for why
// z.coerce.number()/z.preprocess break useForm<T>'s generic inference
// against zodResolver.
export const optionalPositiveNumberString = z
  .string()
  .optional()
  .refine((value) => !value || /^\d+(\.\d+)?$/.test(value), 'Must be a positive number')
export const optionalPositiveIntString = z
  .string()
  .optional()
  .refine((value) => !value || /^\d+$/.test(value), 'Must be a positive whole number')

export const CODING_LANGUAGE_KEYS = Object.keys(CODING_LANGUAGE_LABELS) as CodingLanguageKey[]

export const questionContentFieldsSchema = z.object({
  questionText: z.string().min(1, 'Question text is required'),
  marks: optionalPositiveNumberString,
  // Question-level illustrative image — applies to any question type, not
  // just mcq, so it lives alongside questionText/marks rather than inside
  // the mcq-only `options` block below.
  questionImageUrl: z.string().optional(),
  // --- mcq ---
  options: z.array(
    z.object({
      optionText: z.string(),
      isCorrect: z.boolean(),
      imageUrl: z.string().optional(),
    }),
  ),
  // --- coding ---
  problemStatement: z.string().optional(),
  inputFormat: z.string().optional(),
  outputFormat: z.string().optional(),
  constraints: z.string().optional(),
  timeLimitMs: optionalPositiveIntString,
  memoryLimitKb: optionalPositiveIntString,
  supportedLanguages: z.array(z.enum(['C', 'CPP', 'JAVA', 'JAVASCRIPT', 'PYTHON3'])),
  testCases: z.array(
    z.object({
      input: z.string().optional(),
      expectedOutput: z.string().optional(),
      isHidden: z.boolean(),
      points: optionalPositiveNumberString,
    }),
  ),
  // --- psychometric ---
  traitCategory: z.string().optional(),
  scaleType: z.enum(['likert', 'scenario', '']),
  psychometricOptions: z.array(
    z.object({
      optionText: z.string(),
    }),
  ),
})

export type QuestionContentFieldsValues = z.infer<typeof questionContentFieldsSchema>

// question-bank.service.ts's assertTypeSpecificPayloadsMatch (the real
// backend rule) only FORBIDS the mismatched payload for a given type — it
// never REQUIRES options for mcq, or codingDetails for coding. The
// requirements below (options for mcq, a problem statement for coding) are a
// deliberate UX choice on top of that permissive schema, applied identically
// whether creating a question or editing its content — a version saved
// without them would be accepted by the backend but useless to a trainer
// building an assessment. Psychometric options are NOT required — every
// psychometric question is answerable on the fixed 1-5 scale regardless.
export function applyQuestionContentRefinements(
  type: QuestionType,
  data: QuestionContentFieldsValues,
  ctx: z.RefinementCtx,
): void {
  if (type === 'mcq') {
    const filledOptions = data.options.filter((o) => o.optionText.trim().length > 0)
    if (filledOptions.length < 2) {
      ctx.addIssue({
        path: ['options'],
        code: z.ZodIssueCode.custom,
        message: 'Add at least 2 options',
      })
    }
    if (!data.options.some((o) => o.isCorrect && o.optionText.trim().length > 0)) {
      ctx.addIssue({
        path: ['options'],
        code: z.ZodIssueCode.custom,
        message: 'Mark exactly one option as correct',
      })
    }
  }
  if (type === 'coding' && (!data.problemStatement || data.problemStatement.trim().length === 0)) {
    ctx.addIssue({
      path: ['problemStatement'],
      code: z.ZodIssueCode.custom,
      message: 'Problem statement is required',
    })
  }
}

// Shared payload builder — CreateQuestionPage.tsx spreads this into its own
// CreateQuestionInput (adding type/difficulty/categoryId/topicIds/tagIds);
// EditQuestionContentPage.tsx uses it as-is as the full CreateQuestionVersionInput
// body. Keeping this ONE function is what guarantees the two forms can never
// silently diverge on how e.g. empty test cases/options get filtered, or how
// numeric strings get parsed.
export function buildQuestionContentPayload(
  type: QuestionType,
  values: QuestionContentFieldsValues,
): CreateQuestionVersionInput {
  const payload: CreateQuestionVersionInput = {
    questionText: values.questionText,
    marks: values.marks ? Number.parseFloat(values.marks) : undefined,
  }

  if (values.questionImageUrl) {
    payload.images = [{ imageUrl: values.questionImageUrl, sortOrder: 0 }]
  }

  if (type === 'mcq') {
    payload.options = values.options
      .filter((o) => o.optionText.trim().length > 0)
      .map((o, index) => ({
        optionText: o.optionText,
        isCorrect: o.isCorrect,
        imageUrl: o.imageUrl || undefined,
        sortOrder: index,
      }))
  }

  if (type === 'coding') {
    payload.codingDetails = {
      problemStatement: values.problemStatement ?? '',
      inputFormat: values.inputFormat || undefined,
      outputFormat: values.outputFormat || undefined,
      constraints: values.constraints || undefined,
      timeLimitMs: values.timeLimitMs ? Number.parseInt(values.timeLimitMs, 10) : undefined,
      memoryLimitKb: values.memoryLimitKb ? Number.parseInt(values.memoryLimitKb, 10) : undefined,
      supportedLanguages:
        values.supportedLanguages.length > 0 ? values.supportedLanguages : undefined,
    }
    const filledTestCases = values.testCases.filter(
      (tc) => (tc.input?.length ?? 0) > 0 || (tc.expectedOutput?.length ?? 0) > 0,
    )
    if (filledTestCases.length > 0) {
      payload.testCases = filledTestCases.map((tc, index) => ({
        input: tc.input || undefined,
        expectedOutput: tc.expectedOutput || undefined,
        isHidden: tc.isHidden,
        points: tc.points ? Number.parseFloat(tc.points) : undefined,
        sortOrder: index,
      }))
    }
  }

  if (type === 'psychometric') {
    if (values.traitCategory || values.scaleType) {
      payload.psychometricDetails = {
        traitCategory: values.traitCategory || undefined,
        scaleType: values.scaleType || undefined,
      }
    }
    const filledLabels = values.psychometricOptions.filter((o) => o.optionText.trim().length > 0)
    if (filledLabels.length > 0) {
      payload.psychometricOptions = filledLabels.map((o, index) => ({
        optionText: o.optionText,
        sortOrder: index,
      }))
    }
  }

  return payload
}

// Generic over the CALLER's own form-values type (CreateQuestionFormValues
// extends QuestionContentFieldsValues with its extra type/difficulty/
// category/topic/tag fields; EditQuestionContentPage uses
// QuestionContentFieldsValues directly) — the caller's useForm<T>() call
// site stays fully typed end to end. Internally, the five form-methods
// props are cast ONCE (right below) down to their QuestionContentFieldsValues-
// typed equivalents — react-hook-form's Path<T> conditional type resolves
// to a real literal-path union for a CONCRETE type like
// QuestionContentFieldsValues, but not against a still-generic, merely-
// bounded TFieldValues, so every literal register('questionText')-style
// call in the JSX below needs Path<TFieldValues> to already be resolved;
// casting once here (rather than at every call site) is the only
// difference from a plain non-generic version of this component.
interface QuestionContentFieldsProps<TFieldValues extends QuestionContentFieldsValues> {
  type: QuestionType
  register: UseFormRegister<TFieldValues>
  control: Control<TFieldValues>
  watch: UseFormWatch<TFieldValues>
  setValue: UseFormSetValue<TFieldValues>
  getValues: UseFormGetValues<TFieldValues>
  errors: FieldErrors<TFieldValues>
}

export function QuestionContentFields<TFieldValues extends QuestionContentFieldsValues>(
  props: QuestionContentFieldsProps<TFieldValues>,
) {
  const { type } = props
  const errors = props.errors as FieldErrors<QuestionContentFieldsValues>
  const register = props.register as unknown as UseFormRegister<QuestionContentFieldsValues>
  const control = props.control as unknown as Control<QuestionContentFieldsValues>
  const watch = props.watch as unknown as UseFormWatch<QuestionContentFieldsValues>
  const setValue = props.setValue as unknown as UseFormSetValue<QuestionContentFieldsValues>
  const getValues = props.getValues as unknown as UseFormGetValues<QuestionContentFieldsValues>

  const optionsArray = useFieldArray({ control, name: 'options' })
  const testCasesArray = useFieldArray({ control, name: 'testCases' })
  const psychometricOptionsArray = useFieldArray({ control, name: 'psychometricOptions' })

  const supportedLanguages = watch('supportedLanguages')
  const questionImageUrl = watch('questionImageUrl')

  function setCorrectOption(index: number) {
    getValues('options').forEach((_, i) => {
      setValue(`options.${i}.isCorrect`, i === index)
    })
  }

  function toggleLanguage(language: CodingLanguageKey) {
    const current = getValues('supportedLanguages')
    setValue(
      'supportedLanguages',
      current.includes(language) ? current.filter((l) => l !== language) : [...current, language],
    )
  }

  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor="questionText" className="text-sm font-medium text-foreground">
          Question Text
        </label>
        <textarea
          id="questionText"
          rows={3}
          className={inputClassName}
          {...register('questionText')}
        />
        {errors.questionText && (
          <p className="text-xs text-destructive">{errors.questionText.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">
          Question Image <span className="text-muted-foreground">(optional)</span>
        </p>
        <ImageUploadField
          label="Question Image"
          value={questionImageUrl}
          onChange={(url) => setValue('questionImageUrl', url)}
        />
      </div>

      <div className="w-40 space-y-1.5">
        <label htmlFor="marks" className="text-sm font-medium text-foreground">
          Marks <span className="text-muted-foreground">(default 1)</span>
        </label>
        <input id="marks" type="number" min={0} step="0.01" className={inputClassName} {...register('marks')} />
        {errors.marks && <p className="text-xs text-destructive">{errors.marks.message}</p>}
      </div>

      {/* --- MCQ --- */}
      {type === 'mcq' && (
        <div className="space-y-2 rounded-lg border border-border p-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Options
          </p>
          {optionsArray.fields.map((field, index) => (
            <div key={field.id} className="flex items-center gap-2">
              <input
                type="radio"
                name="correctOption"
                aria-label={`Mark option ${index + 1} as correct`}
                checked={watch(`options.${index}.isCorrect`)}
                onChange={() => setCorrectOption(index)}
                className="size-4 shrink-0 accent-primary"
              />
              <input
                placeholder={`Option ${index + 1}`}
                className={inputClassName}
                {...register(`options.${index}.optionText`)}
              />
              <ImageUploadField
                label="Image"
                value={watch(`options.${index}.imageUrl`)}
                onChange={(url) => setValue(`options.${index}.imageUrl`, url)}
                className="shrink-0"
              />
              <button
                type="button"
                aria-label="Remove option"
                disabled={optionsArray.fields.length <= 2}
                onClick={() => optionsArray.remove(index)}
                className="shrink-0 text-sm text-muted-foreground hover:text-destructive disabled:opacity-30"
              >
                ✕
              </button>
            </div>
          ))}
          {errors.options && (
            <p className="text-xs text-destructive">{errors.options.message}</p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => optionsArray.append({ optionText: '', isCorrect: false, imageUrl: undefined })}
          >
            Add Option
          </Button>
        </div>
      )}

      {/* --- Coding --- */}
      {type === 'coding' && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <div className="space-y-1.5">
            <label htmlFor="problemStatement" className="text-sm font-medium text-foreground">
              Problem Statement
            </label>
            <textarea
              id="problemStatement"
              rows={3}
              className={inputClassName}
              {...register('problemStatement')}
            />
            {errors.problemStatement && (
              <p className="text-xs text-destructive">{errors.problemStatement.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Input Format</label>
              <textarea rows={2} className={inputClassName} {...register('inputFormat')} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Output Format</label>
              <textarea rows={2} className={inputClassName} {...register('outputFormat')} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Constraints</label>
              <textarea rows={2} className={inputClassName} {...register('constraints')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Time Limit (ms) <span className="text-muted-foreground">(optional)</span>
              </label>
              <input type="number" min={1} className={inputClassName} {...register('timeLimitMs')} />
              {errors.timeLimitMs && (
                <p className="text-xs text-destructive">{errors.timeLimitMs.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Memory Limit (KB) <span className="text-muted-foreground">(optional)</span>
              </label>
              <input type="number" min={1} className={inputClassName} {...register('memoryLimitKb')} />
              {errors.memoryLimitKb && (
                <p className="text-xs text-destructive">{errors.memoryLimitKb.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">
              Supported Languages <span className="text-muted-foreground">(optional)</span>
            </p>
            <div className="flex flex-wrap gap-3">
              {CODING_LANGUAGE_KEYS.map((language) => (
                <label key={language} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={supportedLanguages.includes(language)}
                    onChange={() => toggleLanguage(language)}
                    className="accent-primary"
                  />
                  {CODING_LANGUAGE_LABELS[language]}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Test Cases <span className="normal-case text-muted-foreground">(optional)</span>
            </p>
            {testCasesArray.fields.map((field, index) => (
              <div key={field.id} className="space-y-2 rounded-md border border-border p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Input</label>
                    <textarea
                      rows={2}
                      className={cn(inputClassName, 'font-mono text-xs')}
                      {...register(`testCases.${index}.input`)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Expected Output</label>
                    <textarea
                      rows={2}
                      className={cn(inputClassName, 'font-mono text-xs')}
                      {...register(`testCases.${index}.expectedOutput`)}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        className="accent-primary"
                        {...register(`testCases.${index}.isHidden`)}
                      />
                      Hidden
                    </label>
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-muted-foreground">Points</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="w-24 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        {...register(`testCases.${index}.points`)}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Remove test case"
                    onClick={() => testCasesArray.remove(index)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                testCasesArray.append({ input: '', expectedOutput: '', isHidden: true, points: '' })
              }
            >
              Add Test Case
            </Button>
          </div>
        </div>
      )}

      {/* --- Psychometric --- */}
      {type === 'psychometric' && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">
            Every psychometric question is answered on a fixed 1–5 scale at attempt time — the
            fields below only optionally relabel that scale and categorize the trait; they are not
            required.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Trait Category <span className="text-muted-foreground">(optional)</span>
              </label>
              <input className={inputClassName} {...register('traitCategory')} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Scale Type <span className="text-muted-foreground">(optional)</span>
              </label>
              <select className={inputClassName} {...register('scaleType')}>
                <option value="">Unset</option>
                <option value="likert">Likert</option>
                <option value="scenario">Scenario</option>
              </select>
            </div>
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Custom Scale Point Labels{' '}
              <span className="normal-case text-muted-foreground">
                (optional — point 1 through however many rows you add)
              </span>
            </p>
            {psychometricOptionsArray.fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold text-foreground">
                  {index + 1}
                </span>
                <input
                  placeholder={`Label for point ${index + 1}`}
                  className={inputClassName}
                  {...register(`psychometricOptions.${index}.optionText`)}
                />
                <button
                  type="button"
                  aria-label="Remove label"
                  onClick={() => psychometricOptionsArray.remove(index)}
                  className="shrink-0 text-sm text-muted-foreground hover:text-destructive"
                >
                  ✕
                </button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={psychometricOptionsArray.fields.length >= 5}
              onClick={() => psychometricOptionsArray.append({ optionText: '' })}
            >
              Add Label
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
