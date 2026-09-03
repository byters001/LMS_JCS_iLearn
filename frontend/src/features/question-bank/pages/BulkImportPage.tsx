import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { spreadsheetFileToRows, csvTextToXlsxBlob, triggerBlobDownload } from '@/lib/spreadsheet'
import { fetchAllQuestionsForDuplicateCheck, useCategories, useCreateQuestion, useTopics } from '../api'
import type { CreateQuestionInput, QuestionCategory, QuestionDifficulty, QuestionTopic } from '../types'

const PICKER_PAGE_SIZE = 100

// --- Phase 4a scope note --------------------------------------------------
// This page ends at a reviewed, validated preview table with duplicates
// flagged — the "Import N Questions" button at the bottom is permanently
// disabled here on purpose. Wiring it to actually POST /questions per row
// is Phase 4b, not built in this phase.
//
// College scope deliberately excluded from both templates below —
// CreateQuestionPage.tsx (the single-question form these templates mirror)
// has no college picker in its own UI either (collegeId is optional at the
// schema level but never exposed there); every bulk-imported question ends
// up in the global bank (collegeId omitted), matching what the single-entry
// form actually lets a trainer do today. Not an oversight — a deliberate
// scope match.

type ImportType = 'mcq' | 'psychometric'

interface ColumnDef {
  key: string
  header: string
  aliases: string[]
  required: boolean
}

// Column order here IS the template's column order AND the preview table's
// column order — one source of truth for both directions (download +
// upload), same "no separate template content to keep in sync" reasoning
// lib/spreadsheet.ts's own comment gives for reusing one CSV text blob for
// both the .csv and .xlsx template downloads.
const MCQ_COLUMNS: ColumnDef[] = [
  { key: 'category', header: 'category', aliases: ['category', 'category_name'], required: true },
  { key: 'topic', header: 'topic', aliases: ['topic', 'topic_name'], required: false },
  { key: 'difficulty', header: 'difficulty', aliases: ['difficulty'], required: true },
  {
    key: 'questionText',
    header: 'question_text',
    aliases: ['question_text', 'questiontext', 'question'],
    required: true,
  },
  { key: 'marks', header: 'marks', aliases: ['marks', 'mark'], required: false },
  { key: 'option1', header: 'option_1', aliases: ['option_1', 'option1'], required: true },
  { key: 'option2', header: 'option_2', aliases: ['option_2', 'option2'], required: true },
  { key: 'option3', header: 'option_3', aliases: ['option_3', 'option3'], required: false },
  { key: 'option4', header: 'option_4', aliases: ['option_4', 'option4'], required: false },
  {
    key: 'correctOption',
    header: 'correct_option',
    aliases: ['correct_option', 'correctoption', 'answer'],
    required: true,
  },
]

// No option columns at all — psychometricOptionInputSchema is entirely
// optional at the backend (question-bank.schema.ts), and per
// features/attempts/components/PsychometricQuestion.tsx's own comment, the
// attempt-taking UI always renders a fixed 1-5 scale regardless; options
// (when present) only relabel each point, they're never the selectable
// choices. Inventing required option columns here would be building for a
// shape psychometric questions don't actually have.
const PSYCHOMETRIC_COLUMNS: ColumnDef[] = [
  { key: 'category', header: 'category', aliases: ['category', 'category_name'], required: true },
  { key: 'topic', header: 'topic', aliases: ['topic', 'topic_name'], required: false },
  { key: 'difficulty', header: 'difficulty', aliases: ['difficulty'], required: true },
  {
    key: 'questionText',
    header: 'question_text',
    aliases: ['question_text', 'questiontext', 'question'],
    required: true,
  },
  { key: 'marks', header: 'marks', aliases: ['marks', 'mark'], required: false },
  {
    key: 'traitCategory',
    header: 'trait_category',
    aliases: ['trait_category', 'traitcategory', 'trait'],
    required: false,
  },
  { key: 'scaleType', header: 'scale_type', aliases: ['scale_type', 'scaletype'], required: false },
]

function columnsFor(type: ImportType): ColumnDef[] {
  return type === 'mcq' ? MCQ_COLUMNS : PSYCHOMETRIC_COLUMNS
}

