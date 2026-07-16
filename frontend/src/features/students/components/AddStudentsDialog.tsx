import { useRef, useState } from 'react'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCreateStudentsInBatch } from '../api'
import type { StudentRowInput } from '../types'

const inputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent'

const CSV_TEMPLATE = 'full_name,email,roll_number\nJane Doe,jane.doe@example.com,CSE-001\n'
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Header lookup is case-insensitive and accepts a couple of common name
// variants, rather than requiring the Download Template's exact column
// names — a real admin's spreadsheet export won't always match verbatim.
function parseCsvText(text: string): { rows: StudentRowInput[]; parseErrors: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return { rows: [], parseErrors: ['No data found.'] }

  const header = lines[0]!.split(',').map((cell) => cell.trim().toLowerCase())
  const nameIdx = header.findIndex((cell) => ['full_name', 'fullname', 'name'].includes(cell))
  const emailIdx = header.findIndex((cell) => cell === 'email')
  const rollIdx = header.findIndex((cell) =>
    ['roll_number', 'rollnumber', 'reg_no', 'regno'].includes(cell),
  )

  if (nameIdx === -1 || emailIdx === -1) {
    return { rows: [], parseErrors: ['CSV must have "full_name" and "email" columns.'] }
  }

  const rows: StudentRowInput[] = []
  const parseErrors: string[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(',').map((cell) => cell.trim())
    const fullName = cells[nameIdx] ?? ''
    const email = cells[emailIdx] ?? ''
    const rollNumber = rollIdx >= 0 ? cells[rollIdx] : undefined
    if (!fullName || !email) {
      parseErrors.push(`Row ${i + 1}: missing full_name or email — skipped.`)
      continue
    }
    rows.push({ fullName, email, rollNumber: rollNumber || undefined })
  }
  return { rows, parseErrors }
}

// "Paste emails" format is deliberately flexible, not formally specified
// upstream: each line is either just an email, or "email,Full Name". A
// bare email gets a placeholder name derived from its local-part (e.g.
// "jane.doe@x.com" -> "Jane Doe") — good enough to get through Preview &
// Validate, where the admin can still see and would need to fix a wrong
// derived name before submitting (fullName is required, this is just a
// starting guess, not a silent assumption that ships uncorrected).
function deriveNameFromEmail(email: string): string {
  const localPart = email.split('@')[0] ?? email
  return (
    localPart
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || email
  )
}

function parsePastedEmails(text: string): { rows: StudentRowInput[]; parseErrors: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const rows: StudentRowInput[] = []
  const parseErrors: string[] = []
  lines.forEach((line, index) => {
    const [emailPart, namePart] = line.split(',').map((part) => part.trim())
    if (!emailPart) {
      parseErrors.push(`Line ${index + 1}: empty — skipped.`)
      return
    }
    rows.push({ email: emailPart, fullName: namePart || deriveNameFromEmail(emailPart) })
  })
  return { rows, parseErrors }
}

function validateRows(rows: StudentRowInput[]): Map<number, string[]> {
  const errorsByIndex = new Map<number, string[]>()
  const emailCounts = new Map<string, number>()
  rows.forEach((row) => {
    const key = row.email.trim().toLowerCase()
    emailCounts.set(key, (emailCounts.get(key) ?? 0) + 1)
  })

  rows.forEach((row, index) => {
    const rowErrors: string[] = []
    if (!row.fullName.trim()) rowErrors.push('Name is required')
    if (!row.email.trim()) rowErrors.push('Email is required')
    else if (!EMAIL_REGEX.test(row.email.trim())) rowErrors.push('Invalid email format')
    else if ((emailCounts.get(row.email.trim().toLowerCase()) ?? 0) > 1) {
      rowErrors.push('Duplicate email in this list')
    }
    if (rowErrors.length > 0) errorsByIndex.set(index, rowErrors)
  })
  return errorsByIndex
}

function downloadCsvTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'student-upload-template.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

