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
import type {
  ListTrainersOverviewParams,
  ListTrainersOverviewResponse,
  ListTrainingSessionsParams,
  ListTrainingSessionsResponse,
  TrainerPerformanceResult,
} from './types'

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

// --- Trainers overview / performance (Phase 5, Super Admin dashboard) ---
// Backed by trainers.routes.ts's '/trainers/overview' and
// '/trainers/:trainerId/performance' — both gated by 'trainers.view'
// (Super-Admin-only, confirmed against the backend migration that seeded
// it), matching this feature's Admin-only nav placement.

function listTrainersOverview(
  params: ListTrainersOverviewParams,
): Promise<ListTrainersOverviewResponse> {
  return api.get<ListTrainersOverviewResponse>('/trainers/overview', { params })
}

export function useTrainersOverview(params: ListTrainersOverviewParams) {
  return useQuery({
    queryKey: ['trainers', 'overview', params],
    queryFn: () => listTrainersOverview(params),
    placeholderData: keepPreviousData,
  })
}

function getTrainerPerformance(trainerId: string): Promise<TrainerPerformanceResult> {
  return api.get<TrainerPerformanceResult>(`/trainers/${trainerId}/performance`)
}

export function useTrainerPerformance(trainerId: string | undefined) {
  return useQuery({
    queryKey: ['trainers', 'performance', trainerId],
    queryFn: () => getTrainerPerformance(trainerId as string),
    enabled: Boolean(trainerId),
  })
}