const MCQ_EXAMPLE_ROW = [
  'Aptitude',
  'Numerical Ability',
  'medium',
  'What is 15% of 200?',
  '1',
  '25',
  '30',
  '35',
  '40',
  '2',
]
const PSYCHOMETRIC_EXAMPLE_ROW = [
  'Personality',
  '',
  'medium',
  'I enjoy working in a team setting.',
  '1',
  'Teamwork',
  'likert',
]

function exampleRowFor(type: ImportType): string[] {
  return type === 'mcq' ? MCQ_EXAMPLE_ROW : PSYCHOMETRIC_EXAMPLE_ROW
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function buildTemplateCsv(type: ImportType): string {
  const columns = columnsFor(type)
  const header = columns.map((c) => c.header).join(',')
  const example = exampleRowFor(type).map(csvEscape).join(',')
  return `${header}\n${example}\n`
}

function downloadCsvTemplate(type: ImportType) {
  triggerBlobDownload(
    new Blob([buildTemplateCsv(type)], { type: 'text/csv;charset=utf-8' }),
    `${type}-question-import-template.csv`,
  )
}

async function downloadExcelTemplate(type: ImportType) {
  triggerBlobDownload(
    await csvTextToXlsxBlob(buildTemplateCsv(type)),
    `${type}-question-import-template.xlsx`,
  )
}

// --- Parsing ---------------------------------------------------------------

type ImportStatus = 'idle' | 'importing' | 'success' | 'error'

interface ParsedRow {
  rowNumber: number
  fields: Record<string, string>
  errors: string[]
  // Resolved once at parse time (not re-resolved at import time) — what
  // you previewed is exactly what gets sent on import, via the same
  // category/topic snapshot the preview validated against.
  categoryId: string | undefined
  topicId: string | undefined
  isDuplicate: boolean
  duplicateMatchText: string | null
  includeDespiteDuplicate: boolean
  importStatus: ImportStatus
  importError: string | null
  createdQuestionId: string | null
}

function findHeaderIndex(headerRow: string[], column: ColumnDef): number {
  const normalized = headerRow.map((cell) => cell.trim().toLowerCase())
  return normalized.findIndex((cell) => column.aliases.includes(cell))
}

interface LookupData {
  categories: QuestionCategory[]
  topics: QuestionTopic[]
}

type BaseParsedRow = Pick<
  ParsedRow,
  'rowNumber' | 'fields' | 'errors' | 'categoryId' | 'topicId'
>

// Returns either the parsed rows, or a page-level error if a REQUIRED
// column's header couldn't be found at all (nothing to validate row-by-row
// in that case — the sheet doesn't match this type's template).
function parseSheet(
  sheetRows: string[][],
  type: ImportType,
  lookup: LookupData,
): { rows: BaseParsedRow[] } | { headerError: string } {
  const columns = columnsFor(type)
  if (sheetRows.length === 0) return { headerError: 'The file has no rows.' }

  const headerRow = sheetRows[0] ?? []
  const indexByKey = new Map<string, number>()
  for (const column of columns) {
    const index = findHeaderIndex(headerRow, column)
    if (index === -1 && column.required) {
      return {
        headerError: `Missing required column "${column.header}" — check you downloaded the ${type} template, not a different one.`,
      }
    }
    indexByKey.set(column.key, index)
  }

  const rows: BaseParsedRow[] = []
  for (let i = 1; i < sheetRows.length; i++) {
    const sheetRow = sheetRows[i] ?? []
    if (sheetRow.every((cell) => !cell || !cell.toString().trim())) continue // blank row

    const fields: Record<string, string> = {}
    for (const column of columns) {
      const index = indexByKey.get(column.key) ?? -1
      fields[column.key] = index === -1 ? '' : (sheetRow[index] ?? '').toString().trim()
    }

    const { errors, categoryId, topicId } = validateRow(type, fields, lookup)
    rows.push({ rowNumber: i + 1, fields, errors, categoryId, topicId })
  }
  return { rows }
}

const DIFFICULTY_VALUES: QuestionDifficulty[] = ['easy', 'medium', 'hard']
const SCALE_TYPE_VALUES = ['likert', 'scenario']

function findByName<T extends { name: string }>(items: T[], name: string): T | undefined {
  const target = name.trim().toLowerCase()
  return items.find((item) => item.name.trim().toLowerCase() === target)
}

interface RowValidationResult {
  errors: string[]
  categoryId: string | undefined
  topicId: string | undefined
}

// Shared across both types — category/topic/difficulty/questionText/marks
// are identical fields with identical rules regardless of type. `lookup`
// carries the real, already-fetched (type-scoped) categories/topics this
// row's category/topic names get resolved against. Returns the resolved
// ids alongside errors — buildCreateQuestionInput (below) uses these
// directly at import time rather than re-resolving names a second time.
function validateBaseFields(fields: Record<string, string>, lookup: LookupData): RowValidationResult {
  const errors: string[] = []

  let category: QuestionCategory | undefined
  if (!fields.category) errors.push('Category is required')
  else {
    category = findByName(lookup.categories, fields.category)
    if (!category) errors.push(`Category "${fields.category}" not found`)
  }

  let topicId: string | undefined
  if (fields.topic) {
    const topic = findByName(lookup.topics, fields.topic)
    if (!topic) errors.push(`Topic "${fields.topic}" not found`)
    else if (category && topic.categoryId !== category.id) {
      errors.push(`Topic "${fields.topic}" does not belong to category "${fields.category}"`)
    } else {
      topicId = topic.id
    }
  }

  const difficulty = fields.difficulty.toLowerCase()
  if (!fields.difficulty) errors.push('Difficulty is required')
  else if (!DIFFICULTY_VALUES.includes(difficulty as QuestionDifficulty)) {
    errors.push('Difficulty must be easy, medium, or hard')
  }

  if (!fields.questionText) errors.push('Question text is required')

  if (fields.marks && !/^\d+(\.\d+)?$/.test(fields.marks)) {
    errors.push('Marks must be a positive number')
  }

  return { errors, categoryId: category?.id, topicId }
}

// Mirrors QuestionContentFields.tsx's applyQuestionContentRefinements
// exactly (same "at least 2 filled options, exactly one marked correct"
// rule) — this is the same UX-level requirement CreateQuestionPage applies
// on top of the backend's genuinely permissive schema, applied identically
// here so a bulk-imported MCQ can't end up in a state the single-question
// form would never have allowed.
function validateMcqRow(fields: Record<string, string>, lookup: LookupData): RowValidationResult {
  const result = validateBaseFields(fields, lookup)
  const options = [fields.option1, fields.option2, fields.option3, fields.option4]
  const filledCount = options.filter((o) => o.trim().length > 0).length
  if (filledCount < 2) result.errors.push('At least 2 options are required')

  if (!fields.correctOption) {
    result.errors.push('Correct option is required')
  } else {
    const correctIndex = Number.parseInt(fields.correctOption, 10)
    if (!Number.isInteger(correctIndex) || correctIndex < 1 || correctIndex > 4) {
      result.errors.push('Correct option must be 1-4')
    } else if (!options[correctIndex - 1]?.trim()) {
      result.errors.push(`Correct option ${correctIndex} refers to an empty option`)
    }
  }
  return result
}

// scaleType/traitCategory are both optional — see this file's own comment
// on PSYCHOMETRIC_COLUMNS for why there's no options requirement here.
function validatePsychometricRow(
  fields: Record<string, string>,
  lookup: LookupData,
): RowValidationResult {
  const result = validateBaseFields(fields, lookup)
  if (fields.scaleType && !SCALE_TYPE_VALUES.includes(fields.scaleType.toLowerCase())) {
    result.errors.push('Scale type must be likert or scenario')
  }
  return result
}

function validateRow(
  type: ImportType,
  fields: Record<string, string>,
  lookup: LookupData,
): RowValidationResult {
  return type === 'mcq' ? validateMcqRow(fields, lookup) : validatePsychometricRow(fields, lookup)
}

function normalizeQuestionText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

// --- Import (Phase 4b) ------------------------------------------------
//
// Failure model: N individual POST /questions calls (reusing
// useCreateQuestion/createQuestionSchema exactly as CreateQuestionPage.tsx
// does), not a new bulk-create endpoint — and NOT atomic. A real bulk
// endpoint would mean either one new schema/service/route to duplicate
// what createQuestion already does per-row, or an all-or-nothing
// transaction wrapping N inserts — and all-or-nothing is the wrong model
// for THIS operation specifically: if row 47 of 50 fails (e.g. its
// category was deleted in the gap between preview and import — a real,
// not hypothetical, race this app allows since category delete has no
// dependency check today), a trainer bulk-importing 50 questions wants the
// other 49 saved, not an entire re-submission. Partial success, reported
// per row, is the correct failure model for a bulk import, not a
// limitation to work around.
//
// Concurrency is bounded, not Promise.all-everything-at-once:
// db/client.ts's own comment documents this Supabase project's pooler
// running in SESSION mode with a hard 15-connection cap project-wide, and
// each createQuestion call itself opens a db.transaction() (question +
// version, atomically) — firing dozens of these simultaneously from one
// browser tab would needlessly compete for that same limited pool
// alongside the dev server and anything else connected. 3 concurrent
// requests is a deliberately conservative default given that cap.
const IMPORT_CONCURRENCY = 3

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0
  async function runNext(): Promise<void> {
    const currentIndex = nextIndex++
    if (currentIndex >= items.length) return
    await worker(items[currentIndex]!)
    return runNext()
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runNext()))
}

