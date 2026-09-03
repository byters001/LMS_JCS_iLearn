import { useMemo } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useEditQuestionContent, useQuestionDetail } from '../api'
import {
  applyQuestionContentRefinements,
  buildQuestionContentPayload,
  questionContentFieldsSchema,
  QuestionContentFields,
  type QuestionContentFieldsValues,
} from '../components/QuestionContentFields'
import type { QuestionVersionContent, QuestionWithCurrentVersion } from '../types'

function toScaleType(value: string | undefined): 'likert' | 'scenario' | '' {
  return value === 'likert' || value === 'scenario' ? value : ''
}

// Pre-fills the edit form from the CURRENT version's content — the whole
// point of this page (module comment below). Falls back to CreateQuestionPage's
// own empty-form defaults when currentVersion is null (shouldn't happen —
// createQuestion sets it atomically — but the FK is nullable, so
// QuestionWithCurrentVersion's own type reflects that; see
// question-bank.types.ts on the backend).
function toDefaultValues(version: QuestionVersionContent | null): QuestionContentFieldsValues {
  return {
    questionText: version?.questionText ?? '',
    marks: version?.marks ?? '',
    questionImageUrl: version?.images[0]?.imageUrl,
    options:
      version && version.options.length > 0
        ? version.options.map((o) => ({
            optionText: o.optionText,
            isCorrect: o.isCorrect,
            imageUrl: o.imageUrl ?? undefined,
          }))
        : [
            { optionText: '', isCorrect: false, imageUrl: undefined },
            { optionText: '', isCorrect: false, imageUrl: undefined },
          ],
    problemStatement: version?.codingDetails?.problemStatement ?? '',
    inputFormat: version?.codingDetails?.inputFormat ?? '',
    outputFormat: version?.codingDetails?.outputFormat ?? '',
    constraints: version?.codingDetails?.constraints ?? '',
    timeLimitMs: version?.codingDetails ? String(version.codingDetails.timeLimitMs) : '',
    memoryLimitKb: version?.codingDetails ? String(version.codingDetails.memoryLimitKb) : '',
    supportedLanguages: version?.codingDetails?.supportedLanguages ?? [],
    testCases:
      version?.testCases.map((tc) => ({
        input: tc.input ?? '',
        expectedOutput: tc.expectedOutput ?? '',
        isHidden: tc.isHidden,
        points: tc.points,
      })) ?? [],
    traitCategory: version?.psychometricDetails?.traitCategory ?? '',
    scaleType: toScaleType(version?.psychometricDetails?.scaleType),
    psychometricOptions:
      version?.psychometricOptions.map((o) => ({ optionText: o.optionText })) ?? [],
  }
}

// The actual form — split out from the page component below so `question`
// (and therefore its fixed `type`, which the content schema's superRefine
// needs) is guaranteed loaded before useForm() ever mounts, same
// load-then-render-the-real-form split QuestionDetailPage.tsx already uses
// for EditQuestionDialog/DeleteQuestionDialog.
function EditQuestionContentForm({
  question,
  onSaved,
}: {
  question: QuestionWithCurrentVersion
  onSaved: () => void
}) {
  const editContent = useEditQuestionContent(question.id)

  // type is fixed per question (never chosen here — see
  // CreateQuestionVersionInput's own comment in types.ts), so the
  // per-type refinements close over `question.type` directly rather than
  // reading it off form data the way CreateQuestionPage's schema does.
  const editQuestionContentFormSchema = useMemo(
    () =>
      questionContentFieldsSchema.superRefine((data, ctx) =>
        applyQuestionContentRefinements(question.type, data, ctx),
      ),
    [question.type],
  )

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<QuestionContentFieldsValues>({
    resolver: zodResolver(editQuestionContentFormSchema),
    defaultValues: toDefaultValues(question.currentVersion),
  })

  const onSubmit = handleSubmit((values) => {
    const payload = buildQuestionContentPayload(question.type, values)
    editContent.mutate(payload, { onSuccess: onSaved })
  })

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <Link to={`../${question.id}`} className="text-sm text-primary hover:underline">
        &larr; Back to question
      </Link>

      <Card className="p-3.5">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="text-xl">Edit Content</CardTitle>
          <CardDescription>
            Question content is versioned, never edited in place — saving here creates a NEW version
            pre-filled from the current one and immediately makes it current. The version you're
            editing from stays in history, exactly as it was; any attempt already frozen on it (a
            student mid-assessment or already graded) is entirely unaffected, since attempts
            reference a specific version id, never "whichever version is current."
          </CardDescription>
        </CardHeader>

        <CardContent className="px-0 pb-0">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <QuestionContentFields
            type={question.type}
            register={register}
            control={control}
            watch={watch}
            setValue={setValue}
            getValues={getValues}
            errors={errors}
          />

          {editContent.isError && (
            <p className="text-sm text-destructive">
              {editContent.error instanceof ApiError
                ? editContent.error.message
                : 'Failed to save this version. Please try again.'}
            </p>
          )}

          <Button type="submit" disabled={editContent.isPending} className="w-full">
            {editContent.isPending ? 'Saving…' : 'Save New Version'}
          </Button>
        </form>
        </CardContent>
      </Card>
    </div>
  )
}

// Question content editing via new-version creation (the deferred feature
// from the original question-bank module) — distinct from
// EditQuestionDialog.tsx's metadata-only edit (category/difficulty/college).
// POST /questions/:id/versions already existed, unconsumed, before this page
// (confirmed by reading question-bank.routes.ts/.service.ts/.repository.ts
// directly): it always creates a brand-new question_versions row, never
// mutates the current one in place — the immutability guarantee attempt
// freezing depends on (attempt_question_selections.question_version_id/
// attempt_responses.question_version_id both FK a SPECIFIC version row,
// `onDelete: 'restrict'`, never re-resolved off questions.current_version_id
// once an attempt exists — see attempts.repository.ts's listFrozenQuestions
// and attempts.schema.ts's own module comment on attempt_question_selections
// for the real evidence this was checked against, not assumed).
export default function EditQuestionContentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: question, isLoading, isError, error } = useQuestionDetail(id)

  if (isLoading) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Loading question…</p>
      </div>
    )
  }

  if (isError || !question) {
    return (
      <div className="p-4">
        <p className="text-sm text-destructive">
          {error instanceof ApiError ? error.message : "Couldn't load this question."}
        </p>
      </div>
    )
  }

  return (
    <EditQuestionContentForm question={question} onSaved={() => navigate(`../${question.id}`)} />
  )
}
