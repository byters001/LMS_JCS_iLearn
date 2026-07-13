import { lazy, Suspense, useState } from 'react'
import { Button } from '@/components/ui/button'
import { JUDGE0_TO_MONACO_LANGUAGE } from '@/lib/monaco.config'
import type { CodingAttemptQuestion } from '../types'

// Lazy-loaded — CLAUDE1.md non-negotiable #7: Monaco must never ship in the
// main bundle, since not every assessment includes a coding section. This
// import only resolves once a coding question actually renders, so its JS
// chunk loads on-demand rather than on initial page load. See
// features/coding/components/CodeEditor.tsx for the module this splits off.
const CodeEditor = lazy(() => import('@/features/coding/components/CodeEditor'))

interface CodingQuestionProps {
  question: CodingAttemptQuestion
}

const LANGUAGE_LABELS: Record<string, string> = {
  C: 'C',
  CPP: 'C++',
  JAVA: 'Java',
  JAVASCRIPT: 'JavaScript',
  PYTHON3: 'Python 3',
}

export function CodingQuestion({ question }: CodingQuestionProps) {
  const supportedLanguages = question.coding?.supportedLanguages ?? []
  const [language, setLanguage] = useState(supportedLanguages[0] ?? '')
  const [sourceCode, setSourceCode] = useState('')

  // `coding` is absent (not an error) when coding_question_details hasn't
  // been authored yet for this question version — see
  // attempts.service.ts's buildRenderableQuestion.
  if (!question.coding) {
    return (
      <div>
        <p className="text-base text-brand-primary">{question.questionText}</p>
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
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-base font-semibold text-brand-primary">Problem Statement</h3>
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {question.marks} marks
          </span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-brand-primary">
          {coding.problemStatement}
        </p>

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
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm font-medium text-brand-primary" htmlFor={`language-${question.id}`}>
            Language
          </label>
          {/* Limited to this question's supportedLanguages only — never a
              hardcoded/global language list. */}
          <select
            id={`language-${question.id}`}
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            {supportedLanguages.map((lang) => (
              <option key={lang} value={lang}>
                {LANGUAGE_LABELS[lang] ?? lang}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 overflow-hidden rounded-md border border-border">
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

        {/* Stub — Part 3 wires this to
            POST /attempts/:attemptId/responses/:questionVersionId/submit-code
            (Idempotency-Key required, per CLAUDE1.md non-negotiable #8) */}
        <Button className="mt-4" disabled={!language}>
          Run / Submit Code
        </Button>
      </div>
    </div>
  )
}
