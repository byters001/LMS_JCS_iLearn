import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useQuestionPools } from '@/features/question-bank/api'
import { useAssessmentQuestions, useAssessmentSectionPools } from '../api'
import type { AssessmentSectionWithResolvedQuestions, TestCategory } from '../types'
import { AttachPoolForm } from './AttachPoolForm'
import { AttachQuestionForm } from './AttachQuestionForm'
import { DeleteSectionDialog } from './DeleteSectionDialog'
import { EditSectionDialog } from './EditSectionDialog'
import { RemovePoolDialog } from './RemovePoolDialog'
import { RemoveQuestionDialog } from './RemoveQuestionDialog'

const POOL_PICKER_PAGE_SIZE = 100

interface AssessmentSectionCardProps {
  assessmentId: string
  section: AssessmentSectionWithResolvedQuestions
  testCategory: TestCategory
  isContentEditable: boolean
}

// Extracted out of AssessmentEditPage.tsx (item 10 tier 3b) once per-section
// rendering needed its own hook calls (raw junction-row lists for the
// Remove buttons below) — those can't live in AssessmentEditPage's own
// sections.map() loop without breaking the rules of hooks, so each section
// is its own component instance instead.
export function AssessmentSectionCard({
  assessmentId,
  section,
  testCategory,
  isContentEditable,
}: AssessmentSectionCardProps) {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [removingQuestion, setRemovingQuestion] = useState<{ id: string; text: string } | null>(
    null,
  )
  const [removingPoolLinkId, setRemovingPoolLinkId] = useState<string | null>(null)

  // Only needed to back the manual-question Remove button (map
  // questionVersionId -> the assessment_questions row id DELETE actually
  // targets — see api.ts's useAssessmentQuestions comment). Not fetched
  // for pool sections at all.
  const rawQuestions = useAssessmentQuestions(
    assessmentId,
    section.selectionMode === 'manual' ? section.id : undefined,
  )
  const questionIdByVersionId = new Map(
    (rawQuestions.data ?? []).map((q) => [q.questionVersionId, q.id]),
  )

  // Attached pools shown as their own list — a pool's resolved questions
  // (in resolvedQuestions below) have no stable per-row identity to remove
  // individually, only the pool LINK itself does. Fetched for every pool
  // section (not just when editable) since it's genuinely informative on
  // its own — resolvedQuestions alone doesn't reveal which pool(s) feed a
  // section.
  const rawPools = useAssessmentSectionPools(
    assessmentId,
    section.selectionMode === 'pool' ? section.id : undefined,
  )
  const pools = useQuestionPools({
    type: testCategory === 'mixed' ? undefined : testCategory,
    page: 1,
    pageSize: POOL_PICKER_PAGE_SIZE,
  })
  const poolNameById = new Map((pools.data?.items ?? []).map((p) => [p.id, p.name]))
  const removingPool = (rawPools.data ?? []).find((link) => link.id === removingPoolLinkId)

  return (
    <div className="rounded-lg border border-border">
      {/* rounded-t-lg here (not overflow-hidden on the parent) — see
          AssessmentEditPage.tsx's original comment on why: clipping would
          also clip the Attach forms' Combobox dropdowns. */}
      <div className="flex items-center justify-between gap-3 rounded-t-lg bg-muted/30 px-4 py-2.5">
        <h3 className="font-medium text-brand-primary">{section.title}</h3>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground shadow-sm">
            {section.selectionMode === 'manual' ? 'Manual' : 'Pool'}
          </span>
          {isContentEditable && (
            <>
              <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-destructive text-destructive hover:bg-destructive/5"
                onClick={() => setIsDeleteOpen(true)}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="p-4">
        {section.resolvedQuestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No questions yet.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {section.resolvedQuestions.map((question) => {
              const assessmentQuestionId = questionIdByVersionId.get(question.questionVersionId)
              return (
                <li
                  key={question.questionVersionId}
                  className="flex items-center justify-between gap-3 text-muted-foreground"
                >
                  <span className="truncate">{question.questionText}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {question.marks} marks
                    </span>
                    {isContentEditable && question.source === 'manual' && assessmentQuestionId && (
                      <button
                        type="button"
                        className="text-xs font-medium text-destructive hover:underline"
                        onClick={() =>
                          setRemovingQuestion({
                            id: assessmentQuestionId,
                            text: question.questionText,
                          })
                        }
                      >
                        Remove
                      </button>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        {section.selectionMode === 'pool' && (rawPools.data?.length ?? 0) > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Attached Pools
            </p>
            <ul className="space-y-1.5 text-sm">
              {(rawPools.data ?? []).map((link) => (
                <li key={link.id} className="flex items-center justify-between gap-3">
                  <span className="text-brand-primary">
                    {poolNameById.get(link.questionPoolId) ?? link.questionPoolId}
                  </span>
                  {isContentEditable && (
                    <button
                      type="button"
                      className="text-xs font-medium text-destructive hover:underline"
                      onClick={() => setRemovingPoolLinkId(link.id)}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {isContentEditable && (
        <div className="rounded-b-lg border-t border-border bg-muted/10 px-4 py-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {section.selectionMode === 'manual' ? 'Attach a question' : 'Attach a pool'}
          </p>
          {section.selectionMode === 'manual' ? (
            <AttachQuestionForm
              assessmentId={assessmentId}
              sectionId={section.id}
              testCategory={testCategory}
            />
          ) : (
            <AttachPoolForm
              assessmentId={assessmentId}
              sectionId={section.id}
              testCategory={testCategory}
            />
          )}
        </div>
      )}

      <EditSectionDialog
        assessmentId={assessmentId}
        section={section}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
      />
      <DeleteSectionDialog
        assessmentId={assessmentId}
        section={section}
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
      />
      {removingQuestion && (
        <RemoveQuestionDialog
          assessmentId={assessmentId}
          sectionId={section.id}
          questionId={removingQuestion.id}
          questionText={removingQuestion.text}
          open={Boolean(removingQuestion)}
          onOpenChange={(open) => {
            if (!open) setRemovingQuestion(null)
          }}
        />
      )}
      {removingPool && (
        <RemovePoolDialog
          assessmentId={assessmentId}
          sectionId={section.id}
          poolId={removingPool.id}
          poolName={poolNameById.get(removingPool.questionPoolId) ?? removingPool.questionPoolId}
          open={Boolean(removingPool)}
          onOpenChange={(open) => {
            if (!open) setRemovingPoolLinkId(null)
          }}
        />
      )}
    </div>
  )
}
