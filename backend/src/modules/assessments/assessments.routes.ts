import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { requirePermission } from '../../rbac/require-permission';
import { ValidationError } from '../../shared/errors/app-error';
import { assessmentsController } from './assessments.controller';
import {
  assessmentApprovalActionSchema,
  assessmentIdParamsSchema,
  assessmentQuestionIdParamsSchema,
  assessmentSectionIdParamsSchema,
  assessmentSectionPoolIdParamsSchema,
  createAssessmentQuestionSchema,
  createAssessmentSchema,
  createAssessmentSectionPoolSchema,
  createAssessmentSectionSchema,
  listAssessmentApprovalHistoryQuerySchema,
  listAssessmentsQuerySchema,
  listAvailableAssessmentsQuerySchema,
  scheduleAssessmentSchema,
  updateAssessmentQuestionSchema,
  updateAssessmentSchema,
  updateAssessmentSectionSchema,
  type AssessmentApprovalActionInput,
  type AssessmentIdParams,
  type AssessmentQuestionIdParams,
  type AssessmentSectionIdParams,
  type AssessmentSectionPoolIdParams,
  type CreateAssessmentInput,
  type CreateAssessmentQuestionInput,
  type CreateAssessmentSectionInput,
  type CreateAssessmentSectionPoolInput,
  type ListAssessmentApprovalHistoryQuery,
  type ListAssessmentsQuery,
  type ListAvailableAssessmentsQuery,
  type ScheduleAssessmentInput,
  type UpdateAssessmentInput,
  type UpdateAssessmentQuestionInput,
  type UpdateAssessmentSectionInput,
} from './assessments.schema';

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

// Permission mapping (item 5): schema.sql seeds exactly three assessments
// keys — assessments.create, assessments.publish, assessments.approve —
// confirmed via grep against its INSERT INTO permissions block, same check
// as question-bank's audit. No assessments.view key exists (same gap
// question-bank had for questions.view), so — matching that precedent
// exactly — assessments.create is reused as the base key for every
// read/write route below except the three explicitly gated otherwise;
// inventing a new view key here would contradict the "do not invent new
// keys without a genuine gap" instruction when create already fills that
// role by precedent.
//
// assessments.approve gates ONLY approve/reject — the reviewer-tier action
// distinct from assessments.create (author-tier: build + submit your own
// work for review).
//
// assessments.publish gates BOTH schedule and publish — its own seeded
// description is literally "Publish/schedule assessments", so one key
// covering both actions is what schema.sql's authors already intended, not
// a new split invented here.
const ASSESSMENTS_MANAGE = requirePermission('assessments.create');
const ASSESSMENTS_APPROVE = requirePermission('assessments.approve');
const ASSESSMENTS_PUBLISH = requirePermission('assessments.publish');