interface AddStudentsDialogProps {
  batchId: string
  batchName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Step = 'input' | 'preview' | 'done'

export function AddStudentsDialog({ batchId, batchName, open, onOpenChange }: AddStudentsDialogProps) {
  const [step, setStep] = useState<Step>('input')
  const [pasteText, setPasteText] = useState('')
  const [manualRows, setManualRows] = useState<StudentRowInput[]>([{ fullName: '', email: '', rollNumber: '' }])
  const [rows, setRows] = useState<StudentRowInput[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const createStudents = useCreateStudentsInBatch(batchId)

  function reset() {
    setStep('input')
    setPasteText('')
    setManualRows([{ fullName: '', email: '', rollNumber: '' }])
    setRows([])
    setParseErrors([])
    createStudents.reset()
  }

  function handleDialogChange(nextOpen: boolean) {
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  function handleCsvFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const { rows: parsed, parseErrors: errors } = parseCsvText(String(reader.result ?? ''))
      setRows(parsed)
      setParseErrors(errors)
      setStep('preview')
    }
    reader.readAsText(file)
  }

  function handlePasteContinue() {
    const { rows: parsed, parseErrors: errors } = parsePastedEmails(pasteText)
    setRows(parsed)
    setParseErrors(errors)
    setStep('preview')
  }

  function handleManualContinue() {
    setRows(manualRows.filter((row) => row.fullName.trim() || row.email.trim()))
    setParseErrors([])
    setStep('preview')
  }

  const rowErrors = validateRows(rows)
  const hasErrors = rowErrors.size > 0
  const validCount = rows.length - rowErrors.size

  function handleSubmit() {
    createStudents.mutate({ students: rows }, { onSuccess: () => setStep('done') })
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Students to {batchName}</DialogTitle>
          <DialogDescription>
            {step === 'input' && 'Upload a CSV, paste emails, or enter students manually.'}
            {step === 'preview' && 'Review parsed rows and fix any flagged errors before submitting.'}
            {step === 'done' && 'Students created — initial login uses this batch’s shared password.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'input' && (
          <Tabs defaultValue="csv">
            <TabsList>
              <TabsTrigger value="csv">CSV Upload</TabsTrigger>
              <TabsTrigger value="paste">Paste Emails</TabsTrigger>
              <TabsTrigger value="manual">Manual Entry</TabsTrigger>
            </TabsList>

            <TabsContent value="csv" className="space-y-3 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={downloadCsvTemplate}>
                Download Template
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) handleCsvFile(file)
                  event.target.value = ''
                }}
              />
              <div>
                <Button type="button" onClick={() => fileInputRef.current?.click()}>
                  Choose CSV file…
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="paste" className="space-y-3 pt-2">
              <p className="text-xs text-muted-foreground">
                One student per line: <code>email</code> or <code>email, Full Name</code>. A name is
                guessed from the email if you leave it out — check it in the next step.
              </p>
              <textarea
                rows={6}
                className={inputClassName}
                placeholder={'jane.doe@example.com, Jane Doe\njohn.smith@example.com'}
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
              />
              <Button type="button" disabled={!pasteText.trim()} onClick={handlePasteContinue}>
                Continue
              </Button>
            </TabsContent>

            <TabsContent value="manual" className="space-y-3 pt-2">
              {manualRows.map((row, index) => (
                <div key={index} className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="Full name"
                    value={row.fullName}
                    onChange={(event) => {
                      const next = [...manualRows]
                      next[index] = { ...next[index]!, fullName: event.target.value }
                      setManualRows(next)
                    }}
                  />
                  <Input
                    placeholder="Email"
                    value={row.email}
                    onChange={(event) => {
                      const next = [...manualRows]
                      next[index] = { ...next[index]!, email: event.target.value }
                      setManualRows(next)
                    }}
                  />
                  <Input
                    placeholder="Roll number (optional)"
                    value={row.rollNumber ?? ''}
                    onChange={(event) => {
                      const next = [...manualRows]
                      next[index] = { ...next[index]!, rollNumber: event.target.value }
                      setManualRows(next)
                    }}
                  />
                </div>
              ))}
              <div className="flex gap-2">
                {manualRows.length < 2 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setManualRows([...manualRows, { fullName: '', email: '', rollNumber: '' }])}
                  >
                    Add another student
                  </Button>
                )}
                <Button type="button" size="sm" onClick={handleManualContinue}>
                  Continue
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {step === 'preview' && (
          <div className="space-y-3">
            {parseErrors.length > 0 && (
              <div className="rounded-md bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                {parseErrors.map((error, i) => (
                  <p key={i}>{error}</p>
                ))}
              </div>
            )}

            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No valid rows were parsed.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Email</th>
                      <th className="px-3 py-2 font-medium">Roll #</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => {
                      const errors = rowErrors.get(index)
                      return (
                        <tr key={index} className="border-t border-border">
                          <td className="px-3 py-2">{row.fullName}</td>
                          <td className="px-3 py-2">{row.email}</td>
                          <td className="px-3 py-2 text-muted-foreground">{row.rollNumber ?? '—'}</td>
                          <td className="px-3 py-2">
                            {errors ? (
                              <span className="text-xs text-destructive">{errors.join('; ')}</span>
                            ) : (
                              <span className="text-xs text-brand-accent">Valid</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {validCount} of {rows.length} rows valid.
              {hasErrors && ' Fix the flagged rows (or go back and re-upload) before submitting.'}
            </p>

            {createStudents.isError && (
              <p className="text-sm text-destructive">
                {createStudents.error instanceof ApiError
                  ? createStudents.error.message
                  : 'Failed to create students.'}
              </p>
            )}
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-2">
            <p className="text-sm text-brand-primary">
              {createStudents.data?.created.length ?? 0} student
              {createStudents.data?.created.length === 1 ? '' : 's'} created successfully.
            </p>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-muted-foreground">
              {createStudents.data?.created.map((student) => (
                <li key={student.studentProfileId}>
                  {student.fullName} — {student.email}
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          {step === 'preview' && (
            <>
              <Button type="button" variant="outline" onClick={() => setStep('input')}>
                Back
              </Button>
              <Button
                type="button"
                disabled={rows.length === 0 || hasErrors || createStudents.isPending}
                onClick={handleSubmit}
              >
                {createStudents.isPending ? 'Creating…' : `Create ${rows.length} student${rows.length === 1 ? '' : 's'}`}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button type="button" onClick={() => handleDialogChange(false)}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
