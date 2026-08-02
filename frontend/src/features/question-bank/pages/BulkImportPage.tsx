import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { spreadsheetFileToRows, csvTextToXlsxBlob, triggerBlobDownload } from '@/lib/spreadsheet'
import { fetchAllQuestionsForDuplicateCheck, useCategories, useTopics } from '../api'
import type { QuestionCategory, QuestionDifficulty, QuestionTopic } from '../types'

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

interface ParsedRow {
  rowNumber: number
  fields: Record<string, string>
  errors: string[]
  isDuplicate: boolean
  duplicateMatchText: string | null
  includeDespiteDuplicate: boolean
}

function findHeaderIndex(headerRow: string[], column: ColumnDef): number {
  const normalized = headerRow.map((cell) => cell.trim().toLowerCase())
  return normalized.findIndex((cell) => column.aliases.includes(cell))
}

interface LookupData {
  categories: QuestionCategory[]
  topics: QuestionTopic[]
}

// Returns either the parsed rows, or a page-level error if a REQUIRED
// column's header couldn't be found at all (nothing to validate row-by-row
// in that case — the sheet doesn't match this type's template).
function parseSheet(
  sheetRows: string[][],
  type: ImportType,
  lookup: LookupData,
): { rows: Omit<ParsedRow, 'isDuplicate' | 'duplicateMatchText' | 'includeDespiteDuplicate'>[] } | { headerError: string } {
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

  const rows: Omit<ParsedRow, 'isDuplicate' | 'duplicateMatchText' | 'includeDespiteDuplicate'>[] = []
  for (let i = 1; i < sheetRows.length; i++) {
    const sheetRow = sheetRows[i] ?? []
    if (sheetRow.every((cell) => !cell || !cell.toString().trim())) continue // blank row

    const fields: Record<string, string> = {}
    for (const column of columns) {
      const index = indexByKey.get(column.key) ?? -1
      fields[column.key] = index === -1 ? '' : (sheetRow[index] ?? '').toString().trim()
    }

    rows.push({ rowNumber: i + 1, fields, errors: validateRow(type, fields, lookup) })
  }
  return { rows }
}

const DIFFICULTY_VALUES: QuestionDifficulty[] = ['easy', 'medium', 'hard']
const SCALE_TYPE_VALUES = ['likert', 'scenario']

function findByName<T extends { name: string }>(items: T[], name: string): T | undefined {
  const target = name.trim().toLowerCase()
  return items.find((item) => item.name.trim().toLowerCase() === target)
}

// Shared across both types — category/topic/difficulty/questionText/marks
// are identical fields with identical rules regardless of type. `lookup`
// carries the real, already-fetched (type-scoped) categories/topics this
// row's category/topic names get resolved against.
function validateBaseFields(fields: Record<string, string>, lookup: LookupData): string[] {
  const errors: string[] = []

  let category: QuestionCategory | undefined
  if (!fields.category) errors.push('Category is required')
  else {
    category = findByName(lookup.categories, fields.category)
    if (!category) errors.push(`Category "${fields.category}" not found`)
  }

  if (fields.topic) {
    const topic = findByName(lookup.topics, fields.topic)
    if (!topic) errors.push(`Topic "${fields.topic}" not found`)
    else if (category && topic.categoryId !== category.id) {
      errors.push(`Topic "${fields.topic}" does not belong to category "${fields.category}"`)
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

  return errors
}

// Mirrors QuestionContentFields.tsx's applyQuestionContentRefinements
// exactly (same "at least 2 filled options, exactly one marked correct"
// rule) — this is the same UX-level requirement CreateQuestionPage applies
// on top of the backend's genuinely permissive schema, applied identically
// here so a bulk-imported MCQ can't end up in a state the single-question
// form would never have allowed.
function validateMcqRow(fields: Record<string, string>, lookup: LookupData): string[] {
  const errors = validateBaseFields(fields, lookup)
  const options = [fields.option1, fields.option2, fields.option3, fields.option4]
  const filledCount = options.filter((o) => o.trim().length > 0).length
  if (filledCount < 2) errors.push('At least 2 options are required')

  if (!fields.correctOption) {
    errors.push('Correct option is required')
  } else {
    const correctIndex = Number.parseInt(fields.correctOption, 10)
    if (!Number.isInteger(correctIndex) || correctIndex < 1 || correctIndex > 4) {
      errors.push('Correct option must be 1-4')
    } else if (!options[correctIndex - 1]?.trim()) {
      errors.push(`Correct option ${correctIndex} refers to an empty option`)
    }
  }
  return errors
}

// scaleType/traitCategory are both optional — see this file's own comment
// on PSYCHOMETRIC_COLUMNS for why there's no options requirement here.
function validatePsychometricRow(fields: Record<string, string>, lookup: LookupData): string[] {
  const errors = validateBaseFields(fields, lookup)
  if (fields.scaleType && !SCALE_TYPE_VALUES.includes(fields.scaleType.toLowerCase())) {
    errors.push('Scale type must be likert or scenario')
  }
  return errors
}

function validateRow(type: ImportType, fields: Record<string, string>, lookup: LookupData): string[] {
  return type === 'mcq' ? validateMcqRow(fields, lookup) : validatePsychometricRow(fields, lookup)
}

function normalizeQuestionText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

// --- Component ---------------------------------------------------------

export default function BulkImportPage() {
  const [importType, setImportType] = useState<ImportType>('mcq')
  const [step, setStep] = useState<'select' | 'preview'>('select')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [headerError, setHeaderError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingError, setProcessingError] = useState<string | null>(null)

  const categories = useCategories({ type: importType, page: 1, pageSize: PICKER_PAGE_SIZE })
  const topics = useTopics({ type: importType, page: 1, pageSize: PICKER_PAGE_SIZE })

  const columns = columnsFor(importType)

  function reset() {
    setStep('select')
    setRows([])
    setHeaderError(null)
    setProcessingError(null)
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

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Link to=".." className="text-sm text-brand-accent hover:underline">
        &larr; Back to questions
      </Link>

      <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
        <h1 className="font-heading text-xl font-semibold text-brand-primary">
          Bulk Import Questions
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Download a template, fill it in, upload it back here to preview and validate. This step
          only previews — nothing is saved to the question bank yet.
        </p>

        <div className="mt-6 space-y-1.5">
          <label htmlFor="importType" className="text-sm font-medium text-brand-primary">
            Question Type
          </label>
          <select
            id="importType"
            className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
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
            disabled={isProcessing || categories.isPending || topics.isPending}
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
      </div>

      {step === 'preview' && (
        <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
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
                          {row.errors.length > 0 ? (
                            <span className="text-xs text-destructive">{row.errors.join('; ')}</span>
                          ) : row.isDuplicate ? (
                            <label className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                              <input
                                type="checkbox"
                                checked={row.includeDespiteDuplicate}
                                onChange={() => toggleIncludeDuplicate(row.rowNumber)}
                              />
                              Possible duplicate — include anyway?
                            </label>
                          ) : (
                            <span className="text-xs text-brand-accent">Valid</span>
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
            <Button
              type="button"
              disabled
              title="Phase 4b will wire this up — nothing is saved to the database in this phase."
            >
              Import {includedRows.length} Question{includedRows.length === 1 ? '' : 's'}
            </Button>
            <span className="text-xs text-muted-foreground">
              Not wired up yet — preview and validation only (Phase 4a).
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
