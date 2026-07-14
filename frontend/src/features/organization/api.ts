// TanStack Query hooks for the "organization" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import type { ListBatchesParams, ListBatchesResponse } from './types'

function listBatches(params: ListBatchesParams): Promise<ListBatchesResponse> {
  return api.get<ListBatchesResponse>('/batches', { params })
}

export function useBatches(params: ListBatchesParams) {
  return useQuery({
    queryKey: ['organization', 'batches', 'list', params],
    queryFn: () => listBatches(params),
    placeholderData: keepPreviousData,
  })
}
