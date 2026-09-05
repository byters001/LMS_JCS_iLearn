import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { useQuestionPools } from '@/features/question-bank/api'
import { cn } from '@/lib/utils'
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
  // Phase 5 — lets the attached-questions list show what's currently
  // restricted without a separate fetch; rawQuestions already carries
  // allowedLanguages (GET .../questions returns the bare assessment_questions
  // row, which now includes it).
  const allowedLanguagesByVersionId = new Map(
    (rawQuestions.data ?? []).map((q) => [q.questionVersionId, q.allowedLanguages]),
  )

  // --- Click-to-rank manual reordering ---
  // clientOrder holds assessmentQuestionIds in the order the admin has
  // clicked them — NOT a swap-on-click interaction like the previous ▲/▼
  // buttons. Ranks are always DERIVED from clientOrder.indexOf(id), never
  // stored per-row, so unranking a row (click it again) and re-ranking it
  // later automatically renumbers everything correctly — no stale rank to
  // clean up.
  const [isReordering, setIsReordering] = useState(false)
  const [clientOrder, setClientOrder] = useState<string[]>([])
  const [orderSaveError, setOrderSaveError] = useState<string | null>(null)
  const [isSavingOrder, setIsSavingOrder] = useState(false)

  const updateAssessmentQuestion = useUpdateAssessmentQuestion(assessmentId)
  const queryClient = useQueryClient()

  function handleStartReorder() {
    // Guards against entering reorder mode before questionIdByVersionId (built
    // from rawQuestions.data) exists — the button below is also disabled
    // while rawQuestions.isPending, but a fast double-click can fire this
    // handler before React re-renders with the disabled state, so the check
    // is repeated here rather than trusted to the button alone.
    if (rawQuestions.isPending) return
    setClientOrder([])
    setOrderSaveError(null)
    setIsReordering(true)
  }

  function handleResetOrder() {
    setClientOrder([])
    setOrderSaveError(null)
  }

  function handleCancelReorder() {
    setIsReordering(false)
    setClientOrder([])
    setOrderSaveError(null)
  }

  // Toggles one row's rank: appends it if unranked, removes it if already
  // ranked (lets the admin correct a misclick without starting over — the
  // row falls back to unranked and re-joins the bottom group in its
  // original relative order, and re-clicking it later re-appends it at
  // whatever position is next at THAT time, not its old one).
  function handleToggleRank(assessmentQuestionId: string) {
    setClientOrder((current) =>
      current.includes(assessmentQuestionId)
        ? current.filter((id) => id !== assessmentQuestionId)
        : [...current, assessmentQuestionId],
    )
  }

  async function handleSaveOrder() {
    setIsSavingOrder(true)
    setOrderSaveError(null)
    try {
      await Promise.all(
        clientOrder.map((id, index) =>
          updateAssessmentQuestion.mutateAsync({
            sectionId: section.id,
            questionId: id,
            input: { sortOrder: index },
          }),
        ),
      )
      // Safety net — the mutation itself already invalidates this on each
      // call's own success, but an extra invalidate after the whole batch
      // resolves is cheap and avoids any race between the LAST mutation's
      // own invalidation and this component re-reading section.resolvedQuestions.
      queryClient.invalidateQueries({ queryKey: ['assessments', 'detail', assessmentId] })
      setIsReordering(false)
      setClientOrder([])
    } catch (error) {
      setOrderSaveError(
        error instanceof ApiError ? error.message : 'Failed to save the new order. Please try again.',
      )
    } finally {
      setIsSavingOrder(false)
    }
  }

  // Display list while reordering: ranked rows first (in clientOrder's own
  // order), then unranked rows in their existing resolvedQuestions order.
  // Outside isReordering, resolvedQuestions renders completely unchanged.
  const displayQuestions = isReordering
    ? [
        ...clientOrder.flatMap((id) => {
          const question = section.resolvedQuestions.find(
            (q) => questionIdByVersionId.get(q.questionVersionId) === id,
          )
          return question ? [question] : []
        }),
        ...section.resolvedQuestions.filter((q) => {
          const id = questionIdByVersionId.get(q.questionVersionId)
          return !id || !clientOrder.includes(id)
        }),
      ]
    : section.resolvedQuestions

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
              {section.selectionMode === 'manual' &&
                section.resolvedQuestions.length > 1 &&
                (isReordering ? (
                  <>
                    <Button variant="outline" size="sm" onClick={handleCancelReorder}>
                      Cancel
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleResetOrder}>
                      Reset
                    </Button>
                    <Button
                      size="sm"
                      disabled={
                        clientOrder.length !== section.resolvedQuestions.length || isSavingOrder
                      }
                      onClick={handleSaveOrder}
                    >
                      {isSavingOrder ? 'Saving…' : 'Save Order'}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={rawQuestions.isPending}
                    onClick={handleStartReorder}
                  >
                    {rawQuestions.isPending ? 'Loading…' : 'Reorder Questions'}
                  </Button>
                ))}
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

      {orderSaveError && (
        <p className="px-3.5 pt-3 text-xs text-destructive">{orderSaveError}</p>
      )}

      <div className="p-3.5">
        {isReordering && (
          <p className="mb-2 text-xs text-muted-foreground">
            Click each question in the order it should appear, then Save Order. Click a ranked
            question again to undo it.
          </p>
        )}
        {section.resolvedQuestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No questions yet.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {displayQuestions.map((question) => {
              const assessmentQuestionId = questionIdByVersionId.get(question.questionVersionId)
              const allowedLanguages = allowedLanguagesByVersionId.get(question.questionVersionId)
              const rank = assessmentQuestionId ? clientOrder.indexOf(assessmentQuestionId) : -1
              const isRanked = rank !== -1

              const rankBadge = isReordering && (
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium',
                    isRanked
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-dashed border-muted-foreground/50 text-muted-foreground',
                  )}
                >
                  {isRanked ? rank + 1 : '–'}
                </span>
              )

              return (
                <li
                  key={question.questionVersionId}
                  className="flex items-center justify-between gap-3 text-muted-foreground"
                >
                  {isReordering && assessmentQuestionId ? (
                    <button
                      type="button"
                      onClick={() => handleToggleRank(assessmentQuestionId)}
                      className="flex min-w-0 items-center gap-2 text-left hover:text-foreground"
                    >
                      {rankBadge}
                      <span className="truncate">{question.questionText}</span>
                    </button>
                  ) : (
                    <span className="flex min-w-0 items-center gap-2">
                      {rankBadge}
                      <span className="truncate">{question.questionText}</span>
                    </span>
                  )}
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
                        onClick={(event) => {
                          event.stopPropagation()
                          setRemovingQuestion({
                            id: assessmentQuestionId,
                            text: question.questionText,
                          })
                        }}
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
