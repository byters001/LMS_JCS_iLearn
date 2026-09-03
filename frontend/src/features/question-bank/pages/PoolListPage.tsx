import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useQuestionPools } from '../api'
import type { QuestionType } from '../types'

const PAGE_SIZE = 20
const DESCRIPTION_TRUNCATE_LENGTH = 100

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'MCQ',
  coding: 'Coding',
  psychometric: 'Psychometric',
}

function truncate(text: string): string {
  return text.length > DESCRIPTION_TRUNCATE_LENGTH
    ? `${text.slice(0, DESCRIPTION_TRUNCATE_LENGTH)}…`
    : text
}

// Basic browsing list — question_pools.name lives directly on the row (no
// version indirection like questions), so GET /question-pools already has
// everything this list needs with no per-row enrichment fetch, unlike
// QuestionListPage's two-step text lookup. Each row links to
// PoolDetailPage, where criteria management and the live resolution
// preview live — this list stays read-only browsing, same split
// QuestionListPage/QuestionDetailPage already established.
export default function PoolListPage() {
  const [page, setPage] = useState(1)
  const pools = useQuestionPools({ page, pageSize: PAGE_SIZE })

  const items = pools.data?.items ?? []
  const total = pools.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-3 p-4">
      <PageHeader
        title="Question Pools"
        description="Reusable, criteria-filtered buckets of approved questions for pool-based assessment sections."
        actions={
          <Button asChild>
            <Link to="new">Create Pool</Link>
          </Button>
        }
      />

      {pools.isPending && (
        <div className="space-y-2" role="status" aria-label="Loading question pools">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      )}

      {pools.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive">
          Failed to load question pools. Please try again.
        </div>
      )}

      {!pools.isPending && !pools.isError && (
        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="pr-4">Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    No question pools found.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((pool) => (
                  <TableRow key={pool.id} className="hover:bg-muted/30">
                    <TableCell className="pl-4 font-medium">
                      <Link to={pool.id} className="text-primary hover:underline">
                        {pool.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{TYPE_LABELS[pool.type]}</TableCell>
                    <TableCell className="pr-4 text-muted-foreground">
                      {pool.description ? truncate(pool.description) : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t border-border bg-muted/10 px-3.5 py-2.5">
            <p className="text-sm text-muted-foreground">
              Page {pools.data?.page ?? page} of {totalPages} &middot; {total} pool
              {total === 1 ? '' : 's'}
              {pools.isFetching ? ' · refreshing…' : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-primary text-primary hover:bg-primary/5"
                disabled={page <= 1 || pools.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-primary text-primary hover:bg-primary/5"
                disabled={page >= totalPages || pools.isFetching}
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
