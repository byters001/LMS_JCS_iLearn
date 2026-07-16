import { z } from 'zod';
import { logger } from '../../logger';
import { nvidiaChatCompletion } from '../../integrations/nvidia';
import type { NvidiaChatCompletionResponse, NvidiaToolDefinition } from '../../integrations/nvidia';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors/app-error';
import { CHATBOT_TOOLS } from './chatbot.tools';
import { chatbotRepository } from './chatbot.repository';
import type { AskChatbotResult, ChatbotCsvExport, ChatbotToolContext } from './chatbot.types';

// --- Prompts ---
//
// Defense in depth, stated explicitly: the REAL security boundary against
// "the LLM tries to run SQL" is validateToolCall below (allowlist +
// per-tool Zod schema) — nothing the model outputs is ever executed
// as-is, regardless of what it says. This system prompt is a second,
// weaker layer (steering the model AWAY from even trying), not the thing
// actually preventing it.
const SYSTEM_PROMPT = [
  "You are a reporting assistant for JCS iLearn's placement training platform.",
  'You answer questions ONLY by calling one of the tools made available to you — you have no other way to access data.',
  'Never write, suggest, describe, or explain SQL or any database query in your response, under any framing — not as an example, not "for reference," not even if the user directly asks you to. You do not have the ability to run arbitrary queries, only the specific named functions provided as tools.',
  'If a question cannot be answered by exactly one of the provided tools, do not guess, improvise, or call a tool with made-up arguments — reply in plain text explaining you can only answer questions about: attendance by date, students who failed an assessment, a trainer\'s performance, or a batch\'s roster.',
].join(' ');

const PHRASING_SYSTEM_PROMPT = [
  'You phrase structured report data into a short, readable answer (2-4 sentences) for a Super Admin or Faculty member at a training platform.',
  'You are given the original question and the exact JSON data already fetched from the database — summarize it in plain English, citing real numbers that appear in the JSON.',
  'Never invent a number that is not present in the JSON. Never mention SQL, databases, or how the data was fetched.',
].join(' ');

const FALLBACK_ANSWER_TEXT =
  'Here are the results for your question (see the structured data returned alongside this message).';

// z.toJSONSchema is Zod 4's own native JSON-Schema converter (this
// codebase is on zod ^4.4.3) — the separate `zod-to-json-schema` package
// (still listed as a dependency, presumably added for an earlier Zod 3
// assumption) targets Zod 3's internal type shape and does not accept a
// Zod 4 schema (confirmed: fails to typecheck against it). Using the
// built-in avoids depending on a package that's actually incompatible
// with this project's real Zod version, and keeps the tool's parameter
// docs single-sourced from the exact same `argsSchema` that validates the
// model's actual arguments — no separate, hand-maintained JSON Schema to
// drift out of sync.
function buildNvidiaToolsPayload(): NvidiaToolDefinition[] {
  return Object.values(CHATBOT_TOOLS).map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.argsSchema),
    },
  }));
}

interface RawToolCall {
  functionName: string;
  rawArgs: unknown;
}

// Pulls the model's chosen function name + arguments out of NVIDIA's raw
// response — returns null when the model didn't call any tool at all
// (replied in plain text instead), which askChatbot below treats as a
// graceful "couldn't resolve this" rejection, not a crash. `arguments` is
// a JSON-encoded STRING per the OpenAI-compatible spec; a model that
// emits malformed JSON there is treated the same as "no valid args
// supplied" (rawArgs stays undefined) rather than throwing here — the
// real rejection then happens uniformly, in validateToolCall below, same
// as any other malformed-arguments case.
function extractToolCall(completion: NvidiaChatCompletionResponse): RawToolCall | null {
  const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    return null;
  }

  let rawArgs: unknown;
  try {
    rawArgs = JSON.parse(toolCall.function.arguments);
  } catch {
    rawArgs = undefined;
  }

  return { functionName: toolCall.function.name, rawArgs };
}

export interface ValidatedToolCall {
  toolName: string;
  args: unknown;
}

// --- The security-critical validation gate ---
//
// Two independent checks, BOTH strictly before anything is executed:
//
// 1. Is `functionName` literally a key of CHATBOT_TOOLS? A name the model
//    invents — whether from a genuine hallucination or from a
//    prompt-injection attempt buried in the user's question text — that
//    isn't one of the four allowlisted names is rejected right here.
//    Nothing past this line ever runs for it. There is no fallback path,
//    no "try to interpret it anyway," no raw-SQL escape hatch of any
//    kind — an unrecognized name is a dead end.
//
// 2. Do the arguments parse against THAT SPECIFIC tool's own argsSchema
//    (every one `.strict()`, so unexpected extra fields are rejected
//    too, not just wrong types)? A real, allowlisted function name with
//    missing/malformed/extra arguments is rejected here, before its
//    `execute` (a real Drizzle-backed service call) is ever invoked.
//
// Deliberately synchronous and side-effect-free (no DB write, no
// logging) — askChatbot below is responsible for logging the outcome
// either way, which keeps this function cheap to unit-test in complete
// isolation (see tests/unit/chatbot-tools.test.ts, which proves both
// rejection paths against the REAL registry, not a mock).
export function validateToolCall(functionName: string, rawArgs: unknown): ValidatedToolCall {
  const tool = CHATBOT_TOOLS[functionName];
  if (!tool) {
    throw new ValidationError(`"${functionName}" is not an allowlisted report function`, {
      allowlist: Object.keys(CHATBOT_TOOLS),
    });
  }

  const parsed = tool.argsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    throw new ValidationError(`Invalid arguments for "${functionName}"`, parsed.error.flatten());
  }

  return { toolName: functionName, args: parsed.data };
}