// Builds the exact same CreateQuestionInput shape CreateQuestionPage.tsx's
// own onSubmit builds — categoryId/topicId already resolved at parse time
// (see validateBaseFields), not re-resolved here.
function buildCreateQuestionInput(type: ImportType, row: ParsedRow): CreateQuestionInput {
  const base = {
    categoryId: row.categoryId,
    difficulty: row.fields.difficulty.toLowerCase() as QuestionDifficulty,
    questionText: row.fields.questionText,
    marks: row.fields.marks ? Number.parseFloat(row.fields.marks) : undefined,
    topicIds: row.topicId ? [row.topicId] : undefined,
  }

  if (type === 'mcq') {
    const correctIndex = Number.parseInt(row.fields.correctOption, 10)
    const options = [row.fields.option1, row.fields.option2, row.fields.option3, row.fields.option4]
      .map((optionText, index) => ({ optionText, index }))
      .filter(({ optionText }) => optionText.trim().length > 0)
      .map(({ optionText, index }) => ({
        optionText,
        isCorrect: index === correctIndex - 1,
        sortOrder: index,
      }))
    return { ...base, type: 'mcq', options }
  }

  const traitCategory = row.fields.traitCategory || undefined
  const scaleType = row.fields.scaleType
    ? (row.fields.scaleType.toLowerCase() as 'likert' | 'scenario')
    : undefined
  return {
    ...base,
    type: 'psychometric',
    psychometricDetails: traitCategory || scaleType ? { traitCategory, scaleType } : undefined,
  }
}

