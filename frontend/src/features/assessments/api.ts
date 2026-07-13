// TanStack Query hooks for the "assessments" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import type {
  AssessmentApprovalActionInput,
  AssessmentQuestion,
  AssessmentSection,
  AssessmentSectionPool,
  AssessmentWithBatches,
  CreateAssessmentInput,
  CreateAssessmentQuestionInput,
  CreateAssessmentSectionInput,
  CreateAssessmentSectionPoolInput,
  FullAssessment,
  ListAssessmentsParams,
  ListAssessmentsResult,
  ListAvailableAssessmentsParams,
  ListAvailableAssessmentsResponse,
  ScheduleAssessmentInput,
  UpdateAssessmentInput,
} from './types'

// Calls the student-scoped GET /assessments/available (batch-authorized
// only) — NOT GET /assessments, which is staff-only and unscoped. See
// backend/src/modules/assessments/assessments.routes.ts's comment on why
// these are separate routes.
function listAvailableAssessments(
  params: ListAvailableAssessmentsParams,
): Promise<ListAvailableAssessmentsResponse> {
  return api.get<ListAvailableAssessmentsResponse>('/assessments/available', { params })
}

export function useAvailableAssessments(params: ListAvailableAssessmentsParams) {
  return useQuery({
    queryKey: ['assessments', 'available', params],
    queryFn: () => listAvailableAssessments(params),
    placeholderData: keepPreviousData,
  })
}

// Staff-facing GET /assessments — full platform-wide list, gated by the
// assessments.create permission (assessments.routes.ts's ASSESSMENTS_MANAGE).
// NOT the same endpoint useAvailableAssessments calls.
function listAssessments(params: ListAssessmentsParams): Promise<ListAssessmentsResult> {
  return api.get<ListAssessmentsResult>('/assessments', { params })
}

export function useAssessments(params: ListAssessmentsParams) {
  return useQuery({
    queryKey: ['assessments', 'list', params],
    queryFn: () => listAssessments(params),
    placeholderData: keepPreviousData,
  })
}

// GET /assessments/:id/full — the assessment plus every section, each
// carrying its resolved questions (manual and pool alike, already
// normalized/flattened by the backend). What AssessmentEditPage fetches to
// render current state.
function getAssessmentDetail(id: string): Promise<FullAssessment> {
  return api.get<FullAssessment>(`/assessments/${id}/full`)
}

export function useAssessmentDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['assessments', 'detail', id],
    queryFn: () => getAssessmentDetail(id as string),
    enabled: Boolean(id),
  })
}

function createAssessment(input: CreateAssessmentInput): Promise<AssessmentWithBatches> {
  return api.post<AssessmentWithBatches>('/assessments', input)
}

export function useCreateAssessment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createAssessment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments', 'list'] })
    },
  })
}

function updateAssessment(id: string, input: UpdateAssessmentInput): Promise<AssessmentWithBatches> {
  return api.patch<AssessmentWithBatches>(`/assessments/${id}`, input)
}

// General field updates (title/description/timer/etc) — gated by the
// backend's assertAssessmentEditable (draft-only). Distinct from
// useUpdateAssessmentBatches below even though both hit the same PATCH
// endpoint: the backend itself gates batchIds separately
// (assertBatchesEditable, editable through a wider window than other
// fields — see assessments.service.ts), so the two are genuinely different
// operations that happen to share a URL, not one operation with two names.
export function useUpdateAssessment(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateAssessmentInput) => updateAssessment(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments', 'detail', id] })
      queryClient.invalidateQueries({ queryKey: ['assessments', 'list'] })
    },
  })
}

// batchIds replaces the WHOLE set server-side (assessment_batches has no
// lifecycle columns of its own — see assessments.service.ts's module
// comment on why create/update model it as a replace-the-whole-array field
// rather than incremental add/remove endpoints).
export function useUpdateAssessmentBatches(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (batchIds: string[]) => updateAssessment(id, { batchIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments', 'detail', id] })
    },
  })
}

