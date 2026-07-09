import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { requirePermission } from '../../rbac/require-permission';
import { ValidationError } from '../../shared/errors/app-error';
import { studentsController } from './students.controller';
import {
  createStudentProfileSchema,
  listStudentProfilesQuerySchema,
  studentProfileIdParamsSchema,
  updateStudentProfileSchema,
  type CreateStudentProfileInput,
  type ListStudentProfilesQuery,
  type StudentProfileIdParams,
  type UpdateStudentProfileInput,
} from './students.schema';

function validateQuery(schema: ZodTypeAny) {
  return async (request: FastifyRequest): Promise<void> => {
    const parsed = schema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError('Invalid query parameters', parsed.error.flatten());
    }
    request.query = parsed.data;
  };
}

function validateParams(schema: ZodTypeAny) {
  return async (request: FastifyRequest): Promise<void> => {
    const parsed = schema.safeParse(request.params);
    if (!parsed.success) {
      throw new ValidationError('Invalid route parameters', parsed.error.flatten());
    }
    request.params = parsed.data;
  };
}

function validateBody(schema: ZodTypeAny) {
  return async (request: FastifyRequest): Promise<void> => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }
    request.body = parsed.data;
  };
}

// 'students.view' / 'students.manage' — NEW keys, confirmed absent from
// schema.sql's seed data by grep (same situation as trainers.* before
// them). Same view/manage split precedent as users.view/users.edit,
// colleges.view/colleges.manage, and trainers.view/trainers.manage —
// student_profiles is a substantive profile entity, not a thin join table.
// Seeded via a --custom drizzle-kit migration (see
// drizzle/migrations/0005_add-students-permissions.sql), same mechanism as
// 0003 for trainers — not a hand-written patch.
//
// DELETE /student-profiles/:id archives rather than physically deleting
// (see students.service.ts/students.repository.ts) — kept as the DELETE
// verb regardless, matching how colleges/departments' DELETE routes also
// perform a soft-delete update under the hood rather than a literal SQL
// DELETE. The HTTP semantics ("remove from active use") are the same
// either way.
export async function studentsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: ListStudentProfilesQuery }>(
    '/student-profiles',
    {
      preHandler: [fastify.authenticate, requirePermission('students.view')],
      preValidation: validateQuery(listStudentProfilesQuerySchema),
    },
    studentsController.listStudentProfiles,
  );

  fastify.get<{ Params: StudentProfileIdParams }>(
    '/student-profiles/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('students.view')],
      preValidation: validateParams(studentProfileIdParamsSchema),
    },
    studentsController.getStudentProfileById,
  );

  fastify.post<{ Body: CreateStudentProfileInput }>(
    '/student-profiles',
    {
      preHandler: [fastify.authenticate, requirePermission('students.manage')],
      preValidation: validateBody(createStudentProfileSchema),
    },
    studentsController.createStudentProfile,
  );

  fastify.patch<{ Params: StudentProfileIdParams; Body: UpdateStudentProfileInput }>(
    '/student-profiles/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('students.manage')],
      preValidation: [
        validateParams(studentProfileIdParamsSchema),
        validateBody(updateStudentProfileSchema),
      ],
    },
    studentsController.updateStudentProfile,
  );

  fastify.delete<{ Params: StudentProfileIdParams }>(
    '/student-profiles/:id',
    {
      preHandler: [fastify.authenticate, requirePermission('students.manage')],
      preValidation: validateParams(studentProfileIdParamsSchema),
    },
    studentsController.archiveStudentProfile,
  );
}

export default studentsRoutes;
