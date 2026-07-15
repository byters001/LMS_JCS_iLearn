// TanStack Query hooks for the "question-bank" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import type {
  ApprovalActionInput,
  CreatePoolCriterionInput,
  CreatePoolInput,
  CreateQuestionInput,
  ListQuestionCategoriesParams,
  ListQuestionCategoriesResponse,
  ListQuestionPoolsParams,
  ListQuestionPoolsResponse,
  ListQuestionsParams,
  ListQuestionsResponse,
  ListQuestionTagsParams,
  ListQuestionTagsResponse,
  ListQuestionTopicsParams,
  ListQuestionTopicsResponse,
  Question,
  QuestionPool,
  QuestionPoolCriterion,
  QuestionWithCurrentVersion,
  QuestionWithText,
  ResolvedQuestionPool,
} from './types'

function listQuestions(params: ListQuestionsParams): Promise<ListQuestionsResponse> {
  return api.get<ListQuestionsResponse>('/questions', { params })
}

export function useQuestions(params: ListQuestionsParams) {
  return useQuery({
    queryKey: ['question-bank', 'questions', 'list', params],
    queryFn: () => listQuestions(params),
    placeholderData: keepPreviousData,
  })
}

function getQuestionDetail(id: string): Promise<QuestionWithCurrentVersion> {
  return api.get<QuestionWithCurrentVersion>(`/questions/${id}`)
}

export function useQuestionDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['question-bank', 'questions', 'detail', id],
    queryFn: () => getQuestionDetail(id as string),
    enabled: Boolean(id),
  })
}

export interface QuestionPickerItem {
  id: string
  questionVersionId: string
  label: string
}

const QUESTION_TEXT_TRUNCATE_LENGTH = 80

// Backing hook for AttachQuestionForm's combobox. GET /questions returns
// bare rows with no question text at all (confirmed against question-bank.
// types.ts: ListQuestionsResult is Question[], and question_text lives on
// question_versions, only joined in by GET /questions/:id's
// QuestionWithCurrentVersion). listQuestionsQuerySchema also has no
// `search`/`q` param (confirmed by reading the real schema). So a real
// "type part of the question text" combobox needs two steps: (1) a bounded
// bare list to know which question ids exist for the current type/
// difficulty/status filters, then (2) one detail fetch per row to see its
// text — each cached individually by TanStack Query via useQueries, so
// re-opening the picker or reusing the same id elsewhere doesn't refetch.
// This is a stopgap for picker discoverability, not real server-side
// search — that would need a schema change out of this phase's scope (see
// AttachQuestionForm.tsx for the deliberately small pageSize this trades
// against). A question whose detail fetch hasn't resolved yet (or failed)
// is simply left out of `items` rather than blocking the whole list.
export function useQuestionsForPicker(params: ListQuestionsParams) {
  const list = useQuestions(params)
  const ids = list.data?.items.map((q) => q.id) ?? []

  const details = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['question-bank', 'questions', 'detail', id] as const,
      queryFn: () => getQuestionDetail(id),
      enabled: list.isSuccess,
    })),
  })

  const items: QuestionPickerItem[] = (list.data?.items ?? []).flatMap((question, index) => {
    const detail = details[index]?.data
    if (!question.currentVersionId || !detail?.currentVersion) return []
    const text = detail.currentVersion.questionText
    const truncated =
      text.length > QUESTION_TEXT_TRUNCATE_LENGTH
        ? `${text.slice(0, QUESTION_TEXT_TRUNCATE_LENGTH)}…`
        : text
    return [
      {
        id: question.id,
        questionVersionId: question.currentVersionId,
        label: `${truncated} (${question.type}, ${question.difficulty})`,
      },
    ]
  })

  return {
    items,
    isLoading: list.isPending || (ids.length > 0 && details.every((d) => d.isPending)),
    isError: list.isError,
  }
}

function listQuestionPools(params: ListQuestionPoolsParams): Promise<ListQuestionPoolsResponse> {
  return api.get<ListQuestionPoolsResponse>('/question-pools', { params })
}

