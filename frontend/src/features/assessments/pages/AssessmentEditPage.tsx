import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/api'
import { useAssessmentDetail } from '../api'
import { AddSectionForm } from '../components/AddSectionForm'
import { AssessmentStatusBadge } from '../components/AssessmentStatusBadge'
import { AttachPoolForm } from '../components/AttachPoolForm'
import { AttachQuestionForm } from '../components/AttachQuestionForm'
import { BatchesEditor } from '../components/BatchesEditor'
import { WorkflowActions } from '../components/WorkflowActions'
import type { TestCategory } from '../types'

const TEST_CATEGORY_LABELS: Record<TestCategory, string> = {
  mcq: 'MCQ',
  coding: 'Coding',
  psychometric: 'Psychometric',
  mixed: 'Mixed',
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// Shows the assessment's current state and lets staff build it out:
// sections (manual or pool), questions/pools attached to each section, and
// batch assignment — then drive it through the five-action approval
// workflow. Content editing (sections/questions/pools) mirrors the
// backend's assertAssessmentEditable: draft-only, locked the moment
// review starts. Batch editing mirrors assertBatchesEditable's wider
// window: editable through draft/review/approved/scheduled, locked only at
// live/completed/archived (see BatchesEditor.tsx and
// assessments.service.ts's module comment on why that window is
// deliberately wider than content editing's).
export default function AssessmentEditPage() {
  const { id } = useParams<{ id: string }>()
  const { data: assessment, isLoading, isError, error } = useAssessmentDetail(id)

  if (isLoading) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading assessment…</p>
      </div>
    )
  }

  if (isError || !assessment) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">
          {error instanceof ApiError ? error.message : "Couldn't load this assessment."}
        </p>
      </div>
    )
  }

  const isContentEditable = assessment.status === 'draft'

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link to=".." className="text-sm text-brand-accent hover:underline">
        &larr; Back to assessments
      </Link>

      <div className="mt-3 rounded-xl border border-border bg-background p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-brand-primary">{assessment.title}</h1>
            <p className="mt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {TEST_CATEGORY_LABELS[assessment.testCategory]}
            </p>
          </div>
          <AssessmentStatusBadge status={assessment.status} />
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Timer</dt>
            <dd className="font-medium text-brand-primary">
              {assessment.timerMinutes ? `${assessment.timerMinutes} min` : 'No time limit'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Max Attempts</dt>
            <dd className="font-medium text-brand-primary">{assessment.maxAttempts}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Created</dt>
            <dd className="font-medium text-brand-primary">{formatDate(assessment.createdAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-background p-6 shadow-sm">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Sections
        </h2>

        {!isContentEditable && (
          <p className="mt-3 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            Content is locked — only a &quot;draft&quot; assessment can have sections, questions,
            or pools added. This assessment&apos;s status is &quot;{assessment.status}&quot;.
          </p>
        )}

        <div className="mt-4 space-y-4">
          {assessment.sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sections yet.</p>
          ) : (
            assessment.sections.map((section) => (
              <div key={section.id} className="rounded-lg border border-border">
                {/* rounded-t-lg here (not overflow-hidden on the parent) —
                    the parent used to clip corners via overflow-hidden,
                    which also clipped the Attach-a-Pool/Attach-a-question
                    Combobox's absolutely-positioned dropdown at the bottom
                    of this card whenever it had more than a couple of
                    matching results. Rounding each colored child directly
                    gets the same visual corners without clipping anything
                    that needs to render outside the card's box. */}
                <div className="flex items-center justify-between gap-3 rounded-t-lg bg-muted/30 px-4 py-2.5">
                  <h3 className="font-medium text-brand-primary">{section.title}</h3>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground shadow-sm">
                    {section.selectionMode === 'manual' ? 'Manual' : 'Pool'}
                  </span>
                </div>

                <div className="p-4">
                  {section.resolvedQuestions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No questions yet.</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {section.resolvedQuestions.map((question) => (
                        <li
                          key={question.questionVersionId}
                          className="flex items-center justify-between gap-3 text-muted-foreground"
                        >
                          <span className="truncate">{question.questionText}</span>
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs">
                            {question.marks} marks
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {isContentEditable && (
                  <div className="rounded-b-lg border-t border-border bg-muted/10 px-4 py-3">
                    <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {section.selectionMode === 'manual' ? 'Attach a question' : 'Attach a pool'}
                    </p>
                    {section.selectionMode === 'manual' ? (
                      <AttachQuestionForm
                        assessmentId={assessment.id}
                        sectionId={section.id}
                        testCategory={assessment.testCategory}
                      />
                    ) : (
                      <AttachPoolForm
                        assessmentId={assessment.id}
                        sectionId={section.id}
                        testCategory={assessment.testCategory}
                      />
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {isContentEditable && (
          <div className="mt-4 rounded-lg border-2 border-dashed border-border p-4">
            <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Add a new section
            </p>
            <AddSectionForm assessmentId={assessment.id} />
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-background p-6 shadow-sm">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Batches
        </h2>
        <div className="mt-4">
          <BatchesEditor
            assessmentId={assessment.id}
            status={assessment.status}
            batchIds={assessment.batchIds}
          />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-background p-6 shadow-sm">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Workflow
        </h2>
        <div className="mt-4">
          <WorkflowActions assessmentId={assessment.id} status={assessment.status} />
        </div>
      </div>
    </div>
  )
}
