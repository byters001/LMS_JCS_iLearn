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
  PoolUsageRow,
  ScheduleAssessmentInput,
  UpdateAssessmentInput,
  UpdateAssessmentSectionInput,
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

// Soft delete (assessments.deleted_at) — gated by assertAssessmentEditable
// (draft-only), same as updateAssessment above. See DeleteAssessmentDialog.tsx
// for the orphaning read: draft-only is provably sufficient here (a
// draft assessment can never have accumulated attempts — see that file's
// comment), so no extra dependent-check guard is needed, unlike pools in
// tier 3a.
function deleteAssessment(id: string): Promise<void> {
  return api.delete<void>(`/assessments/${id}`)
}

export function useDeleteAssessment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteAssessment,
    onSuccess: () => {
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

// --- Section edit / delete (item 10 tier 3b) ---
// Both gated by the backend's assertAssessmentEditable (draft-only), same
// as section creation above — AssessmentEditPage hides the Edit/Delete
// buttons entirely once status leaves draft (isContentEditable), matching
// how it already hides AddSectionForm/AttachQuestionForm/AttachPoolForm,
// rather than letting a stale button 409.

function updateSection(
  assessmentId: string,
  sectionId: string,
  input: UpdateAssessmentSectionInput,
): Promise<AssessmentSection> {
  return api.patch<AssessmentSection>(
    `/assessments/${assessmentId}/sections/${sectionId}`,
    input,
  )
}

export function useUpdateSection(assessmentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionId, input }: { sectionId: string; input: UpdateAssessmentSectionInput }) =>
      updateSection(assessmentId, sectionId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments', 'detail', assessmentId] })
    },
  })
}

// Hard delete (no deleted_at on assessment_sections — see
// DeleteSectionDialog.tsx's own comment on the real, and here genuinely
// intended, CASCADE this triggers on any attached assessment_questions/
// assessment_section_pools rows).
function deleteSection(assessmentId: string, sectionId: string): Promise<void> {
  return api.delete<void>(`/assessments/${assessmentId}/sections/${sectionId}`)
}

export function useDeleteSection(assessmentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sectionId: string) => deleteSection(assessmentId, sectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments', 'detail', assessmentId] })
    },
  })
}

// --- Raw section questions / pools (item 10 tier 3b) ---
// GET /assessments/:id/full's resolvedQuestions (used for display above)
// is normalized and, for 'pool' sections, dynamically re-drawn on every
// fetch — it carries no assessment_questions.id (manual) or
// assessment_section_pools.id (pool) to target a DELETE at. These two raw
// junction-row reads back that id: useAssessmentQuestions backs "Remove"
// on an individual manual question (mapped by questionVersionId, since
// resolvedQuestions and this raw list share that field); useAssessmentSectionPools
// backs the separate "Attached Pools" list AssessmentEditPage renders for
// pool-mode sections (removing a POOL attachment, not a single resolved
// question — a pool's resolved questions have no stable per-row identity
// to remove individually, only the pool link itself does).

function listSectionQuestions(assessmentId: string, sectionId: string): Promise<AssessmentQuestion[]> {
  return api.get<AssessmentQuestion[]>(`/assessments/${assessmentId}/sections/${sectionId}/questions`)
}

export function useAssessmentQuestions(assessmentId: string, sectionId: string | undefined) {
  return useQuery({
    queryKey: ['assessments', 'section-questions', assessmentId, sectionId],
    queryFn: () => listSectionQuestions(assessmentId, sectionId as string),
    enabled: Boolean(sectionId),
  })
}

function listSectionPools(assessmentId: string, sectionId: string): Promise<AssessmentSectionPool[]> {
  return api.get<AssessmentSectionPool[]>(`/assessments/${assessmentId}/sections/${sectionId}/pools`)
}

export function useAssessmentSectionPools(assessmentId: string, sectionId: string | undefined) {
  return useQuery({
    queryKey: ['assessments', 'section-pools', assessmentId, sectionId],
    queryFn: () => listSectionPools(assessmentId, sectionId as string),
    enabled: Boolean(sectionId),
  })
}

// --- Remove question / pool from a section (item 10 tier 3b) ---
// Both gated by assertAssessmentEditable (draft-only), same as everything
// else content-related. Invalidates the raw junction list (so the Remove
// button's own source list drops the removed row) AND the detail query
// (so the displayed resolvedQuestions list — manual join or pool re-draw —
// reflects the change too).

interface RemoveQuestionVariables {
  sectionId: string
  questionId: string
}

function removeQuestion(assessmentId: string, sectionId: string, questionId: string): Promise<void> {
  return api.delete<void>(
    `/assessments/${assessmentId}/sections/${sectionId}/questions/${questionId}`,
  )
}

export function useRemoveQuestion(assessmentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionId, questionId }: RemoveQuestionVariables) =>
      removeQuestion(assessmentId, sectionId, questionId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['assessments', 'section-questions', assessmentId, variables.sectionId],
      })
      queryClient.invalidateQueries({ queryKey: ['assessments', 'detail', assessmentId] })
    },
  })
}

interface RemovePoolVariables {
  sectionId: string
  poolId: string
}

function removePool(assessmentId: string, sectionId: string, poolId: string): Promise<void> {
  return api.delete<void>(`/assessments/${assessmentId}/sections/${sectionId}/pools/${poolId}`)
}

export function useRemovePool(assessmentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionId, poolId }: RemovePoolVariables) =>
      removePool(assessmentId, sectionId, poolId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['assessments', 'section-pools', assessmentId, variables.sectionId],
      })
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

// --- Pool usage (item 10 tier 3a) ---
// GET /assessments/pools/:poolId/usage — see PoolUsageRow's own comment in
// types.ts for why this lives here instead of question-bank/api.ts. Only
// ever called from question-bank's DeletePoolDialog, gated on `enabled` so
// it doesn't fire until that dialog is actually open (same "only query
// when the guard is actually needed" shape DeleteCollegeDialog.tsx/
// DeleteBatchDialog.tsx already established).
function listAssessmentsUsingPool(poolId: string): Promise<PoolUsageRow[]> {
  return api.get<PoolUsageRow[]>(`/assessments/pools/${poolId}/usage`)
}

export function useAssessmentsUsingPool(poolId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['assessments', 'pool-usage', poolId],
    queryFn: () => listAssessmentsUsingPool(poolId),
    enabled: options?.enabled,
  })
}