export function useQuestionPools(params: ListQuestionPoolsParams) {
  return useQuery({
    queryKey: ['question-bank', 'question-pools', 'list', params],
    queryFn: () => listQuestionPools(params),
    placeholderData: keepPreviousData,
  })
}

// Same enrichment shape as useQuestionsForPicker above (list has no text,
// GET /questions/:id does) but returns full rows for QuestionListPage's
// columns instead of one flattened combobox label.
export function useQuestionsWithText(params: ListQuestionsParams) {
  const list = useQuestions(params)
  const ids = list.data?.items.map((q) => q.id) ?? []

  const details = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['question-bank', 'questions', 'detail', id] as const,
      queryFn: () => getQuestionDetail(id),
      enabled: list.isSuccess,
    })),
  })

  const items: QuestionWithText[] = (list.data?.items ?? []).map((question, index) => ({
    id: question.id,
    type: question.type,
    difficulty: question.difficulty,
    status: question.status,
    questionText: details[index]?.data?.currentVersion?.questionText ?? null,
    createdAt: question.createdAt,
  }))

  return {
    items,
    total: list.data?.total ?? 0,
    page: list.data?.page ?? params.page ?? 1,
    pageSize: list.data?.pageSize ?? params.pageSize ?? 20,
    isPending: list.isPending,
    isError: list.isError,
    isFetching: list.isFetching || details.some((d) => d.isFetching),
  }
}

// --- Question categories / topics / tags — confirmed as real, existing
// backend endpoints (GET /question-categories, /question-topics,
// /question-tags, all gated by the same QUESTION_BANK_MANAGE permission
// as /questions itself — schema.sql seeds no dedicated questions.view key
// at all, so read and write share one permission tier here), not assumed.

function listCategories(
  params: ListQuestionCategoriesParams,
): Promise<ListQuestionCategoriesResponse> {
  return api.get<ListQuestionCategoriesResponse>('/question-categories', { params })
}

export function useCategories(params: ListQuestionCategoriesParams) {
  return useQuery({
    queryKey: ['question-bank', 'categories', 'list', params],
    queryFn: () => listCategories(params),
    placeholderData: keepPreviousData,
  })
}

function listTopics(params: ListQuestionTopicsParams): Promise<ListQuestionTopicsResponse> {
  return api.get<ListQuestionTopicsResponse>('/question-topics', { params })
}

export function useTopics(params: ListQuestionTopicsParams) {
  return useQuery({
    queryKey: ['question-bank', 'topics', 'list', params],
    queryFn: () => listTopics(params),
    placeholderData: keepPreviousData,
  })
}

function listTags(params: ListQuestionTagsParams): Promise<ListQuestionTagsResponse> {
  return api.get<ListQuestionTagsResponse>('/question-tags', { params })
}

export function useTags(params: ListQuestionTagsParams) {
  return useQuery({
    queryKey: ['question-bank', 'tags', 'list', params],
    queryFn: () => listTags(params),
    placeholderData: keepPreviousData,
  })
}

// --- Question creation (this phase) ---

function createQuestion(input: CreateQuestionInput): Promise<QuestionWithCurrentVersion> {
  return api.post<QuestionWithCurrentVersion>('/questions', input)
}

export function useCreateQuestion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createQuestion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['question-bank', 'questions', 'list'] })
    },
  })
}

// --- Approval workflow (this phase) ---
// draft/rejected --submit--> pending_review --approve--> approved
//                                            \--reject--> rejected --submit--> pending_review
// (loops back) — confirmed by reading question-bank.service.ts's
// SUBMITTABLE_STATUSES and approveQuestion/rejectQuestion directly, not
// assumed from an earlier session. Simpler than assessments' five-action
// workflow (no schedule step, no required date fields) — all three actions
// here take only an optional `notes` string, same ApprovalActionInput shape
// throughout, matching the real approvalActionSchema on the backend.

function submitQuestion(id: string, input: ApprovalActionInput): Promise<Question> {
  return api.post<Question>(`/questions/${id}/submit`, input)
}

export function useSubmitQuestion(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ApprovalActionInput) => submitQuestion(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['question-bank', 'questions', 'detail', id] })
      queryClient.invalidateQueries({ queryKey: ['question-bank', 'questions', 'list'] })
    },
  })
}

