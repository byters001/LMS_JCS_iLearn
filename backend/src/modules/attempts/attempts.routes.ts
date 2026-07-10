import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { submitCodeSchema, type SubmitCodeInput } from '../coding/coding.schema';
import { idempotency } from '../../plugins/idempotency.plugin';
import { ASSESSMENT_SUBMIT_RATE_LIMIT_CONFIG } from '../../plugins/rate-limit.plugin';
import { requirePermission } from '../../rbac/require-permission';
import { ValidationError } from '../../shared/errors/app-error';
import { attemptsController } from './attempts.controller';
import {
  attemptIdParamsSchema,
  attemptResponseParamsSchema,
  createRetakeRequestSchema,
  listMyAttemptsQuerySchema,
  listRetakeRequestsQuerySchema,
  recordProctoringEventSchema,
  retakeRequestIdParamsSchema,
  startAttemptSchema,
  submitResponseSchema,
  type AttemptIdParams,
  type AttemptResponseParams,
  type CreateRetakeRequestInput,
  type ListMyAttemptsQuery,
  type ListRetakeRequestsQuery,
  type RecordProctoringEventInput,
  type RetakeRequestIdParams,
  type StartAttemptInput,
  type SubmitResponseInput,
} from './attempts.schema';

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

// --- Permission model (item 6) ---
// No requirePermission() anywhere in this file, deliberately — see
// attempts.service.ts's module comment for the full reasoning. Every route
// here is gated by fastify.authenticate ONLY (a valid JWT); authorization
// is self-ownership, enforced in the service layer (requireStudentProfile +
// assertOwnsAttempt), because schema.sql seeds the 'student' role with ZERO
// permission keys — requirePermission(<anything>) would reject every
// student unconditionally, and there's no precedent in this codebase for
// granting students a permission key to work around that.

// --- Idempotency-Key (CLAUDE.md non-negotiable #4) ---
// One shared instance, reused across every mutating route below —
// idempotency()'s returned hooks hold no per-route state of their own
// (everything they need lives on `request` per-call), so a single
// `{ required: true }` pair is safe to attach to multiple routes. REQUIRED
// (not optional-but-honored) on all of them: CLAUDE.md's own wording
// already says this is "required" on both the attempts submit route AND
// the coding submit route, and every route it's attached to below is one
// where a silently-missing key would let the exact failure this mechanism
// exists to prevent slip through unguarded — starting an attempt burns a
// scarce attempt_number, submitting a response can double-score,
// finalizing an attempt is a one-way transition, and submitting code
// triggers real, retry-prone Judge0 execution (the single most expensive,
// one-shot mutation in this codebase — see coding.service.ts's
// gradeSubmission). Making the header mandatory is stricter (any client
// that forgets to send it gets a clear 400 instead of a silent gap),
// which is the right trade-off for this class of "payment-like" mutation
// — optional-but-honored would only protect callers who remembered to
// opt in, leaving every other caller exactly as unprotected as before
// this phase.
const attemptIdempotency = idempotency({ required: true });

// --- Staff oversight permission (Part 2, items 2 & 3) ---
// Reuses attempts.reassign (schema.sql's ONLY seeded key for this module,
// granted to Faculty) for BOTH staff-facing surfaces below — viewing
// proctoring events and reviewing (approve/reject) retake requests —
// rather than proposing a new key. Reasoning: reviewing a retake request
// is exactly what attempts.reassign's own seeded description
// ("Reassign/retake an attempt") already names; viewing the proctoring
// evidence that informs that decision is a natural, connected extension
// of the same staff capability (review evidence -> decide), not a
// distinct privilege tier. This also matches this codebase's dominant
// pattern of one coarse-grained key per module rather than splitting
// view-vs-act (e.g. assessments.create already covers both reads and
// writes for that module; questions.manage covers a trainer's full
// question-bank CRUD). A dedicated 'attempts.view' key was considered and
// rejected in favor of this reuse — say so if you'd rather split it.
const ATTEMPTS_REASSIGN = requirePermission('attempts.reassign');

