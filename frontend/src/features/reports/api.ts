// TanStack Query hooks for the "reports" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import type { ListMyAttemptsParams, ListMyAttemptsResult, MyAttemptDetail } from './types'

function listMyAttempts(params: ListMyAttemptsParams): Promise<ListMyAttemptsResult> {
  return api.get<ListMyAttemptsResult>('/reports/my-attempts', { params })
}

export function useMyAttempts(params: ListMyAttemptsParams) {
  return useQuery({
    queryKey: ['reports', 'my-attempts', 'list', params],
    queryFn: () => listMyAttempts(params),
    placeholderData: keepPreviousData,
  })
}

function getMyAttemptDetail(attemptId: string): Promise<MyAttemptDetail> {
  return api.get<MyAttemptDetail>(`/reports/my-attempts/${attemptId}`)
}

export function useMyAttemptDetail(attemptId: string | undefined) {
  return useQuery({
    queryKey: ['reports', 'my-attempts', 'detail', attemptId],
    queryFn: () => getMyAttemptDetail(attemptId as string),
    enabled: Boolean(attemptId),
  })
}
