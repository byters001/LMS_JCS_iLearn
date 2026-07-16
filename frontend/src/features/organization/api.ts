// TanStack Query hooks for the "organization" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import type {
  AssignBatchTrainerInput,
  Batch,
  BatchTrainer,
  CreateBatchInput,
  ListBatchesParams,
  ListBatchesResponse,
  ListBatchTrainersParams,
  ListBatchTrainersResponse,
  ListCollegesParams,
  ListCollegesResponse,
  ListDepartmentsParams,
  ListDepartmentsResponse,
  ListMyBatchesParams,
  ListTrainingProgramsParams,
  ListTrainingProgramsResponse,
} from './types'

function listBatches(params: ListBatchesParams): Promise<ListBatchesResponse> {
  return api.get<ListBatchesResponse>('/batches', { params })
}

// `enabled` lets a caller defer this query until its required `collegeId` is
// actually known (e.g. BatchesEditor.tsx, whose Super Admin path doesn't
// have one until the caller picks a college) — same shape as TanStack
// Query's own `enabled` option, just threaded through explicitly since
// `collegeId` is otherwise a required param here.
export function useBatches(params: ListBatchesParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['organization', 'batches', 'list', params],
    queryFn: () => listBatches(params),
    placeholderData: keepPreviousData,
    enabled: options?.enabled,
  })
}

function createBatch(input: CreateBatchInput): Promise<Batch> {
  return api.post<Batch>('/batches', input)
}

export function useCreateBatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createBatch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'batches', 'list'] })
    },
  })
}

function toggleBatchActive(id: string): Promise<Batch> {
  return api.patch<Batch>(`/batches/${id}/toggle-active`)
}

export function useToggleBatchActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: toggleBatchActive,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'batches', 'list'] })
    },
  })
}

function listColleges(params: ListCollegesParams): Promise<ListCollegesResponse> {
  return api.get<ListCollegesResponse>('/colleges', { params })
}

export function useColleges(params: ListCollegesParams) {
  return useQuery({
    queryKey: ['organization', 'colleges', 'list', params],
    queryFn: () => listColleges(params),
    placeholderData: keepPreviousData,
  })
}

function listDepartments(params: ListDepartmentsParams): Promise<ListDepartmentsResponse> {
  return api.get<ListDepartmentsResponse>('/departments', { params })
}

export function useDepartments(params: ListDepartmentsParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['organization', 'departments', 'list', params],
    queryFn: () => listDepartments(params),
    placeholderData: keepPreviousData,
    enabled: options?.enabled,
  })
}

function listTrainingPrograms(
  params: ListTrainingProgramsParams,
): Promise<ListTrainingProgramsResponse> {
  return api.get<ListTrainingProgramsResponse>('/training-programs', { params })
}

// `enabled` used the same way as useBatches above — the training-program
// picker (CreateBatchPage) shouldn't fire until a college has been chosen
// (listTrainingProgramsQuerySchema's collegeId is optional server-side, but
// an unfiltered fetch across every college in the platform isn't a useful
// picker state to show).
export function useTrainingPrograms(
  params: ListTrainingProgramsParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['organization', 'training-programs', 'list', params],
    queryFn: () => listTrainingPrograms(params),
    placeholderData: keepPreviousData,
    enabled: options?.enabled,
  })
}

function listMyBatches(params: ListMyBatchesParams): Promise<ListBatchesResponse> {
  return api.get<ListBatchesResponse>('/batches/mine', { params })
}

// Backs Trainer's "My Batches" nav item/page — self-scoped server-side by
// the caller's own id (GET /batches/mine), not a client-side filter.
export function useMyBatches(params: ListMyBatchesParams) {
  return useQuery({
    queryKey: ['organization', 'batches', 'mine', params],
    queryFn: () => listMyBatches(params),
    placeholderData: keepPreviousData,
  })
}

function listBatchTrainers(
  batchId: string,
  params: ListBatchTrainersParams,
): Promise<ListBatchTrainersResponse> {
  return api.get<ListBatchTrainersResponse>(`/batches/${batchId}/trainers`, { params })
}

export function useBatchTrainers(batchId: string, params: ListBatchTrainersParams) {
  return useQuery({
    queryKey: ['organization', 'batches', batchId, 'trainers', params],
    queryFn: () => listBatchTrainers(batchId, params),
    placeholderData: keepPreviousData,
    enabled: Boolean(batchId),
  })
}

function assignTrainerToBatch(
  batchId: string,
  input: AssignBatchTrainerInput,
): Promise<BatchTrainer> {
  return api.post<BatchTrainer>(`/batches/${batchId}/trainers`, input)
}

export function useAssignTrainerToBatch(batchId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AssignBatchTrainerInput) => assignTrainerToBatch(batchId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['organization', 'batches', batchId, 'trainers'],
      })
    },
  })
}

function unassignTrainerFromBatch(batchId: string, trainerId: string): Promise<void> {
  return api.delete<void>(`/batches/${batchId}/trainers/${trainerId}`)
}

export function useUnassignTrainerFromBatch(batchId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (trainerId: string) => unassignTrainerFromBatch(batchId, trainerId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['organization', 'batches', batchId, 'trainers'],
      })
    },
  })
}
