// OpenAI-compatible chat-completions shapes — NVIDIA's NIM API (the
// endpoint env.NVIDIA_BASE_URL points at) speaks this same wire format,
// so these types mirror it directly rather than inventing a
// NVIDIA-specific shape.

export interface NvidiaToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    // A JSON Schema object (produced by zod-to-json-schema from each
    // chatbot tool's own Zod argsSchema — see modules/chatbot/
    // chatbot.tools.ts) — intentionally `unknown` here, not re-typed:
    // this integration package has no opinion on what a caller's tool
    // parameters look like, only how to transport them.
    parameters: unknown;
  };
}

export interface NvidiaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface NvidiaToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    // JSON-encoded string per the OpenAI-compatible spec — the caller
    // (modules/chatbot) is responsible for JSON.parse-ing this itself,
    // guarded against malformed output from the model.
    arguments: string;
  };
}

export interface NvidiaChatCompletionChoice {
  message: {
    role: string;
    content: string | null;
    tool_calls?: NvidiaToolCall[];
  };
  finish_reason: string;
}

export interface NvidiaChatCompletionResponse {
  id: string;
  choices: NvidiaChatCompletionChoice[];
}

export interface NvidiaChatCompletionParams {
  messages: NvidiaChatMessage[];
  tools?: NvidiaToolDefinition[];
  // 'auto' (the default) lets the model choose to call a tool or reply in
  // plain text — deliberately NOT forcing 'required'/a named tool: NIM
  // model tool_choice support varies, and treating "the model answered in
  // plain text instead of calling a tool" as a graceful rejection
  // (modules/chatbot/chatbot.service.ts's askChatbot) is safer than
  // assuming a stricter tool_choice value is universally honored.
  toolChoice?: 'auto' | 'none';
}
