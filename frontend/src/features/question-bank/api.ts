// TanStack Query hooks for the "question-bank" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import type {
  ListQuestionPoolsParams,
  ListQuestionPoolsResponse,
  ListQuestionsParams,
  ListQuestionsResponse,
  QuestionWithCurrentVersion,
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
