// TanStack Query hooks for the "chatbot" feature, calling the shared api/
// client. This is the only file in this feature allowed to import from
// api/ — the one exception is downloadChatbotQueryExport below, which
// mirrors features/students/api.ts's downloadStudentsExport (see that
// function's own comment for why a raw-CSV endpoint can't go through the
// shared client).
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { env } from '@/lib/env'
import { triggerBlobDownload } from '@/lib/spreadsheet'
import { useAuthStore } from '@/store/authStore'
import type { AskChatbotResult, ListChatbotQueriesParams, ListChatbotQueriesResult } from './types'

function askChatbot(question: string): Promise<AskChatbotResult> {
  return api.post<AskChatbotResult>('/chatbot/ask', { question })
}

export function useAskChatbot() {
  return useMutation({
    mutationFn: askChatbot,
  })
}

// --- Admin audit log (this phase) — GET /chatbot/queries, super_admin
// only (chatbot.audit_log). The route itself is the real gate; this hook
// has no client-side role check of its own, same as every other feature
// hook in this codebase — an unauthorized call still surfaces the
// backend's real 403 via isError, it isn't hidden pre-emptively here.
function listChatbotQueries(params: ListChatbotQueriesParams): Promise<ListChatbotQueriesResult> {
  return api.get<ListChatbotQueriesResult>('/chatbot/queries', { params })
}

export function useChatbotQueries(params: ListChatbotQueriesParams) {
  return useQuery({
    queryKey: ['chatbot', 'queries', 'list', params],
    queryFn: () => listChatbotQueries(params),
    placeholderData: keepPreviousData,
  })
}

function parseFilenameFromContentDisposition(header: string | null, fallback: string): string {
  const match = header?.match(/filename="([^"]+)"/)
  return match?.[1] ?? fallback
}

// Deliberately NOT routed through the shared `api` client — same reasoning
// as features/students/api.ts's downloadStudentsExport: the backend sends
// a raw CSV file for this endpoint (chatbot.controller.ts's exportQueryCsv),
// not the {success,data} envelope api/index.ts's response interceptor
// unconditionally expects. Plain fetch, manual Authorization header.
export async function downloadChatbotQueryExport(
  queryLogId: string,
  fallbackFilename: string,
): Promise<void> {
  const accessToken = useAuthStore.getState().accessToken
  const response = await fetch(`${env.apiBaseUrl}/chatbot/queries/${queryLogId}/export`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    credentials: 'include',
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error?.message ?? 'Failed to export this result.')
  }

  const csvText = await response.text()
  const filename = parseFilenameFromContentDisposition(
    response.headers.get('content-disposition'),
    fallbackFilename,
  )
  triggerBlobDownload(new Blob([csvText], { type: 'text/csv;charset=utf-8' }), filename)
}