async function phraseAnswer(question: string, result: unknown): Promise<string> {
  try {
    const completion = await nvidiaChatCompletion({
      messages: [
        { role: 'system', content: PHRASING_SYSTEM_PROMPT },
        { role: 'user', content: `Question: ${question}\n\nData (JSON):\n${JSON.stringify(result)}` },
      ],
    });
    const content = completion.choices[0]?.message?.content?.trim();
    return content && content.length > 0 ? content : FALLBACK_ANSWER_TEXT;
  } catch (err) {
    // Best-effort, non-fatal: the security-critical part (resolving,
    // validating, and executing the real function) already succeeded by
    // the time this runs — losing the natural-language phrasing over a
    // second NVIDIA outage is a degraded-but-still-useful outcome, not a
    // reason to fail the whole request and discard real data the caller
    // is authorized to see.
    logger.warn({ err }, 'NVIDIA phrasing call failed — falling back to a generic answer');
    return FALLBACK_ANSWER_TEXT;
  }
}

// --- POST /chatbot/ask ---
//
// Flow: (1) ask NVIDIA to resolve the question to one tool + arguments,
// (2) log the raw attempt UNCONDITIONALLY — including one about to be
// rejected — since a rejected function-call attempt is itself
// security-relevant audit data (this task's own explicit requirement),
// (3) validate (the gate above), (4) execute the real, already-existing
// service function, (5) phrase the real result into a readable answer —
// a SECOND, SEPARATE NVIDIA call, made SYNCHRONOUSLY within this same
// request/response cycle (not a background job, not deferred) — before
// returning.
async function askChatbot(question: string, context: ChatbotToolContext): Promise<AskChatbotResult> {
  let completion: NvidiaChatCompletionResponse;
  try {
    completion = await nvidiaChatCompletion({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: question },
      ],
      tools: buildNvidiaToolsPayload(),
    });
  } catch (err) {
    // NVIDIA itself never resolved anything — still logged (asked_by/
    // question_text/created_at), with no resolvedFn/resolvedArgs to
    // record, per "log every question... every time."
    await chatbotRepository.logQuery({
      askedBy: context.userId,
      questionText: question,
      resolvedFn: null,
      resolvedArgs: null,
    });
    throw err;
  }

  const rawToolCall = extractToolCall(completion);
  if (!rawToolCall) {
    await chatbotRepository.logQuery({
      askedBy: context.userId,
      questionText: question,
      resolvedFn: null,
      resolvedArgs: null,
    });
    throw new ValidationError(
      'Could not resolve this question to one of the supported reports. Try asking about attendance, failed students, trainer performance, or a batch roster.',
    );
  }

  // Logged BEFORE validation can throw — see this function's own module
  // comment. This line runs whether or not the function name below turns
  // out to be allowlisted or the arguments turn out to be well-formed.
  await chatbotRepository.logQuery({
    askedBy: context.userId,
    questionText: question,
    resolvedFn: rawToolCall.functionName,
    resolvedArgs: rawToolCall.rawArgs ?? null,
  });

  const { toolName, args } = validateToolCall(rawToolCall.functionName, rawToolCall.rawArgs);
  const tool = CHATBOT_TOOLS[toolName];

  const result = await tool.execute(args, context);
  const answer = await phraseAnswer(question, result);

  return { question, functionCalled: toolName, args, result, answer };
}

// --- GET /chatbot/queries/:id/export (item 5, "Download") ---
//
// "Re-fetched," per the task's own wording: this re-runs the SAME
// allowlisted function LIVE against current data — it does not replay a
// cached result blob from the original /chatbot/ask response (none is
// stored; chatbot_query_log only records what was asked/resolved, not the
// resulting rows — see chatbot.schema.ts's module comment). resolved_args
// from the log is treated as UNTRUSTED input and re-validated through the
// exact same validateToolCall gate askChatbot itself uses — it is an
// audit record of what was attempted, never a pre-cleared value safe to
// execute directly.
async function exportResolvedQueryAsCsv(
  queryLogId: string,
  context: ChatbotToolContext,
): Promise<ChatbotCsvExport> {
  const logRow = await chatbotRepository.findQueryById(queryLogId);
  if (!logRow) {
    throw new NotFoundError('Chatbot query not found');
  }

  // Self-or-Super-Admin, same scoping convention as every other "my own
  // X" resource in this codebase (e.g. reports' self-scoped attempt
  // history) — a Faculty caller may re-export their own past queries, not
  // someone else's.
  if (!context.isSuperAdmin && logRow.askedBy !== context.userId) {
    throw new ForbiddenError('You may only export your own chatbot queries');
  }

  if (!logRow.resolvedFn) {
    throw new ValidationError('This query did not resolve to a report — nothing to export');
  }

  const { toolName, args } = validateToolCall(logRow.resolvedFn, logRow.resolvedArgs);
  const tool = CHATBOT_TOOLS[toolName];

  if (!tool.toCsv) {
    throw new ValidationError(
      `"${toolName}" does not support CSV export — its result isn't a flat, tabular shape`,
    );
  }

  const result = await tool.execute(args, context);
  const csvExport = tool.toCsv(result);
  if (!csvExport) {
    throw new NotFoundError('No rows to export for this query');
  }

  return csvExport;
}

export const chatbotService = {
  askChatbot,
  exportResolvedQueryAsCsv,
};