// Gated by questions.approve on the backend — distinct from questions.
// manage/manage_global, which gates create/submit. The frontend doesn't
// mirror that permission check itself (no per-permission introspection
// exists here, same as WorkflowActions.tsx's precedent for assessments) —
// an unauthorized click still surfaces the backend's real rejection via
// isError, it just isn't hidden pre-emptively.
function approveQuestion(id: string, input: ApprovalActionInput): Promise<Question> {
  return api.post<Question>(`/questions/${id}/approve`, input)
}

export function useApproveQuestion(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ApprovalActionInput) => approveQuestion(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['question-bank', 'questions', 'detail', id] })
      queryClient.invalidateQueries({ queryKey: ['question-bank', 'questions', 'list'] })
    },
  })
}

function rejectQuestion(id: string, input: ApprovalActionInput): Promise<Question> {
  return api.post<Question>(`/questions/${id}/reject`, input)
}

export function useRejectQuestion(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ApprovalActionInput) => rejectQuestion(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['question-bank', 'questions', 'detail', id] })
      queryClient.invalidateQueries({ queryKey: ['question-bank', 'questions', 'list'] })
    },
  })
}

// --- Question pool creation + criteria (this phase) ---

function createPool(input: CreatePoolInput): Promise<QuestionPool> {
  return api.post<QuestionPool>('/question-pools', input)
}

export function useCreatePool() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createPool,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['question-bank', 'question-pools', 'list'] })
    },
  })
}

// GET /question-pools/:id — the bare pool row (name/description/type/
// category), same shape/naming convention as useQuestionDetail above. Kept
// separate from useResolvePool below: this is a cheap, safe-to-auto-fetch
// metadata read, not the live randomized draw.
function getPoolDetail(id: string): Promise<QuestionPool> {
  return api.get<QuestionPool>(`/question-pools/${id}`)
}

export function usePoolDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['question-bank', 'question-pools', 'detail', id],
    queryFn: () => getPoolDetail(id as string),
    enabled: Boolean(id),
  })
}

function listPoolCriteria(poolId: string): Promise<QuestionPoolCriterion[]> {
  return api.get<QuestionPoolCriterion[]>(`/question-pools/${poolId}/criteria`)
}

export function usePoolCriteria(poolId: string | undefined) {
  return useQuery({
    queryKey: ['question-bank', 'question-pools', 'criteria', poolId],
    queryFn: () => listPoolCriteria(poolId as string),
    enabled: Boolean(poolId),
  })
}

function addCriterion(
  poolId: string,
  input: CreatePoolCriterionInput,
): Promise<QuestionPoolCriterion> {
  return api.post<QuestionPoolCriterion>(`/question-pools/${poolId}/criteria`, input)
}

export function useAddCriterion(poolId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePoolCriterionInput) => addCriterion(poolId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['question-bank', 'question-pools', 'criteria', poolId],
      })
      // A resolution preview taken before this criterion existed is now
      // stale (missing a whole slice of the pool) — drop any cached result
      // rather than let PoolDetailPage show a preview that predates the
      // pool's current criteria set.
      queryClient.removeQueries({
        queryKey: ['question-bank', 'question-pools', 'resolve', poolId],
      })
    },
  })
}

// GET /question-pools/:id/resolve — a deliberate live dry run: every call
// re-runs a real randomized draw against currently-approved questions
// (question-bank.service.ts's resolveQuestionPool), so this is NOT
// auto-fetched on page load like usePoolDetail/usePoolCriteria above.
// enabled: false + PoolDetailPage calling refetch() from an explicit
// "Preview Resolution" button keeps the re-roll opt-in and visible to the
// curator, instead of silently re-rolling on every unrelated re-render.
function resolvePool(id: string): Promise<ResolvedQuestionPool> {
  return api.get<ResolvedQuestionPool>(`/question-pools/${id}/resolve`)
}

export function useResolvePool(id: string) {
  return useQuery({
    queryKey: ['question-bank', 'question-pools', 'resolve', id],
    queryFn: () => resolvePool(id),
    enabled: false,
    retry: false,
  })
}
