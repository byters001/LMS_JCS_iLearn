import { lazy, Suspense, useEffect, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { JUDGE0_TO_MONACO_LANGUAGE } from '@/lib/monaco.config'
import { useSubmitCode } from '../api'
import { TestResultsPanel } from './TestResultsPanel'
import type { CodingAttemptQuestion } from '../types'
import { useStableIdempotencyKey } from '../useStableIdempotencyKey'

// Lazy-loaded — CLAUDE1.md non-negotiable #7: Monaco must never ship in the
// main bundle, since not every assessment includes a coding section. This
// import only resolves once a coding question actually renders, so its JS
// chunk loads on-demand rather than on initial page load. See
// features/coding/components/CodeEditor.tsx for the module this splits off.
const CodeEditor = lazy(() => import('@/features/coding/components/CodeEditor'))

interface CodingQuestionProps {
  attemptId: string
  question: CodingAttemptQuestion
}

const LANGUAGE_LABELS: Record<string, string> = {
  C: 'C',
  CPP: 'C++',
  JAVA: 'Java',
  JAVASCRIPT: 'JavaScript',
  PYTHON3: 'Python 3',
}

export function CodingQuestion({ attemptId, question }: CodingQuestionProps) {
  const supportedLanguages = question.coding?.supportedLanguages ?? []
  const [language, setLanguage] = useState(supportedLanguages[0] ?? '')
  const [sourceCode, setSourceCode] = useState('')
  const [isResultsPanelOpen, setIsResultsPanelOpen] = useState(false)
  const submitCode = useSubmitCode(attemptId)

  // Auto-open the results panel the moment a new run starts (mirrors
  // LeetCode/HackerRank surfacing the console immediately on Run/Submit,
  // not only once results land) — the user can still collapse it manually
  // afterward without affecting the in-flight request.
  useEffect(() => {
    if (submitCode.isPending) setIsResultsPanelOpen(true)
  }, [submitCode.isPending])
  // Signature covers both language and code — switching language for the
  // same code (or vice versa) is a genuinely different submission (Judge0
  // needs to know which language to compile/run as), so either change
  // alone must produce a fresh key.
  const idempotencyKey = useStableIdempotencyKey(`${language}:${sourceCode}`)

  // Once the code or language changes away from whatever the last
  // submission covered, that result no longer describes the CURRENT code —
  // stop presenting it as this submission's outcome.
  const isResultForCurrentCode =
    submitCode.isSuccess &&
    submitCode.variables?.language === language &&
    submitCode.variables?.sourceCode === sourceCode

  function handleSubmit() {
    if (!question.questionVersionId || !language || sourceCode.trim().length === 0) return
    submitCode.mutate({
      questionVersionId: question.questionVersionId,
      language,
      sourceCode,
      idempotencyKey,
    })
  }

  // `coding` is absent (not an error) when coding_question_details hasn't
  // been authored yet for this question version — see
  // attempts.service.ts's buildRenderableQuestion.
  if (!question.coding) {
    return (
      <div>
        <p className="text-base text-brand-primary">{question.questionText}</p>
        {question.images && question.images.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {question.images.map((image) => (
              <img
                key={image.id}
                src={image.imageUrl}
                alt={image.caption ?? ''}
                className="h-32 w-auto max-w-full rounded-md border border-border object-contain"
              />
            ))}
          </div>
        )}
        <p className="mt-5 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          This coding question hasn&apos;t had its problem statement authored yet. Contact your
          trainer if this persists.
        </p>
      </div>
    )
  }

  const { coding } = question

  return (
    // LeetCode/HackerRank-style resizable split: react-resizable-panels
    // (Group/Panel/Separator — this is its v4 API; older docs/tutorials
    // reference a since-renamed PanelGroup/PanelResizeHandle API). Group
    // needs an explicit height for a horizontal split to mean anything, so
    // each Panel scrolls its own content independently instead of the
    // fixed-height editor forcing page-level layout shift. minSize is
    // pixel-based (unitless numbers = px per this library) rather than a
    // percentage so the guarantee holds regardless of how wide the overall
    // container is: below 360px the sample-test-case two-column grid and
    // Monaco's line content both become unusably cramped.
    <Group orientation="horizontal" style={{ height: 640 }}>
      <Panel defaultSize="50" minSize={360} className="pr-4">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <h3 className="text-base font-semibold text-brand-primary">Problem Statement</h3>
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {question.marks} marks
          </span>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-brand-primary">
          {coding.problemStatement}
        </p>

        {question.images && question.images.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {question.images.map((image) => (
              <img
                key={image.id}
                src={image.imageUrl}
                alt={image.caption ?? ''}
                className="h-32 w-auto max-w-full rounded-md border border-border object-contain"
              />
            ))}
          </div>
        )}

        {coding.inputFormat && (
          <>
            <h4 className="mt-4 text-sm font-semibold text-brand-primary">Input Format</h4>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
              {coding.inputFormat}
            </p>
          </>
        )}
        {coding.outputFormat && (
          <>
            <h4 className="mt-4 text-sm font-semibold text-brand-primary">Output Format</h4>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
              {coding.outputFormat}
            </p>
          </>
        )}
        {coding.constraints && (
          <>
            <h4 className="mt-4 text-sm font-semibold text-brand-primary">Constraints</h4>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
              {coding.constraints}
            </p>
          </>
        )}

        {/* Visible sample-test-case panel — hidden cases are never sent to
            the frontend at all (see attempts.types.ts's SanitizedCodingContent),
            so there's nothing to filter here; this is already the safe set. */}
        <h4 className="mt-5 text-sm font-semibold text-brand-primary">Sample Test Cases</h4>
        {coding.sampleTestCases.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No sample test cases provided.</p>
        ) : (
          <div className="mt-2 space-y-3">
            {coding.sampleTestCases.map((testCase, index) => (
              <div key={testCase.id} className="rounded-md border border-border p-3 text-sm">
                <p className="mb-1 font-medium text-muted-foreground">Case {index + 1}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Input</p>
                    <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">
                      {testCase.input ?? '—'}
                    </pre>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Expected Output</p>
                    <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">
                      {testCase.expectedOutput ?? '—'}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Separator className="mx-1 w-1.5 shrink-0 cursor-col-resize rounded-full bg-border transition-colors hover:bg-brand-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent data-[separator=active]:bg-brand-accent" />

      <Panel defaultSize="50" minSize={360} className="pl-4">
        {/* CodeSignal-style editor chrome: a toolbar strip (window-dot
            affordance + language switcher) sitting directly on the editor,
            not a separate label row floating above it. */}
        <div className="relative overflow-hidden rounded-lg border border-border shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-3 py-2">
            <div className="flex items-center gap-2.5">
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="size-2.5 rounded-full bg-destructive/50" />
                <span className="size-2.5 rounded-full bg-amber-500/50" />
                <span className="size-2.5 rounded-full bg-green-600/50" />
              </span>
              <span className="text-xs font-medium text-muted-foreground">Code Editor</span>
            </div>
            {/* Limited to this question's supportedLanguages only — never a
                hardcoded/global language list. */}
            <select
              id={`language-${question.id}`}
              aria-label="Language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-brand-primary outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
            >
              {supportedLanguages.map((lang) => (
                <option key={lang} value={lang}>
                  {LANGUAGE_LABELS[lang] ?? lang}
                </option>
              ))}
            </select>
          </div>

          <Suspense
            fallback={
              <div className="flex h-[480px] items-center justify-center text-sm text-muted-foreground">
                Loading editor…
              </div>
            }
          >
            <CodeEditor
              language={JUDGE0_TO_MONACO_LANGUAGE[language] ?? 'plaintext'}
              value={sourceCode}
              onChange={setSourceCode}
            />
          </Suspense>

          {/* Slides up from the bottom of this editor box only — scoped by
              the `relative`/`overflow-hidden` box above, so it can never
              spill past this pane or reach the resize divider (Phase G).
              Rendered only once a run has actually happened, so it's not a
              permanent fixture eating editor space before then. */}
          {submitCode.status !== 'idle' && (
            <TestResultsPanel
              isOpen={isResultsPanelOpen}
              onToggle={() => setIsResultsPanelOpen((open) => !open)}
              isPending={submitCode.isPending}
              isError={submitCode.isError}
              errorMessage={submitCode.error instanceof ApiError ? submitCode.error.message : null}
              result={isResultForCurrentCode ? (submitCode.data ?? null) : null}
              isStale={submitCode.isSuccess && !isResultForCurrentCode}
            />
          )}
        </div>

        {/* A REAL Judge0 call — several seconds, proven in backend testing.
            Disabled while pending so a second click can't queue up a second
            real submission on top of one already in flight. */}
        <Button
          className="mt-4"
          disabled={!language || sourceCode.trim().length === 0 || submitCode.isPending}
          onClick={handleSubmit}
        >
          {submitCode.isPending ? 'Running…' : 'Run / Submit Code'}
        </Button>
      </Panel>
    </Group>
  )
}
