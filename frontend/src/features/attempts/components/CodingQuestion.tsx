import { lazy, Suspense, useState } from 'react'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { JUDGE0_TO_MONACO_LANGUAGE } from '@/lib/monaco.config'
import { useSubmitCode } from '../api'
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
  const submitCode = useSubmitCode(attemptId)
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
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
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
      </div>

      <div>
        {/* CodeSignal-style editor chrome: a toolbar strip (window-dot
            affordance + language switcher) sitting directly on the editor,
            not a separate label row floating above it. */}
        <div className="overflow-hidden rounded-lg border border-border shadow-sm">
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

        {submitCode.isPending && (
          <p className="mt-3 text-sm text-muted-foreground">
            Running your code against the test cases — this can take a few seconds…
          </p>
        )}

        {isResultForCurrentCode && submitCode.data && (
          <div
            className={
              submitCode.data.isCorrect
                ? 'mt-3 rounded-md border border-green-600/30 bg-green-600/5 p-3 text-sm dark:border-green-500/30 dark:bg-green-500/5'
                : 'mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm'
            }
          >
            <p
              className={
                submitCode.data.isCorrect
                  ? 'font-semibold text-green-700 dark:text-green-400'
                  : 'font-semibold text-destructive'
              }
            >
              {submitCode.data.isCorrect ? 'All test cases passed' : 'Some test cases failed'}
            </p>
            <p className="mt-1 text-muted-foreground">
              {submitCode.data.testCasesPassed} / {submitCode.data.testCasesTotal} test cases passed
              {submitCode.data.marksObtained !== null && (
                <> &middot; {submitCode.data.marksObtained} marks</>
              )}
            </p>
          </div>
        )}

        {submitCode.isError && !submitCode.isPending && (
          <p className="mt-3 text-sm text-destructive">
            {submitCode.error instanceof ApiError
              ? submitCode.error.message
              : 'Failed to run your code — try again.'}
          </p>
        )}
      </div>
    </div>
  )
}
