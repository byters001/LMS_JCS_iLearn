import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useQuestionPools } from '@/features/question-bank/api'
import {
  useAssessmentQuestions,
  useAssessmentSectionPools,
  useUpdateAssessmentQuestion,
} from '../api'
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
  // Backs the ▲/▼ reorder buttons below — swapping sortOrder needs each
  // row's REAL current value off the raw junction row, not its position in
  // section.resolvedQuestions (that array index is a display artifact, not
  // necessarily equal to sortOrder).
  const sortOrderByVersionId = new Map(
    (rawQuestions.data ?? []).map((q) => [q.questionVersionId, q.sortOrder]),
  )
  // Phase 5 — lets the attached-questions list show what's currently
  // restricted without a separate fetch; rawQuestions already carries
  // allowedLanguages (GET .../questions returns the bare assessment_questions
  // row, which now includes it).
  const allowedLanguagesByVersionId = new Map(
    (rawQuestions.data ?? []).map((q) => [q.questionVersionId, q.allowedLanguages]),
  )

  const updateAssessmentQuestion = useUpdateAssessmentQuestion(assessmentId)

  function handleReorder(currentIndex: number, direction: 'up' | 'down') {
    const questions = section.resolvedQuestions
    const adjacentIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    const current = questions[currentIndex]
    const adjacent = questions[adjacentIndex]
    if (!current || !adjacent) return

    const currentId = questionIdByVersionId.get(current.questionVersionId)
    const adjacentId = questionIdByVersionId.get(adjacent.questionVersionId)
    const currentSortOrder = sortOrderByVersionId.get(current.questionVersionId)
    const adjacentSortOrder = sortOrderByVersionId.get(adjacent.questionVersionId)
    if (!currentId || !adjacentId || currentSortOrder === undefined || adjacentSortOrder === undefined) {
      return
    }

    updateAssessmentQuestion.mutate({
      sectionId: section.id,
      questionId: currentId,
      input: { sortOrder: adjacentSortOrder },
    })
    updateAssessmentQuestion.mutate({
      sectionId: section.id,
      questionId: adjacentId,
      input: { sortOrder: currentSortOrder },
    })
  }

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
      <div className="flex items-center justify-between gap-3 rounded-t-lg bg-muted/30 px-3.5 py-2">
        <h3 className="text-sm font-medium text-foreground">{section.title}</h3>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm">
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

      <div className="p-3.5">
        {section.resolvedQuestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No questions yet.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {section.resolvedQuestions.map((question, index) => {
              const assessmentQuestionId = questionIdByVersionId.get(question.questionVersionId)
              const allowedLanguages = allowedLanguagesByVersionId.get(question.questionVersionId)
              return (
                <li
                  key={question.questionVersionId}
                  className="flex items-center justify-between gap-3 text-muted-foreground"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {isContentEditable && section.selectionMode === 'manual' && (
                      <span className="flex shrink-0 flex-col">
                        <button
                          type="button"
                          aria-label="Move up"
                          disabled={index === 0 || updateAssessmentQuestion.isPending}
                          onClick={() => handleReorder(index, 'up')}
                          className="text-muted-foreground hover:text-primary disabled:pointer-events-none disabled:opacity-30"
                        >
                          <ChevronUp className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Move down"
                          disabled={
                            index === section.resolvedQuestions.length - 1 ||
                            updateAssessmentQuestion.isPending
                          }
                          onClick={() => handleReorder(index, 'down')}
                          className="text-muted-foreground hover:text-primary disabled:pointer-events-none disabled:opacity-30"
                        >
                          <ChevronDown className="size-3.5" />
                        </button>
                      </span>
                    )}
                    <span className="truncate">{question.questionText}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {allowedLanguages && allowedLanguages.length > 0 && (
                      <span
                        className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400"
                        title="Languages restricted for this assessment"
                      >
                        {allowedLanguages.join(', ')}
                      </span>
                    )}
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
                  <span className="text-primary">
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
        <div className="rounded-b-lg border-t border-border bg-muted/10 px-3.5 py-2.5">
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
