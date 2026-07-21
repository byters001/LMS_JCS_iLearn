import { useState } from 'react'
import { ChevronDown, ChevronUp, CircleCheck, CircleX, Clock, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SubmitCodeResult, TestCaseResult } from '../types'

// Judge0's normalized statuses (backend/src/integrations/judge0/judge0.constants.ts's
// NORMALIZED_STATUS) — 'accepted' is the only passing one, everything else
// (including error states) is a fail for that test case.
const STATUS_LABELS: Record<string, string> = {
  accepted: 'Accepted',
  wrong_answer: 'Wrong Answer',
  time_limit_exceeded: 'Time Limit Exceeded',
  compile_error: 'Compile Error',
  runtime_error: 'Runtime Error',
  internal_error: 'Internal Error',
  exec_format_error: 'Execution Format Error',
}

interface TestResultsPanelProps {
  isOpen: boolean
  onToggle: () => void
  isPending: boolean
  isError: boolean
  errorMessage: string | null
  // null covers two distinct cases the caller has already resolved: no
  // submission has run yet, or the last one is stale (code/language changed
  // since) — isStale tells the panel which of those two it is.
  result: SubmitCodeResult | null
  isStale: boolean
}

export function TestResultsPanel({
  isOpen,
  onToggle,
  isPending,
  isError,
  errorMessage,
  result,
  isStale,
}: TestResultsPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  function toggleExpanded(testCaseId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(testCaseId)) {
        next.delete(testCaseId)
      } else {
        next.add(testCaseId)
      }
      return next
    })
  }

  const summary = isPending
    ? 'Running…'
    : isError
      ? 'Run failed'
      : result
        ? `${result.testCasesPassed} / ${result.testCasesTotal} passed${
            result.marksObtained !== null ? ` · ${result.marksObtained} marks` : ''
          }`
        : isStale
          ? 'Code changed — run again'
          : null

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col">
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="max-h-72 overflow-y-auto border-t border-border bg-background">
            {isPending && (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Running your code against the test cases — this can take a few seconds…
              </div>
            )}

            {!isPending && isError && (
              <p className="px-3 py-4 text-sm text-destructive">
                {errorMessage ?? 'Failed to run your code — try again.'}
              </p>
            )}

            {!isPending && !isError && result && (
              <div>
                {result.testCaseResults.map((testCase) => (
                  <TestCaseRow
                    key={testCase.testCaseId}
                    testCase={testCase}
                    isExpanded={expandedIds.has(testCase.testCaseId)}
                    onToggle={() => toggleExpanded(testCase.testCaseId)}
                  />
                ))}
              </div>
            )}

            {!isPending && !isError && !result && isStale && (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                Code has changed since this result — run again to see updated results.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Persistent handle — this is the only part of the panel visible
          when collapsed, so it never eats editor space while unused, but
          always gives a way back in once a run has happened. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex items-center justify-between gap-2 border-t border-border bg-muted/60 px-3 py-1.5 text-xs font-medium text-brand-primary backdrop-blur-sm transition-colors hover:bg-muted"
      >
        <span className="flex items-center gap-1.5">
          {isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          <span>Test Results</span>
          {summary && <span className="text-muted-foreground">— {summary}</span>}
        </span>
        <ChevronUp
          className={cn('size-3.5 shrink-0 transition-transform', isOpen && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
    </div>
  )
}

function TestCaseRow({
  testCase,
  isExpanded,
  onToggle,
}: {
  testCase: TestCaseResult
  isExpanded: boolean
  onToggle: () => void
}) {
  const passed = testCase.status === 'accepted'
  // sortOrder is 0-based (question-bank's coding_test_cases.sort_order) —
  // +1 for a human-facing "Test Case N" label.
  const label = `${testCase.isHidden ? 'Hidden ' : ''}Test Case ${testCase.sortOrder + 1}`
  const canExpand = !testCase.isHidden

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={canExpand ? onToggle : undefined}
        aria-expanded={canExpand ? isExpanded : undefined}
        disabled={!canExpand}
        className={cn(
          'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm',
          canExpand ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {passed ? (
            <CircleCheck className="size-4 shrink-0 text-green-600" aria-hidden="true" />
          ) : (
            <CircleX className="size-4 shrink-0 text-destructive" aria-hidden="true" />
          )}
          <span className="truncate font-medium text-brand-primary">{label}</span>
          <span
            className={cn(
              'shrink-0 text-xs',
              passed ? 'text-green-700 dark:text-green-400' : 'text-destructive',
            )}
          >
            {STATUS_LABELS[testCase.status] ?? testCase.status}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {testCase.time !== null && (
            <span className="flex items-center gap-1">
              <Clock className="size-3" aria-hidden="true" />
              {Math.round(testCase.time * 1000)} ms
            </span>
          )}
          {canExpand && (
            <ChevronDown
              className={cn('size-3.5 transition-transform', isExpanded && 'rotate-180')}
              aria-hidden="true"
            />
          )}
        </span>
      </button>

      {canExpand && isExpanded && (
        <div className="grid grid-cols-1 gap-2 border-t border-border bg-muted/20 p-3 text-xs sm:grid-cols-3">
          <div>
            <p className="mb-1 font-medium text-muted-foreground">Input</p>
            <pre className="overflow-x-auto rounded bg-muted p-2">{testCase.input ?? '—'}</pre>
          </div>
          <div>
            <p className="mb-1 font-medium text-muted-foreground">Expected Output</p>
            <pre className="overflow-x-auto rounded bg-muted p-2">
              {testCase.expectedOutput ?? '—'}
            </pre>
          </div>
          <div>
            <p className="mb-1 font-medium text-muted-foreground">Actual Output</p>
            <pre className="overflow-x-auto rounded bg-muted p-2">{testCase.actualOutput ?? '—'}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
