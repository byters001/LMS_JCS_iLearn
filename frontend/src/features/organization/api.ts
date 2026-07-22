// TanStack Query hooks for the "organization" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import type {
  AssignBatchTrainerInput,
  Batch,
  BatchTrainer,
  College,
  CreateBatchInput,
  CreateCollegeInput,
  CreateDepartmentInput,
  CreateTrainingProgramInput,
  Department,
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
  TrainingProgram,
  UpdateBatchInput,
  UpdateCollegeInput,
  UpdateDepartmentInput,
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

// --- Batch edit / delete (item 10 tier 2) ---
// Both routes were already real on the backend (confirmed by the item 10
// audit) — PATCH/DELETE /batches/:id — just never called from the
// frontend.

function updateBatch(id: string, input: UpdateBatchInput): Promise<Batch> {
  return api.patch<Batch>(`/batches/${id}`, input)
}

export function useUpdateBatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBatchInput }) => updateBatch(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'batches', 'list'] })
      queryClient.invalidateQueries({ queryKey: ['organization', 'batches', 'mine'] })
    },
  })
}

// Soft delete (batches.deleted_at) — see DeleteBatchDialog.tsx's own
// comment for why this is still gated behind a dependent-student check
// client-side despite the backend accepting the call unconditionally.
function deleteBatch(id: string): Promise<void> {
  return api.delete<void>(`/batches/${id}`)
}

export function useDeleteBatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteBatch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'batches', 'list'] })
      queryClient.invalidateQueries({ queryKey: ['organization', 'batches', 'mine'] })
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

// `enabled` added for BatchesEditor.tsx's Super Admin-only college picker
// (same optional-`enabled` shape useBatches/useDepartments/useMyBatches
// already use) — without it, this fired unconditionally regardless of
// caller role, which is exactly what made Faculty hit a colleges.view 403
// even on assessments where the college picker itself never rendered (see
// BatchesEditor.tsx's own module comment for the full fix writeup).
export function useColleges(params: ListCollegesParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['organization', 'colleges', 'list', params],
    queryFn: () => listColleges(params),
    placeholderData: keepPreviousData,
    enabled: options?.enabled,
  })
}

// --- College CRUD (item 10 tier 1 — was picker-only, GET-only, before this) ---

function createCollege(input: CreateCollegeInput): Promise<College> {
  return api.post<College>('/colleges', input)
}

export function useCreateCollege() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createCollege,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'colleges', 'list'] })
    },
  })
}

function updateCollege(id: string, input: UpdateCollegeInput): Promise<College> {
  return api.patch<College>(`/colleges/${id}`, input)
}

export function useUpdateCollege() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCollegeInput }) =>
      updateCollege(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'colleges', 'list'] })
    },
  })
}

// Soft delete (colleges.deleted_at) — see CollegeListPage.tsx's own comment
// on why this is still gated behind a dependent-department check client-side
// despite the backend accepting the call unconditionally.
function deleteCollege(id: string): Promise<void> {
  return api.delete<void>(`/colleges/${id}`)
}

export function useDeleteCollege() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteCollege,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'colleges', 'list'] })
    },
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

// --- Department CRUD (item 10 tier 1) ---

function createDepartment(input: CreateDepartmentInput): Promise<Department> {
  return api.post<Department>('/departments', input)
}

export function useCreateDepartment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createDepartment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'departments', 'list'] })
    },
  })
}

function updateDepartment(id: string, input: UpdateDepartmentInput): Promise<Department> {
  return api.patch<Department>(`/departments/${id}`, input)
}

export function useUpdateDepartment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDepartmentInput }) =>
      updateDepartment(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'departments', 'list'] })
    },
  })
}

// Soft delete (departments.deleted_at) — same dependent-check-before-delete
// reasoning as useDeleteCollege above, this time against training_programs
// (departments.id is training_programs.department_id, NOT NULL) rather than
// departments — see DepartmentListPage.tsx's own comment.
function deleteDepartment(id: string): Promise<void> {
  return api.delete<void>(`/departments/${id}`)
}

export function useDeleteDepartment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteDepartment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'departments', 'list'] })
    },
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

// --- Training program create (item 1 — inline creation from Colleges page
// and the Batch creation training-program picker; list/get already existed
// via useTrainingPrograms above, create never had a frontend caller). ---

function createTrainingProgram(input: CreateTrainingProgramInput): Promise<TrainingProgram> {
  return api.post<TrainingProgram>('/training-programs', input)
}

export function useCreateTrainingProgram() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createTrainingProgram,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', 'training-programs', 'list'] })
    },
  })
}

function listMyBatches(params: ListMyBatchesParams): Promise<ListBatchesResponse> {
  return api.get<ListBatchesResponse>('/batches/mine', { params })
}

// Backs Trainer's "My Batches" nav item/page — self-scoped server-side by
// the caller's own id (GET /batches/mine), not a client-side filter. Also
// backs BatchesEditor.tsx's Faculty picker (assessments feature) — `enabled`
// added there so a Super Admin caller (who isn't a trainer) doesn't fire
// this request at all, same optional-`enabled` shape useBatches/
// useDepartments already use.
export function useMyBatches(params: ListMyBatchesParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['organization', 'batches', 'mine', params],
    queryFn: () => listMyBatches(params),
    placeholderData: keepPreviousData,
    enabled: options?.enabled,
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
