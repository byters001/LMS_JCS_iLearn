import type { TrainerProfile, TrainingSession } from '../../db/types';
import { analyticsService } from '../analytics/analytics.service';
import { organizationService } from '../organization/organization.service';
import type { TrainerBatchAssignmentRow } from '../organization/organization.types';
import { usersService } from '../users/users.service';
import { ConflictError, NotFoundError } from '../../shared/errors/app-error';
import { trainersRepository } from './trainers.repository';
import type {
  CreateTrainerProfileInput,
  ListTrainerProfilesQuery,
  ListTrainersOverviewQuery,
  ListTrainingSessionsQuery,
  UpdateTrainerProfileInput,
} from './trainers.schema';
import type {
  ListTrainerProfilesResult,
  ListTrainersOverviewResult,
  ListTrainingSessionsResult,
  TrainerOverviewRow,
  TrainerPerformanceBatchSummary,
  TrainerPerformanceResult,
} from './trainers.types';

async function listTrainerProfiles(
  query: ListTrainerProfilesQuery,
): Promise<ListTrainerProfilesResult> {
  const { items, total } = await trainersRepository.listTrainerProfiles({
    collegeId: query.collegeId,
    departmentId: query.departmentId,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

async function findTrainerProfileById(id: string): Promise<TrainerProfile> {
  const trainerProfile = await trainersRepository.findTrainerProfileById(id);
  if (!trainerProfile) {
    throw new NotFoundError('Trainer profile not found');
  }
  return trainerProfile;
}

async function createTrainerProfile(input: CreateTrainerProfileInput): Promise<TrainerProfile> {
  // trainer_profiles.user_id is NOT NULL UNIQUE REFERENCES users(id) in
  // schema.sql — a trainer profile requires an existing user account.
  // This module does not create users itself: no module in this codebase
  // currently exposes user creation at all (users.service.ts has no
  // createUser, auth has no register/signup) — that gap belongs to
  // whichever future phase builds account provisioning, not here. This
  // call throws NotFoundError (an AppError, not a raw DB error) if the
  // given userId doesn't exist.
  await usersService.findById(input.userId);

  // Pre-check for the UNIQUE(user_id) constraint — avoids letting a raw
  // Postgres unique-violation error escape this service.
  const existingProfile = await trainersRepository.findTrainerProfileByUserId(input.userId);
  if (existingProfile) {
    throw new ConflictError('This user already has a trainer profile');
  }

  return trainersRepository.createTrainerProfile(input);
}

async function updateTrainerProfile(
  id: string,
  input: UpdateTrainerProfileInput,
): Promise<TrainerProfile> {
  const existing = await trainersRepository.findTrainerProfileById(id);
  if (!existing) {
    throw new NotFoundError('Trainer profile not found');
  }

  const updated = await trainersRepository.updateTrainerProfile(id, input);
  if (!updated) {
    throw new NotFoundError('Trainer profile not found');
  }
  return updated;
}

async function deleteTrainerProfile(id: string): Promise<void> {
  const existing = await trainersRepository.findTrainerProfileById(id);
  if (!existing) {
    throw new NotFoundError('Trainer profile not found');
  }
  await trainersRepository.deleteTrainerProfile(id);
}

// --- Training sessions ---
// Cross-module read for assessments.service.ts (Part 4) — see
// trainers.repository.ts's findTrainingSessionById comment for why this
// lives here rather than in assessments' own repository. Same
// service-boundary discipline as every other cross-module call in this
// codebase (CLAUDE.md: a module may call another module's SERVICE, never
// its repository) — this is the first time trainers.service.ts is called
// from outside its own module.
async function findTrainingSessionById(id: string): Promise<TrainingSession> {
  const session = await trainersRepository.findTrainingSessionById(id);
  if (!session) {
    throw new NotFoundError('Training session not found');
  }
  return session;
}

// List-only counterpart to findTrainingSessionById above — unblocks
// assessment creation, which had no way to discover valid
// trainingSessionId values. Same pagination-result shape as
// listTrainerProfiles.
async function listTrainingSessions(
  query: ListTrainingSessionsQuery,
): Promise<ListTrainingSessionsResult> {
  const { items, total } = await trainersRepository.listTrainingSessions({
    trainingProgramId: query.trainingProgramId,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

// --- Trainers overview / performance (Phase 5, Super Admin dashboard) ---
//
// "Trainer" here means "a user holding the 'faculty' role" — see
// TrainerOverviewRow's own comment in trainers.types.ts for why this reads
// from users (via usersService.list's existing roleSlug filter), not
// trainer_profiles (which is optional bio/specialization metadata, not
// identity — a faculty user with no profile row is still very much a
// trainer for this dashboard's purposes).
const TRAINER_ROLE_SLUG = 'faculty';

function groupAssignmentsByTrainer(
  assignments: TrainerBatchAssignmentRow[],
): Map<string, TrainerBatchAssignmentRow[]> {
  const grouped = new Map<string, TrainerBatchAssignmentRow[]>();
  for (const assignment of assignments) {
    const existing = grouped.get(assignment.trainerId);
    if (existing) {
      existing.push(assignment);
    } else {
      grouped.set(assignment.trainerId, [assignment]);
    }
  }
  return grouped;
}

// Two queries total regardless of how many trainers are on the page — the
// paginated faculty-user list, then ONE batched assignment lookup for
// just those trainerIds (organizationService.listBatchAssignmentsForTrainers,
// backed by inArray, not one call per trainer) — deliberately not the N+1
// "one request per item" pattern this same Phase 5 brief's frontend half
// flags as a fix target elsewhere.
async function listTrainersOverview(
  query: ListTrainersOverviewQuery,
): Promise<ListTrainersOverviewResult> {
  const { items: trainerUsers, total } = await usersService.list({
    page: query.page,
    pageSize: query.pageSize,
    roleSlug: TRAINER_ROLE_SLUG,
  });

  const trainerIds = trainerUsers.map((user) => user.id);
  const assignments = await organizationService.listBatchAssignmentsForTrainers(trainerIds);
  const assignmentsByTrainer = groupAssignmentsByTrainer(assignments);

  const items: TrainerOverviewRow[] = trainerUsers.map((user) => {
    const trainerAssignments = assignmentsByTrainer.get(user.id) ?? [];
    // Map keyed by id, not a plain array — a trainer assigned to two
    // batches in the SAME college/department should show that
    // college/department once, not once per batch.
    const colleges = new Map(trainerAssignments.map((a) => [a.collegeId, a.collegeName]));
    const departments = new Map(trainerAssignments.map((a) => [a.departmentId, a.departmentName]));

    return {
      trainerId: user.id,
      fullName: user.fullName,
      email: user.email,
      isActive: user.isActive,
      batchCount: trainerAssignments.length,
      colleges: [...colleges.entries()].map(([id, name]) => ({ id, name })),
      departments: [...departments.entries()].map(([id, name]) => ({ id, name })),
    };
  });

  return { items, total, page: query.page, pageSize: query.pageSize };
}

// usersService.findById throws NotFoundError for a nonexistent/deleted
// trainerId — the right failure mode for an invalid path param. Beyond
// that, this deliberately does NOT verify the found user actually holds
// the 'faculty' role: same permissiveness precedent as organization.
// service.ts's assignTrainingProgramTrainer ("a valid trainer just means
// an existing user... whether that user actually holds a trainer-ish role
// is not this scope's concern") — this is an internal, Super-Admin-only
// tool (trainers.routes.ts's trainers.view guard), not a public surface,
// so the cost of that gap is low; flagged here rather than silently
// assumed away.
//
// A trainer with zero batch assignments yet returns an empty
// batches/trend, not a 404 — "no batches assigned" is a legitimate,
// non-error state for a newly onboarded trainer, not a failure.
async function getTrainerPerformance(trainerId: string): Promise<TrainerPerformanceResult> {
  const trainer = await usersService.findById(trainerId);
  const assignments = await organizationService.listBatchAssignmentsForTrainers([trainerId]);

  const batchesById = new Map<string, TrainerPerformanceBatchSummary>();
  for (const assignment of assignments) {
    batchesById.set(assignment.batchId, {
      id: assignment.batchId,
      name: assignment.batchName,
      collegeName: assignment.collegeName,
      departmentName: assignment.departmentName,
    });
  }
  const batches = [...batchesById.values()];

  const trend = await analyticsService.getTrainerPerformanceTrend(batches.map((batch) => batch.id));

  return { trainerId, fullName: trainer.fullName, batches, trend };
}

export const trainersService = {
  listTrainerProfiles,
  findTrainerProfileById,
  createTrainerProfile,
  updateTrainerProfile,
  deleteTrainerProfile,
  findTrainingSessionById,
  listTrainingSessions,
  listTrainersOverview,
  getTrainerPerformance,
};
