// TanStack Query hooks for the "trainers" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
//
// Placement: GET /training-sessions is registered in backend/src/modules/
// trainers/trainers.routes.ts — trainers.schema.ts (db/schema) already owns
// the training_sessions table, and the backend module comments are explicit
// that this is the natural home for the read even though assessments is the
// only current consumer. CLAUDE1.md's features/ mirrors backend modules 1:1,
// so this hook lives here, not in features/assessments/ (the consumer) or
// features/organization/ (a different backend module).
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import type { ListTrainingSessionsParams, ListTrainingSessionsResponse } from './types'

function listTrainingSessions(
  params: ListTrainingSessionsParams,
): Promise<ListTrainingSessionsResponse> {
  return api.get<ListTrainingSessionsResponse>('/training-sessions', { params })
}

export function useTrainingSessions(params: ListTrainingSessionsParams) {
  return useQuery({
    queryKey: ['trainers', 'training-sessions', params],
    queryFn: () => listTrainingSessions(params),
    placeholderData: keepPreviousData,
  })
}
