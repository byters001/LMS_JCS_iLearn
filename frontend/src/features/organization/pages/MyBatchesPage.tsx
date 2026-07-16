import { useState } from 'react'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/button'
import { useMyBatches } from '../api'
import { BatchCard } from '../components/BatchCard'

const PAGE_SIZE = 20

// Trainer's "My Batches" — backed by GET /batches/mine (self-scoped
// server-side by the caller's own id via batch_trainers, not a client-side
// filter of listBatches). Reuses BatchCard, same as BatchListPage — no
// duplicated card markup. No menu items or active-toggle here: those are
// Admin/Faculty-management actions that belong on BatchListPage, not on a
// trainer's own read-scoped view of batches they're assigned to.
export default function MyBatchesPage() {
  const [page, setPage] = useState(1)
  const batches = useMyBatches({ page, pageSize: PAGE_SIZE })

  const totalPages = batches.data
    ? Math.max(1, Math.ceil(batches.data.total / batches.data.pageSize))
    : 1

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-brand-primary">My Batches</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Batches you're currently assigned to as a trainer.
        </p>
      </div>

      {batches.isPending && (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="status"
          aria-label="Loading batches"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {batches.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {batches.error instanceof ApiError
            ? batches.error.message
            : 'Failed to load your batches. Please try again.'}
        </div>
      )}

      {batches.data && batches.data.items.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          You're not assigned to any batches yet.
        </p>
      )}

      {batches.data && batches.data.items.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {batches.data.items.map((batch) => (
              <BatchCard key={batch.id} batch={batch} />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {batches.data.page} of {totalPages} &middot; {batches.data.total} batch
              {batches.data.total === 1 ? '' : 'es'}
              {batches.isFetching ? ' · refreshing…' : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page <= 1 || batches.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-brand-primary text-brand-primary hover:bg-brand-primary/5"
                disabled={page >= totalPages || batches.isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
