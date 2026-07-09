import type { TrainerProfile } from '../../db/types';
import { usersService } from '../users/users.service';
import { ConflictError, NotFoundError } from '../../shared/errors/app-error';
import { trainersRepository } from './trainers.repository';
import type {
  CreateTrainerProfileInput,
  ListTrainerProfilesQuery,
  UpdateTrainerProfileInput,
} from './trainers.schema';
import type { ListTrainerProfilesResult } from './trainers.types';

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

export const trainersService = {
  listTrainerProfiles,
  findTrainerProfileById,
  createTrainerProfile,
  updateTrainerProfile,
  deleteTrainerProfile,
};