function createSection(
  assessmentId: string,
  input: CreateAssessmentSectionInput,
): Promise<AssessmentSection> {
  return api.post<AssessmentSection>(`/assessments/${assessmentId}/sections`, input)
}

export function useCreateSection(assessmentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAssessmentSectionInput) => createSection(assessmentId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments', 'detail', assessmentId] })
    },
  })
}

interface AttachQuestionVariables extends CreateAssessmentQuestionInput {
  sectionId: string
}

function attachQuestion(
  assessmentId: string,
  { sectionId, ...body }: AttachQuestionVariables,
): Promise<AssessmentQuestion> {
  return api.post<AssessmentQuestion>(
    `/assessments/${assessmentId}/sections/${sectionId}/questions`,
    body,
  )
}

export function useAttachQuestion(assessmentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: AttachQuestionVariables) => attachQuestion(assessmentId, variables),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments', 'detail', assessmentId] })
    },
  })
}

interface AttachPoolVariables extends CreateAssessmentSectionPoolInput {
  sectionId: string
}

function attachPool(
  assessmentId: string,
  { sectionId, ...body }: AttachPoolVariables,
): Promise<AssessmentSectionPool> {
  return api.post<AssessmentSectionPool>(
    `/assessments/${assessmentId}/sections/${sectionId}/pools`,
    body,
  )
}

export function useAttachPool(assessmentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: AttachPoolVariables) => attachPool(assessmentId, variables),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments', 'detail', assessmentId] })
    },
  })
}

// --- Approval workflow (item 4) ---
// Five dedicated action endpoints, matching the backend's exact shape —
// see WorkflowActions.tsx for why this stays five distinct buttons rather
// than a generic "advance" action. None of these carry an Idempotency-Key
// requirement (confirmed against assessments.routes.ts — unlike attempts'
// submit/coding routes, none of these five wire the idempotency plugin).

function submitAssessment(
  id: string,
  input: AssessmentApprovalActionInput,
): Promise<AssessmentWithBatches> {
  return api.post<AssessmentWithBatches>(`/assessments/${id}/submit`, input)
}

export function useSubmitAssessment(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AssessmentApprovalActionInput) => submitAssessment(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assessments', 'detail', id] }),
  })
}

function approveAssessment(
  id: string,
  input: AssessmentApprovalActionInput,
): Promise<AssessmentWithBatches> {
  return api.post<AssessmentWithBatches>(`/assessments/${id}/approve`, input)
}

export function useApproveAssessment(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AssessmentApprovalActionInput) => approveAssessment(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assessments', 'detail', id] }),
  })
}

function rejectAssessment(
  id: string,
  input: AssessmentApprovalActionInput,
): Promise<AssessmentWithBatches> {
  return api.post<AssessmentWithBatches>(`/assessments/${id}/reject`, input)
}

export function useRejectAssessment(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AssessmentApprovalActionInput) => rejectAssessment(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assessments', 'detail', id] }),
  })
}

function scheduleAssessment(
  id: string,
  input: ScheduleAssessmentInput,
): Promise<AssessmentWithBatches> {
  return api.post<AssessmentWithBatches>(`/assessments/${id}/schedule`, input)
}

export function useScheduleAssessment(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ScheduleAssessmentInput) => scheduleAssessment(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assessments', 'detail', id] }),
  })
}

function publishAssessment(
  id: string,
  input: AssessmentApprovalActionInput,
): Promise<AssessmentWithBatches> {
  return api.post<AssessmentWithBatches>(`/assessments/${id}/publish`, input)
}

export function usePublishAssessment(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AssessmentApprovalActionInput) => publishAssessment(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments', 'detail', id] })
      queryClient.invalidateQueries({ queryKey: ['assessments', 'list'] })
    },
  })
}