export async function assessmentsRoutes(fastify: FastifyInstance): Promise<void> {
  // --- Assessments ---

  fastify.get<{ Querystring: ListAssessmentsQuery }>(
    '/assessments',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: validateQuery(listAssessmentsQuerySchema),
    },
    assessmentsController.listAssessments,
  );

  // Student-facing exception to ASSESSMENTS_MANAGE above — deliberately NOT
  // gated by requirePermission at all, same model as attempts.routes.ts's
  // self-scoped routes: schema.sql seeds the 'student' role with ZERO
  // permission keys, so requirePermission(<anything>) would reject every
  // student unconditionally. Authorization here is data-scoped instead —
  // assessments.service.ts's listAvailableAssessments resolves the caller's
  // OWN active batch ids and only returns assessments actually linked to one
  // of them via assessment_batches, never the full platform-wide list
  // listAssessments above returns. Registered as a static path
  // ('/assessments/available'); Fastify's router (find-my-way) matches
  // static routes ahead of parametric ones regardless of registration
  // order, so this can't be shadowed by — or shadow — GET /assessments/:id.
  fastify.get<{ Querystring: ListAvailableAssessmentsQuery }>(
    '/assessments/available',
    {
      preHandler: [fastify.authenticate],
      preValidation: validateQuery(listAvailableAssessmentsQuerySchema),
    },
    assessmentsController.listAvailableAssessments,
  );

  fastify.get<{ Params: AssessmentIdParams }>(
    '/assessments/:id',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: validateParams(assessmentIdParamsSchema),
    },
    assessmentsController.getAssessmentById,
  );

  // Creates the assessments row AND its assessment_batches rows atomically
  // — see assessments.service.ts.
  fastify.post<{ Body: CreateAssessmentInput }>(
    '/assessments',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: validateBody(createAssessmentSchema),
    },
    assessmentsController.createAssessment,
  );

  // Only permitted while status = 'draft' (assertAssessmentEditable) —
  // enforced in the service, same layering as every other business rule in
  // this codebase.
  fastify.patch<{ Params: AssessmentIdParams; Body: UpdateAssessmentInput }>(
    '/assessments/:id',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: [
        validateParams(assessmentIdParamsSchema),
        validateBody(updateAssessmentSchema),
      ],
    },
    assessmentsController.updateAssessment,
  );

  // Soft delete (assessments.deleted_at).
  fastify.delete<{ Params: AssessmentIdParams }>(
    '/assessments/:id',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: validateParams(assessmentIdParamsSchema),
    },
    assessmentsController.deleteAssessment,
  );

  // Read-only — batchIds are set via create/update's body, not this route
  // (see assessments.service.ts's module comment).
  fastify.get<{ Params: AssessmentIdParams }>(
    '/assessments/:id/batches',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: validateParams(assessmentIdParamsSchema),
    },
    assessmentsController.listAssessmentBatches,
  );

  // Composed read: assessment + all sections + each section's resolved
  // questions (manual join or live pool re-run), in one response. Pure
  // composition of getAssessmentById + listAssessmentSections +
  // resolveSectionQuestions — see assessments.service.ts's
  // findFullAssessment. Gated the same as GET /assessments/:id
  // (ASSESSMENTS_MANAGE), not a new permission key.
  fastify.get<{ Params: AssessmentIdParams }>(
    '/assessments/:id/full',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: validateParams(assessmentIdParamsSchema),
    },
    assessmentsController.getFullAssessment,
  );

  // --- Assessment sections ---
  // No deleted_at on assessment_sections — hard delete, lifecycle tied to
  // the parent assessment's cascade (see db/schema/assessments.schema.ts).

  fastify.get<{ Params: AssessmentIdParams }>(
    '/assessments/:id/sections',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: validateParams(assessmentIdParamsSchema),
    },
    assessmentsController.listAssessmentSections,
  );

  fastify.get<{ Params: AssessmentSectionIdParams }>(
    '/assessments/:id/sections/:sectionId',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: validateParams(assessmentSectionIdParamsSchema),
    },
    assessmentsController.getAssessmentSectionById,
  );

  fastify.post<{ Params: AssessmentIdParams; Body: CreateAssessmentSectionInput }>(
    '/assessments/:id/sections',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: [
        validateParams(assessmentIdParamsSchema),
        validateBody(createAssessmentSectionSchema),
      ],
    },
    assessmentsController.createAssessmentSection,
  );

  // selection_mode excluded from the update surface — see
  // updateAssessmentSectionSchema's comment in assessments.schema.ts.
  fastify.patch<{ Params: AssessmentSectionIdParams; Body: UpdateAssessmentSectionInput }>(
    '/assessments/:id/sections/:sectionId',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: [
        validateParams(assessmentSectionIdParamsSchema),
        validateBody(updateAssessmentSectionSchema),
      ],
    },
    assessmentsController.updateAssessmentSection,
  );

  fastify.delete<{ Params: AssessmentSectionIdParams }>(
    '/assessments/:id/sections/:sectionId',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: validateParams(assessmentSectionIdParamsSchema),
    },
    assessmentsController.deleteAssessmentSection,
  );

  // --- Assessment questions (manual selection_mode) ---
  // Rejected with a 422 (ValidationError) at the service layer if the
  // target section's selection_mode isn't 'manual' — see
  // assessments.service.ts's assertSelectionMode.

  fastify.get<{ Params: AssessmentSectionIdParams }>(
    '/assessments/:id/sections/:sectionId/questions',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: validateParams(assessmentSectionIdParamsSchema),
    },
    assessmentsController.listAssessmentQuestions,
  );

  fastify.post<{ Params: AssessmentSectionIdParams; Body: CreateAssessmentQuestionInput }>(
    '/assessments/:id/sections/:sectionId/questions',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: [
        validateParams(assessmentSectionIdParamsSchema),
        validateBody(createAssessmentQuestionSchema),
      ],
    },
    assessmentsController.createAssessmentQuestion,
  );

  fastify.patch<{ Params: AssessmentQuestionIdParams; Body: UpdateAssessmentQuestionInput }>(
    '/assessments/:id/sections/:sectionId/questions/:questionId',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: [
        validateParams(assessmentQuestionIdParamsSchema),
        validateBody(updateAssessmentQuestionSchema),
      ],
    },
    assessmentsController.updateAssessmentQuestion,
  );

  fastify.delete<{ Params: AssessmentQuestionIdParams }>(
    '/assessments/:id/sections/:sectionId/questions/:questionId',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: validateParams(assessmentQuestionIdParamsSchema),
    },
    assessmentsController.deleteAssessmentQuestion,
  );

  // --- Assessment section pools (pool selection_mode) ---
  // No PATCH — pure junction row, same treatment as question-bank's
  // question_topic_map/question_tag_map (create/delete only).

  fastify.get<{ Params: AssessmentSectionIdParams }>(
    '/assessments/:id/sections/:sectionId/pools',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: validateParams(assessmentSectionIdParamsSchema),
    },
    assessmentsController.listAssessmentSectionPools,
  );

  fastify.post<{ Params: AssessmentSectionIdParams; Body: CreateAssessmentSectionPoolInput }>(
    '/assessments/:id/sections/:sectionId/pools',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: [
        validateParams(assessmentSectionIdParamsSchema),
        validateBody(createAssessmentSectionPoolSchema),
      ],
    },
    assessmentsController.createAssessmentSectionPool,
  );

  fastify.delete<{ Params: AssessmentSectionPoolIdParams }>(
    '/assessments/:id/sections/:sectionId/pools/:poolId',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: validateParams(assessmentSectionPoolIdParamsSchema),
    },
    assessmentsController.deleteAssessmentSectionPool,
  );

  // --- Resolve ---
  // Read-only dry run: for 'manual' sections a plain join, for 'pool'
  // sections a live re-run of question-bank's resolveQuestionPool per
  // attached pool. See assessments.service.ts's resolveSectionQuestions.
  fastify.get<{ Params: AssessmentSectionIdParams }>(
    '/assessments/:id/sections/:sectionId/resolve',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: validateParams(assessmentSectionIdParamsSchema),
    },
    assessmentsController.resolveSectionQuestions,
  );

  // --- Approval workflow ---
  // draft --submit--> review --approve--> approved --schedule--> scheduled --publish--> live
  //                          \--reject--> draft
  // See assessments.service.ts for the full state machine and why this is
  // five dedicated action endpoints rather than a generic status PATCH.

  fastify.post<{ Params: AssessmentIdParams; Body: AssessmentApprovalActionInput }>(
    '/assessments/:id/submit',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: [
        validateParams(assessmentIdParamsSchema),
        validateBody(assessmentApprovalActionSchema),
      ],
    },
    assessmentsController.submitAssessment,
  );

  fastify.post<{ Params: AssessmentIdParams; Body: AssessmentApprovalActionInput }>(
    '/assessments/:id/approve',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_APPROVE],
      preValidation: [
        validateParams(assessmentIdParamsSchema),
        validateBody(assessmentApprovalActionSchema),
      ],
    },
    assessmentsController.approveAssessment,
  );

  fastify.post<{ Params: AssessmentIdParams; Body: AssessmentApprovalActionInput }>(
    '/assessments/:id/reject',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_APPROVE],
      preValidation: [
        validateParams(assessmentIdParamsSchema),
        validateBody(assessmentApprovalActionSchema),
      ],
    },
    assessmentsController.rejectAssessment,
  );

  // Body is scheduleAssessmentSchema, NOT assessmentApprovalActionSchema —
  // schedule is the only action that also takes startAt/endAt, required in
  // this same call. See assessments.schema.ts's scheduleAssessmentSchema
  // and assessments.service.ts's scheduleAssessment for why: PATCH
  // /assessments/:id can't ever reach this assessment while it's callable
  // (assertAssessmentEditable only allows status='draft'; schedule only
  // allows status='approved'), so scheduling is the only place these two
  // fields can ever be set.
  fastify.post<{ Params: AssessmentIdParams; Body: ScheduleAssessmentInput }>(
    '/assessments/:id/schedule',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_PUBLISH],
      preValidation: [
        validateParams(assessmentIdParamsSchema),
        validateBody(scheduleAssessmentSchema),
      ],
    },
    assessmentsController.scheduleAssessment,
  );

  fastify.post<{ Params: AssessmentIdParams; Body: AssessmentApprovalActionInput }>(
    '/assessments/:id/publish',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_PUBLISH],
      preValidation: [
        validateParams(assessmentIdParamsSchema),
        validateBody(assessmentApprovalActionSchema),
      ],
    },
    assessmentsController.publishAssessment,
  );

  // Gated the same as other assessments reads (ASSESSMENTS_MANAGE), not
  // ASSESSMENTS_APPROVE — viewing the audit trail is a read concern, not an
  // approval action. Same call as question-bank's approval-history route.
  fastify.get<{ Params: AssessmentIdParams; Querystring: ListAssessmentApprovalHistoryQuery }>(
    '/assessments/:id/approval-history',
    {
      preHandler: [fastify.authenticate, ASSESSMENTS_MANAGE],
      preValidation: [
        validateParams(assessmentIdParamsSchema),
        validateQuery(listAssessmentApprovalHistoryQuerySchema),
      ],
    },
    assessmentsController.listAssessmentApprovalHistory,
  );
}

export default assessmentsRoutes;
