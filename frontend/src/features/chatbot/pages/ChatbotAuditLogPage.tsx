import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useChatbotQueries } from '../api'
import type { ChatbotQueryLogEntry } from '../types'

const PAGE_SIZE = 20

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// resolvedArgs is untrusted, unshaped JSON (chatbot.schema.ts's own
// comment: "not schema-validated at the column level — its shape depends
// on which function name was attempted, including invalid ones with no
// schema at all") — rendered as raw compact JSON, never interpreted, same
// spirit as this being an audit trail, not a rendered report.
function formatArgs(args: unknown): string {
  if (args === null || args === undefined) return '—'
  try {
    return JSON.stringify(args)
  } catch {
    return String(args)
  }
}

// Rejected/unresolved rows (resolvedFn === null) are the security-relevant
// ones per this table's own module comment (db/schema/chatbot.schema.ts) —
// an unallowlisted function name, malformed arguments, or a question that
// never resolved to any tool at all. Flagged distinctly (red border +
// warning badge), not just a plain "—" in the function column, since the
// whole point of surfacing this log is to make those attempts visible at a
// glance rather than requiring a row-by-row read.
function ResolvedFunctionCell({ entry }: { entry: ChatbotQueryLogEntry }) {
  if (!entry.resolvedFn) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
        <AlertTriangle className="size-3.5" />
        Rejected / unresolved
      </span>
    )
  }
  return <span className="font-medium text-brand-primary">{entry.resolvedFn}</span>
}

// Super-Admin-only (routes/index.tsx's RequireRole, same as every other
// /admin page) — this is audit/security data (who asked what, including
// prompt-injection/out-of-scope attempts that were rejected before
// execution — see GET /chatbot/queries's own backend comment), not a
// general staff report, so it's deliberately not surfaced under /trainer
// at all, unlike most other question-bank/analytics pages in this admin
// shell.
export default function ChatbotAuditLogPage() {
  const [page, setPage] = useState(1)
  const queries = useChatbotQueries({ page, pageSize: PAGE_SIZE })

  const totalPages = queries.data
    ? Math.max(1, Math.ceil(queries.data.total / queries.data.pageSize))
    : 1

  return (
    <div className="space-y-4 p-5">
      <div>
        <h1 className="font-heading text-xl font-semibold text-brand-primary">Chatbot Audit Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every question asked of the reporting chatbot, most recent first — including rejected or
          unresolved attempts (an unallowlisted function, malformed arguments, or a question the
          model couldn&apos;t resolve at all). Those are flagged below since they&apos;re the
          security-relevant rows this log exists to catch.
        </p>
      </div>

      {queries.isPending && (
        <div className="space-y-2" role="status" aria-label="Loading chatbot audit log">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      )}

      {queries.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {queries.error instanceof ApiError
            ? queries.error.message
            : 'Failed to load the chatbot audit log. Please try again.'}
        </div>
      )}

      {queries.data && (
        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Asked By</TableHead>
                <TableHead>Question</TableHead>
                <TableHead>Resolved Function</TableHead>
                <TableHead>Arguments</TableHead>
                <TableHead className="pr-4">Asked At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queries.data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No chatbot queries logged yet.
                  </TableCell>
                </TableRow>
              ) : (
                queries.data.items.map((entry) => (
                  <TableRow
                    key={entry.id}
                    className={cn(
                      'hover:bg-muted/30',
                      !entry.resolvedFn && 'border-l-2 border-l-destructive bg-destructive/5',
                    )}
                  >
                    <TableCell className="pl-4">
                      {entry.askedByName ? (
                        <div>
                          <p className="font-medium text-brand-primary">{entry.askedByName}</p>
                          <p className="text-xs text-muted-foreground">{entry.askedByEmail}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Deleted user</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs text-muted-foreground">
                      {entry.questionText}
                    </TableCell>
                    <TableCell>
                      <ResolvedFunctionCell entry={entry} />
                    </TableCell>
                    <TableCell className="max-w-xs truncate font-mono text-xs text-muted-foreground">
                      {formatArgs(entry.resolvedArgs)}
                    </TableCell>
                    <TableCell className="pr-4 text-muted-foreground">
                      {formatDate(entry.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t border-border bg-muted/10 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Page {queries.data.page} of {totalPages} &middot; {queries.data.total} quer
              {queries.data.total === 1 ? 'y' : 'ies'}
              {queries.isFetching ? ' · refreshing…' : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page <= 1 || queries.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page >= totalPages || queries.isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
