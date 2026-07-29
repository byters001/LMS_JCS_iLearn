import { z } from 'zod';
import { codingLanguageSchema } from '../question-bank/question-bank.schema';

// Reuses question-bank's codingLanguageSchema (validated against
// JUDGE0_LANGUAGE_ID's keys) directly, per the task's explicit
// instruction — not redefined here.
export const submitCodeSchema = z
  .object({
    language: codingLanguageSchema,
    sourceCode: z.string().min(1, 'sourceCode is required'),
    // Per-question time tracking phase — mirrors attempts.schema.ts's
    // submitResponseSchema field of the same name exactly (same column,
    // attempt_responses.time_spent_seconds), so a coding question's Run/
    // Submit action can report elapsed time the same way MCQ/psychometric's
    // save already could at the schema level. Optional: an older/uninstrumented
    // client omitting it is a normal, harmless case, not a validation error.
    timeSpentSeconds: z.coerce.number().int().nonnegative().optional(),
  })
  .strict();

export type SubmitCodeInput = z.infer<typeof submitCodeSchema>;