export async function attemptsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: StartAttemptInput }>(
    '/attempts',
    {
      preHandler: [fastify.authenticate, attemptIdempotency.preHandler],
      preValidation: validateBody(startAttemptSchema),
      preSerialization: [attemptIdempotency.preSerialization],
    },
    attemptsController.startAttempt,
  );

  // Self-scoped list — see attempts.service.ts's listMyAttempts.
  fastify.get<{ Querystring: ListMyAttemptsQuery }>(
    '/attempts',
    {
      preHandler: [fastify.authenticate],
      preValidation: validateQuery(listMyAttemptsQuerySchema),
    },
    attemptsController.listMyAttempts,
  );

  fastify.get<{ Params: AttemptIdParams }>(
    '/attempts/:attemptId',
    {
      preHandler: [fastify.authenticate],
      preValidation: validateParams(attemptIdParamsSchema),
    },
    attemptsController.getAttemptById,
  );

  // Reads attempt_question_selections only — never re-resolves live. See
  // attempts.service.ts's getAttemptQuestions.
  fastify.get<{ Params: AttemptIdParams }>(
    '/attempts/:attemptId/questions',
    {
      preHandler: [fastify.authenticate],
      preValidation: validateParams(attemptIdParamsSchema),
    },
    attemptsController.getAttemptQuestions,
  );

  // Rate-limited per-attempt (CLAUDE.md non-negotiable #7: attempts submit
  // routes scoped per assessment/session, not just per-IP) —
  // ASSESSMENT_SUBMIT_RATE_LIMIT_CONFIG's keyGenerator falls back through
  // params.assessmentId ?? params.sessionId ?? params.attemptId, and this
  // route's param is named :attemptId to match that fallback chain (see
  // rate-limit.plugin.ts's own comment flagging this param name as
  // unconfirmed until whoever built this route verified it — confirmed
  // here).
  fastify.put<{ Params: AttemptResponseParams; Body: SubmitResponseInput }>(
    '/attempts/:attemptId/responses/:questionVersionId',
    {
      preHandler: [fastify.authenticate, attemptIdempotency.preHandler],
      preValidation: [
        validateParams(attemptResponseParamsSchema),
        validateBody(submitResponseSchema),
      ],
      preSerialization: [attemptIdempotency.preSerialization],
      config: { rateLimit: ASSESSMENT_SUBMIT_RATE_LIMIT_CONFIG },
    },
    attemptsController.submitResponse,
  );

  // --- Coding submissions (attempts <-> Judge0, via modules/coding) ---
  // Same per-attempt rate limit and REQUIRED Idempotency-Key as the routes
  // around it — this IS "the coding submit route" CLAUDE.md's
  // non-negotiable #4 names explicitly (alongside the attempts submit
  // route below), and the most expensive, one-shot, retry-prone mutation
  // in this codebase (real Judge0 execution across every test case — see
  // coding.service.ts's gradeSubmission). Body validated against
  // modules/coding's own submitCodeSchema (reused here, not redefined) —
  // params reuse attemptResponseParamsSchema since the path shape is
  // identical to the responses route above, just with a /submit-code
  // suffix.
  fastify.post<{ Params: AttemptResponseParams; Body: SubmitCodeInput }>(
    '/attempts/:attemptId/responses/:questionVersionId/submit-code',
    {
      preHandler: [fastify.authenticate, attemptIdempotency.preHandler],
      preValidation: [
        validateParams(attemptResponseParamsSchema),
        validateBody(submitCodeSchema),
      ],
      preSerialization: [attemptIdempotency.preSerialization],
      config: { rateLimit: ASSESSMENT_SUBMIT_RATE_LIMIT_CONFIG },
    },
    attemptsController.submitCode,
  );

  // Same per-attempt rate limit as the responses route above, plus
  // Idempotency-Key (see the module comment above attemptsRoutes) — this
  // is literally "the attempts submit route" CLAUDE.md's non-negotiable #4
  // names by description. finalizeAttempt's WHERE status = 'in_progress'
  // guard (attempts.repository.ts) still independently prevents a
  // double-submit from double-scoring at the DB level; this adds the
  // actual replay-the-cached-response guarantee on top of that.
  fastify.post<{ Params: AttemptIdParams }>(
    '/attempts/:attemptId/submit',
    {
      preHandler: [fastify.authenticate, attemptIdempotency.preHandler],
      preValidation: validateParams(attemptIdParamsSchema),
      preSerialization: [attemptIdempotency.preSerialization],
      config: { rateLimit: ASSESSMENT_SUBMIT_RATE_LIMIT_CONFIG },
    },
    attemptsController.submitAttempt,
  );

  // --- Proctoring events (Part 2) ---
  // Student, self-ownership + in_progress-only gate — see
  // attempts.service.ts's recordProctoringEvent. No Idempotency-Key here
  // (item 4's proctoring-event call): these are high-frequency, low-stakes
  // append-only telemetry (a browser tab could fire many tab_switch/
  // window_blur events per attempt), unlike Part 1's low-frequency,
  // resource-consuming/scoring mutations — a duplicate logged event is
  // harmless, and requiring a fresh client-generated key per tiny
  // telemetry ping would add real client complexity for no corresponding
  // benefit. Not rate-limited either, for the same "not payment-like"
  // reasoning (unlike the responses/submit routes above).
  fastify.post<{ Params: AttemptIdParams; Body: RecordProctoringEventInput }>(
    '/attempts/:attemptId/proctoring-events',
    {
      preHandler: [fastify.authenticate],
      preValidation: [
        validateParams(attemptIdParamsSchema),
        validateBody(recordProctoringEventSchema),
      ],
    },
    attemptsController.recordProctoringEvent,
  );

  // Staff-facing — see the ATTEMPTS_REASSIGN comment above for why this
  // reuses attempts.reassign rather than a new key.
  fastify.get<{ Params: AttemptIdParams }>(
    '/attempts/:attemptId/proctoring-events',
    {
      preHandler: [fastify.authenticate, ATTEMPTS_REASSIGN],
      preValidation: validateParams(attemptIdParamsSchema),
    },
    attemptsController.listProctoringEvents,
  );

  // --- Retake requests (Part 2) ---
  // Student, self-ownership + terminal-attempt-status gate — see
  // attempts.service.ts's createRetakeRequest. Nested under
  // /attempts/:attemptId (not /retake-requests) since creation is always
  // about one specific attempt the student is looking at — contrast with
  // the flat staff worklist below. Idempotency-Key REQUIRED (item 4),
  // same pattern and reasoning as Part 1's mutations: student-submitted,
  // retry-prone, and a duplicate on retry would otherwise only be caught
  // after the fact by the pending-request dedup check in
  // attempts.service.ts (a 409, not silent, but still worth preventing at
  // the transport layer the same way Part 1 does).
  fastify.post<{ Params: AttemptIdParams; Body: CreateRetakeRequestInput }>(
    '/attempts/:attemptId/retake-requests',
    {
      preHandler: [fastify.authenticate, attemptIdempotency.preHandler],
      preValidation: [
        validateParams(attemptIdParamsSchema),
        validateBody(createRetakeRequestSchema),
      ],
      preSerialization: [attemptIdempotency.preSerialization],
    },
    attemptsController.createRetakeRequest,
  );

  // Staff worklist — flat top-level resource (not nested under
  // /attempts), matching how a reviewer works from "what needs review"
  // rather than browsing per-attempt. List/approve/reject are all flat;
  // only creation above is nested. No body schema on approve/reject:
  // assessment_retake_requests has no reviewer-notes column at all (only
  // `reason`, which is student-authored at request-creation time), so
  // there's genuinely nothing to validate — an empty-object schema would
  // only add the same "does an empty POST body parse" edge case Part 1's
  // approval-action routes already carry, for a field that doesn't exist.
  fastify.get<{ Querystring: ListRetakeRequestsQuery }>(
    '/retake-requests',
    {
      preHandler: [fastify.authenticate, ATTEMPTS_REASSIGN],
      preValidation: validateQuery(listRetakeRequestsQuerySchema),
    },
    attemptsController.listRetakeRequests,
  );

  fastify.post<{ Params: RetakeRequestIdParams }>(
    '/retake-requests/:retakeRequestId/approve',
    {
      preHandler: [fastify.authenticate, ATTEMPTS_REASSIGN],
      preValidation: validateParams(retakeRequestIdParamsSchema),
    },
    attemptsController.approveRetakeRequest,
  );

  fastify.post<{ Params: RetakeRequestIdParams }>(
    '/retake-requests/:retakeRequestId/reject',
    {
      preHandler: [fastify.authenticate, ATTEMPTS_REASSIGN],
      preValidation: validateParams(retakeRequestIdParamsSchema),
    },
    attemptsController.rejectRetakeRequest,
  );
}

export default attemptsRoutes;
