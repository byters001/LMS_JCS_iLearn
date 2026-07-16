import type { FastifyReply, FastifyRequest } from 'fastify';
import { buildCsv } from '../../shared/utils/csv.util';
import { UnauthorizedError } from '../../shared/errors/app-error';
import type { ApiSuccessResponse } from '../../shared/types/api-response';
import { chatbotService } from './chatbot.service';
import type { AskChatbotInput, ChatbotQueryIdParams } from './chatbot.schema';
import type { ChatbotToolContext } from './chatbot.types';

// Confirmed against schema.sql: Super Admin's own role assignment always
// has a NULL college_id, and it's the ONLY role that does — the same
// "activeCollegeId === null means a global/Super-Admin grant" precedent
// analytics.service.ts's assertCanAccessBatch and organization.service.ts's
// listBatches both already rely on. Safe to derive isSuperAdmin this way
// specifically HERE because this controller is only ever reached after
// requirePermission('chatbot.query') has already passed, and that
// permission is seeded to exactly two roles (super_admin, faculty) — see
// chatbot.routes.ts.
function requireContext(request: FastifyRequest): ChatbotToolContext {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }
  const activeCollegeId = request.user.activeCollegeId ?? null;
  return {
    userId: request.user.id,
    activeCollegeId,
    isSuperAdmin: activeCollegeId === null,
  };
}

async function ask(
  request: FastifyRequest<{ Body: AskChatbotInput }>,
  reply: FastifyReply,
): Promise<void> {
  const context = requireContext(request);
  const result = await chatbotService.askChatbot(request.body.question, context);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

// Deliberately NOT the {success,data} envelope — same reasoning as
// students.controller.ts's exportStudentsCsv (Phase 3): this sends a raw
// CSV file, which the frontend's shared api/ client can't unwrap through
// its normal response interceptor.
async function exportQueryCsv(
  request: FastifyRequest<{ Params: ChatbotQueryIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const context = requireContext(request);
  const csvExport = await chatbotService.exportResolvedQueryAsCsv(request.params.id, context);
  reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="${csvExport.filename}"`)
    .status(200)
    .send(buildCsv(csvExport.header, csvExport.rows));
}

export const chatbotController = {
  ask,
  exportQueryCsv,
};
