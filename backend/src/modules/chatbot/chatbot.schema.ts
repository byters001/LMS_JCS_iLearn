import { z } from 'zod';

// This is the ONLY free-text surface the whole chatbot feature exposes —
// everything past this point (which function, which arguments) is
// resolved by the LLM into structured JSON and re-validated against
// modules/chatbot/chatbot.tools.ts's allowlist before anything executes.
// A max length bounds prompt-injection-via-length and keeps the NVIDIA
// call itself cheap; it is NOT a security boundary by itself — the real
// boundary is the allowlist + per-tool Zod validation in chatbot.service.ts.
const MAX_QUESTION_LENGTH = 1000;

export const askChatbotSchema = z
  .object({
    question: z
      .string()
      .min(1, 'question is required')
      .max(MAX_QUESTION_LENGTH, `question must be ${MAX_QUESTION_LENGTH} characters or fewer`),
  })
  .strict();

export const chatbotQueryIdParamsSchema = z
  .object({
    id: z.string().uuid('id must be a valid UUID'),
  })
  .strict();

export type AskChatbotInput = z.infer<typeof askChatbotSchema>;
export type ChatbotQueryIdParams = z.infer<typeof chatbotQueryIdParamsSchema>;
