import { z } from 'zod';
import { codingLanguageSchema } from '../question-bank/question-bank.schema';

// Reuses question-bank's codingLanguageSchema (validated against
// JUDGE0_LANGUAGE_ID's keys) directly, per the task's explicit
// instruction — not redefined here.
export const submitCodeSchema = z
  .object({
    language: codingLanguageSchema,
    sourceCode: z.string().min(1, 'sourceCode is required'),
  })
  .strict();

export type SubmitCodeInput = z.infer<typeof submitCodeSchema>;
