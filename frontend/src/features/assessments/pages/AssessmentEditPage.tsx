import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAssessmentDetail } from '../api'
import { AddSectionForm } from '../components/AddSectionForm'
import { AssessmentSectionCard } from '../components/AssessmentSectionCard'
import { AssessmentStatusBadge } from '../components/AssessmentStatusBadge'
import { BatchesEditor } from '../components/BatchesEditor'
import { DeleteAssessmentDialog } from '../components/DeleteAssessmentDialog'
import { EditAssessmentDialog } from '../components/EditAssessmentDialog'
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
  const navigate = useNavigate()
  const { data: assessment, isLoading, isError, error } = useAssessmentDetail(id)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  if (isError || !assessment) {
    return (
      <div className="p-4">
        <p className="text-sm text-destructive">
          {error instanceof ApiError ? error.message : "Couldn't load this assessment."}
        </p>
      </div>
    )
  }

  const isContentEditable = assessment.status === 'draft'

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <Link
        to=".."
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-3.5" />
        Back to assessments
      </Link>

      <Card className="p-3.5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate font-heading text-lg font-semibold text-foreground">
              {assessment.title}
            </h1>
            <p className="mt-0.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {TEST_CATEGORY_LABELS[assessment.testCategory]}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AssessmentStatusBadge status={assessment.status} />
          </div>
        </div>

        {/* Edit/delete are hidden entirely once status leaves draft — the
            backend's assertAssessmentEditable would 409 either request, and
            a button that can never succeed shouldn't be there to click.
            Same convention every content-editing control on this page
            already follows (isContentEditable below). */}
        {isContentEditable && (
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
              <Pencil className="size-3.5" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsDeleteOpen(true)}
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </div>
        )}

        <dl className="mt-3.5 grid grid-cols-3 gap-3 border-t border-border pt-3.5 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Timer</dt>
            <dd className="font-medium text-foreground">
              {assessment.timerMinutes ? `${assessment.timerMinutes} min` : 'No time limit'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Max Attempts</dt>
            <dd className="font-medium text-foreground">{assessment.maxAttempts}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Created</dt>
            <dd className="font-medium text-foreground">{formatDate(assessment.createdAt)}</dd>
          </div>
        </dl>
      </Card>

      <Card className="p-3.5">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Sections
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-0">
          {!isContentEditable && (
            <p className="rounded-lg bg-muted p-2.5 text-sm text-muted-foreground">
              Content is locked — only a &quot;draft&quot; assessment can have sections, questions,
              or pools added. This assessment&apos;s status is &quot;{assessment.status}&quot;.
            </p>
          )}

          <div className="space-y-3">
            {assessment.sections.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sections yet.</p>
            ) : (
              assessment.sections.map((section) => (
                <AssessmentSectionCard
                  key={section.id}
                  assessmentId={assessment.id}
                  section={section}
                  testCategory={assessment.testCategory}
                  isContentEditable={isContentEditable}
                />
              ))
            )}
          </div>

          {isContentEditable && (
            <div className="rounded-lg border-2 border-dashed border-border p-3">
              <p className="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Add a new section
              </p>
              <AddSectionForm assessmentId={assessment.id} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="p-3.5">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Batches
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <BatchesEditor
            assessmentId={assessment.id}
            status={assessment.status}
            batchIds={assessment.batchIds}
          />
        </CardContent>
      </Card>

      <Card className="p-3.5">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Workflow
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <WorkflowActions assessmentId={assessment.id} status={assessment.status} />
        </CardContent>
      </Card>

      <EditAssessmentDialog assessment={assessment} open={isEditOpen} onOpenChange={setIsEditOpen} />

      <DeleteAssessmentDialog
        assessment={assessment}
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        onDeleted={() => navigate('..')}
      />
    </div>
  )
}