// --- Component ---------------------------------------------------------

export default function BulkImportPage() {
  const [importType, setImportType] = useState<ImportType>('mcq')
  const [step, setStep] = useState<'select' | 'preview'>('select')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [headerError, setHeaderError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingError, setProcessingError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importSummary, setImportSummary] = useState<{ created: number; failed: number } | null>(null)

  const categories = useCategories({ type: importType, page: 1, pageSize: PICKER_PAGE_SIZE })
  const topics = useTopics({ type: importType, page: 1, pageSize: PICKER_PAGE_SIZE })
  const createQuestion = useCreateQuestion()

  const columns = columnsFor(importType)

  function reset() {
    setStep('select')
    setRows([])
    setHeaderError(null)
    setProcessingError(null)
    setIsImporting(false)
    setImportSummary(null)
  }

  function handleTypeChange(type: ImportType) {
    setImportType(type)
    reset()
  }

  async function handleFile(file: File) {
    setIsProcessing(true)
    setProcessingError(null)
    setHeaderError(null)
    try {
      // Category/topic pickers are already fetched via the hooks above
      // (type-scoped, same reused logic as CreateQuestionPage/
      // AttachQuestionForm/pool criteria) — passed through explicitly as
      // `lookup` rather than read from component state inside the
      // validators, so parseSheet/validateRow stay plain, testable
      // functions with no hidden dependency on render state.
      const lookup: LookupData = {
        categories: categories.data?.items ?? [],
        topics: topics.data?.items ?? [],
      }

      const sheetRows = await spreadsheetFileToRows(file)
      const parsed = parseSheet(sheetRows, importType, lookup)
      if ('headerError' in parsed) {
        setHeaderError(parsed.headerError)
        setRows([])
        setStep('preview')
        return
      }

      // Duplicate detection — one bulk fetch (paginated internally, not a
      // per-row N+1), scoped to this type only. See api.ts's
      // fetchAllQuestionsForDuplicateCheck for why this needed its own
      // fetch path rather than reusing useQuestionsForPicker's pattern.
      const existing = await fetchAllQuestionsForDuplicateCheck(importType)
      const existingNormalized = new Set(
        existing
          .map((q) => (q.questionText ? normalizeQuestionText(q.questionText) : null))
          .filter((text): text is string => text !== null),
      )

      const withDuplicates: ParsedRow[] = parsed.rows.map((row) => {
        const normalized = row.fields.questionText ? normalizeQuestionText(row.fields.questionText) : ''
        const isDuplicate = normalized.length > 0 && existingNormalized.has(normalized)
        return {
          ...row,
          isDuplicate,
          duplicateMatchText: isDuplicate ? row.fields.questionText : null,
          // Safer default — flagged duplicates start EXCLUDED, importer
          // has to actively opt back in per row.
          includeDespiteDuplicate: false,
          importStatus: 'idle',
          importError: null,
          createdQuestionId: null,
        }
      })

      setRows(withDuplicates)
      setStep('preview')
    } catch (error) {
      setProcessingError(error instanceof Error ? error.message : 'Failed to read this file.')
    } finally {
      setIsProcessing(false)
    }
  }

  function toggleIncludeDuplicate(rowNumber: number) {
    setRows((current) =>
      current.map((row) =>
        row.rowNumber === rowNumber
          ? { ...row, includeDespiteDuplicate: !row.includeDespiteDuplicate }
          : row,
      ),
    )
  }

  const validRows = rows.filter((row) => row.errors.length === 0)
  const includedRows = validRows.filter((row) => !row.isDuplicate || row.includeDespiteDuplicate)
  const excludedDuplicateCount = validRows.length - includedRows.length

  // Each row is its own POST /questions call (see this file's own "Import
  // (Phase 4b)" comment for the full failure-model reasoning) — bounded
  // concurrency, partial success, per-row result reported individually. A
  // row can still fail here even though it passed preview validation (its
  // category could have been deleted in the gap between preview and
  // import, for instance) — that failure is shown on the row itself, not
  // swallowed into a generic page-level error.
  async function handleImport() {
    setIsImporting(true)
    setImportSummary(null)

    const rowNumbersToImport = new Set(includedRows.map((row) => row.rowNumber))
    setRows((current) =>
      current.map((row) =>
        rowNumbersToImport.has(row.rowNumber) ? { ...row, importStatus: 'importing' } : row,
      ),
    )

    let created = 0
    let failed = 0

    await runWithConcurrency(includedRows, IMPORT_CONCURRENCY, async (row) => {
      try {
        const payload = buildCreateQuestionInput(importType, row)
        const result = await createQuestion.mutateAsync(payload)
        created += 1
        setRows((current) =>
          current.map((r) =>
            r.rowNumber === row.rowNumber
              ? { ...r, importStatus: 'success', createdQuestionId: result.id }
              : r,
          ),
        )
      } catch (error) {
        failed += 1
        const message =
          error instanceof ApiError ? error.message : 'Failed to create this question.'
        setRows((current) =>
          current.map((r) =>
            r.rowNumber === row.rowNumber ? { ...r, importStatus: 'error', importError: message } : r,
          ),
        )
      }
    })

    setImportSummary({ created, failed })
    setIsImporting(false)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-5">
      <Link to=".." className="text-sm text-primary hover:underline">
        &larr; Back to questions
      </Link>

      <Card className="p-4">
        <h1 className="font-heading text-xl font-semibold text-primary">
          Bulk Import Questions
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Download a template, fill it in, upload it back here to preview, validate, and import.
        </p>

        <div className="mt-4 space-y-1.5">
          <label htmlFor="importType" className="text-sm font-medium text-primary">
            Question Type
          </label>
          <select
            id="importType"
            disabled={isImporting}
            className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            value={importType}
            onChange={(event) => handleTypeChange(event.target.value as ImportType)}
          >
            <option value="mcq">MCQ</option>
            <option value="psychometric">Psychometric</option>
          </select>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => downloadCsvTemplate(importType)}>
            Download CSV Template
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void downloadExcelTemplate(importType)}
          >
            Download Excel Template
          </Button>
        </div>

        <div className="mt-4">
          <input
            id="bulkImportFile"
            type="file"
            accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleFile(file)
              event.target.value = ''
            }}
          />
          <Button
            type="button"
            disabled={isProcessing || isImporting || categories.isPending || topics.isPending}
            onClick={() => document.getElementById('bulkImportFile')?.click()}
          >
            {isProcessing ? 'Reading file…' : 'Choose CSV or Excel file…'}
          </Button>
          {(categories.isPending || topics.isPending) && (
            <p className="mt-1 text-xs text-muted-foreground">
              Loading {importType} categories/topics…
            </p>
          )}
        </div>

        {processingError && (
          <p className="mt-3 text-sm text-destructive">{processingError}</p>
        )}
      </Card>

      {step === 'preview' && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Preview
          </h2>

          {headerError ? (
            <p className="mt-3 text-sm text-destructive">{headerError}</p>
          ) : rows.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No data rows found in this file.</p>
          ) : (
            <>
              <div className="mt-4 max-h-[32rem] overflow-auto rounded-md border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 font-medium">Row</th>
                      {columns.map((column) => (
                        <th key={column.key} className="px-3 py-2 font-medium">
                          {column.header}
                        </th>
                      ))}
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.rowNumber}
                        className={
                          row.errors.length > 0
                            ? 'border-t border-border bg-destructive/5'
                            : row.isDuplicate
                              ? 'border-t border-border bg-amber-500/5'
                              : 'border-t border-border'
                        }
                      >
                        <td className="px-3 py-2 text-muted-foreground">{row.rowNumber}</td>
                        {columns.map((column) => (
                          <td key={column.key} className="max-w-48 truncate px-3 py-2">
                            {row.fields[column.key] || '—'}
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          {row.importStatus === 'importing' ? (
                            <span className="text-xs text-muted-foreground">Importing…</span>
                          ) : row.importStatus === 'success' ? (
                            <span className="flex items-center gap-2 text-xs text-primary">
                              Created
                              {row.createdQuestionId && (
                                <Link
                                  to={`../${row.createdQuestionId}`}
                                  className="underline hover:no-underline"
                                >
                                  View
                                </Link>
                              )}
                            </span>
                          ) : row.importStatus === 'error' ? (
                            <span className="text-xs text-destructive">
                              Import failed: {row.importError}
                            </span>
                          ) : row.errors.length > 0 ? (
                            <span className="text-xs text-destructive">{row.errors.join('; ')}</span>
                          ) : row.isDuplicate ? (
                            <label className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                              <input
                                type="checkbox"
                                disabled={isImporting || importSummary !== null}
                                checked={row.includeDespiteDuplicate}
                                onChange={() => toggleIncludeDuplicate(row.rowNumber)}
                              />
                              Possible duplicate — include anyway?
                            </label>
                          ) : (
                            <span className="text-xs text-primary">Valid</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                {rows.length} row{rows.length === 1 ? '' : 's'} parsed · {validRows.length} valid ·{' '}
                {excludedDuplicateCount} possible duplicate{excludedDuplicateCount === 1 ? '' : 's'}{' '}
                excluded by default · {includedRows.length} ready to import.
              </p>
            </>
          )}

          <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
            {importSummary ? (
              <>
                <p className="text-sm text-primary">
                  {importSummary.created} question{importSummary.created === 1 ? '' : 's'} created
                  {importSummary.failed > 0 && (
                    <span className="text-destructive">
                      {' '}
                      · {importSummary.failed} failed — see the flagged row
                      {importSummary.failed === 1 ? '' : 's'} above for why.
                    </span>
                  )}
                </p>
                <Link to=".." className="text-sm text-primary hover:underline">
                  View in question bank
                </Link>
                <Button type="button" variant="outline" size="sm" onClick={reset}>
                  Start Over
                </Button>
              </>
            ) : (
              <Button
                type="button"
                disabled={includedRows.length === 0 || isImporting || Boolean(headerError)}
                onClick={() => void handleImport()}
              >
                {isImporting
                  ? 'Importing…'
                  : `Import ${includedRows.length} Question${includedRows.length === 1 ? '' : 's'}`}
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
