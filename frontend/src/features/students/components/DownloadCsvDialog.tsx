import { useState } from 'react'
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
import type { SpreadsheetFormat } from '@/lib/spreadsheet'
import { cn } from '@/lib/utils'
import { downloadStudentsExport } from '../api'
import type { StudentStatus } from '../types'

interface DownloadCsvDialogProps {
  batchId: string
  batchName: string
  departmentOptions: { id: string; name: string }[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

const STATUS_OPTIONS: Array<{ value: StudentStatus | ''; label: string }> = [
  { value: '', label: 'Any status' },
  { value: 'active', label: 'Active only' },
  { value: 'archived', label: 'Archived only' },
]

// Columns are full_name/email/reg_no/department/status, fixed server-side
// (see students.service.ts's toCsv) — this dialog only controls which ROWS
// go in the file (first N / department / status, combinable), not which
// columns. No "Handled by" trailing row either — see that same service
// function's comment for why it's omitted rather than faked.
export function DownloadCsvDialog({
  batchId,
  batchName,
  departmentOptions,
  open,
  onOpenChange,
}: DownloadCsvDialogProps) {
  const [limit, setLimit] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [status, setStatus] = useState<StudentStatus | ''>('')
  const [format, setFormat] = useState<SpreadsheetFormat>('csv')
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload() {
    setIsDownloading(true)
    setError(null)
    try {
      await downloadStudentsExport(
        batchId,
        batchName,
        {
          limit: limit ? Number(limit) : undefined,
          departmentId: departmentId || undefined,
          status: status || undefined,
        },
        format,
      )
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export students.')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Download {batchName} Roster</DialogTitle>
          <DialogDescription>
            Filters are combinable — leave any blank to not filter by it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="csvLimit" className="text-sm font-medium text-brand-primary">
              First N students <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="csvLimit"
              type="number"
              min={1}
              placeholder="All matching students"
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="csvDepartment" className="text-sm font-medium text-brand-primary">
              Department <span className="text-muted-foreground">(optional)</span>
            </label>
            <select
              id="csvDepartment"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
            >
              <option value="">Any department</option>
              {departmentOptions.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="csvStatus" className="text-sm font-medium text-brand-primary">
              Status
            </label>
            <select
              id="csvStatus"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
              value={status}
              onChange={(event) => setStatus(event.target.value as StudentStatus | '')}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-brand-primary">Format</p>
            {/* Two-button toggle, not a dropdown — only two options, and a
                toggle makes the current selection visible at a glance
                without an extra click to open it. */}
            <div className="inline-flex rounded-md border border-input p-0.5">
              {(['csv', 'xlsx'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormat(option)}
                  className={cn(
                    'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                    format === option
                      ? 'bg-brand-accent text-white'
                      : 'text-muted-foreground hover:text-brand-primary',
                  )}
                >
                  {option === 'csv' ? 'CSV' : 'Excel'}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={isDownloading} onClick={handleDownload}>
            {isDownloading ? 'Downloading…' : `Download ${format === 'csv' ? 'CSV' : 'Excel'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
